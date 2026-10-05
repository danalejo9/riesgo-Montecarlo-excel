/**
 * Gantt, motor (G1/G2): holgura de relación, relaciones impulsoras, ruta más
 * larga frente a holgura total (prueba 3), ruta impulsora hacia un hito
 * (prueba 4), ciclos (prueba 5), fecha límite, sintaxis de predecesoras y
 * jerarquía por WBS.
 */
import { describe, expect, it } from 'vitest';
import {
  analizarRutas, cadena, compilarRed, cpmDeterministico, leerPredecesoras, LUNES_A_VIERNES, padres, porQueCritica,
  renumerarWbs, rutaImpulsoraHacia, textoPredecesoras, descendientes, type ActividadRed,
} from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INI = serieDeFecha(2027, 1, 4);
const fc = (id: string, desfase = 0) => ({ id, tipo: 'FC' as const, desfase });
const red = (acts: ActividadRed[]) => compilarRed({ inicio: INI, calendarios: [{ id: 'c', laborables: LUNES_A_VIERNES }], actividades: acts });

describe('rutas (G2)', () => {
  // A(5) → B(5) → FIN; C(3) en paralelo con una FNLT que no cumple; D(2) tras A con holgura.
  const r = red([
    { id: 'A', nombre: 'A', duracion: 5, predecesoras: [] },
    { id: 'B', nombre: 'B', duracion: 5, predecesoras: [fc('A')] },
    { id: 'C', nombre: 'C', duracion: 3, restriccion: { tipo: 'FNLT', fecha: serieDeFecha(2027, 1, 5) }, predecesoras: [] },
    { id: 'D', nombre: 'D', duracion: 2, predecesoras: [fc('A')] },
    { id: 'FIN', nombre: 'Fin', duracion: 0, predecesoras: [fc('B'), fc('C'), fc('D')] },
  ]);
  const rutas = analizarRutas(r);
  const ids = (marca: Uint8Array) => r.ids.filter((_, i) => marca[i] === 1);

  it('ruta más larga frente a holgura total ≤ 0 con una FNLT (prueba 3)', () => {
    const det = cpmDeterministico(r);
    expect(det.filas.filter((f) => f.critica).map((f) => f.id)).toEqual(['A', 'B', 'C', 'FIN']);
    expect(ids(rutas.rutaMasLarga)).toEqual(['A', 'B', 'FIN']);
  });

  it('holgura de cada relación e impulsoras', () => {
    const h = Object.fromEntries([...r.relPred].map((p, k) => [`${r.ids[p]}→${r.ids[r.relSuc[k] as number]}`, rutas.holguraRelacion[k]]));
    expect(h).toEqual({ 'A→B': 0, 'A→D': 0, 'B→FIN': 0, 'C→FIN': 7, 'D→FIN': 3 });
  });

  it('ruta impulsora hacia un hito: exactamente las relaciones con holgura 0 (prueba 4)', () => {
    const fin = r.indice.get('FIN') as number;
    const c = rutaImpulsoraHacia(r, rutas, fin);
    expect([...c.actividades].map((i) => r.ids[i]).sort()).toEqual(['A', 'B', 'FIN']);
    for (const k of c.relaciones) expect(rutas.holguraRelacion[k]).toBe(0);
    expect(c.relaciones.size).toBe(2);
    const abajo = cadena(r, r.indice.get('A') as number, 'abajo');
    expect([...abajo.actividades].map((i) => r.ids[i]).sort()).toEqual(['A', 'B', 'D', 'FIN']);
  });

  it('¿por qué es crítica?', () => {
    const b = porQueCritica(r, rutas, r.indice.get('B') as number);
    expect(b.critica).toBe(true);
    expect(b.impulsadaPor.map((p) => p.id)).toEqual(['A']);
    expect(b.impulsaA.map((p) => p.id)).toEqual(['FIN']);
    const c = porQueCritica(r, rutas, r.indice.get('C') as number);
    expect(c.holgura).toBeLessThan(0);
    expect(c.causasNegativa[0]).toMatch(/C \(FNLT\)/);
    expect(c.texto).toMatch(/holgura negativa/);
  });

  it('una fecha límite no mueve la actividad pero da holgura negativa', () => {
    const r2 = red([
      { id: 'A', nombre: 'A', duracion: 5, fechaLimite: serieDeFecha(2027, 1, 6), predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 5, predecesoras: [fc('A')] },
    ]);
    const det = cpmDeterministico(r2);
    expect(det.filas[0]?.fin).toBe(serieDeFecha(2027, 1, 8));
    expect(det.filas[0]?.holguraTotal).toBe(-2);
  });

  it('un vínculo que crea un ciclo se rechaza (prueba 5)', () => {
    expect(() => red([
      { id: 'A', nombre: 'A', duracion: 1, predecesoras: [fc('B')] },
      { id: 'B', nombre: 'B', duracion: 1, predecesoras: [fc('A')] },
    ])).toThrow(/ciclo/);
  });
});

describe('sintaxis de predecesoras', () => {
  it('lee y escribe «5FC+2d; 7CC; 9FF-1d; C FC+7dc»', () => {
    const r = leerPredecesoras('5FC+2d; 7CC; 9FF-1d; C FC+7dc; INI');
    expect(r).toEqual({ ok: true, predecesoras: [
      { id: '5', tipo: 'FC', desfase: 2 }, { id: '7', tipo: 'CC', desfase: 0 }, { id: '9', tipo: 'FF', desfase: -1 },
      { id: 'C', tipo: 'FC', desfase: 7, transcurrido: true }, { id: 'INI', tipo: 'FC', desfase: 0 },
    ] });
    if (r.ok) expect(textoPredecesoras(r.predecesoras)).toBe('5FC+2d; 7CC; 9FF-1d; C FC+7dc; INI');
    expect(leerPredecesoras('B SS+3, AC FS')).toEqual({ ok: true, predecesoras: [{ id: 'B', tipo: 'CC', desfase: 3 }, { id: 'AC', tipo: 'FC', desfase: 0 }] });
    expect(leerPredecesoras('A; A').ok).toBe(false);
  });
});

describe('jerarquía por WBS', () => {
  it('padres, descendientes y renumeración', () => {
    const filas = [{ id: 'S1', wbs: '1', resumen: true }, { id: 'A', wbs: '1.1', resumen: false }, { id: 'B', wbs: '1.2', resumen: false }, { id: 'C', wbs: '2', resumen: false }];
    expect(padres(filas)).toEqual([-1, 0, 0, -1]);
    expect(descendientes(filas, 0)).toEqual([1, 2]);
    expect(renumerarWbs([1, 2, 2, 1, 2, 3, 1])).toEqual(['1', '1.1', '1.2', '2', '2.1', '2.1.1', '3']);
    expect(renumerarWbs([2, 3, 1])).toEqual(['1', '1.1', '2']);
  });
});

describe('rutas de holgura múltiples (G3)', () => {
  it('ruta 1 la más larga; las siguientes por menor holgura hacia la ruta ya asignada', async () => {
    const { rutasDeHolgura } = await import('../../engine/cronograma/index.ts');
    // I → A(10) → F ; I → B(7) → F ; I → C(3) → B ; I → D(2) → F
    const r = red([
      { id: 'I', nombre: 'I', duracion: 0, predecesoras: [] },
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [fc('I')] },
      { id: 'C', nombre: 'C', duracion: 3, predecesoras: [fc('I')] },
      { id: 'B', nombre: 'B', duracion: 5, predecesoras: [fc('C')] },
      { id: 'D', nombre: 'D', duracion: 2, predecesoras: [fc('I')] },
      { id: 'F', nombre: 'F', duracion: 0, predecesoras: [fc('A'), fc('B'), fc('D')] },
    ]);
    const n = rutasDeHolgura(r, analizarRutas(r));
    const de = (id: string) => n[r.indice.get(id) as number];
    expect([de('I'), de('A'), de('F')]).toEqual([1, 1, 1]);
    // B (holgura 2) con C, que la impulsa: ruta 2; D (holgura 8): ruta 3.
    expect([de('B'), de('C')]).toEqual([2, 2]);
    expect(de('D')).toBe(3);
  });
});
