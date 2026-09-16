/**
 * Catálogo de funciones de Excel por nivel de soporte del motor rápido.
 *
 * Los nombres están en inglés a propósito: el formato `.xlsx` guarda siempre
 * las fórmulas con los nombres en-US, independientemente del idioma con el que
 * el usuario las escribió. Un libro en es-ES con `=SUMA(A1:A9)` contiene
 * literalmente `SUM(A1:A9)` en el XML.
 *
 * Los niveles son los del §4.2 de docs/FASE2_ARQUITECTURA.md. Este catálogo es
 * el supuesto que el escáner existe para poner a prueba (decisión D4).
 */

export type Nivel = 'n0' | 'n1' | 'n2' | 'no-soportada' | 'desconocida';

/** Nivel 0 — MVP. Aritmética, agregación y lógica básica. */
export const NIVEL_0 = new Set([
  'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'COUNTBLANK', 'PRODUCT',
  'IF', 'AND', 'OR', 'NOT', 'IFERROR', 'IFNA', 'XOR',
  'ROUND', 'ROUNDUP', 'ROUNDDOWN', 'MROUND', 'CEILING', 'FLOOR', 'TRUNC', 'INT',
  'ABS', 'SIGN', 'MOD', 'SQRT', 'POWER', 'EXP', 'LN', 'LOG', 'LOG10',
  'SUMPRODUCT', 'SUMSQ', 'MEDIAN', 'STDEV', 'STDEV.S', 'STDEV.P', 'VAR.S', 'VAR.P',
  'PERCENTILE', 'PERCENTILE.INC', 'QUARTILE', 'QUARTILE.INC', 'LARGE', 'SMALL',
  'TRUE', 'FALSE', 'NA',
]);

/** Nivel 1 — necesario para presupuestos reales. Búsquedas, financieras, fechas. */
export const NIVEL_1 = new Set([
  'VLOOKUP', 'HLOOKUP', 'LOOKUP', 'XLOOKUP', 'INDEX', 'MATCH', 'XMATCH', 'CHOOSE', 'OFFSET',
  'SUMIF', 'SUMIFS', 'COUNTIF', 'COUNTIFS', 'AVERAGEIF', 'AVERAGEIFS',
  'MAXIFS', 'MINIFS', 'IFS', 'SWITCH',
  'NPV', 'IRR', 'XNPV', 'XIRR', 'PMT', 'PV', 'FV', 'RATE', 'NPER', 'IPMT', 'PPMT',
  'DATE', 'YEAR', 'MONTH', 'DAY', 'DAYS', 'DAYS360', 'EOMONTH', 'EDATE',
  'DATEDIF', 'WEEKDAY', 'WORKDAY', 'NETWORKDAYS', 'DATEVALUE', 'YEARFRAC',
]);

/** Nivel 2 — texto, matrices dinámicas, agregación con filtros. Más adelante o nunca. */
export const NIVEL_2 = new Set([
  'CONCATENATE', 'CONCAT', 'TEXTJOIN', 'LEFT', 'RIGHT', 'MID', 'LEN', 'FIND',
  'SEARCH', 'SUBSTITUTE', 'REPLACE', 'TRIM', 'UPPER', 'LOWER', 'PROPER', 'TEXT',
  'VALUE', 'REPT', 'CHAR', 'CODE', 'EXACT', 'NUMBERVALUE',
  'SUBTOTAL', 'AGGREGATE', 'GETPIVOTDATA',
  'FILTER', 'UNIQUE', 'SORT', 'SORTBY', 'SEQUENCE', 'TEXTSPLIT', 'LET', 'LAMBDA',
  'TRANSPOSE', 'MMULT', 'MINVERSE',
  'ISBLANK', 'ISERROR', 'ISNUMBER', 'ISTEXT', 'ISNA', 'TYPE', 'N', 'T',
  'HYPERLINK', 'FORMULATEXT',
]);

/**
 * No soportadas por diseño, no por falta de tiempo.
 *
 * `RAND`/`RANDBETWEEN`: el motor es la única fuente de aleatoriedad; si el
 * modelo trae la suya, los resultados dejan de ser reproducibles.
 * `INDIRECT`/`CELL`/`INFO`: la referencia se decide en tiempo de ejecución, así
 * que el grafo de dependencias no se puede conocer antes de simular.
 * `NOW`/`TODAY`: cambian solos y romperían la reproducibilidad.
 */
export const NO_SOPORTADAS = new Set([
  'RAND', 'RANDBETWEEN', 'RANDARRAY', 'INDIRECT', 'CELL', 'INFO', 'NOW', 'TODAY',
]);

/** Funciones volátiles: Excel las recalcula ante cualquier cambio. */
export const VOLATILES = new Set([
  'RAND', 'RANDBETWEEN', 'RANDARRAY', 'NOW', 'TODAY', 'INDIRECT', 'OFFSET', 'CELL', 'INFO',
]);

/** Espacios de nombres propios del complemento (actual y heredado). */
export const PREFIJOS_PROPIOS = ['RISK.', 'RIESGO.'];

/**
 * Normaliza el nombre tal como aparece en el XML.
 *
 * Excel antepone `_xlfn.` a las funciones posteriores a 2007 y `_xlws.` a las
 * de ámbito de hoja; `@` marca la intersección implícita en libros guardados
 * con versiones que soportan matrices dinámicas.
 */
export function normalizar(nombre: string): string {
  return nombre
    .replace(/^_xlfn\./, '')
    .replace(/^_xlws\./, '')
    .replace(/^@/, '')
    .toUpperCase();
}

export function clasificar(nombre: string): Nivel {
  const n = normalizar(nombre);
  if (NO_SOPORTADAS.has(n)) return 'no-soportada';
  if (NIVEL_0.has(n)) return 'n0';
  if (NIVEL_1.has(n)) return 'n1';
  if (NIVEL_2.has(n)) return 'n2';
  return 'desconocida';
}

export function esVolatil(nombre: string): boolean {
  return VOLATILES.has(normalizar(nombre));
}

export function esFuncionPropia(nombre: string): boolean {
  const n = normalizar(nombre);
  return PREFIJOS_PROPIOS.some((p) => n.startsWith(p));
}

export const ETIQUETA_NIVEL: Record<Nivel, string> = {
  n0: 'Nivel 0 (MVP)',
  n1: 'Nivel 1 (presupuestos)',
  n2: 'Nivel 2 (más adelante)',
  'no-soportada': 'No soportada por diseño',
  desconocida: 'Desconocida o definida por el usuario',
};
