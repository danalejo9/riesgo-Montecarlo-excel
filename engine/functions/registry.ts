/**
 * Registro de funciones vectorizadas disponibles para el compilador.
 *
 * Añadir cobertura tiene que ser barato —decisión 16 del handoff, ahora que el
 * producto es para público abierto y el catálogo nunca estará completo—, así
 * que una función nueva es una entrada más en esta tabla.
 */

import {
  ABS, AVERAGE, CEILING, COUNT, COUNTA, COUNTBLANK, EXP, FLOOR, INT, LARGE, LN,
  LOG, LOG10, MAX, MEDIAN, MIN, MOD, MROUND, PERCENTILE, POWER, PRODUCT,
  QUARTILE, ROUND, ROUNDDOWN, ROUNDUP, SIGN, SMALL, SQRT, STDEV_P, STDEV_S, SUM,
  SUMPRODUCT, SUMSQ, TRUNC, VAR_P, VAR_S,
} from './math.ts';
import { AND, FALSE, IF, IFERROR, IFNA, NOT, OR, TRUE, XOR } from './logic.ts';
import {
  AVERAGEIF, AVERAGEIFS, COUNTIF, COUNTIFS, SUMIF, SUMIFS,
} from './condicionales.ts';
import {
  ISBLANK, ISERR, ISERROR, ISLOGICAL, ISNA, ISNONTEXT, ISNUMBER, ISTEXT, NA,
} from './info.ts';
import type { FuncionExcel } from './types.ts';

export const REGISTRO: Record<string, FuncionExcel> = {
  SUM, PRODUCT, MIN, MAX, COUNT, COUNTA, COUNTBLANK, AVERAGE, MEDIAN, SUMPRODUCT,
  'STDEV.S': STDEV_S, 'STDEV.P': STDEV_P, 'VAR.S': VAR_S, 'VAR.P': VAR_P,
  STDEV: STDEV_S, // alias heredado de Excel: STDEV es la versión muestral
  ABS, SIGN, SQRT, INT, EXP, LN, LOG, LOG10, POWER, MOD,
  ROUND, ROUNDUP, ROUNDDOWN, TRUNC, MROUND, CEILING, FLOOR, SUMSQ,
  PERCENTILE, 'PERCENTILE.INC': PERCENTILE, QUARTILE, 'QUARTILE.INC': QUARTILE,
  LARGE, SMALL,
  IF, IFERROR, IFNA, AND, OR, NOT, XOR, TRUE, FALSE,
  ISBLANK, ISNUMBER, ISTEXT, ISNONTEXT, ISLOGICAL, ISERROR, ISERR, ISNA, NA,
  // Nivel 1: las funciones de criterio (Fase 2 §4.2).
  SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGEIF, AVERAGEIFS,
};

export function funcionSoportada(nombre: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRO, nombre.toUpperCase());
}

export function obtenerFuncion(nombre: string): FuncionExcel | undefined {
  return REGISTRO[nombre.toUpperCase()];
}
