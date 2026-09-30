/**
 * Bloque P, etapas P2 y P3: chequeo de salud, riesgos de plazo y Monte Carlo
 * del plazo, contra el libro de pruebas (`ejemplos/demo-cronograma.xlsx`) y
 * contra casos con respuesta analítica.
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, calcularCPM, hojaSimulacionPlazo, impactoDeRiesgos, leerActividades, leerCronograma, leerPredecesoras, leerRiesgosPlazo,
  narrativaPlazo, plantillaActividades, plantillaRiesgos,
  muestreadorDuracion, revisarSalud, simularPlazo, OPCIONES_PLAZO_POR_DEFECTO,
  type Actividad, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { streamOf } from '../../engine/random/philox.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n);
const cron = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma as Cronograma;
const cpm = calcularCPM(cron);
if (!cpm.ok) throw new Error('CPM del libro');

function red(acts: Array<{ id: string; duracion: number; preds?: string; tp?: [number, number, number] }>): Cronograma {
  return {
    inicio: 46_024, // lunes 01/01/2026
    calendario: CALENDARIO_ESTANDAR,
    actividades: acts.map((a): Actividad => {
      const p = leerPredecesoras(a.preds ?? '');
      if (!p.ok) throw new Error(p.error);
      return { id: a.id, nombre: a.id, duracion: a.duracion, predecesoras: p.relaciones, ...(a.tp ? { tresPuntos: { min: a.tp[0], masProbable: a.tp[1], max: a.tp[2] } } : {}) };
    }),
  };
}

describe('chequeo de salud (P2)', () => {
  it('coincide con «Esperado (salud)», comprobación por comprobación', () => {
    const esperado = (hoja('Esperado (salud)') as unknown[][]).slice(3).filter((f) => f[0] !== '');
    const informe = revisarSalud(cron.actividades, cpm.filas);
    expect(informe.comprobaciones.map((c) => [c.codigo, c.estado])).toEqual(esperado.map((f) => [f[0], f[1]]));
    expect(informe.estado).toBe('amarillo');
    expect(informe.bloquea).toBe(false);
  });

  it('dice qué actividades causan cada aviso', () => {
    const informe = revisarSalud(cron.actividades, cpm.filas);
    const por = (c: string) => informe.comprobaciones.find((x) => x.codigo === c)!;
    expect(por('adelantos').actividades).toEqual(['12']);
    expect(por('relaciones').detalle).toContain('1 CF');
    expect(por('duracion-larga').actividades).toEqual(['8']);
    expect(por('convergencias').actividades).toEqual(['14', '18']);
  });

  it('extremos abiertos: más del 5 % es rojo y bloquea', () => {
    const c = red([{ id: 'A', duracion: 2 }, { id: 'B', duracion: 3, preds: 'A' }, { id: 'C', duracion: 4 }, { id: 'D', duracion: 1, preds: 'B' }]);
    const r = calcularCPM(c);
    if (!r.ok) throw new Error('cpm');
    const informe = revisarSalud(c.actividades, r.filas);
    const logica = informe.comprobaciones.find((x) => x.codigo === 'logica')!;
    expect(logica.estado).toBe('rojo');
    expect(logica.actividades).toEqual(['C']); // sin predecesora ni sucesora, y no es ni el inicio ni el fin
    expect(informe.bloquea).toBe(true);
  });
});

describe('riesgos de plazo', () => {
  it('lee la hoja del libro, con categorías resueltas a actividades', () => {
    const { riesgos, problemas } = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades);
    expect(problemas).toEqual([]);
    expect(riesgos.map((r) => r.id)).toEqual(['R1', 'R2', 'R3', 'R4', 'R5']);
    expect(riesgos[0]!.actividades).toEqual(['4', '5', '6', '7', '9', '12', '20']); // «Obra gris»
    expect(riesgos[4]).toMatchObject({ probabilidad: 0.2, impactoMin: -0.15, impactoMax: -0.05 });
  });
  it('porcentajes escritos de varias formas y errores con la fila', () => {
    const { riesgos, problemas } = leerRiesgosPlazo([
      ['ID', 'Riesgo', 'Probabilidad', 'Impacto mínimo', 'Impacto más probable', 'Impacto máximo', 'Actividades afectadas'],
      ['A', 'x', 30, '10 %', '', 50, '1'],
      ['B', 'y', 0.5, 0.1, 0.2, 0.3, 'Nada'],
      ['C', 'z', 150, 0.1, 0.2, 0.3, '1'], // 150 % no es una probabilidad
    ], cron.actividades);
    expect(riesgos).toEqual([expect.objectContaining({ id: 'A', probabilidad: 0.3, impactoMin: 0.1, impactoMasProbable: 0.3, impactoMax: 0.5 })]);
    expect(problemas.map((p) => p.fila)).toEqual([3, 4]);
  });
});

describe('Monte Carlo del plazo (P3)', () => {
  const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos;
  const esperado = hoja('Esperado (simulación)') as unknown[][];

  it('coincide con el Monte Carlo de referencia en Python (±1 día, ±3 puntos de criticidad)', async () => {
    const r = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 20_000 });
    const dias = [r.dias.p10, r.dias.p50, r.dias.p80, r.dias.p90];
    esperado.slice(3, 7).forEach((f, i) => expect(Math.abs((dias[i] as number) - (f[1] as number))).toBeLessThanOrEqual(1));
    for (const f of esperado.slice(10).filter((x) => x[0] !== '')) {
      const a = r.actividades.find((x) => x.id === f[0])!;
      expect(Math.abs(a.criticidad - (f[2] as number)), `criticidad de ${String(f[0])}`).toBeLessThanOrEqual(0.03);
    }
    expect(r.determinista.dias).toBe(118);
    expect(r.probDeterminista).toBeLessThan(0.05); // la fecha del cronograma casi nunca se cumple
  });

  it('misma semilla, mismo resultado; otro troceado, mismo resultado', async () => {
    const a = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 3000 });
    const b = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 3000 });
    expect(Array.from(a.finProyecto)).toEqual(Array.from(b.finProyecto));
    const c = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 3000, semilla: 7 });
    expect(Array.from(c.finProyecto)).not.toEqual(Array.from(a.finProyecto));
  });

  it('sin incertidumbre ni riesgos, la simulación es el CPM determinista', async () => {
    const fijo: Cronograma = { ...cron, actividades: cron.actividades.map((a) => ({ ...a, tresPuntos: undefined })) };
    const r = await simularPlazo(fijo, [], { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 100 });
    expect(new Set(r.finProyecto)).toEqual(new Set([118]));
    expect(r.fechas.p10).toBe(cpm.fechaFinProyecto);
    expect(r.fechas.p90).toBe(cpm.fechaFinProyecto);
    expect(r.probDeterminista).toBe(1);
    for (const f of cpm.filas) expect(r.actividades.find((a) => a.id === f.id)!.criticidad).toBe(f.critica ? 1 : 0);
  });

  it('merge bias: dos rutas iguales en paralelo terminan más tarde que una (valor analítico)', async () => {
    // Triangular(0, 10, 20): la mediana de una ruta es 10; la del máximo de dos
    // independientes resuelve F(x)² = 0,5 → x = 20 − √(200·(1 − √0,5)) ≈ 12,35.
    const una = await simularPlazo(red([{ id: 'A', duracion: 10, tp: [0, 10, 20] }]), [], { ...OPCIONES_PLAZO_POR_DEFECTO, forma: 'triangular', iteraciones: 40_000 });
    const dos = await simularPlazo(red([{ id: 'A', duracion: 10, tp: [0, 10, 20] }, { id: 'B', duracion: 10, tp: [0, 10, 20] }]), [], { ...OPCIONES_PLAZO_POR_DEFECTO, forma: 'triangular', iteraciones: 40_000 });
    const mediana = (x: Float64Array) => Float64Array.from(x).sort()[x.length >> 1] as number;
    expect(mediana(una.finProyecto)).toBeCloseTo(10, 0);
    expect(mediana(dos.finProyecto)).toBeCloseTo(20 - Math.sqrt(200 * (1 - Math.SQRT1_2)), 1);
    expect(dos.actividades[0]!.criticidad).toBeCloseTo(0.5, 1);
  });

  it('un riesgo alarga a la vez todas sus actividades (correlación por causa)', async () => {
    const c = red([{ id: 'A', duracion: 10 }, { id: 'B', duracion: 10 }]);
    const r = { id: 'R', nombre: 'R', probabilidad: 1, impactoMin: 0.1, impactoMasProbable: 0.2, impactoMax: 0.5, actividades: ['A', 'B'] };
    const s = await simularPlazo(c, [r], { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2000 });
    // Las dos se alargan lo mismo en cada iteración: siempre empatan y las dos son críticas.
    expect(s.actividades.map((a) => a.criticidad)).toEqual([1, 1]);
    expect(s.riesgos[0]!.ocurrio).toBe(1);
  });

  it('quitar un riesgo y volver a simular: días de P80 por riesgo', async () => {
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 5000 };
    const base = await simularPlazo(cron, riesgos, op);
    const imp = await impactoDeRiesgos(cron, riesgos, base, op);
    expect(imp.porRiesgo).toHaveLength(5);
    expect(imp.porRiesgo.find((x) => x.id === 'R5')!.diasP80).toBeLessThanOrEqual(0); // una oportunidad: quitarla alarga
    expect(imp.porRiesgo[0]!.diasP80).toBeGreaterThan(0);
    expect(imp.sinRiesgos.diasP80).toBeLessThan(base.dias.p80);
  });

  it('se puede cancelar entre bloques', async () => {
    let llamadas = 0;
    const r = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 100_000, debeCancelar: () => ++llamadas > 2 });
    expect(r.cancelada).toBe(true);
    expect(r.iteraciones).toBeLessThan(100_000);
  });

  it('el muestreador PERT rápido tiene la media de la PERT', () => {
    const m = muestreadorDuracion(10, 15, 40, 'pert')!;
    let s = 0;
    const n = 50_000;
    const f = streamOf('prueba');
    for (let i = 0; i < n; i++) s += m.muestra(1, f, i);
    expect(s / n).toBeCloseTo((10 + 4 * 15 + 40) / 6, 1);
  });
});

describe('hoja de la simulación y resumen en palabras', () => {
  const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos;

  it('el resumen dice P80, probabilidad del cronograma, reserva, riesgo principal y actividad clave', async () => {
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO };
    const r = await simularPlazo(cron, riesgos, op);
    const imp = await impactoDeRiesgos(cron, riesgos, r, op);
    const texto = narrativaPlazo(r, imp, revisarSalud(cron.actividades, cpm.filas));
    expect(texto).toHaveLength(5);
    expect(texto[0]).toMatch(/^Hay un 80 % de probabilidad de terminar el \d\d\/\d\d\/2027 o antes/);
    expect(texto[1]).toContain('convergencias');
    expect(texto[2]).toMatch(/reserva de \d+ días laborables/);
    expect(texto[3]).toContain('«Lluvias intensas durante la obra gris»');
    expect(texto[4]).toContain('«Estructura»');
  });

  it('la hoja trae resumen, curva S con gráfico, riesgos y el Gantt probabilístico', async () => {
    const r = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2000 });
    const imp = await impactoDeRiesgos(cron, riesgos, r, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2000 });
    const h = hojaSimulacionPlazo(r, imp, ['una línea']);
    const col0 = h.valores.map((f) => f[0]);
    expect(col0).toContain('P80');
    expect(col0).toContain('Curva S');
    expect(h.valores.find((f) => f[0] === 'P80')).toEqual(['P80', r.fechas.p80, r.dias.p80]);
    const enc = h.otrosEncabezados!;
    expect(h.valores[enc[enc.length - 1]!]!.slice(0, 3)).toEqual(['ID', 'Actividad', 'Criticidad']);
    expect(h.valores.slice(enc[enc.length - 1]! + 1)).toHaveLength(20);
    expect(h.grafico).toMatchObject({ filas: 20, col: 1 });
    expect(h.valores[h.grafico!.fila + 19]![2]).toBe(1); // la curva S acaba en el 100 %
    expect(h.resaltar!.length).toBeGreaterThan(0);
  });

  it('la plantilla de riesgos se lee con la plantilla de actividades', () => {
    const a = leerActividades(plantillaActividades().valores).actividades;
    const { riesgos: rs, problemas } = leerRiesgosPlazo(plantillaRiesgos().valores, a);
    expect(problemas).toEqual([]);
    expect(rs.map((x) => x.actividades)).toEqual([['2'], ['1']]);
  });
});
