/**
 * W5: el plan del cronograma (lo que enseña `RIESGO.CRONOGRAMA` fuera de la
 * simulación) guardado **dentro del libro**, en `workbook.settings`, como el
 * modelo y los resultados. Así viaja con el archivo: en otro equipo, o al
 * reabrirlo, las celdas enseñan el plan en cuanto se abre el panel, sin
 * tener que pulsar «Calcular cronograma» otra vez.
 *
 * Al guardar o restaurar, además se publica para las funciones
 * (`planCronograma.ts`: memoria y almacén de Office) y se refrescan las
 * celdas que ya habían dicho «calcula el cronograma».
 */

import { CLAVE_PLAN_CRONOGRAMA, leerPlanPublicado, type PlanCronogramaPublicado } from '../engine/cronograma/planPublicado.ts';
import { construirGrafo } from '../engine/graph/index.ts';
import { letrasDeColumna } from '../engine/parser/ast.ts';
import { celdasParaRefrescar, refrescarCeldas } from './almacenResultadosHoja.ts';
import { componerDireccion } from './direcciones.ts';
import { leerLibro } from './lectorLibro.ts';
import { guardarPlanCronograma } from './planCronograma.ts';

/** La clave en `workbook.settings` (la misma que en el almacén, que ya lleva prefijo). */
export const CLAVE_PLAN_EN_LIBRO = CLAVE_PLAN_CRONOGRAMA;

/** Guarda el plan en el libro y lo publica para las funciones. Hay que guardar el archivo para que dure. */
export async function guardarPlanEnLibro(plan: PlanCronogramaPublicado): Promise<void> {
  await guardarPlanCronograma(plan);
  await Excel.run(async (context) => {
    context.workbook.settings.add(CLAVE_PLAN_EN_LIBRO, JSON.stringify(plan));
    await context.sync();
  });
  await refrescarCeldas(celdasParaRefrescar());
}

/** El plan guardado en el libro, o `null`. */
export async function leerPlanDelLibro(): Promise<PlanCronogramaPublicado | null> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_PLAN_EN_LIBRO);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();
    if (ajuste.isNullObject) return null;
    return leerPlanPublicado(typeof ajuste.value === 'string' ? ajuste.value : JSON.stringify(ajuste.value));
  });
}

/**
 * Al abrir el panel: si el libro trae un plan, se publica y se refrescan las
 * celdas con `RIESGO.CRONOGRAMA`. Con runtime compartido, las que dijeron
 * «calcula el cronograma» se apuntaron solas; sin él, se buscan en el libro.
 */
export async function restaurarPlanDelLibro(): Promise<boolean> {
  const plan = await leerPlanDelLibro();
  if (!plan) return false;
  await guardarPlanCronograma(plan);
  const pendientes = celdasParaRefrescar();
  if (pendientes.length > 0) {
    await refrescarCeldas(pendientes);
    return true;
  }
  const libro = await leerLibro();
  const conCronograma = libro.formulas.filter((f) => /\b(?:RIESGO|RISK)\.CRONOGRAMA\s*\(/i.test(f.formula));
  if (conCronograma.length === 0) return true;
  const { grafo } = construirGrafo(conCronograma);
  await refrescarCeldas([...grafo.nodos.values()].filter((n) => n.ast).map((n) => componerDireccion(n.hoja, `${letrasDeColumna(n.col)}${n.fila}`)));
  return true;
}
