import { invNormalCDF, normalCDF } from './mathfn.ts';
import type { Distribution } from './types.ts';

/**
 * Corrige la ambigüedad del heredado (Fase 1 §4.3): la UI pedía "media y
 * desviación" pero el código los trataba como `mu`/`sigma` del logaritmo, así
 * que introducir media=1000 daba `exp(1000)` = Infinity. Aquí la
 * parametrización es un parámetro explícito, no una suposición implícita.
 */
export type ParametrizacionLognormal = 'variable' | 'logaritmo';

export function lognormal(
  p1: number,
  p2: number,
  parametrizacion: ParametrizacionLognormal = 'variable',
): Distribution {
  if (!(p2 > 0)) throw new Error(`LOGNORMAL: el segundo parámetro debe ser positivo (recibido ${p2})`);

  let mu: number;
  let sigma: number;
  if (parametrizacion === 'logaritmo') {
    mu = p1;
    sigma = p2;
  } else {
    // Media y varianza de la variable -> mu y sigma del logaritmo.
    if (!(p1 > 0)) throw new Error(`LOGNORMAL: la media de la variable debe ser positiva (recibida ${p1})`);
    const media = p1;
    const varianza = p2 * p2;
    sigma = Math.sqrt(Math.log(1 + varianza / (media * media)));
    mu = Math.log(media) - (sigma * sigma) / 2;
  }

  return {
    quantile: (u) => Math.exp(mu + sigma * invNormalCDF(u)),
    cdf: (x) => (x <= 0 ? 0 : normalCDF((Math.log(x) - mu) / sigma)),
    mean: () => Math.exp(mu + (sigma * sigma) / 2),
    variance: () => (Math.exp(sigma * sigma) - 1) * Math.exp(2 * mu + sigma * sigma),
  };
}
