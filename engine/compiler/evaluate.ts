/**
 * Evaluador de referencia: junta parser + grafo + registro de funciones para
 * calcular un modelo completo, vectorizado.
 *
 * Es la versión **interpretada**, no la optimizada. Recorre el AST de cada
 * celda en cada evaluación, sin el *constant folding* de Fase 2 §3.1 (eso es
 * `plan.ts` + `executor.ts`). Existe para validar que el cálculo es correcto
 * de punta a punta antes de optimizar nada, y es la que usa el libro de
 * fidelidad.
 *
 * **Entradas y salidas son numéricas; el interior no.** Las entradas son
 * muestras de una distribución, así que llegan como `Float64Array`. Dentro,
 * cada celda es una `Columna`, que puede llevar texto, vacío o error — sin eso
 * no se podría distinguir una celda vacía de un cero ni evaluar un
 * `SI(...;"alto";...)`. Ver `engine/values/columna.ts`.
 *
 * Dos conversiones del AST que no son evidentes y sí importan:
 *
 * - Una celda **sin fórmula y sin entrada** es `vacío`, no cero. Es lo que
 *   permite que `PROMEDIO` no la cuente en el denominador.
 * - Un **argumento omitido** (`SUMA(1;;3)`) sí es un cero explícito. Excel los
 *   trata distinto: `PROMEDIO(1;;3)` da 1,33 y `PROMEDIO(A1;A2;A3)` con A2
 *   vacía da 2.
 */

import type { Grafo, NodoGrafo } from '../graph/graph.ts';
import { clausuraDependencias } from '../graph/subgraph.ts';
import { ordenarTopologicamente } from '../graph/toposort.ts';
import { claveCelda, type ErrorExcel, type Nodo } from '../parser/ast.ts';
import { obtenerFuncion } from '../functions/registry.ts';
import { argRango, argValor, type Argumento } from '../functions/types.ts';
import { coercionNumerica, coercionTexto, compararEn } from '../values/coercion.ts';
import {
  comoVectorNumerico,
  crearConstructor,
  desdeEscalar,
  errorConstante,
  errorEn,
  logicoConstante,
  numeroConstante,
  textoConstante,
  tipoEn,
  vacioConstante,
  vectorLogico,
  vectorNumerico,
  ERROR,
  type Columna,
} from '../values/columna.ts';
import type { Buffer } from '../values/buffer.ts';

export interface ErrorEvaluacion {
  clave: string;
  motivo: string;
}

export type ResultadoEvaluacion =
  | { ok: true; valores: Map<string, Columna> }
  | { ok: false; error: ErrorEvaluacion };

/**
 * Evalúa las celdas `salidas` (y todo lo que hace falta para calcularlas)
 * sobre `n` iteraciones.
 *
 * @param entradas mapa clave de celda -> buffer de N muestras ya generado (el
 *   muestreo de distribuciones es responsabilidad de `engine/sampling/`).
 */
export function evaluarModelo(
  grafo: Grafo,
  entradas: Map<string, Buffer>,
  salidas: string[],
  n: number,
): ResultadoEvaluacion {
  const necesarias = clausuraDependencias(grafo, salidas);
  const { orden, enCiclo } = ordenarTopologicamente(grafo, necesarias);

  for (const clave of orden) {
    if (enCiclo.has(clave)) {
      return { ok: false, error: { clave, motivo: 'Referencia circular: esta celda forma parte de un ciclo' } };
    }
  }

  const valores = new Map<string, Columna>();

  for (const clave of orden) {
    const entrada = entradas.get(clave);
    if (entrada) {
      if (entrada.length !== n) {
        return {
          ok: false,
          error: { clave, motivo: `El buffer de entrada tiene ${entrada.length} muestras y se esperaban ${n}` },
        };
      }
      valores.set(clave, vectorNumerico(entrada));
      continue;
    }

    const nodo = grafo.nodos.get(clave) as NodoGrafo;

    if (nodo.errorParseo) {
      return { ok: false, error: { clave, motivo: `Error de sintaxis: ${nodo.errorParseo.mensaje}` } };
    }

    if (!nodo.ast) {
      // Sin fórmula: o es un dato del libro, o está vacía de verdad.
      valores.set(clave, nodo.valor === undefined ? vacioConstante(n) : desdeEscalar(nodo.valor, n));
      continue;
    }

    const r = evaluarNodo(nodo.ast, nodo.hoja, valores, n);
    if (!r.ok) return { ok: false, error: { clave, motivo: r.motivo } };
    valores.set(clave, r.columna);
  }

  return { ok: true, valores };
}

export type ResultadoNodo = { ok: true; columna: Columna } | { ok: false; motivo: string };
type ResultadoArg = { ok: true; arg: Argumento } | { ok: false; motivo: string };

/**
 * Evalúa un único nodo del AST, dado el mapa de valores ya calculados de sus
 * dependencias.
 *
 * Exportado para que `executor.ts` (el plan optimizado) lo reutilice celda a
 * celda: la semántica de cada operador y cada función vive en un solo sitio.
 * El optimizador no la reimplementa; decide **cuándo** llamarla (con `n=1`
 * para una celda constante, con `n` completo si no) y qué hacer con el
 * resultado.
 */
export function evaluarNodo(
  nodo: Nodo,
  hojaActual: string,
  valores: Map<string, Columna>,
  n: number,
): ResultadoNodo {
  switch (nodo.tipo) {
    case 'numero':
      return { ok: true, columna: numeroConstante(nodo.valor, n) };

    case 'logico':
      return { ok: true, columna: logicoConstante(nodo.valor, n) };

    case 'texto':
      return { ok: true, columna: textoConstante(nodo.valor, n) };

    case 'error':
      return { ok: true, columna: errorConstante(nodo.valor, n) };

    case 'vacio':
      // Argumento omitido: cero explícito, no celda vacía. Ver el docstring.
      return { ok: true, columna: numeroConstante(0, n) };

    case 'celda': {
      const clave = claveCelda(nodo.ref.hoja ?? hojaActual, nodo.ref.col, nodo.ref.fila);
      const c = valores.get(clave);
      if (!c) return { ok: false, motivo: `Referencia no resuelta a ${clave}` };
      return { ok: true, columna: c };
    }

    case 'unaria': {
      const r = evaluarNodo(nodo.arg, hojaActual, valores, n);
      if (!r.ok) return r;
      const signo = nodo.op === '-' ? -1 : 1;
      return { ok: true, columna: escalarPor(r.columna, signo, n) };
    }

    case 'porcentaje': {
      const r = evaluarNodo(nodo.arg, hojaActual, valores, n);
      if (!r.ok) return r;
      return { ok: true, columna: escalarPor(r.columna, 1 / 100, n) };
    }

    case 'binaria': {
      // `A1:A3*B1:B3` solo tiene sentido con semántica matricial, que el motor
      // no implementa. Se detecta aquí para poder decirlo con esas palabras:
      // el mensaje genérico de más abajo ("un rango no es un valor") es cierto
      // pero no le dice a nadie qué hacer.
      if (nodo.izq.tipo === 'rango' || nodo.der.tipo === 'rango') {
        return {
          ok: false,
          motivo: 'Fórmula matricial: operar con rangos enteros exige semántica de matrices, ' +
            'que el motor rápido no implementa todavía',
        };
      }

      const izq = evaluarNodo(nodo.izq, hojaActual, valores, n);
      if (!izq.ok) return izq;
      const der = evaluarNodo(nodo.der, hojaActual, valores, n);
      if (!der.ok) return der;
      return aplicarBinaria(nodo.op, izq.columna, der.columna, n);
    }

    case 'funcion': {
      const f = obtenerFuncion(nodo.nombre);
      if (!f) return { ok: false, motivo: `Función no soportada por el motor rápido: ${nodo.nombre}` };

      const args: Argumento[] = [];
      for (const argNodo of nodo.args) {
        const r = evaluarArgumento(argNodo, hojaActual, valores, n);
        if (!r.ok) return r;
        args.push(r.arg);
      }
      return { ok: true, columna: f(args, n) };
    }

    case 'rango':
      return { ok: false, motivo: 'Un rango no es un valor por sí solo fuera de una función' };

    case 'nombre':
      return { ok: false, motivo: `Nombre definido no resuelto: ${nodo.nombre} (pendiente del adaptador de Excel)` };

    case 'matriz':
      return { ok: false, motivo: 'Constantes matriciales no soportadas todavía' };

    case 'no-soportado':
      return { ok: false, motivo: nodo.motivo };
  }
}

function escalarPor(c: Columna, factor: number, n: number): Columna {
  const rapido = comoVectorNumerico(c);
  if (rapido) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = factor * (rapido[i] as number);
    return vectorNumerico(out);
  }

  const b = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const v = coercionNumerica(c, i);
    if (typeof v === 'string') b.ponerError(i, v);
    else b.ponerNumero(i, factor * v);
  }
  return b.terminar();
}

function evaluarArgumento(
  nodo: Nodo,
  hojaActual: string,
  valores: Map<string, Columna>,
  n: number,
): ResultadoArg {
  if (nodo.tipo === 'rango') {
    const ref = nodo.ref;
    if (ref.col1 === null || ref.fila1 === null || ref.col2 === null || ref.fila2 === null) {
      return { ok: false, motivo: 'Rango abierto (columna o fila entera) no soportado todavía' };
    }
    const hoja = ref.hoja ?? hojaActual;
    const columnas: Columna[] = [];
    for (let col = ref.col1; col <= ref.col2; col++) {
      for (let fila = ref.fila1; fila <= ref.fila2; fila++) {
        const clave = claveCelda(hoja, col, fila);
        const c = valores.get(clave);
        if (!c) return { ok: false, motivo: `Referencia no resuelta a ${clave}` };
        columnas.push(c);
      }
    }
    // La forma la necesitan las búsquedas: `BUSCARV` tiene que saber cuántas
    // columnas tiene la tabla para poder ir a la que le piden.
    const forma = {
      filas: ref.fila2 - ref.fila1 + 1,
      cols: ref.col2 - ref.col1 + 1,
    };
    return { ok: true, arg: argRango(columnas, forma) };
  }

  const r = evaluarNodo(nodo, hojaActual, valores, n);
  if (!r.ok) return r;
  return { ok: true, arg: argValor(r.columna) };
}

/** Los operadores de comparación, que devuelven lógicos y no números. */
const COMPARADORES: Record<string, (orden: number) => boolean> = {
  '=': (o) => o === 0,
  '<>': (o) => o !== 0,
  '<': (o) => o < 0,
  '<=': (o) => o <= 0,
  '>': (o) => o > 0,
  '>=': (o) => o >= 0,
};

function aplicarBinaria(op: string, a: Columna, b: Columna, n: number): ResultadoNodo {
  const comparador = COMPARADORES[op];
  if (comparador) return { ok: true, columna: comparar(a, b, n, comparador) };
  if (op === '&') return { ok: true, columna: concatenar(a, b, n) };

  let f: (x: number, y: number) => number | ErrorExcel;
  switch (op) {
    case '+': f = (x, y) => x + y; break;
    case '-': f = (x, y) => x - y; break;
    case '*': f = (x, y) => x * y; break;
    case '/': f = (x, y) => (y === 0 ? '#DIV/0!' : x / y); break;
    case '^': f = (x, y) => {
      const r = x ** y;
      return Number.isNaN(r) && !Number.isNaN(x) && !Number.isNaN(y) ? '#NUM!' : r;
    }; break;
    default:
      return { ok: false, motivo: `Operador no soportado: ${op}` };
  }

  return { ok: true, columna: aritmetica(a, b, n, f) };
}

function aritmetica(
  a: Columna,
  b: Columna,
  n: number,
  f: (x: number, y: number) => number | ErrorExcel,
): Columna {
  const ra = comoVectorNumerico(a);
  const rb = comoVectorNumerico(b);
  if (ra && rb) {
    const out = new Float64Array(n);
    let limpio = true;
    for (let i = 0; i < n; i++) {
      const r = f(ra[i] as number, rb[i] as number);
      if (typeof r === 'string') {
        limpio = false;
        break;
      }
      out[i] = r;
    }
    if (limpio) return vectorNumerico(out);
  }

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const va = coercionNumerica(a, i);
    if (typeof va === 'string') {
      salida.ponerError(i, va);
      continue;
    }
    const vb = coercionNumerica(b, i);
    if (typeof vb === 'string') {
      salida.ponerError(i, vb);
      continue;
    }
    const r = f(va, vb);
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

function comparar(a: Columna, b: Columna, n: number, cumple: (orden: number) => boolean): Columna {
  const ra = comoVectorNumerico(a);
  const rb = comoVectorNumerico(b);
  if (ra && rb) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = ra[i] as number;
      const y = rb[i] as number;
      out[i] = cumple(x === y ? 0 : x < y ? -1 : 1) ? 1 : 0;
    }
    return vectorLogico(out);
  }

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const orden = compararEn(a, b, i);
    if (typeof orden === 'string') salida.ponerError(i, orden);
    else salida.ponerLogico(i, cumple(orden));
  }
  return salida.terminar();
}

function concatenar(a: Columna, b: Columna, n: number): Columna {
  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    // Un error en cualquiera de los dos lados se propaga tal cual, no se
    // concatena su texto: `#¡DIV/0!&"x"` es `#¡DIV/0!`, no "#¡DIV/0!x".
    const ea = tipoEn(a, i) === ERROR ? errorEn(a, i) : undefined;
    const eb = tipoEn(b, i) === ERROR ? errorEn(b, i) : undefined;
    const err = ea ?? eb;
    if (err) salida.ponerError(i, err);
    else salida.ponerTexto(i, coercionTexto(a, i) + coercionTexto(b, i));
  }
  return salida.terminar();
}
