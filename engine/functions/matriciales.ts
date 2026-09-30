/**
 * Funciones de **matrices dinámicas**: `FILTRAR`, `ORDENAR`, `ORDENARPOR`,
 * `UNICOS`, `SECUENCIA`, `TRANSPONER`, `MMULT` y `MINVERSA`.
 *
 * Devuelven una matriz, no un valor. El motor las admite **dentro de otra
 * función** que sepa consumir una matriz (`=SUMA(FILTRAR(…))`,
 * `=INDICE(ORDENAR(…); 1)`); una que quedara sola en la celda "derramaría"
 * sobre las de al lado, y eso va al modo compatible (ver
 * `compiler/usoMatricial.ts`, que explica por qué).
 *
 * **La forma es fija; el contenido, por iteración.** Un `FILTRAR` cuyo
 * criterio depende de la simulación deja pasar filas distintas en cada
 * iteración. La matriz resultante tiene siempre tantas filas como la de
 * partida: en cada iteración, las que pasan van **arriba, en orden**, y el
 * resto queda vacío. Así `SUMA`, `CONTARA`, `PROMEDIO` e `INDICE(…; 1)` dan lo
 * mismo que en Excel, porque las celdas vacías no cuentan en un rango. (Lo que
 * no daría lo mismo es contar las filas de la matriz: `FILAS(FILTRAR(…))` no
 * está soportado.)
 *
 * Las matrices van por columnas, como los rangos (`Argumento`): la celda de la
 * fila `f` y la columna `c` es `celdas[c * filas + f]`.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import { coercionLogica, coercionNumerica, compararEn } from '../values/coercion.ts';
import {
  crearConstructor, esInvariante, errorConstante, numeroConstante, numeroEn, tipoEn, valorEn, NUMERO,
  type Columna,
} from '../values/columna.ts';

export interface Matriz {
  filas: number;
  cols: number;
  celdas: Columna[];
}

export type ResultadoMatriz = { ok: true; matriz: Matriz } | { ok: false; motivo: string };

export const celda = (m: Matriz, f: number, c: number): Columna => m.celdas[c * m.filas + f] as Columna;

/** Una matriz 1×1 a partir de un valor suelto. */
export const escalar = (c: Columna): Matriz => ({ filas: 1, cols: 1, celdas: [c] });

export function transponer(m: Matriz): Matriz {
  const celdas: Columna[] = [];
  // La transpuesta tiene m.cols filas y m.filas columnas.
  for (let c = 0; c < m.filas; c++) for (let f = 0; f < m.cols; f++) celdas.push(celda(m, c, f));
  return { filas: m.cols, cols: m.filas, celdas };
}

function matrizDeError(e: ErrorExcel, n: number): Matriz {
  return escalar(errorConstante(e, n));
}

/** Constructores de todas las celdas de una matriz de forma dada. */
function constructores(filas: number, cols: number, n: number) {
  const b = Array.from({ length: filas * cols }, () => crearConstructor(n));
  return {
    poner: (f: number, c: number) => b[c * filas + f] as ReturnType<typeof crearConstructor>,
    terminar: (): Matriz => ({ filas, cols, celdas: b.map((x) => x.terminar()) }),
  };
}

/** Un número escalar de un argumento que tiene que ser constante (define la forma). */
function constanteEntera(m: Matriz | undefined, porOmision: number): number | null {
  if (!m) return porOmision;
  const c = celda(m, 0, 0);
  if (!esInvariante(c) && c.forma !== 'vector') return null;
  const v = coercionNumerica(c, 0);
  if (typeof v === 'string') return null;
  if (c.forma === 'vector') {
    for (let i = 1; i < c.datos.length; i++) if (c.datos[i] !== v) return null;
  }
  return Math.trunc(v);
}

/**
 * Reordena filas por iteración: `elegir(i)` devuelve, para la iteración `i`,
 * qué filas de `m` van a la salida y en qué orden (o un error). Las que
 * sobran quedan vacías; sin ninguna, `siVacio` o `#CALC!`.
 */
function reordenarFilas(
  m: Matriz,
  n: number,
  elegir: (i: number) => number[] | ErrorExcel,
  siVacio?: Matriz,
): Matriz {
  const out = constructores(m.filas, m.cols, n);
  for (let i = 0; i < n; i++) {
    const filas = elegir(i);
    if (typeof filas === 'string') {
      for (let f = 0; f < m.filas; f++) for (let c = 0; c < m.cols; c++) out.poner(f, c).ponerError(i, filas);
      continue;
    }
    if (filas.length === 0) {
      for (let f = 0; f < m.filas; f++) for (let c = 0; c < m.cols; c++) out.poner(f, c).ponerVacio(i);
      if (siVacio) out.poner(0, 0).ponerValor(i, valorEn(celda(siVacio, 0, 0), i));
      else out.poner(0, 0).ponerError(i, '#CALC!');
      continue;
    }
    filas.forEach((origen, destino) => {
      for (let c = 0; c < m.cols; c++) out.poner(destino, c).ponerValor(i, valorEn(celda(m, origen, c), i));
    });
    for (let f = filas.length; f < m.filas; f++) for (let c = 0; c < m.cols; c++) out.poner(f, c).ponerVacio(i);
  }
  return out.terminar();
}

/** `FILTRAR(matriz; incluir; [si_vacío])`. `incluir` es una columna (filtra filas) o una fila (filtra columnas). */
export function FILTER(args: Matriz[], n: number): ResultadoMatriz {
  const [m, incluir, siVacio] = args;
  if (!m || !incluir) return { ok: false, motivo: 'FILTRAR necesita una matriz y un criterio' };

  if (incluir.cols === 1 && incluir.filas === m.filas) {
    return {
      ok: true,
      matriz: reordenarFilas(m, n, (i) => {
        const pasan: number[] = [];
        for (let f = 0; f < m.filas; f++) {
          const v = coercionLogica(celda(incluir, f, 0), i);
          if (typeof v === 'string') return v;
          if (v) pasan.push(f);
        }
        return pasan;
      }, siVacio),
    };
  }
  if (incluir.filas === 1 && incluir.cols === m.cols) {
    const r = FILTER([transponer(m), transponer(incluir), ...(siVacio ? [siVacio] : [])], n);
    return r.ok ? { ok: true, matriz: transponer(r.matriz) } : r;
  }
  return { ok: true, matriz: matrizDeError('#VALUE!', n) };
}

/** Compara dos filas de `m` por las columnas y sentidos dados, en la iteración `i`. */
function compararFilas(claves: { m: Matriz; col: number; sentido: number }[], a: number, b: number, i: number): number {
  for (const k of claves) {
    const o = compararEn(celda(k.m, a, k.col), celda(k.m, b, k.col), i);
    const orden = typeof o === 'string' ? 0 : o;
    if (orden !== 0) return orden * k.sentido;
  }
  return a - b; // estable: a igualdad, el orden original
}

/** `ORDENAR(matriz; [índice]; [orden]; [por_columna])`. */
export function SORT(args: Matriz[], n: number): ResultadoMatriz {
  const [m, idx, orden, porCol] = args;
  if (!m) return { ok: false, motivo: 'ORDENAR necesita una matriz' };
  const indice = constanteEntera(idx, 1);
  const sentido = constanteEntera(orden, 1);
  const columnas = constanteEntera(porCol, 0);
  if (indice === null || sentido === null || columnas === null) {
    return { ok: false, motivo: 'ORDENAR: el índice, el orden y la dirección tienen que ser constantes' };
  }
  if (columnas) {
    const r = SORT([transponer(m), escalar(numeroConstante(indice, 1)), escalar(numeroConstante(sentido, 1))], n);
    return r.ok ? { ok: true, matriz: transponer(r.matriz) } : r;
  }
  if (indice < 1 || indice > m.cols || (sentido !== 1 && sentido !== -1)) return { ok: true, matriz: matrizDeError('#VALUE!', n) };
  const claves = [{ m, col: indice - 1, sentido }];
  return {
    ok: true,
    matriz: reordenarFilas(m, n, (i) => Array.from({ length: m.filas }, (_, f) => f).sort((a, b) => compararFilas(claves, a, b, i))),
  };
}

/** `ORDENARPOR(matriz; por_matriz1; [orden1]; …)`: las claves son columnas aparte, de la misma altura. */
export function SORTBY(args: Matriz[], n: number): ResultadoMatriz {
  const [m, ...resto] = args;
  if (!m || resto.length === 0) return { ok: false, motivo: 'ORDENARPOR necesita una matriz y al menos un criterio' };
  const claves: { m: Matriz; col: number; sentido: number }[] = [];
  for (let k = 0; k < resto.length; k += 2) {
    const por = resto[k] as Matriz;
    const sentido = constanteEntera(resto[k + 1], 1);
    if (sentido === null) return { ok: false, motivo: 'ORDENARPOR: el orden tiene que ser constante' };
    if (por.cols !== 1 || por.filas !== m.filas || (sentido !== 1 && sentido !== -1)) {
      return { ok: true, matriz: matrizDeError('#VALUE!', n) };
    }
    claves.push({ m: por, col: 0, sentido });
  }
  return {
    ok: true,
    matriz: reordenarFilas(m, n, (i) => Array.from({ length: m.filas }, (_, f) => f).sort((a, b) => compararFilas(claves, a, b, i))),
  };
}

/** `UNICOS(matriz; [por_columna]; [exactamente_una_vez])`. Iguales = mismo valor en todas las columnas, sin distinguir mayúsculas. */
export function UNIQUE(args: Matriz[], n: number): ResultadoMatriz {
  const [m, porCol, unaVez] = args;
  if (!m) return { ok: false, motivo: 'UNICOS necesita una matriz' };
  const columnas = constanteEntera(porCol, 0);
  const soloUna = constanteEntera(unaVez, 0);
  if (columnas === null || soloUna === null) return { ok: false, motivo: 'UNICOS: los argumentos opcionales tienen que ser constantes' };
  if (columnas) {
    const r = UNIQUE([transponer(m), escalar(numeroConstante(0, 1)), escalar(numeroConstante(soloUna, 1))], n);
    return r.ok ? { ok: true, matriz: transponer(r.matriz) } : r;
  }
  const iguales = (a: number, b: number, i: number) => {
    for (let c = 0; c < m.cols; c++) if (compararEn(celda(m, a, c), celda(m, b, c), i) !== 0) return false;
    return true;
  };
  return {
    ok: true,
    matriz: reordenarFilas(m, n, (i) => {
      const grupos: { primera: number; veces: number }[] = [];
      for (let f = 0; f < m.filas; f++) {
        const g = grupos.find((x) => iguales(x.primera, f, i));
        if (g) g.veces++;
        else grupos.push({ primera: f, veces: 1 });
      }
      return grupos.filter((g) => !soloUna || g.veces === 1).map((g) => g.primera);
    }),
  };
}

/** `SECUENCIA(filas; [columnas]; [inicio]; [paso])`. La forma tiene que ser constante; inicio y paso pueden variar. */
export function SEQUENCE(args: Matriz[], n: number): ResultadoMatriz {
  const filas = constanteEntera(args[0], 1);
  const cols = constanteEntera(args[1], 1);
  if (filas === null || cols === null) return { ok: false, motivo: 'SECUENCIA: el número de filas y de columnas tiene que ser constante' };
  if (filas < 1 || cols < 1) return { ok: true, matriz: matrizDeError('#CALC!', n) };
  const inicio = args[2] ? celda(args[2], 0, 0) : numeroConstante(1, n);
  const paso = args[3] ? celda(args[3], 0, 0) : numeroConstante(1, n);
  const out = constructores(filas, cols, n);
  for (let i = 0; i < n; i++) {
    const a = coercionNumerica(inicio, esInvariante(inicio) ? 0 : i);
    const p = coercionNumerica(paso, esInvariante(paso) ? 0 : i);
    for (let f = 0; f < filas; f++) {
      for (let c = 0; c < cols; c++) {
        if (typeof a === 'string') out.poner(f, c).ponerError(i, a);
        else if (typeof p === 'string') out.poner(f, c).ponerError(i, p);
        else out.poner(f, c).ponerNumero(i, a + p * (f * cols + c));
      }
    }
  }
  return { ok: true, matriz: out.terminar() };
}

export function TRANSPOSE(args: Matriz[]): ResultadoMatriz {
  const [m] = args;
  return m ? { ok: true, matriz: transponer(m) } : { ok: false, motivo: 'TRANSPONER necesita una matriz' };
}

/** Lee una matriz numérica en la iteración `i`, o el primer error. Un texto o un vacío es #¡VALOR!. */
function numeros(m: Matriz, i: number): number[][] | ErrorExcel {
  const out: number[][] = [];
  for (let f = 0; f < m.filas; f++) {
    const fila: number[] = [];
    for (let c = 0; c < m.cols; c++) {
      const x = celda(m, f, c);
      const t = tipoEn(x, i);
      if (t === 4) return (valorEn(x, i) as { error: ErrorExcel }).error;
      if (t !== NUMERO) return '#VALUE!';
      fila.push(numeroEn(x, i));
    }
    out.push(fila);
  }
  return out;
}

/** `MMULT(a; b)`: producto de matrices; las columnas de `a` tienen que ser las filas de `b`. */
export function MMULT(args: Matriz[], n: number): ResultadoMatriz {
  const [a, b] = args;
  if (!a || !b) return { ok: false, motivo: 'MMULT necesita dos matrices' };
  if (a.cols !== b.filas) return { ok: true, matriz: matrizDeError('#VALUE!', n) };
  const out = constructores(a.filas, b.cols, n);
  for (let i = 0; i < n; i++) {
    const x = numeros(a, i);
    const y = numeros(b, i);
    for (let f = 0; f < a.filas; f++) {
      for (let c = 0; c < b.cols; c++) {
        if (typeof x === 'string') { out.poner(f, c).ponerError(i, x); continue; }
        if (typeof y === 'string') { out.poner(f, c).ponerError(i, y); continue; }
        let s = 0;
        for (let k = 0; k < a.cols; k++) s += (x[f] as number[])[k] as number * ((y[k] as number[])[c] as number);
        out.poner(f, c).ponerNumero(i, s);
      }
    }
  }
  return { ok: true, matriz: out.terminar() };
}

/** `MINVERSA(a)`: inversa de una matriz cuadrada (Gauss-Jordan con pivoteo). Singular: #¡NUM!. */
export function MINVERSE(args: Matriz[], n: number): ResultadoMatriz {
  const [a] = args;
  if (!a) return { ok: false, motivo: 'MINVERSA necesita una matriz' };
  if (a.filas !== a.cols) return { ok: true, matriz: matrizDeError('#VALUE!', n) };
  const k = a.filas;
  const out = constructores(k, k, n);
  for (let i = 0; i < n; i++) {
    const x = numeros(a, i);
    const inv = typeof x === 'string' ? x : invertir(x);
    for (let f = 0; f < k; f++) {
      for (let c = 0; c < k; c++) {
        if (typeof inv === 'string') out.poner(f, c).ponerError(i, inv);
        else out.poner(f, c).ponerNumero(i, (inv[f] as number[])[c] as number);
      }
    }
  }
  return { ok: true, matriz: out.terminar() };
}

function invertir(m: number[][]): number[][] | ErrorExcel {
  const k = m.length;
  const A = m.map((fila, f) => [...fila, ...Array.from({ length: k }, (_, c) => (c === f ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let f = c + 1; f < k; f++) if (Math.abs((A[f] as number[])[c] as number) > Math.abs((A[piv] as number[])[c] as number)) piv = f;
    if (Math.abs((A[piv] as number[])[c] as number) < 1e-12) return '#NUM!';
    [A[c], A[piv]] = [A[piv] as number[], A[c] as number[]];
    const fc = A[c] as number[];
    const p = fc[c] as number;
    for (let j = 0; j < 2 * k; j++) fc[j] = (fc[j] as number) / p;
    for (let f = 0; f < k; f++) {
      if (f === c) continue;
      const fila = A[f] as number[];
      const factor = fila[c] as number;
      for (let j = 0; j < 2 * k; j++) fila[j] = (fila[j] as number) - factor * (fc[j] as number);
    }
  }
  return A.map((fila) => fila.slice(k));
}

export type FuncionMatricial = (args: Matriz[], n: number) => ResultadoMatriz;

export const REGISTRO_MATRICIAL: Record<string, FuncionMatricial> = {
  FILTER, SORT, SORTBY, UNIQUE, SEQUENCE, TRANSPOSE, MMULT, MINVERSE,
};
