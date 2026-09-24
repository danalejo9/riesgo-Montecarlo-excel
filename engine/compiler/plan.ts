/**
 * Compilador: analiza el grafo una vez y produce un `Plan` que el ejecutor
 * (`executor.ts`) recorre en cada simulación, en vez de repetir el análisis
 * cada vez. Es el primer paso del "AST → plan vectorizado" de Fase 2 §3 —
 * hoy cubre orden de evaluación y *constant folding*; la vida de buffers con
 * reutilización de memoria (no solo liberación para el recolector de basura)
 * queda para cuando el ejecutor por bloques lo necesite de verdad.
 *
 * **Constant folding**, la parte central de este archivo: `subgrafoRelevante`
 * (ver `engine/graph/subgraph.ts`) ya distingue, para un `grafo` y unas
 * `entradas`/`salidas` dadas, qué celdas de la clausura de las salidas
 * dependen de alguna entrada incierta y cuáles no. Una celda que hace falta
 * calcular pero que no está en ese subgrafo es **constante durante toda la
 * simulación** — la tabla de tarifas fija del ejemplo de Fase 2 §4.2, o
 * cualquier subexpresión que no toque ninguna entrada. El ejecutor la evalúa
 * una sola vez (`n=1`) en vez de las `n` iteraciones completas, y solo
 * "difunde" (`fill`) el resultado a un buffer de `n` si de verdad hace falta
 * — porque alguna celda no constante la consume, o porque es ella misma una
 * salida pedida.
 */
import type { Grafo } from '../graph/graph.ts';
import { clausuraDependencias, subgrafoRelevante } from '../graph/subgraph.ts';
import { ordenarTopologicamente } from '../graph/toposort.ts';

export interface ErrorPlan {
  clave: string;
  motivo: string;
}

export interface Plan {
  /** Claves en orden de evaluación (topológico), restringido a lo necesario para `salidas`. */
  orden: string[];
  /** Celdas de `orden` que no dependen de ninguna entrada: se evalúan una vez, no `n` veces. */
  esConstante: ReadonlySet<string>;
  salidas: string[];
}

export type ResultadoPlan = { ok: true; plan: Plan } | { ok: false; error: ErrorPlan };

export function compilarPlan(grafo: Grafo, entradas: ReadonlySet<string>, salidas: string[]): ResultadoPlan {
  const necesarias = clausuraDependencias(grafo, salidas);
  const { orden, enCiclo } = ordenarTopologicamente(grafo, necesarias);

  for (const clave of orden) {
    if (enCiclo.has(clave)) {
      return { ok: false, error: { clave, motivo: 'Referencia circular: esta celda forma parte de un ciclo' } };
    }
  }

  // relevante ⊆ necesarias: todo lo que sí depende de alguna entrada.
  // Lo que queda de `necesarias` fuera de `relevante` (y no es ella misma una
  // entrada) es exactamente lo constante — ver docstring de `subgrafoRelevante`.
  const relevante = subgrafoRelevante(grafo, entradas, salidas);
  const esConstante = new Set<string>();
  for (const clave of orden) {
    if (!entradas.has(clave) && !relevante.has(clave)) esConstante.add(clave);
  }

  return { ok: true, plan: { orden, esConstante, salidas } };
}
