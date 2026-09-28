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
import { contarCategorias } from './categorias.ts';
import type { ResultadoBloque } from './tipos.ts';

export type ResultadoCalculoBloque = { ok: true; parcial: ResultadoBloque } | { ok: false; error: ErrorPlan };

export function calcularBloque(
  grafo: Grafo,
  plan: Plan,
  entradasResueltas: readonly DefinicionEntrada[],
  seed: number,
  bloque: Bloque,
  compresionTDigest: number,
  limiteMuestra = 0,
): ResultadoCalculoBloque {
  const entradas = new Map<string, Buffer>();
  const categorias = new Map<string, readonly string[]>();
  for (const def of entradasResueltas) {
    entradas.set(def.clave, generarTramoDeEntrada(def, seed, bloque.inicio, bloque.largo));
    if (def.categorias) categorias.set(def.clave, def.categorias);
  }

  const r = ejecutarPlan(grafo, plan, entradas, bloque.largo, categorias);
  if (!r.ok) return { ok: false, error: r.error };

  const parcial: ResultadoBloque = new Map();
  for (const clave of plan.salidas) {
    const columna = r.valores.get(clave) as Columna;
    const buffer = aBufferNumerico(columna, bloque.largo);
    // Lo que cae por debajo de `limiteMuestra` se copia **antes** de apartar
    // los no numéricos: la muestra tiene que seguir alineada, iteración a
    // iteración, con las muestras de las entradas.
    const retener = Math.min(bloque.largo, limiteMuestra - bloque.inicio);
    const muestra = retener > 0 ? buffer.slice(0, retener) : undefined;
    const { utiles, noNumericas } = separarUtilizables(buffer);
    const recuento = contarCategorias(columna, bloque.largo, Math.max(0, retener));
    parcial.set(clave, {
      ...(recuento ? { categorias: recuento.conteos, ...(recuento.muestra ? { muestraTexto: recuento.muestra } : {}) } : {}),
      welford: acumular(crearWelford(), utiles),
      digest: tdigestDeBuffer(utiles, compresionTDigest),
      noNumericas,
      ...(muestra ? { muestra } : {}),
    });
  }
  return { ok: true, parcial };
}

/**
 * Aparta lo que no es un número utilizable antes de reducir a estadísticas.
 *
 * `aBufferNumerico` marca con `NaN` lo que no pudo convertir, y un solo `NaN`
 * deja la media, la desviación y todos los percentiles en `NaN`. Con una `TIR`
 * como salida eso pasa de verdad: un flujo que en alguna iteración no cambia
 * de signo no tiene tasa. La respuesta correcta no es propagar el `NaN` ni
 * fingir un cero, sino calcular con lo que sí vale y **decir cuántas no**.
 *
 * El caso normal —ninguna mala— no paga nada: se devuelve el mismo buffer sin
 * copiarlo.
 */
function separarUtilizables(buffer: Buffer): { utiles: Buffer; noNumericas: number } {
  let malas = 0;
  for (let i = 0; i < buffer.length; i++) if (!Number.isFinite(buffer[i] as number)) malas++;
  if (malas === 0) return { utiles: buffer, noNumericas: 0 };

  const utiles = new Float64Array(buffer.length - malas);
  let j = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] as number;
    if (Number.isFinite(v)) utiles[j++] = v;
  }
  return { utiles, noNumericas: malas };
}
