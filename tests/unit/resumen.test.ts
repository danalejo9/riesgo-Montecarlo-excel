import { describe, expect, it } from 'vitest';

import { normal } from '../../engine/distributions/index.ts';
import { muestrearMonteCarlo } from '../../engine/sampling/index.ts';
import {
  acumular,
  construirHistograma,
  crearWelford,
  curvaCDF,
  percentilExacto,
  puntosHistograma,
  resumenEstadistico,
  tdigestDeBuffer,
} from '../../engine/stats/index.ts';

const SEED = 20260915;

describe('resumenEstadistico', () => {
  it('reproduce media, desviación y percentiles de una normal conocida', () => {
    const datos = muestrearMonteCarlo(normal(1000, 100), 'x', SEED, 200_000);
    const welford = acumular(crearWelford(), datos);
    const digest = tdigestDeBuffer(datos, 100);

    const r = resumenEstadistico(welford, digest);
    expect(r.n).toBe(200_000);
    expect(r.media).toBeCloseTo(1000, 0);
    expect(r.desviacion).toBeCloseTo(100, 0);
    expect(r.min).toBeLessThan(r.max);
    expect(r.percentilesAproximados).toBe(true);

    // La mediana de una normal es su media.
    expect(r.percentiles.p50).toBeCloseTo(1000, -1);
    // Monótono: p25 < p50 < p75.
    expect(r.percentiles.p25 as number).toBeLessThan(r.percentiles.p50 as number);
    expect(r.percentiles.p50 as number).toBeLessThan(r.percentiles.p75 as number);
  });

  it('trae las nueve claves estándar (p1..p99)', () => {
    const datos = muestrearMonteCarlo(normal(0, 1), 'y', SEED, 10_000);
    const r = resumenEstadistico(acumular(crearWelford(), datos), tdigestDeBuffer(datos, 100));
    expect(Object.keys(r.percentiles).sort()).toEqual(
      ['p1', 'p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95', 'p99'].sort(),
    );
  });
});

describe('curvaCDF', () => {
  it('es monótona creciente en x, con p uniformemente espaciado', () => {
    const datos = muestrearMonteCarlo(normal(500, 50), 'z', SEED, 100_000);
    const digest = tdigestDeBuffer(datos, 100);
    const curva = curvaCDF(digest, 50);

    expect(curva).toHaveLength(50);
    for (let i = 1; i < curva.length; i++) {
      expect(curva[i]?.x as number).toBeGreaterThan(curva[i - 1]?.x as number);
      expect(curva[i]?.p as number).toBeGreaterThan(curva[i - 1]?.p as number);
    }
    expect(curva[0]?.p).toBeGreaterThan(0);
    expect(curva[curva.length - 1]?.p).toBeLessThan(1);
  });

  it('se acerca al percentil exacto en el punto medio de la curva', () => {
    const datos = muestrearMonteCarlo(normal(500, 50), 'w', SEED, 200_000);
    const digest = tdigestDeBuffer(datos, 100);
    const curva = curvaCDF(digest, 2); // dos tramos: p=0.25 y p=0.75

    expect(curva[0]?.x as number).toBeCloseTo(percentilExacto(datos, 0.25), 0);
    expect(curva[1]?.x as number).toBeCloseTo(percentilExacto(datos, 0.75), 0);
  });
});

describe('puntosHistograma', () => {
  it('convierte un Histograma en bins con los límites correctos', () => {
    const datos = new Float64Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const h = construirHistograma(datos, 5, 0, 10);
    const puntos = puntosHistograma(h);

    expect(puntos).toHaveLength(5);
    expect(puntos[0]).toEqual({ x0: 0, x1: 2, count: h.conteos[0] });
    expect(puntos[4]).toEqual({ x0: 8, x1: 10, count: h.conteos[4] });
    expect(puntos.reduce((a, b) => a + b.count, 0)).toBe(datos.length);
  });
});
