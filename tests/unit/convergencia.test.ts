import { describe, expect, it } from 'vitest';

import { intervaloPercentil, precisionDeSimulacion } from '../../engine/stats/index.ts';

describe('precisionDeSimulacion', () => {
  it('margen de la media = 1,96·σ/√n', () => {
    const p = precisionDeSimulacion(10_000, 100, 20);
    expect(p?.margenMedia).toBeCloseTo((1.96 * 20) / 100, 2); // 0,392
    expect(p?.margenRelativo).toBeCloseTo(0.00392, 4);
    expect(p?.suficiente).toBe(true);
  });

  it('con pocas iteraciones dice cuántas harían falta para el 1 %', () => {
    const p = precisionDeSimulacion(100, 100, 50);
    expect(p?.suficiente).toBe(false);
    // n' = (1,96·50 / 1)² ≈ 9.604
    expect(p?.iteracionesParaObjetivo).toBeGreaterThan(9_590);
    expect(p?.iteracionesParaObjetivo).toBeLessThan(9_610);
  });

  it('con la media cerca de cero mide contra la dispersión', () => {
    const p = precisionDeSimulacion(10_000, 0.001, 10);
    expect(p?.margenRelativo).toBeCloseTo(0.0196, 3);
  });

  it('una salida constante siempre es suficiente', () => {
    expect(precisionDeSimulacion(1000, 5, 0)?.suficiente).toBe(true);
  });
});

describe('intervaloPercentil', () => {
  it('rodea al percentil verdadero en una muestra uniforme', () => {
    const o = Float64Array.from({ length: 10_000 }, (_, i) => i / 10_000);
    const iv = intervaloPercentil(o, 0.95);
    expect(iv?.inferior).toBeLessThan(0.95);
    expect(iv?.superior).toBeGreaterThan(0.95);
    // ±1,96·√(n·p·(1−p)) ≈ ±43 posiciones de 10.000
    expect((iv?.superior as number) - (iv?.inferior as number)).toBeCloseTo(0.0086, 3);
  });

  it('con menos de 20 valores no inventa un intervalo', () => {
    expect(intervaloPercentil(Float64Array.from([1, 2, 3]), 0.5)).toBeNull();
  });
});
