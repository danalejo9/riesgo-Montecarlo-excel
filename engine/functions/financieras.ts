/**
 * Funciones financieras (Nivel 1 de Fase 2 §4.2).
 *
 * Entran con `VNA` y `TIR` porque el escáner encontró `TIR` en un libro real
 * del usuario (`Caso_practico.xlsx`). Son pocas apariciones, pero una sola
 * basta para que el motor rápido no pueda evaluar el modelo.
 *
 * **Las dos numeran los periodos de forma distinta**, y confundirlo es el error
 * clásico con estas funciones:
 *
 * - `VNA(tasa; v1; v2; …)` supone que **v1 está al final del primer periodo**,
 *   así que descuenta desde el exponente 1. Una inversión inicial en el momento
 *   cero no se pasa a `VNA`: se suma aparte.
 * - `TIR(valores)` supone que **el primer valor está en el momento cero**, así
 *   que descuenta desde el exponente 0.
 *
 * En ambas, los valores no numéricos de un rango se **ignoran** y los periodos
 * se corren: una celda vacía en medio no cuenta como un periodo de flujo cero.
 * Es lo que hace Excel y es fácil de suponer al revés.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import {
  crearConstructor,
  numeroEn,
  tipoEn,
  ERROR,
  NUMERO,
  type Columna,
} from '../values/columna.ts';
import { coercionNumerica } from '../values/coercion.ts';
import type { Argumento } from './types.ts';

/**
 * Recoge los flujos numéricos de los argumentos, en orden, saltando lo que no
 * sea número. Devuelve el error a propagar si encuentra uno.
 */
function recogerFlujos(
  args: readonly Argumento[],
  i: number,
  destino: number[],
): ErrorExcel | undefined {
  destino.length = 0;
  for (const arg of args) {
    for (const c of arg.columnas) {
      const tipo = tipoEn(c, i);
      if (tipo === ERROR) return '#VALUE!';
      if (tipo === NUMERO) destino.push(numeroEn(c, i));
      // El resto (texto, vacías, lógicos) se ignora y no ocupa periodo.
    }
  }
  return undefined;
}

/** `VNA(tasa; valor1; …)`: el primer flujo está al final del primer periodo. */
export function NPV(args: Argumento[], n: number): Columna {
  const colTasa = args[0]?.columnas[0];
  const flujos = args.slice(1);
  if (!colTasa || flujos.length === 0) {
    const b = crearConstructor(n);
    for (let i = 0; i < n; i++) b.ponerError(i, '#VALUE!');
    return b.terminar();
  }

  const salida = crearConstructor(n);
  const valores: number[] = [];

  for (let i = 0; i < n; i++) {
    const tasa = coercionNumerica(colTasa, i);
    if (typeof tasa === 'string') {
      salida.ponerError(i, tasa);
      continue;
    }
    if (tasa === -1) {
      salida.ponerError(i, '#DIV/0!'); // dividir por (1 + -1) = 0
      continue;
    }

    const err = recogerFlujos(flujos, i, valores);
    if (err) {
      salida.ponerError(i, err);
      continue;
    }

    let acumulado = 0;
    for (let k = 0; k < valores.length; k++) {
      acumulado += (valores[k] as number) / (1 + tasa) ** (k + 1);
    }
    salida.ponerNumero(i, acumulado);
  }
  return salida.terminar();
}

/** Valor actual neto con el primer flujo en el momento cero (el de `TIR`). */
function vanDesdeCero(valores: readonly number[], tasa: number): number {
  let acc = 0;
  for (let k = 0; k < valores.length; k++) acc += (valores[k] as number) / (1 + tasa) ** k;
  return acc;
}

function derivadaVan(valores: readonly number[], tasa: number): number {
  let acc = 0;
  for (let k = 1; k < valores.length; k++) {
    acc -= (k * (valores[k] as number)) / (1 + tasa) ** (k + 1);
  }
  return acc;
}

const TOLERANCIA = 1e-9;
const ITERACIONES_NEWTON = 60;

/**
 * Busca la tasa que anula el valor actual neto.
 *
 * Primero Newton desde la estimación dada, que converge en pocas iteraciones
 * cuando el flujo tiene un solo cambio de signo (el caso normal de un
 * proyecto: inversión al principio, retornos después). Si Newton se sale del
 * dominio o no converge, se recurre a bisección sobre el primer intervalo con
 * cambio de signo, que es lento pero no falla si la raíz existe.
 *
 * **Diferencia conocida con Excel**: Excel se rinde a las 20 iteraciones y
 * devuelve `#¡NUM!`. Este método es más tenaz, así que puede encontrar una
 * tasa donde Excel no la encuentra. No es un error —la tasa es correcta— pero
 * es una divergencia de fidelidad, y por eso `TIR` está en la lista de casos a
 * verificar en la próxima tanda del libro.
 */
function resolverTir(valores: readonly number[], estimacion: number): number | ErrorExcel {
  if (valores.length < 2) return '#NUM!';

  // Sin un cambio de signo no hay raíz: Excel da #¡NUM! y aquí también.
  const hayPositivo = valores.some((v) => v > 0);
  const hayNegativo = valores.some((v) => v < 0);
  if (!hayPositivo || !hayNegativo) return '#NUM!';

  let r = estimacion;
  for (let iter = 0; iter < ITERACIONES_NEWTON; iter++) {
    if (r <= -1) break;
    const f = vanDesdeCero(valores, r);
    if (Math.abs(f) < TOLERANCIA) return r;
    const df = derivadaVan(valores, r);
    if (df === 0 || !Number.isFinite(df)) break;
    const siguiente = r - f / df;
    if (!Number.isFinite(siguiente)) break;
    if (Math.abs(siguiente - r) < TOLERANCIA) return siguiente;
    r = siguiente;
  }

  return porBiseccion(valores);
}

/**
 * Barrido grueso desde justo por encima de -100 % hasta el 900 % buscando un
 * cambio de signo, y bisección dentro del primer intervalo que lo tenga.
 */
function porBiseccion(valores: readonly number[]): number | ErrorExcel {
  const PASO = 0.01;
  const DESDE = -0.9999;

  let izq = DESDE;
  let fIzq = vanDesdeCero(valores, izq);

  for (let paso = 1; paso <= 1000; paso++) {
    const der = DESDE + paso * PASO;
    const fDer = vanDesdeCero(valores, der);

    if (Number.isFinite(fIzq) && Number.isFinite(fDer) && fIzq * fDer <= 0) {
      return afinar(valores, izq, fIzq, der);
    }
    izq = der;
    fIzq = fDer;
  }
  return '#NUM!';
}

/** Bisección clásica dentro de un intervalo que ya tiene cambio de signo. */
function afinar(valores: readonly number[], desde: number, fDesde: number, hasta: number): number {
  let izq = desde;
  let der = hasta;
  let signoIzq = Math.sign(fDesde);

  for (let iter = 0; iter < 200; iter++) {
    const medio = (izq + der) / 2;
    const fMedio = vanDesdeCero(valores, medio);
    if (Math.abs(fMedio) < TOLERANCIA) return medio;

    if (Math.sign(fMedio) === signoIzq) {
      izq = medio;
      signoIzq = Math.sign(fMedio);
    } else {
      der = medio;
    }
  }
  return (izq + der) / 2;
}

/** `TIR(valores; [estimación])`: el primer valor está en el momento cero. */
export function IRR(args: Argumento[], n: number): Columna {
  const flujos = args[0];
  if (!flujos) {
    const b = crearConstructor(n);
    for (let i = 0; i < n; i++) b.ponerError(i, '#VALUE!');
    return b.terminar();
  }

  const colEstimacion = args[1]?.columnas[0];
  const salida = crearConstructor(n);
  const valores: number[] = [];

  for (let i = 0; i < n; i++) {
    const err = recogerFlujos([flujos], i, valores);
    if (err) {
      salida.ponerError(i, err);
      continue;
    }

    let estimacion = 0.1; // el valor por omisión de Excel
    if (colEstimacion) {
      const g = coercionNumerica(colEstimacion, i);
      if (typeof g === 'string') {
        salida.ponerError(i, g);
        continue;
      }
      estimacion = g;
    }

    const r = resolverTir(valores, estimacion);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

// --- Amortización: la familia PAGO/VA/VF/TASA/NPER -------------------------

/**
 * Las cinco se relacionan por una sola ecuación, la del valor temporal del
 * dinero, y cada una despeja una incógnita distinta:
 *
 *     va·(1+i)^n + pago·(1 + i·tipo)·((1+i)^n − 1)/i + vf = 0
 *
 * con `i` la tasa por periodo, `n` el número de periodos y `tipo` 0 si se paga
 * al final del periodo (lo normal) o 1 si al principio.
 *
 * **El convenio de signos de Excel confunde siempre**: el dinero que sale es
 * negativo y el que entra, positivo. Por eso `PAGO` de un préstamo devuelve un
 * número **negativo** —es lo que pagas—, y quien no lo espera cree que hay un
 * error. Se reproduce tal cual.
 *
 * El caso `i = 0` no es un caso límite que se pueda ignorar: un préstamo sin
 * intereses hace cero el denominador. Se resuelve con la fórmula lineal, que
 * es el límite correcto de la anterior.
 */

/** `undefined` en la lista de valores por omisión marca un argumento obligatorio. */
const OBLIGATORIO = undefined;

/**
 * Andamiaje de las financieras de argumentos escalares.
 *
 * Los valores por omisión viven en un solo sitio —la lista `defectos`— en vez
 * de repartidos por cada cuerpo, que es donde se desincronizan.
 */
function financiera(
  args: Argumento[],
  n: number,
  defectos: readonly (number | undefined)[],
  calcular: (v: readonly number[]) => number | ErrorExcel,
): Columna {
  const salida = crearConstructor(n);
  const valores = new Array<number>(defectos.length);

  for (let i = 0; i < n; i++) {
    let error: ErrorExcel | undefined;

    for (let j = 0; j < defectos.length && !error; j++) {
      const c = args[j]?.columnas[0];
      if (!c) {
        const porOmision = defectos[j];
        if (porOmision === undefined) error = '#VALUE!'; // obligatorio y ausente
        else valores[j] = porOmision;
        continue;
      }
      const v = coercionNumerica(c, i);
      if (typeof v === 'string') error = v;
      else valores[j] = v;
    }

    if (error) {
      salida.ponerError(i, error);
      continue;
    }
    const r = calcular(valores);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

/** La cuota. Extraída porque PAGOINT y PAGOPRIN también la necesitan. */
function pagoDe(tasa: number, nper: number, va: number, vf: number, tipo: number): number | ErrorExcel {
  if (nper === 0) return '#NUM!';
  if (tasa === 0) return -(va + vf) / nper;
  const f = (1 + tasa) ** nper;
  return (-tasa * (va * f + vf)) / ((1 + tasa * tipo) * (f - 1));
}

/** Saldo pendiente tras `periodos` cuotas ya pagadas. */
function saldoTras(tasa: number, periodos: number, va: number, pago: number, tipo: number): number {
  if (tasa === 0) return va + pago * periodos;
  const f = (1 + tasa) ** periodos;
  return va * f + pago * (1 + tasa * tipo) * ((f - 1) / tasa);
}

/** `PAGO(tasa; nper; va; [vf]; [tipo])`. Negativo: es dinero que sale. */
export function PMT(args: Argumento[], n: number): Columna {
  return financiera(args, n, [OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, 0, 0], (v) =>
    pagoDe(v[0] as number, v[1] as number, v[2] as number, v[3] as number, v[4] as number));
}

/** `VA(tasa; nper; pago; [vf]; [tipo])`: el valor actual. */
export function PV(args: Argumento[], n: number): Columna {
  return financiera(args, n, [OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, 0, 0], (v) => {
    const [tasa, nper, pago, vf, tipo] = v as [number, number, number, number, number];
    if (tasa === 0) return -(vf + pago * nper);
    const f = (1 + tasa) ** nper;
    return -(vf + pago * (1 + tasa * tipo) * ((f - 1) / tasa)) / f;
  });
}

/** `VF(tasa; nper; pago; [va]; [tipo])`: el valor futuro. */
export function FV(args: Argumento[], n: number): Columna {
  return financiera(args, n, [OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, 0, 0], (v) => {
    const [tasa, nper, pago, va, tipo] = v as [number, number, number, number, number];
    if (tasa === 0) return -(va + pago * nper);
    const f = (1 + tasa) ** nper;
    return -(va * f + pago * (1 + tasa * tipo) * ((f - 1) / tasa));
  });
}

/** `NPER(tasa; pago; va; [vf]; [tipo])`: cuántos periodos hacen falta. */
export function NPER(args: Argumento[], n: number): Columna {
  return financiera(args, n, [OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, 0, 0], (v) => {
    const [tasa, pago, va, vf, tipo] = v as [number, number, number, number, number];
    if (pago === 0 && tasa === 0) return '#NUM!';
    if (tasa === 0) return -(va + vf) / pago;

    const ajustado = pago * (1 + tasa * tipo);
    const numerador = ajustado - vf * tasa;
    const denominador = va * tasa + ajustado;
    if (denominador === 0 || numerador / denominador <= 0) return '#NUM!';
    return Math.log(numerador / denominador) / Math.log(1 + tasa);
  });
}

/**
 * `TASA(nper; pago; va; [vf]; [tipo]; [estimación])`.
 *
 * No tiene solución cerrada: se resuelve numéricamente igual que `TIR`, con
 * Newton desde la estimación y bisección si no converge. La derivada se toma
 * numéricamente: la analítica de esta ecuación es larga, fácil de equivocar, y
 * aquí el coste de una evaluación más es irrelevante.
 */
export function RATE(args: Argumento[], n: number): Columna {
  return financiera(args, n, [OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, 0, 0, 0.1], (v) => {
    const [nper, pago, va, vf, tipo, estimacion] = v as [number, number, number, number, number, number];
    if (nper === 0) return '#NUM!';

    const saldo = (i: number): number => {
      if (i === 0) return va + pago * nper + vf;
      const f = (1 + i) ** nper;
      return va * f + pago * (1 + i * tipo) * ((f - 1) / i) + vf;
    };

    let r = estimacion;
    for (let iter = 0; iter < ITERACIONES_NEWTON; iter++) {
      if (r <= -1) break;
      const y = saldo(r);
      if (Math.abs(y) < TOLERANCIA) return r;
      const h = 1e-7;
      const pendiente = (saldo(r + h) - y) / h;
      if (pendiente === 0 || !Number.isFinite(pendiente)) break;
      const siguiente = r - y / pendiente;
      if (!Number.isFinite(siguiente)) break;
      if (Math.abs(siguiente - r) < TOLERANCIA) return siguiente;
      r = siguiente;
    }
    return raizPorBiseccion(saldo);
  });
}

/** Bisección genérica sobre una función de la tasa, de -99,99 % al 900 %. */
function raizPorBiseccion(f: (x: number) => number): number | ErrorExcel {
  let izq = -0.9999;
  let fIzq = f(izq);

  for (let paso = 1; paso <= 2000; paso++) {
    const der = -0.9999 + paso * 0.005;
    const fDer = f(der);

    if (Number.isFinite(fIzq) && Number.isFinite(fDer) && fIzq * fDer <= 0) {
      let a = izq;
      let b = der;
      let signoA = Math.sign(fIzq);
      for (let iter = 0; iter < 200; iter++) {
        const medio = (a + b) / 2;
        const fm = f(medio);
        if (Math.abs(fm) < TOLERANCIA) return medio;
        if (Math.sign(fm) === signoA) { a = medio; signoA = Math.sign(fm); } else b = medio;
      }
      return (a + b) / 2;
    }
    izq = der;
    fIzq = fDer;
  }
  return '#NUM!';
}

/** `PAGOINT(tasa; periodo; nper; va; [vf]; [tipo])`: la parte de intereses. */
export function IPMT(args: Argumento[], n: number): Columna {
  return financiera(args, n, [OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, 0, 0], (v) => {
    const [tasa, periodo, nper, va, vf, tipo] = v as [number, number, number, number, number, number];
    const p = Math.trunc(periodo);
    if (p < 1 || p > nper) return '#NUM!';

    return interesDe(tasa, p, nper, va, vf, tipo);
  });
}

/**
 * Los intereses del periodo `p`, con el signo del pago.
 *
 * **El signo importa y es fácil equivocarlo.** Con `va` positivo (el dinero
 * que te prestan), la cuota de `PAGO` sale negativa: es dinero que sale. Los
 * intereses son parte de esa cuota, así que salen negativos también. El saldo
 * pendiente, en cambio, es positivo. Sin el signo, `PAGOINT` devolvía +833,33
 * donde Excel da -833,33, y `PAGOPRIN` absorbía el error entero (-1906,98 en
 * vez de -240,31) manteniendo la identidad `PAGOINT + PAGOPRIN = PAGO` — que
 * es lo que hacía que el fallo no saltara a la vista.
 *
 * Extraído para que las dos funciones no puedan volver a discrepar.
 */
function interesDe(
  tasa: number, p: number, nper: number, va: number, vf: number, tipo: number,
): number | ErrorExcel {
  const pago = pagoDe(tasa, nper, va, vf, tipo);
  if (typeof pago === 'string') return pago;

  // En la modalidad "al principio del periodo" la primera cuota se paga antes
  // de que transcurra ningún periodo, así que no genera intereses.
  if (tipo === 1 && p === 1) return 0;

  const saldo = saldoTras(tasa, p - 1, va, pago, tipo);

  // Con pagos al principio, la cuota de cada periodo se paga **antes** de que
  // ese periodo devengue intereses, así que el interés se descuenta un
  // periodo. Verificado contra Excel con el caso N2-032 del libro de
  // fidelidad: `PAGOINT(0,05/12; 2; 360; 200000; 0; 1)` da -828,878382, y no
  // los -836,787 que salían de restarle la cuota al saldo.
  return tipo === 1 ? (-saldo * tasa) / (1 + tasa) : -saldo * tasa;
}

/** `PAGOPRIN(tasa; periodo; nper; va; [vf]; [tipo])`: la parte de capital. */
export function PPMT(args: Argumento[], n: number): Columna {
  return financiera(args, n, [OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, OBLIGATORIO, 0, 0], (v) => {
    const [tasa, periodo, nper, va, vf, tipo] = v as [number, number, number, number, number, number];
    const p = Math.trunc(periodo);
    if (p < 1 || p > nper) return '#NUM!';

    const pago = pagoDe(tasa, nper, va, vf, tipo);
    if (typeof pago === 'string') return pago;

    const intereses = interesDe(tasa, p, nper, va, vf, tipo);
    if (typeof intereses === 'string') return intereses;

    // Lo que no son intereses es capital. Escrito como resta, la identidad
    // `PAGOINT + PAGOPRIN = PAGO` se cumple por construcción.
    return pago - intereses;
  });
}

// --- Flujos con fechas: VNA.NO.PER y TIR.NO.PER ---------------------------

/**
 * `VNA` y `TIR` suponen periodos regulares. Un proyecto real casi nunca los
 * tiene: los desembolsos caen cuando caen. `VNA.NO.PER` y `TIR.NO.PER` toman
 * las fechas de cada flujo y descuentan por **días reales entre 365**, que es
 * la convención que fija Excel (no 360, ni días hábiles).
 *
 * El primer flujo marca el origen: su exponente es cero, pase lo que pase con
 * el orden de las fechas.
 */
const DIAS_POR_ANIO = 365;

interface FlujoFechado {
  importe: number;
  /** Días transcurridos desde el primer flujo. */
  dias: number;
}

/** Empareja importes con fechas, por posición. */
function recogerFlujosFechados(
  valores: Argumento | undefined,
  fechas: Argumento | undefined,
  i: number,
): FlujoFechado[] | ErrorExcel {
  if (!valores || !fechas) return '#VALUE!';
  const columnasValor = valores.columnas;
  const columnasFecha = fechas.columnas;
  if (columnasValor.length !== columnasFecha.length || columnasValor.length === 0) return '#NUM!';

  const flujos: FlujoFechado[] = [];
  let origen: number | undefined;

  for (let k = 0; k < columnasValor.length; k++) {
    const cv = columnasValor[k] as Columna;
    const cf = columnasFecha[k] as Columna;
    if (tipoEn(cv, i) === ERROR || tipoEn(cf, i) === ERROR) return '#VALUE!';
    if (tipoEn(cv, i) !== NUMERO || tipoEn(cf, i) !== NUMERO) continue;

    const serie = Math.floor(numeroEn(cf, i));
    if (origen === undefined) origen = serie;
    // Excel exige que la primera fecha sea la más temprana.
    if (serie < origen) return '#NUM!';
    flujos.push({ importe: numeroEn(cv, i), dias: serie - origen });
  }
  return flujos.length === 0 ? '#NUM!' : flujos;
}

function vanFechado(flujos: readonly FlujoFechado[], tasa: number): number {
  let acc = 0;
  for (const f of flujos) acc += f.importe / (1 + tasa) ** (f.dias / DIAS_POR_ANIO);
  return acc;
}

/** `VNA.NO.PER(tasa; valores; fechas)`. */
export function XNPV(args: Argumento[], n: number): Columna {
  const colTasa = args[0]?.columnas[0];
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    if (!colTasa) {
      salida.ponerError(i, '#VALUE!');
      continue;
    }
    const tasa = coercionNumerica(colTasa, i);
    if (typeof tasa === 'string') {
      salida.ponerError(i, tasa);
      continue;
    }
    if (tasa <= -1) {
      salida.ponerError(i, '#NUM!');
      continue;
    }

    const flujos = recogerFlujosFechados(args[1], args[2], i);
    if (typeof flujos === 'string') {
      salida.ponerError(i, flujos);
      continue;
    }
    salida.ponerNumero(i, vanFechado(flujos, tasa));
  }
  return salida.terminar();
}

/** `TIR.NO.PER(valores; fechas; [estimación])`. */
export function XIRR(args: Argumento[], n: number): Columna {
  const colEstimacion = args[2]?.columnas[0];
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    const flujos = recogerFlujosFechados(args[0], args[1], i);
    if (typeof flujos === 'string') {
      salida.ponerError(i, flujos);
      continue;
    }
    if (!flujos.some((f) => f.importe > 0) || !flujos.some((f) => f.importe < 0)) {
      salida.ponerError(i, '#NUM!'); // sin cambio de signo no hay raíz
      continue;
    }

    let estimacion = 0.1;
    if (colEstimacion) {
      const g = coercionNumerica(colEstimacion, i);
      if (typeof g === 'string') {
        salida.ponerError(i, g);
        continue;
      }
      estimacion = g;
    }

    const r = resolverTasaFechada(flujos, estimacion);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

function resolverTasaFechada(flujos: readonly FlujoFechado[], estimacion: number): number | ErrorExcel {
  let r = estimacion;
  for (let iter = 0; iter < ITERACIONES_NEWTON; iter++) {
    if (r <= -1) break;
    const y = vanFechado(flujos, r);
    if (Math.abs(y) < TOLERANCIA) return r;

    let derivada = 0;
    for (const f of flujos) {
      const t = f.dias / DIAS_POR_ANIO;
      derivada -= (t * f.importe) / (1 + r) ** (t + 1);
    }
    if (derivada === 0 || !Number.isFinite(derivada)) break;

    const siguiente = r - y / derivada;
    if (!Number.isFinite(siguiente)) break;
    if (Math.abs(siguiente - r) < TOLERANCIA) return siguiente;
    r = siguiente;
  }
  return raizPorBiseccion((x) => vanFechado(flujos, x));
}
