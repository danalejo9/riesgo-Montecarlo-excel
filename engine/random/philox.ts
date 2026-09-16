/**
 * Generador pseudoaleatorio basado en contador (Philox-2x32-10).
 *
 * Por qué no un PRNG secuencial (el heredado usaba Mulberry32): con un
 * generador secuencial, la muestra i depende de la i-1, así que repartir el
 * trabajo entre N workers obliga a inventar un esquema de saltos y el
 * resultado acaba dependiendo de cuántos núcleos tenga la máquina. Aquí cada
 * muestra se calcula como f(semilla, flujo, índice), sin estado: la misma
 * semilla produce exactamente los mismos números con 4 núcleos o con 16, y un
 * bloque [a, b) se puede calcular sin haber calculado los anteriores.
 *
 * Ver docs/FASE2_ARQUITECTURA.md §3.2.
 */

/** Multiplicador de Philox para 2x32 (Salmon et al., 2011). */
const PHILOX_M = 0xd256d193;

/** Constante de Weyl para el avance de la clave. */
const PHILOX_W = 0x9e3779b9;

/** Rondas. 10 es el valor estándar con margen de sobra sobre las 7 mínimas. */
const ROUNDS = 10;

/**
 * Multiplicación 32x32 -> 64 bits exacta, devuelta como dos palabras de 32.
 *
 * No se puede hacer con `a * b` porque el producto supera los 53 bits que un
 * double representa con exactitud, ni con `Math.imul`, que solo da los 32 bits
 * bajos. Se descompone en mitades de 16 bits, donde todos los productos
 * intermedios caben en un double sin pérdida.
 */
export function mulhilo32(a: number, b: number): { hi: number; lo: number } {
  const al = a & 0xffff;
  const ah = a >>> 16;
  const bl = b & 0xffff;
  const bh = b >>> 16;

  const t0 = al * bl;
  const t1 = ah * bl + (t0 >>> 16);
  const t2 = al * bh + (t1 & 0xffff);
  const hi = ah * bh + (t1 >>> 16) + (t2 >>> 16);
  const lo = (((t2 & 0xffff) << 16) | (t0 & 0xffff)) >>> 0;

  return { hi: hi >>> 0, lo };
}

/**
 * Núcleo de Philox: transforma el contador (c0, c1) con la clave `key` en dos
 * palabras de 32 bits de aspecto aleatorio.
 */
export function philox2x32(c0: number, c1: number, key: number): { a: number; b: number } {
  let x0 = c0 >>> 0;
  let x1 = c1 >>> 0;
  let k = key >>> 0;

  for (let r = 0; r < ROUNDS; r++) {
    const { hi, lo } = mulhilo32(PHILOX_M, x0);
    x0 = (hi ^ k ^ x1) >>> 0;
    x1 = lo;
    k = (k + PHILOX_W) >>> 0;
  }

  return { a: x0, b: x1 };
}

/**
 * Un uniforme en [0, 1) con los 53 bits de mantisa de un double.
 *
 * @param seed   semilla de la simulación
 * @param stream identificador del flujo (una variable de entrada, por ejemplo)
 * @param index  número de iteración
 */
export function uniformAt(seed: number, stream: number, index: number): number {
  const { a, b } = philox2x32(index, stream, seed);
  // 26 bits de una palabra + 27 de la otra = 53, el máximo exacto de un double.
  return ((a >>> 6) * 134217728 + (b >>> 5)) / 9007199254740992;
}

/**
 * Como `uniformAt`, pero en (0, 1): excluye el cero.
 *
 * Necesario para las transformadas que aplican `log` o dividen por la muestra
 * (lognormal, exponencial, Weibull), donde un cero produce -Infinity.
 */
export function uniformOpenAt(seed: number, stream: number, index: number): number {
  const u = uniformAt(seed, stream, index);
  // 2^-53, el menor positivo representable en esta rejilla.
  return u === 0 ? 1.1102230246251565e-16 : u;
}

/**
 * Rellena `out` con uniformes consecutivos a partir de `startIndex`.
 *
 * Es la vía que usa el ejecutor por bloques: llenar out[0..n) con los índices
 * [startIndex, startIndex+n) da exactamente el mismo resultado que generar la
 * secuencia completa y quedarse con ese tramo, sea cual sea el troceado.
 */
export function fillUniform(
  out: Float64Array,
  seed: number,
  stream: number,
  startIndex: number,
): void {
  for (let i = 0; i < out.length; i++) {
    out[i] = uniformAt(seed, stream, startIndex + i);
  }
}

/**
 * Deriva un identificador de flujo estable a partir de una cadena (FNV-1a).
 *
 * Permite que cada variable de entrada tenga su propio flujo ligado a su `id`,
 * de modo que añadir o quitar variables no altera los números que reciben las
 * demás: sin esto, insertar una entrada nueva cambiaría los resultados de toda
 * la simulación aunque el modelo no se hubiera tocado.
 */
export function streamOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
