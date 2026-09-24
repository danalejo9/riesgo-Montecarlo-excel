import { invRegularizedIncompleteBeta, lgamma, regularizedIncompleteBeta } from './mathfn.ts';
import type { Distribution } from './types.ts';

/** Beta estándar en (0,1), con parámetros de forma `alpha, beta > 0`. */
export function beta(alpha: number, betaParam: number): Distribution {
  if (!(alpha > 0 && betaParam > 0)) {
    throw new Error(`BETA: alpha y beta deben ser positivos (alpha=${alpha}, beta=${betaParam})`);
  }
  return {
    quantile: (u) => invRegularizedIncompleteBeta(alpha, betaParam, u),
    cdf: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : regularizedIncompleteBeta(alpha, betaParam, x)),
    mean: () => alpha / (alpha + betaParam),
    variance: () =>
      (alpha * betaParam) / ((alpha + betaParam) * (alpha + betaParam) * (alpha + betaParam + 1)),
  };
}

/** Beta reescalada a un rango arbitrario `[min, max]` (la base de PERT). */
export function betaEscalada(alpha: number, betaParam: number, min: number, max: number): Distribution {
  if (!(min < max)) throw new Error(`BETA: se requiere min < max (min=${min}, max=${max})`);
  const base = beta(alpha, betaParam);
  const rango = max - min;
  return {
    quantile: (u) => min + rango * base.quantile(u),
    cdf: (x) => base.cdf((x - min) / rango),
    mean: () => min + rango * base.mean(),
    variance: () => rango * rango * base.variance(),
  };
}

/** Densidad Beta estándar, usada por PERT para exponer la moda si hace falta. */
export function betaLogPdf(alpha: number, betaParam: number, x: number): number {
  return (
    (alpha - 1) * Math.log(x) +
    (betaParam - 1) * Math.log(1 - x) -
    (lgamma(alpha) + lgamma(betaParam) - lgamma(alpha + betaParam))
  );
}
