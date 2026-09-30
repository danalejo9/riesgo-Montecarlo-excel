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
import { AND, FALSE, IF, IFERROR, IFNA, IFS, NOT, OR, SWITCH, TRUE, XOR } from './logic.ts';
import {
  AVERAGEIF, AVERAGEIFS, COUNTIF, COUNTIFS, MAXIFS, MINIFS, SUMIF, SUMIFS,
} from './condicionales.ts';
import {
  ISBLANK, ISERR, ISERROR, ISLOGICAL, ISNA, ISNONTEXT, ISNUMBER, ISTEXT, NA,
} from './info.ts';
import { DATE, DAY, DAYS, EDATE, EOMONTH, MONTH, WEEKDAY, YEAR } from './fechas.ts';
import {
  DATEDIF, DATEVALUE, DAYS360, NETWORKDAYS, WORKDAY, YEARFRAC,
} from './calendario.ts';
import {
  FV, IPMT, IRR, NPER, NPV, PMT, PPMT, PV, RATE, XIRR, XNPV,
} from './financieras.ts';
import {
  CHOOSE, HLOOKUP, INDEX, LOOKUP, MATCH, VLOOKUP, XLOOKUP, XMATCH,
} from './busquedas.ts';
import { TEXT } from './formato.ts';
import { AGGREGATE, SUBTOTAL } from './subtotales.ts';
import {
  CHAR, CODE, CONCAT, CONCATENATE, EXACT, FIND, HYPERLINK, LEFT, LEN, LOWER, MID, N,
  NUMBERVALUE, PROPER, REPLACE, REPT, RIGHT, SEARCH, SUBSTITUTE, T, TEXTJOIN, TRIM, TYPE,
  UPPER, VALUE,
} from './texto.ts';
import { REGISTRO_MATRICIAL } from './matriciales.ts';
import { NOMBRE_CUANTIL, RIESGO_CUANTIL } from './riesgo.ts';
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
  // Nivel 1 (Fase 2 §4.2): criterio, fecha y financieras.
  SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGEIF, AVERAGEIFS, MAXIFS, MINIFS,
  IFS, SWITCH,
  DATE, YEAR, MONTH, DAY, EOMONTH, EDATE, DAYS, WEEKDAY,
  DAYS360, YEARFRAC, DATEDIF, WORKDAY, NETWORKDAYS, DATEVALUE,
  NPV, IRR, XNPV, XIRR,
  PMT, PV, FV, NPER, RATE, IPMT, PPMT,
  // Búsquedas: el mayor hueco de generalidad que tenía el motor.
  VLOOKUP, HLOOKUP, INDEX, MATCH, XLOOKUP, XMATCH, LOOKUP, CHOOSE,
  // Nivel 2: texto. Rara vez están entre una entrada y una salida, pero basta
  // una para mandar la simulación entera al modo compatible.
  LEN, LEFT, RIGHT, MID, UPPER, LOWER, PROPER, TRIM,
  CONCATENATE, CONCAT, TEXTJOIN, FIND, SEARCH, SUBSTITUTE, REPLACE, REPT,
  CHAR, CODE, EXACT, VALUE, NUMBERVALUE, TYPE, N, T, HYPERLINK,
  // Con la configuración regional, que es de lo que depende casi entera.
  TEXT,
  // Nivel 2: agregados que no cuentan dos veces los subtotales intermedios.
  SUBTOTAL, AGGREGATE,
  // Interna (B7): la escribe la reescritura de las funciones RIESGO, nunca el usuario.
  [NOMBRE_CUANTIL]: RIESGO_CUANTIL,
};

/**
 * Excel guarda en el XML las funciones posteriores a 2007 con el prefijo
 * `_xlfn.` (y las de ámbito de hoja con `_xlws.`), aunque en la barra de
 * fórmulas se vean sin él: `SI.ND` se escribe `_xlfn.IFNA`. Un libro real
 * llega con esos prefijos, así que el registro tiene que quitarlos antes de
 * buscar — `scanner/catalog.ts` ya hacía lo mismo por su cuenta.
 *
 * `_xludf.` es distinto y **no** se normaliza: es lo que Excel antepone a una
 * función que no reconoce, y tomarla por buena sería fingir soporte de algo
 * que ni el propio Excel supo calcular.
 */
function normalizar(nombre: string): string {
  return nombre.replace(/^_xlfn\./i, '').replace(/^_xlws\./i, '').toUpperCase();
}

/**
 * Construcciones que el motor soporta sin ser una función del registro: se
 * resuelven al parsear y nunca llegan a evaluarse como llamada. `LET` es la
 * primera (ver `engine/parser/let.ts`), y `LAMBDA` con ella; las matriciales (`FILTRAR`, `ORDENAR`…)
 * las evalúa el evaluador como matrices, dentro de otra función (ver
 * `compiler/usoMatricial.ts`). Cuentan como soportadas para el escáner.
 */
export const FORMAS_ESPECIALES: ReadonlySet<string> = new Set(['LET', 'LAMBDA', ...Object.keys(REGISTRO_MATRICIAL)]);

export function funcionSoportada(nombre: string): boolean {
  const n = normalizar(nombre);
  return Object.prototype.hasOwnProperty.call(REGISTRO, n) || FORMAS_ESPECIALES.has(n);
}

export function obtenerFuncion(nombre: string): FuncionExcel | undefined {
  return REGISTRO[normalizar(nombre)];
}
