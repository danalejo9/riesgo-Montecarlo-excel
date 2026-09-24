/**
 * Funciones de tipo: las que preguntan *qué* hay en una celda en vez de operar
 * con su valor. Solo tienen sentido con el canal de valores — sin él,
 * `ESBLANCO` no podía existir porque una celda vacía y un cero eran lo mismo.
 *
 * `ESBLANCO` es además lo único que separaba al libro real del usuario
 * (`Humedales_v1_completo`, 132 hojas, 16.609 fórmulas) de ser 100 %
 * compatible con el motor rápido: 7 usos, medidos con el escáner de E1.
 */

import {
  errorEn,
  logicoConstante,
  tipoEn,
  vectorLogico,
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
  type Columna,
  type TipoValor,
} from '../values/columna.ts';
import { errorConstante } from '../values/columna.ts';
import type { Argumento } from './types.ts';

function predicado(args: Argumento[], n: number, cumple: (c: Columna, i: number) => boolean): Columna {
  const c = args[0]?.columnas[0];
  if (!c) return logicoConstante(false, n);

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = cumple(c, i) ? 1 : 0;
  return vectorLogico(out);
}

function esTipo(t: TipoValor) {
  return (c: Columna, i: number): boolean => tipoEn(c, i) === t;
}

/**
 * `ESBLANCO`: verdadero solo si la celda está **de verdad** vacía. Una celda
 * con un cero no lo está, y una fórmula que devuelve `""` tampoco — aunque las
 * tres se vean igual en la hoja.
 */
export const ISBLANK = (args: Argumento[], n: number): Columna => predicado(args, n, esTipo(VACIO));

export const ISNUMBER = (args: Argumento[], n: number): Columna => predicado(args, n, esTipo(NUMERO));

export const ISTEXT = (args: Argumento[], n: number): Columna => predicado(args, n, esTipo(TEXTO));

export const ISLOGICAL = (args: Argumento[], n: number): Columna => predicado(args, n, esTipo(LOGICO));

/** `ESNOTEXTO`: cualquier cosa que no sea texto, incluida una celda vacía. */
export const ISNONTEXT = (args: Argumento[], n: number): Columna =>
  predicado(args, n, (c, i) => tipoEn(c, i) !== TEXTO);

/** `ESERROR`: cualquier error, `#N/A` incluido. */
export const ISERROR = (args: Argumento[], n: number): Columna => predicado(args, n, esTipo(ERROR));

/** `ESERR`: cualquier error **menos** `#N/A`, que es la diferencia con ESERROR. */
export const ISERR = (args: Argumento[], n: number): Columna =>
  predicado(args, n, (c, i) => tipoEn(c, i) === ERROR && errorEn(c, i) !== '#N/A');

export const ISNA = (args: Argumento[], n: number): Columna =>
  predicado(args, n, (c, i) => tipoEn(c, i) === ERROR && errorEn(c, i) === '#N/A');

/** `NOD()`: devuelve el error `#N/A` a propósito. */
export const NA = (_args: Argumento[], n: number): Columna => errorConstante('#N/A', n);
