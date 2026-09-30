/**
 * Salidas de texto y de sí/no (T2, T6): con qué frecuencia sale cada valor.
 *
 * Una salida que devuelve un texto («Norte») o un lógico (VERDADERO) no tiene
 * media ni percentiles, pero sí frecuencias. Aquí se cuentan en cada bloque y
 * se juntan después; los números de la misma salida siguen su camino de
 * siempre (Welford y t-digest). Los lógicos cuentan en los dos sitios: como
 * 1/0 (su media es la probabilidad de VERDADERO) y como categoría.
 */

import { regionalActual } from '../values/regional.ts';
import { LOGICO, TEXTO, tipoEn, numeroEn, textoEn, type Columna } from '../values/columna.ts';

/** Más categorías distintas no caben en una tabla: el resto se agrupa. */
export const MAXIMO_CATEGORIAS_SALIDA = 200;
export const OTRAS_CATEGORIAS = '(otros)';

export interface RecuentoCategorias {
  /** Valor → iteraciones en que salió. */
  conteos: Record<string, number>;
  /** El valor de cada iteración retenida (null si fue un número o un error). */
  muestra?: (string | null)[];
}

/** El texto de la posición `i` si es un texto o un lógico; `null` si no. */
function categoriaEn(c: Columna, i: number): string | null {
  const tipo = tipoEn(c, i);
  if (tipo === TEXTO) return textoEn(c, i) ?? '';
  if (tipo === LOGICO) {
    const r = regionalActual();
    return numeroEn(c, i) !== 0 ? r.verdadero : r.falso;
  }
  return null;
}

/**
 * Cuenta los textos y lógicos de una columna. `undefined` si no hay ninguno
 * (el caso de siempre: una salida numérica no paga más que un recorrido de
 * tipos, y uno numérico puro ni eso).
 */
export function contarCategorias(c: Columna, n: number, retener: number): RecuentoCategorias | undefined {
  if (c.forma === 'vector' && c.tipo !== LOGICO) return undefined;
  if (c.forma === 'constante' && c.valor.tipo !== TEXTO && c.valor.tipo !== LOGICO) return undefined;

  const conteos: Record<string, number> = {};
  let distintas = 0;
  let alguna = false;
  const muestra = retener > 0 ? new Array<string | null>(retener).fill(null) : undefined;
  for (let i = 0; i < n; i++) {
    let cat = categoriaEn(c, i);
    if (cat === null) continue;
    alguna = true;
    if (!(cat in conteos)) {
      if (distintas >= MAXIMO_CATEGORIAS_SALIDA) cat = OTRAS_CATEGORIAS;
      else distintas++;
    }
    conteos[cat] = (conteos[cat] ?? 0) + 1;
    if (muestra && i < retener) muestra[i] = cat;
  }
  return alguna ? { conteos, ...(muestra ? { muestra } : {}) } : undefined;
}

/** Suma los recuentos de dos bloques (respetando el tope de categorías). */
export function sumarConteos(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  let distintas = Object.keys(out).length;
  for (const [k, v] of Object.entries(b)) {
    let clave = k;
    if (!(clave in out)) {
      if (distintas >= MAXIMO_CATEGORIAS_SALIDA) clave = OTRAS_CATEGORIAS;
      else distintas++;
    }
    out[clave] = (out[clave] ?? 0) + v;
  }
  return out;
}
