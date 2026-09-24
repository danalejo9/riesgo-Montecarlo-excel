/**
 * Atajos para leer una `Columna` en los tests.
 *
 * El evaluador devuelve columnas (que pueden llevar texto, vacío o error) y la
 * mayoría de los tests solo quieren comparar números, así que estos dos
 * ayudantes hacen la conversión con las mismas reglas que usa el ejecutor
 * real. Para comprobar el tipo o el código de error concretos, los tests usan
 * directamente los accesores de `engine/values/columna.ts`.
 */

import { aBufferNumerico } from '../../engine/values/buffer.ts';
import { largoDe, type Columna } from '../../engine/values/columna.ts';

/** Todos los valores de la columna, como números. */
export function nums(c: Columna | undefined): number[] {
  if (!c) throw new Error('columna ausente');
  return Array.from(aBufferNumerico(c, largoDe(c)));
}

/** El valor de la primera iteración, como número. */
export function num(c: Columna | undefined): number {
  return nums(c)[0] as number;
}
