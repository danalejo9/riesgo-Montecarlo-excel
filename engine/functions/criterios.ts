/**
 * La gramática de criterios de Excel, la que comparten `SUMAR.SI`,
 * `CONTAR.SI`, `PROMEDIO.SI` y sus variantes `.CONJUNTO`.
 *
 * Un criterio es un valor con un comparador opcional delante, todo dentro de
 * la misma cadena:
 *
 * ```
 * 100        igual a 100
 * ">100"     mayor que 100
 * "<>0"      distinto de 0
 * "cemento"  igual al texto "cemento" (sin distinguir mayúsculas)
 * "cem*"     empieza por "cem"
 * "?asa"     cuatro letras acabadas en "asa"
 * "~*"       igual al asterisco literal
 * ""         celda vacía
 * "<>"       celda no vacía
 * ```
 *
 * **Reglas de coincidencia, con lo que se ha decidido en cada caso dudoso:**
 *
 * - Una celda **vacía** no coincide nunca con un criterio numérico, ni
 *   siquiera con `"<1"` o `"<>5"`: Excel la salta, no la trata como 0.
 * - `""` coincide con las celdas vacías y con la cadena vacía que devuelve
 *   una fórmula; `"<>"` coincide con todo lo que no esté vacío.
 * - Un criterio de texto con `=` solo coincide con celdas de texto; con `<>`
 *   coincide con cualquier celda no vacía que no sea ese texto, números
 *   incluidos.
 * - Una celda con **error** no coincide con ningún criterio (y no lo propaga:
 *   `CONTAR.SI` sobre un rango con `#N/A` cuenta el resto sin fallar).
 * - Los comodines solo actúan en comparaciones de texto con `=` y `<>`.
 *
 * Los casos límite de esta lista están en la segunda tanda del libro de
 * fidelidad para verificarlos contra Excel de verdad, que es la única
 * autoridad: ver `docs/FASE2_ARQUITECTURA.md` §11.3.
 */

import { compararTexto, numeroDeTexto } from '../values/coercion.ts';
import {
  numeroEn,
  textoEn,
  tipoEn,
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
  type Columna,
  type ValorEscalar,
} from '../values/columna.ts';

export type Comparador = '=' | '<>' | '>' | '>=' | '<' | '<=';

export interface Criterio {
  comparador: Comparador;
  /** Número de referencia, si el criterio compara contra un número. */
  numero?: number;
  /** Texto de referencia, si compara contra texto. */
  texto?: string;
  /** Patrón, si el texto de referencia traía comodines. */
  patron?: RegExp;
  /** `""` o `"<>"` a secas: el criterio habla de estar vacío o no. */
  sobreVacio: boolean;
}

const COMPARADORES: Comparador[] = ['<>', '>=', '<=', '>', '<', '='];

/** Interpreta el valor que se pasó como criterio. */
export function compilarCriterio(v: ValorEscalar): Criterio {
  if (v.tipo === NUMERO || v.tipo === LOGICO) {
    return { comparador: '=', numero: v.numero, sobreVacio: false };
  }
  if (v.tipo !== TEXTO) {
    // Una celda vacía usada como criterio equivale a "igual a vacío".
    return { comparador: '=', sobreVacio: true };
  }
  return compilarCriterioTexto(v.texto);
}

export function compilarCriterioTexto(entrada: string): Criterio {
  let comparador: Comparador = '=';
  let resto = entrada;

  for (const op of COMPARADORES) {
    if (entrada.startsWith(op)) {
      comparador = op;
      resto = entrada.slice(op.length);
      break;
    }
  }

  if (resto === '') return { comparador, sobreVacio: true };

  const n = numeroDeTexto(resto);
  if (n !== undefined) return { comparador, numero: n, sobreVacio: false };

  return { comparador, texto: resto, patron: patronDeTexto(resto), sobreVacio: false };
}

/** Traduce los comodines de Excel a una expresión regular, o null si no hay. */
function patronDeTexto(s: string): RegExp | undefined {
  if (!/[*?~]/.test(s)) return undefined;

  let re = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (ch === '~' && i + 1 < s.length && '*?~'.includes(s[i + 1] as string)) {
      re += escaparRegex(s[++i] as string);
    } else if (ch === '*') {
      re += '[\\s\\S]*';
    } else if (ch === '?') {
      re += '[\\s\\S]';
    } else {
      re += escaparRegex(ch);
    }
  }
  return new RegExp(`^${re}$`, 'i');
}

function escaparRegex(ch: string): string {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/** ¿La celda `i` de la columna `c` cumple el criterio? */
export function cumple(crit: Criterio, c: Columna, i: number): boolean {
  const tipo = tipoEn(c, i);

  // Un error nunca coincide, y tampoco hace fallar la cuenta.
  if (tipo === ERROR) return false;

  const vacia = tipo === VACIO || (tipo === TEXTO && textoEn(c, i) === '');

  if (crit.sobreVacio) {
    return crit.comparador === '<>' ? !vacia : vacia;
  }

  // Ninguna celda vacía entra en una comparación con un valor concreto.
  if (vacia) return false;

  if (crit.numero !== undefined) {
    if (tipo !== NUMERO && tipo !== LOGICO) {
      // Un texto nunca es "mayor que 100"; solo puede ser distinto de él.
      return crit.comparador === '<>';
    }
    return comparaSegun(crit.comparador, signo(numeroEn(c, i), crit.numero));
  }

  // Criterio de texto.
  if (tipo !== TEXTO) {
    return crit.comparador === '<>';
  }
  const valor = textoEn(c, i) ?? '';

  if (crit.patron && (crit.comparador === '=' || crit.comparador === '<>')) {
    const coincide = crit.patron.test(valor);
    return crit.comparador === '=' ? coincide : !coincide;
  }

  return comparaSegun(crit.comparador, compararTexto(valor, crit.texto ?? ''));
}

function signo(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

function comparaSegun(comparador: Comparador, orden: number): boolean {
  switch (comparador) {
    case '=': return orden === 0;
    case '<>': return orden !== 0;
    case '>': return orden > 0;
    case '>=': return orden >= 0;
    case '<': return orden < 0;
    case '<=': return orden <= 0;
  }
}
