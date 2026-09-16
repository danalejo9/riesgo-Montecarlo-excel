import type { Distribution } from './types.ts';

/**
 * Empírica continua definida por puntos de control de la CDF: `min` en 0,
 * `max` en 1, y pares `(x_i, p_i)` intermedios estrictamente crecientes en
 * ambas coordenadas. La CDF es lineal a trozos entre puntos consecutivos —
 * el mismo formato que usa @RISK (`RiskCumul`) para este propósito, elegido
 * por ser inequívoco: a diferencia de remuestrear datos crudos, no hay que
 * decidir posiciones de trazado (D9 no aplica aquí, es una construcción, no
 * un ajuste).
 */
export function empirical(
  min: number,
  puntos: ReadonlyArray<readonly [x: number, p: number]>,
  max: number,
): Distribution {
  if (!(min < max)) throw new Error(`EMPIRICAL: se requiere min < max (min=${min}, max=${max})`);

  const xs = [min, ...puntos.map(([x]) => x), max];
  const ps = [0, ...puntos.map(([, p]) => p), 1];

  for (let i = 1; i < xs.length; i++) {
    if (!((xs[i] as number) > (xs[i - 1] as number))) {
      throw new Error('EMPIRICAL: los valores x deben ser estrictamente crecientes, incluidos min y max');
    }
    if (!((ps[i] as number) > (ps[i - 1] as number))) {
      throw new Error('EMPIRICAL: las probabilidades acumuladas deben ser estrictamente crecientes, en (0,1)');
    }
  }

  function quantile(u: number): number {
    let i = 1;
    while (i < ps.length - 1 && u > (ps[i] as number)) i++;
    const x0 = xs[i - 1] as number;
    const x1 = xs[i] as number;
    const p0 = ps[i - 1] as number;
    const p1 = ps[i] as number;
    return x0 + ((u - p0) * (x1 - x0)) / (p1 - p0);
  }

  function cdf(x: number): number {
    if (x <= min) return 0;
    if (x >= max) return 1;
    let i = 1;
    while (i < xs.length - 1 && x > (xs[i] as number)) i++;
    const x0 = xs[i - 1] as number;
    const x1 = xs[i] as number;
    const p0 = ps[i - 1] as number;
    const p1 = ps[i] as number;
    return p0 + ((x - x0) * (p1 - p0)) / (x1 - x0);
  }

  // Media y varianza por integración numérica de la CDF lineal a trozos:
  // en cada tramo la densidad es constante, así que la variable es uniforme
  // local y sus momentos tienen forma cerrada.
  let media = 0;
  let segundoMomento = 0;
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1] as number;
    const x1 = xs[i] as number;
    const peso = (ps[i] as number) - (ps[i - 1] as number);
    // Momentos de una uniforme(x0, x1), ponderados por la masa del tramo.
    media += peso * ((x0 + x1) / 2);
    segundoMomento += peso * ((x0 * x0 + x0 * x1 + x1 * x1) / 3);
  }
  const varianza = segundoMomento - media * media;

  return { quantile, cdf, mean: () => media, variance: () => varianza };
}
