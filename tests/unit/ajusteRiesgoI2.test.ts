/**
 * I2: ajuste orientado al riesgo. Error en percentiles por objetivo,
 * discretas para conteos y bootstrap de parámetros y percentiles.
 */
import { describe, expect, it } from 'vitest';

import {
  ajustarDistribuciones, bootstrapAjuste, ordenarCandidatos, PERCENTILES_OBJETIVO, percentilDatos, tablaPercentiles,
} from '../../engine/modelo/index.ts';
import { construirDesdeDescriptor } from '../../engine/distributions/index.ts';
import { toDescriptor, type DistributionSpec } from '../../engine/modelo/distributionSchema.ts';

/** Datos «perfectos»: los cuantiles de la distribución en (i − 0,5)/n. Deterministas. */
function cuantiles(spec: DistributionSpec, n: number): number[] {
  const d = construirDesdeDescriptor(toDescriptor(spec));
  return Array.from({ length: n }, (_, i) => d.quantile((i + 0.5) / n));
}

describe('percentiles de los datos', () => {
  it('como PERCENTIL.INC de Excel', () => {
    const x = Float64Array.of(1, 2, 3, 4, 5);
    expect(percentilDatos(x, 0)).toBe(1);
    expect(percentilDatos(x, 0.5)).toBe(3);
    expect(percentilDatos(x, 0.9)).toBeCloseTo(4.6, 12);
    expect(percentilDatos(x, 1)).toBe(5);
  });
});

describe('error en percentiles', () => {
  const datos = cuantiles({ type: 'lognormal', p1: 100, p2: 60 }, 400);
  const r = ajustarDistribuciones(datos);
  if (!r) throw new Error('sin ajuste');

  it('cada candidata trae los tres errores, sin puntuación combinada', () => {
    for (const c of r.candidatos) {
      expect(c.errorGeneral).toBeGreaterThanOrEqual(0);
      expect(c.errorSuperior).toBeGreaterThanOrEqual(0);
      expect(c.errorInferior).toBeGreaterThanOrEqual(0);
    }
  });

  it('con datos de una lognormal, la lognormal es la de menor error en la cola alta; la normal falla ahí', () => {
    const porCola = ordenarCandidatos(r.candidatos, 'errorSuperior');
    expect(porCola[0]?.spec.type).toBe('lognormal');
    expect(porCola[0]?.errorSuperior).toBeLessThan(0.05);
    const normal = r.candidatos.find((c) => c.spec.type === 'normal');
    expect(normal?.errorSuperior).toBeGreaterThan(0.2);
  });

  it('la tabla dice, percentil a percentil, datos, ajustada y la diferencia en σ', () => {
    const normal = r.candidatos.find((c) => c.spec.type === 'normal')?.spec as DistributionSpec;
    const t = tablaPercentiles(normal, datos, 'superior');
    expect(t.map((f) => f.p)).toEqual([...PERCENTILES_OBJETIVO.superior]);
    // La normal se queda corta en p99 (la lognormal tiene cola larga).
    expect(t[t.length - 1]?.error).toBeLessThan(-0.2);
    expect(t[0]?.datos).toBeCloseTo(percentilDatos(Float64Array.from(datos).sort(), 0.5), 9);
  });
});

describe('discretas para conteos', () => {
  it('conteos de una Poisson: se propone la Poisson y una discreta es la mejor en percentiles', () => {
    const datos = cuantiles({ type: 'poisson', lambda: 4 }, 300);
    const r = ajustarDistribuciones(datos);
    const poisson = r?.candidatos.find((c) => c.spec.type === 'poisson');
    expect(poisson?.spec.type === 'poisson' && poisson.spec.lambda).toBeCloseTo(4, 1);
    expect(poisson?.discreta).toBe(true);
    // La mejor en percentiles es una discreta (la binomial, si sale, con n grande es casi una Poisson).
    expect(ordenarCandidatos(r?.candidatos ?? [], 'errorGeneral')[0]?.discreta).toBe(true);
  });

  it('conteos que varían menos que su media: binomial por momentos', () => {
    const datos = cuantiles({ type: 'binomial', n: 20, p: 0.3 }, 300);
    const r = ajustarDistribuciones(datos);
    const b = r?.candidatos.find((c) => c.spec.type === 'binomial')?.spec as { n: number; p: number } | undefined;
    expect(b?.n).toBeGreaterThanOrEqual(15);
    expect(b?.n).toBeLessThanOrEqual(26);
    expect((b?.n ?? 0) * (b?.p ?? 0)).toBeCloseTo(6, 0);
  });

  it('conteos más dispersos que su media: binomial negativa por momentos', () => {
    const datos = cuantiles({ type: 'negbin', r: 3, p: 0.4 }, 400);
    const r = ajustarDistribuciones(datos);
    const nb = r?.candidatos.find((c) => c.spec.type === 'negbin');
    expect(nb?.discreta).toBe(true);
    const s = nb?.spec as { r: number; p: number };
    // Media r(1−p)/p = 4,5 y varianza r(1−p)/p² = 11,25.
    expect((s.r * (1 - s.p)) / s.p).toBeCloseTo(4.5, 0);
    expect(r?.candidatos.some((c) => c.spec.type === 'binomial')).toBe(false);
    expect(ordenarCandidatos(r?.candidatos ?? [], 'errorGeneral')[0]?.spec.type).toBe('negbin');
  });

  it('importes enteros grandes y distintos no se tratan como conteos', () => {
    const datos = cuantiles({ type: 'normal', mean: 5000, stdDev: 800 }, 200).map(Math.round);
    const r = ajustarDistribuciones(datos);
    expect(r?.candidatos.some((c) => c.discreta)).toBe(false);
  });
});

describe('bootstrap', () => {
  it('los intervalos contienen lo ajustado, se estrechan con más datos, y son reproducibles', () => {
    const spec: DistributionSpec = { type: 'normal', mean: 100, stdDev: 15 };
    const pocos = cuantiles(spec, 20);
    const muchos = cuantiles(spec, 500);
    const ajustar = (d: number[]) => ajustarDistribuciones(d)?.candidatos.find((c) => c.spec.type === 'normal')?.spec as DistributionSpec;
    const b20 = bootstrapAjuste(pocos, ajustar(pocos), [0.5, 0.95]);
    const b500 = bootstrapAjuste(muchos, ajustar(muchos), [0.5, 0.95]);
    if (!b20 || !b500) throw new Error('sin bootstrap');
    expect(b20.validas).toBe(200);
    for (const x of [...b20.parametros, ...b20.percentiles]) {
      expect(x.bajo).toBeLessThanOrEqual(x.estimado);
      expect(x.alto).toBeGreaterThanOrEqual(x.estimado);
    }
    const ancho = (b: typeof b20, nombre: string) => {
      const x = [...b.parametros, ...b.percentiles].find((y) => y.nombre === nombre) as { bajo: number; alto: number };
      return x.alto - x.bajo;
    };
    // La media con 20 datos: ±1,645·15/√20 ≈ ±5,5 → unos 11 de ancho; con 500, unos 2,2.
    expect(ancho(b20, 'mean')).toBeGreaterThan(7);
    expect(ancho(b20, 'mean')).toBeLessThan(15);
    expect(ancho(b500, 'mean')).toBeLessThan(ancho(b20, 'mean') / 3);
    expect(ancho(b500, 'p95')).toBeLessThan(ancho(b20, 'p95'));
    expect(bootstrapAjuste(pocos, ajustar(pocos), [0.5, 0.95])).toEqual(b20);
  });

  it('también para una familia que se ajusta por Newton (Weibull)', () => {
    const datos = cuantiles({ type: 'weibull', shape: 2, scale: 10 }, 100);
    const w = ajustarDistribuciones(datos)?.candidatos.find((c) => c.spec.type === 'weibull')?.spec as DistributionSpec;
    const b = bootstrapAjuste(datos, w, [0.9], 100);
    expect(b?.validas).toBe(100);
    expect(b?.parametros.map((p) => p.nombre).sort()).toEqual(['scale', 'shape']);
  });
});
