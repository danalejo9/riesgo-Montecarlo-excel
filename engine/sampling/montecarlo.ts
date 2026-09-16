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
  const u = nuevoBuffer(n);
  fillUniform(u, seed, streamOf(id), 0);

  const out = nuevoBuffer(n);
  for (let i = 0; i < n; i++) out[i] = dist.quantile(u[i] as number);
  return out;
}
