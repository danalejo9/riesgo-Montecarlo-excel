/**
 * Andamiaje para las funciones que operan valor a valor sobre números.
 *
 * Toda función numérica del registro tiene la misma estructura: intentar el
 * camino rápido —si los argumentos ya son vectores numéricos puros, recorrer
 * los `Float64Array` en un bucle plano, igual que antes de que existiera el
 * canal de valores— y caer al general solo cuando hay texto, vacíos o errores
 * de por medio. Estaba escrito dos veces dentro de `math.ts`; vive aquí para
 * que `fechas.ts` y las que vengan lo reutilicen en vez de copiarlo.
 *
 * El camino rápido se rehace desde el principio en cuanto una operación
 * devuelve un error (`RAIZ` de un negativo, una división por cero). Repetir el
 * bucle es más barato que comprobar en cada iteración si hay que cambiar de
 * representación, y los errores son la excepción, no la regla.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import { coercionNumerica } from '../values/coercion.ts';
import {
  comoVectorNumerico,
  crearConstructor,
  numeroConstante,
  vectorNumerico,
  type Columna,
} from '../values/columna.ts';
import type { Argumento } from './types.ts';

/** Resultado de una operación elemental: un número o el error de Excel. */
export type Resultado = number | ErrorExcel;

/** Un argumento numérico. `f` recibe un valor por iteración. */
export function mapaNumerico(
  arg: Argumento | undefined,
  n: number,
  f: (x: number) => Resultado,
): Columna {
  const c = arg?.columnas[0];
  if (!c) return numeroConstante(0, n);

  const rapido = comoVectorNumerico(c);
  if (rapido) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const r = f(rapido[i] as number);
      if (typeof r === 'string') return general([c], n, (v) => f(v[0] as number));
      out[i] = r;
    }
    return vectorNumerico(out);
  }
  return general([c], n, (v) => f(v[0] as number));
}

/** Dos argumentos numéricos. */
export function zipNumerico(
  a: Argumento | undefined,
  b: Argumento | undefined,
  n: number,
  f: (x: number, y: number) => Resultado,
): Columna {
  const ca = a?.columnas[0];
  const cb = b?.columnas[0];
  if (!ca || !cb) return numeroConstante(0, n);

  const ra = comoVectorNumerico(ca);
  const rb = comoVectorNumerico(cb);
  if (ra && rb) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const r = f(ra[i] as number, rb[i] as number);
      if (typeof r === 'string') return general([ca, cb], n, (v) => f(v[0] as number, v[1] as number));
      out[i] = r;
    }
    return vectorNumerico(out);
  }
  return general([ca, cb], n, (v) => f(v[0] as number, v[1] as number));
}

/** Tres o más argumentos numéricos, sin camino rápido: son poco frecuentes. */
export function nAriaNumerica(
  args: readonly (Argumento | undefined)[],
  n: number,
  f: (valores: readonly number[]) => Resultado,
): Columna {
  const columnas: Columna[] = [];
  for (const a of args) {
    const c = a?.columnas[0];
    if (!c) return numeroConstante(0, n);
    columnas.push(c);
  }
  return general(columnas, n, f);
}

/**
 * Camino general: coacciona cada argumento con las reglas de Excel y propaga
 * el primer error que aparezca, que es lo que hace una fórmula real.
 */
function general(
  columnas: readonly Columna[],
  n: number,
  f: (valores: readonly number[]) => Resultado,
): Columna {
  const salida = crearConstructor(n);
  const valores = new Array<number>(columnas.length);

  for (let i = 0; i < n; i++) {
    let error: ErrorExcel | undefined;
    for (let j = 0; j < columnas.length; j++) {
      const v = coercionNumerica(columnas[j] as Columna, i);
      if (typeof v === 'string') {
        error = v;
        break;
      }
      valores[j] = v;
    }

    if (error) {
      salida.ponerError(i, error);
      continue;
    }
    const r = f(valores);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}
