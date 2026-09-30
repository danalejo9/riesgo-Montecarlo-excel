/**
 * V10: registro de riesgos completo. Estado, revisión, riesgos solo de
 * costo y cualitativos en «Riesgos de plazo»; qué se simula; la matriz de
 * probabilidad e impacto (niveles, zonas, casillas) y su hoja.
 */
import { describe, expect, it } from 'vitest';

import {
  COLORES_OPORTUNIDAD, COLORES_ZONA, esOportunidad, evaluarRegistro, hojaRegistro, impactoDeRiesgos, leerCronograma, leerRiesgosPlazo, nivelProbabilidad, riesgosActivos,
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
    // R5 (estructura prefabricada, acorta) es una oportunidad: va en su propia matriz.
    expect(reg.matriz.flat(2).sort()).toEqual(['R1', 'R2', 'R3', 'R8']);
    expect(reg.matrizOportunidades.flat(2)).toEqual(['R5']);
    const r5 = imp.porRiesgo.find((x) => x.id === 'R5')!;
    expect(f('R5')).toMatchObject({ clase: 'oportunidad', origenImpacto: 'simulación' });
    expect(r5.diasP80).toBeLessThanOrEqual(0);
    expect(reg.matriz[f('R8').nivelP - 1]![f('R8').nivelI - 1]).toContain('R8');
    expect(reg.vencidas).toBe(1);
    // Primero las amenazas (de mayor a menor), luego las oportunidades, luego los cerrados.
    const abiertas = reg.filas.filter((x) => x.estado !== 'cerrado');
    expect(abiertas.map((x) => x.clase)).toEqual([...abiertas.filter((x) => x.clase === 'amenaza'), ...abiertas.filter((x) => x.clase === 'oportunidad')].map((x) => x.clase));
    const puntajes = abiertas.filter((x) => x.clase === 'amenaza').map((x) => x.puntaje);
    expect([...puntajes].sort((a, b) => b - a)).toEqual(puntajes);
  });

  it('qué es una oportunidad', () => {
    const base = { id: 'X', nombre: 'x', probabilidad: 0.3, impactoMin: 0, impactoMasProbable: 0, impactoMax: 0, actividades: ['7'] };
    expect(esOportunidad({ ...base, impactoMin: -0.15, impactoMasProbable: -0.1, impactoMax: -0.05 })).toBe(true);
    expect(esOportunidad({ ...base, impactoMin: -0.1, impactoMax: 0.1 })).toBe(false); // puede ir a cualquier lado: amenaza
    expect(esOportunidad({ ...base, actividades: [], costo: -5000 })).toBe(true); // un ahorro
    expect(esOportunidad({ ...base, impactoMin: -0.1, impactoMax: -0.05, costo: 3000 })).toBe(false); // acorta pero cuesta
    expect(esOportunidad({ ...base, actividades: [], cualitativo: true, impactoCualitativo: -3 })).toBe(true);
    expect(esOportunidad({ ...base, actividades: [], cualitativo: true, impactoCualitativo: 3 })).toBe(false);
  });

  it('la hoja: tres matrices coloreadas (amenazas, oportunidades y la consolidada doble) y la lista', () => {
    const l = leerRiesgosPlazo(hojaRiesgos([
      [{ ID: 'R8', Riesgo: 'Imagen', Probabilidad: 0.6, 'Impacto cualitativo (1–5)': 3, 'Fecha de revisión': HOY - 10 }],
      [{ ID: 'R9', Riesgo: 'Descuento por pronto pago', Probabilidad: 0.8, 'Impacto cualitativo (1–5)': -4 }],
    ]), cron.actividades);
    expect(l.problemas).toEqual([]);
    const reg = evaluarRegistro({ riesgos: l.riesgos, actividades: cron.actividades, dias: 118, hoy: HOY });
    expect(reg.matrizOportunidades[4]![3]).toEqual(['R9']); // P5 × I4
    const h = hojaRegistro(reg);
    const fila = (texto: string) => h.valores.findIndex((f) => f[0] === texto);
    const amenazas = fila('Amenazas') + 2; // la fila de P5
    const oportunidades = fila('Oportunidades') + 2;
    const consolidada = h.valores.findIndex((f) => String(f[0]).startsWith('Consolidada')) + 2;
    const color = (f: number, c: number) => h.colores!.find((x) => x.fila === f && x.col === c)?.color;
    expect(color(amenazas, 5)).toBe(COLORES_ZONA.roja); // P5 × I5
    expect(color(amenazas + 4, 1)).toBe(COLORES_ZONA.verde); // P1 × I1
    expect(color(oportunidades, 5)).toBe(COLORES_OPORTUNIDAD.alta);
    expect(color(oportunidades + 4, 1)).toBe(COLORES_OPORTUNIDAD['mínima']);
    // Consolidada: 10 columnas; en el centro (5 y 6) los impactos más altos de cada lado.
    expect(h.valores[consolidada - 1]!.slice(1)).toEqual([
      'Amenaza I1', 'Amenaza I2', 'Amenaza I3', 'Amenaza I4', 'Amenaza I5', 'Oportunidad I5', 'Oportunidad I4', 'Oportunidad I3', 'Oportunidad I2', 'Oportunidad I1',
    ]);
    expect(color(consolidada, 5)).toBe(COLORES_ZONA.roja);
    expect(color(consolidada, 6)).toBe(COLORES_OPORTUNIDAD.alta);
    expect(h.valores[consolidada]![7]).toBe('R9'); // P5, oportunidad I4
    expect(h.colores!.filter((c) => c.fila >= consolidada && c.fila < consolidada + 5)).toHaveLength(50);
    // La lista: la revisión vencida de R8 en rojo; R9 marcada como oportunidad.
    const filaR8 = h.valores.findIndex((f) => f[0] === 'R8');
    expect(h.colores!.some((c) => c.fila === filaR8 && c.col === 7 && c.color === COLORES_ZONA.roja)).toBe(true);
    expect(h.valores.find((f) => f[0] === 'R9')![2]).toBe('oportunidad');
    expect(h.valores[1]![0]).toContain('1 riesgo con la revisión vencida');
  });
});
