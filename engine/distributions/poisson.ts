import { invNormalCDF, normalCDF } from './mathfn.ts';
import type { Distribution } from './types.ts';

/**
 * Corrige el heredado (Fase 1 §4.3): el algoritmo de Knuth es O(λ) por
 * muestra y `exp(-λ)` desborda a 0 para λ > ~745, lo que puede colgar el
 * bucle. Aquí, inversión por recurrencia para λ moderado (acotada, nunca se
 * acerca a ese desbordamiento) y aproximación normal con corrección de
 * continuidad para λ grande — O(1) en ambos casos.
 */
export function poisson(lambda: number): Distribution {
  if (!(lambda > 0)) throw new Error(`POISSON: lambda debe ser positivo (recibido ${lambda})`);

  const usarInversion = lambda <= 400; // media + ~10 sigma cabe cómodo en una recurrencia acotada

  function cdf(x: number): number {
    if (x < 0) return 0;
    const k = Math.floor(x);
    let logPmf = -lambda;
    let acumulado = Math.exp(logPmf);
    for (let i = 0; i < k; i++) {
      logPmf += Math.log(lambda / (i + 1));
      acumulado += Math.exp(logPmf);
    }
    return Math.min(1, acumulado);
  }

  function quantileInversion(u: number): number {
    let logPmf = -lambda;
    let acumulado = Math.exp(logPmf);
    let k = 0;
    // Cota de seguridad generosa: nunca debería alcanzarse con lambda <= 400.
    const limite = lambda + 50 * Math.sqrt(lambda) + 100;
    while (acumulado < u && k < limite) {
      k += 1;
      logPmf += Math.log(lambda / k);
      acumulado += Math.exp(logPmf);
    }
    return k;
  }

  function quantileNormal(u: number): number {
    const z = invNormalCDF(u);
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
  }

  return {
    quantile: (u) => (usarInversion ? quantileInversion(u) : quantileNormal(u)),
    cdf: (x) => (usarInversion ? cdf(x) : normalCDF((Math.floor(x) + 0.5 - lambda) / Math.sqrt(lambda))),
    mean: () => lambda,
    variance: () => lambda,
  };
}
