import { describe, expect, it } from 'vitest';

import { vistaPrevia } from '../../engine/modelo/index.ts';

describe('vistaPrevia (C5)', () => {
  it('una normal: curva con el pico en la media y percentiles correctos', () => {
    const v = vistaPrevia({ type: 'normal', mean: 100, stdDev: 10 });
    if (v?.tipo !== 'continua') throw new Error('se esperaba continua');
    expect(v.p50).toBeCloseTo(100, 6);
    expect(v.p5).toBeCloseTo(100 - 16.448536, 3);
    const pico = v.puntos.reduce((m, p) => (p.y > m.y ? p : m));
    expect(Math.abs(pico.x - 100)).toBeLessThan(2);
    // La densidad integra ~1 en la rejilla.
    const h = (v.puntos[1]!.x - v.puntos[0]!.x);
    expect(v.puntos.reduce((s, p) => s + p.y * h, 0)).toBeCloseTo(1, 1);
  });

  it('una triangular: la curva empieza y acaba cerca de cero', () => {
    const v = vistaPrevia({ type: 'triangular', min: 0, mode: 5, max: 10 });
    if (v?.tipo !== 'continua') throw new Error();
    expect(v.puntos[0]!.y).toBeLessThan(0.02);
    expect(v.media).toBeCloseTo(5, 10);
  });

  it('las discretas y las de texto enseñan barras con su probabilidad', () => {
    const p = vistaPrevia({ type: 'poisson', lambda: 3 });
    if (p?.tipo !== 'discreta') throw new Error();
    expect(p.barras.reduce((s, b) => s + b.p, 0)).toBeCloseTo(1, 2);
    const c = vistaPrevia({ type: 'categorical', categories: ['N', 'S'], weights: [1, 3] });
    expect(c).toEqual({ tipo: 'discreta', barras: [{ etiqueta: 'N', p: 0.25 }, { etiqueta: 'S', p: 0.75 }] });
  });

  it('una inválida no tiene vista previa', () => {
    expect(vistaPrevia({ type: 'normal', mean: 0, stdDev: -1 })).toBeNull();
  });
});
