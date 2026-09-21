/**
 * Calcula el resultado parcial de un único bloque: genera el tramo de cada
 * entrada, ejecuta el plan compilado sobre ese tramo, y reduce cada salida a
 * sus estadísticas (Welford + t-digest) — nunca retiene el buffer completo
 * del bloque más de lo necesario para reducirlo. Es la unidad de trabajo que
 * reparte el ejecutor por bloques (`simular.ts`), y también lo que ejecutaría
 * cada Web Worker de un pool real: es una función pura, sin más estado que
 * sus argumentos, así que no importa en qué hilo corra.
 */
import type { ErrorPlan, Plan } from '../compiler/plan.ts';
import { ejecutarPlan } from '../compiler/executor.ts';
import { aBufferNumerico, type Buffer } from '../values/buffer.ts';
import type { Columna } from '../values/columna.ts';
import type { Grafo } from '../graph/graph.ts';
import { tdigestDeBuffer } from '../stats/tdigest.ts';
import { acumular, crearWelford } from '../stats/welford.ts';
import type { Bloque } from './bloques.ts';
import { generarTramoDeEntrada, type DefinicionEntrada } from './entradas.ts';
import type { ResultadoBloque } from './tipos.ts';

export type ResultadoCalculoBloque = { ok: true; parcial: ResultadoBloque } | { ok: false; error: ErrorPlan };

export function calcularBloque(
  grafo: Grafo,
  plan: Plan,
  entradasResueltas: readonly DefinicionEntrada[],
  seed: number,
  bloque: Bloque,
  compresionTDigest: number,
): ResultadoCalculoBloque {
  const entradas = new Map<string, Buffer>();
  for (const def of entradasResueltas) {
    entradas.set(def.clave, generarTramoDeEntrada(def, seed, bloque.inicio, bloque.largo));
  }

  const r = ejecutarPlan(grafo, plan, entradas, bloque.largo);
  if (!r.ok) return { ok: false, error: r.error };

  const parcial: ResultadoBloque = new Map();
  for (const clave of plan.salidas) {
    // Una salida tiene que ser numérica para poder reducirse a estadísticas;
    // ver el hueco documentado en `aBufferNumerico`.
    const buffer = aBufferNumerico(r.valores.get(clave) as Columna, bloque.largo);
    parcial.set(clave, {
      welford: acumular(crearWelford(), buffer),
      digest: tdigestDeBuffer(buffer, compresionTDigest),
    });
  }
  return { ok: true, parcial };
}
