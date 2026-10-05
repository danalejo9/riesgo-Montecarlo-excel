import { describe, expect, it } from 'vitest';
import { proponerDistribucion, problemaDeDistribucion, type PropuestaExperto } from '../../engine/modelo/index.ts';

const ok = (x: PropuestaExperto | string) => { expect(typeof x).toBe('object'); return x as PropuestaExperto; };

describe('asistente de juicio experto (V4)', () => {
  it('extremos firmes: PERT entre ellos', () => {
    const p = ok(proponerDistribucion({ minimo: 80, masProbable: 100, maximo: 150, confianza: 'nunca' }));
    expect(p.spec).toEqual({ type: 'pert', min: 80, mode: 100, max: 150 });
    expect([p.minimoReal, p.maximoReal]).toEqual([80, 150]);
  });

  it('1 de cada 10: Trigen con P10 y P90, más ancha que lo dicho', () => {
    const p = ok(proponerDistribucion({ minimo: 80, masProbable: 100, maximo: 150, confianza: 'uno-de-10' }));
    expect(p.spec).toEqual({ type: 'trigen', low: 80, mode: 100, high: 150, pLow: 0.1, pHigh: 0.9 });
    expect(p.minimoReal).toBeLessThan(80);
    expect(p.maximoReal).toBeGreaterThan(150);
    expect(problemaDeDistribucion(p.spec)).toBeNull();
    expect(p.explicacion).toMatch(/P10 y el P90/);
  });

  it('1 de cada 20: P5 y P95, menos ancha que con 1 de cada 10', () => {
    const p20 = ok(proponerDistribucion({ minimo: 80, masProbable: 100, maximo: 150, confianza: 'uno-de-20' }));
    const p10 = ok(proponerDistribucion({ minimo: 80, masProbable: 100, maximo: 150, confianza: 'uno-de-10' }));
    expect(p20.maximoReal).toBeLessThan(p10.maximoReal);
  });

  it('sin más probable: uniforme con extremos firmes; punto medio con aviso si no', () => {
    expect(ok(proponerDistribucion({ minimo: 10, maximo: 20, confianza: 'nunca' })).spec).toEqual({ type: 'uniform', min: 10, max: 20 });
    const p = ok(proponerDistribucion({ minimo: 10, maximo: 20, confianza: 'uno-de-10' }));
    expect(p.spec).toMatchObject({ type: 'trigen', mode: 15 });
    expect(p.avisos[0]).toMatch(/punto medio/);
  });

  it('el más probable en un extremo: PERT con aviso; datos imposibles: el motivo', () => {
    const p = ok(proponerDistribucion({ minimo: 10, masProbable: 10, maximo: 20, confianza: 'uno-de-10' }));
    expect(p.spec.type).toBe('pert');
    expect(p.avisos[0]).toMatch(/firme/);
    expect(proponerDistribucion({ minimo: 20, maximo: 10, confianza: 'nunca' })).toMatch(/menor que el máximo/);
    expect(proponerDistribucion({ minimo: 10, masProbable: 30, maximo: 20, confianza: 'nunca' })).toMatch(/entre el mínimo y el máximo/);
  });
});
