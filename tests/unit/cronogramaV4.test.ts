/**
 * V4: incertidumbre en los costos de cada actividad (mínimo y máximo del
 * costo fijo y del costo por día). Contra casos analíticos, contra la misma
 * simulación sin rangos (mismos números aleatorios) y contra el Monte Carlo
 * de referencia en Python («Esperado (costos inciertos)»).
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, hojaActividadesDe, hojaSimulacionPlazo, leerActividades, leerCronograma, leerRiesgosPlazo, narrativaPlazo,
  simularPlazo, simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO, type Cronograma, type RiesgoPlazo,
} from '../../engine/cronograma/index.ts';
import { pert } from '../../engine/distributions/pert.ts';
import { crearHilosPlazoNode } from '../helpers/hilosPlazoNode.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];

/** «Actividades» con los valores de «Costos inciertos (prueba)» copiados en sus columnas (como pide la guía). */
function actividadesConRangos(): unknown[][] {
  const act = hoja('Actividades').map((f) => [...f]);
  const enc = act[2] as string[];
  const prueba = hoja('Costos inciertos (prueba)');
  const cab = prueba[2] as string[];
  for (const fila of prueba.slice(3).filter((f) => f[0] !== '' && f[0] !== undefined)) {
    const destino = act.find((f, i) => i > 2 && String(f[0]) === String(fila[0]))!;
    for (const nombre of ['Costo fijo mínimo', 'Costo fijo máximo', 'Costo por día mínimo', 'Costo por día máximo']) {
      destino[enc.indexOf(nombre)] = fila[cab.indexOf(nombre)];
    }
  }
  return act;
}

const base = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma as Cronograma;
const lectura = leerCronograma(actividadesConRangos(), hoja('Calendario'));
const conRangos = lectura.cronograma as Cronograma;
const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), base.actividades).riesgos;

function tabla(filas: unknown[][]): unknown[][] {
  return [['ID', 'Actividad', 'Duración', 'Costo por día', 'Costo fijo', 'Costo fijo mínimo', 'Costo fijo máximo', 'Costo por día mínimo', 'Costo por día máximo'], ...filas];
}

describe('lectura de los rangos de costo (V4)', () => {
  it('el libro de pruebas los lee sin errores, y el más probable es el costo de su columna', () => {
    expect(lectura.problemas.filter((p) => p.gravedad === 'error')).toEqual([]);
    const a = (id: string) => conRangos.actividades.find((x) => x.id === id)!;
    expect(a('7')).toMatchObject({ costoFijo: 140000, costoFijoRango: { min: 130000, max: 190000 }, costoPorDia: 3500, costoPorDiaRango: { min: 3200, max: 4600 } });
    expect(a('10').costoFijoRango).toBeUndefined();
    expect(a('10').costoPorDiaRango).toEqual({ min: 1600, max: 2400 });
    expect(a('5').costoFijoRango).toBeUndefined();
  });

  it('errores claros: falta el máximo, falta el más probable, orden imposible', () => {
    const r = leerActividades(tabla([
      ['A', 'a', 5, 100, 1000, 900, '', '', ''],
      ['B', 'b', 5, '', '', 900, 1200, '', ''],
      ['C', 'c', 5, 100, 1000, 1100, 1200, '', ''],
      ['D', 'd', 5, 100, 1000, '', '', 120, 90],
      ['E', 'e', 5, 100, 1000, 1000, 1000, 100, 150],
    ]));
    const errores = r.problemas.filter((p) => p.gravedad === 'error').map((p) => [p.actividad, p.mensaje]);
    expect(errores).toHaveLength(4);
    expect(errores[0]![1]).toContain('hacen falta su mínimo y su máximo');
    expect(errores[1]![1]).toContain('falta el costo fijo (el valor más probable)');
    expect(errores[2]![1]).toContain('mínimo ≤ costo fijo ≤ máximo');
    expect(errores[3]![1]).toContain('costo por día');
    // Mínimo = máximo: sin incertidumbre (no es un error).
    expect(r.actividades.find((a) => a.id === 'E')).toMatchObject({ costoPorDiaRango: { min: 100, max: 150 } });
    expect(r.actividades.find((a) => a.id === 'E')!.costoFijoRango).toBeUndefined();
  });

  it('una hoja escrita desde el cronograma (importado) conserva costo fijo y rangos', () => {
    const h = hojaActividadesDe(conRangos, 'x');
    const vuelta = leerActividades(h.valores);
    expect(vuelta.problemas.filter((p) => p.gravedad === 'error')).toEqual([]);
    for (const a of conRangos.actividades) {
      const b = vuelta.actividades.find((x) => x.id === a.id)!;
      expect([b.costoFijo, b.costoFijoRango, b.costoPorDiaRango]).toEqual([a.costoFijo, a.costoFijoRango, a.costoPorDiaRango]);
    }
  });
});

describe('simulación con costos inciertos (V4)', () => {
  const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 20_000 };

  it('un costo fijo con rango y nada más: su distribución es la PERT (y la triangular)', async () => {
    const c: Cronograma = {
      inicio: 46_024, calendario: CALENDARIO_ESTANDAR,
      actividades: [{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [], costoFijo: 1000, costoFijoRango: { min: 800, max: 1600 } }],
    };
    const r = await simularPlazo(c, [], op);
    const d = pert(800, 1000, 1600);
    expect(r.costos!.determinista).toBe(1000);
    expect(r.costos!.media).toBeCloseTo((800 + 4 * 1000 + 1600) / 6, -1); // ±5 con 20.000 iteraciones
    for (const [q, v] of [[0.1, r.costos!.p10], [0.5, r.costos!.p50], [0.8, r.costos!.p80], [0.9, r.costos!.p90]] as const) {
      expect(Math.abs(v - d.quantile(q))).toBeLessThan(10);
    }
    expect(r.costos!.rangos).toEqual({ n: 1, p80SinRangos: 1000, aporteP80: r.costos!.p80 - 1000 });
    const t = await simularPlazo(c, [], { ...op, forma: 'triangular' });
    expect(t.costos!.media).toBeCloseTo((800 + 1000 + 1600) / 3, -1);
  });

  it('costo por día con rango: se multiplica por la duración de cada iteración', async () => {
    const c: Cronograma = {
      inicio: 46_024, calendario: CALENDARIO_ESTANDAR,
      actividades: [{ id: 'A', nombre: 'A', duracion: 10, predecesoras: [], costoPorDia: 100, costoPorDiaRango: { min: 100, max: 100.0001 } }],
    };
    const r = await simularPlazo(c, [], op);
    expect(r.costos!.p50).toBeCloseTo(1000, 1);
    const c2: Cronograma = { ...c, actividades: [{ ...c.actividades[0]!, costoPorDiaRango: { min: 80, max: 160 } }] };
    const r2 = await simularPlazo(c2, [], op);
    expect(r2.costos!.media).toBeCloseTo(((80 + 400 + 160) / 6) * 10, -1);
  });

  it('los rangos no cambian el plazo ni lo demás: mismas fechas; sin su sorteo, el mismo costo exacto', async () => {
    const sin = await simularPlazo(base, riesgos, op);
    const con = await simularPlazo(conRangos, riesgos, op);
    expect(Array.from(con.finProyecto)).toEqual(Array.from(sin.finProyecto));
    expect(con.actividades).toEqual(sin.actividades);
    expect(con.costos!.determinista).toBe(sin.costos!.determinista);
    // El P80 «con los más probables» es el P80 de la simulación sin rangos: mismas iteraciones.
    expect(con.costos!.rangos!.p80SinRangos).toBe(sin.costos!.p80);
    expect(con.costos!.rangos!.n).toBe(7);
    expect(con.costos!.p80).toBeGreaterThan(sin.costos!.p80);
  });

  it('coincide con el Monte Carlo de referencia en Python (±1 % de costo, ±3 puntos de JCL)', async () => {
    const r = await simularPlazo(conRangos, riesgos, op);
    const esperado = new Map(hoja('Esperado (costos inciertos)').slice(3).filter((f) => f[0]).map((f) => [String(f[0]), f[1] as number]));
    const c = r.costos!;
    expect(c.determinista).toBeCloseTo(esperado.get('Determinista (exacto; con los más probables)')!, 6);
    for (const [k, v] of [['P10', c.p10], ['P50', c.p50], ['P80', c.p80], ['P90', c.p90], ['Media', c.media], ['P80 con los costos más probables', c.rangos!.p80SinRangos]] as const) {
      expect(Math.abs(v / esperado.get(k)! - 1), k).toBeLessThan(0.01);
    }
    expect(Math.abs(c.jclP80 - esperado.get('JCL: P(plazo ≤ P80 y costo ≤ P80)')!)).toBeLessThan(0.03);
  });

  it('en varios hilos da exactamente lo mismo', async () => {
    const hilos = crearHilosPlazoNode(2);
    try {
      const o = { ...op, iteraciones: 6_000 };
      const par = await simularPlazoEnParalelo(conRangos, riesgos, o, hilos.para(conRangos, riesgos, o), hilos.hilos);
      const uno = await simularPlazo(conRangos, riesgos, o);
      expect(Array.from(par.costos!.porIteracion)).toEqual(Array.from(uno.costos!.porIteracion));
      expect(par.costos!.rangos).toEqual(uno.costos!.rangos);
    } finally {
      hilos.cerrar();
    }
  }, 30_000);

  it('la hoja y el resumen en palabras dicen lo que añaden los rangos', async () => {
    const r = await simularPlazo(conRangos, riesgos as RiesgoPlazo[], { ...op, iteraciones: 4000 });
    const texto = narrativaPlazo(r);
    expect(texto.some((l) => l.startsWith('La incertidumbre de los propios costos (7 costos con mínimo y máximo) añade'))).toBe(true);
    const h = hojaSimulacionPlazo(r);
    const fila = h.valores.find((f) => f[0] === 'Lo que añade la incertidumbre de los costos al P80')!;
    expect(fila[1]).toBeCloseTo(r.costos!.rangos!.aporteP80, 6);
  });
});
