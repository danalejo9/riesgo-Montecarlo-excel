/**
 * B5: distribuciones nuevas. Como las demás (`distributions.test.ts`), cada
 * una contra su teoría: Kolmogorov–Smirnov las continuas, frecuencias las
 * discretas, y media y varianza muestrales frente a las teóricas.
 */
import { describe, expect, it } from 'vitest';

import {
  binomialNegativa, geometrica, hipergeometrica, histograma, limitesTrigen, logistica, logLogistica, pareto, student, trigen, uniformeEntera,
  type Distribution,
} from '../../engine/distributions/index.ts';
import { fillUniform } from '../../engine/random/index.ts';
import { modaDe } from '../../engine/modelo/valorFijo.ts';

const N = 200_000;

function muestra(d: Distribution, stream: number, n = N): Float64Array {
  const u = new Float64Array(n);
  fillUniform(u, 20260929, stream, 0);
  return u.map((x) => d.quantile(x));
}

function ks(m: Float64Array, cdf: (x: number) => number): number {
  const o = Float64Array.from(m).sort();
  let d = 0;
  for (let i = 0; i < o.length; i++) {
    const f = cdf(o[i] as number);
    d = Math.max(d, (i + 1) / o.length - f, f - i / o.length);
  }
  return d;
}

function momentos(m: Float64Array): { media: number; varianza: number } {
  let s = 0;
  for (const x of m) s += x;
  const media = s / m.length;
  let ss = 0;
  for (const x of m) ss += (x - media) ** 2;
  return { media, varianza: ss / (m.length - 1) };
}

/** Media y varianza muestrales dentro de `tol` relativa de las teóricas. */
function esperarMomentos(d: Distribution, m: Float64Array, tol = 0.02) {
  const { media, varianza } = momentos(m);
  const sd = Math.sqrt(d.variance());
  expect(Math.abs(media - d.mean())).toBeLessThan(Math.max(tol * Math.abs(d.mean()), 5 * sd / Math.sqrt(m.length)));
  expect(varianza / d.variance()).toBeGreaterThan(1 - 5 * tol);
  expect(varianza / d.variance()).toBeLessThan(1 + 5 * tol);
}

describe('continuas: Kolmogorov–Smirnov y momentos', () => {
  const casos: [string, Distribution][] = [
    ['t de Student (gl 5)', student(5, 10, 2)],
    ['t de Student (gl 30)', student(30, 0, 1)],
    ['logística', logistica(100, 15)],
    ['log-logística', logLogistica(50, 4)],
    ['Pareto', pareto(1000, 3.5)],
    ['Trigen', trigen(80, 100, 150, 0.1, 0.9)],
    ['histograma', histograma(0, 100, [1, 3, 5, 3, 1])],
  ];
  casos.forEach(([nombre, d], i) => {
    it(nombre, () => {
      const m = muestra(d, 100 + i);
      expect(ks(m, d.cdf)).toBeLessThan(0.006);
      esperarMomentos(d, m);
    });
  });

  it('la t con pocos grados de libertad: sin desviación (gl ≤ 2) ni media (gl ≤ 1), pero se muestrea', () => {
    const d = student(1.5, 0, 1);
    expect(d.variance()).toBe(Infinity);
    expect(d.mean()).toBe(0);
    expect(Number.isNaN(student(1, 0, 1).mean())).toBe(true);
    expect(ks(muestra(student(1, 0, 1), 7), student(1, 0, 1).cdf)).toBeLessThan(0.006);
  });

  it('cuantiles de referencia de la t (tablas): t(0,975; 5) = 2,5706', () => {
    expect(student(5, 0, 1).quantile(0.975)).toBeCloseTo(2.570582, 5);
    expect(student(10, 0, 1).quantile(0.05)).toBeCloseTo(-1.812461, 5);
  });

  it('Trigen: los percentiles dados se cumplen', () => {
    const { min, max } = limitesTrigen(80, 100, 150, 0.1, 0.9);
    const d = trigen(80, 100, 150, 0.1, 0.9);
    expect(d.cdf(80)).toBeCloseTo(0.1, 9);
    expect(d.cdf(150)).toBeCloseTo(0.9, 9);
    expect(min).toBeLessThan(80);
    expect(max).toBeGreaterThan(150);
    expect(() => trigen(100, 90, 150, 0.1, 0.9)).toThrow(/inferior ≤ moda ≤ superior/);
  });
});

describe('discretas: frecuencias y momentos', () => {
  function esperarFrecuencias(d: Distribution, m: Float64Array, desde: number, hasta: number) {
    const cuenta = new Map<number, number>();
    for (const x of m) cuenta.set(x, (cuenta.get(x) ?? 0) + 1);
    for (let k = desde; k <= hasta; k++) {
      const p = d.cdf(k) - d.cdf(k - 1);
      const f = (cuenta.get(k) ?? 0) / m.length;
      expect(Math.abs(f - p)).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / m.length) + 1e-4);
    }
    for (const x of m) expect(Number.isInteger(x)).toBe(true);
  }

  it('geométrica', () => {
    const d = geometrica(0.3);
    const m = muestra(d, 200);
    esperarFrecuencias(d, m, 0, 10);
    esperarMomentos(d, m);
  });

  it('binomial negativa', () => {
    const d = binomialNegativa(3, 0.4);
    const m = muestra(d, 201);
    esperarFrecuencias(d, m, 0, 15);
    esperarMomentos(d, m);
    // La acumulada de la tabla coincide con la de la beta incompleta.
    expect(d.cdf(4)).toBeCloseTo(0.580096, 9);
  });

  it('hipergeométrica', () => {
    const d = hipergeometrica(10, 5, 50);
    const m = muestra(d, 202);
    esperarFrecuencias(d, m, 0, 5);
    esperarMomentos(d, m);
    expect(d.mean()).toBeCloseTo(1, 12);
    expect(() => hipergeometrica(10, 60, 50)).toThrow(/HIPERGEOM/);
  });

  it('uniforme entera', () => {
    const d = uniformeEntera(1, 6);
    const m = muestra(d, 203);
    esperarFrecuencias(d, m, 1, 6);
    esperarMomentos(d, m);
    expect(m.reduce((a, b) => Math.min(a, b), Infinity)).toBe(1);
    expect(m.reduce((a, b) => Math.max(a, b), -Infinity)).toBe(6);
  });
});

describe('moda (para el modo «Valores fijos»)', () => {
  it('de cada una', () => {
    expect(modaDe({ type: 'student', df: 5, loc: 10, scale: 2 })).toBe(10);
    expect(modaDe({ type: 'pareto', min: 1000, shape: 3 })).toBe(1000);
    expect(modaDe({ type: 'intuniform', min: 1, max: 6 })).toBe(4);
    expect(modaDe({ type: 'hypergeometric', n: 10, successes: 5, population: 50 })).toBe(1);
    expect(modaDe({ type: 'histogram', min: 0, max: 100, weights: [1, 3, 5, 3, 1] })).toBe(50);
    expect(modaDe({ type: 'trigen', low: 80, mode: 100, high: 150, pLow: 0.1, pHigh: 0.9 })).toBe(100);
  });
});
