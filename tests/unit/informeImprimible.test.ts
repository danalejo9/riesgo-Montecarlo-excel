import { describe, expect, it } from 'vitest';

import { modeloVacio } from '../../engine/modelo/index.ts';
import { construirInforme, type SimulacionCompletada } from '../../excel/informe.ts';
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

describe('registro de riesgos en el PDF y en la hoja volcada (T8)', () => {
  const registro = [
    { celda: 'R!B2', nombre: 'Avería', probabilidad: 0.1, impacto: '500', impactoMedio: 500, impactoDesviacion: 0, valorEsperado: 50, desviacion: 150 },
    { celda: 'R!B3', nombre: 'Retraso', probabilidad: null, impacto: 'con parámetros que cambian', impactoMedio: null, impactoDesviacion: null, valorEsperado: null, desviacion: null },
  ];

  it('el PDF lo lleva solo si hay riesgos', () => {
    const { m, r } = caso();
    expect(datosDelInforme(m, r).registroRiesgos).toBeUndefined();
    expect(datosDelInforme(m, { ...r, registroRiesgos: registro }).registroRiesgos).toEqual(registro);
  });

  it('la hoja volcada tiene su sección, con el total', () => {
    const { m, r } = caso();
    const inf = construirInforme(m, { ...r, registroRiesgos: registro });
    const i = inf.filas.findIndex((f) => f[0] === 'REGISTRO DE RIESGOS');
    expect(i).toBeGreaterThan(0);
    expect(inf.titulos).toContain(i);
    expect(inf.filas[i + 2]?.slice(0, 7)).toEqual(['Avería', 'R!B2', '500', 0.1, 50, 1, 150]);
    expect(inf.filas[i + 3]?.slice(0, 5)).toEqual(['Retraso', 'R!B3', 'con parámetros que cambian', 'variable', '']);
    expect(inf.filas[i + 4]?.[4]).toBe(50);
    expect(construirInforme(m, r).filas.some((f) => f[0] === 'REGISTRO DE RIESGOS')).toBe(false);
  });
});

describe('contingencia y matriz en la hoja volcada y el PDF (V1, V2)', () => {
  it('la salida con valor base lleva su contingencia; la hoja, su sección', () => {
    const { m, r } = caso();
    // Muestra −300 … 699; base 0; VAN se lee como beneficio por su nombre.
    const conBase = { ...r, base: { fijo: 'la media' }, salidas: r.salidas.map((s) => ({ ...s, valorBase: 0 })) } as SimulacionCompletada;
    const d = datosDelInforme(m, conBase);
    expect(d.baseFija).toBe('la media');
    expect(d.salidas[0]?.contingencia).toMatchObject({ base: 0, clase: 'benefit' });
    expect(d.salidas[0]?.contingencia?.probabilidadBase).toBeCloseTo(0.7, 2);

    const inf = construirInforme(m, conBase);
    const i = inf.filas.findIndex((f) => f[0] === 'CONTINGENCIA FRENTE AL VALOR BASE');
    expect(i).toBeGreaterThan(0);
    expect(inf.filas[i + 2]?.slice(0, 4)).toEqual(['VAN', 'beneficio', 0, expect.closeTo(0.7, 2)]);
    expect(construirInforme(m, r).filas.some((f) => f[0] === 'CONTINGENCIA FRENTE AL VALOR BASE')).toBe(false);
  });

  it('el registro lleva la severidad y la matriz 5 × 5 con sus colores', () => {
    const { m, r } = caso();
    const registro = [
      { celda: 'R!B2', nombre: 'Avería', probabilidad: 0.1, impacto: '500', impactoMedio: 500, impactoDesviacion: 0, valorEsperado: 50, desviacion: 150 },
      { celda: 'R!B3', nombre: 'Retraso', probabilidad: 0.6, impacto: '100', impactoMedio: 100, impactoDesviacion: 0, valorEsperado: 60, desviacion: 49 },
    ];
    const inf = construirInforme(m, { ...r, registroRiesgos: registro });
    const i = inf.filas.findIndex((f) => f[0] === 'REGISTRO DE RIESGOS');
    expect(inf.filas[i + 2]?.[7]).toBe('Alta'); // probabilidad baja (2) × impacto muy alto (5) = 10
    expect(inf.filas[i + 3]?.[7]).toBe('Alta'); // probabilidad alta (4) × impacto medio, 1/5 del mayor (3) = 12
    const j = inf.filas.findIndex((f) => typeof f[0] === 'string' && f[0].startsWith('Probabilidad e impacto'));
    expect(inf.filas[j + 1]?.slice(0, 6)).toEqual(['Muy alto', '', '1', '', '', '']);
    expect(inf.rellenos.length).toBe(2 + 25);
  });
});
