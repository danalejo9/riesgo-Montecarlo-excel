/**
 * Las funciones que **declaran** algo del modelo desde la fórmula (resto de
 * B6), dentro del grafo que simula el motor. Sin Office.js.
 *
 * - `RIESGO.SALIDA("nombre")`: la celda es una salida aunque no esté en el
 *   panel. En Excel vale 0 (se escribe sumada: `=RIESGO.SALIDA("B")+C10`).
 * - `RIESGO.CORRELACION(C5; C6; 0,7)`: las entradas de C5 y C6 van
 *   correlacionadas. En Excel vale el coeficiente.
 *
 * Como las de resultados, el motor no las conoce: antes de simular se leen
 * (qué salidas, qué correlaciones) y cada llamada se sustituye por lo que vale
 * en Excel, para que el resto de la fórmula se calcule igual.
 */

import { reemplazarAst, type Grafo } from '../engine/graph/index.ts';
import { FUNCION_CORRELACION, FUNCION_SALIDA, idDeFuncionRiesgo } from '../engine/modelo/index.ts';
import { claveCelda, letrasDeColumna, recorrer, type Nodo } from '../engine/parser/ast.ts';
import { NUMERO } from '../engine/values/columna.ts';
import { componerDireccion } from './direcciones.ts';

/** Prefijo de los ids de las salidas declaradas con `RIESGO.SALIDA`. */
export const PREFIJO_SALIDA_FUNCION = 'rs_';

export interface SalidaDeclarada {
  /** La clave de la celda en el grafo. */
  clave: string;
  /** Para enseñar: `Pruebas!C49`. */
  direccion: string;
  /** El nombre que se le dio en la función, si se le dio. */
  nombre?: string;
}

export interface CorrelacionDeFuncion {
  /** Dónde está la función, para los mensajes. */
  direccion: string;
  claveA: string;
  claveB: string;
  coeficiente: number;
}

export interface Declaraciones {
  salidas: SalidaDeclarada[];
  correlaciones: CorrelacionDeFuncion[];
  /** Llamadas mal escritas, con su celda y el motivo. */
  errores: string[];
  /** Las celdas con alguna de estas funciones (para sustituirlas). */
  celdas: string[];
}

type Llamada = Extract<Nodo, { tipo: 'funcion' }>;

function idDe(n: Nodo): string | null {
  if (n.tipo !== 'funcion') return null;
  const id = idDeFuncionRiesgo(n.nombre);
  return id === FUNCION_SALIDA.id || id === FUNCION_CORRELACION.id ? id : null;
}

/** Lee del grafo todas las salidas y correlaciones declaradas con funciones. */
export function leerDeclaraciones(grafo: Grafo): Declaraciones {
  const out: Declaraciones = { salidas: [], correlaciones: [], errores: [], celdas: [] };
  for (const [clave, nodo] of grafo.nodos) {
    if (!nodo.ast) continue;
    const llamadas: Llamada[] = [];
    recorrer(nodo.ast, (n) => {
      if (idDe(n) !== null) llamadas.push(n as Llamada);
    });
    if (llamadas.length === 0) continue;
    out.celdas.push(clave);
    const direccion = componerDireccion(nodo.hoja, `${letrasDeColumna(nodo.col)}${nodo.fila}`);
    for (const ll of llamadas) {
      if (idDe(ll) === FUNCION_SALIDA.id) {
        const r = leerSalida(ll);
        if ('error' in r) out.errores.push(`${direccion}: ${r.error}`);
        else if (!out.salidas.some((s) => s.clave === clave)) out.salidas.push({ clave, direccion, ...(r.nombre ? { nombre: r.nombre } : {}) });
      } else {
        const r = leerCorrelacion(ll, nodo.hoja, grafo);
        if (typeof r === 'string') out.errores.push(`${direccion}: ${r}`);
        else out.correlaciones.push({ direccion, ...r });
      }
    }
  }
  return out;
}

/** El nombre que se le dio (si se le dio), o el motivo del error. */
function leerSalida(ll: Llamada): { nombre?: string } | { error: string } {
  if (ll.args.length === 0) return {};
  if (ll.args.length > 1) return { error: 'RIESGO.SALIDA lleva como mucho un argumento: el nombre' };
  const a = ll.args[0] as Nodo;
  if (a.tipo === 'vacio') return {};
  if (a.tipo === 'texto') return a.valor.trim() ? { nombre: a.valor.trim() } : {};
  return { error: 'el nombre de RIESGO.SALIDA tiene que ser un texto entre comillas' };
}

function leerCorrelacion(ll: Llamada, hoja: string, grafo: Grafo): Omit<CorrelacionDeFuncion, 'direccion'> | string {
  if (ll.args.length !== 3) return 'RIESGO.CORRELACION necesita 3 argumentos: celda1; celda2; coeficiente';
  const [a, b, c] = ll.args as [Nodo, Nodo, Nodo];
  if (a.tipo !== 'celda' || b.tipo !== 'celda') return 'los dos primeros argumentos de RIESGO.CORRELACION tienen que ser celdas (una cada uno)';
  const claveA = claveCelda(a.ref.hoja ?? hoja, a.ref.col, a.ref.fila);
  const claveB = claveCelda(b.ref.hoja ?? hoja, b.ref.col, b.ref.fila);
  if (claveA === claveB) return 'RIESGO.CORRELACION necesita dos celdas distintas';
  const coef = coeficiente(c, hoja, grafo);
  if (coef === null) return 'el coeficiente de RIESGO.CORRELACION tiene que ser un número escrito o una celda con un número';
  if (!(coef >= -1 && coef <= 1)) return `el coeficiente de RIESGO.CORRELACION tiene que estar entre -1 y 1 (es ${coef})`;
  return { claveA, claveB, coeficiente: coef };
}

function coeficiente(n: Nodo, hoja: string, grafo: Grafo): number | null {
  if (n.tipo === 'numero') return n.valor;
  if (n.tipo === 'unaria') {
    const v = coeficiente(n.arg, hoja, grafo);
    return v === null ? null : n.op === '-' ? -v : v;
  }
  if (n.tipo === 'porcentaje') {
    const v = coeficiente(n.arg, hoja, grafo);
    return v === null ? null : v / 100;
  }
  if (n.tipo === 'celda') {
    const nodo = grafo.nodos.get(claveCelda(n.ref.hoja ?? hoja, n.ref.col, n.ref.fila));
    // Solo un número escrito: si fuera una fórmula podría cambiar en cada iteración.
    return nodo && !nodo.ast && nodo.valor?.tipo === NUMERO ? nodo.valor.numero : null;
  }
  return null;
}

/** Sustituye cada llamada por lo que vale en Excel: 0 la salida, el coeficiente la correlación. */
export function sustituirDeclaraciones(grafo: Grafo, celdas: readonly string[]): void {
  for (const clave of celdas) {
    const nodo = grafo.nodos.get(clave);
    if (!nodo?.ast) continue;
    reemplazarAst(grafo, clave, sustituir(nodo.ast, nodo.hoja, grafo));
  }
}

function sustituir(n: Nodo, hoja: string, grafo: Grafo): Nodo {
  if (n.tipo === 'funcion') {
    const id = idDe(n);
    if (id === FUNCION_SALIDA.id) return { tipo: 'numero', valor: 0, pos: n.pos };
    if (id === FUNCION_CORRELACION.id) {
      const r = leerCorrelacion(n, hoja, grafo);
      return typeof r === 'string' ? { tipo: 'error', valor: '#VALUE!', pos: n.pos } : { tipo: 'numero', valor: r.coeficiente, pos: n.pos };
    }
    return { ...n, args: n.args.map((a) => sustituir(a, hoja, grafo)) };
  }
  switch (n.tipo) {
    case 'unaria':
    case 'porcentaje':
      return { ...n, arg: sustituir(n.arg, hoja, grafo) };
    case 'binaria':
      return { ...n, izq: sustituir(n.izq, hoja, grafo), der: sustituir(n.der, hoja, grafo) };
    case 'matriz':
      return { ...n, filas: n.filas.map((f) => f.map((x) => sustituir(x, hoja, grafo))) };
    default:
      return n;
  }
}

/**
 * Para compartir el libro: la fórmula sin las llamadas a `RIESGO.SALIDA`
 * (cada una pasa a ser un 0), que un Excel sin el complemento entiende.
 */
export function formulaSinSalida(formula: string): string {
  return formula.replace(/(?:_xludf\.)?(?:RIESGO|RISK)\.SALIDA\s*\(\s*(?:"(?:[^"]|"")*")?\s*\)/gi, '0');
}

/**
 * Añade a las entradas las correlaciones declaradas con `RIESGO.CORRELACION`.
 * `celdas[i]` es la celda de `entradas[i]` (la real, también para las que el
 * motor simula en una celda virtual). Si el panel ya correlacionaba esas dos
 * entradas, manda la fórmula (es lo último que se escribió en el libro).
 */
export function aplicarCorrelacionesDeFunciones<E extends { id: string; correlations: { with: string; coefficient: number }[] }>(
  entradas: readonly E[],
  celdas: readonly string[],
  correlaciones: readonly CorrelacionDeFuncion[],
  /** Para los mensajes: la dirección legible de una clave. */
  legible: (clave: string) => string = (c) => c,
): { entradas: E[]; errores: string[] } {
  const idDeCelda = new Map<string, string>();
  entradas.forEach((e, i) => {
    const c = celdas[i];
    if (c !== undefined && !idDeCelda.has(c)) idDeCelda.set(c, e.id);
  });
  const errores: string[] = [];
  const nuevas = new Map<string, { with: string; coefficient: number }[]>();
  const pares = new Map<string, number>();
  for (const c of correlaciones) {
    const a = idDeCelda.get(c.claveA);
    const b = idDeCelda.get(c.claveB);
    const falta = [!a ? c.claveA : null, !b ? c.claveB : null].filter((x): x is string => x !== null);
    if (falta.length > 0) {
      errores.push(`${c.direccion}: ${falta.map(legible).join(' y ')} no ${falta.length > 1 ? 'son entradas' : 'es una entrada'} (ni tiene una función RIESGO ni está en el panel)`);
      continue;
    }
    const par = [a, b].sort().join('\u0000');
    const previo = pares.get(par);
    if (previo !== undefined && previo !== c.coeficiente) {
      errores.push(`${c.direccion}: esas dos entradas ya se correlacionan en otra celda con otro coeficiente (${previo})`);
      continue;
    }
    pares.set(par, c.coeficiente);
    if (previo === undefined) {
      if (!nuevas.has(a as string)) nuevas.set(a as string, []);
      (nuevas.get(a as string) as { with: string; coefficient: number }[]).push({ with: b as string, coefficient: c.coeficiente });
    }
  }
  const tocado = (x: string, y: string) => pares.has([x, y].sort().join('\u0000'));
  return {
    errores,
    entradas: entradas.map((e) => ({
      ...e,
      correlations: [...e.correlations.filter((k) => !tocado(e.id, k.with)), ...(nuevas.get(e.id) ?? [])],
    })),
  };
}
