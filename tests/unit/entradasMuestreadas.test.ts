import { describe, expect, it } from 'vitest';

import { modeloVacio } from '../../engine/modelo/index.ts';
import { entradasMuestreadas } from '../../excel/entradasMuestreadas.ts';

describe('entradasMuestreadas (C9: cómo se muestreó cada entrada)', () => {
  const m = modeloVacio();
  m.inputs.push({ id: 'in_u', name: 'Precio', ref: 'Hoja1!B1', dist: { type: 'uniform', min: 0, max: 10 }, correlations: [] });
  m.inputs.push({ id: 'in_d', name: 'Eventos', ref: 'Hoja1!B2', dist: { type: 'poisson', lambda: 3 }, correlations: [] });
  // 0..9,999 escalado a 0..10: una uniforme perfecta.
  const u = Float64Array.from({ length: 10_000 }, (_, i) => (i + 0.5) / 1000);
  const d = Float64Array.from({ length: 10_000 }, (_, i) => i % 7);

  const r = entradasMuestreadas(m, ['Hoja1!B1', 'Hoja1!B2'], new Map([['Hoja1!B1', u], ['Hoja1!B2', d]]));

  it('estadísticos de lo muestreado junto a los teóricos', () => {
    const p = r[0]!;
    expect(p.nombre).toBe('Precio');
    expect(p.distribucion).toContain('Uniforme');
    expect(p.n).toBe(10_000);
    expect(p.media).toBeCloseTo(5, 3);
    expect(p.teorica?.media).toBeCloseTo(5, 10);
    expect(p.teorica?.desviacion).toBeCloseTo(10 / Math.sqrt(12), 10);
    expect(p.percentiles.p50).toBeCloseTo(5, 1);
  });

  it('lo esperado por barra suma las iteraciones y sigue a la uniforme', () => {
    const p = r[0]!;
    const total = (p.esperado ?? []).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 10_000)).toBeLessThan(5); // salvo la masa fuera del rango muestreado
    const conteos = p.histograma.map((b) => b.count);
    (p.esperado ?? []).forEach((e, i) => expect(Math.abs(e - (conteos[i] ?? 0))).toBeLessThan(e * 0.05 + 5));
  });

  it('las discretas no llevan curva teórica encima, y la curva acumulada va de 0 a 1', () => {
    const q = r[1]!;
    expect(q.esperado).toBeUndefined();
    expect(q.cdf[0]?.p).toBe(0);
    expect(q.cdf.at(-1)?.p).toBe(1);
  });

  it('sin muestras de una entrada, no sale', () => {
    expect(entradasMuestreadas(m, ['Hoja1!B1', 'Hoja1!B2'], new Map())).toEqual([]);
  });
});
