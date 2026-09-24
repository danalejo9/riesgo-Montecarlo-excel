/**
 * **¿Bastan las iteraciones?** La pregunta que un analista hace antes de
 * firmar un número, y que casi ninguna herramienta contesta sin que se la
 * hagan.
 *
 * Dos respuestas, las dos con la teoría de muestreo de siempre y sin simular
 * nada más:
 *
 * - **La media**: su error típico es σ/√n. El margen al 95 % es 1,96 veces
 *   eso. Y como baja con √n, se sabe cuántas iteraciones harían falta para un
 *   margen dado: n' = (1,96·σ / margen)².
 * - **Un percentil**: el intervalo de confianza de un cuantil sale de la
 *   binomial (cuántos valores caen por debajo), sin suponer ninguna forma para
 *   la distribución. Sobre la muestra ordenada es leer dos posiciones.
 *
 * El veredicto usa un **1 % de la media** como listón (o de la desviación, si
 * la media está cerca de cero y un porcentaje de ella no significa nada). Es
 * un criterio corriente, no una ley: el número se enseña al lado para que
 * cada cual aplique el suyo.
 */

const Z95 = 1.959963984540054;

export interface IntervaloPercentil {
  p: number;
  inferior: number;
  superior: number;
}

export interface Precision {
  /** Margen de la media al 95 %: media ± esto. */
  margenMedia: number;
  /** Ese margen respecto a la escala de referencia (la media, o σ si la media ≈ 0). */
  margenRelativo: number;
  /** Iteraciones que harían falta para bajar el margen relativo al objetivo. */
  iteracionesParaObjetivo: number;
  /** El objetivo usado (fracción), por defecto 0,01. */
  objetivo: number;
  suficiente: boolean;
  /** Intervalos al 95 % de p5 y p95, si hay muestra. */
  percentiles: IntervaloPercentil[];
}

/** Intervalo al 95 % del percentil `p` sobre una muestra ordenada (binomial, aproximación normal). */
export function intervaloPercentil(ordenada: Float64Array, p: number): IntervaloPercentil | null {
  const n = ordenada.length;
  if (n < 20) return null;
  const centro = p * n;
  const ancho = Z95 * Math.sqrt(n * p * (1 - p));
  const lo = Math.max(0, Math.floor(centro - ancho));
  const hi = Math.min(n - 1, Math.ceil(centro + ancho));
  return { p, inferior: ordenada[lo] as number, superior: ordenada[hi] as number };
}

export function precisionDeSimulacion(
  n: number,
  media: number,
  desviacion: number,
  ordenada?: Float64Array,
  objetivo = 0.01,
): Precision | null {
  if (!(n > 1) || !Number.isFinite(desviacion)) return null;
  const margenMedia = (Z95 * desviacion) / Math.sqrt(n);
  // Con la media cerca de cero, "un 1 % de la media" es un listón imposible:
  // se mide contra la dispersión, que siempre tiene escala.
  const escala = Math.abs(media) > desviacion * 0.1 ? Math.abs(media) : desviacion;
  if (!(escala > 0)) {
    // Salida constante: no hay nada que estimar, cualquier n basta.
    return { margenMedia: 0, margenRelativo: 0, iteracionesParaObjetivo: n, objetivo, suficiente: true, percentiles: [] };
  }
  const margenRelativo = margenMedia / escala;
  const iteracionesParaObjetivo = Math.ceil(((Z95 * desviacion) / (objetivo * escala)) ** 2);
  const percentiles = ordenada
    ? [0.05, 0.95].map((p) => intervaloPercentil(ordenada, p)).filter((x): x is IntervaloPercentil => x !== null)
    : [];
  return {
    margenMedia,
    margenRelativo,
    iteracionesParaObjetivo,
    objetivo,
    suficiente: margenRelativo <= objetivo,
    percentiles,
  };
}

/**
 * Cuántas iteraciones pedir en la siguiente tanda de "simular hasta alcanzar
 * la precisión", o `null` si ya no hace falta otra (todas las salidas cumplen,
 * o ya se llegó al tope).
 *
 * Se pide un 10 % más de lo que dice la fórmula —la desviación de la próxima
 * tanda no será exactamente la de esta— redondeado a dos cifras, y al menos
 * vez y media lo actual, para no gastar una tanda en un paso ridículo.
 */
export function siguienteTanda(actual: number, necesarias: readonly number[], maximo: number): number | null {
  const falta = Math.max(0, ...necesarias.filter(Number.isFinite));
  if (falta <= actual || actual >= maximo) return null;
  const objetivo = Math.max(falta * 1.1, actual * 1.5);
  const cifras = 10 ** Math.max(0, Math.floor(Math.log10(objetivo)) - 1);
  return Math.min(maximo, Math.ceil(objetivo / cifras) * cifras);
}
