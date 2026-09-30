/**
 * **Dónde se admite una matriz.** La regla que comparten el evaluador y la
 * elección de motor, para que lo que uno acepta el otro lo prediga.
 *
 * Una matriz —un rango operado (`A2:A9>5`), una constante `{1;2;3}`, un
 * `FILTRAR`— es válida en el motor rápido solo si **algo la consume** dentro
 * de la misma fórmula: una función que agrega o busca en matrices (`SUMA`,
 * `SUMAPRODUCTO`, `INDICE`, `COINCIDIR`…), otra función matricial, o una
 * función escalar "elevada" elemento a elemento dentro de ese contexto (el
 * `SI` de `SUMA(SI(A2:A9>5; B2:B9))`).
 *
 * Si la matriz llega hasta la raíz de la fórmula, en Excel **derrama** sobre
 * las celdas de al lado. Esas celdas no tienen fórmula propia: el lector las
 * vería como valores fijos y el motor rápido las trataría como constantes,
 * con lo que la incertidumbre dejaría de propagarse **sin que nadie se
 * enterase**. Por eso ese caso va al modo compatible, con este motivo.
 */

import type { Nodo } from '../parser/ast.ts';
import { REGISTRO_MATRICIAL } from '../functions/matriciales.ts';

export function normalizarFuncion(nombre: string): string {
  return nombre.replace(/^_xlfn\./i, '').replace(/^_xlws\./i, '').toUpperCase();
}

/** Funciones que devuelven una matriz. */
export const MATRICIALES: ReadonlySet<string> = new Set(Object.keys(REGISTRO_MATRICIAL));

/** Funciones que consumen matrices en sus argumentos (agregan o buscan). */
export const ACEPTAN_MATRICES: ReadonlySet<string> = new Set([
  'SUM', 'PRODUCT', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'AVERAGE', 'MEDIAN', 'SUMPRODUCT', 'SUMSQ',
  'STDEV', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P', 'LARGE', 'SMALL',
  'PERCENTILE', 'PERCENTILE.INC', 'QUARTILE', 'QUARTILE.INC',
  'AND', 'OR', 'XOR', 'CONCAT', 'TEXTJOIN',
  'INDEX', 'MATCH', 'XMATCH', 'XLOOKUP', 'LOOKUP', 'VLOOKUP', 'HLOOKUP',
  'NPV', 'IRR',
]);

/**
 * Funciones escalares que, dentro de un contexto matricial, se aplican
 * elemento a elemento (como hace Excel). Fuera de él, una matriz en sus
 * argumentos derramaría.
 */
export const ELEVABLES: ReadonlySet<string> = new Set([
  'IF', 'IFERROR', 'IFNA', 'NOT', 'ABS', 'INT', 'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'TRUNC', 'MOD',
  'SQRT', 'EXP', 'LN', 'LOG10', 'POWER', 'SIGN',
  'ISNUMBER', 'ISTEXT', 'ISBLANK', 'ISERROR', 'ISNA', 'ISLOGICAL', 'N',
  'LEN', 'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'TRIM', 'VALUE',
  'YEAR', 'MONTH', 'DAY', 'DATE', 'EOMONTH', 'EDATE', 'WEEKDAY',
]);

/** ¿Devuelve este nodo (potencialmente) varias celdas? */
export function produceMatriz(nodo: Nodo): boolean {
  switch (nodo.tipo) {
    case 'rango':
    case 'matriz':
      return true;
    case 'funcion': {
      const f = normalizarFuncion(nodo.nombre);
      if (MATRICIALES.has(f)) return true;
      return ELEVABLES.has(f) && nodo.args.some(produceMatriz);
    }
    case 'binaria':
      return produceMatriz(nodo.izq) || produceMatriz(nodo.der);
    case 'unaria':
    case 'porcentaje':
      return produceMatriz(nodo.arg);
    default:
      return false;
  }
}

/**
 * El motivo por el que esta fórmula no puede ir al motor rápido por su uso de
 * matrices, o `null` si no hay problema.
 */
export function motivoMatricial(raiz: Nodo): string | null {
  const visitar = (nodo: Nodo, admite: boolean, argumentoDirecto: boolean): string | null => {
    switch (nodo.tipo) {
      case 'rango':
        // Un rango como argumento de una función es lo de siempre (SUMA(A1:A9)).
        return admite || argumentoDirecto ? null : 'un rango usado como valor (derramaría)';
      case 'matriz':
        if (!admite) return 'una constante matricial fuera de una función que la consuma (derramaría)';
        for (const fila of nodo.filas) for (const c of fila) { const m = visitar(c, false, false); if (m) return m; }
        return null;
      case 'funcion': {
        const f = normalizarFuncion(nodo.nombre);
        let admiteHijos = false;
        if (MATRICIALES.has(f)) {
          if (!admite) return `${f} devuelve varias celdas y aquí derramaría; solo se admite dentro de una función que las consuma, como SUMA(${f}(…))`;
          admiteHijos = true;
        } else if (ACEPTAN_MATRICES.has(f)) {
          admiteHijos = true;
        } else if (ELEVABLES.has(f) && admite) {
          admiteHijos = true;
        }
        for (const a of nodo.args) { const m = visitar(a, admiteHijos, true); if (m) return m; }
        return null;
      }
      case 'binaria': {
        if (!admite && (produceMatriz(nodo.izq) || produceMatriz(nodo.der))) {
          return 'una operación entre rangos fuera de una función que acepte matrices (derramaría)';
        }
        return visitar(nodo.izq, admite, false) ?? visitar(nodo.der, admite, false);
      }
      case 'unaria':
      case 'porcentaje':
        if (!admite && produceMatriz(nodo.arg)) return 'una operación sobre un rango fuera de una función que acepte matrices (derramaría)';
        return visitar(nodo.arg, admite, false);
      default:
        return null;
    }
  };
  return visitar(raiz, false, false);
}
