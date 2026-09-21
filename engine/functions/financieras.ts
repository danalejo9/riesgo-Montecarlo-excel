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
