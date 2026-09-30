/**
 * V6: ayudas para estimar. Percentiles P10/P90 en vez de mínimo y máximo,
 * la comprobación de salud contra el optimismo (también en el oráculo
 * Python, vía «Esperado (salud)») y la biblioteca «Rangos por tipo».
 */
import { describe, expect, it } from 'vitest';

import {
  BIBLIOTECA_RANGOS, CALENDARIO_ESTANDAR, calcularCPM, completarRangos, extremosDePercentiles, leerActividades, leerCronograma, leerRangosTipo,
  plantillaRangosTipo, revisarSalud, simularPlazo, tipoDe, OPCIONES_PLAZO_POR_DEFECTO, type Actividad, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { pert } from '../../engine/distributions/pert.ts';
import { triangular } from '../../engine/distributions/triangular.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];

describe('P10 y P90 (V6)', () => {
  it('los extremos casan los percentiles, en PERT y en triangular', () => {
    for (const [a, m, b] of [[8, 10, 16], [10, 10, 20], [9, 10, 10.5], [40, 45, 70]] as const) {
      for (const forma of ['pert', 'triangular'] as const) {
        const e = extremosDePercentiles(a, m, b, forma);
        const d = forma === 'pert' ? pert(e.min, m, e.max) : triangular(e.min, m, e.max);
        expect(d.quantile(0.1)).toBeCloseTo(a, 4);
        expect(d.quantile(0.9)).toBeCloseTo(b, 4);
        expect(e.min).toBeLessThan(a);
        expect(e.max).toBeGreaterThan(b);
      }
    }
    expect(() => extremosDePercentiles(10, 9, 12, 'pert')).toThrow('P10 ≤ más probable ≤ P90');
  });

  it('triangular: coincide con la fórmula cerrada de la Trigen (simétrica)', () => {
    // Triangular simétrica en [c−h, c+h]: P10 = c − h(1 − √0,2).
    const e = extremosDePercentiles(10 - 5 * (1 - Math.sqrt(0.2)), 10, 10 + 5 * (1 - Math.sqrt(0.2)), 'triangular');
    expect(e.min).toBeCloseTo(5, 5);
    expect(e.max).toBeCloseTo(15, 5);
  });

  const tabla = (filas: unknown[][]) => leerActividades([['ID', 'Actividad', 'Duración', 'Mínimo', 'Más probable', 'Máximo', 'P10', 'P90'], ...filas]);

  it('el lector: P10/P90 dan los extremos de la PERT; errores si se mezclan o no cuadran', () => {
    const r = tabla([
      ['A', 'a', 10, '', '', '', 8, 16],
      ['B', 'b', 10, 8, 10, 16, 8, 16],
      ['C', 'c', 10, '', 10, '', 11, 16],
      ['D', 'd', 10, '', '', '', 1, 30],
    ]);
    const a = r.actividades.find((x) => x.id === 'A')!;
    const e = extremosDePercentiles(8, 10, 16, 'pert');
    expect(a.tresPuntos).toEqual({ min: e.min, masProbable: 10, max: e.max });
    expect(a.percentiles).toEqual({ p10: 8, p90: 16 });
    const errores = r.problemas.filter((p) => p.gravedad === 'error').map((p) => p.actividad);
    expect(errores).toEqual(['B', 'C']);
    // Un P10 muy bajo: el mínimo quedaría negativo → 0, con aviso.
    expect(r.problemas.find((p) => p.gravedad === 'aviso' && p.actividad === 'D')?.mensaje).toContain('mínimo sería negativo');
    expect(r.actividades.find((x) => x.id === 'D')!.tresPuntos!.min).toBe(0);
  });

  it('simulada, una actividad con P10/P90 da esos percentiles (PERT y triangular)', async () => {
    const act: Actividad = {
      id: 'A', nombre: 'A', duracion: 10, predecesoras: [], tresPuntos: { ...extremosDePercentiles(8, 10, 16, 'pert'), masProbable: 10 }, percentiles: { p10: 8, p90: 16 },
    };
    const c: Cronograma = { inicio: 46_024, calendario: CALENDARIO_ESTANDAR, actividades: [act] };
    for (const forma of ['pert', 'triangular'] as const) {
      const r = await simularPlazo(c, [], { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 40_000, forma });
      const orden = Float64Array.from(r.finProyecto).sort();
      expect(orden[Math.floor(0.1 * orden.length)]!).toBeCloseTo(8, 1);
      expect(orden[Math.floor(0.9 * orden.length)]!).toBeCloseTo(16, 1);
    }
  });
});

describe('rangos realistas (salud, V6)', () => {
  const informe = (acts: Array<[number, number, number]>) => {
    const actividades: Actividad[] = acts.map(([a, m, b], i) => ({
      id: String(i + 1), nombre: `A${i + 1}`, duracion: m, predecesoras: i === 0 ? [] : [{ predecesora: String(i), tipo: 'FS', retardo: 0 }],
      tresPuntos: { min: a, masProbable: m, max: b },
    }));
    const r = calcularCPM({ inicio: 46_024, calendario: CALENDARIO_ESTANDAR, actividades });
    if (!r.ok) throw new Error('cpm');
    return revisarSalud(actividades, r.filas).comprobaciones.find((c) => c.codigo === 'optimismo')!;
  };

  it('el libro de pruebas: verde (rangos anchos y cargados hacia arriba)', () => {
    const c = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma!;
    const r = calcularCPM(c);
    if (!r.ok) throw new Error('cpm');
    expect(revisarSalud(c.actividades, r.filas).comprobaciones.find((x) => x.codigo === 'optimismo')!.estado).toBe('verde');
  });

  it('estrechos o sesgados a acortar: amarillo, con las actividades', () => {
    const estrechos = informe([[9.5, 10, 10.5], [19, 20, 21], [8, 10, 15], [5, 6, 8]]);
    expect(estrechos.estado).toBe('amarillo');
    expect(estrechos.actividades).toEqual(['1', '2']);
    expect(estrechos.detalle).toContain('2 de 4 (50 %) con un rango de menos del 15 %');
    const optimistas = informe([[5, 10, 12], [10, 20, 22], [8, 10, 15], [5, 6, 8]]);
    expect(optimistas.estado).toBe('amarillo');
    expect(optimistas.detalle).toContain('con más margen para acortarse que para alargarse');
  });

  it('todas con el mismo porcentaje (p. ej. tras «Rellenar»): info', () => {
    const c = informe([[9, 10, 12.5], [18, 20, 25], [4.5, 5, 6.25], [27, 30, 37.5], [7.2, 8, 10]]);
    expect(c.estado).toBe('info');
    expect(c.detalle).toContain('todas con el mismo porcentaje (10 % por debajo, 25 % por encima)');
  });
});

describe('biblioteca «Rangos por tipo» (V6)', () => {
  const tipos = leerRangosTipo(plantillaRangosTipo().valores).tipos;

  it('la hoja de partida se lee igual que la biblioteca', () => {
    expect(tipos.map((t) => [t.tipo, t.menos, t.mas])).toEqual(BIBLIOTECA_RANGOS.map((t) => [t.tipo, t.menos, t.mas]));
    expect(BIBLIOTECA_RANGOS.every((t) => t.mas > t.menos)).toBe(true);
  });

  it('casa por categoría o por nombre, con o sin tildes; la primera fila que case gana', () => {
    expect(tipoDe(tipos, 'Trámites', 'Permisos y licencias')?.tipo).toBe('Trámites y permisos');
    expect(tipoDe(tipos, 'Obra gris', 'Excavación')?.tipo).toBe('Movimiento de tierras y cimentación');
    expect(tipoDe(tipos, 'Obra gris', 'Estructura')?.tipo).toBe('Obra gris y estructura');
    expect(tipoDe(tipos, 'Instalaciones', 'Instalaciones eléctricas')?.tipo).toBe('Instalaciones');
    expect(tipoDe(tipos, 'Exteriores', 'Paisajismo')).toBeUndefined();
    // Al principio de una palabra, no en medio: «prediseño» no es «diseño».
    expect(tipoDe(tipos, '', 'Prediseño')).toBeUndefined();
  });

  it('errores de la hoja: porcentajes imposibles', () => {
    const r = leerRangosTipo([['Tipo', 'Palabras clave', 'Menos (%)', 'Más (%)'], ['Malo', 'x', 150, 20], ['Bien', 'y', '10 %', 0.3]]);
    expect(r.tipos).toEqual([{ tipo: 'Bien', claves: ['bien', 'y'], menos: 0.1, mas: 0.3 }]);
    expect(r.problemas[0]).toContain('«Malo»');
  });

  it('«Rellenar» con la biblioteca: cada actividad con los % de su tipo, las demás con los del panel', () => {
    const act = hoja('Actividades').map((f) => [...f]);
    const enc = act[2] as string[];
    const [cMin, cMp, cMax] = ['Mínimo', 'Más probable', 'Máximo'].map((n) => enc.indexOf(n));
    for (const f of act.slice(3)) [cMin, cMp, cMax].forEach((c) => (f[c!] = ''));
    const r = completarRangos(act, 0.1, 0.25, tipos);
    if ('error' in r) throw new Error(r.error);
    expect(r.actividades).toBe(18);
    const aplicado = (id: string) => {
      const fila = act.findIndex((f) => String(f[0]) === id);
      return [cMin, cMax].map((c) => r.cambios.find((x) => x.fila === fila && x.col === c)?.valor);
    };
    expect(aplicado('2')).toEqual([13.5, 24]); // Trámites: −10 % / +60 % de 15
    expect(aplicado('5')).toEqual([9, 14]); // Excavación: −10 % / +40 % de 10
    expect(aplicado('17')).toEqual([9, 12.5]); // Paisajismo: sin tipo, −10 % / +25 %
    expect(r.porTipo['Trámites y permisos']).toBe(1);
    expect(Object.values(r.porTipo).reduce((a, b) => a + b, 0)).toBe(17); // todas menos Paisajismo
  });
});
