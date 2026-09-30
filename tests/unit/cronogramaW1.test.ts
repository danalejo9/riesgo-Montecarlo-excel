/**
 * W1: hitos contractuales y multas por retraso. La hoja «Hitos», el cálculo
 * de la multa (días naturales, tope), y la simulación contra el Monte Carlo
 * de referencia en Python («Hitos (prueba)» → «Esperado (hitos)»).
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, hojaSimulacionPlazo, leerCronograma, leerHitos, leerRiesgosPlazo, multaDe, narrativaPlazo, plantillaHitos, simularPlazo,
  simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { crearHilosPlazoNode } from '../helpers/hilosPlazoNode.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];
const lectura = leerCronograma(hoja('Actividades'), hoja('Calendario'), undefined, undefined, hoja('Hitos (prueba)'));
const cron = lectura.cronograma as Cronograma;
const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos;

describe('la hoja «Hitos» (W1)', () => {
  it('el escenario de prueba: tres hitos, uno sin multa', () => {
    expect(lectura.problemas).toEqual([]);
    expect(cron.hitos).toEqual([
      { id: '19', fecha: 46_612, multaDia: 2000, tope: 60_000 },
      { id: '13', fecha: 46_568, multaDia: 500, tope: 15_000 },
      { id: '7', fecha: 46_528 },
    ]);
  });

  it('la plantilla vacía no crea hitos; errores claros', () => {
    expect(leerHitos(plantillaHitos().valores, cron.actividades)).toEqual({ hitos: [], problemas: [] });
    const r = leerHitos([
      ['Hito (ID)', 'Fecha contractual', 'Multa por día de retraso', 'Tope de la multa'],
      ['99', 46_600, 100, ''],
      ['19', 'pronto', '', ''],
      ['13', 46_600, -5, ''],
      ['7', 46_600, '', ''],
      ['7', 46_610, '', ''],
    ], cron.actividades);
    expect(r.hitos).toEqual([{ id: '7', fecha: 46_600 }]);
    expect(r.problemas.map((p) => p.mensaje)).toEqual([
      expect.stringContaining('no es el ID de una actividad'), expect.stringContaining('debe ser una fecha'),
      expect.stringContaining('no negativos'), expect.stringContaining('repetido'),
    ]);
  });

  it('la multa: días naturales de retraso por la multa diaria, con tope', () => {
    const h = { id: 'x', fecha: 46_600, multaDia: 2000, tope: 15_000 };
    expect(multaDe(h, 46_600)).toBe(0);
    expect(multaDe(h, 46_603)).toBe(6000);
    expect(multaDe(h, 46_700)).toBe(15_000);
    expect(multaDe({ id: 'x', fecha: 46_600 }, 46_700)).toBe(0);
  });
});

describe('simulación con hitos contractuales (W1)', () => {
  const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 20_000 };

  it('caso exacto: una actividad fija que termina 3 días tarde paga 3 días de multa', async () => {
    const c: Cronograma = {
      inicio: 46_419, calendario: CALENDARIO_ESTANDAR, // lunes 01/02/2027
      actividades: [{ id: 'A', nombre: 'A', duracion: 5, predecesoras: [], costoFijo: 1000 }], // termina el viernes 05/02
      hitos: [{ id: 'A', fecha: 46_420, multaDia: 100 }], // martes 02/02: 3 días naturales de retraso
    };
    const r = await simularPlazo(c, [], { ...op, iteraciones: 50 });
    expect(r.hitos![0]).toMatchObject({ probCumplir: 0, p80: 46_423, margenP80: -3, multaMedia: 300 });
    expect(r.multas).toMatchObject({ media: 300, p80: 300, probAlguna: 1, determinista: 300 });
    expect(r.costos!.determinista).toBe(1300);
    expect(r.costos!.p80).toBe(1300);
  });

  it('coincide con el Monte Carlo en Python (probabilidad ±3 puntos, fechas ±1 día, dinero ±2 %)', async () => {
    const r = await simularPlazo(cron, riesgos, op);
    const e = hoja('Esperado (hitos)');
    for (const [i, id] of ['19', '13', '7'].entries()) {
      const h = r.hitos!.find((x) => x.id === id)!;
      const fila = e[3 + i]!;
      expect(Math.abs(h.probCumplir - (fila[1] as number)), id).toBeLessThan(0.03);
      expect(Math.abs(h.p50 - (fila[2] as number)), id).toBeLessThanOrEqual(1);
      expect(Math.abs(h.p80 - (fila[3] as number)), id).toBeLessThanOrEqual(1);
      if ((fila[4] as number) > 0) expect(Math.abs(h.multaMedia / (fila[4] as number) - 1), id).toBeLessThan(0.05);
      else expect(h.multaMedia).toBe(0);
    }
    const valor = (n: string) => e.find((f) => f[0] === n)![1] as number;
    expect(Math.abs(r.multas!.probAlguna - valor('Multas: probabilidad de alguna'))).toBeLessThan(0.03);
    expect(Math.abs(r.multas!.media / valor('Multas: media') - 1)).toBeLessThan(0.05);
    expect(Math.abs(r.costos!.p80 / valor('Costo P80 (con multas)') - 1)).toBeLessThan(0.02);
    expect(Math.abs(r.costos!.jclP80 - valor('JCL (con multas)'))).toBeLessThan(0.03);
  });

  it('los hitos no cambian el plazo; en varios hilos, lo mismo', async () => {
    const o = { ...op, iteraciones: 5000 };
    const sin = await simularPlazo({ ...cron, hitos: undefined }, riesgos, o);
    const con = await simularPlazo(cron, riesgos, o);
    expect(Array.from(con.finProyecto)).toEqual(Array.from(sin.finProyecto));
    expect(con.costos!.p80).toBeGreaterThan(sin.costos!.p80);
    const hilos = crearHilosPlazoNode(2);
    try {
      const par = await simularPlazoEnParalelo(cron, riesgos, o, hilos.para(cron, riesgos, o), hilos.hilos);
      expect(Array.from(par.costos!.porIteracion)).toEqual(Array.from(con.costos!.porIteracion));
      expect(par.hitos).toEqual(con.hitos);
      expect(par.multas).toEqual(con.multas);
    } finally {
      hilos.cerrar();
    }
  }, 30_000);

  it('el resumen en palabras y la hoja', async () => {
    const r = await simularPlazo(cron, riesgos, { ...op, iteraciones: 4000 });
    const t = narrativaPlazo(r);
    expect(t.some((l) => l.startsWith('El hito «Estructura» cumple su fecha contractual (21/05/2027) en el'))).toBe(true);
    expect(t.some((l) => l.startsWith('Hay multa por retraso en el'))).toBe(true);
    const h = hojaSimulacionPlazo(r);
    expect(h.valores.some((f) => f[0] === '19 · Entrega al cliente' && f[1] === 46_612)).toBe(true);
  });
});
