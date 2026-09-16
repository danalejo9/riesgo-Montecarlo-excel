import type { Distribution } from '../distributions/types.ts';
import { nuevoBuffer, type Buffer } from '../functions/types.ts';
import { uniformAt, streamOf } from '../random/index.ts';

/**
 * Latin Hypercube Sampling: estratifica `[0,1)` en `n` tramos iguales y saca
 * exactamente una muestra de cada uno, con el orden de los tramos barajado al
 * azar. Fase 2 §8: misma precisión que Monte Carlo con del orden de 1/10 de
 * las iteraciones en modelos suaves, porque elimina el amontonamiento y los
 * huecos que el muestreo puro deja por azar.
 *
 * Dos flujos del PRNG **distintos** por variable, derivados del mismo `id`
 * con sufijos distintos:
 *   - uno para la permutación de los tramos (Fisher–Yates),
 *   - otro para el punto exacto dentro de cada tramo ("jitter").
 * Si compartieran flujo, la posición dentro del tramo quedaría correlacionada
 * con qué tramo tocó, sesgando sutilmente la muestra. Al ser flujos
 * independientes de `id`, además, las variables del modelo no se
 * correlacionan entre sí por construcción — cada una se estratifica con su
 * propia baraja.
 */
export function muestrearLHS(dist: Distribution, id: string, seed: number, n: number): Buffer {
  if (n <= 0) return nuevoBuffer(0);

  const streamPermutacion = streamOf(`${id}#lhs-perm`);
  const streamJitter = streamOf(`${id}#lhs-jitter`);

  const tramos = barajar(n, seed, streamPermutacion);

  const out = nuevoBuffer(n);
  for (let i = 0; i < n; i++) {
    const jitter = uniformAt(seed, streamJitter, i);
    const u = ((tramos[i] as number) + jitter) / n;
    out[i] = dist.quantile(u);
  }
  return out;
}

/**
 * Permutación de `[0, n)` por Fisher–Yates, alimentada por el PRNG de
 * contador. Es un uso puntual y secuencial (no por bloques): la estratificación
 * necesita conocer las `n` posiciones a la vez para barajarlas, a diferencia
 * del muestreo en sí, que sigue siendo O(1) por iteración.
 */
function barajar(n: number, seed: number, stream: number): Uint32Array {
  const tramos = new Uint32Array(n);
  for (let i = 0; i < n; i++) tramos[i] = i;

  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(uniformAt(seed, stream, n - 1 - i) * (i + 1));
    const tmp = tramos[i] as number;
    tramos[i] = tramos[j] as number;
    tramos[j] = tmp;
  }
  return tramos;
}
