/**
 * Lector del libro de fidelidad (Fase 2 §11.3): un `.xlsx` real, ya abierto y
 * recalculado por Excel, con una fila por caso de prueba. Lee directamente el
 * ZIP+XML —igual que `scanner/xlsx.ts`, pero aquí interesa además el valor
 * **cacheado** (`<v>`) que Excel dejó grabado en cada fórmula, no solo su
 * texto— porque ese valor es la referencia contra la que se compara el
 * motor. Vive en `tests/`, no en `engine/` ni en `scanner/`: no hace falta en
 * producción, solo para esta batería de pruebas.
 */
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

export interface CasoFidelidad {
  id: string;
  categoria: string;
  descripcion: string;
  /** Fórmula tal como la escribió Excel (en-US, sin el `=` inicial). */
  formula: string;
  /** Lo que Excel calculó para esa fórmula, ya interpretado por tipo. */
  valorEsperado: ValorCelda;
  /**
   * Si la celda traía de verdad un valor cacheado.
   *
   * Un libro recién generado tiene las fórmulas escritas pero ningún valor:
   * Excel todavía no lo ha abierto. Sin esta bandera esos casos se leerían
   * como el número 0 —porque `Number('')` es 0, no `NaN`— y los que de verdad
   * valen 0 pasarían por accidente, dando por verificado un libro que nadie
   * ha calculado.
   */
  calculado: boolean;
  notas: string;
}

export type ValorCelda =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'texto'; valor: string }
  | { tipo: 'booleano'; valor: boolean }
  | { tipo: 'error'; codigo: string };

const ENTIDADES: Record<string, string> = {
  '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'",
};

function desescapar(xml: string): string {
  return xml.replace(/&(?:lt|gt|amp|quot|apos);/g, (e) => ENTIDADES[e] as string)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

interface CeldaCruda {
  tipo?: string;
  formula?: string;
  valorCrudo?: string;
  /** Índice (desde 1) en los metadatos de valor: los errores nuevos van ahí. */
  metadatoValor?: number;
}

function leerCeldasDeHoja(xml: string): Map<string, CeldaCruda> {
  const celdas = new Map<string, CeldaCruda>();
  let filaActual = 0;
  let colAuto = 0;

  for (const m of xml.matchAll(/<row\b[^>]*>|<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const trozo = m[0];
    if (trozo.startsWith('<row')) {
      filaActual = Number(/\br="(\d+)"/.exec(trozo)?.[1] ?? filaActual + 1);
      colAuto = 0;
      continue;
    }
    colAuto++;

    const aperturaC = /^<c\b([^>]*?)(?:\/>|>)/.exec(trozo);
    const atributosC = aperturaC?.[1] ?? '';
    const ref = /\br="([A-Z]+\d+)"/.exec(atributosC)?.[1] ?? `?${colAuto}:${filaActual}`;
    const tipo = /\bt="(\w+)"/.exec(atributosC)?.[1];

    const fm = /<f\b[^>]*?(?:\/>|>([\s\S]*?)<\/f>)/.exec(trozo);
    const formula = fm ? desescapar(fm[1] ?? '').trim() : undefined;

    // `<v>` puede llevar atributos: cuando el texto empieza o acaba en
    // espacio, Excel escribe `<v xml:space="preserve">`. La primera versión de
    // este lector solo reconocía `<v>` a secas, y un `UNIRCADENAS` cuyo
    // resultado acababa en espacio salía como texto vacío: un fallo del
    // lector que parecía un fallo del motor (caso T4-024).
    const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(trozo);
    // Una celda de texto en línea (`t="inlineStr"`) guarda su contenido en
    // `<is><t>` y no tiene `<v>`. Excel siempre escribe cadenas compartidas,
    // pero un generador puede escribirlas en línea: el libro recién generado,
    // antes de pasar por Excel, viene así.
    const im = /<is>[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(trozo);
    const valorCrudo = vm ? desescapar(vm[1] ?? '') : im ? desescapar(im[1] ?? '') : undefined;

    const vmAttr = /\bvm="(\d+)"/.exec(atributosC)?.[1];
    celdas.set(ref, { tipo, formula, valorCrudo, metadatoValor: vmAttr ? Number(vmAttr) : undefined });
  }
  return celdas;
}

function interpretarValor(celda: CeldaCruda, sharedStrings: string[]): ValorCelda {
  const crudo = celda.valorCrudo ?? '';
  switch (celda.tipo) {
    case 'e':
      return { tipo: 'error', codigo: crudo };
    case 'b':
      return { tipo: 'booleano', valor: crudo === '1' };
    case 'str':
    case 'inlineStr':
      return { tipo: 'texto', valor: crudo };
    case 's':
      return { tipo: 'texto', valor: sharedStrings[Number(crudo)] ?? '' };
    default:
      return { tipo: 'numero', valor: Number(crudo) };
  }
}

function textoPlano(celda: CeldaCruda | undefined, sharedStrings: string[]): string {
  if (!celda) return '';
  const v = interpretarValor(celda, sharedStrings);
  return v.tipo === 'texto' ? v.valor : v.tipo === 'numero' ? String(v.valor) : '';
}

/**
 * Los errores que Excel guarda como «valor enriquecido» (`#CALC!`,
 * `#SPILL!`…). En la celda escribe `#VALUE!` para los lectores antiguos y
 * marca `vm="n"`; el error real está en `xl/richData`, con un número de tipo.
 * Sin esto, T8-012 (FILTRAR sin resultados) parecía esperar `#VALUE!` cuando
 * Excel dio `#CALC!`, lo mismo que el motor.
 */
const ERROR_ENRIQUECIDO: Record<number, string> = { 8: '#SPILL!', 11: '#BLOCKED!', 12: '#CONNECT!', 13: '#CALC!' };

function leerErroresEnriquecidos(texto: (p: string) => string | undefined): Map<number, string> {
  const out = new Map<number, string>();
  const metadata = texto('xl/metadata.xml');
  const valores = texto('xl/richData/rdrichvalue.xml');
  const estructuras = texto('xl/richData/rdrichvaluestructure.xml');
  if (!metadata || !valores || !estructuras) return out;

  const tipoEstructura = [...estructuras.matchAll(/<s\b[^>]*\bt="([^"]+)"/g)].map((m) => m[1]);
  const ricos = [...valores.matchAll(/<rv\b[^>]*\bs="(\d+)"[^>]*>([\s\S]*?)<\/rv>/g)].map((m) => ({
    estructura: tipoEstructura[Number(m[1])],
    valores: [...(m[2] as string).matchAll(/<v\b[^>]*>([\s\S]*?)<\/v>/g)].map((v) => v[1] as string),
  }));
  const futuro = /<futureMetadata\b[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/.exec(metadata)?.[1] ?? '';
  const indiceRico = [...futuro.matchAll(/<bk>([\s\S]*?)<\/bk>/g)].map((m) => Number(/<xlrd:rvb\s+i="(\d+)"/.exec(m[1] as string)?.[1]));
  const valorMeta = /<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/.exec(metadata)?.[1] ?? '';
  [...valorMeta.matchAll(/<bk>([\s\S]*?)<\/bk>/g)].forEach((m, i) => {
    const v = Number(/<rc\b[^>]*\bv="(\d+)"/.exec(m[1] as string)?.[1]);
    const rico = ricos[indiceRico[v] ?? -1];
    const codigo = rico?.estructura === '_error' ? ERROR_ENRIQUECIDO[Number(rico.valores[0])] : undefined;
    if (codigo) out.set(i + 1, codigo);
  });
  return out;
}

/** Lee todas las cadenas de `xl/sharedStrings.xml`, en el orden que indexan los `t="s"`. */
function leerSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const bloque = m[1] as string;
    const texto = [...bloque.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => desescapar(t[1] as string)).join('');
    out.push(texto);
  }
  return out;
}

/**
 * Lee los casos de la hoja "Fidelidad" de `ruta`.
 *
 * Formato esperado, una fila por caso desde la fila 2: A=id, B=categoria,
 * C=descripcion, D=formula_texto (informativo, no se usa), E=la fórmula real
 * con su valor cacheado, F=notas.
 */
export function leerCasosFidelidad(ruta: string): CasoFidelidad[] {
  const datos = readFileSync(ruta);
  const zip = unzipSync(new Uint8Array(datos));
  const texto = (p: string): string | undefined => {
    const entrada = zip[p];
    return entrada ? new TextDecoder('utf-8').decode(entrada) : undefined;
  };

  const workbook = texto('xl/workbook.xml') ?? '';
  const rels = texto('xl/_rels/workbook.xml.rels') ?? '';
  const destinoPorId = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) destinoPorId.set(id, target.replace(/^\/?xl\//, ''));
  }

  let rutaHoja: string | undefined;
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const nombre = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (nombre === 'Fidelidad' && rid) rutaHoja = `xl/${destinoPorId.get(rid)}`;
  }
  if (!rutaHoja) throw new Error(`No se encontró la hoja "Fidelidad" en ${ruta}`);

  const xmlHoja = texto(rutaHoja);
  if (!xmlHoja) throw new Error(`No se pudo leer ${rutaHoja}`);

  const sharedStrings = leerSharedStrings(texto('xl/sharedStrings.xml'));
  const celdas = leerCeldasDeHoja(xmlHoja);
  const enriquecidos = leerErroresEnriquecidos(texto);
  for (const c of celdas.values()) {
    const codigo = c.tipo === 'e' && c.metadatoValor ? enriquecidos.get(c.metadatoValor) : undefined;
    if (codigo) c.valorCrudo = codigo;
  }

  const filas = new Set<number>();
  for (const ref of celdas.keys()) {
    const fila = Number(/\d+$/.exec(ref)?.[0]);
    if (fila >= 2) filas.add(fila);
  }

  const casos: CasoFidelidad[] = [];
  for (const fila of [...filas].sort((a, b) => a - b)) {
    const a = celdas.get(`A${fila}`);
    if (!a?.valorCrudo) continue; // fila sin id: no es un caso

    const e = celdas.get(`E${fila}`);
    if (!e?.formula) throw new Error(`Fila ${fila}: la columna E no tiene fórmula`);

    casos.push({
      id: textoPlano(a, sharedStrings),
      categoria: textoPlano(celdas.get(`B${fila}`), sharedStrings),
      descripcion: textoPlano(celdas.get(`C${fila}`), sharedStrings),
      formula: e.formula,
      valorEsperado: interpretarValor(e, sharedStrings),
      calculado: e.valorCrudo !== undefined,
      notas: textoPlano(celdas.get(`F${fila}`), sharedStrings),
    });
  }
  return casos;
}
