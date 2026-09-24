import { describe, expect, it } from 'vitest';

import { modeloVacio } from '../../engine/modelo/index.ts';
import type { SimulacionCompletada } from '../../excel/informe.ts';
import { codificarInforme, datosDelInforme, decodificarInforme } from '../../excel/informeImprimible.ts';

function caso() {
  const m = modeloVacio();
  m.inputs.push({ id: 'in_p', name: 'Precio', ref: 'Hoja1!A1', dist: { type: 'normal', mean: 10, stdDev: 1 }, correlations: [] });
  m.outputs.push({ id: 'out_v', name: 'VAN', ref: 'Hoja1!B1', threshold: { value: 0, direction: 'below' } });
  const r: SimulacionCompletada = {
    ok: true, motor: 'fast', iteracionesCompletadas: 1000, cancelada: false, milisegundos: 42, hilos: 3,
    eleccion: { motor: 'fast', motivos: [], salidasConstantes: [], celdasDesconocidas: [], celdasNecesarias: 2 },
    lectura: { hojas: 1, hojasVisibles: 1, celdasRecorridas: 2, celdasConContenido: 2, formulas: 1, sincronizaciones: 1, milisegundos: 1 },
    salidas: [{
      id: 'out_v', nombre: 'VAN', ref: 'Hoja1!B1', noNumericas: 0,
      resumen: { n: 1000, media: 5, desviacion: 10, min: -20, max: 30, percentiles: { p50: 5 }, percentilesAproximados: true },
      cdf: [{ x: -20, p: 0 }, { x: 30, p: 1 }],
      muestraOrdenada: Float64Array.from({ length: 1000 }, (_, i) => i - 300), // 300 de 1000 por debajo de 0
    }],
  };
  return { m, r };
}

describe('informe imprimible', () => {
  it('lleva el umbral ya calculado y no lleva la muestra', () => {
    const { m, r } = caso();
    const d = datosDelInforme(m, r, { ahora: new Date('2026-09-24T12:00:00Z') });
    expect(d.salidas[0]?.umbral).toEqual({ texto: 'Probabilidad de quedar por debajo de 0', probabilidad: 0.3 });
    expect('muestraOrdenada' in (d.salidas[0] as object)).toBe(false);
    expect(d.entradas[0]).toMatchObject({ nombre: 'Precio', ref: 'Hoja1!A1' });
    expect(d.ajustes).toMatchObject({ iteraciones: 1000, hilos: 3, muestreo: 'Monte Carlo' });
  });

  it('ida y vuelta por la dirección, comprimido', async () => {
    const { m, r } = caso();
    const d = datosDelInforme(m, r);
    const codigo = await codificarInforme(d);
    expect(codigo).toMatch(/^[A-Za-z0-9_-]+$/); // apto para una URL
    expect(await decodificarInforme(codigo)).toEqual(d);
  });

  it('un código roto no rompe la página', async () => {
    expect(await decodificarInforme('esto-no-es-un-informe')).toBeNull();
  });
});
