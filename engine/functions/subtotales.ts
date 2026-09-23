/**
 * `SUBTOTALES` y `AGREGAR`: agregados que **no cuentan dos veces**.
 *
 * Su razón de ser en Excel es un patrón que está en casi todos los
 * presupuestos: una columna con subtotales intermedios por capítulo y, abajo,
 * un total general que abarca la columna entera. Si el total general fuera una
 * `SUMA`, contaría cada partida dos veces —una por sí misma y otra dentro de su
 * subtotal—. `SUBTOTALES` ignora las celdas del rango que son a su vez un
 * `SUBTOTALES` o un `AGREGAR`, y por eso el total sale bien.
 *
 * Implementarlas sin esa exclusión sería peor que no implementarlas: el total
 * saldría **el doble de lo correcto, sin ningún aviso**, que es la clase de
 * error que un análisis de riesgo no puede permitirse.
 *
 * ---
 *
 * **Cómo se sabe qué celda es un subtotal.** Una función recibe los valores de
 * su rango, no las fórmulas de las celdas. Así que cada columna que produce
 * `SUBTOTALES` o `AGREGAR` se apunta en un `WeakSet`, y al leer un rango se
 * saltan las columnas apuntadas. La marca viaja con la columna por referencia,
 * que es como el evaluador pasa los valores de una celda a quien la usa. El
 * único sitio donde la columna se sustituye por otra —el ejecutor, al difundir
 * una constante a `n` iteraciones— hereda la marca explícitamente
 * (`heredarMarcaSubtotal`).
 *
 * Un `WeakSet` y no una propiedad en `Columna` para no tocar el tipo central
 * del motor por algo que solo les importa a dos funciones; y "weak" para que
 * no retenga en memoria columnas que ya nadie usa.
 *
 * **Lo que no se puede reproducir: las filas ocultas.** Los códigos 101–111 de
 * `SUBTOTALES` y varias opciones de `AGREGAR` ignoran las filas ocultas a mano,
 * y el lector del libro no sabe qué filas están ocultas. Aquí se tratan como
 * sus equivalentes sin ocultación (109 como 9), que da el mismo resultado
 * **mientras no haya filas ocultas** en el rango. Es un caso raro en un modelo
 * de riesgo y queda documentado aquí y en el handoff.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import {
  crearConstructor,
  errorEn,
  esInvariante,
  numeroEn,
  tipoEn,
  ERROR,
  NUMERO,
  VACIO,
  type Columna,
} from '../values/columna.ts';
import { coercionNumerica } from '../values/coercion.ts';
import {
  AVERAGE, COUNT, COUNTA, MAX, MIN, PRODUCT, STDEV_P, STDEV_S, SUM, VAR_P, VAR_S,
} from './math.ts';
import type { Argumento, FuncionExcel } from './types.ts';

/** Las columnas que ha producido un `SUBTOTALES` o un `AGREGAR`. */
const DE_SUBTOTAL = new WeakSet<Columna>();

function marcar(c: Columna): Columna {
  DE_SUBTOTAL.add(c);
  return c;
}

/**
 * Si `origen` venía de un subtotal, `destino` también. Lo usa el ejecutor
 * cuando difunde una constante: la columna difundida es otro objeto y, sin
 * esto, un total general que lea un subtotal constante lo contaría dos veces.
 */
export function heredarMarcaSubtotal(origen: Columna, destino: Columna): void {
  if (DE_SUBTOTAL.has(origen)) DE_SUBTOTAL.add(destino);
}

/** Los argumentos sin las celdas que son a su vez un subtotal. */
function sinSubtotales(args: readonly Argumento[]): Argumento[] {
  return args.map((a) =>
    a.esRango ? { ...a, columnas: a.columnas.filter((c) => !DE_SUBTOTAL.has(c)), forma: undefined } : a,
  );
}

function todoError(e: ErrorExcel, n: number): Columna {
  const b = crearConstructor(n);
  for (let i = 0; i < n; i++) b.ponerError(i, e);
  return b.terminar();
}

/**
 * El código de función, que tiene que ser el mismo en todas las iteraciones.
 * Un código que cambiara con la simulación no tiene sentido en ningún modelo
 * real, y aceptarlo obligaría a despachar una función distinta por iteración.
 */
function codigoFijo(arg: Argumento | undefined): number | ErrorExcel {
  const c = arg?.columnas[0];
  if (!c) return '#VALUE!';
  if (!esInvariante(c)) return '#VALUE!';
  const v = coercionNumerica(c, 0);
  return typeof v === 'string' ? v : Math.trunc(v);
}

// --- SUBTOTALES ------------------------------------------------------------

const FUNCIONES_SUBTOTAL: Record<number, FuncionExcel> = {
  1: AVERAGE, 2: COUNT, 3: COUNTA, 4: MAX, 5: MIN, 6: PRODUCT,
  7: STDEV_S, 8: STDEV_P, 9: SUM, 10: VAR_S, 11: VAR_P,
};

/**
 * `SUBTOTALES(función; ref1; …)`. Delega en la función de agregación del
 * registro —así las dos no pueden discrepar en cómo tratan un texto o un
 * vacío— después de quitar del rango las celdas que ya son subtotales.
 *
 * Los errores del rango se propagan, igual que en la función base. Quien
 * quiera ignorarlos tiene `AGREGAR`, que existe precisamente para eso.
 */
export function SUBTOTAL(args: Argumento[], n: number): Columna {
  const codigo = codigoFijo(args[0]);
  if (typeof codigo === 'string') return todoError(codigo, n);

  // 101–111 son los mismos, ignorando filas ocultas. Ver el docstring.
  const base = codigo > 100 ? codigo - 100 : codigo;
  const f = FUNCIONES_SUBTOTAL[base];
  if (!f || args.length < 2) return todoError('#VALUE!', n);

  return marcar(f(sinSubtotales(args.slice(1)), n));
}

// --- AGREGAR -----------------------------------------------------------------

/**
 * `AGREGAR(función; opciones; ref1; …)` y su forma con k
 * (`AGREGAR(14; opciones; rango; k)`).
 *
 * Es `SUBTOTALES` con dos añadidos que importan: **puede ignorar errores**
 * —un rango con un `#¡DIV/0!` suelto sigue sumando—, y tiene diecinueve
 * funciones en vez de once, incluidos percentiles y k-ésimos.
 *
 * Las opciones son un campo de bits mal disimulado:
 *
 * | opción | ignora subtotales | ignora filas ocultas | ignora errores |
 * |-------:|:-----------------:|:--------------------:|:--------------:|
 * |      0 |         sí        |                      |                |
 * |      1 |         sí        |          sí          |                |
 * |      2 |         sí        |                      |       sí       |
 * |      3 |         sí        |          sí          |       sí       |
 * |      4 |                   |                      |                |
 * |      5 |                   |          sí          |                |
 * |      6 |                   |                      |       sí       |
 * |      7 |                   |          sí          |       sí       |
 *
 * Como ignorar errores cambia **qué valores entran en cada iteración**, aquí no
 * se delega en el registro: se recogen los números de cada iteración y se
 * calcula directamente.
 */
export function AGGREGATE(args: Argumento[], n: number): Columna {
  const codigo = codigoFijo(args[0]);
  if (typeof codigo === 'string') return todoError(codigo, n);
  const opciones = codigoFijo(args[1]);
  if (typeof opciones === 'string') return todoError(opciones, n);
  if (opciones < 0 || opciones > 7) return todoError('#VALUE!', n);

  const calcular = FUNCIONES_AGREGAR[codigo];
  if (!calcular) return todoError('#VALUE!', n);

  const ignorarSubtotales = opciones <= 3;
  const ignorarErrores = opciones === 2 || opciones === 3 || opciones === 6 || opciones === 7;

  // Las funciones 14–19 tienen un último argumento escalar, la k.
  const conK = codigo >= 14;
  const refs = conK ? args.slice(2, -1) : args.slice(2);
  const colK = conK ? args[args.length - 1]?.columnas[0] : undefined;
  if (refs.length === 0 || (conK && !colK)) return todoError('#VALUE!', n);

  const celdas = (ignorarSubtotales ? sinSubtotales(refs) : refs).flatMap((a) =>
    a.columnas.map((c) => ({ c, deRango: a.esRango })),
  );

  const salida = crearConstructor(n);
  const numeros: number[] = [];

  for (let i = 0; i < n; i++) {
    numeros.length = 0;
    let noVacias = 0;
    let fallo: ErrorExcel | undefined;

    for (const { c, deRango } of celdas) {
      const tipo = tipoEn(c, i);
      if (tipo === ERROR) {
        if (ignorarErrores) continue;
        fallo = errorEn(c, i) ?? '#VALUE!';
        break;
      }
      if (tipo !== VACIO) noVacias++;
      // Dentro de un rango solo cuentan los números, como en `SUMA`; un
      // argumento suelto se convierte si puede (el `"5"` escrito a mano).
      if (tipo === NUMERO) numeros.push(numeroEn(c, i));
      else if (!deRango && tipo !== VACIO) {
        const v = coercionNumerica(c, i);
        if (typeof v === 'number') numeros.push(v);
      }
    }

    if (fallo) {
      salida.ponerError(i, fallo);
      continue;
    }

    let k = 0;
    if (colK) {
      const v = coercionNumerica(colK, i);
      if (typeof v === 'string') {
        salida.ponerError(i, v);
        continue;
      }
      k = v;
    }

    const r = calcular(numeros, noVacias, k);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }

  return marcar(salida.terminar());
}

type Calculo = (numeros: number[], noVacias: number, k: number) => number | ErrorExcel;

const suma = (v: number[]) => v.reduce((a, x) => a + x, 0);
const media = (v: number[]) => suma(v) / v.length;

function varianza(v: number[], muestral: boolean): number | ErrorExcel {
  const grados = muestral ? v.length - 1 : v.length;
  if (grados <= 0) return '#DIV/0!';
  const m = media(v);
  return v.reduce((a, x) => a + (x - m) ** 2, 0) / grados;
}

function raiz(v: number | ErrorExcel): number | ErrorExcel {
  return typeof v === 'string' ? v : Math.sqrt(v);
}

const ordenados = (v: number[]) => [...v].sort((a, b) => a - b);

/** Percentil inclusivo, con la misma interpolación que `PERCENTIL` del registro. */
function percentilInc(v: number[], p: number): number | ErrorExcel {
  if (v.length === 0 || p < 0 || p > 1) return '#NUM!';
  const o = ordenados(v);
  const pos = p * (o.length - 1);
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  return (o[bajo] as number) + (pos - bajo) * ((o[alto] as number) - (o[bajo] as number));
}

/**
 * Percentil exclusivo (`PERCENTIL.EXC`): la posición es `p·(n+1)` y tiene que
 * caer dentro de los datos; si no, `#¡NUM!`. Con pocos datos, los extremos no
 * son alcanzables, que es justo la diferencia con el inclusivo.
 */
function percentilExc(v: number[], p: number): number | ErrorExcel {
  const o = ordenados(v);
  const pos = p * (o.length + 1);
  if (o.length === 0 || pos < 1 || pos > o.length) return '#NUM!';
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  const vb = o[bajo - 1] as number;
  return vb + (pos - bajo) * ((o[alto - 1] as number) - vb);
}

/**
 * La moda: el número más repetido. Sin repetidos, `#N/A`.
 *
 * Con empate, **el que aparece antes en los datos**, que es lo que documenta
 * Excel. No es lo mismo que "el primero que llega al máximo al recorrer": con
 * 3, 5, 5, 3 el 5 llega antes a dos apariciones, pero la moda es el 3. La
 * primera versión de esto devolvía el 5, y lo cazó su propio test.
 */
function moda(v: number[]): number | ErrorExcel {
  const cuenta = new Map<number, number>();
  let maximo = 1;
  for (const x of v) {
    const c = (cuenta.get(x) ?? 0) + 1;
    cuenta.set(x, c);
    if (c > maximo) maximo = c;
  }
  if (maximo === 1) return '#N/A';
  for (const x of v) if (cuenta.get(x) === maximo) return x;
  return '#N/A';
}

const FUNCIONES_AGREGAR: Record<number, Calculo> = {
  1: (v) => (v.length === 0 ? '#DIV/0!' : media(v)),
  2: (v) => v.length,
  3: (_v, noVacias) => noVacias,
  4: (v) => (v.length === 0 ? 0 : Math.max(...v)),
  5: (v) => (v.length === 0 ? 0 : Math.min(...v)),
  6: (v) => (v.length === 0 ? 0 : v.reduce((a, x) => a * x, 1)),
  7: (v) => raiz(varianza(v, true)),
  8: (v) => raiz(varianza(v, false)),
  9: (v) => suma(v),
  10: (v) => varianza(v, true),
  11: (v) => varianza(v, false),
  12: (v) => (v.length === 0 ? '#NUM!' : percentilInc(v, 0.5)),
  13: moda,
  14: (v, _nv, k) => {
    const ki = Math.trunc(k);
    return ki < 1 || ki > v.length ? '#NUM!' : (ordenados(v)[v.length - ki] as number);
  },
  15: (v, _nv, k) => {
    const ki = Math.trunc(k);
    return ki < 1 || ki > v.length ? '#NUM!' : (ordenados(v)[ki - 1] as number);
  },
  16: (v, _nv, k) => percentilInc(v, k),
  17: (v, _nv, k) => {
    const q = Math.trunc(k);
    return q < 0 || q > 4 ? '#NUM!' : percentilInc(v, q / 4);
  },
  18: (v, _nv, k) => percentilExc(v, k),
  19: (v, _nv, k) => {
    const q = Math.trunc(k);
    return q < 1 || q > 3 ? '#NUM!' : percentilExc(v, q / 4);
  },
};
