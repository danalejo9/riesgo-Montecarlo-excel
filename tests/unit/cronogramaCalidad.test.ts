import { describe, expect, it } from 'vitest';
import { chequearCalidad } from '../../engine/cronograma/index.ts';
import { modelo, INICIO_2027 } from '../helpers/cronogramas.ts';

const fc = (id: string, desfase = 0) => ({ id, tipo: 'FC' as const, desfase });

describe('chequeo de calidad del cronograma', () => {
  it('un ciclo bloquea y nombra sus actividades', () => {
    const r = chequearCalidad(modelo([
      { id: 'A', nombre: 'A', duracion: 1, predecesoras: [fc('B')] },
      { id: 'B', nombre: 'B', duracion: 1, predecesoras: [fc('A')] },
    ]));
    expect(r.bloquea).toBe(true);
    expect(r.criterios[0]?.estado).toBe('rojo');
    expect(r.criterios[0]?.actividades.sort()).toEqual(['A', 'B']);
  });

  it('señala extremos abiertos, adelantos, CF, duras, holgura y duración altas y falta de incertidumbre', () => {
    const r = chequearCalidad(modelo([
      { id: 'INI', nombre: 'Inicio', duracion: 0, predecesoras: [] },
      { id: 'A', nombre: 'A', duracion: 60, predecesoras: [fc('INI')] },
      { id: 'B', nombre: 'B', duracion: 5, predecesoras: [fc('A', -2)] },
      { id: 'SUELTA', nombre: 'Suelta', duracion: 3, predecesoras: [fc('INI')] },
      { id: 'C', nombre: 'C', duracion: 2, restriccion: { tipo: 'MSO', fecha: INICIO_2027 + 100 }, predecesoras: [{ id: 'B', tipo: 'CF', desfase: 0 }] },
      { id: 'FIN', nombre: 'Fin', duracion: 0, predecesoras: [fc('C')] },
    ], [{ actividad: 'A', distribucion: { tipo: 'triangular', min: 50, moda: 60, max: 80 } }]));
    const e = Object.fromEntries(r.criterios.map((c) => [c.id, c]));
    expect(r.bloquea).toBe(false);
    expect(e.extremos?.actividades).toEqual(['SUELTA']);
    expect(e.adelantos?.actividades).toEqual(['B']);
    expect(e.cf?.actividades).toEqual(['C']);
    expect(e.duras?.actividades).toEqual(['C']);
    expect(e.largas?.actividades).toEqual(['A']);
    expect(e.holgura?.actividades).toContain('SUELTA');
    expect(e.incertidumbre?.actividades).toEqual(['B', 'SUELTA', 'C']);
    expect(e.incertidumbre?.estado).toBe('rojo');
  });

  it('un cronograma limpio sale en verde (salvo la correlación, que llega en la fase 2)', () => {
    const tri = { tipo: 'triangular' as const, min: 2, moda: 3, max: 5 };
    const r = chequearCalidad(modelo([
      { id: 'A', nombre: 'A', duracion: 3, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 3, predecesoras: [fc('A')] },
      { id: 'C', nombre: 'C', duracion: 3, predecesoras: [fc('A')] },
      { id: 'D', nombre: 'D', duracion: 3, predecesoras: [fc('B'), fc('C')] },
    ], ['A', 'B', 'C', 'D'].map((actividad) => ({ actividad, distribucion: tri }))));
    expect(r.criterios.filter((c) => c.estado !== 'verde').map((c) => c.id)).toEqual(['correlacion']);
    const conCorr = chequearCalidad({ ...modelo([{ id: 'A', nombre: 'A', duracion: 3, predecesoras: [] }], [{ actividad: 'A', distribucion: tri }]), correlaciones: [{ a: 'A', b: 'A', rho: 0.5 }] });
    expect(conCorr.criterios.find((c) => c.id === 'correlacion')?.estado).toBe('verde');
  });
});
