/**
 * Análisis de estrés (D2): cómo queda la salida cuando una entrada se queda
 * en una parte de su rango (su 10 % más alto, por ejemplo), sin volver a
 * simular: se miran solo las iteraciones retenidas en que la entrada cayó
 * ahí. Con 10.000 iteraciones, el 10 % son 1.000: sobra para la media y los
 * percentiles centrales. Sin Office.js.
 */

import type { IteracionesSimuladas } from './iteraciones.ts';

export type CondicionEstres =
  /** Entre dos percentiles de la entrada (0..1). */
  | { tipo: 'percentiles'; desde: number; hasta: number }
  /** Una categoría de una entrada de texto (su índice). */
  | { tipo: 'categoria'; indice: number };

export interface ResumenEstres {
  n: number;
  media: number;
  p5: number;
  p50: number;
  p95: number;
  /** P(umbral), si se pidió. */
  probUmbral?: number;
}

/** Tramos que se ofrecen para una entrada numérica. */
export const TRAMOS_ESTRES: readonly { etiqueta: string; desde: number; hasta: number }[] = [
  { etiqueta: 'su 10 % más bajo', desde: 0, hasta: 0.1 },
  { etiqueta: 'su 25 % más bajo', desde: 0, hasta: 0.25 },
  { etiqueta: 'en torno a su mediana (p40–p60)', desde: 0.4, hasta: 0.6 },
  { etiqueta: 'su 25 % más alto', desde: 0.75, hasta: 1 },
  { etiqueta: 'su 10 % más alto', desde: 0.9, hasta: 1 },
];

const cuantil = (o: Float64Array, p: number) => {
  if (o.length === 0) return NaN;
  const h = (o.length - 1) * p;
  const i = Math.floor(h);
  return (o[i] as number) + (h - i) * ((o[Math.min(o.length - 1, i + 1)] as number) - (o[i] as number));
};

function resumir(valores: number[], umbral?: { valor: number; sentido: 'below' | 'above' }): ResumenEstres | null {
  const o = Float64Array.from(valores.filter(Number.isFinite)).sort();
  if (o.length === 0) return null;
  let s = 0;
  for (const v of o) s += v;
  let prob: number | undefined;
  if (umbral) {
    let c = 0;
    for (const v of o) if (umbral.sentido === 'below' ? v < umbral.valor : v > umbral.valor) c++;
    prob = c / o.length;
  }
  return { n: o.length, media: s / o.length, p5: cuantil(o, 0.05), p50: cuantil(o, 0.5), p95: cuantil(o, 0.95), ...(prob !== undefined ? { probUmbral: prob } : {}) };
}

/** La salida con la entrada en esa condición, y la de referencia (todas las iteraciones). */
export function estres(
  it: IteracionesSimuladas,
  idEntrada: string,
  idSalida: string,
  condicion: CondicionEstres,
  umbral?: { valor: number; sentido: 'below' | 'above' },
): { base: ResumenEstres; estres: ResumenEstres; limites?: { desde: number; hasta: number } } | null {
  const entrada = it.entradas.find((e) => e.id === idEntrada);
  const salida = it.salidas.find((s) => s.id === idSalida);
  if (!entrada || !salida) return null;
  const n = Math.min(it.n, entrada.valores.length, salida.valores.length);
  const todas: number[] = [];
  for (let i = 0; i < n; i++) todas.push(salida.valores[i] as number);
  const base = resumir(todas, umbral);
  if (!base) return null;

  let dentro: (x: number) => boolean;
  let limites: { desde: number; hasta: number } | undefined;
  if (condicion.tipo === 'categoria') {
    dentro = (x) => Math.round(x) === condicion.indice;
  } else {
    const o = Float64Array.from(Array.from({ length: n }, (_, i) => entrada.valores[i] as number).filter(Number.isFinite)).sort();
    const desde = condicion.desde <= 0 ? -Infinity : cuantil(o, condicion.desde);
    const hasta = condicion.hasta >= 1 ? Infinity : cuantil(o, condicion.hasta);
    limites = { desde: condicion.desde <= 0 ? (o[0] as number) : desde, hasta: condicion.hasta >= 1 ? (o[o.length - 1] as number) : hasta };
    dentro = (x) => x >= desde && x <= hasta;
  }
  const elegidas: number[] = [];
  for (let i = 0; i < n; i++) if (dentro(entrada.valores[i] as number)) elegidas.push(salida.valores[i] as number);
  const r = resumir(elegidas, umbral);
  return r ? { base, estres: r, ...(limites ? { limites } : {}) } : null;
}
