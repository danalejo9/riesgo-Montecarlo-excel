/**
 * V8: clima probabilístico. La hoja «Clima», el ritmo de avance en un mes
 * con días perdidos (caso analítico), el Monte Carlo contra el oráculo
 * Python («Clima (prueba)» → «Esperado (clima)») y el clima como un riesgo
 * más en «quitar y volver a simular».
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, ID_CLIMA, impactoDeRiesgos, leerClima, leerCronograma, leerRiesgosPlazo, plantillaClima, simularPlazo,
  simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { crearHilosPlazoNode } from '../helpers/hilosPlazoNode.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];
const lectura = leerCronograma(hoja('Actividades'), hoja('Calendario'), undefined, hoja('Clima (prueba)'));
const cron = lectura.cronograma as Cronograma;
const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos;

describe('la hoja «Clima» (V8)', () => {
  it('el escenario de prueba: doce meses y la obra a la intemperie', () => {
    expect(lectura.problemas).toEqual([]);
    expect(cron.clima!.meses[3]).toEqual({ min: 2, masProbable: 4, max: 7 }); // abril
    const obraGris = cron.actividades.filter((a) => a.categoria === 'Obra gris' || a.categoria === 'Exteriores').map((a) => a.id);
    expect([...cron.clima!.afecta].sort()).toEqual([...obraGris].sort());
  });

  it('la plantilla (todo en cero y sin actividades) no activa el clima', () => {
    expect(leerClima(plantillaClima().valores, cron.actividades)).toEqual({ problemas: [] });
    expect(leerClima(undefined, cron.actividades)).toEqual({ problemas: [] });
  });

  it('errores: mes desconocido, días imposibles, actividad o categoría que no existe', () => {
    const v = plantillaClima().valores.map((f) => [...f]);
    v[2]![1] = 'Obra gris; Jardinería';
    v[5]![0] = 'Primavera'; // «Ene», «Feb»… sí valen
    v[6]![1] = 5;
    v[6]![3] = 2;
    const r = leerClima(v, cron.actividades);
    expect(r.clima).toBeUndefined();
    expect(r.problemas.map((p) => p.mensaje)).toEqual([
      expect.stringContaining('no es un mes'), expect.stringContaining('Febrero: los días perdidos'), expect.stringContaining('«Jardinería»'),
    ]);
  });
});

describe('simulación con clima (V8)', () => {
  it('caso analítico: 10 días en un mes que pierde siempre 4 de sus 20 laborables tardan 12,5', async () => {
    // Febrero de 2027: 20 días laborables de lunes a viernes; la actividad empieza el lunes 1.
    const meses = Array.from({ length: 12 }, () => ({ min: 0, masProbable: 0, max: 0 }));
    meses[1] = { min: 4, masProbable: 4, max: 4 };
    const c: Cronograma = {
      inicio: 46_419, calendario: CALENDARIO_ESTANDAR,
      actividades: [{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [] }],
      clima: { meses, afecta: ['A'] },
    };
    const r = await simularPlazo(c, [], { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 100 });
    expect(r.finProyecto.every((f) => Math.abs(f - 12.5) < 1e-9)).toBe(true);
    expect(r.determinista.dias).toBe(10); // el cronograma no cambia
  });

  it('una actividad que cruza de un mes seco a uno lluvioso solo pierde en el lluvioso', async () => {
    const meses = Array.from({ length: 12 }, () => ({ min: 0, masProbable: 0, max: 0 }));
    meses[2] = { min: 11.5, masProbable: 11.5, max: 11.5 }; // marzo de 2027: 23 laborables, pierde la mitad
    const c: Cronograma = {
      inicio: 46_419, calendario: CALENDARIO_ESTANDAR,
      // Empieza el 22/02 (índice 15): 5 días de febrero (secos) y lo que quede en marzo, a medio ritmo.
      actividades: [{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [], inicioNoAntesDe: 46_440 }],
      clima: { meses, afecta: ['A'] },
    };
    const r = await simularPlazo(c, [], { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 10 });
    expect(r.finProyecto[0]).toBeCloseTo(15 + 5 + 5 / 0.5, 9);
  });

  it('coincide con el Monte Carlo en Python (±1 día, ±3 puntos, ±1 % de costo, ±3 de JCL)', async () => {
    const r = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 20_000 });
    const e = hoja('Esperado (clima)');
    for (const [i, v] of [r.dias.p10, r.dias.p50, r.dias.p80, r.dias.p90].entries()) expect(Math.abs(v - (e[3 + i]![1] as number))).toBeLessThanOrEqual(1);
    for (const [i, v] of [r.costos!.p10, r.costos!.p50, r.costos!.p80, r.costos!.p90].entries()) expect(Math.abs(v / (e[3 + i]![3] as number) - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.costos!.jclP80 - (e[7]![1] as number))).toBeLessThan(0.03);
    const crit = new Map(e.slice(11).filter((f) => f[0] !== '' && f[0] !== undefined).map((f) => [String(f[0]), f[2] as number]));
    for (const a of r.actividades) expect(Math.abs(a.criticidad - crit.get(a.id)!), a.id).toBeLessThanOrEqual(0.03);
  });

  it('sin clima, lo de siempre: el clima usa sus propios números aleatorios', async () => {
    const base = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma!;
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2_000 };
    const a = await simularPlazo(base, riesgos, op);
    const nadie: Cronograma = { ...base, clima: { ...cron.clima!, afecta: [] } };
    expect(Array.from((await simularPlazo(nadie, riesgos, op)).finProyecto)).toEqual(Array.from(a.finProyecto));
    const con = await simularPlazo(cron, riesgos, op);
    expect(con.fechas.p80).toBeGreaterThan(a.fechas.p80);
  });

  it('con relojes (calendarios iguales al del proyecto) da lo mismo que sin ellos', async () => {
    const gemelo: Cronograma = {
      ...cron, calendarios: { X: { ...cron.calendario, festivos: new Set([...cron.calendario.festivos, 51_500]) } },
      actividades: cron.actividades.map((a) => ({ ...a, calendario: 'X' })),
    };
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2_000 };
    const a = await simularPlazo(cron, riesgos, op);
    const b = await simularPlazo(gemelo, riesgos, op);
    expect(b.fechas).toEqual(a.fechas);
    expect(b.actividades.map((x) => [x.criticidad, x.fin])).toEqual(a.actividades.map((x) => [x.criticidad, x.fin]));
  });

  it('en varios hilos, lo mismo; y «quitar y volver a simular» mide el clima', async () => {
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 5_000 };
    const hilos = crearHilosPlazoNode(2);
    try {
      const par = await simularPlazoEnParalelo(cron, riesgos, op, hilos.para(cron, riesgos, op), hilos.hilos);
      const uno = await simularPlazo(cron, riesgos, op);
      expect(Array.from(par.finProyecto)).toEqual(Array.from(uno.finProyecto));
      const imp = await impactoDeRiesgos(cron, riesgos, uno, op);
      const clima = imp.porRiesgo.find((x) => x.id === ID_CLIMA)!;
      const e = hoja('Esperado (clima)');
      // Lo que el clima añade al P80, como en el oráculo (158 − 143 = 15), ±2.
      expect(Math.abs(clima.diasP80 - ((e[5]![1] as number) - (e[8]![1] as number)))).toBeLessThanOrEqual(2);
      expect(imp.porRiesgo[0]!.id).toBe(ID_CLIMA); // el que más pesa
    } finally {
      hilos.cerrar();
    }
  }, 60_000);
});
