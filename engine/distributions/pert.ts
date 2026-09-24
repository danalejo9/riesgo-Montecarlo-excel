import { betaEscalada } from './beta.ts';
import type { Distribution } from './types.ts';

/**
 * PERT real: Beta(α, β) reescalada a `[min, max]`, con
 * `α = 1 + λ(moda−min)/(max−min)`, `β = 1 + λ(max−moda)/(max−min)`.
 *
 * Corrige el error de la Fase 1 (§4.3): el heredado devolvía
 * `(triangular + media + moda) / 3`, una mezcla sin forma Beta que reduce la
 * varianza a ~1/9 de la triangular y sesga los resultados hacia la moda. La
 * fórmula de abajo es la PERT clásica (λ=4); `lambda` queda configurable para
 * la variante "PERT modificada" que pide Fase 2 §8.
 */
export function pert(min: number, moda: number, max: number, lambda = 4): Distribution {
  if (!(min <= moda && moda <= max)) {
    throw new Error(`PERT: se requiere min <= moda <= max (min=${min}, moda=${moda}, max=${max})`);
  }
  if (min === max) throw new Error(`PERT: min y max no pueden ser iguales (${min})`);
  if (!(lambda > 0)) throw new Error(`PERT: lambda debe ser positivo (recibido ${lambda})`);

  const rango = max - min;
  const alpha = 1 + (lambda * (moda - min)) / rango;
  const betaParam = 1 + (lambda * (max - moda)) / rango;

  return betaEscalada(alpha, betaParam, min, max);
}
