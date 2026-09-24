/**
 * El buffer numérico crudo: N valores contiguos, uno por iteración.
 *
 * Es el tipo de las **fronteras** del motor, donde todo es necesariamente
 * numérico: las entradas (muestras de una distribución) y las salidas (lo que
 * se reduce a estadísticas). Dentro de la evaluación, en cambio, una celda es
 * una `Columna`, que además de números puede llevar texto, vacío o error.
 *
 * Vivía en `engine/functions/types.ts` cuando el motor solo sabía de números;
 * está aquí para que `engine/sampling/` no tenga que importar del módulo de
 * funciones de Excel, con el que no tiene nada que ver.
 */

import { coercionNumerica } from './coercion.ts';
import { comoVectorNumerico, type Columna } from './columna.ts';

/** Un valor por iteración de simulación, para una única celda. */
export type Buffer = Float64Array;

export function nuevoBuffer(n: number): Buffer {
  return new Float64Array(n);
}

/**
 * Convierte una columna de salida al buffer numérico que consumen las
 * estadísticas.
 *
 * Una salida de simulación tiene que ser un número: no se puede calcular la
 * media de un texto. Lo que no lo sea se convierte con las reglas de Excel
 * (vacío→0, lógico→1/0, texto numérico→su número) y lo que siga sin serlo
 * —un texto de verdad, un error— se marca como `NaN`.
 *
 * **Hueco conocido**: ese `NaN` se propaga a Welford y al t-digest, así que
 * una salida que falle en algunas iteraciones deja las estadísticas en `NaN`
 * sin decir por qué. Lo correcto es contar esas iteraciones y enseñárselas al
 * usuario ("3.412 de 1.000.000 dieron #¡DIV/0!"), pero eso es trabajo del
 * informe de resultados (E6) y exige tocar el formato que viaja entre
 * workers. Documentado también en el handoff para que no se pierda.
 */
export function aBufferNumerico(c: Columna, n: number): Buffer {
  const rapido = comoVectorNumerico(c);
  if (rapido) return rapido;

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = coercionNumerica(c, i);
    out[i] = typeof v === 'string' ? NaN : v;
  }
  return out;
}
