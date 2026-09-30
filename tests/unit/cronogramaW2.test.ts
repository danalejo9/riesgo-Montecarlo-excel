/**
 * W2: reserva de contingencia y su reparto. Un caso exacto, y con el libro
 * de pruebas: las partes suman la reserva en los tres niveles, en días y en
 * dinero; las oportunidades restan lo que miden.
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, hojaSimulacionPlazo, impactoDeRiesgos, leerCronograma, leerRiesgosPlazo, reservaContingencia, simularPlazo,
  OPCIONES_PLAZO_POR_DEFECTO, type Cronograma, type RiesgoPlazo,
} from '../../engine/cronograma/index.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];

describe('reserva de contingencia (W2)', () => {
  it('caso exacto: un riesgo seguro de +50 % sobre 10 días fijos → 5 días de reserva, todos suyos', async () => {
    const c: Cronograma = {
      inicio: 46_419, calendario: CALENDARIO_ESTANDAR,
      actividades: [{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [], costoPorDia: 100 }],
    };
    const r1: RiesgoPlazo = { id: 'R1', nombre: 'Seguro', probabilidad: 1, impactoMin: 0.5, impactoMasProbable: 0.5, impactoMax: 0.5, actividades: ['A'] };
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 200 };
    const r = await simularPlazo(c, [r1], op);
    const imp = await impactoDeRiesgos(c, [r1], r, op);
    const res = reservaContingencia(r, imp, 'p80');
    expect(res).toMatchObject({ dias: 5, costo: 500, plan: { dias: 10, costo: 1000 }, objetivo: { dias: 15, costo: 1500 } });
    expect(res.partes).toEqual([
      { id: 'incertidumbre', nombre: expect.any(String), tipo: 'incertidumbre', dias: 0, costo: 0 },
      { id: 'R1', nombre: 'Seguro', tipo: 'amenaza', dias: 5, costo: 500 },
    ]);
  });

  it('libro de pruebas: las partes suman la reserva (P50, P80, P90; días y dinero) y las oportunidades restan', async () => {
    const cron = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma as Cronograma;
    const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos;
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 4000 };
    const r = await simularPlazo(cron, riesgos, op);
    const imp = await impactoDeRiesgos(cron, riesgos, r, op);
    for (const n of ['p50', 'p80', 'p90'] as const) {
      const res = reservaContingencia(r, imp, n);
      expect(res.dias).toBe(r.dias[n] - Math.ceil(r.determinista.dias - 1e-9));
      expect(res.partes.reduce((s, x) => s + x.dias, 0)).toBeCloseTo(res.dias, 9);
      expect(res.partes.reduce((s, x) => s + (x.costo ?? 0), 0)).toBeCloseTo(res.costo!, 6);
      // La incertidumbre es la simulación sin riesgos menos el plan.
      const sinD = n === 'p50' ? imp.sinRiesgos.diasP50 : n === 'p80' ? imp.sinRiesgos.diasP80 : imp.sinRiesgos.diasP90;
      expect(res.partes[0]!.dias).toBe(sinD - res.plan.dias);
    }
    const res = reservaContingencia(r, imp, 'p80');
    const r5 = imp.porRiesgo.find((x) => x.id === 'R5')!;
    if (r5.diasP80 < 0) expect(res.partes.find((x) => x.id === 'R5')).toMatchObject({ tipo: 'oportunidad', dias: r5.diasP80 });
    for (const x of res.partes.filter((y) => y.tipo === 'amenaza')) expect(x.dias).toBeGreaterThanOrEqual(0);
    // Sin la medición de riesgos, todo es incertidumbre.
    expect(reservaContingencia(r, undefined, 'p80').partes).toHaveLength(1);
    // Y la hoja la trae.
    const h = hojaSimulacionPlazo(r, imp);
    expect(h.valores.some((f) => f[0] === 'Reserva total al P80' && f[1] === res.dias)).toBe(true);
  });

  it('si ninguna amenaza suma, lo que queda es efecto conjunto (y cuadra)', async () => {
    const c: Cronograma = { inicio: 46_419, calendario: CALENDARIO_ESTANDAR, actividades: [{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [] }] };
    const r = await simularPlazo(c, [], { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 100 });
    const falso = {
      porRiesgo: [{ id: 'X', nombre: 'X', probabilidad: 0.5, diasP80: 0, diasP50: 0, diasP90: 0 }],
      sinRiesgos: { ...r.fechas, diasP50: 8, diasP80: 8, diasP90: 8 },
    };
    const res = reservaContingencia(r, falso, 'p80');
    expect(res.partes.at(-1)).toMatchObject({ id: 'interaccion', dias: 2 });
    expect(res.partes.reduce((s, x) => s + x.dias, 0)).toBe(res.dias);
  });
});
