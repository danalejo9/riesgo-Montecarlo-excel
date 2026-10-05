import { describe, expect, it } from 'vitest';

import { intervaloPercentil, precisionDeSimulacion, siguienteTanda } from '../../engine/stats/index.ts';

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

describe('siguienteTanda', () => {
  it('pide lo que falta más un 10 %, redondeado a dos cifras', () => {
    expect(siguienteTanda(10_000, [36_000, 12_000], 1_000_000)).toBe(40_000); // 39.600 → 40.000
  });

  it('al menos vez y media lo actual, para no dar pasos ridículos', () => {
    expect(siguienteTanda(10_000, [10_500], 1_000_000)).toBe(15_000);
  });

  it('sin pasar del tope', () => {
    expect(siguienteTanda(10_000, [5_000_000], 200_000)).toBe(200_000);
  });

  it('null si ya basta o si ya se está en el tope', () => {
    expect(siguienteTanda(10_000, [8_000, 9_999], 1_000_000)).toBeNull();
    expect(siguienteTanda(200_000, [5_000_000], 200_000)).toBeNull();
  });
});

describe('precisión con otro margen objetivo', () => {
  it('con ±5 % basta lo que con ±1 % no basta', () => {
    expect(precisionDeSimulacion(1000, 100, 50, undefined, 0.01)?.suficiente).toBe(false);
    expect(precisionDeSimulacion(1000, 100, 50, undefined, 0.05)?.suficiente).toBe(true);
  });
});

describe('el P80 también cuenta para «suficiente»', () => {
  it('una cola larga: la media basta pero el P80 todavía no, y pide más iteraciones', () => {
    // Exponencial de media 100: σ = 100, así que 1 % de la media pide ~38.400 iteraciones; con 50.000 la media basta.
    const n = 50_000;
    const m = Float64Array.from({ length: n }, (_, i) => -100 * Math.log(1 - (i + 0.5) / n)).sort();
    const r = precisionDeSimulacion(n, 100, 100, m)!;
    expect(r.margenRelativo).toBeLessThan(0.01);
    expect(r.margenP80Relativo).toBeGreaterThan(0);
    // El P80 de una exponencial está en 161; su intervalo al 95 % mide unos ±2,3 (2,3 % de la media).
    expect(r.margenP80Relativo).toBeGreaterThan(0.01);
    expect(r.suficiente).toBe(false);
    expect(r.iteracionesParaObjetivo).toBeGreaterThan(n);
    // Sin muestra no hay P80: el veredicto es el de la media.
    expect(precisionDeSimulacion(n, 100, 100)!.suficiente).toBe(true);
  });
});
