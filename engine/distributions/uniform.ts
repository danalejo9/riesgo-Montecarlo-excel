import type { Distribution } from './types.ts';

export function uniform(min: number, max: number): Distribution {
  if (!(min < max)) throw new Error(`UNIFORM: se requiere min < max (min=${min}, max=${max})`);
  const rango = max - min;
  return {
    quantile: (u) => min + u * rango,
    cdf: (x) => (x < min ? 0 : x > max ? 1 : (x - min) / rango),
    mean: () => (min + max) / 2,
    variance: () => (rango * rango) / 12,
  };
}
