/**
 * Lo que se puede leer de la muestra retenida de una salida **ordenándola una
 * vez**: el histograma y la probabilidad de quedar por encima o por debajo de
 * un umbral.
 *
 * Los dos salen de las mismas primeras iteraciones que retienen los motores
 * para la sensibilidad (`LIMITE_MUESTRA_SENSIBILIDAD`). Con menos iteraciones
 * que ese límite son **exactos** sobre la simulación entera; con más, son una
 * estimación sobre cien mil iteraciones, cuyo error en una probabilidad no
 * pasa de ±0,3 puntos (el peor caso, p = 50 %, a 95 % de confianza). Se dice
 * en el panel, no se esconde.
 *
 * Todo lo caro (ordenar, contar) ocurre aquí, una vez por simulación. Lo que
 * queda para la interfaz —cambiar el umbral— es una búsqueda binaria.
 */

import type { BinHistograma } from './resumen.ts';

/** Los valores numéricos de la muestra, ordenados de menor a mayor. */
export function ordenarUtiles(muestra: ArrayLike<number>): Float64Array {
  let cuenta = 0;
  for (let i = 0; i < muestra.length; i++) if (Number.isFinite(muestra[i] as number)) cuenta++;
  const out = new Float64Array(cuenta);
  let j = 0;
  for (let i = 0; i < muestra.length; i++) {
    const v = muestra[i] as number;
    if (Number.isFinite(v)) out[j++] = v;
  }
  return out.sort();
}

/** Cuántos valores de `ordenada` son menores o iguales que `u`. */
function cuantosHasta(ordenada: Float64Array, u: number): number {
  let lo = 0;
  let hi = ordenada.length;
  while (lo < hi) {
    const medio = (lo + hi) >> 1;
    if ((ordenada[medio] as number) <= u) lo = medio + 1;
    else hi = medio;
  }
  return lo;
}

/**
 * P(salida < u) o P(salida > u), sobre los valores numéricos.
 *
 * Estricto en los dos sentidos: "el VAN sea negativo" es `< 0`, y un VAN de
 * exactamente cero no es una pérdida. Con salidas continuas la diferencia es
 * nula; con salidas discretas (un número de unidades, un escenario) no, y
 * elegir el estricto es lo que la gente quiere decir con "por debajo de".
 */
export function probabilidadUmbral(ordenada: Float64Array, u: number, sentido: 'debajo' | 'encima'): number {
  const n = ordenada.length;
  if (n === 0 || !Number.isFinite(u)) return NaN;
  if (sentido === 'encima') return (n - cuantosHasta(ordenada, u)) / n;
  // Menores estrictos: los que son ≤ u menos los que son = u.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const medio = (lo + hi) >> 1;
    if ((ordenada[medio] as number) < u) lo = medio + 1;
    else hi = medio;
  }
  return lo / n;
}

/**
 * Histograma de barras iguales sobre `[mín, máx]` de la muestra ordenada.
 *
 * El número de barras sigue la regla de Freedman–Diaconis (ancho = 2·RIC/∛n),
 * que se adapta a la dispersión real y aguanta colas largas mejor que la raíz
 * de n, recortado a entre 10 y 50 para que quepa en un panel estrecho. Si
 * todos los valores son iguales, una sola barra: una salida que no varía no
 * tiene forma que enseñar.
 */
export function histogramaDeMuestra(ordenada: Float64Array, barrasMax = 50): BinHistograma[] {
  const n = ordenada.length;
  if (n === 0) return [];
  const min = ordenada[0] as number;
  const max = ordenada[n - 1] as number;
  if (!(max > min)) return [{ x0: min, x1: max, count: n }];

  const q = (p: number) => ordenada[Math.min(n - 1, Math.floor(p * (n - 1)))] as number;
  const ric = q(0.75) - q(0.25);
  const anchoFD = ric > 0 ? (2 * ric) / Math.cbrt(n) : 0;
  const barrasFD = anchoFD > 0 ? Math.ceil((max - min) / anchoFD) : 10;
  const barras = Math.max(10, Math.min(barrasMax, barrasFD));

  const ancho = (max - min) / barras;
  const conteos = new Array<number>(barras).fill(0);
  for (let i = 0; i < n; i++) {
    let b = Math.floor(((ordenada[i] as number) - min) / ancho);
    if (b >= barras) b = barras - 1; // el máximo cae en la última barra
    conteos[b]!++;
  }
  return conteos.map((count, i) => ({ x0: min + i * ancho, x1: min + (i + 1) * ancho, count }));
}
