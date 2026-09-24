import type { Distribution } from './types.ts';

/**
 * Corrige el heredado (Fase 1 §4.3): sin validar `min <= moda <= max`, el
 * código heredado podía dividir por cero (`max === min`) o sacar raíz de un
 * negativo (`NaN`) si la moda caía fuera del rango. Aquí se valida al
 * construir la distribución, no en cada muestra.
 */
export function triangular(min: number, moda: number, max: number): Distribution {
  if (!(min <= moda && moda <= max)) {
    throw new Error(`TRIANGULAR: se requiere min <= moda <= max (min=${min}, moda=${moda}, max=${max})`);
  }
  if (min === max) {
    throw new Error(`TRIANGULAR: min y max no pueden ser iguales (${min})`);
  }

  const rango = max - min;
  const fc = rango === 0 ? 0 : (moda - min) / rango; // punto de quiebre de la CDF

  return {
    quantile: (u) => {
      if (u <= fc) return min + Math.sqrt(u * rango * (moda - min));
      return max - Math.sqrt((1 - u) * rango * (max - moda));
    },
    cdf: (x) => {
      if (x <= min) return 0;
      if (x >= max) return 1;
      if (x <= moda) return ((x - min) * (x - min)) / (rango * (moda - min));
      return 1 - ((max - x) * (max - x)) / (rango * (max - moda));
    },
    mean: () => (min + moda + max) / 3,
    variance: () =>
      (min * min + moda * moda + max * max - min * moda - min * max - moda * max) / 18,
  };
}
