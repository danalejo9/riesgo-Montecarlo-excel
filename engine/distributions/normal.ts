import { invNormalCDF, normalCDF } from './mathfn.ts';
import type { Distribution } from './types.ts';

export function normal(media: number, desviacion: number): Distribution {
  if (!(desviacion > 0)) {
    throw new Error(`NORMAL: la desviación debe ser positiva (recibida ${desviacion})`);
  }
  return {
    quantile: (u) => media + desviacion * invNormalCDF(u),
    cdf: (x) => normalCDF((x - media) / desviacion),
    mean: () => media,
    variance: () => desviacion * desviacion,
  };
}
