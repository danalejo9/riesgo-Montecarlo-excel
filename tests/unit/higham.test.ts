import { describe, expect, it } from 'vitest';
import { correlacionMasCercana, esDefinidaPositiva } from '../../engine/sampling/index.ts';

describe('matriz de correlación más cercana (Higham)', () => {
  it('reproduce el ejemplo del artículo de Higham (2002)', () => {
    const r = correlacionMasCercana([[1, 1, 0], [1, 1, 1], [0, 1, 1]]);
    expect(esDefinidaPositiva(r.matriz)).toBe(true);
    expect(r.matriz[0]![1]).toBeCloseTo(0.7607, 3);
    expect(r.matriz[0]![2]).toBeCloseTo(0.1573, 3);
    expect(r.matriz[1]![2]).toBeCloseTo(0.7607, 3);
    expect(r.matriz[1]![1]).toBe(1);
  });

  it('corrige la contradicción de tres variables y deja intacta una matriz válida', () => {
    const mala = [[1, 0.9, -0.9], [0.9, 1, 0.9], [-0.9, 0.9, 1]];
    const r = correlacionMasCercana(mala);
    expect(esDefinidaPositiva(r.matriz)).toBe(true);
    expect(r.cambioMaximo).toBeGreaterThan(0.1);
    const buena = [[1, 0.5], [0.5, 1]];
    expect(correlacionMasCercana(buena)).toEqual({ matriz: buena, cambioMaximo: 0, iteraciones: 0 });
  });
});
