/// <reference types="office-js" />
/**
 * W5: el plan de `RIESGO.CRONOGRAMA` queda guardado en el libro
 * (`workbook.settings`) y se restaura al abrir el panel, aunque el almacén
 * del navegador esté vacío (otro equipo, otra sesión).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLAVE_PLAN_CRONOGRAMA, valorDelPlan, type PlanCronogramaPublicado } from '../../engine/cronograma/planPublicado.ts';
import { guardarPlanEnLibro, leerPlanDelLibro, restaurarPlanDelLibro } from '../../excel/almacenPlanCronograma.ts';
import { leerPlanCronograma } from '../../excel/planCronograma.ts';

const g = globalThis as unknown as { Excel?: unknown; __riesgoPlanCronograma?: unknown; localStorage?: unknown };
const PLAN: PlanCronogramaPublicado = { version: 1, valores: { '|fecha': 46_584, '|dias': 118, '19|fecha': 46_584 }, nombres: { 'entrega al cliente': '19' } };

/** Lo justo de Excel: los ajustes del libro y una hoja sin fórmulas. */
function excelFalso(ajustes: Map<string, string>) {
  return {
    run: async <T>(f: (context: unknown) => Promise<T>) => f({
      sync: async () => undefined,
      workbook: {
        settings: {
          add: (k: string, v: string) => ajustes.set(k, v),
          getItemOrNullObject: (k: string) => ({ load: () => undefined, get isNullObject() { return !ajustes.has(k); }, get value() { return ajustes.get(k); } }),
        },
      },
    }),
  };
}

describe('el plan del cronograma dentro del libro (W5)', () => {
  const ajustes = new Map<string, string>();
  beforeEach(() => {
    ajustes.clear();
    g.Excel = excelFalso(ajustes);
    delete g.__riesgoPlanCronograma;
  });
  afterEach(() => {
    delete g.Excel;
    delete g.__riesgoPlanCronograma;
  });

  it('se guarda en los ajustes del libro y se publica para las funciones', async () => {
    await guardarPlanEnLibro(PLAN);
    expect(JSON.parse(ajustes.get(CLAVE_PLAN_CRONOGRAMA) as string)).toEqual(PLAN);
    expect(valorDelPlan(await leerPlanCronograma(), 'Entrega al cliente', 'fecha')).toBe(46_584);
  });

  it('en otro equipo (sin nada en memoria) se lee del libro', async () => {
    ajustes.set(CLAVE_PLAN_CRONOGRAMA, JSON.stringify(PLAN));
    expect(await leerPlanDelLibro()).toEqual(PLAN);
  });

  it('un libro sin plan, o con uno ilegible, no publica nada', async () => {
    expect(await restaurarPlanDelLibro()).toBe(false);
    ajustes.set(CLAVE_PLAN_CRONOGRAMA, '{roto');
    expect(await leerPlanDelLibro()).toBeNull();
    expect(await restaurarPlanDelLibro()).toBe(false);
    expect(g.__riesgoPlanCronograma).toBeUndefined();
  });
});
