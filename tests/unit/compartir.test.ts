/**
 * «Preparar para compartir»: qué se convierte y cómo queda el modelo.
 */
import { describe, expect, it } from 'vitest';

import type { FormulaCelda } from '../../engine/graph/index.ts';
import { modeloVacio } from '../../engine/modelo/index.ts';
import { modeloParaCompartir, modeloRestaurado, planificarCompartir, PREFIJO_COMPARTIR } from '../../excel/compartirPuro.ts';

const f = (hoja: string, col: number, fila: number, formula: string): FormulaCelda => ({ hoja, col, fila, formula });

describe('planificarCompartir', () => {
  const formulas = [
    f('Pruebas', 3, 5, 'RIESGO.NORMAL(1000,150)'),
    f('Mi hoja', 3, 6, 'RIESGO.TRIANGULAR(8,10,14)'),
    f('Pruebas', 3, 7, 'C5*C6'),
    f('Pruebas', 3, 8, 'RIESGO.NORMAL(C12,150)'),
  ];
  const plan = planificarCompartir(formulas);

  it('convierte las RIESGO.* y deja su media como valor base', () => {
    expect(plan.conversiones.map((c) => c.direccion)).toEqual(['Pruebas!C5', "'Mi hoja'!C6"]);
    expect(plan.conversiones[0]).toMatchObject({ valorBase: 1000, formula: '=RIESGO.NORMAL(1000,150)', spec: { type: 'normal' } });
    expect(plan.conversiones[1]?.valorBase).toBeCloseTo(32 / 3, 12);
  });

  it('las que no se pueden convertir no se tocan, y se dice por qué', () => {
    expect(plan.noConvertibles).toHaveLength(1);
    expect(plan.noConvertibles[0]).toContain('Pruebas!C8');
  });

  it('el modelo gana una entrada por cada conversión, sin duplicar las que ya estaban en el panel', () => {
    const m = modeloVacio();
    m.inputs.push({ id: 'in_a', name: 'Demanda', ref: 'Pruebas!C5', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [] });
    const nuevo = modeloParaCompartir(m, plan);
    expect(nuevo.inputs).toHaveLength(2);
    expect(nuevo.inputs[0]?.id).toBe('in_a'); // manda el panel
    expect(nuevo.inputs[1]).toMatchObject({ ref: "'Mi hoja'!C6", dist: { type: 'triangular', min: 8, mode: 10, max: 14 } });
    expect(nuevo.inputs[1]?.id.startsWith(PREFIJO_COMPARTIR)).toBe(true);
  });

  it('restaurar quita solo las entradas que creó la preparación', () => {
    const m = modeloVacio();
    m.inputs.push({ id: 'in_a', name: 'Demanda', ref: 'Pruebas!C5', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [] });
    const preparado = modeloParaCompartir(m, plan);
    const restaurado = modeloRestaurado(preparado, ['Pruebas!C5', "'Mi hoja'!C6"]);
    expect(restaurado.inputs.map((e) => e.id)).toEqual(['in_a']);
  });
});
