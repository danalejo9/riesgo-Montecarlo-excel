import {
  invLowerIncompleteGammaRegularized,
  lowerIncompleteGammaRegularized,
} from './mathfn.ts';
import type { Distribution } from './types.ts';

/** Gamma con forma `k` y escala `theta` (media = k·theta). */
export function gamma(forma: number, escala: number): Distribution {
  if (!(forma > 0 && escala > 0)) {
    throw new Error(`GAMMA: forma y escala deben ser positivas (forma=${forma}, escala=${escala})`);
  }
  return {
    quantile: (u) => escala * invLowerIncompleteGammaRegularized(forma, u),
    cdf: (x) => (x <= 0 ? 0 : lowerIncompleteGammaRegularized(forma, x / escala)),
    mean: () => forma * escala,
    variance: () => forma * escala * escala,
  };
}

/** Exponencial: caso particular de Gamma con forma 1, pero con inversa cerrada. */
export function exponential(lambda: number): Distribution {
  if (!(lambda > 0)) throw new Error(`EXPONENTIAL: lambda debe ser positivo (recibido ${lambda})`);
  return {
    quantile: (u) => -Math.log(1 - u) / lambda,
    cdf: (x) => (x < 0 ? 0 : 1 - Math.exp(-lambda * x)),
    mean: () => 1 / lambda,
    variance: () => 1 / (lambda * lambda),
  };
}
