/**
 * Aritmética y agregación (catálogo Nivel 0 de Fase 2 §4.2).
 *
 * Tres funciones se comportan distinto de lo que su equivalente de JavaScript
 * sugiere, y equivocarlas produce números silenciosamente incorrectos —
 * exactamente la clase de error que el motor heredado cometía con PERT:
 *
 *   - `ROUND` redondea alejándose de cero. `Math.round` redondea hacia
 *     +Infinito, así que `ROUND(-2,5;0)` debe dar -3 y `Math.round(-2.5)` da -2.
 *   - `MOD` toma el signo del **divisor**, no el del dividendo: `MOD(-7;3)` es
 *     2 en Excel y `-7 % 3` en JavaScript es -1.
 *   - `TRUNC`/`ROUNDDOWN` truncan hacia cero; `INT` redondea hacia -Infinito.
 *     Para negativos difieren: `INT(-2,5)=-3` pero `TRUNC(-2,5)=-2`.
 *
 * **Rendimiento.** Cada función intenta primero el camino rápido: si todos sus
 * argumentos son columnas puramente numéricas —el caso dominante— recorre los
 * `Float64Array` en un bucle plano, igual que antes de que existiera el canal
 * de valores. Solo cuando hay texto, vacíos o errores de por medio se pasa al
 * camino general, que consulta el tipo de cada valor. Qué valores participan
 * en una agregación lo decide `agregacion.ts`, no cada función por su cuenta.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import { coercionNumerica } from '../values/coercion.ts';
import {
  crearConstructor,
  errorEn,
  numeroConstante,
  numeroEn,
  textoEn,
  tipoEn,
  vectorNumerico,
  ERROR,
  NUMERO,
  TEXTO,
  VACIO,
  type Columna,
} from '../values/columna.ts';
import {
  contarNoVacios,
  recorrerNumeros,
  vectoresNumericos,
  REGLAS_CALCULO,
  REGLAS_CONTEO,
} from './agregacion.ts';
import { mapaNumerico, zipNumerico, type Resultado } from './elemental.ts';
import type { Argumento } from './types.ts';

// --- Aritmética elemental ------------------------------------------------

export function ABS(args: Argumento[], n: number): Columna {
  return mapaNumerico(args[0], n, Math.abs);
}

export function SIGN(args: Argumento[], n: number): Columna {
  return mapaNumerico(args[0], n, Math.sign);
}

export function SQRT(args: Argumento[], n: number): Columna {
  return mapaNumerico(args[0], n, (x) => (x < 0 ? '#NUM!' : Math.sqrt(x)));
}

export function INT(args: Argumento[], n: number): Columna {
  return mapaNumerico(args[0], n, Math.floor);
}

export function EXP(args: Argumento[], n: number): Columna {
  return mapaNumerico(args[0], n, Math.exp);
}

export function LN(args: Argumento[], n: number): Columna {
  return mapaNumerico(args[0], n, (x) => (x <= 0 ? '#NUM!' : Math.log(x)));
}

export function LOG10(args: Argumento[], n: number): Columna {
  return mapaNumerico(args[0], n, (x) => (x <= 0 ? '#NUM!' : Math.log10(x)));
}

/** `LOG(número; [base])`; base 10 si se omite. */
export function LOG(args: Argumento[], n: number): Columna {
  if (args.length < 2) return LOG10(args, n);
  return zipNumerico(args[0], args[1], n, (x, base) =>
    x <= 0 || base <= 0 || base === 1 ? '#NUM!' : Math.log(x) / Math.log(base));
}

export function POWER(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (base, exp) => {
    const r = base ** exp;
    // Base negativa con exponente fraccionario: Excel da #¡NUM!, JS da NaN.
    return Number.isNaN(r) && !Number.isNaN(base) && !Number.isNaN(exp) ? '#NUM!' : r;
  });
}

export function MOD(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (x, y) => (y === 0 ? '#DIV/0!' : excelMod(x, y)));
}

export function excelMod(dividendo: number, divisor: number): number {
  return dividendo - divisor * Math.floor(dividendo / divisor);
}

export function excelRound(x: number, digitos: number): number {
  // "Alejarse de cero": se trabaja con el valor absoluto y se reaplica el
  // signo al final, así -2,5 y 2,5 redondean de forma simétrica.
  const factor = 10 ** digitos;
  const signo = x < 0 ? -1 : 1;
  return (signo * Math.round(Math.abs(x) * factor)) / factor;
}

export function excelRoundUp(x: number, digitos: number): number {
  const factor = 10 ** digitos;
  const signo = x < 0 ? -1 : 1;
  return (signo * Math.ceil(Math.abs(x) * factor - 1e-9)) / factor;
}

export function excelTrunc(x: number, digitos: number): number {
  const factor = 10 ** digitos;
  return Math.trunc(x * factor) / factor;
}

export function ROUND(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, excelRound);
}

export function ROUNDUP(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, excelRoundUp);
}

export function ROUNDDOWN(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, excelTrunc);
}

/** `TRUNC(número; [decimales])`; decimales 0 si se omite. */
export function TRUNC(args: Argumento[], n: number): Columna {
  if (args.length < 2) return mapaNumerico(args[0], n, (x) => excelTrunc(x, 0));
  return zipNumerico(args[0], args[1], n, excelTrunc);
}

// --- Agregación ----------------------------------------------------------

/**
 * Esqueleto común de los reductores: el camino rápido cuando todo es numérico
 * y el general cuando no, sin que cada función repita la estructura.
 *
 * `inicial` y `combinar` definen la reducción; `cerrar` convierte el
 * acumulado en el resultado de la iteración (`SUMA` lo devuelve tal cual,
 * `PROMEDIO` divide, `MIN` de un conjunto vacío da 0).
 */
function reducir(
  args: Argumento[],
  n: number,
  inicial: number,
  combinar: (acc: number, x: number) => number,
  cerrar: (acc: number, cuenta: number) => Resultado,
): Columna {
  const rapido = vectoresNumericos(args);
  if (rapido) {
    const cuenta = rapido.length;
    const out = new Float64Array(n);
    let falloEn = -1;
    for (let i = 0; i < n; i++) {
      let acc = inicial;
      for (const b of rapido) acc = combinar(acc, b[i] as number);
      const r = cerrar(acc, cuenta);
      if (typeof r === 'string') {
        falloEn = i;
        break;
      }
      out[i] = r;
    }
    if (falloEn === -1) return vectorNumerico(out);
    // Con errores de por medio (PROMEDIO de un conjunto vacío) se rehace por
    // el camino general, que sabe representarlos.
  }

  const salida = crearConstructor(n);
  let acc = inicial;
  let cuenta = 0;
  const visita = (x: number): void => {
    acc = combinar(acc, x);
    cuenta++;
  };

  for (let i = 0; i < n; i++) {
    acc = inicial;
    cuenta = 0;
    const err = recorrerNumeros(args, i, REGLAS_CALCULO, visita);
    if (err) {
      salida.ponerError(i, err);
      continue;
    }
    const r = cerrar(acc, cuenta);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

export function SUM(args: Argumento[], n: number): Columna {
  return reducir(args, n, 0, (a, x) => a + x, (a) => a);
}

export function PRODUCT(args: Argumento[], n: number): Columna {
  // Excel: PRODUCTO sin ningún valor numérico devuelve 0, no 1.
  return reducir(args, n, 1, (a, x) => a * x, (a, cuenta) => (cuenta === 0 ? 0 : a));
}

export function MIN(args: Argumento[], n: number): Columna {
  // Excel: MIN de un conjunto sin números es 0, no #¡NUM! ni infinito.
  return reducir(args, n, Infinity, Math.min, (a, cuenta) => (cuenta === 0 ? 0 : a));
}

export function MAX(args: Argumento[], n: number): Columna {
  return reducir(args, n, -Infinity, Math.max, (a, cuenta) => (cuenta === 0 ? 0 : a));
}

/**
 * `PROMEDIO`: el denominador son los valores que de verdad participan, no las
 * celdas del rango. Una celda vacía no suma ni cuenta; un rango sin ningún
 * número da `#¡DIV/0!`. Es el hueco que cerró el canal de valores (casos
 * L0-031 y L0-032 del libro de fidelidad).
 */
export function AVERAGE(args: Argumento[], n: number): Columna {
  return reducir(args, n, 0, (a, x) => a + x, (a, cuenta) => (cuenta === 0 ? '#DIV/0!' : a / cuenta));
}

/** `CONTAR`: solo números. Ignora texto, lógicos, vacíos y errores de rango. */
export function COUNT(args: Argumento[], n: number): Columna {
  const salida = crearConstructor(n);
  let cuenta = 0;
  const visita = (): void => {
    cuenta++;
  };

  for (let i = 0; i < n; i++) {
    cuenta = 0;
    const err = recorrerNumeros(args, i, REGLAS_CONTEO, visita);
    if (err) salida.ponerError(i, err);
    else salida.ponerNumero(i, cuenta);
  }
  return salida.terminar();
}

/** `CONTARA`: todo lo que no esté vacío, errores incluidos. Nunca falla. */
export function COUNTA(args: Argumento[], n: number): Columna {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = contarNoVacios(args, i);
  return vectorNumerico(out);
}

/**
 * `CONTAR.BLANCO`: las celdas vacías del rango, contando también la cadena
 * vacía que devuelve una fórmula — para Excel `""` "parece" vacía y la cuenta,
 * aunque `CONTARA` la considere ocupada. Las dos cosas a la vez son ciertas.
 */
export function COUNTBLANK(args: Argumento[], n: number): Columna {
  const columnas: Columna[] = [];
  for (const a of args) for (const c of a.columnas) columnas.push(c);

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let cuenta = 0;
    for (const c of columnas) {
      const t = tipoEn(c, i);
      if (t === VACIO || (t === TEXTO && textoEn(c, i) === '')) cuenta++;
    }
    out[i] = cuenta;
  }
  return vectorNumerico(out);
}

// --- Estadísticos por iteración ------------------------------------------

/**
 * Recoge en un array reutilizado los valores que participan en la iteración
 * `i`. Devuelve cuántos hay, o el error a propagar.
 */
function recoger(
  args: Argumento[],
  i: number,
  destino: Float64Array,
  estado: { largo: number },
): ErrorExcel | undefined {
  estado.largo = 0;
  return recorrerNumeros(args, i, REGLAS_CALCULO, (x) => {
    destino[estado.largo++] = x;
  });
}

function totalDeColumnas(args: Argumento[]): number {
  let total = 0;
  for (const a of args) total += a.columnas.length;
  return total;
}

function porIteracion(
  args: Argumento[],
  n: number,
  calcular: (valores: Float64Array, largo: number) => Resultado,
): Columna {
  const buffer = new Float64Array(totalDeColumnas(args));
  const estado = { largo: 0 };
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    const err = recoger(args, i, buffer, estado);
    if (err) {
      salida.ponerError(i, err);
      continue;
    }
    const r = calcular(buffer, estado.largo);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

export function MEDIAN(args: Argumento[], n: number): Columna {
  return porIteracion(args, n, (valores, largo) => {
    if (largo === 0) return '#NUM!';
    const copia = valores.slice(0, largo).sort();
    const mid = largo >> 1;
    return largo % 2 === 1
      ? (copia[mid] as number)
      : ((copia[mid - 1] as number) + (copia[mid] as number)) / 2;
  });
}

function varianza(valores: Float64Array, largo: number, muestral: boolean): Resultado {
  const denominador = muestral ? largo - 1 : largo;
  if (denominador <= 0) return '#DIV/0!';

  let suma = 0;
  for (let j = 0; j < largo; j++) suma += valores[j] as number;
  const media = suma / largo;

  let sumaCuadrados = 0;
  for (let j = 0; j < largo; j++) {
    const d = (valores[j] as number) - media;
    sumaCuadrados += d * d;
  }
  return sumaCuadrados / denominador;
}

export function VAR_S(args: Argumento[], n: number): Columna {
  return porIteracion(args, n, (v, largo) => varianza(v, largo, true));
}

export function VAR_P(args: Argumento[], n: number): Columna {
  return porIteracion(args, n, (v, largo) => varianza(v, largo, false));
}

export function STDEV_S(args: Argumento[], n: number): Columna {
  return porIteracion(args, n, (v, largo) => raiz(varianza(v, largo, true)));
}

export function STDEV_P(args: Argumento[], n: number): Columna {
  return porIteracion(args, n, (v, largo) => raiz(varianza(v, largo, false)));
}

function raiz(v: Resultado): Resultado {
  return typeof v === 'string' ? v : Math.sqrt(v);
}

export function SUMSQ(args: Argumento[], n: number): Columna {
  return reducir(args, n, 0, (a, x) => a + x * x, (a) => a);
}

// --- Estadísticos de orden -----------------------------------------------

/**
 * `PERCENTIL`, `CUARTIL`, `K.ESIMO.MAYOR` y `K.ESIMO.MENOR` agregan todos sus
 * argumentos menos el último, que es un escalar (el percentil o la k).
 */
function porIteracionConEscalar(
  args: Argumento[],
  n: number,
  calcular: (valores: Float64Array, largo: number, escalar: number) => Resultado,
): Columna {
  const datos = args.slice(0, -1);
  const colEscalar = args[args.length - 1]?.columnas[0];
  if (!colEscalar || datos.length === 0) {
    const b = crearConstructor(n);
    for (let i = 0; i < n; i++) b.ponerError(i, '#VALUE!');
    return b.terminar();
  }

  const buffer = new Float64Array(totalDeColumnas(datos));
  const estado = { largo: 0 };
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    const err = recoger(datos, i, buffer, estado);
    if (err) {
      salida.ponerError(i, err);
      continue;
    }
    const escalar = coercionNumerica(colEscalar, i);
    if (typeof escalar === 'string') {
      salida.ponerError(i, escalar);
      continue;
    }
    const r = calcular(buffer, estado.largo, escalar);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

/** Percentil "inclusivo": el de `PERCENTIL.INC`, con interpolación lineal. */
function percentilInclusivo(valores: Float64Array, largo: number, k: number): Resultado {
  if (largo === 0 || k < 0 || k > 1) return '#NUM!';
  const orden = valores.slice(0, largo).sort();
  const pos = k * (largo - 1);
  const bajo = Math.floor(pos);
  const alto = Math.ceil(pos);
  const vBajo = orden[bajo] as number;
  if (bajo === alto) return vBajo;
  return vBajo + (pos - bajo) * ((orden[alto] as number) - vBajo);
}

export function PERCENTILE(args: Argumento[], n: number): Columna {
  return porIteracionConEscalar(args, n, percentilInclusivo);
}

export function QUARTILE(args: Argumento[], n: number): Columna {
  return porIteracionConEscalar(args, n, (v, largo, q) => {
    const qi = Math.trunc(q);
    if (qi < 0 || qi > 4) return '#NUM!';
    return percentilInclusivo(v, largo, qi / 4);
  });
}

export function LARGE(args: Argumento[], n: number): Columna {
  return porIteracionConEscalar(args, n, (v, largo, k) => {
    const ki = Math.trunc(k);
    if (largo === 0 || ki < 1 || ki > largo) return '#NUM!';
    return v.slice(0, largo).sort()[largo - ki] as number;
  });
}

export function SMALL(args: Argumento[], n: number): Columna {
  return porIteracionConEscalar(args, n, (v, largo, k) => {
    const ki = Math.trunc(k);
    if (largo === 0 || ki < 1 || ki > largo) return '#NUM!';
    return v.slice(0, largo).sort()[ki - 1] as number;
  });
}

// --- Redondeo a múltiplos -------------------------------------------------

/** `REDOND.MULT`: al múltiplo más cercano; los signos deben coincidir. */
export function MROUND(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (x, m) => {
    if (m === 0) return 0;
    if (x !== 0 && Math.sign(x) !== Math.sign(m)) return '#NUM!'; // Excel es estricto aquí
    return Math.sign(x) * Math.round(Math.abs(x) / Math.abs(m)) * Math.abs(m);
  });
}

/**
 * `MULTIPLO.SUPERIOR` y `MULTIPLO.INFERIOR` en su forma clásica.
 *
 * `ceil(x/s)*s` y `floor(x/s)*s` reproducen el comportamiento de Excel en los
 * cuatro cuadrantes de signos, incluido `MULTIPLO.SUPERIOR(-2,5;1) = -2`, que
 * redondea *hacia* cero pese a llamarse "superior".
 */
export function CEILING(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (x, s) => {
    if (s === 0) return 0;
    if (x > 0 && s < 0) return '#NUM!';
    return Math.ceil(x / s) * s;
  });
}

export function FLOOR(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (x, s) => {
    if (s === 0) return '#DIV/0!';
    if (x > 0 && s < 0) return '#NUM!';
    return Math.floor(x / s) * s;
  });
}

/**
 * `SUMAPRODUCTO`: multiplica posición a posición dos o más rangos del mismo
 * tamaño y suma los productos. A diferencia de los reductores, aquí la
 * posición dentro del rango importa: no se puede aplanar y sumar sin más.
 *
 * Excel trata como 0 lo que no sea numérico (texto, vacíos, lógicos) en vez de
 * fallar, y da `#¡VALOR!` si los rangos no miden lo mismo.
 */
export function SUMPRODUCT(args: Argumento[], n: number): Columna {
  if (args.length === 0) return numeroConstante(0, n);

  const largo = (args[0] as Argumento).columnas.length;
  if (args.some((a) => a.columnas.length !== largo)) {
    const b = crearConstructor(n);
    for (let i = 0; i < n; i++) b.ponerError(i, '#VALUE!');
    return b.terminar();
  }

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    let acumulado = 0;
    let error: ErrorExcel | undefined;

    for (let k = 0; k < largo && !error; k++) {
      let producto = 1;
      for (const arg of args) {
        const c = arg.columnas[k] as Columna;
        const v = valorNumericoOCero(c, i);
        if (typeof v === 'string') {
          error = v;
          break;
        }
        producto *= v;
      }
      if (!error) acumulado += producto;
    }

    if (error) salida.ponerError(i, error);
    else salida.ponerNumero(i, acumulado);
  }
  return salida.terminar();
}

/** Para SUMAPRODUCTO: lo no numérico vale 0; el error se propaga. */
function valorNumericoOCero(c: Columna, i: number): number | ErrorExcel {
  const t = tipoEn(c, i);
  if (t === ERROR) return errorEn(c, i) ?? '#VALUE!';
  if (t === NUMERO) return numeroEn(c, i);
  return 0;
}
