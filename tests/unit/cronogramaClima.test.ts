/** V8: clima probabilístico, en el motor y en la hoja Clima. */
import { describe, expect, it } from 'vitest';
import { MESES, simularCronograma, type ActividadRed, type Clima } from '../../engine/cronograma/index.ts';
import { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA as H } from '../../excel/cronogramaHojas.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { modelo } from '../helpers/cronogramas.ts';

const fc = (id: string) => ({ id, tipo: 'FC' as const, desfase: 0 });
const fijo = (dias: number) => MESES.map(() => ({ min: dias, masProbable: dias, max: dias }));

describe('clima en el motor', () => {
  it('un mes que pierde un 20 % alarga una actividad de 10 días a 12,5 y no toca a las no expuestas', async () => {
    // Febrero de 2027 tiene 20 días laborables de lunes a viernes: perder 4 es el 20 %.
    const red: ActividadRed[] = [
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [], restriccion: { tipo: 'SNET', fecha: serieDeFecha(2027, 2, 1) } },
      { id: 'B', nombre: 'B', duracion: 10, predecesoras: [], restriccion: { tipo: 'SNET', fecha: serieDeFecha(2027, 2, 1) } },
    ];
    const clima: Clima = { meses: fijo(4), afecta: ['A'] };
    const sim = await simularCronograma({ ...modelo(red, [], [], { iteraciones: 5, redondeo: 'decimal' }), clima });
    const iA = sim.red.indice.get('A') as number;
    const iB = sim.red.indice.get('B') as number;
    // El fin de A cae a mitad del día 13 (12,5 días laborables desde el 1 de febrero).
    expect(sim.fechas.fin[iA]![0]).toBe(serieDeFecha(2027, 2, 17));
    expect(sim.fechas.fin[iB]![0]).toBe(serieDeFecha(2027, 2, 12));
    expect(sim.media).toBeCloseTo(sim.deterministico.duracion + 2.5, 9);
    // El determinístico no cambia; «sin clima» vuelve a él.
    expect(sim.deterministico.fin).toBe(serieDeFecha(2027, 2, 12));
    expect(sim.sinClima?.media).toBe(sim.deterministico.duracion);
  });

  it('la misma actividad sufre más en el mes lluvioso que en el seco', async () => {
    const meses = MESES.map((_, k) => (k === 3 ? { min: 4, masProbable: 8, max: 12 } : { min: 0, masProbable: 0, max: 0 }));
    const actividad = (mes: number): ActividadRed[] => [{ id: 'A', nombre: 'A', duracion: 15, predecesoras: [], restriccion: { tipo: 'SNET', fecha: serieDeFecha(2027, mes, 1) } }];
    const abril = await simularCronograma({ ...modelo(actividad(4), [], [], { iteraciones: 500 }), clima: { meses, afecta: ['A'] } });
    const julio = await simularCronograma({ ...modelo(actividad(7), [], [], { iteraciones: 500 }), clima: { meses, afecta: ['A'] } });
    expect(abril.media - abril.deterministico.duracion).toBeGreaterThan(4);
    expect(julio.media).toBe(julio.deterministico.duracion);
  });

  it('cada mes del horizonte se sortea aparte, y el clima no cambia con los riesgos (mismos números)', async () => {
    const red: ActividadRed[] = [
      { id: 'A', nombre: 'A', duracion: 120, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 10, predecesoras: [fc('A')] },
    ];
    const clima: Clima = { meses: MESES.map(() => ({ min: 0, masProbable: 2, max: 6 })), afecta: ['A'] };
    const m = { ...modelo(red, [], [{ id: 'R', nombre: 'R', probabilidad: 0.5, impactos: [{ actividad: 'B', dias: { tipo: 'fija', valor: 5 } }] }], { iteraciones: 2000, redondeo: 'decimal' }), clima };
    const sim = await simularCronograma(m);
    const sinR = await simularCronograma({ ...m, riesgos: [] });
    // El riesgo solo toca B: A dura lo mismo en las dos simulaciones, iteración a iteración.
    const iA = sim.red.indice.get('A') as number;
    expect([...(sim.fechas.fin[iA] as Float32Array)]).toEqual([...(sinR.fechas.fin[iA] as Float32Array)]);
    // Seis meses de pérdida independiente: la desviación es menor que con un solo sorteo para todo.
    const extra = [...sim.fin.dias].map((d) => d - sim.deterministico.duracion);
    expect(Math.min(...extra)).toBeGreaterThan(0);
    expect(sim.sinClima!.p80).toBeLessThan(sim.p80);
  });
});

describe('hoja Clima', () => {
  const libro = () => Object.fromEntries(hojasNuevasCronograma(serieDeFecha(2027, 1, 4)).map((h) => [h.nombre, h.valores.map((f) => [...f])]));

  it('el ejemplo trae la hoja en cero: sin clima', () => {
    const r = leerCronograma(libro());
    expect(r.errores).toEqual([]);
    expect(r.modelo?.clima).toBeUndefined();
  });

  it('lee los meses y las actividades expuestas (por ID, WBS o grupo)', () => {
    const l = libro();
    const c = l[H.clima] as unknown[][];
    c[4]![1] = 2; c[4]![2] = 4; c[4]![3] = 8; // abril
    c[1]![5] = 'E';
    c[2]![5] = 'WBS 3';
    c[3]![5] = 'Grupo Instalaciones';
    const r = leerCronograma(l);
    expect(r.errores).toEqual([]);
    expect(r.modelo?.clima?.meses[3]).toEqual({ min: 2, masProbable: 4, max: 8 });
    expect(r.modelo?.clima?.afecta).toEqual(['E', 'G', 'H', 'I', 'M']);
  });

  it('señala un mes que no existe, un rango imposible y una actividad desconocida', () => {
    const l = libro();
    const c = l[H.clima] as unknown[][];
    c[1]![0] = 'Brumario';
    c[2]![1] = 5; c[2]![2] = 3; c[2]![3] = 8;
    c[1]![5] = 'ZZ';
    const r = leerCronograma(l);
    expect(r.errores.map((e) => `${e.hoja}!${e.columna}${e.fila}`)).toEqual(['Clima!A2', 'Clima!B3', 'Clima!F2']);
  });

  it('con el ejemplo y lluvia en la estructura, el fin se retrasa', async () => {
    const l = libro();
    const c = l[H.clima] as unknown[][];
    for (let k = 1; k <= 12; k++) { c[k]![1] = 1; c[k]![2] = 3; c[k]![3] = 6; }
    c[1]![5] = 'E';
    const m = leerCronograma(l).modelo!;
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 500 } });
    expect(sim.sinClima).not.toBeNull();
    expect(sim.p80).toBeGreaterThan(sim.sinClima!.p80);
  });
});
