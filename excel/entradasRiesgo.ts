/**
 * Las entradas que el libro declara con funciones `RIESGO.*`, convertidas en
 * entradas del modelo para esta simulación. Sin Office.js.
 *
 * Se suman a las del panel sin tocar el modelo guardado: la fuente de verdad
 * de una entrada `RIESGO.*` es la celda, y si alguien cambia la fórmula la
 * siguiente simulación ya lo ve. Si una celda está a la vez en el panel y con
 * una función `RIESGO.*`, **manda el panel** (es una decisión explícita del
 * usuario) y se avisa.
 *
 * Solo cuentan las celdas de las que depende alguna salida: una `RIESGO.*`
 * suelta en una hoja que no afecta a nada no debe llenar el tornado de ceros.
 */

import type { FormulaCelda, Grafo } from '../engine/graph/index.ts';
import type { Nodo } from '../engine/parser/ast.ts';
import { analizarRiesgoEnGrafo, type EntradaRiskModel } from '../engine/modelo/index.ts';

export interface EntradasDeFunciones {
  entradas: EntradaRiskModel[];
  /** La clave del grafo de cada entrada (una celda, o una celda virtual en los casos de B7). */
  claves: string[];
  /** Celdas con `RIESGO.*` que no se pueden usar, con el motivo. */
  errores: string[];
  /** Celdas que están en el panel y además tienen `RIESGO.*`: se usa el panel. */
  duplicadas: string[];
  /** Referencia de cada entrada → su clave en el grafo. */
  claveDeRef: Map<string, string>;
  /** La celda del libro de cada entrada, por id. */
  celdaDeEntrada: Map<string, string>;
  /** Cómo contar la distribución de las entradas de apoyo (parámetros que cambian). */
  descripciones: Map<string, string>;
  /** Celdas cuya fórmula se reescribió (RIESGO dentro de una operación o con parámetros aleatorios). */
  reescritas: string[];
  /** Las fórmulas nuevas de esas celdas, para aplicarlas al grafo antes de simular. */
  reescrituras: Map<string, Nodo>;
  /** Por qué se reescribió cada una. */
  motivosReescritura: Map<string, string>;
  /** Reescritas que el modo compatible no puede simular (B1b), con el motivo. */
  noCompatibles: Map<string, string>;
}

/**
 * Las entradas que declaran las funciones RIESGO de las que depende alguna
 * salida. Toda la lógica está en `engine/modelo/riesgoEnGrafo.ts`; `formulas`
 * ya están en el grafo y se mantiene por compatibilidad.
 */
export function entradasDeFunciones(
  _formulas: readonly FormulaCelda[],
  grafo: Grafo,
  clavesEntradaPanel: readonly string[],
  clavesSalida: readonly string[],
  /** El nombre legible de la celda (E5); sin él, la entrada se llama como su clave. */
  nombrar?: (clave: string, hoja: string, col: number, fila: number) => string,
): EntradasDeFunciones {
  const r = analizarRiesgoEnGrafo(grafo, { clavesEntradaPanel, clavesSalida, ...(nombrar ? { nombrar } : {}) });
  return {
    entradas: r.entradas,
    claves: r.claves,
    errores: r.errores,
    duplicadas: r.duplicadas,
    claveDeRef: r.claveDeRef,
    celdaDeEntrada: r.celdaDeEntrada,
    descripciones: r.descripciones,
    reescritas: r.reescritas,
    reescrituras: r.reescrituras,
    motivosReescritura: r.motivosReescritura,
    noCompatibles: r.noCompatibles,
  };
}

/**
 * El resolvedor de referencias ampliado con las celdas `RIESGO.*`.
 *
 * El del panel (`cargarResolverRef`) solo conoce las referencias que se le
 * pidieron antes de leer el libro; las entradas de funciones se descubren
 * después, y su `ref` ya es la clave canónica de la celda. Sin esto,
 * preparar la simulación fallaba con «Referencia sin resolver» en cuanto una
 * salida dependía de una `RIESGO.*` (primera prueba en Excel, 27/09).
 */
export function resolverConFunciones(
  resolver: (ref: string) => string,
  deFunciones: Pick<EntradasDeFunciones, 'claves'> & Partial<Pick<EntradasDeFunciones, 'claveDeRef'>>,
): (ref: string) => string {
  if (deFunciones.claves.length === 0) return resolver;
  const propias = deFunciones.claveDeRef ?? new Map(deFunciones.claves.map((c) => [c, c] as const));
  return (ref) => propias.get(ref) ?? resolver(ref);
}
