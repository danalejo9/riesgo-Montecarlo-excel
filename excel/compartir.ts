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
import { cargarResolverRef } from './resolverRef.ts';
import { leerNombresSugeridos } from './etiquetasEnExcel.ts';
import type { ModeloRiesgo } from '../engine/modelo/index.ts';

export const CLAVE_FORMULAS_COMPARTIDAS = 'riesgoMontecarlo.sharedFormulas';

export interface ResultadoPreparar {
  modelo: ModeloRiesgo;
  plan: PlanCompartir;
}

export async function prepararParaCompartir(modelo: ModeloRiesgo): Promise<ResultadoPreparar> {
  const libro = await leerLibro();
  // Las entradas del panel, como claves: una RIESGO que dependa de ellas no es fija.
  const resolucion = modelo.inputs.length > 0 ? await cargarResolverRef(modelo.inputs.map((e) => e.ref)) : null;
  const clavesPanel = modelo.inputs.flatMap((e) => {
    try {
      return resolucion ? [resolucion.resolver(e.ref)] : [];
    } catch {
      return [];
    }
  });
  const plan = planificarCompartir(libro.formulas, libro.valores, clavesPanel);
  if (plan.conversiones.length === 0 && plan.congelar.length === 0) return { modelo, plan };
  const direccionesConNombre = [...plan.conversiones.map((c) => c.direccion), ...plan.salidas.filter((s) => !s.nombre).map((s) => s.direccion)];

  await Excel.run(async (context) => {
    // Las fórmulas guardadas se suman a las de una preparación anterior.
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_FORMULAS_COMPARTIDAS);
    ajuste.load(['value', 'isNullObject']);
    // Las que se fijan en su valor actual: hay que leerlo antes de escribir.
    const congeladas = plan.congelar.map((c) => {
      const rango = rangoDesdeDireccion(context, c.direccion);
      rango.load('values');
      return { c, rango };
    });
    await context.sync();
    const previas: Record<string, string> = ajuste.isNullObject ? {} : leerRegistro(ajuste.value);
    for (const c of plan.conversiones) {
      previas[c.direccion] = c.formula;
      rangoDesdeDireccion(context, c.direccion).values = [[c.valorBase]];
    }
    for (const { c, rango } of congeladas) {
      previas[c.direccion] = c.formula;
      if (c.formulaNueva) {
        rango.formulas = [[c.formulaNueva]];
      } else {
        const actuales = rango.values;
        rango.values = actuales;
      }
    }
    context.workbook.settings.add(CLAVE_FORMULAS_COMPARTIDAS, JSON.stringify(previas));
    await context.sync();
  });

  // Con nombre legible («Demanda», no «Pruebas!C5»): prueba J1 del 29/09.
  const nombres = await leerNombresSugeridos(direccionesConNombre).catch(() => new Map<string, string>());
  return { modelo: modeloParaCompartir(modelo, plan, nombres), plan };
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
