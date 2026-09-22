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

/**
 * Filas y columnas de un rango.
 *
 * Hace falta porque las funciones de búsqueda operan sobre la **rejilla**, no
 * sobre una lista: `BUSCARV(x; A1:D9; 3)` necesita saber que la tabla tiene
 * cuatro columnas para poder ir a la tercera. Los reductores (`SUMA`,
 * `PROMEDIO`) no la usan: para ellos un rango sí es una lista.
 */
export interface FormaRango {
  filas: number;
  cols: number;
}

export interface Argumento {
  /** Una columna si es celda o expresión; tantas como celdas si es un rango. */
  columnas: Columna[];
  /** Si vino de una referencia de rango. Ver el docstring del módulo. */
  esRango: boolean;
  /** Dimensiones, si vino de un rango. `columnas` va ordenado por columnas. */
  forma?: FormaRango;
}

/**
 * La celda `(fila, col)` de un rango, ambas empezando en 0.
 *
 * El aplanado es **por columnas** —así lo recorre el evaluador—, de modo que
 * la celda de la fila `f` y la columna `c` está en la posición `c * filas + f`.
 * Equivocar el orden da una tabla transpuesta y resultados plausibles pero
 * falsos, que es la peor clase de error.
 */
export function celdaEn(arg: Argumento, fila: number, col: number): Columna | undefined {
  const forma = arg.forma;
  if (!forma) return undefined;
  if (fila < 0 || col < 0 || fila >= forma.filas || col >= forma.cols) return undefined;
  return arg.columnas[col * forma.filas + fila];
}

/** Firma común de toda función del registro. `n` es el número de iteraciones. */
export type FuncionExcel = (args: Argumento[], n: number) => Columna;

/** Envuelve una columna como argumento suelto (celda o expresión). */
export function argValor(c: Columna): Argumento {
  return { columnas: [c], esRango: false };
}

/** Envuelve las columnas de un rango como un único argumento. */
export function argRango(columnas: Columna[], forma?: FormaRango): Argumento {
  return { columnas, esRango: true, forma: forma ?? { filas: columnas.length, cols: 1 } };
}

/** Todas las columnas de todos los argumentos, en orden de aparición. */
export function aplanar(args: Argumento[]): Columna[] {
  const out: Columna[] = [];
  for (const a of args) for (const c of a.columnas) out.push(c);
  return out;
}
