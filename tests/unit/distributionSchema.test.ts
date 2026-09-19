import { describe, expect, it } from 'vitest';

import { fromDescriptor, toDescriptor, type DistributionSpec } from '../../engine/modelo/distributionSchema.ts';

const CASOS: DistributionSpec[] = [
  { type: 'normal', mean: 100, stdDev: 15 },
  { type: 'lognormal', p1: 1000, p2: 200, parametrization: 'variable' },
  { type: 'lognormal', p1: 6.5, p2: 0.3, parametrization: 'log' },
  { type: 'uniform', min: 0, max: 1 },
  { type: 'triangular', min: 0, mode: 30, max: 100 },
  { type: 'pert', min: 800, mode: 950, max: 1400 },
  { type: 'pert', min: 800, mode: 950, max: 1400, lambda: 6 },
  { type: 'beta', alpha: 2, beta: 5 },
  { type: 'gamma', shape: 3, scale: 2 },
  { type: 'exponential', lambda: 0.02 },
  { type: 'weibull', shape: 2, scale: 100 },
  { type: 'bernoulli', p: 0.3 },
  { type: 'binomial', n: 20, p: 0.3 },
  { type: 'poisson', lambda: 4 },
  { type: 'discrete', values: [1, 2, 3], weights: [0.2, 0.3, 0.5] },
];

describe('toDescriptor / fromDescriptor', () => {
  it.each(CASOS)('$type hace un viaje de ida y vuelta sin perder nada', (spec) => {
    const descriptor = toDescriptor(spec);
    const deVuelta = fromDescriptor(descriptor);
    expect(deVuelta).toEqual(spec);
  });

  it('lognormal sin parametrización explícita se queda sin ella en el viaje de ida y vuelta', () => {
    // El valor por defecto ('variable') lo aplica el constructor de la
    // distribución (engine/distributions/lognormal.ts) cuando de verdad se
    // construye, no esta capa de traducción — que solo traslada lo que
    // recibe, sin inventar nada.
    const spec: DistributionSpec = { type: 'lognormal', p1: 1000, p2: 200 };
    const deVuelta = fromDescriptor(toDescriptor(spec));
    expect(deVuelta).toEqual(spec);
  });

  it('un tipo desconocido falla con un mensaje claro, no con un objeto a medias', () => {
    const espurio = { type: 'gremlin' } as unknown as DistributionSpec;
    expect(() => toDescriptor(espurio)).toThrow(/gremlin/);
  });

  it('toDescriptor produce algo que el motor de verdad puede usar (PERT real, no aproximada)', () => {
    const descriptor = toDescriptor({ type: 'pert', min: 800, mode: 950, max: 1400 });
    expect(descriptor).toEqual({ tipo: 'pert', min: 800, moda: 950, max: 1400, lambda: undefined });
  });
});
