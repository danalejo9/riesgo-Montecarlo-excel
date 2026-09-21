/**
 * Lógica y control de flujo (catálogo Nivel 0 de Fase 2 §4.2).
 *
 * Con el canal de valores, `SI` deja de ser una operación sobre números: cada
 * rama conserva su propio tipo, así que `SI(A1>10;"mayor";"menor")` devuelve
 * de verdad un texto (caso L0-040 del libro de fidelidad) y
 * `SI.ERROR(10/0;"sin datos")` devuelve de verdad "sin datos" (caso L0-022).
 * Antes ambos eran imposibles de representar.
 *
 * `Y`/`O`/`O.EXCL` siguen las reglas de contexto de Excel igual que las
 * agregaciones: dentro de un rango, el texto y las celdas vacías se ignoran;
 * sueltos, un texto que no sea "VERDADERO"/"FALSO" es `#¡VALOR!`. Si no queda
 * ningún valor lógico que evaluar, el resultado es `#¡VALOR!`, no VERDADERO.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import { coercionLogica } from '../values/coercion.ts';
import {
  comoVectorNumerico,
  crearConstructor,
  errorEn,
  logicoConstante,
  numeroEn,
  textoEn,
  tipoEn,
  valorEn,
  vectorLogico,
  vectorNumerico,
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
  type Columna,
} from '../values/columna.ts';
import type { Argumento } from './types.ts';

/**
 * `SI(condición; si_verdadero; [si_falso])`.
 *
 * Omitir `si_falso` devuelve FALSO —el valor lógico, no un cero—, que es lo
 * que hace Excel.
 */
export function IF(args: Argumento[], n: number): Columna {
  const cond = args[0]?.columnas[0];
  const siV = args[1]?.columnas[0];
  const siF = args[2]?.columnas[0];
  if (!cond || !siV) return logicoConstante(false, n);

  // Camino rápido: condición y ramas numéricas, sin errores posibles.
  const rc = condicionRapida(cond);
  const rv = comoVectorNumerico(siV);
  const rf = siF ? comoVectorNumerico(siF) : null;
  if (rc && rv && (rf || !siF)) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = rc[i] !== 0 ? (rv[i] as number) : rf ? (rf[i] as number) : 0;
    }
    // Sin rama falsa, las iteraciones que no cumplen valen FALSO, que no es un
    // 0 numérico; ese caso sale por el camino general.
    if (rf || todasVerdaderas(rc, n)) return vectorNumerico(out);
  }

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const c = coercionLogica(cond, i);
    if (typeof c === 'string') {
      salida.ponerError(i, c);
      continue;
    }
    if (c) salida.ponerValor(i, valorEn(siV, i));
    else if (siF) salida.ponerValor(i, valorEn(siF, i));
    else salida.ponerLogico(i, false);
  }
  return salida.terminar();
}

/** El array subyacente si la columna sirve como condición sin coerción cara. */
function condicionRapida(c: Columna): Float64Array | null {
  return c.forma === 'vector' ? c.datos : null;
}

function todasVerdaderas(v: Float64Array, n: number): boolean {
  for (let i = 0; i < n; i++) if (v[i] === 0) return false;
  return true;
}

/**
 * `SI.ERROR(valor; valor_si_error)`: sustituye cualquier error por el segundo
 * argumento, conservando su tipo —que puede ser texto.
 */
export function IFERROR(args: Argumento[], n: number): Columna {
  return sustituirSi(args, n, (c, i) => tipoEn(c, i) === ERROR);
}

/** `SI.ND(valor; valor_si_nd)`: solo sustituye `#N/A`, no cualquier error. */
export function IFNA(args: Argumento[], n: number): Columna {
  return sustituirSi(args, n, (c, i) => tipoEn(c, i) === ERROR && errorEn(c, i) === '#N/A');
}

function sustituirSi(
  args: Argumento[],
  n: number,
  hayQueSustituir: (c: Columna, i: number) => boolean,
): Columna {
  const valor = args[0]?.columnas[0];
  const alterno = args[1]?.columnas[0];
  if (!valor) return logicoConstante(false, n);

  // Si la columna ya es numérica pura no puede contener errores: nada que hacer.
  if (comoVectorNumerico(valor)) return valor;

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    if (hayQueSustituir(valor, i)) {
      if (alterno) salida.ponerValor(i, valorEn(alterno, i));
      else salida.ponerVacio(i);
    } else {
      salida.ponerValor(i, valorEn(valor, i));
    }
  }
  return salida.terminar();
}

// --- Y / O / O.EXCL / NO -------------------------------------------------

type Combinacion = (acumulado: boolean, valor: boolean) => boolean;

function reducirLogico(
  args: Argumento[],
  n: number,
  inicial: boolean,
  combinar: Combinacion,
): Columna {
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    let acc = inicial;
    let vistos = 0;
    let error: ErrorExcel | undefined;

    for (const arg of args) {
      if (error) break;
      for (const c of arg.columnas) {
        const v = valorLogico(c, i, arg.esRango);
        if (v === undefined) continue; // ignorado por contexto (vacío, texto en rango)
        if (typeof v === 'string') {
          error = v;
          break;
        }
        acc = combinar(acc, v);
        vistos++;
      }
    }

    if (error) salida.ponerError(i, error);
    else if (vistos === 0) salida.ponerError(i, '#VALUE!'); // Excel: sin valores lógicos
    else salida.ponerLogico(i, acc);
  }
  return salida.terminar();
}

/** `undefined` = no participa; `string` = error; `boolean` = valor lógico. */
function valorLogico(c: Columna, i: number, esRango: boolean): boolean | ErrorExcel | undefined {
  switch (tipoEn(c, i)) {
    case NUMERO:
    case LOGICO:
      return numeroEn(c, i) !== 0;
    case ERROR:
      return errorEn(c, i) ?? '#VALUE!';
    case VACIO:
      return undefined;
    case TEXTO: {
      if (esRango) return undefined;
      const t = (textoEn(c, i) ?? '').trim().toUpperCase();
      if (t === 'TRUE' || t === 'VERDADERO') return true;
      if (t === 'FALSE' || t === 'FALSO') return false;
      return '#VALUE!';
    }
  }
}

export function AND(args: Argumento[], n: number): Columna {
  return reducirLogico(args, n, true, (a, x) => a && x);
}

export function OR(args: Argumento[], n: number): Columna {
  return reducirLogico(args, n, false, (a, x) => a || x);
}

export function XOR(args: Argumento[], n: number): Columna {
  return reducirLogico(args, n, false, (a, x) => (x ? !a : a));
}

export function NOT(args: Argumento[], n: number): Columna {
  const c = args[0]?.columnas[0];
  if (!c) return logicoConstante(true, n);

  const rapido = comoVectorNumerico(c);
  if (rapido) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = rapido[i] === 0 ? 1 : 0;
    return vectorLogico(out);
  }

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const v = coercionLogica(c, i);
    if (typeof v === 'string') salida.ponerError(i, v);
    else salida.ponerLogico(i, !v);
  }
  return salida.terminar();
}

/** `VERDADERO()` y `FALSO()`, que en Excel son funciones sin argumentos. */
export function TRUE(_args: Argumento[], n: number): Columna {
  return logicoConstante(true, n);
}

export function FALSE(_args: Argumento[], n: number): Columna {
  return logicoConstante(false, n);
}
