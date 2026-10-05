/**
 * Pruebas obligatorias 2, 3, 4 y 6 de la especificación QRSA sobre la
 * simulación del cronograma, el tornado por eliminación y la medida de
 * rendimiento del criterio de aceptación (300 actividades, 20 riesgos,
 * 5.000 iteraciones en menos de 60 s).
 */
import { describe, expect, it } from 'vitest';
import {
  convergenciaP80, indicesActividades, resumirTiempo, simularCronograma, SimulacionCancelada,
} from '../../engine/cronograma/index.ts';
import { modelo, redSintetica } from '../helpers/cronogramas.ts';

const tri = (min: number, moda: number, max: number) => ({ tipo: 'triangular' as const, min, moda, max });

describe('sesgo de convergencia (prueba 2)', () => {
  it('dos ramas idénticas que se juntan: la media del hito supera la de cada rama', async () => {
    const m = modelo([
      { id: 'A', nombre: 'Rama A', duracion: 10, predecesoras: [] },
      { id: 'B', nombre: 'Rama B', duracion: 10, predecesoras: [] },
      { id: 'H', nombre: 'Hito', duracion: 0, predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }, { id: 'B', tipo: 'FC', desfase: 0 }] },
    ], [
      { actividad: 'A', distribucion: tri(5, 10, 20) },
      { actividad: 'B', distribucion: tri(5, 10, 20) },
    ], [], { iteraciones: 5000, redondeo: 'decimal' });
    const sim = await simularCronograma(m);
    const mediaA = Array.from(sim.duraciones[0] as Float32Array).reduce((s, x) => s + x, 0) / 5000;
    const hito = sim.hitos[0]?.dias as Float64Array;
    const mediaHito = hito.reduce((s, x) => s + x, 0) / 5000;
    expect(mediaA).toBeCloseTo(35 / 3, 1);
    // E[max] de dos triangulares (5, 10, 20) independientes ≈ 13,53 días.
    expect(mediaHito).toBeGreaterThan(mediaA + 1.5);
    expect(mediaHito).toBeCloseTo(13.53, 0);
    // Las dos ramas se reparten la criticidad.
    expect((sim.criticidad[0] as number) + (sim.criticidad[1] as number)).toBeCloseTo(1, 1);
  });
});

describe('reproducibilidad (prueba 3)', () => {
  it('la misma semilla da exactamente lo mismo; otra semilla, otra cosa', async () => {
    const m = redSintetica(48, 4);
    const a = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 600 } });
    const b = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 600 } });
    const c = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 600, semilla: 99 } });
    expect(Array.from(a.fin.dias)).toEqual(Array.from(b.fin.dias));
    expect(a.eliminacion).toEqual(b.eliminacion);
    expect(Array.from(a.fin.dias)).not.toEqual(Array.from(c.fin.dias));
  });
});

describe('distribuciones de duración (prueba 4)', () => {
  it('media y percentiles muestrales frente a los analíticos (±1 %, 50.000 muestras)', async () => {
    const m = modelo([{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [] }],
      [{ actividad: 'A', distribucion: tri(10, 20, 40) }], [], { iteraciones: 50000, redondeo: 'decimal', metodo: 'monte-carlo' });
    const sim = await simularCronograma(m);
    const r = resumirTiempo(sim.fin, sim.deterministico.fin);
    expect(r.media).toBeCloseTo(70 / 3, 0);
    expect(Math.abs(r.media - 70 / 3) / (70 / 3)).toBeLessThan(0.01);
    // P50 de la triangular (10, 20, 40): 40 − √(0,5 · 30 · 20) = 22,68.
    const p50 = r.percentiles.find((p) => p.p === 0.5)?.dias as number;
    expect(Math.abs(p50 - (40 - Math.sqrt(300))) / p50).toBeLessThan(0.01);
  });

  it('trigen: los percentiles dados se cumplen', async () => {
    const m = modelo([{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [] }],
      [{ actividad: 'A', distribucion: { tipo: 'trigen', bajo: 8, moda: 10, alto: 15 } }], [], { iteraciones: 50000, redondeo: 'decimal' });
    const sim = await simularCronograma(m);
    const r = resumirTiempo(sim.fin, sim.deterministico.fin);
    expect(r.percentiles[0]?.dias).toBeCloseTo(8, 1);
    expect(r.percentiles[8]?.dias).toBeCloseTo(15, 1);
  });
});

describe('riesgos discretos (prueba 6)', () => {
  const base = (p: number) => modelo([
    { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
    { id: 'B', nombre: 'B', duracion: 5, predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }] },
    { id: 'C', nombre: 'C', duracion: 12, predecesoras: [] },
  ], [], [{ id: 'R1', nombre: 'Lluvias', probabilidad: p, impactos: [{ actividad: 'A', dias: { tipo: 'fija', valor: 4 } }, { actividad: 'C', dias: { tipo: 'fija', valor: 4 } }] }],
  { iteraciones: 1000 });

  it('con p = 1 equivale a sumar el impacto; con p = 0 no tiene efecto', async () => {
    const uno = await simularCronograma(base(1));
    const cero = await simularCronograma(base(0));
    expect(new Set(uno.fin.dias)).toEqual(new Set([19]));
    expect(new Set(cero.fin.dias)).toEqual(new Set([15]));
    expect(uno.eliminacion[0]?.reduccionP80).toBe(4);
    expect(cero.eliminacion[0]?.reduccionP80).toBe(0);
  });

  it('un riesgo con varias actividades las activa juntas en la misma iteración', async () => {
    const sim = await simularCronograma(base(0.5));
    const dA = sim.duraciones[0] as Float32Array;
    const dC = sim.duraciones[2] as Float32Array;
    for (let i = 0; i < sim.iteraciones; i++) expect(dA[i] === 14).toBe(dC[i] === 16);
    expect(sim.eliminacion[0]?.ocurrencia).toBeCloseTo(0.5, 2);
    expect(new Set(sim.fin.dias)).toEqual(new Set([15, 19]));
  });

  it('una oportunidad (impacto negativo) acorta, sin duraciones negativas', async () => {
    const m = modelo([{ id: 'A', nombre: 'A', duracion: 3, predecesoras: [] }], [],
      [{ id: 'O', nombre: 'Prefabricado', probabilidad: 1, impactos: [{ actividad: 'A', dias: { tipo: 'fija', valor: -5 } }] }], { iteraciones: 10 });
    const sim = await simularCronograma(m);
    expect(new Set(sim.fin.dias)).toEqual(new Set([0]));
  });
});

describe('tornado por eliminación e índices', () => {
  it('ordena los riesgos por lo que baja el P80 y separa riesgos de incertidumbre', async () => {
    const m = modelo([
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 10, predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }] },
      { id: 'C', nombre: 'C (ruta corta)', duracion: 5, predecesoras: [] },
    ], [{ actividad: 'A', distribucion: tri(8, 10, 14) }], [
      { id: 'GRANDE', nombre: 'Grande', probabilidad: 0.5, impactos: [{ actividad: 'B', dias: tri(5, 8, 12) }] },
      { id: 'CHICO', nombre: 'En la ruta corta', probabilidad: 0.5, impactos: [{ actividad: 'C', dias: { tipo: 'fija', valor: 3 } }] },
    ], { iteraciones: 2000 });
    const sim = await simularCronograma(m);
    expect(sim.eliminacion.map((e) => e.id)).toEqual(['GRANDE', 'CHICO']);
    expect(sim.eliminacion[0]?.reduccionP80).toBeGreaterThan(5);
    // C nunca llega a ser crítica (5 + 3 < 18): quitar su riesgo no cambia nada.
    expect(sim.eliminacion[1]?.reduccionP80).toBe(0);
    expect(sim.sinRiesgos?.media).toBeLessThan(sim.media);
    const indices = indicesActividades(sim);
    // A y B siempre críticas; a igual criticidad manda el SSI (B varía más por el riesgo).
    expect(indices.map((x) => x.id)).toEqual(['B', 'A', 'C']);
    expect(indices[0]?.criticidad).toBe(1);
    expect(indices[1]?.criticidad).toBe(1);
    expect(indices[2]?.criticidad).toBe(0);
    expect(indices[1]?.cruciality).toBeGreaterThan(0.1);
  });

  it('probabilidad de cumplir la fecha determinística y la meta', async () => {
    const m = modelo([{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [] }],
      [{ actividad: 'A', distribucion: tri(8, 10, 20) }], [], { iteraciones: 4000 });
    const sim = await simularCronograma(m);
    const r = resumirTiempo(sim.fin, sim.deterministico.fin, sim.deterministico.fin + 7);
    // P(duración ≤ 10) en una triangular (8, 10, 20) = 2/12; redondeando al día, ≤ 10,5 → ≈ 0,22.
    expect(r.probabilidadDeterministica).toBeGreaterThan(0.15);
    expect(r.probabilidadDeterministica).toBeLessThan(0.3);
    expect(r.probabilidadMeta).toBeGreaterThan(r.probabilidadDeterministica);
    expect(r.curvaS.at(-1)?.[1]).toBe(1);
    expect(convergenciaP80(sim.fin.dias).puntos).toHaveLength(8);
  });

  it('se puede cancelar', async () => {
    const control = new AbortController();
    const m = redSintetica(60, 2);
    const p = simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 3000 } }, {
      senal: control.signal, progreso: (h) => { if (h >= 500) control.abort(); },
    });
    await expect(p).rejects.toBeInstanceOf(SimulacionCancelada);
  });
});

describe('rendimiento (criterio de aceptación)', () => {
  it('300 actividades × 20 riesgos × 5.000 iteraciones, con el tornado por eliminación', async () => {
    const m = redSintetica(300, 20);
    const sim = await simularCronograma(m);
    console.log(`cronograma 300×20×5000: ${(sim.milisegundos / 1000).toFixed(2)} s (incluye ${sim.eliminacion.length + 1} corridas extra del tornado)`);
    expect(sim.milisegundos).toBeLessThan(60_000);
    expect(sim.eliminacion).toHaveLength(20);
  }, 120_000);
});
