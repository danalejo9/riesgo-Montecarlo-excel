import { describe, expect, it } from 'vitest';

import { construirDesdeDescriptor } from '../../engine/distributions/index.ts';
import { leerFuncionRiesgo, problemaDeDistribucion, resumirDistribucion, toDescriptor } from '../../engine/modelo/index.ts';

describe('B4: truncado, RIESGO.DISCRETA y RIESGO.LOGNORMAL2', () => {
  it('una normal acotada no sale de sus límites y conserva la simetría', () => {
    const d = construirDesdeDescriptor(toDescriptor({ type: 'normal', mean: 100, stdDev: 20, truncate: { min: 80, max: 120 } }));
    expect(d.quantile(0.0001)).toBeGreaterThanOrEqual(80);
    expect(d.quantile(0.9999)).toBeLessThanOrEqual(120);
    expect(d.mean()).toBeCloseTo(100, 3);
    expect(resumirDistribucion({ type: 'normal', mean: 100, stdDev: 20, truncate: { min: 80, max: 120 } })).toBe('Normal(100; 20) acotada [80; 120]');
  });

  it('un solo límite vale; límites imposibles se avisan', () => {
    const d = construirDesdeDescriptor(toDescriptor({ type: 'normal', mean: 0, stdDev: 1, truncate: { min: 0 } }));
    expect(d.quantile(0.001)).toBeGreaterThanOrEqual(0);
    expect(problemaDeDistribucion({ type: 'normal', mean: 0, stdDev: 1, truncate: { min: 5, max: 2 } })).toMatch(/min < max/);
  });

  it('RIESGO.TRUNCAR envuelve otra función RIESGO', () => {
    const r = leerFuncionRiesgo('RIESGO.TRUNCAR(RIESGO.NORMAL(100,20),80,120)');
    expect(r).toMatchObject({ ok: true, spec: { type: 'normal', mean: 100, stdDev: 20, truncate: { min: 80, max: 120 } } });
    expect(leerFuncionRiesgo('RIESGO.TRUNCAR(5,1,2)')).toMatchObject({ ok: false });
  });

  it('RIESGO.DISCRETA con listas; su media', () => {
    const r = leerFuncionRiesgo('RIESGO.DISCRETA({1;2;3},{1;1;2})');
    expect(r).toMatchObject({ ok: true, spec: { type: 'discrete', values: [1, 2, 3], weights: [1, 1, 2] } });
    if (r.ok) expect(r.media).toBeCloseTo(2.25, 10);
    expect(leerFuncionRiesgo('RIESGO.DISCRETA({"a";"b"},{1;1})')).toMatchObject({ ok: false });
  });

  it('RIESGO.LOGNORMAL2 usa los parámetros del logaritmo', () => {
    const r = leerFuncionRiesgo('RIESGO.LOGNORMAL2(0,0.5)');
    expect(r).toMatchObject({ ok: true, spec: { type: 'lognormal', parametrization: 'log' } });
    if (r.ok) expect(r.media).toBeCloseTo(Math.exp(0.125), 6);
  });
});
