/**
 * V10: registro de riesgos completo. Estado, revisión, riesgos solo de
 * costo y cualitativos en «Riesgos de plazo»; qué se simula; la matriz de
 * probabilidad e impacto (niveles, zonas, casillas) y su hoja.
 */
import { describe, expect, it } from 'vitest';

import {
  COLORES_ZONA, evaluarRegistro, hojaRegistro, impactoDeRiesgos, leerCronograma, leerRiesgosPlazo, nivelProbabilidad, riesgosActivos,
  simularPlazo, zonaDe, OPCIONES_PLAZO_POR_DEFECTO, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];
const cron = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma as Cronograma;
const HOY = 46_600; // 01/08/2027

/** «Riesgos de plazo» con filas añadidas y columnas del registro rellenas. */
function hojaRiesgos(extra: unknown[][], cambios: Record<string, Record<string, unknown>> = {}): unknown[][] {
  const v = hoja('Riesgos de plazo').map((f) => [...f]);
  const enc = v[2] as string[];
  for (const [id, c] of Object.entries(cambios)) {
    const f = v.find((x, i) => i > 2 && x[0] === id) as unknown[];
    for (const [k, val] of Object.entries(c)) f[enc.indexOf(k)] = val;
  }
  for (const e of extra) {
    const f = new Array(enc.length).fill('');
    for (const [k, val] of Object.entries(e[0] as Record<string, unknown>)) f[enc.indexOf(k)] = val;
    v.push(f);
  }
  return v;
}

describe('«Riesgos de plazo» como registro (V10)', () => {
  const v = hojaRiesgos([
    [{ ID: 'R7', Riesgo: 'Multa por ruido', Probabilidad: 0.25, 'Costo si ocurre': 8000, Estado: 'Abierto' }],
    [{ ID: 'R8', Riesgo: 'Mala imagen con los vecinos', Probabilidad: 0.6, 'Impacto cualitativo (1–5)': 3, Estado: 'En seguimiento', 'Fecha de revisión': HOY - 10 }],
  ], {
    R1: { Estado: 'Materializado', 'Categoría del riesgo': 'Clima', 'Fecha de revisión': HOY + 30 },
    R4: { Estado: 'Cerrado' },
  });
  const l = leerRiesgosPlazo(v, cron.actividades);

  it('lee estado, revisión, categoría, solo costo y cualitativo', () => {
    expect(l.problemas).toEqual([]);
    const r = (id: string) => l.riesgos.find((x) => x.id === id)!;
    expect(r('R1')).toMatchObject({ estado: 'materializado', categoriaRiesgo: 'Clima', revision: HOY + 30 });
    expect(r('R4').estado).toBe('cerrado');
    expect(r('R7')).toMatchObject({ costo: 8000, actividades: [], impactoMax: 0 });
    expect(r('R7').cualitativo).toBeUndefined();
    expect(r('R8')).toMatchObject({ cualitativo: true, impactoCualitativo: 3, estado: 'seguimiento', revision: HOY - 10 });
  });

  it('errores claros', () => {
    const malo = leerRiesgosPlazo(hojaRiesgos([
      [{ ID: 'R9', Riesgo: 'x', Probabilidad: 0.1, 'Impacto cualitativo (1–5)': 7 }],
      [{ ID: 'R10', Riesgo: 'y', Probabilidad: 0.1 }],
    ], { R2: { Estado: 'Dormido' } }), cron.actividades);
    expect(malo.problemas.map((p) => p.mensaje)).toEqual([
      expect.stringContaining('estado «Dormido»'), expect.stringContaining('nivel de 1 a 5'), expect.stringContaining('«Impacto cualitativo» de 1 a 5'),
    ]);
  });

  it('se simulan los activos: sin cerrados ni cualitativos; los materializados, seguros', () => {
    const a = riesgosActivos(l.riesgos);
    expect(a.map((x) => x.id)).toEqual(['R1', 'R2', 'R3', 'R5', 'R7']);
    expect(a.find((x) => x.id === 'R1')!.probabilidad).toBe(1);
  });

  it('un riesgo solo de costo no mueve las fechas: suma su costo cuando ocurre', async () => {
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 3000 };
    const sin = await simularPlazo(cron, [], op);
    const r7 = l.riesgos.find((x) => x.id === 'R7')!;
    const con = await simularPlazo(cron, [r7], op);
    expect(Array.from(con.finProyecto)).toEqual(Array.from(sin.finProyecto));
    const extra = Array.from(con.costos!.porIteracion).map((c, i) => c - sin.costos!.porIteracion[i]!);
    expect(new Set(extra.map((x) => Math.round(x)))).toEqual(new Set([0, 8000]));
    expect(con.riesgos[0]!.ocurrio).toBeCloseTo(0.25, 1);
  });
});

describe('matriz de probabilidad e impacto (V10)', () => {
  it('niveles y zonas', () => {
    expect([0.05, 0.1, 0.2, 0.4, 0.6, 0.9].map(nivelProbabilidad)).toEqual([1, 1, 2, 3, 4, 5]);
    expect([1, 3, 4, 7, 8, 14, 15, 25].map(zonaDe)).toEqual(['verde', 'verde', 'amarilla', 'amarilla', 'naranja', 'naranja', 'roja', 'roja']);
  });

  it('con la simulación: el impacto sale de lo que cada riesgo aporta al P80 (plazo o costo)', async () => {
    const l = leerRiesgosPlazo(hojaRiesgos([
      [{ ID: 'R8', Riesgo: 'Imagen', Probabilidad: 0.6, 'Impacto cualitativo (1–5)': 3, 'Fecha de revisión': HOY - 10 }],
    ], { R4: { Estado: 'Cerrado' } }), cron.actividades);
    const activos = riesgosActivos(l.riesgos);
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 4000 };
    const r = await simularPlazo(cron, activos, op);
    const imp = await impactoDeRiesgos(cron, activos, r, op);
    const reg = evaluarRegistro({ riesgos: l.riesgos, actividades: cron.actividades, impacto: imp.porRiesgo, dias: r.determinista.dias, costo: r.costos!.determinista, hoy: HOY });
    const f = (id: string) => reg.filas.find((x) => x.id === id)!;
    // R1 (50 %, +7 días de 118 ≈ 6 %) → P3 × I4 = 12, naranja.
    expect(f('R1')).toMatchObject({ nivelP: 3, origenImpacto: 'simulación' });
    const r1 = imp.porRiesgo.find((x) => x.id === 'R1')!;
    expect(f('R1').diasP80).toBe(r1.diasP80);
    expect(f('R8')).toMatchObject({ nivelP: 4, nivelI: 3, puntaje: 12, zona: 'naranja', origenImpacto: 'usuario', vencida: true, tipo: 'cualitativo' });
    expect(f('R4')).toMatchObject({ estado: 'cerrado', origenImpacto: 'estimación' });
    // Los cerrados al final y fuera de la matriz; cada abierto en su casilla.
    expect(reg.filas.at(-1)!.id).toBe('R4');
    const enMatriz = reg.matriz.flat(2);
    expect(enMatriz.sort()).toEqual(['R1', 'R2', 'R3', 'R5', 'R8']);
    expect(reg.matriz[f('R8').nivelP - 1]![f('R8').nivelI - 1]).toContain('R8');
    expect(reg.vencidas).toBe(1);
    const puntajes = reg.filas.filter((x) => x.estado !== 'cerrado').map((x) => x.puntaje);
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes);
  });

  it('la hoja: 25 casillas coloreadas, la lista con su zona y la revisión vencida en rojo', () => {
    const l = leerRiesgosPlazo(hojaRiesgos([[{ ID: 'R8', Riesgo: 'Imagen', Probabilidad: 0.6, 'Impacto cualitativo (1–5)': 3, 'Fecha de revisión': HOY - 10 }]]), cron.actividades);
    const reg = evaluarRegistro({ riesgos: l.riesgos, actividades: cron.actividades, dias: 118, hoy: HOY });
    const h = hojaRegistro(reg);
    const casillas = h.colores!.filter((c) => c.fila >= 4 && c.fila <= 8);
    expect(casillas).toHaveLength(25);
    // La esquina de arriba a la derecha (P5 × I5) es roja; la de abajo a la izquierda, verde.
    expect(casillas.find((c) => c.fila === 4 && c.col === 5)!.color).toBe(COLORES_ZONA.roja);
    expect(casillas.find((c) => c.fila === 8 && c.col === 1)!.color).toBe(COLORES_ZONA.verde);
    const filaR8 = h.valores.findIndex((f) => f[0] === 'R8');
    expect(h.colores!.some((c) => c.fila === filaR8 && c.col === 6 && c.color === COLORES_ZONA.roja)).toBe(true);
    expect(h.valores[1]![0]).toContain('1 riesgo con la revisión vencida');
  });
});
