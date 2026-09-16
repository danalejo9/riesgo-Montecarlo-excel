import { invNormalCDF, normalCDF } from './mathfn.ts';
import type { Distribution } from './types.ts';

/**
 * Corrige el heredado (Fase 1 §4.3): `n` ensayos de Bernoulli es O(n) por
 * muestra. Aquí, inversión de la CDF por recurrencia cuando `n·p·(1−p)` es
 * manejable, y aproximación normal con corrección de continuidad cuando no
 * — O(1) en ambos casos, sin el coste lineal del heredado.
 */
export function binomial(n: number, p: number): Distribution {
  if (!(Number.isInteger(n) && n >= 0)) throw new Error(`BINOMIAL: n debe ser entero no negativo (recibido ${n})`);
  if (!(p >= 0 && p <= 1)) throw new Error(`BINOMIAL: p debe estar en [0,1] (recibido ${p})`);

  const media = n * p;
  const varianza = n * p * (1 - p);
  const usarInversion = varianza <= 400; // recurrencia acotada: unos pocos cientos de pasos como mucho

  function cdf(x: number): number {
    if (x < 0) return 0;
    if (x >= n) return 1;
    const k = Math.floor(x);
    if (p === 0) return 1;
    if (p === 1) return k >= n ? 1 : 0;

    // Recurrencia estable en log para no desbordar con n grande.
    let logPmf = n * Math.log(1 - p);
    let acumulado = Math.exp(logPmf);
    for (let i = 0; i < k; i++) {
      logPmf += Math.log((n - i) / (i + 1)) + Math.log(p / (1 - p));
      acumulado += Math.exp(logPmf);
    }
    return Math.min(1, acumulado);
  }

  function quantileInversion(u: number): number {
    if (p === 0) return 0;
    if (p === 1) return n;
    let logPmf = n * Math.log(1 - p);
    let acumulado = Math.exp(logPmf);
    let k = 0;
    while (acumulado < u && k < n) {
      k += 1;
      logPmf += Math.log((n - k + 1) / k) + Math.log(p / (1 - p));
      acumulado += Math.exp(logPmf);
    }
    return k;
  }

  function quantileNormal(u: number): number {
    const z = invNormalCDF(u);
    const x = Math.round(media + Math.sqrt(varianza) * z);
    return Math.min(n, Math.max(0, x));
  }

  return {
    quantile: (u) => (usarInversion ? quantileInversion(u) : quantileNormal(u)),
    cdf: (x) => (usarInversion ? cdf(x) : normalCDF((Math.floor(x) + 0.5 - media) / Math.sqrt(varianza))),
    mean: () => media,
    variance: () => varianza,
  };
}
