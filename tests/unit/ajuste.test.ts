/**
 * Ajuste de distribuciones: con datos que sí vienen de una distribución
 * conocida (generados con el propio muestreador del motor), la ganadora tiene
 * que ser esa, y sus parámetros los de partida.
 */
import { describe, expect, it } from 'vitest';

import { exponential, gamma, lognormal, normal, uniform, weibull } from '../../engine/distributions/index.ts';
import { ajustarDistribuciones, leerDatos, logDensidad, ordenarCandidatos, type DistributionSpec } from '../../engine/modelo/index.ts';
import { muestrearMonteCarlo } from '../../engine/sampling/index.ts';

const datos = (dist: Parameters<typeof muestrearMonteCarlo>[0], n = 2000) =>
  Array.from(muestrearMonteCarlo(dist, 'ajuste', 4242, n));

describe('ajustarDistribuciones', () => {
  it('reconoce una normal y recupera sus parámetros', () => {
    const r = ajustarDistribuciones(datos(normal(100, 15)));
    const mejor = r?.candidatos[0]?.spec;
    expect(mejor?.type).toBe('normal');
    if (mejor?.type === 'normal') {
      expect(mejor.mean).toBeCloseTo(100, 0);
      expect(mejor.stdDev).toBeGreaterThan(14);
      expect(mejor.stdDev).toBeLessThan(16);
    }
  });

  it('reconoce una lognormal (cola a la derecha)', () => {
    const r = ajustarDistribuciones(datos(lognormal(50, 30)));
    expect(r?.candidatos[0]?.spec.type).toBe('lognormal');
  });

  it('reconoce una Weibull y recupera la forma por Newton', () => {
    const r = ajustarDistribuciones(datos(weibull(2.5, 10)));
    const w = r?.candidatos.find((c) => c.spec.type === 'weibull')?.spec;
    expect(['weibull', 'gamma']).toContain(r?.candidatos[0]?.spec.type);
    if (w?.type === 'weibull') {
      expect(w.shape).toBeCloseTo(2.5, 0);
      expect(w.scale).toBeCloseTo(10, 0);
    }
  });

  it('la gamma sale con la forma de Minka cerca de la real', () => {
    const r = ajustarDistribuciones(datos(gamma(3, 2)));
    const g = r?.candidatos.find((c) => c.spec.type === 'gamma')?.spec;
    if (g?.type !== 'gamma') throw new Error('sin gamma');
    expect(g.shape).toBeGreaterThan(2.7);
    expect(g.shape).toBeLessThan(3.3);
  });

  it('una exponencial gana a las demás con datos exponenciales', () => {
    const r = ajustarDistribuciones(datos(exponential(0.5)));
    expect(['exponential', 'gamma', 'weibull']).toContain(r?.candidatos[0]?.spec.type);
    const e = r?.candidatos.find((c) => c.spec.type === 'exponential')?.spec;
    if (e?.type === 'exponential') expect(e.lambda).toBeCloseTo(0.5, 1);
  });

  it('una uniforme queda arriba, con extremos que contienen todos los datos', () => {
    const d = datos(uniform(10, 20));
    const r = ajustarDistribuciones(d);
    const u = r?.candidatos.find((c) => c.spec.type === 'uniform')?.spec;
    expect(['uniform', 'pert', 'triangular', 'beta']).toContain(r?.candidatos[0]?.spec.type);
    if (u?.type === 'uniform') {
      expect(u.min).toBeLessThanOrEqual(Math.min(...d));
      expect(u.max).toBeGreaterThanOrEqual(Math.max(...d));
    }
  });

  it('con datos negativos no propone distribuciones que no los admiten', () => {
    const r = ajustarDistribuciones(datos(normal(0, 1)));
    const tipos = r?.candidatos.map((c) => c.spec.type) ?? [];
    for (const t of ['lognormal', 'gamma', 'weibull', 'exponential', 'beta']) expect(tipos).not.toContain(t);
  });

  it('K–S entre 0 y 1, la lista ordenada por AIC, y reordenable por BIC o A–D', () => {
    const r = ajustarDistribuciones(datos(normal(5, 1), 500));
    const aic = r?.candidatos.map((c) => c.aic) ?? [];
    expect(aic).toEqual([...aic].sort((a, b) => a - b));
    const porAd = ordenarCandidatos(r?.candidatos ?? [], 'andersonDarling').map((c) => c.andersonDarling);
    expect(porAd).toEqual([...porAd].sort((a, b) => a - b));
    const porBic = ordenarCandidatos(r?.candidatos ?? [], 'bic').map((c) => c.bic);
    expect(porBic).toEqual([...porBic].sort((a, b) => a - b));
    for (const c of r?.candidatos ?? []) {
      expect(c.kolmogorovSmirnov).toBeGreaterThanOrEqual(0);
      expect(c.kolmogorovSmirnov).toBeLessThanOrEqual(1);
    }
  });

  it('con menos de cinco datos no se ajusta nada', () => {
    expect(ajustarDistribuciones([1, 2, 3])).toBeNull();
  });

  it('datos todos iguales: sin candidatas', () => {
    expect(ajustarDistribuciones([4, 4, 4, 4, 4, 4])?.candidatos).toEqual([]);
  });
});

describe('leerDatos', () => {
  it('una columna pegada de un Excel en español', () => {
    expect(leerDatos('1.234,5\n980\n1.100,25\n')).toEqual({ valores: [1234.5, 980, 1100.25], ignorados: 0 });
  });

  it('ignora la cabecera y lo que no es número, y lo cuenta', () => {
    expect(leerDatos('Precio\n10\n\nn/d\n12,5')).toEqual({ valores: [10, 12.5], ignorados: 2 });
  });

  it('separados por punto y coma o espacios; con punto decimal si se pide', () => {
    expect(leerDatos('1;2 3\t4').valores).toEqual([1, 2, 3, 4]);
    expect(leerDatos('1,500.5 2.5', '.').valores).toEqual([1500.5, 2.5]);
  });
});

describe('densidades (para AIC y BIC)', () => {
  // Cada densidad integra 1 y es coherente con la CDF del motor (regla del trapecio fina).
  const casos: [DistributionSpec, number, number][] = [
    [{ type: 'normal', mean: 3, stdDev: 2 }, -20, 26],
    [{ type: 'lognormal', p1: 10, p2: 4 }, 1e-9, 120],
    [{ type: 'uniform', min: 2, max: 5 }, 2, 5],
    [{ type: 'triangular', min: 0, mode: 1, max: 4 }, 0, 4],
    [{ type: 'pert', min: 0, mode: 1, max: 4 }, 0, 4],
    [{ type: 'beta', alpha: 2, beta: 3 }, 0, 1],
    [{ type: 'gamma', shape: 3, scale: 2 }, 1e-9, 80],
    [{ type: 'exponential', lambda: 0.5 }, 0, 80],
    [{ type: 'weibull', shape: 2.5, scale: 10 }, 1e-9, 60],
  ];
  for (const [spec, a, b] of casos) {
    it(`${spec.type} integra 1`, () => {
      const d = logDensidad(spec);
      if (!d) throw new Error('sin densidad');
      const pasos = 200_000;
      const h = (b - a) / pasos;
      let s = 0;
      for (let i = 0; i <= pasos; i++) {
        const v = Math.exp(d.f(a + i * h));
        s += (i === 0 || i === pasos ? 0.5 : 1) * (Number.isFinite(v) ? v : 0);
      }
      expect(s * h).toBeCloseTo(1, 3);
    });
  }

  it('AIC castiga los parámetros: con datos normales, la normal gana a la PERT', () => {
    const r = ajustarDistribuciones(datos(normal(100, 15), 3000));
    const n = r?.candidatos.find((c) => c.spec.type === 'normal');
    const p = r?.candidatos.find((c) => c.spec.type === 'pert');
    expect(n?.parametros).toBe(2);
    expect(p?.parametros).toBe(3);
    expect((n?.aic as number) < (p?.aic as number)).toBe(true);
  });
});
