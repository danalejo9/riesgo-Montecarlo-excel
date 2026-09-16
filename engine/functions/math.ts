/**
 * Aritmética elemento a elemento (Nivel 0, subconjunto numérico — ver types.ts).
 *
 * Tres funciones de Excel se comportan distinto de lo que su equivalente de
 * JavaScript sugiere, y equivocarlas produce números silenciosamente
 * incorrectos — exactamente la clase de error que el heredado cometió con
 * PERT. Se implementan aparte y con tests dedicados:
 *
 *   - `ROUND`: redondea alejándose de cero. `Math.round` de JS redondea hacia
 *     +Infinito, así que `ROUND(-2.5,0)` debe dar -3 y `Math.round(-2.5)` da -2.
 *   - `MOD`: el resultado toma el signo del **divisor**, no el del dividendo.
 *     `MOD(-7,3)` es 2 en Excel; `-7 % 3` en JS es -1.
 *   - `TRUNC`/`ROUNDDOWN`: truncan hacia cero, a diferencia de `INT`, que
 *     redondea hacia -Infinito. Para negativos difieren: `INT(-2.5)=-3` pero
 *     `TRUNC(-2.5)=-2`.
 */

import { aplanar, nuevoBuffer, type Arg, type Buffer } from './types.ts';

function unario(arg: Arg, n: number, f: (x: number) => number): Buffer {
  const out = nuevoBuffer(n);
  const bufs = arg;
  // Un argumento escalar (celda) trae un único buffer; se aplica f elemento
  // a elemento sobre ese buffer. (Los rangos no tienen sentido como argumento
  // de una función unaria de Excel — ABS(A1:A9) opera celda a celda si se usa
  // en una fórmula matricial, fuera del alcance de Nivel 0 por ahora).
  const b = bufs[0] as Buffer;
  for (let i = 0; i < n; i++) out[i] = f(b[i] as number);
  return out;
}

function binario(a: Arg, b: Arg, n: number, f: (x: number, y: number) => number): Buffer {
  const out = nuevoBuffer(n);
  const ba = a[0] as Buffer;
  const bb = b[0] as Buffer;
  for (let i = 0; i < n; i++) out[i] = f(ba[i] as number, bb[i] as number);
  return out;
}

export function ABS(args: Arg[], n: number): Buffer {
  return unario(args[0] as Arg, n, Math.abs);
}

export function SIGN(args: Arg[], n: number): Buffer {
  return unario(args[0] as Arg, n, Math.sign);
}

export function SQRT(args: Arg[], n: number): Buffer {
  // Excel: SQRT de un negativo es #NUM!. Aquí, sin canal de error todavía,
  // se propaga NaN — documentado como límite en types.ts.
  return unario(args[0] as Arg, n, (x) => (x < 0 ? NaN : Math.sqrt(x)));
}

export function INT(args: Arg[], n: number): Buffer {
  return unario(args[0] as Arg, n, Math.floor);
}

export function EXP(args: Arg[], n: number): Buffer {
  return unario(args[0] as Arg, n, Math.exp);
}

export function LN(args: Arg[], n: number): Buffer {
  return unario(args[0] as Arg, n, (x) => (x <= 0 ? NaN : Math.log(x)));
}

export function LOG10(args: Arg[], n: number): Buffer {
  return unario(args[0] as Arg, n, (x) => (x <= 0 ? NaN : Math.log10(x)));
}

/** `LOG(número, [base])`; base 10 si se omite. */
export function LOG(args: Arg[], n: number): Buffer {
  if (args.length < 2) return LOG10(args, n);
  return binario(args[0] as Arg, args[1] as Arg, n, (x, base) =>
    x <= 0 || base <= 0 || base === 1 ? NaN : Math.log(x) / Math.log(base));
}

export function POWER(args: Arg[], n: number): Buffer {
  return binario(args[0] as Arg, args[1] as Arg, n, (base, exp) => base ** exp);
}

export function MOD(args: Arg[], n: number): Buffer {
  return binario(args[0] as Arg, args[1] as Arg, n, excelMod);
}

export function excelMod(dividendo: number, divisor: number): number {
  if (divisor === 0) return NaN; // Excel: #DIV/0!
  const r = dividendo - divisor * Math.floor(dividendo / divisor);
  return r;
}

export function excelRound(x: number, digitos: number): number {
  // "Alejarse de cero": se trabaja con el valor absoluto y se reaplica el
  // signo al final, así -2.5 y 2.5 redondean de forma simétrica.
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

export function ROUND(args: Arg[], n: number): Buffer {
  const digitos = args[1] as Arg;
  return binario(args[0] as Arg, digitos, n, excelRound);
}

export function ROUNDUP(args: Arg[], n: number): Buffer {
  return binario(args[0] as Arg, args[1] as Arg, n, excelRoundUp);
}

export function ROUNDDOWN(args: Arg[], n: number): Buffer {
  return binario(args[0] as Arg, args[1] as Arg, n, excelTrunc);
}

/** `TRUNC(número, [decimales])`; decimales 0 si se omite. */
export function TRUNC(args: Arg[], n: number): Buffer {
  if (args.length < 2) return unario(args[0] as Arg, n, (x) => excelTrunc(x, 0));
  return binario(args[0] as Arg, args[1] as Arg, n, excelTrunc);
}

/**
 * Reductores: combinan todos los buffers de todos los argumentos (aplanando
 * rangos y celdas sueltas por igual) en un único resultado por iteración.
 * `SUM(A1:A9)` y `SUM(A1,A2,...,A9)` llegan aquí con exactamente la misma
 * forma tras `aplanar`.
 */
function reducir(args: Arg[], n: number, inicial: number, f: (acc: number, x: number) => number): Buffer {
  const bufs = aplanar(args);
  const out = nuevoBuffer(n);
  out.fill(inicial);
  for (let i = 0; i < n; i++) {
    let acc = inicial;
    for (const b of bufs) acc = f(acc, b[i] as number);
    out[i] = acc;
  }
  return out;
}

export function SUM(args: Arg[], n: number): Buffer {
  return reducir(args, n, 0, (a, x) => a + x);
}

export function PRODUCT(args: Arg[], n: number): Buffer {
  return reducir(args, n, 1, (a, x) => a * x);
}

export function MIN(args: Arg[], n: number): Buffer {
  return reducir(args, n, Infinity, Math.min);
}

export function MAX(args: Arg[], n: number): Buffer {
  return reducir(args, n, -Infinity, Math.max);
}

export function COUNT(args: Arg[], n: number): Buffer {
  // En este subconjunto todo argumento es numérico, así que COUNT equivale a
  // contar cuántos buffers se pasaron. La distinción real con COUNTA (que
  // también cuenta texto) llega con el canal de valores no numéricos.
  const total = aplanar(args).length;
  const out = nuevoBuffer(n);
  out.fill(total);
  return out;
}

export function AVERAGE(args: Arg[], n: number): Buffer {
  const bufs = aplanar(args);
  const out = nuevoBuffer(n);
  const cuenta = bufs.length;
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (const b of bufs) acc += b[i] as number;
    out[i] = cuenta === 0 ? NaN : acc / cuenta; // Excel: AVERAGE() vacío -> #DIV/0!
  }
  return out;
}

export function MEDIAN(args: Arg[], n: number): Buffer {
  const bufs = aplanar(args);
  const out = nuevoBuffer(n);
  const fila = new Float64Array(bufs.length);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < bufs.length; j++) fila[j] = (bufs[j] as Buffer)[i] as number;
    out[i] = medianaDeArray(fila);
  }
  return out;
}

function medianaDeArray(valores: Float64Array): number {
  if (valores.length === 0) return NaN;
  const copia = Float64Array.from(valores).sort();
  const mid = copia.length >> 1;
  return copia.length % 2 === 1 ? (copia[mid] as number) : ((copia[mid - 1] as number) + (copia[mid] as number)) / 2;
}

/** Varianza y desviación, muestral (`.S`, denominador n-1) y poblacional (`.P`, n). */
function varianzaPorIteracion(bufs: Buffer[], n: number, muestral: boolean): Buffer {
  const out = nuevoBuffer(n);
  const cuenta = bufs.length;
  const denominador = muestral ? cuenta - 1 : cuenta;

  for (let i = 0; i < n; i++) {
    let suma = 0;
    for (const b of bufs) suma += b[i] as number;
    const media = suma / cuenta;

    let sumaCuadrados = 0;
    for (const b of bufs) {
      const d = (b[i] as number) - media;
      sumaCuadrados += d * d;
    }

    out[i] = denominador <= 0 ? NaN : sumaCuadrados / denominador; // Excel: #DIV/0! con <2 valores en .S
  }
  return out;
}

export function VAR_S(args: Arg[], n: number): Buffer {
  return varianzaPorIteracion(aplanar(args), n, true);
}

export function VAR_P(args: Arg[], n: number): Buffer {
  return varianzaPorIteracion(aplanar(args), n, false);
}

export function STDEV_S(args: Arg[], n: number): Buffer {
  const v = VAR_S(args, n);
  for (let i = 0; i < n; i++) v[i] = Math.sqrt(v[i] as number);
  return v;
}

/**
 * `SUMAPRODUCTO`: multiplica posición a posición dos o más rangos del mismo
 * tamaño y suma los productos. A diferencia de los reductores de arriba, aquí
 * la posición dentro del rango importa — no se puede aplanar y sumar sin más
 * (eso sería `SUM`, no `SUMPRODUCT`).
 *
 * Excel da `#¡VALOR!` si los rangos no miden lo mismo; sin canal de errores
 * todavía (ver `types.ts`), se propaga `NaN`, el mismo convenio que ya usan
 * `SQRT` de un negativo o una división por cero.
 */
export function SUMPRODUCT(args: Arg[], n: number): Buffer {
  const out = nuevoBuffer(n);
  if (args.length === 0) return out;

  const largo = (args[0] as Arg).length;
  if (args.some((a) => a.length !== largo)) {
    out.fill(NaN);
    return out;
  }

  for (let i = 0; i < n; i++) {
    let acumulado = 0;
    for (let k = 0; k < largo; k++) {
      let producto = 1;
      for (const arg of args) producto *= (arg[k] as Buffer)[i] as number;
      acumulado += producto;
    }
    out[i] = acumulado;
  }
  return out;
}

export function STDEV_P(args: Arg[], n: number): Buffer {
  const v = VAR_P(args, n);
  for (let i = 0; i < n; i++) v[i] = Math.sqrt(v[i] as number);
  return v;
}
