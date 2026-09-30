/**
 * Opciones de decisión (T9): celdas con `RIESGO.DECISION(…)`, que no son
 * aleatorias. La simulación se repite con cada opción (o cada combinación, si
 * hay varias decisiones) con los **mismos números aleatorios**, así que las
 * diferencias entre opciones son de la decisión y no del azar. Sin Office.js.
 */

import { reemplazarAst, type Grafo } from '../engine/graph/index.ts';
import { clausuraDependencias } from '../engine/graph/subgraph.ts';
import { FUNCION_DECISION, idDeFuncionRiesgo } from '../engine/modelo/index.ts';
import { claveCelda, letrasDeColumna, recorrer, type Nodo } from '../engine/parser/ast.ts';
import { NUMERO, TEXTO } from '../engine/values/columna.ts';
import { componerDireccion } from './direcciones.ts';

export type ValorDecision = number | string;

export interface Decision {
  clave: string;
  direccion: string;
  opciones: ValorDecision[];
}

/** Como mucho, estas combinaciones: cada una es una simulación entera. */
export const MAX_COMBINACIONES = 16;
const MAX_OPCIONES = 20;

const esDecision = (n: Nodo) => n.tipo === 'funcion' && idDeFuncionRiesgo(n.nombre) === FUNCION_DECISION.id;

export function leerDecisiones(
  grafo: Grafo,
  /**
   * Las salidas: solo cuentan las decisiones de las que depende alguna. Una
   * `RIESGO.DECISION` en otra hoja que no toca nada no multiplica la
   * simulación por sus opciones. Sin salidas, todas (para las pruebas).
   */
  clavesSalida?: readonly string[],
): { decisiones: Decision[]; errores: string[] } {
  const decisiones: Decision[] = [];
  const errores: string[] = [];
  const ambito = clavesSalida ? clausuraDependencias(grafo, clavesSalida) : null;
  for (const [clave, nodo] of grafo.nodos) {
    if (!nodo.ast) continue;
    if (ambito && !ambito.has(clave)) continue;
    let hay = false;
    recorrer(nodo.ast, (n) => {
      if (esDecision(n)) hay = true;
    });
    if (!hay) continue;
    const direccion = componerDireccion(nodo.hoja, `${letrasDeColumna(nodo.col)}${nodo.fila}`);
    const raiz = nodo.ast;
    if (raiz.tipo !== 'funcion' || !esDecision(raiz)) {
      errores.push(`${direccion}: RIESGO.DECISION tiene que ser toda la fórmula de la celda`);
      continue;
    }
    const opciones = opcionesDe(raiz.args, nodo.hoja, grafo);
    if (typeof opciones === 'string') errores.push(`${direccion}: ${opciones}`);
    else decisiones.push({ clave, direccion, opciones });
  }
  const combinaciones = decisiones.reduce((p, d) => p * d.opciones.length, 1);
  if (decisiones.length > 0 && combinaciones > MAX_COMBINACIONES) {
    errores.push(`Las decisiones dan ${combinaciones} combinaciones, y cada una es una simulación entera: como mucho ${MAX_COMBINACIONES}. Quita opciones o decisiones.`);
  }
  return { decisiones, errores };
}

function opcionesDe(args: readonly Nodo[], hoja: string, grafo: Grafo): ValorDecision[] | string {
  const out: ValorDecision[] = [];
  const valorDe = (n: Nodo): ValorDecision | null | undefined => {
    if (n.tipo === 'numero' || n.tipo === 'texto') return n.valor;
    if (n.tipo === 'unaria' && n.arg.tipo === 'numero') return n.op === '-' ? -n.arg.valor : n.arg.valor;
    if (n.tipo === 'porcentaje' && n.arg.tipo === 'numero') return n.arg.valor / 100;
    if (n.tipo === 'vacio') return null;
    if (n.tipo === 'celda') return valorCelda(claveCelda(n.ref.hoja ?? hoja, n.ref.col, n.ref.fila));
    return undefined;
  };
  const valorCelda = (clave: string): ValorDecision | null | undefined => {
    const nodo = grafo.nodos.get(clave);
    if (!nodo) return null; // vacía
    if (nodo.ast) return undefined; // una fórmula: podría cambiar
    if (nodo.valor?.tipo === NUMERO) return nodo.valor.numero;
    if (nodo.valor?.tipo === TEXTO) return nodo.valor.texto;
    return null;
  };
  for (const a of args) {
    if (a.tipo === 'matriz') {
      for (const x of a.filas.flat()) {
        const v = valorDe(x);
        if (v === undefined) return 'las opciones de RIESGO.DECISION tienen que ser números o textos escritos';
        if (v !== null) out.push(v);
      }
      continue;
    }
    if (a.tipo === 'rango') {
      const { col1, fila1, col2, fila2 } = a.ref;
      if (col1 === null || fila1 === null || col2 === null || fila2 === null) return 'el rango de RIESGO.DECISION tiene que tener principio y fin (A1:A3)';
      if ((col2 - col1 + 1) * (fila2 - fila1 + 1) > 200) return 'el rango de RIESGO.DECISION es demasiado grande';
      for (let f = fila1; f <= fila2; f++) {
        for (let c = col1; c <= col2; c++) {
          const v = valorCelda(claveCelda(a.ref.hoja ?? hoja, c, f));
          if (v === undefined) return 'las celdas del rango de RIESGO.DECISION tienen que tener valores escritos, no fórmulas';
          if (v !== null) out.push(v);
        }
      }
      continue;
    }
    const v = valorDe(a);
    if (v === undefined) return 'las opciones de RIESGO.DECISION tienen que ser números o textos escritos (o un rango con ellos)';
    if (v !== null) out.push(v);
  }
  if (out.length < 2) return 'RIESGO.DECISION necesita al menos 2 opciones';
  if (out.length > MAX_OPCIONES) return `RIESGO.DECISION admite como mucho ${MAX_OPCIONES} opciones`;
  return out;
}

/** Todas las combinaciones de opciones, como índices; la primera es la de la hoja (todas en su primera opción). */
export function combinaciones(decisiones: readonly Decision[]): number[][] {
  let out: number[][] = [[]];
  for (const d of decisiones) out = out.flatMap((c) => d.opciones.map((_, i) => [...c, i]));
  return out;
}

/** Pone cada celda de decisión en la opción de la combinación. */
export function fijarCombinacion(grafo: Grafo, decisiones: readonly Decision[], combinacion: readonly number[]): void {
  decisiones.forEach((d, k) => {
    const v = d.opciones[combinacion[k] ?? 0] as ValorDecision;
    reemplazarAst(grafo, d.clave, typeof v === 'number' ? { tipo: 'numero', valor: v, pos: 0 } : { tipo: 'texto', valor: v, pos: 0 });
  });
}

/** «Proveedor B», o «Proveedor B · 70 %» si hay varias decisiones. */
export function etiquetaCombinacion(decisiones: readonly Decision[], combinacion: readonly number[]): string {
  return decisiones
    .map((d, k) => {
      const v = d.opciones[combinacion[k] ?? 0] as ValorDecision;
      return typeof v === 'number' ? v.toLocaleString('es-ES', { maximumFractionDigits: 6 }) : v;
    })
    .join(' · ');
}

/** Lo que se compara de cada salida con cada opción. */
export interface SalidaEnOpcion {
  id: string;
  media: number;
  desviacion: number;
  p5?: number;
  p50?: number;
  p95?: number;
  /** P(umbral) de la salida, si tiene umbral. */
  probUmbral?: number;
  /** En una salida de texto: el valor más frecuente y su proporción. */
  moda?: { valor: string; proporcion: number };
}

export interface ResultadoDecisiones {
  /** Las celdas de decisión, con su nombre. */
  celdas: { direccion: string; nombre: string }[];
  opciones: { etiqueta: string; salidas: SalidaEnOpcion[] }[];
}
