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
import { REGISTRO_MATRICIAL, celda as celdaMatriz, escalar, type Matriz } from '../functions/matriciales.ts';
import { ACEPTAN_MATRICES, ELEVABLES, MATRICIALES, normalizarFuncion, produceMatriz } from './usoMatricial.ts';
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
  // Las entradas cortan el recorrido: su fórmula no se evalúa (ver `plan.ts`).
  const necesarias = clausuraDependencias(grafo, salidas, new Set(entradas.keys()));
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
      const nombre = normalizarFuncion(nodo.nombre);
      if (MATRICIALES.has(nombre)) {
        // Solo o en una operación, el resultado derramaría: ver `usoMatricial.ts`.
        return { ok: false, motivo: `${nombre} devuelve varias celdas y aquí derramaría` };
      }
      const f = obtenerFuncion(nodo.nombre);
      if (!f) return { ok: false, motivo: `Función no soportada por el motor rápido: ${nodo.nombre}` };

      const admite = ACEPTAN_MATRICES.has(nombre);
      const args: Argumento[] = [];
      for (const argNodo of nodo.args) {
        const r = evaluarArgumento(argNodo, hojaActual, valores, n, admite);
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
  admiteMatriz = false,
): ResultadoArg {
  if (nodo.tipo === 'rango') {
    const m = matrizDeRango(nodo, hojaActual, valores);
    if (!m.ok) return m;
    // La forma la necesitan las búsquedas: `BUSCARV` tiene que saber cuántas
    // columnas tiene la tabla para poder ir a la que le piden.
    return { ok: true, arg: argRango(m.matriz.celdas, { filas: m.matriz.filas, cols: m.matriz.cols }) };
  }

  // Una expresión que produce una matriz (`A2:A9>5`, `FILTRAR(…)`), dentro de
  // una función que sabe consumirla: se entrega como si fuera un rango.
  if (admiteMatriz && produceMatriz(nodo)) {
    const m = evaluarMatriz(nodo, hojaActual, valores, n);
    if (!m.ok) return m;
    return { ok: true, arg: argRango(m.matriz.celdas, { filas: m.matriz.filas, cols: m.matriz.cols }) };
  }

  const r = evaluarNodo(nodo, hojaActual, valores, n);
  if (!r.ok) return r;
  // El hueco se marca además de valer 0: hay funciones donde "no lo escribí"
  // y "escribí 0" no son lo mismo. Ver `Argumento.omitido`.
  return { ok: true, arg: argValor(r.columna, nodo.tipo === 'vacio') };
}

type ResultadoMatrizNodo = { ok: true; matriz: Matriz } | { ok: false; motivo: string };

function matrizDeRango(
  nodo: Extract<Nodo, { tipo: 'rango' }>,
  hojaActual: string,
  valores: Map<string, Columna>,
): ResultadoMatrizNodo {
  const ref = nodo.ref;
  if (ref.col1 === null || ref.fila1 === null || ref.col2 === null || ref.fila2 === null) {
    return { ok: false, motivo: 'Rango abierto (columna o fila entera) no soportado todavía' };
  }
  const hoja = ref.hoja ?? hojaActual;
  // F2: las claves del rango se arman una vez por nodo (y hoja) y se reutilizan en cada bloque.
  const porHoja = CLAVES_DE_RANGO.get(nodo);
  let claves = porHoja?.get(hoja);
  if (!claves) {
    claves = [];
    for (let col = ref.col1; col <= ref.col2; col++) {
      for (let fila = ref.fila1; fila <= ref.fila2; fila++) claves.push(claveCelda(hoja, col, fila));
    }
    if (porHoja) porHoja.set(hoja, claves);
    else CLAVES_DE_RANGO.set(nodo, new Map([[hoja, claves]]));
  }
  const celdas: Columna[] = new Array(claves.length);
  for (let i = 0; i < claves.length; i++) {
    const c = valores.get(claves[i] as string);
    if (!c) return { ok: false, motivo: `Referencia no resuelta a ${claves[i]}` };
    celdas[i] = c;
  }
  return { ok: true, matriz: { filas: ref.fila2 - ref.fila1 + 1, cols: ref.col2 - ref.col1 + 1, celdas } };
}

const CLAVES_DE_RANGO = new WeakMap<object, Map<string, string[]>>();

/**
 * Evalúa un nodo **como matriz**, en un contexto que la va a consumir. Un
 * valor suelto es una matriz 1×1. Las operaciones y las funciones elevables se
 * aplican celda a celda, con la difusión de Excel: una fila contra una columna
 * da la tabla entera, y donde una de las dos no llega, `#N/A`.
 */
function evaluarMatriz(
  nodo: Nodo,
  hojaActual: string,
  valores: Map<string, Columna>,
  n: number,
): ResultadoMatrizNodo {
  switch (nodo.tipo) {
    case 'rango':
      return matrizDeRango(nodo, hojaActual, valores);

    case 'matriz': {
      const filas = nodo.filas.length;
      const cols = Math.max(...nodo.filas.map((f) => f.length));
      if (nodo.filas.some((f) => f.length !== cols)) return { ok: false, motivo: 'Constante matricial con filas de distinto largo' };
      const celdas: Columna[] = [];
      for (let c = 0; c < cols; c++) {
        for (let f = 0; f < filas; f++) {
          const r = evaluarNodo((nodo.filas[f] as Nodo[])[c] as Nodo, hojaActual, valores, n);
          if (!r.ok) return r;
          celdas.push(r.columna);
        }
      }
      return { ok: true, matriz: { filas, cols, celdas } };
    }

    case 'funcion': {
      const nombre = normalizarFuncion(nodo.nombre);
      const matricial = REGISTRO_MATRICIAL[nombre];
      if (matricial) {
        const args: Matriz[] = [];
        for (const a of nodo.args) {
          if (a.tipo === 'vacio') { args.push(escalar(numeroConstante(0, n))); continue; }
          const m = evaluarMatriz(a, hojaActual, valores, n);
          if (!m.ok) return m;
          args.push(m.matriz);
        }
        return matricial(args, n);
      }
      if (ELEVABLES.has(nombre) && nodo.args.some(produceMatriz)) {
        const f = obtenerFuncion(nodo.nombre);
        if (!f) return { ok: false, motivo: `Función no soportada por el motor rápido: ${nodo.nombre}` };
        const args: Matriz[] = [];
        for (const a of nodo.args) {
          const m = evaluarMatriz(a, hojaActual, valores, n);
          if (!m.ok) return m;
          args.push(m.matriz);
        }
        return { ok: true, matriz: difundir(args, n, (celdas) => f(celdas.map((c, k) => argValor(c, (nodo.args[k] as Nodo).tipo === 'vacio')), n)) };
      }
      break;
    }

    case 'binaria': {
      const izq = evaluarMatriz(nodo.izq, hojaActual, valores, n);
      if (!izq.ok) return izq;
      const der = evaluarMatriz(nodo.der, hojaActual, valores, n);
      if (!der.ok) return der;
      let fallo: string | null = null;
      const m = difundir([izq.matriz, der.matriz], n, ([a, b]) => {
        const r = aplicarBinaria(nodo.op, a as Columna, b as Columna, n);
        if (!r.ok) { fallo = r.motivo; return errorConstante('#VALUE!', n); }
        return r.columna;
      });
      return fallo ? { ok: false, motivo: fallo } : { ok: true, matriz: m };
    }

    case 'unaria':
    case 'porcentaje': {
      const a = evaluarMatriz(nodo.arg, hojaActual, valores, n);
      if (!a.ok) return a;
      const factor = nodo.tipo === 'porcentaje' ? 1 / 100 : nodo.op === '-' ? -1 : 1;
      return { ok: true, matriz: difundir([a.matriz], n, ([c]) => escalarPor(c as Columna, factor, n)) };
    }

    default:
      break;
  }
  const r = evaluarNodo(nodo, hojaActual, valores, n);
  return r.ok ? { ok: true, matriz: escalar(r.columna) } : r;
}

/** Aplica `f` celda a celda sobre matrices difundidas a una forma común. */
function difundir(ms: Matriz[], n: number, f: (celdas: Columna[]) => Columna): Matriz {
  const filas = ms.reduce((acc, m) => (m.filas === 1 ? acc : Math.max(acc, m.filas)), 1);
  const cols = ms.reduce((acc, m) => (m.cols === 1 ? acc : Math.max(acc, m.cols)), 1);
  const na = errorConstante('#N/A', n);
  const tomar = (m: Matriz, fi: number, ci: number): Columna => {
    const ff = m.filas === 1 ? 0 : fi;
    const cc = m.cols === 1 ? 0 : ci;
    return ff < m.filas && cc < m.cols ? celdaMatriz(m, ff, cc) : na;
  };
  const celdas: Columna[] = [];
  for (let c = 0; c < cols; c++) for (let fi = 0; fi < filas; fi++) celdas.push(f(ms.map((m) => tomar(m, fi, c))));
  return { filas, cols, celdas };
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
