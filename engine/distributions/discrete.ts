import type { Distribution } from './types.ts';

/** Distribución discreta arbitraria: valores con su probabilidad asociada. */
export function discrete(valores: readonly number[], pesos: readonly number[]): Distribution {
  if (valores.length === 0 || valores.length !== pesos.length) {
    throw new Error('DISCRETE: valores y pesos deben tener la misma longitud, y no estar vacíos');
  }
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  if (!(sumaPesos > 0)) throw new Error('DISCRETE: la suma de los pesos debe ser positiva');
  if (pesos.some((w) => w < 0)) throw new Error('DISCRETE: los pesos no pueden ser negativos');

  // Se ordena por valor para que la CDF sea monótona y la búsqueda binaria válida.
  const pares = valores.map((v, i) => [v, (pesos[i] as number) / sumaPesos] as const);
  pares.sort((a, b) => a[0] - b[0]);

  const acumuladas = new Float64Array(pares.length);
  let acc = 0;
  for (let i = 0; i < pares.length; i++) {
    acc += pares[i]![1];
    acumuladas[i] = acc;
  }

  const media = pares.reduce((a, [v, w]) => a + v * w, 0);
  const varianza = pares.reduce((a, [v, w]) => a + w * (v - media) * (v - media), 0);

  return {
    quantile: (u) => {
      for (let i = 0; i < acumuladas.length; i++) {
        if (u <= (acumuladas[i] as number)) return pares[i]![0];
      }
      return pares[pares.length - 1]![0];
    },
    cdf: (x) => {
      let resultado = 0;
      for (const [v, w] of pares) if (v <= x) resultado += w;
      return resultado;
    },
    mean: () => media,
    variance: () => varianza,
  };
}
