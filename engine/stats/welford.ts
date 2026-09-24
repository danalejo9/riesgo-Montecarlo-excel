/**
 * Media y varianza en una pasada (Welford), con combinación de estados
 * parciales (Chan, Golub y LeVeque, 1979).
 *
 * Por qué hace falta la combinación y no basta con acumular: el ejecutor de
 * Fase 2 §3.1 calcula por bloques, y con D11 (cientos de salidas, millones
 * de iteraciones) puede repartir esos bloques entre Web Workers. Cada
 * bloque/worker produce un estado parcial con `acumular`, y el hilo
 * principal los junta con `combinar` — sin tener que volver a recorrer ni un
 * solo valor ni guardar el buffer completo en memoria.
 *
 * Se guarda `m2` (suma de las desviaciones al cuadrado respecto a la media
 * acumulada), no la varianza directamente: es lo único que se puede
 * recombinar exactamente entre dos estados parciales sin error de
 * redondeo acumulado por sumar varianzas ya divididas.
 */
export interface EstadoWelford {
  n: number;
  media: number;
  m2: number;
  min: number;
  max: number;
}

export function crearWelford(): EstadoWelford {
  return { n: 0, media: 0, m2: 0, min: Infinity, max: -Infinity };
}

/** Incorpora todos los valores de `buffer` al estado, en una sola pasada. */
export function acumular(estado: EstadoWelford, buffer: Float64Array): EstadoWelford {
  let { n, media, m2, min, max } = estado;
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i] as number;
    n += 1;
    const delta = x - media;
    media += delta / n;
    m2 += delta * (x - media);
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { n, media, m2, min, max };
}

/** Combina dos estados parciales (de dos bloques, o dos workers) en uno solo. */
export function combinar(a: EstadoWelford, b: EstadoWelford): EstadoWelford {
  if (a.n === 0) return b;
  if (b.n === 0) return a;

  const n = a.n + b.n;
  const delta = b.media - a.media;
  const media = a.media + (delta * b.n) / n;
  const m2 = a.m2 + b.m2 + (delta * delta * a.n * b.n) / n;

  return { n, media, m2, min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

/** Varianza muestral (denominador n-1); `NaN` con menos de dos valores, como `VAR.S` de Excel. */
export function varianzaMuestral(estado: EstadoWelford): number {
  return estado.n > 1 ? estado.m2 / (estado.n - 1) : NaN;
}

/** Varianza poblacional (denominador n); `NaN` sin valores. */
export function varianzaPoblacional(estado: EstadoWelford): number {
  return estado.n > 0 ? estado.m2 / estado.n : NaN;
}
