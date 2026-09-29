/**
 * Marcar la celda seleccionada como entrada o como salida. Lo usan el panel
 * (botones «Añadir la selección…») y la cinta (B3, sin abrir el panel).
 */

import { describirDistribucion, generarId, type DistributionSpec, type EntradaRiskModel, type ModeloRiesgo, type SalidaRiskModel } from '../engine/modelo/index.ts';
import { leerNombresSugeridos } from '../excel/etiquetasEnExcel.ts';
import { nombreUnico } from '../excel/nombreSugerido.ts';
import { leerSeleccion, type SeleccionLeida } from '../excel/seleccion.ts';

const DISTRIBUCION_GENERICA: DistributionSpec = describirDistribucion('triangular')?.porDefecto ?? {
  type: 'triangular',
  min: 0,
  mode: 1,
  max: 2,
};

/**
 * La distribución que se propone al marcar una celda: una triangular de ±10 %
 * **alrededor del valor que ya tiene**.
 *
 * No es una estimación de nada —el usuario tiene que ajustarla— pero es un
 * punto de partida con el orden de magnitud correcto. Proponer (0; 1; 2) sobre
 * una celda que vale 1.200 obliga a borrar tres campos antes de poder pensar,
 * y con diez entradas eso es treinta campos.
 *
 * Con un cero o con una celda que no sea un número no hay magnitud de la que
 * partir, así que se deja la genérica en vez de inventar una.
 */
export function distribucionInicial(valor: number | undefined, texto?: unknown): DistributionSpec {
  // Una celda con texto («Norte») es una entrada de texto (T1): se empieza con
  // esa categoría y el usuario añade las demás o las lee de la hoja.
  if (typeof texto === 'string' && texto.trim() !== '') {
    return { type: 'categorical', categories: [texto.trim()], weights: [1] };
  }
  if (valor === undefined || !Number.isFinite(valor) || valor === 0) return DISTRIBUCION_GENERICA;
  const margen = Math.abs(valor) * 0.1;
  return { type: 'triangular', min: limpiar(valor - margen), mode: valor, max: limpiar(valor + margen) };
}

/**
 * Quita la basura binaria de una multiplicación: `0,1 × 1,1` da
 * `0,11000000000000001` en coma flotante, y ese número aparecería tal cual en
 * el campo y en el resumen de la entrada. No cambia nada del cálculo; cambia
 * que el panel no parezca roto nada más marcar una celda.
 */
function limpiar(v: number): number {
  return Number(v.toPrecision(12));
}


export type ResultadoMarcar =
  | { ok: true; modelo: ModeloRiesgo; id: string }
  | { ok: false; aviso: string };

/** La celda seleccionada, o por qué no vale. */
export async function celdaSeleccionada(): Promise<SeleccionLeida | string> {
  const sel = await leerSeleccion();
  if (sel.filas * sel.columnas !== 1) return `Has seleccionado ${sel.filas} × ${sel.columnas} celdas. Selecciona una sola.`;
  return sel;
}

/**
 * El nombre con el que nace una celda marcada: el texto de su izquierda
 * («Precio unitario»), no «Modelo!C5» (E5). Si Excel no lo puede leer, la
 * referencia: un nombre feo no puede impedir marcar la celda.
 */
export async function nombreLegible(modelo: ModeloRiesgo, ref: string): Promise<string> {
  const usados = [...modelo.inputs, ...modelo.outputs].map((x) => x.name);
  try {
    const nombre = (await leerNombresSugeridos([ref])).get(ref) ?? ref;
    return nombreUnico(nombre, ref, usados);
  } catch {
    return ref;
  }
}

/** Añade la celda seleccionada al modelo como entrada o como salida. */
export async function marcarSeleccion(modelo: ModeloRiesgo, como: 'entrada' | 'salida'): Promise<ResultadoMarcar> {
  const sel = await celdaSeleccionada();
  if (typeof sel === 'string') return { ok: false, aviso: sel };
  const ref = sel.direccion;
  if (modelo.inputs.some((e) => e.ref === ref) || modelo.outputs.some((s) => s.ref === ref)) {
    return { ok: false, aviso: `${ref} ya está en el modelo.` };
  }
  const name = await nombreLegible(modelo, ref);
  if (como === 'salida') {
    const salida: SalidaRiskModel = { id: generarId('out'), name, ref };
    return { ok: true, modelo: { ...modelo, outputs: [...modelo.outputs, salida] }, id: salida.id };
  }
  const entrada: EntradaRiskModel = {
    id: generarId('in'),
    name,
    ref,
    dist: distribucionInicial(sel.valor, sel.valores?.[0]?.[0]),
    correlations: [],
  };
  return { ok: true, modelo: { ...modelo, inputs: [...modelo.inputs, entrada] }, id: entrada.id };
}
