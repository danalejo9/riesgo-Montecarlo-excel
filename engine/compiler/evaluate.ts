/**
 * Evaluador de referencia: junta parser + grafo + registro de funciones para
 * calcular un modelo completo, vectorizado.
 *
 * Es la versión **interpretada**, no la optimizada. Recorre el AST de cada
 * celda directamente en cada evaluación, sin el análisis de vida de buffers
 * ni el *constant folding* de Fase 2 §3.1. Existe para validar que el cálculo
 * es correcto de punta a punta (parser → grafo → funciones) antes de escribir
 * el compilador que produce el plan optimizado — ese es el siguiente paso de
 * E2, no este archivo.
 *
 * Alcance, heredado de `engine/functions/types.ts`: solo números. Una celda
 * sin fórmula y sin valor de entrada se trata como **vacía = 0**, que es la
 * coerción correcta de Excel en contexto aritmético (aunque no en todos los
 * contextos — `ISBLANK`, por ejemplo, distinguiría vacío de cero; eso queda
 * para cuando exista el canal de valores completo).
 */

import type { Grafo, NodoGrafo } from '../graph/graph.ts';
import { clausuraDependencias } from '../graph/subgraph.ts';
import { ordenarTopologicamente } from '../graph/toposort.ts';
import { claveCelda, type Nodo } from '../parser/ast.ts';
import { obtenerFuncion } from '../functions/registry.ts';
import { nuevoBuffer, type Arg, type Buffer } from '../functions/types.ts';

export interface ErrorEvaluacion {
  clave: string;
  motivo: string;
}

export type ResultadoEvaluacion =
  | { ok: true; valores: Map<string, Buffer> }
  | { ok: false; error: ErrorEvaluacion };

/**
 * Evalúa las celdas `salidas` (y todo lo que hace falta para calcularlas)
 * sobre `n` iteraciones.
 *
 * @param entradas mapa clave de celda -> buffer de N muestras ya generado
 *   (el muestreo de distribuciones es responsabilidad de otro módulo; aquí
 *   solo se inyecta el resultado).
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

  const valores = new Map<string, Buffer>();

  for (const clave of orden) {
    const entrada = entradas.get(clave);
    if (entrada) {
      if (entrada.length !== n) {
        return {
          ok: false,
          error: { clave, motivo: `El buffer de entrada tiene ${entrada.length} muestras y se esperaban ${n}` },
        };
      }
      valores.set(clave, entrada);
      continue;
    }

    const nodo = grafo.nodos.get(clave) as NodoGrafo;

    if (nodo.errorParseo) {
      return { ok: false, error: { clave, motivo: `Error de sintaxis: ${nodo.errorParseo.mensaje}` } };
    }

    if (!nodo.ast) {
      // Celda sin fórmula y sin entrada asociada: vacía. Ver nota de alcance.
      valores.set(clave, nuevoBuffer(n));
      continue;
    }

    const r = evaluarNodo(nodo.ast, nodo.hoja, valores, n);
    if (!r.ok) return { ok: false, error: { clave, motivo: r.motivo } };
    valores.set(clave, r.buffer);
  }

  return { ok: true, valores };
}

type ResultadoNodo = { ok: true; buffer: Buffer } | { ok: false; motivo: string };
type ResultadoArg = { ok: true; arg: Arg } | { ok: false; motivo: string };

function evaluarNodo(nodo: Nodo, hojaActual: string, valores: Map<string, Buffer>, n: number): ResultadoNodo {
  switch (nodo.tipo) {
    case 'numero':
      return { ok: true, buffer: constante(nodo.valor, n) };

    case 'logico':
      return { ok: true, buffer: constante(nodo.valor ? 1 : 0, n) };

    case 'vacio':
      // Neutro para SUM/IF con este subconjunto numérico; ver docstring.
      return { ok: true, buffer: constante(0, n) };

    case 'celda': {
      const clave = claveCelda(nodo.ref.hoja ?? hojaActual, nodo.ref.col, nodo.ref.fila);
      const b = valores.get(clave);
      if (!b) return { ok: false, motivo: `Referencia no resuelta a ${clave}` };
      return { ok: true, buffer: b };
    }

    case 'unaria': {
      const r = evaluarNodo(nodo.arg, hojaActual, valores, n);
      if (!r.ok) return r;
      const out = nuevoBuffer(n);
      const signo = nodo.op === '-' ? -1 : 1;
      for (let i = 0; i < n; i++) out[i] = signo * (r.buffer[i] as number);
      return { ok: true, buffer: out };
    }

    case 'porcentaje': {
      const r = evaluarNodo(nodo.arg, hojaActual, valores, n);
      if (!r.ok) return r;
      const out = nuevoBuffer(n);
      for (let i = 0; i < n; i++) out[i] = (r.buffer[i] as number) / 100;
      return { ok: true, buffer: out };
    }

    case 'binaria': {
      const izq = evaluarNodo(nodo.izq, hojaActual, valores, n);
      if (!izq.ok) return izq;
      const der = evaluarNodo(nodo.der, hojaActual, valores, n);
      if (!der.ok) return der;
      return aplicarBinaria(nodo.op, izq.buffer, der.buffer, n);
    }

    case 'funcion': {
      const f = obtenerFuncion(nodo.nombre);
      if (!f) return { ok: false, motivo: `Función no soportada por el motor rápido: ${nodo.nombre}` };

      const args: Arg[] = [];
      for (const argNodo of nodo.args) {
        const r = evaluarArgumento(argNodo, hojaActual, valores, n);
        if (!r.ok) return r;
        args.push(r.arg);
      }
      return { ok: true, buffer: f(args, n) };
    }

    case 'rango':
      return { ok: false, motivo: 'Un rango no es un valor por sí solo fuera de una función' };

    case 'nombre':
      return { ok: false, motivo: `Nombre definido no resuelto: ${nodo.nombre} (pendiente del adaptador de Excel)` };

    case 'matriz':
      return { ok: false, motivo: 'Constantes matriciales no soportadas todavía' };

    case 'no-soportado':
      return { ok: false, motivo: nodo.motivo };

    case 'texto':
      return { ok: false, motivo: 'Valores de texto no soportados todavía (ver engine/functions/types.ts)' };

    case 'error':
      return { ok: false, motivo: `La fórmula contiene el error literal ${nodo.valor}` };
  }
}

function evaluarArgumento(nodo: Nodo, hojaActual: string, valores: Map<string, Buffer>, n: number): ResultadoArg {
  if (nodo.tipo === 'rango') {
    const ref = nodo.ref;
    if (ref.col1 === null || ref.fila1 === null || ref.col2 === null || ref.fila2 === null) {
      return { ok: false, motivo: 'Rango abierto (columna o fila entera) no soportado todavía' };
    }
    const hoja = ref.hoja ?? hojaActual;
    const buffers: Buffer[] = [];
    for (let col = ref.col1; col <= ref.col2; col++) {
      for (let fila = ref.fila1; fila <= ref.fila2; fila++) {
        const clave = claveCelda(hoja, col, fila);
        const b = valores.get(clave);
        if (!b) return { ok: false, motivo: `Referencia no resuelta a ${clave}` };
        buffers.push(b);
      }
    }
    return { ok: true, arg: buffers };
  }

  const r = evaluarNodo(nodo, hojaActual, valores, n);
  if (!r.ok) return r;
  return { ok: true, arg: [r.buffer] };
}

function aplicarBinaria(op: string, a: Buffer, b: Buffer, n: number): ResultadoNodo {
  const out = nuevoBuffer(n);
  let f: (x: number, y: number) => number;

  switch (op) {
    case '+': f = (x, y) => x + y; break;
    case '-': f = (x, y) => x - y; break;
    case '*': f = (x, y) => x * y; break;
    case '/': f = (x, y) => (y === 0 ? NaN : x / y); break; // Excel: #DIV/0!
    case '^': f = (x, y) => x ** y; break;
    case '=': f = (x, y) => (x === y ? 1 : 0); break;
    case '<>': f = (x, y) => (x !== y ? 1 : 0); break;
    case '<': f = (x, y) => (x < y ? 1 : 0); break;
    case '<=': f = (x, y) => (x <= y ? 1 : 0); break;
    case '>': f = (x, y) => (x > y ? 1 : 0); break;
    case '>=': f = (x, y) => (x >= y ? 1 : 0); break;
    case '&':
      return { ok: false, motivo: 'Concatenación de texto no soportada todavía' };
    default:
      return { ok: false, motivo: `Operador no soportado: ${op}` };
  }

  for (let i = 0; i < n; i++) out[i] = f(a[i] as number, b[i] as number);
  return { ok: true, buffer: out };
}

function constante(valor: number, n: number): Buffer {
  const b = nuevoBuffer(n);
  b.fill(valor);
  return b;
}
