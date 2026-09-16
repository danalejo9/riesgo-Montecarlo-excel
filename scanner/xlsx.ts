/**
 * Lectura directa del formato `.xlsx` sin pasar por Excel.
 *
 * Un `.xlsx` es un ZIP con XML dentro. Leerlo así tiene tres ventajas para el
 * escáner: no necesita Excel instalado, no necesita que el libro esté abierto y
 * no envía nada a ninguna parte (requisito R2). El precio es que hay que
 * conocer el formato; solo se leen las partes que interesan.
 *
 * El XML se recorre con expresiones regulares en lugar de un parser completo.
 * Es una decisión consciente: las partes que se leen tienen una estructura fija
 * y plana, y un parser XML genérico sobre un libro de 50.000 fórmulas cuesta
 * más de lo que aporta. Donde el formato admite variantes (fórmulas
 * compartidas, celdas sin `r`) se trata explícitamente.
 */

import { unzipSync } from 'fflate';

export interface CeldaFormula {
  hoja: string;
  /** Referencia A1 dentro de la hoja. */
  ref: string;
  formula: string;
  /** La fórmula viene de una fórmula compartida y aquí está expandida sin ajustar. */
  compartida: boolean;
  /** Fórmula de matriz (`t="array"`). */
  matricial: boolean;
}

export interface LibroLeido {
  hojas: string[];
  formulas: CeldaFormula[];
  /** Celdas con contenido, tengan fórmula o no. */
  celdasConContenido: number;
  nombresDefinidos: string[];
  tablas: number;
  tieneVba: boolean;
  tienePowerQuery: boolean;
  enlacesExternos: number;
  /** Partes del ZIP que no se supieron interpretar, para poder auditar el escáner. */
  avisos: string[];
}

const ENTIDADES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&apos;': "'",
};

function desescapar(xml: string): string {
  return xml.replace(/&(?:lt|gt|amp|quot|apos);/g, (e) => ENTIDADES[e] as string)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

export function leerLibro(datos: Uint8Array): LibroLeido {
  const zip = unzipSync(datos);
  const nombres = Object.keys(zip);
  const avisos: string[] = [];

  const texto = (ruta: string): string | null => {
    const entrada = zip[ruta];
    return entrada ? new TextDecoder('utf-8').decode(entrada) : null;
  };

  // --- Hojas y su orden, desde workbook.xml + sus relaciones ---
  const workbook = texto('xl/workbook.xml') ?? '';
  const rels = texto('xl/_rels/workbook.xml.rels') ?? '';

  const destinoPorId = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) destinoPorId.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }

  const hojas: string[] = [];
  const rutaPorHoja = new Map<string, string>();
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const nombre = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!nombre) continue;
    const nombreLimpio = desescapar(nombre);
    hojas.push(nombreLimpio);
    const destino = rid ? destinoPorId.get(rid) : undefined;
    if (destino) rutaPorHoja.set(nombreLimpio, `xl/${destino}`);
  }

  // Si las relaciones no cuadran, se recurre al orden de los archivos de hoja.
  const rutasHoja = nombres
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => numeroDeHoja(a) - numeroDeHoja(b));
  if (rutaPorHoja.size === 0 && hojas.length > 0) {
    avisos.push('No se pudieron resolver las relaciones de hojas; se usa el orden de los archivos.');
    hojas.forEach((h, idx) => {
      const r = rutasHoja[idx];
      if (r) rutaPorHoja.set(h, r);
    });
  }

  // --- Fórmulas ---
  const formulas: CeldaFormula[] = [];
  let celdasConContenido = 0;

  for (const hoja of hojas) {
    const ruta = rutaPorHoja.get(hoja);
    const xml = ruta ? texto(ruta) : null;
    if (xml === null) {
      avisos.push(`No se pudo leer la hoja "${hoja}".`);
      continue;
    }

    // Fórmulas compartidas: la primera celda del grupo trae el texto y las
    // demás solo el identificador `si`. Excel las reescribe desplazando las
    // referencias; aquí se reutiliza el texto del maestro, que basta para
    // contar funciones pero no para el grafo de dependencias.
    const maestras = new Map<string, string>();
    let filaActual = 0;
    let colAuto = 0;

    for (const m of xml.matchAll(/<row\b[^>]*>|<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const trozo = m[0];

      if (trozo.startsWith('<row')) {
        filaActual = Number(/r="(\d+)"/.exec(trozo)?.[1] ?? filaActual + 1);
        colAuto = 0;
        continue;
      }

      colAuto++;
      const ref = /\br="([A-Z]+\d+)"/.exec(trozo)?.[1] ?? `${indiceAColumna(colAuto)}${filaActual}`;
      celdasConContenido++;

      const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(trozo);
      if (!fm) continue;

      const atributos = fm[1] ?? '';
      const cuerpo = fm[2] ?? '';
      const si = /\bsi="(\d+)"/.exec(atributos)?.[1];
      const tipo = /\bt="(\w+)"/.exec(atributos)?.[1];

      let formula = desescapar(cuerpo).trim();
      let compartida = false;

      if (tipo === 'shared') {
        if (formula !== '' && si !== undefined) {
          maestras.set(si, formula);
        } else if (si !== undefined) {
          formula = maestras.get(si) ?? '';
          compartida = true;
        }
      }

      if (formula === '') continue;
      formulas.push({ hoja, ref, formula, compartida, matricial: tipo === 'array' });
    }
  }

  // --- Nombres definidos ---
  const nombresDefinidos: string[] = [];
  for (const m of workbook.matchAll(/<definedName\b[^>]*name="([^"]+)"[^>]*>/g)) {
    const n = m[1];
    if (n) nombresDefinidos.push(desescapar(n));
  }

  // --- Señales estructurales ---
  const tablas = nombres.filter((n) => /^xl\/tables\/table\d+\.xml$/.test(n)).length;
  const tieneVba = nombres.includes('xl/vbaProject.bin');
  const enlacesExternos = nombres.filter((n) =>
    /^xl\/externalLinks\/externalLink\d+\.xml$/.test(n),
  ).length;

  // Power Query guarda su modelo en un item de customXml llamado DataMashup.
  const tienePowerQuery =
    nombres.some((n) => /^customXml\/item\d*\.xml$/.test(n) &&
      (texto(n) ?? '').includes('DataMashup')) ||
    nombres.some((n) => /^xl\/queryTables\//.test(n)) ||
    nombres.includes('xl/connections.xml');

  return {
    hojas,
    formulas,
    celdasConContenido,
    nombresDefinidos,
    tablas,
    tieneVba,
    tienePowerQuery,
    enlacesExternos,
    avisos,
  };
}

function numeroDeHoja(ruta: string): number {
  return Number(/sheet(\d+)\.xml$/.exec(ruta)?.[1] ?? 0);
}

export function indiceAColumna(indice: number): string {
  let n = indice;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}
