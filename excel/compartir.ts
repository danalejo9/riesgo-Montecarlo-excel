/**
 * «Preparar para compartir» y «Restaurar funciones RIESGO»: la escritura en
 * el libro. La lógica está en `compartirPuro.ts`.
 *
 * Preparar: cada `RIESGO.*` pasa a ser entrada del panel y la celda recibe su
 * media; las fórmulas originales se guardan en `workbook.settings`
 * (`riesgoMontecarlo.sharedFormulas`). Restaurar: vuelven las fórmulas y se
 * quitan del panel las entradas que había creado la preparación.
 */

import { leerLibro } from './lectorLibro.ts';
import { modeloParaCompartir, modeloRestaurado, planificarCompartir, type PlanCompartir } from './compartirPuro.ts';
import { rangoDesdeDireccion } from './rangos.ts';
import type { ModeloRiesgo } from '../engine/modelo/index.ts';

export const CLAVE_FORMULAS_COMPARTIDAS = 'riesgoMontecarlo.sharedFormulas';

export interface ResultadoPreparar {
  modelo: ModeloRiesgo;
  plan: PlanCompartir;
}

export async function prepararParaCompartir(modelo: ModeloRiesgo): Promise<ResultadoPreparar> {
  const libro = await leerLibro();
  const plan = planificarCompartir(libro.formulas, libro.valores);
  if (plan.conversiones.length === 0) return { modelo, plan };

  await Excel.run(async (context) => {
    // Las fórmulas guardadas se suman a las de una preparación anterior.
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_FORMULAS_COMPARTIDAS);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();
    const previas: Record<string, string> = ajuste.isNullObject ? {} : leerRegistro(ajuste.value);
    for (const c of plan.conversiones) {
      previas[c.direccion] = c.formula;
      rangoDesdeDireccion(context, c.direccion).values = [[c.valorBase]];
    }
    context.workbook.settings.add(CLAVE_FORMULAS_COMPARTIDAS, JSON.stringify(previas));
    await context.sync();
  });

  return { modelo: modeloParaCompartir(modelo, plan), plan };
}

/** ¿Hay fórmulas RIESGO guardadas por una preparación anterior? Cuántas. */
export async function formulasCompartidasGuardadas(): Promise<number> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_FORMULAS_COMPARTIDAS);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();
    return ajuste.isNullObject ? 0 : Object.keys(leerRegistro(ajuste.value)).length;
  });
}

export async function restaurarFuncionesRiesgo(modelo: ModeloRiesgo): Promise<{ modelo: ModeloRiesgo; restauradas: number }> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_FORMULAS_COMPARTIDAS);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();
    if (ajuste.isNullObject) return { modelo, restauradas: 0 };
    const registro = leerRegistro(ajuste.value);
    for (const [direccion, formula] of Object.entries(registro)) {
      rangoDesdeDireccion(context, direccion).formulas = [[formula]];
    }
    ajuste.delete();
    await context.sync();
    const direcciones = Object.keys(registro);
    return { modelo: modeloRestaurado(modelo, direcciones), restauradas: direcciones.length };
  });
}

function leerRegistro(valor: unknown): Record<string, string> {
  try {
    const j = JSON.parse(typeof valor === 'string' ? valor : String(valor)) as unknown;
    if (!j || typeof j !== 'object') return {};
    return Object.fromEntries(Object.entries(j as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}
