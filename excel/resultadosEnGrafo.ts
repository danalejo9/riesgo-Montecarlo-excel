/**
 * Las funciones de resultados (`RIESGO.MEDIA(C32)`…, B6) dentro del grafo que
 * simula el motor. Sin Office.js.
 *
 * El motor no las conoce, y si una salida dependiera de una de ellas mandaría
 * el modelo entero al modo compatible. Pero durante una simulación valen lo
 * mismo en todas las iteraciones: lo que dio la **simulación anterior**. Así
 * que antes de simular cada llamada se sustituye por ese número (o por el
 * error que daría en la celda: `#N/A` si todavía no hay resultados).
 */

import { reemplazarAst, type Grafo } from '../engine/graph/index.ts';
import { contieneFuncionResultado, esFuncionDeResultado, idDeFuncionRiesgo } from '../engine/modelo/index.ts';
import { claveCelda, type ErrorExcel, type Nodo } from '../engine/parser/ast.ts';
import { buscarSalida, valorFuncionResultado, type AlmacenResultadosHoja } from './resultadosEnHoja.ts';

/** Las celdas del grafo con alguna función de resultados. */
export function celdasConFuncionesResultado(grafo: Grafo): string[] {
  const out: string[] = [];
  for (const [clave, nodo] of grafo.nodos) {
    if (nodo.ast && contieneFuncionResultado(nodo.ast)) out.push(clave);
  }
  return out;
}

const ERRORES: Record<'na' | 'valor' | 'num', ErrorExcel> = { na: '#N/A', valor: '#VALUE!', num: '#NUM!' };

/** Sustituye en esas celdas cada llamada por su valor con los resultados de `almacen`. */
export function sustituirFuncionesResultado(grafo: Grafo, celdas: readonly string[], almacen: AlmacenResultadosHoja | null): void {
  for (const clave of celdas) {
    const nodo = grafo.nodos.get(clave);
    if (!nodo?.ast) continue;
    reemplazarAst(grafo, clave, sustituir(nodo.ast, nodo.hoja, almacen));
  }
}

function sustituir(n: Nodo, hoja: string, almacen: AlmacenResultadosHoja | null): Nodo {
  if (n.tipo === 'funcion') {
    const id = idDeFuncionRiesgo(n.nombre);
    if (id !== null && esFuncionDeResultado(id)) return valorDeLlamada(id, n, hoja, almacen);
    return { ...n, args: n.args.map((a) => sustituir(a, hoja, almacen)) };
  }
  switch (n.tipo) {
    case 'unaria':
    case 'porcentaje':
      return { ...n, arg: sustituir(n.arg, hoja, almacen) };
    case 'binaria':
      return { ...n, izq: sustituir(n.izq, hoja, almacen), der: sustituir(n.der, hoja, almacen) };
    case 'matriz':
      return { ...n, filas: n.filas.map((f) => f.map((x) => sustituir(x, hoja, almacen))) };
    default:
      return n;
  }
}

function valorDeLlamada(id: string, n: Extract<Nodo, { tipo: 'funcion' }>, hoja: string, almacen: AlmacenResultadosHoja | null): Nodo {
  const error = (e: ErrorExcel): Nodo => ({ tipo: 'error', valor: e, pos: n.pos });
  const [celda, ...resto] = n.args;
  if (!celda || celda.tipo !== 'celda') return error('#VALUE!');
  const args: unknown[] = [];
  for (const a of resto) {
    const v = literal(a);
    if (v === undefined) return error('#VALUE!'); // un argumento calculado: no se sustituye a ciegas
    args.push(v);
  }
  const clave = claveCelda(celda.ref.hoja ?? hoja, celda.ref.col, celda.ref.fila);
  const r = valorFuncionResultado(id, buscarSalida(almacen, clave), args);
  return r.ok ? { tipo: 'numero', valor: r.valor, pos: n.pos } : error(ERRORES[r.error]);
}

function literal(a: Nodo): unknown {
  switch (a.tipo) {
    case 'numero':
    case 'texto':
    case 'logico':
      return a.valor;
    case 'vacio':
      return null;
    case 'unaria':
      return a.arg.tipo === 'numero' ? (a.op === '-' ? -a.arg.valor : a.arg.valor) : undefined;
    default:
      return undefined;
  }
}
