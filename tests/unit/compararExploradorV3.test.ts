/** V3: comparar distribuciones en el explorador (otra salida o un escenario guardado). */
import { describe, expect, it } from 'vitest';
import { comparablesPara, conteosDesdeCdf, vistaDeCelda } from '../../excel/explorador.ts';
import type { SimulacionCompletada } from '../../excel/informe.ts';

const muestra = (a: number, b: number) => Float64Array.from({ length: 1000 }, (_, i) => a + ((b - a) * i) / 999);
const salida = (id: string, nombre: string, ref: string, a: number, b: number, fecha = false) => ({
  id, nombre, ref, noNumericas: 0, ...(fecha ? { fecha: true } : {}),
  resumen: { n: 1000, media: (a + b) / 2, desviacion: (b - a) / Math.sqrt(12), min: a, max: b, percentiles: { p1: a, p5: a + 0.05 * (b - a), p10: a + 0.1 * (b - a), p25: a + 0.25 * (b - a), p50: (a + b) / 2, p75: a + 0.75 * (b - a), p90: a + 0.9 * (b - a), p95: a + 0.95 * (b - a), p99: b }, percentilesAproximados: true },
  cdf: Array.from({ length: 300 }, (_, i) => ({ x: a + ((b - a) * i) / 299, p: i / 299 })),
  histograma: [{ x0: a, x1: (a + b) / 2, count: 500 }, { x0: (a + b) / 2, x1: b, count: 500 }],
  muestraOrdenada: muestra(a, b),
});
const sim = (salidas: unknown[]) => ({ ok: true, salidas, entradas: [] }) as unknown as SimulacionCompletada;

describe('comparar en el explorador (V3)', () => {
  const actual = sim([salida('van', 'VAN', 'Hoja1!B10', 0, 100), salida('tir', 'TIR', 'Hoja1!B11', 0, 1), salida('fin', 'Entrega', 'Hoja1!B12', 46000, 46300, true)]);
  const base = sim([salida('van', 'VAN', 'Hoja1!$B$10', 20, 140)]);

  it('ofrece la misma salida en cada escenario y las otras salidas del mismo tipo', () => {
    const v = vistaDeCelda('Hoja1!B10', actual);
    if (!v.ok) throw new Error(v.motivo);
    const c = comparablesPara(v.vista, actual, [{ etiqueta: 'Base', resultado: base }]);
    expect(c.map((x) => [x.id, x.origen])).toEqual([['esc:Base', 'escenario'], ['sal:Hoja1!B11', 'salida']]);
    expect(c[0]?.media).toBe(80);
    expect(c[0]?.cdf.length).toBeLessThanOrEqual(101);
    expect(c[0]?.percentiles[4]).toBe(80);
    // Una fecha solo se compara con fechas.
    const vf = vistaDeCelda('Hoja1!B12', actual);
    if (!vf.ok) throw new Error(vf.motivo);
    expect(comparablesPara(vf.vista, actual, [])).toEqual([]);
  });

  it('la línea de la comparada en las barras del histograma', () => {
    const barras = [{ x0: 0, x1: 50, count: 500 }, { x0: 50, x1: 100, count: 500 }];
    const cdf = Array.from({ length: 121 }, (_, i) => ({ x: 20 + i, p: i / 120 }));
    const conteos = conteosDesdeCdf(barras, cdf);
    // Uniforme de 20 a 140: 30 de 120 en [0, 50] y 50 de 120 en [50, 100].
    expect(conteos[0]).toBeCloseTo(1000 * 30 / 120, 6);
    expect(conteos[1]).toBeCloseTo(1000 * 50 / 120, 6);
  });
});
