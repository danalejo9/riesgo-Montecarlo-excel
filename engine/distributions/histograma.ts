/**
 * Histograma (B5, la «general» por tramos): entre `minimo` y `maximo`, en
 * tramos iguales, cada uno con su peso; dentro de un tramo, todos los valores
 * igual de probables. Sirve para dibujar a mano una forma que no es ninguna
 * de las conocidas.
 */
import type { Distribution } from './types.ts';

export function histograma(minimo: number, maximo: number, pesos: readonly number[]): Distribution {
  if (!(Number.isFinite(minimo) && Number.isFinite(maximo) && minimo < maximo)) {
    throw new Error(`HISTOGRAMA: hace falta mínimo < máximo (mínimo=${minimo}, máximo=${maximo})`);
  }
  if (pesos.length === 0 || pesos.some((w) => !(w >= 0))) throw new Error('HISTOGRAMA: los pesos tienen que ser números no negativos');
  const total = pesos.reduce((s, w) => s + w, 0);
  if (!(total > 0)) throw new Error('HISTOGRAMA: algún peso tiene que ser mayor que 0');
  const k = pesos.length;
  const ancho = (maximo - minimo) / k;
  const acumulada = new Float64Array(k + 1);
  for (let i = 0; i < k; i++) acumulada[i + 1] = (acumulada[i] as number) + (pesos[i] as number) / total;
  let media = 0;
  let m2 = 0;
  for (let i = 0; i < k; i++) {
    const p = (pesos[i] as number) / total;
    const a = minimo + i * ancho;
    const b = a + ancho;
    media += (p * (a + b)) / 2;
    m2 += (p * (a * a + a * b + b * b)) / 3;
  }
  return {
    quantile: (u) => {
      let i = 0;
      while (i < k - 1 && (acumulada[i + 1] as number) < u) i++;
      const p = (acumulada[i + 1] as number) - (acumulada[i] as number);
      const dentro = p > 0 ? (u - (acumulada[i] as number)) / p : 0;
      return minimo + (i + Math.min(1, Math.max(0, dentro))) * ancho;
    },
    cdf: (x) => {
      if (x <= minimo) return 0;
      if (x >= maximo) return 1;
      const t = (x - minimo) / ancho;
      const i = Math.min(k - 1, Math.floor(t));
      return (acumulada[i] as number) + (t - i) * ((acumulada[i + 1] as number) - (acumulada[i] as number));
    },
    mean: () => media,
    variance: () => m2 - media * media,
  };
}
