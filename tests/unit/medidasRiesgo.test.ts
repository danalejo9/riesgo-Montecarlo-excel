import { describe, expect, it } from 'vitest';

import { medidasDeRiesgo } from '../../engine/stats/index.ts';

describe('medidasDeRiesgo (H2)', () => {
  it('uniforme 0..99: colas, CVaR y forma', () => {
    const m = medidasDeRiesgo(Float64Array.from({ length: 100 }, (_, i) => i))!;
    expect(m.varInferior).toBe(4);
    expect(m.cvarInferior).toBe(2); // media de 0..4
    expect(m.varSuperior).toBe(95);
    expect(m.cvarSuperior).toBe(97);
    expect(m.asimetria).toBeCloseTo(0, 10);
    expect(m.curtosis).toBeCloseTo(-1.2, 2); // uniforme: −1,2
    expect(m.semidesviacion).toBeGreaterThan(0);
  });

  it('una cola larga a la derecha da asimetría positiva', () => {
    const datos = Float64Array.from([...Array.from({ length: 95 }, () => 1), 10, 20, 30, 40, 50]);
    expect(medidasDeRiesgo(datos.sort())!.asimetria).toBeGreaterThan(1);
  });

  it('con muy pocos datos no se calcula', () => {
    expect(medidasDeRiesgo([1, 2, 3])).toBeNull();
  });
});
