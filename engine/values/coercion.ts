/**
 * Las reglas de conversión y comparación de Excel entre tipos de valor.
 *
 * Están aquí, en un solo archivo y con tests propios, porque son la clase de
 * detalle que se implementa "de memoria" y produce números silenciosamente
 * incorrectos — el mismo error que la auditoría encontró en el motor heredado
 * con PERT. Cada regla no evidente lleva su comentario y, cuando se puede, su
 * caso en el libro de fidelidad.
 *
 * ---
 *
 * **Lo que Excel hace y no es evidente:**
 *
 * 1. Una celda **vacía** vale 0 en aritmética, pero no es un 0: `PROMEDIO`
 *    no la cuenta en el denominador y `CONTAR` no la cuenta. Esa distinción
 *    es justo la que el motor no podía hacer antes de este módulo (casos
 *    L0-031 y L0-032 del libro de fidelidad).
 *
 * 2. El **texto numérico** se convierte en un operando directo (`"5"+1` da 6)
 *    pero se **ignora** dentro de un rango agregado (`SUMA(A1:A9)` no suma la
 *    celda que contiene "5"). No es incoherencia: son dos contextos distintos,
 *    y por eso `Argumento` conserva si vino de un rango o de una expresión.
 *
 * 3. El **orden entre tipos** es número < texto < FALSO < VERDADERO. Un
 *    número nunca es mayor que un texto, por grande que sea.
 *
 * **Límites conocidos, no disimulados:**
 *
 * - La conversión de texto a número acepta espacios, signo, decimales,
 *   notación científica y porcentaje. **No** acepta símbolos de moneda,
 *   separadores de millares ni fechas, y asume el punto como separador
 *   decimal. En un libro es-ES un texto "1,5" se convertiría en Excel a 1,5 y
 *   aquí no: el motor no recibe todavía información de configuración
 *   regional. Es un hueco real, documentado también en el handoff.
 * - `textoDeNumero` reproduce el formato "General" de Excel de forma
 *   aproximada (hasta 11 dígitos significativos). Basta para comparar y
 *   concatenar; no pretende reproducir el redondeo de presentación exacto.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import {
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
  numeroEn,
  textoEn,
  errorEn,
  tipoEn,
  type Columna,
} from './columna.ts';

/**
 * Coerción aritmética de un valor a número.
 *
 * Devuelve el número, o el código de error de Excel que corresponda. La unión
 * `number | ErrorExcel` evita reservar un objeto por iteración: los códigos de
 * error son cadenas constantes, así que distinguirlos con `typeof` es gratis.
 */
export function coercionNumerica(c: Columna, i: number): number | ErrorExcel {
  switch (tipoEn(c, i)) {
    case NUMERO:
    case LOGICO:
      return numeroEn(c, i);
    case VACIO:
      return 0; // vacío vale 0 en aritmética (pero ver PROMEDIO/CONTAR)
    case ERROR:
      return errorEn(c, i) ?? '#VALUE!';
    case TEXTO: {
      const n = numeroDeTexto(textoEn(c, i) ?? '');
      return n === undefined ? '#VALUE!' : n;
    }
  }
}

/**
 * Convierte un texto a número siguiendo lo que Excel acepta en un operando.
 * `undefined` si no es convertible (Excel daría `#¡VALOR!`).
 */
export function numeroDeTexto(s: string): number | undefined {
  const t = s.trim();
  if (t === '') return 0; // Excel: ""+0 es 0

  const porcentaje = t.endsWith('%');
  const cuerpo = porcentaje ? t.slice(0, -1).trim() : t;

  // `Number` acepta cosas que Excel no ("0x10", "Infinity", ""), así que se
  // exige antes la forma decimal explícita.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(cuerpo)) return undefined;

  const n = Number(cuerpo);
  if (!Number.isFinite(n)) return undefined;
  return porcentaje ? n / 100 : n;
}

/** Representación textual de un número, aproximando el formato "General". */
export function textoDeNumero(x: number): string {
  if (Number.isInteger(x) && Math.abs(x) < 1e21) return String(x);
  const s = x.toPrecision(11);
  // toPrecision deja ceros de relleno ("1.5000000000"); Number los quita.
  return String(Number(s));
}

/**
 * Coerción a texto, para `&` y para comparar. El llamante debe haber
 * descartado ya el caso error (los errores se propagan antes de concatenar).
 */
export function coercionTexto(c: Columna, i: number): string {
  switch (tipoEn(c, i)) {
    case TEXTO:
      return textoEn(c, i) ?? '';
    case NUMERO:
      return textoDeNumero(numeroEn(c, i));
    case LOGICO:
      // Excel escribe el literal en el idioma de la interfaz; el motor no
      // recibe esa información todavía, así que usa el nombre canónico.
      return numeroEn(c, i) !== 0 ? 'TRUE' : 'FALSE';
    case VACIO:
      return '';
    case ERROR:
      return errorEn(c, i) ?? '#VALUE!';
  }
}

/**
 * Coerción a condición, para `SI` y los operadores lógicos.
 *
 * Excel acepta el texto "VERDADERO"/"FALSO" como condición y rechaza
 * cualquier otro texto con `#¡VALOR!`.
 */
export function coercionLogica(c: Columna, i: number): boolean | ErrorExcel {
  switch (tipoEn(c, i)) {
    case NUMERO:
    case LOGICO:
      return numeroEn(c, i) !== 0;
    case VACIO:
      return false;
    case ERROR:
      return errorEn(c, i) ?? '#VALUE!';
    case TEXTO: {
      const t = (textoEn(c, i) ?? '').trim().toUpperCase();
      if (t === 'TRUE' || t === 'VERDADERO') return true;
      if (t === 'FALSE' || t === 'FALSO') return false;
      return '#VALUE!';
    }
  }
}

/**
 * Rango de ordenación entre tipos: número (0) < texto (1) < lógico (2).
 * Un vacío no tiene rango propio: adopta el del valor con el que se compara.
 */
function rangoDeTipo(t: number): number {
  if (t === NUMERO) return 0;
  if (t === TEXTO) return 1;
  return 2; // LOGICO
}

/**
 * Compara dos valores como lo haría Excel: -1, 0 o 1, o el código de error si
 * alguno de los dos lo es.
 *
 * El caso delicado es el **vacío**, que no se compara como un tipo propio sino
 * adoptando el del otro operando: contra un número vale 0, contra un texto
 * vale "", y contra un lógico vale FALSO. Por eso una celda vacía es a la vez
 * `=0` y `=""` en Excel, que sorprende hasta que se ve escrito.
 */
export function compararEn(a: Columna, b: Columna, i: number): number | ErrorExcel {
  const ta = tipoEn(a, i);
  const tb = tipoEn(b, i);

  if (ta === ERROR) return errorEn(a, i) ?? '#VALUE!';
  if (tb === ERROR) return errorEn(b, i) ?? '#VALUE!';

  if (ta === VACIO && tb === VACIO) return 0;

  const efectivoA = ta === VACIO ? tb : ta;
  const efectivoB = tb === VACIO ? ta : tb;

  const rangoA = rangoDeTipo(efectivoA);
  const rangoB = rangoDeTipo(efectivoB);
  if (rangoA !== rangoB) return rangoA < rangoB ? -1 : 1;

  if (rangoA === 1) {
    const sa = ta === VACIO ? '' : coercionTexto(a, i);
    const sb = tb === VACIO ? '' : coercionTexto(b, i);
    return compararTexto(sa, sb);
  }

  const na = ta === VACIO ? 0 : numeroEn(a, i);
  const nb = tb === VACIO ? 0 : numeroEn(b, i);
  return na === nb ? 0 : na < nb ? -1 : 1;
}

/**
 * Comparación de texto de Excel: **no distingue mayúsculas de minúsculas**.
 *
 * Excel ordena según la configuración regional; aquí se usa la comparación de
 * JavaScript sobre la forma en mayúsculas, que coincide para texto ASCII y
 * puede diferir en el orden (no en la igualdad) con acentos. La igualdad, que
 * es lo que usan los criterios de `SUMAR.SI`, sí es fiel.
 */
export function compararTexto(a: string, b: string): number {
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  return ua === ub ? 0 : ua < ub ? -1 : 1;
}
