import type { Distribution } from './types.ts';

export function bernoulli(p: number): Distribution {
  if (!(p >= 0 && p <= 1)) throw new Error(`BERNOULLI: p debe estar en [0,1] (recibido ${p})`);
  return {
    quantile: (u) => (u < 1 - p ? 0 : 1),
    cdf: (x) => (x < 0 ? 0 : x < 1 ? 1 - p : 1),
    mean: () => p,
    variance: () => p * (1 - p),
  };
}
