import { lgamma } from './mathfn.ts';
import type { Distribution } from './types.ts';

/** Weibull con forma `k` y escala `lambda`. Inversa cerrada. */
export function weibull(forma: number, escala: number): Distribution {
  if (!(forma > 0 && escala > 0)) {
    throw new Error(`WEIBULL: forma y escala deben ser positivas (forma=${forma}, escala=${escala})`);
  }
  return {
    quantile: (u) => escala * (-Math.log(1 - u)) ** (1 / forma),
    cdf: (x) => (x < 0 ? 0 : 1 - Math.exp(-((x / escala) ** forma))),
    mean: () => escala * Math.exp(lgamma(1 + 1 / forma)),
    variance: () => {
      const g1 = Math.exp(lgamma(1 + 1 / forma));
      const g2 = Math.exp(lgamma(1 + 2 / forma));
      return escala * escala * (g2 - g1 * g1);
    },
  };
}
