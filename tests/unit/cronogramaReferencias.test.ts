/**
 * Prueba obligatoria 1 de la especificación QRSA, sin MS Project (Q0.2): el
 * motor CPM tiene que dar, día por día, lo mismo que la implementación
 * independiente en Python (`tests/fixtures/qrsa/generar-referencias.py`) en
 * los tres cronogramas de referencia, y lo mismo que los casos de libro.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  compilarRed, cpmDeterministico, festivosColombia, LUNES_A_VIERNES, type ActividadRed, type TipoRelacion,
} from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const DIR = new URL('../fixtures/qrsa/', import.meta.url);

function serie(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number) as [number, number, number];
  return serieDeFecha(a, m, d);
}

interface RedJson {
  inicio: string;
  festivos: string[];
  actividades: { id: string; nombre: string; duracion: number; snet?: string; fnlt?: string; predecesoras: { id: string; tipo: TipoRelacion; desfase: number; calendario?: boolean }[] }[];
}

function cargar(nombre: string) {
  const red = JSON.parse(readFileSync(new URL(`${nombre}-red.json`, DIR), 'utf8')) as RedJson;
  const actividades: ActividadRed[] = red.actividades.map((a) => ({
    id: a.id, nombre: a.nombre, duracion: a.duracion,
    restriccion: a.snet ? { tipo: 'SNET', fecha: serie(a.snet) } : a.fnlt ? { tipo: 'FNLT', fecha: serie(a.fnlt) } : undefined,
    predecesoras: a.predecesoras.map((p) => ({ id: p.id, tipo: p.tipo, desfase: p.desfase, transcurrido: p.calendario === true })),
  }));
  const compilada = compilarRed({
    inicio: serie(red.inicio),
    calendarios: [{ id: 'base', laborables: LUNES_A_VIERNES, festivos: red.festivos.map(serie) }],
    actividades,
  });
  const esperado = readFileSync(new URL(`${nombre}-esperado.csv`, DIR), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => {
    const [id, , duracion, inicio, fin, holgura, critica, libre] = l.split(',');
    return { id, duracion: Number(duracion), inicio: serie(inicio as string), fin: serie(fin as string), holgura: Number(holgura), critica: critica === 'sí', libre: Number(libre) };
  });
  return { compilada, esperado };
}

describe('CPM contra los cronogramas de referencia (0 días de tolerancia)', () => {
  for (const [nombre, fin] of [['R1-simple', '2027-01-21'], ['R2-relaciones', '2027-02-25'], ['R3-calendario', '2027-11-24']] as const) {
    it(nombre, () => {
      const { compilada, esperado } = cargar(nombre);
      const r = cpmDeterministico(compilada);
      expect(r.fin).toBe(serie(fin));
      for (const e of esperado) {
        const f = r.filas.find((x) => x.id === e.id);
        expect({ id: f?.id, inicio: f?.inicio, fin: f?.fin, holgura: f?.holguraTotal, critica: f?.critica, libre: f?.holguraLibre })
          .toEqual({ id: e.id, inicio: e.inicio, fin: e.fin, holgura: e.holgura, critica: e.critica, libre: e.libre });
      }
    });
  }

  it('R1: 14 días laborables y holgura libre de las ramas cortas', () => {
    const r = cpmDeterministico(cargar('R1-simple').compilada);
    expect(r.duracion).toBe(14);
    // C (pedido de acero) puede retrasarse sin mover a E: su holgura libre es 0; la de E, 4.
    expect(r.filas.find((f) => f.id === 'C')?.holguraLibre).toBe(0);
    expect(r.filas.find((f) => f.id === 'E')?.holguraLibre).toBe(4);
  });
});

describe('festivos de Colombia', () => {
  it('coinciden con la tabla de Python (2026–2030)', () => {
    const csv = readFileSync(new URL('festivos-colombia.csv', DIR), 'utf8').trim().split(/\r?\n/).slice(1);
    const nuestros = [2026, 2027, 2028, 2029, 2030].flatMap((a) => festivosColombia(a));
    expect(nuestros.length).toBe(csv.length);
    csv.forEach((l, i) => {
      const [f, nombre] = l.split(',');
      expect([nuestros[i]?.dia, nuestros[i]?.nombre]).toEqual([serie(f as string), nombre]);
    });
  });
});

describe('casos de libro', () => {
  it('red AON clásica: ruta crítica A-C-D-F y holguras', () => {
    // Red de los manuales de CPM: A(3); B(2)←A; C(4)←A; D(5)←C; E(3)←B; F(2)←D,E. Fin = 14 días.
    const red = compilarRed({
      inicio: serie('2027-01-04'),
      calendarios: [{ id: 'c', laborables: [true, true, true, true, true, true, true] }],
      actividades: [
        { id: 'A', nombre: 'A', duracion: 3, predecesoras: [] },
        { id: 'B', nombre: 'B', duracion: 2, predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }] },
        { id: 'C', nombre: 'C', duracion: 4, predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }] },
        { id: 'D', nombre: 'D', duracion: 5, predecesoras: [{ id: 'C', tipo: 'FC', desfase: 0 }] },
        { id: 'E', nombre: 'E', duracion: 3, predecesoras: [{ id: 'B', tipo: 'FC', desfase: 0 }] },
        { id: 'F', nombre: 'F', duracion: 2, predecesoras: [{ id: 'D', tipo: 'FC', desfase: 0 }, { id: 'E', tipo: 'FC', desfase: 0 }] },
      ],
    });
    const r = cpmDeterministico(red);
    expect(r.duracion).toBe(14);
    expect(Object.fromEntries(r.filas.map((f) => [f.id, f.holguraTotal]))).toEqual({ A: 0, B: 4, C: 0, D: 0, E: 4, F: 0 });
    expect(r.filas.filter((f) => f.critica).map((f) => f.id)).toEqual(['A', 'C', 'D', 'F']);
  });

  it('detecta un ciclo y nombra sus actividades', () => {
    expect(() => compilarRed({
      inicio: serie('2027-01-04'),
      calendarios: [{ id: 'c', laborables: LUNES_A_VIERNES }],
      actividades: [
        { id: 'A', nombre: 'A', duracion: 1, predecesoras: [] },
        { id: 'B', nombre: 'B', duracion: 1, predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }, { id: 'D', tipo: 'FC', desfase: 0 }] },
        { id: 'C', nombre: 'C', duracion: 1, predecesoras: [{ id: 'B', tipo: 'FC', desfase: 0 }] },
        { id: 'D', nombre: 'D', duracion: 1, predecesoras: [{ id: 'C', tipo: 'FC', desfase: 0 }] },
      ],
    })).toThrow(/ciclo en las relaciones: (B → C → D → B|C → D → B → C|D → B → C → D)$/);
  });

  it('una actividad en un calendario de lunes a sábado avanza los sábados', () => {
    const red = compilarRed({
      inicio: serie('2027-01-04'),
      calendarios: [{ id: 'lv', laborables: LUNES_A_VIERNES }, { id: 'ls', laborables: [true, true, true, true, true, true, false] }],
      actividades: [
        { id: 'A', nombre: 'A', duracion: 5, predecesoras: [] },
        { id: 'B', nombre: 'B', duracion: 6, calendario: 'ls', predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }] },
        { id: 'C', nombre: 'C', duracion: 1, predecesoras: [{ id: 'B', tipo: 'FC', desfase: 0 }] },
      ],
    });
    const r = cpmDeterministico(red);
    // A: lun 04 a vie 08. B (lunes a sábado) empieza el sábado 09 y termina el vie 15. C: lun 18.
    expect(r.filas.map((f) => [f.inicio, f.fin])).toEqual([
      [serie('2027-01-04'), serie('2027-01-08')],
      [serie('2027-01-09'), serie('2027-01-15')],
      [serie('2027-01-18'), serie('2027-01-18')],
    ]);
    // B podría terminar el sábado 16 sin mover a C: un día de holgura en su calendario.
    expect(r.filas.map((f) => f.holguraTotal)).toEqual([0, 1, 0]);
  });
});

describe('festivos', () => {
  it('2027 trae los 18 de la ley, con Reyes y San José trasladados al lunes', () => {
    const f = festivosColombia(2027);
    expect(f).toHaveLength(18);
    expect(f.find((x) => x.nombre === 'Reyes Magos')?.dia).toBe(serie('2027-01-11'));
    expect(f.find((x) => x.nombre === 'San José')?.dia).toBe(serie('2027-03-22'));
    expect(f.find((x) => x.nombre === 'Viernes Santo')?.dia).toBe(serie('2027-03-26'));
  });
});

describe('restricciones duras y duraciones decimales', () => {
  const definir = (restriccion?: { tipo: 'MSO'; fecha: number }) => compilarRed({
    inicio: serie('2027-01-04'),
    calendarios: [{ id: 'c', laborables: LUNES_A_VIERNES }],
    actividades: [
      { id: 'A', nombre: 'A', duracion: 5, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 2, restriccion, predecesoras: [{ id: 'A', tipo: 'FC', desfase: 0 }] },
    ],
  });

  it('«debe comenzar el» anula la lógica, salvo que se ignore', () => {
    const red = definir({ tipo: 'MSO', fecha: serie('2027-01-06') });
    const r = cpmDeterministico(red);
    expect(r.filas[1]?.inicio).toBe(serie('2027-01-06'));
    // A tendría que terminar antes del miércoles: holgura negativa.
    expect(r.filas[0]?.holguraTotal).toBe(-3);
    expect(cpmDeterministico(red, { ignorarDuras: true }).filas[1]?.inicio).toBe(serie('2027-01-11'));
  });

  it('con decimales, medio día más mueve el fin sin redondear', () => {
    const red = definir();
    const r = cpmDeterministico(red, {}, Float64Array.from([5.5, 2]));
    // A acaba a mediodía del lunes 11; B empieza ahí y acaba a mediodía del miércoles 13.
    expect(r.filas.map((f) => [f.inicio, f.fin])).toEqual([[serie('2027-01-04'), serie('2027-01-11')], [serie('2027-01-11'), serie('2027-01-13')]]);
    expect(r.duracion).toBeCloseTo(7.5, 12);
  });
});
