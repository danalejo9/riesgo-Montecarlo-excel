/**
 * La interfaz entre el compilador y el registro de funciones.
 *
 * Un `Argumento` es lo que el evaluador le pasa a una función de Excel. Lleva
 * una lista de columnas —una si es una celda o una expresión, varias si es un
 * rango como `A1:A9`— y, **crucialmente**, si vino de un rango o no.
 *
 * Esa bandera no es un detalle de implementación: cambia el resultado. Excel
 * trata el mismo valor de forma distinta según cómo llegue:
 *
 * ```
 * SUMA(VERDADERO)   -> 1     (argumento directo: el lógico cuenta)
 * SUMA(A1:A2)       -> 0     (con A1=VERDADERO, A2 vacía: en un rango se ignora)
 * SUMA("5")         -> 5     (texto numérico directo: se convierte)
 * SUMA(A1:A2)       -> 0     (con A1="5": dentro de un rango, el texto se ignora)
 * ```
 *
 * El modelo anterior aplanaba rangos y argumentos sueltos por igual, así que
 * no podía reproducir esa diferencia. Ahora se conserva.
 */

import type { Columna } from '../values/columna.ts';

export interface Argumento {
  /** Una columna si es celda o expresión; tantas como celdas si es un rango. */
  columnas: Columna[];
  /** Si vino de una referencia de rango. Ver el docstring del módulo. */
  esRango: boolean;
}

/** Firma común de toda función del registro. `n` es el número de iteraciones. */
export type FuncionExcel = (args: Argumento[], n: number) => Columna;

/** Envuelve una columna como argumento suelto (celda o expresión). */
export function argValor(c: Columna): Argumento {
  return { columnas: [c], esRango: false };
}

/** Envuelve las columnas de un rango como un único argumento. */
export function argRango(columnas: Columna[]): Argumento {
  return { columnas, esRango: true };
}

/** Todas las columnas de todos los argumentos, en orden de aparición. */
export function aplanar(args: Argumento[]): Columna[] {
  const out: Columna[] = [];
  for (const a of args) for (const c of a.columnas) out.push(c);
  return out;
}
