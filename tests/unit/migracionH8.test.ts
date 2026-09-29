/**
 * H8: migración del modelo guardado.
 */
import { describe, expect, it } from 'vitest';

import { migrarRiskModel, validarRiskModel } from '../../engine/modelo/riskModel.ts';
import { modeloVacio } from '../../engine/modelo/index.ts';

describe('migrarRiskModel', () => {
  it('uno de la versión actual pasa tal cual (copiado)', () => {
    const m = modeloVacio() as unknown as Record<string, unknown>;
    const r = migrarRiskModel(m);
    expect(r.ok && r.modelo).toEqual(m);
    expect(r.ok && r.modelo !== m).toBe(true);
  });

  it('encadena las migraciones hasta la actual', () => {
    const r = migrarRiskModel(
      { schema: 1, entradas: [] },
      { 1: (m) => ({ ...m, inputs: m.entradas }), 2: (m) => ({ ...m, marcado: true }) },
      3,
    );
    expect(r).toEqual({ ok: true, desde: 1, modelo: { schema: 3, entradas: [], inputs: [], marcado: true } });
  });

  it('uno más nuevo que el complemento no se toca y se pide actualizar', () => {
    const r = migrarRiskModel({ schema: 5 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/versión más nueva.*Actualiza el complemento/);
    const v = validarRiskModel({ schema: 5 });
    expect(v.ok).toBe(false);
  });

  it('sin versión, o sin migración para un salto, un error claro', () => {
    expect(migrarRiskModel({}).ok).toBe(false);
    const r = migrarRiskModel({ schema: 1 }, {}, 2);
    expect(!r.ok && r.motivo).toMatch(/de la v1 a la v2/);
  });
});
