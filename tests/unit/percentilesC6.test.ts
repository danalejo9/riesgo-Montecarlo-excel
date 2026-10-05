/** C6: percentiles configurables (bajo, alto y adicionales). */
import { describe, expect, it } from 'vitest';
import { leerPercentilesTexto, percentilesDelModelo, validarRiskModel } from '../../engine/modelo/index.ts';
import { clavePercentil, etiquetaPercentil, percentilesOrdenados, resumenEstadistico, tdigestDeBuffer } from '../../engine/stats/index.ts';
import { percentilesClave } from '../../excel/informe.ts';
import { compararSalida } from '../../excel/comparacion.ts';

describe('percentiles configurables (C6)', () => {
  it('claves y etiquetas, también con decimales', () => {
    expect([clavePercentil(0.05), clavePercentil(0.5), clavePercentil(0.975), clavePercentil(0.01)]).toEqual(['p5', 'p50', 'p97.5', 'p1']);
    expect(etiquetaPercentil(0.975)).toBe('p97,5');
    expect(percentilesOrdenados({ p97: 1, 'p97.5': 2, p5: 0, p50: 0.5 }).map(([k]) => k)).toEqual(['p5', 'p50', 'p97', 'p97.5']);
  });

  it('lee la lista del usuario en %', () => {
    expect(leerPercentilesTexto('2,5; 80 97,5')).toEqual([0.025, 0.8, 0.975]);
    expect(leerPercentilesTexto('')).toEqual([]);
    expect(leerPercentilesTexto('0')).toBeNull();
    expect(leerPercentilesTexto('120')).toBeNull();
    expect(leerPercentilesTexto('abc')).toBeNull();
    expect(leerPercentilesTexto('1;2;3;4;5;6;7;8;9;10;11')).toBeNull();
  });

  it('el resumen calcula los adicionales', () => {
    const buf = Float64Array.from({ length: 10_001 }, (_, i) => i / 10_000);
    const r = resumenEstadistico({ n: buf.length, media: 0.5, m2: 1, min: 0, max: 1 }, tdigestDeBuffer(buf), [0.025, 0.8]);
    expect(r.percentiles['p2.5']).toBeCloseTo(0.025, 2);
    expect(r.percentiles.p80).toBeCloseTo(0.8, 2);
    expect(r.percentiles.p95).toBeCloseTo(0.95, 2);
  });

  it('se guardan en el modelo y se validan', () => {
    const base = { schema: 1, inputs: [], outputs: [], settings: { iterations: 1000, seed: 1, sampling: 'lhs', engine: 'auto' } };
    const ok = validarRiskModel({ ...base, settings: { ...base.settings, percentiles: { low: 0.1, high: 0.9, extra: [0.8] } } });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(percentilesDelModelo(ok.modelo.settings)).toEqual({ low: 0.1, high: 0.9, extra: [0.8] });
    expect(validarRiskModel({ ...base, settings: { ...base.settings, percentiles: { low: 0.9, high: 0.1, extra: [] } } }).ok).toBe(false);
    const sin = validarRiskModel(base);
    if (sin.ok) expect(percentilesDelModelo(sin.modelo.settings)).toEqual({ low: 0.05, high: 0.95, extra: [] });
  });

  it('las cifras y la comparación usan el bajo y el alto elegidos', () => {
    expect(percentilesClave(null)).toMatchObject({ claveBajo: 'p5', claveAlto: 'p95' });
    const pc = percentilesClave({ percentilesClave: { bajo: 0.1, alto: 0.9 } });
    expect(pc).toMatchObject({ claveBajo: 'p10', claveAlto: 'p90', etiquetaBajo: 'p10', etiquetaAlto: 'p90' });
    const salida = (k: number) => ({ id: 'x', nombre: 'X', ref: 'A1', clave: 'A1', resumen: { n: 10, media: 5 * k, desviacion: 1, min: 0, max: 10, percentiles: { p10: k, p50: 5 * k, p90: 9 * k }, percentilesAproximados: true as const }, cdf: [], noNumericas: 0 });
    const filas = compararSalida(salida(2) as never, salida(1) as never, undefined, pc);
    expect(filas.map((f) => f.medida)).toEqual(['Media', 'Desviación', 'p10', 'p50', 'p90']);
    expect(filas[2]?.diferencia).toBe(1);
  });
});
