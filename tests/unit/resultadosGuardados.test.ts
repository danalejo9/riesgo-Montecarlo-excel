/**
 * Los resultados guardados en el libro: qué se guarda, cómo se lee, y cuándo
 * dejan de corresponder al modelo.
 */
import { describe, expect, it } from 'vitest';

import { modeloVacio, type ModeloRiesgo } from '../../engine/modelo/index.ts';
import { probabilidadUmbral } from '../../engine/stats/index.ts';
import type { SimulacionCompletada } from '../../excel/informe.ts';
import {
  huellaModelo, reducirACuantiles, restaurarResultados, resultadosDesactualizados, serializarResultados,
  CUANTILES_GUARDADOS,
} from '../../excel/resultadosGuardados.ts';

function modelo(): ModeloRiesgo {
  const m = modeloVacio();
  m.inputs.push({ id: 'in_a', name: 'Precio', ref: 'Hoja1!A1', dist: { type: 'normal', mean: 10, stdDev: 1 }, correlations: [] });
  m.outputs.push({ id: 'out_v', name: 'VAN', ref: 'Hoja1!B1' });
  return m;
}

// 50.000 valores de −25.000 a 24.999: P(VAN < 0) = 0,5 exacta.
const muestra = Float64Array.from({ length: 50_000 }, (_, i) => i - 25_000);

function resultado(): SimulacionCompletada {
  return {
    ok: true,
    motor: 'fast',
    eleccion: { motor: 'fast', motivos: [], salidasConstantes: [], celdasDesconocidas: [], celdasNecesarias: 3 },
    iteracionesCompletadas: 50_000,
    cancelada: false,
    milisegundos: 120,
    hilos: 3,
    muestraSensibilidad: 50_000,
    lectura: { hojas: 1, hojasVisibles: 1, celdasRecorridas: 3, celdasConContenido: 3, formulas: 1, sincronizaciones: 1, milisegundos: 5 },
    salidas: [{
      id: 'out_v', nombre: 'VAN', ref: 'Hoja1!B1', noNumericas: 0,
      resumen: { n: 50_000, media: -0.5, desviacion: 14434, min: -25_000, max: 24_999, percentiles: { p50: 0 }, percentilesAproximados: true },
      cdf: [{ x: -25_000, p: 0 }, { x: 24_999, p: 1 }],
      muestraOrdenada: muestra,
      histograma: [{ x0: -25_000, x1: 0, count: 25_000 }, { x0: 0, x1: 24_999, count: 25_000 }],
      sensibilidad: [{ id: 'in_a', nombre: 'Precio', ref: 'Hoja1!A1', spearman: 0.9, peso: 1 }],
    }],
  };
}

describe('reducirACuantiles', () => {
  it('guarda 1.001 valores del mínimo al máximo', () => {
    const q = reducirACuantiles(muestra);
    expect(q).toHaveLength(CUANTILES_GUARDADOS);
    expect(q[0]).toBe(-25_000);
    expect(q[q.length - 1]).toBe(24_999);
  });

  it('una muestra pequeña se guarda entera', () => {
    expect(reducirACuantiles(Float64Array.from([3, 1, 2].sort()))).toHaveLength(3);
  });
});

describe('guardar y restaurar', () => {
  it('lo restaurado conserva todo lo que el panel enseña', () => {
    const texto = serializarResultados(modelo(), resultado(), new Date('2026-09-24T18:40:00Z'));
    const r = restaurarResultados(texto);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.resultado.salidas[0];
    expect(r.resultado.restaurado).toEqual({ guardadoEn: '2026-09-24T18:40:00.000Z' });
    expect(r.resultado.hilos).toBe(3);
    expect(s?.resumen.media).toBe(-0.5);
    expect(s?.histograma).toHaveLength(2);
    expect(s?.sensibilidad?.[0]?.nombre).toBe('Precio');
    expect(s?.muestraReducida).toBe(true);
  });

  it('con los cuantiles, la probabilidad de un umbral sigue a ±0,1 puntos', () => {
    const r = restaurarResultados(serializarResultados(modelo(), resultado()));
    if (!r.ok) throw new Error(r.motivo);
    const q = r.resultado.salidas[0]?.muestraOrdenada as Float64Array;
    expect(Math.abs(probabilidadUmbral(q, 0, 'debajo') - 0.5)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(probabilidadUmbral(q, 12_500, 'encima') - 0.25)).toBeLessThanOrEqual(0.001);
  });

  it('ocupa poco: no se guardan las 50.000 iteraciones', () => {
    expect(serializarResultados(modelo(), resultado()).length).toBeLessThan(30_000);
  });

  it('lo que no se entiende se descarta con motivo, sin romper', () => {
    expect(restaurarResultados('no es json').ok).toBe(false);
    expect(restaurarResultados('{"version": 99}')).toEqual({ ok: false, motivo: 'Versión de resultados desconocida (99).' });
    expect(restaurarResultados('{"version": 1, "resultado": {}}').ok).toBe(false);
  });
});

describe('cuándo dejan de corresponder al modelo', () => {
  it('cambiar una distribución los deja desactualizados', () => {
    const m = modelo();
    const r = { ...resultado(), huellaModelo: huellaModelo(m) };
    expect(resultadosDesactualizados(r, m)).toBe(false);
    const otro = { ...m, inputs: [{ ...(m.inputs[0] as ModeloRiesgo['inputs'][number]), dist: { type: 'normal' as const, mean: 11, stdDev: 1 } }] };
    expect(resultadosDesactualizados(r, otro)).toBe(true);
  });

  it('cambiar solo el umbral no', () => {
    const m = modelo();
    const r = { ...resultado(), huellaModelo: huellaModelo(m) };
    const conUmbral = { ...m, outputs: m.outputs.map((o) => ({ ...o, threshold: { value: 0, direction: 'below' as const } })) };
    expect(resultadosDesactualizados(r, conUmbral)).toBe(false);
  });

  it('las iteraciones sí cuentan', () => {
    const m = modelo();
    const r = { ...resultado(), huellaModelo: huellaModelo(m) };
    expect(resultadosDesactualizados(r, { ...m, settings: { ...m.settings, iterations: 100 } })).toBe(true);
  });
});
