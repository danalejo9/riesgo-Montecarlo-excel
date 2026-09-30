/**
 * W4: el sesgo de convergencia explicado. Casos exactos (dos rutas con
 * riesgos independientes o con uno común) y propiedades con el libro de
 * pruebas: la convergencia nunca empieza a tiempo más a menudo que su ruta
 * más floja.
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, hojaSimulacionPlazo, leerCronograma, leerRiesgosPlazo, narrativaPlazo, simularPlazo, OPCIONES_PLAZO_POR_DEFECTO,
  type Actividad, type Cronograma, type RiesgoPlazo,
} from '../../engine/cronograma/index.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const fs = (ids: string[]) => ids.map((p) => ({ predecesora: p, tipo: 'FS' as const, retardo: 0 }));
const red = (acts: Actividad[]): Cronograma => ({ inicio: 46_419, calendario: CALENDARIO_ESTANDAR, actividades: acts });
const riesgo = (id: string, actividades: string[]): RiesgoPlazo => ({ id, nombre: id, probabilidad: 0.3, impactoMin: 0.2, impactoMasProbable: 0.2, impactoMax: 0.2, actividades });

describe('sesgo de convergencia (W4)', () => {
  const acts: Actividad[] = [
    { id: 'A', nombre: 'Ruta A', duracion: 10, predecesoras: [] },
    { id: 'B', nombre: 'Ruta B', duracion: 10, predecesoras: [] },
    { id: 'C', nombre: 'Montaje', duracion: 5, predecesoras: fs(['A', 'B']) },
  ];
  const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 100_000 };

  it('dos rutas con riesgos independientes (30 % cada una): cada una a tiempo 70 %, las dos 49 %', async () => {
    const r = await simularPlazo(red(acts), [riesgo('RA', ['A']), riesgo('RB', ['B'])], op);
    const c = r.convergencias[0]!;
    expect(c).toMatchObject({ id: 'C', nombre: 'Montaje', inicioPlan: 46_433 }); // lunes 15/02/2027
    for (const x of c.ramas) expect(x.probATiempo).toBeCloseTo(0.7, 2);
    expect(c.probATiempo).toBeCloseTo(0.49, 2);
    expect(c.probProducto).toBeCloseTo(0.49, 2);
    expect(narrativaPlazo(r).find((l) => l.startsWith('En «Montaje» se juntan 2 rutas'))).toContain('las dos a la vez solo en el 49 %');
  });

  it('con un riesgo común, las rutas se mueven juntas: la convergencia a tiempo en el 70 %, no en el 49 %', async () => {
    const r = await simularPlazo(red(acts), [riesgo('R', ['A', 'B'])], op);
    const c = r.convergencias[0]!;
    expect(c.probATiempo).toBeCloseTo(0.7, 2);
    expect(c.probProducto).toBeCloseTo(0.49, 2);
  });

  it('un hito que converge: a tiempo si las ramas terminan el mismo día', async () => {
    const conHito = [...acts.slice(0, 2), { id: 'H', nombre: 'Entrega', duracion: 0, predecesoras: fs(['A', 'B']) }];
    const r = await simularPlazo(red(conHito), [riesgo('RA', ['A']), riesgo('RB', ['B'])], op);
    expect(r.convergencias[0]!.inicioPlan).toBe(46_430); // viernes 12/02: el hito se enseña el día en que terminan
    expect(r.convergencias[0]!.probATiempo).toBeCloseTo(0.49, 2);
  });

  it('libro de pruebas: nunca más a tiempo que la ruta más floja; ordenadas por sesgo; en la hoja', async () => {
    const hoja = (n: string) => leerHojaComoMatriz('ejemplos/demo-cronograma.xlsx', n) as unknown[][];
    const c = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma!;
    const r = await simularPlazo(c, leerRiesgosPlazo(hoja('Riesgos de plazo'), c.actividades).riesgos, { ...op, iteraciones: 5000 });
    expect(r.convergencias.map((x) => x.id).sort()).toEqual(['13', '14', '18', '5']);
    const sesgo = r.convergencias.map((x) => Math.min(...x.ramas.map((y) => y.probATiempo)) - x.probATiempo);
    for (const s of sesgo) expect(s).toBeGreaterThanOrEqual(-1e-12);
    expect([...sesgo].sort((a, b) => b - a)).toEqual(sesgo);
    const h = hojaSimulacionPlazo(r);
    expect(h.valores.some((f) => f[0] === 'Convergencia (sesgo de convergencia)')).toBe(true);
  });
});
