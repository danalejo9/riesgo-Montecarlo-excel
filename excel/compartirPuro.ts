/**
 * «Preparar para compartir»: la parte pura (qué celdas se convierten y cómo
 * cambia el modelo). Sin Office.js. Ver `compartir.ts` para la escritura.
 *
 * El problema, detectado en la revisión con el estudio de mercado: una celda
 * con `=RIESGO.NORMAL(…)` abierta en un Excel **sin el complemento** acaba en
 * `#¿NOMBRE?` al recalcular, y con ella todo lo que depende de ella. Hoy quien
 * recibe un libro con el modelo en el panel ve un Excel normal; las funciones
 * `RIESGO.*` romperían esa ventaja.
 *
 * La solución: antes de enviar el libro, cada `RIESGO.*` se convierte en una
 * **entrada del panel** (el modelo, que viaja en `workbook.settings` y que un
 * Excel sin el complemento simplemente ignora) y la celda recibe su **valor
 * base**, la media. Quien abre el libro sin el complemento ve números; quien
 * lo abre con él, sigue teniendo las mismas entradas inciertas. Las fórmulas
 * originales se guardan para poder volver a ellas («Restaurar»).
 */

import { construirGrafo, type FormulaCelda } from '../engine/graph/index.ts';
import {
  analizarRiesgoEnGrafo,
  contieneFuncionResultado,
  generarId,
  type DistributionSpec,
  type ModeloRiesgo,
} from '../engine/modelo/index.ts';
import { claveCelda, letrasDeColumna } from '../engine/parser/ast.ts';
import { componerDireccion } from './direcciones.ts';
import { formulaSinSalida, leerDeclaraciones, sustituirDeclaraciones } from './declaracionesEnGrafo.ts';
import type { ValorEstatico } from './tiposLectura.ts';
import { aValorCelda } from './valoresEstaticos.ts';

export interface ConversionCompartir {
  /** Dirección para Office.js y para el modelo: `Pruebas!C5`, `'Mi hoja'!C5`. */
  direccion: string;
  clave: string;
  formula: string;
  /** Lo que se escribe en la celda: la media, o el valor más probable si es de texto. */
  valorBase: number | string;
  spec: DistributionSpec;
}

/** Una celda que se fija en su valor actual (y se puede restaurar), sin entrada en el panel. */
export interface CongelacionCompartir {
  direccion: string;
  clave: string;
  formula: string;
  /**
   * En vez del valor, esta fórmula: la de una celda con `RIESGO.SALIDA`, sin
   * la llamada (vale 0), sigue calculando en un Excel sin el complemento.
   */
  formulaNueva?: string;
}

export interface PlanCompartir {
  conversiones: ConversionCompartir[];
  /**
   * Celdas con RIESGO que no se pueden convertir en una entrada —una función
   * dentro de una operación, con parámetros de otras celdas aleatorias (B7), o
   * una función de resultados como `RIESGO.MEDIA` (B6)— y que, para no dar
   * `#¿NOMBRE?` sin el complemento, se quedan con su valor actual.
   */
  congelar: CongelacionCompartir[];
  /** Celdas con `RIESGO.*` que no se pueden convertir, con el motivo: no se tocan. */
  noConvertibles: string[];
  /** Las salidas declaradas con `RIESGO.SALIDA`: pasan al panel. */
  salidas: { direccion: string; nombre?: string }[];
  /** Las correlaciones de `RIESGO.CORRELACION`: pasan al panel, entre las entradas de esas celdas. */
  correlaciones: { direccionA: string; direccionB: string; coeficiente: number }[];
}

export function planificarCompartir(
  formulas: readonly FormulaCelda[],
  valores: readonly ValorEstatico[] = [],
  /** Las celdas de las entradas del panel: una RIESGO que dependa de ellas no es fija. */
  clavesEntradaPanel: readonly string[] = [],
): PlanCompartir {
  const plan: PlanCompartir = { conversiones: [], congelar: [], noConvertibles: [], salidas: [], correlaciones: [] };
  const { grafo } = construirGrafo([...formulas], valores.map(aValorCelda));
  // RIESGO.SALIDA y RIESGO.CORRELACION: lo que declaran pasa al panel.
  const declaraciones = leerDeclaraciones(grafo);
  sustituirDeclaraciones(grafo, declaraciones.celdas);
  const legible = (clave: string) => {
    const nodo = grafo.nodos.get(clave);
    return nodo ? componerDireccion(nodo.hoja, `${letrasDeColumna(nodo.col)}${nodo.fila}`) : clave;
  };
  plan.salidas = declaraciones.salidas.map((s) => ({ direccion: s.direccion, ...(s.nombre ? { nombre: s.nombre } : {}) }));
  plan.correlaciones = declaraciones.correlaciones.map((c) => ({ direccionA: legible(c.claveA), direccionB: legible(c.claveB), coeficiente: c.coeficiente }));
  plan.noConvertibles.push(...declaraciones.errores);
  const r = analizarRiesgoEnGrafo(grafo, { clavesEntradaPanel, clavesSalida: [], todas: true });
  const porClave = new Map(formulas.map((f) => [claveCelda(f.hoja, f.col, f.fila), f] as const));
  const texto = (f: FormulaCelda) => (f.formula.startsWith('=') ? f.formula : `=${f.formula}`);
  const direccion = (f: FormulaCelda) => componerDireccion(f.hoja, `${letrasDeColumna(f.col)}${f.fila}`);

  for (const c of r.conversiones) {
    const f = porClave.get(c.clave);
    if (!f) continue;
    plan.conversiones.push({ direccion: direccion(f), clave: c.clave, formula: texto(f), valorBase: c.media, spec: c.spec });
  }
  const tocadas = new Set([...r.conversiones.map((c) => c.clave), ...r.duplicadas]);
  for (const clave of r.reescritas) {
    const f = porClave.get(clave);
    if (!f) continue;
    tocadas.add(clave);
    plan.congelar.push({ direccion: direccion(f), clave, formula: texto(f) });
  }
  plan.noConvertibles.push(...r.errores);
  for (const e of r.errores) tocadas.add(e.slice(0, e.indexOf(': ')));
  for (const clave of declaraciones.celdas) {
    const f = porClave.get(clave);
    if (!f || tocadas.has(clave)) continue;
    tocadas.add(clave);
    const sin = formulaSinSalida(texto(f));
    plan.congelar.push({ direccion: direccion(f), clave, formula: texto(f), ...(sin !== texto(f) && !/RIESGO\.|RISK\./i.test(sin) ? { formulaNueva: sin } : {}) });
  }
  for (const [clave, nodo] of grafo.nodos) {
    if (tocadas.has(clave) || !nodo.ast || !contieneFuncionResultado(nodo.ast)) continue;
    const f = porClave.get(clave);
    if (f) plan.congelar.push({ direccion: direccion(f), clave, formula: texto(f) });
  }
  return plan;
}

/** Prefijo de los ids de las entradas creadas al preparar: así se reconocen al restaurar. */
export const PREFIJO_COMPARTIR = 'rc_';

/**
 * El modelo con las `RIESGO.*` convertidas en entradas del panel. Si una celda
 * ya era entrada del panel, se deja la del panel (manda el panel, como al
 * simular).
 */
export function modeloParaCompartir(
  modelo: ModeloRiesgo,
  plan: PlanCompartir,
  /** Nombre legible por dirección (E5); sin él, la entrada se llama como su celda. */
  nombres?: ReadonlyMap<string, string>,
): ModeloRiesgo {
  const yaEstan = new Set(modelo.inputs.map((e) => e.ref.replace(/'/g, '').toUpperCase()));
  const nuevas = plan.conversiones
    .filter((c) => !yaEstan.has(c.direccion.replace(/'/g, '').toUpperCase()))
    .map((c) => ({
      id: `${PREFIJO_COMPARTIR}${generarId('in').slice(3)}`,
      name: nombres?.get(c.direccion) ?? c.clave,
      ref: c.direccion,
      dist: c.spec,
      correlations: [],
    }));
  const inputs = [...modelo.inputs, ...nuevas];
  const norm = (d: string) => d.replace(/'/g, '').toUpperCase();
  // Las correlaciones de RIESGO.CORRELACION, entre las entradas de esas celdas.
  const idPorRef = new Map(inputs.map((e) => [norm(e.ref), e.id] as const));
  const extra = new Map<string, { with: string; coefficient: number }[]>();
  for (const c of plan.correlaciones) {
    const a = idPorRef.get(norm(c.direccionA));
    const b = idPorRef.get(norm(c.direccionB));
    if (!a || !b) continue;
    extra.set(a, [...(extra.get(a) ?? []), { with: b, coefficient: c.coeficiente }]);
  }
  const par = (x: string, y: string) => [x, y].sort().join('\u0000');
  const nuevosPares = new Set([...extra].flatMap(([a, ls]) => ls.map((l) => par(a, l.with))));
  const salidasYa = new Set(modelo.outputs.map((s) => norm(s.ref)));
  return {
    ...modelo,
    inputs: inputs.map((e) => ({
      ...e,
      correlations: [...e.correlations.filter((k) => !nuevosPares.has(par(e.id, k.with))), ...(extra.get(e.id) ?? [])],
    })),
    outputs: [
      ...modelo.outputs,
      ...plan.salidas
        .filter((s) => !salidasYa.has(norm(s.direccion)))
        .map((s) => ({ id: `${PREFIJO_COMPARTIR}${generarId('out').slice(4)}`, name: s.nombre ?? nombres?.get(s.direccion) ?? s.direccion, ref: s.direccion })),
    ],
  };
}

/** El modelo sin las entradas que creó «Preparar para compartir» (al restaurar las fórmulas). */
export function modeloRestaurado(modelo: ModeloRiesgo, direcciones: readonly string[]): ModeloRiesgo {
  const quitar = new Set(direcciones.map((d) => d.replace(/'/g, '').toUpperCase()));
  const ids = new Set(
    modelo.inputs.filter((e) => e.id.startsWith(PREFIJO_COMPARTIR) && quitar.has(e.ref.replace(/'/g, '').toUpperCase())).map((e) => e.id),
  );
  return {
    ...modelo,
    inputs: modelo.inputs
      .filter((e) => !ids.has(e.id))
      .map((e) => ({ ...e, correlations: e.correlations.filter((c) => !ids.has(c.with)) })),
    // Las salidas que venían de RIESGO.SALIDA: la función vuelve a declararlas.
    outputs: modelo.outputs.filter((s) => !(s.id.startsWith(PREFIJO_COMPARTIR) && quitar.has(s.ref.replace(/'/g, '').toUpperCase()))),
  };
}
