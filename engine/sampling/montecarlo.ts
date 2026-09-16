import type { Distribution } from '../distributions/types.ts';
import { nuevoBuffer, type Buffer } from '../functions/types.ts';
import { fillUniform, streamOf } from '../random/index.ts';

/**
 * Monte Carlo simple: un uniforme por iteración, transformado por la inversa
 * de la CDF de la distribución (Fase 2 §8). Es el método sin supuestos —
 * necesario para comparar contra @RISK o contra resultados previos, y el
 * único donde el error estadístico se puede estimar limpiamente.
 *
 * `id` identifica la variable de entrada y determina su flujo del PRNG
 * (`streamOf`): así, añadir o quitar una variable del modelo no cambia los
 * números que reciben las demás.
 */
export function muestrearMonteCarlo(dist: Distribution, id: string, seed: number, n: number): Buffer {
  return muestrearMonteCarloBloque(dist, id, seed, 0, n);
}

/**
 * Como `muestrearMonteCarlo`, pero solo para el tramo `[inicio, inicio+largo)`.
 *
 * Es lo que hace posible el ejecutor por bloques (`engine/executor/`):
 * gracias a que el PRNG es de contador (`fillUniform` acepta cualquier
 * `startIndex`), generar el tramo `[a,b)` de una variable Monte Carlo da
 * exactamente los mismos números que generarla completa y quedarse con ese
 * tramo — así que nunca hace falta materializar el buffer entero de `n`
 * muestras para calcular un bloque. LHS no tiene aún esta variante: su
 * estratificación necesita conocer `n` de antemano (ver `lhs.ts`).
 */
export function muestrearMonteCarloBloque(
  dist: Distribution,
  id: string,
  seed: number,
  inicio: number,
  largo: number,
): Buffer {
  const u = nuevoBuffer(largo);
  fillUniform(u, seed, streamOf(id), inicio);

  const out = nuevoBuffer(largo);
  for (let i = 0; i < largo; i++) out[i] = dist.quantile(u[i] as number);
  return out;
}
