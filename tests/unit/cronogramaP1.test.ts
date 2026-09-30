/**
 * Bloque P, etapas P0 y P1: predecesoras, calendario, lector de las hojas y
 * CPM determinista. El caso grande está en `cronogramaDemo.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, IndiceLaborable, calcularCPM, diaSemana, leerActividades, leerCalendario, leerCronograma,
  leerPredecesoras, textoRelacion, type Actividad, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { fijarCapacidades, tieneCapacidad, TODAS_LAS_CAPACIDADES } from '../../engine/licencia/capacidades.ts';
import { formatoMoneda, moneda } from '../../engine/modelo/moneda.ts';

const LUNES = serieDeFecha(2027, 2, 1);

function crono(actividades: Array<Partial<Actividad> & { id: string; duracion: number; preds?: string }>): Cronograma {
  return {
    inicio: LUNES,
    calendario: CALENDARIO_ESTANDAR,
    actividades: actividades.map((a) => {
      const p = leerPredecesoras(a.preds ?? '');
      if (!p.ok) throw new Error(p.error);
      return { nombre: a.id, predecesoras: p.relaciones, ...a };
    }),
  };
}

function cpmOk(c: Cronograma) {
  const r = calcularCPM(c);
  if (!r.ok) throw new Error(r.problemas.map((p) => p.mensaje).join('; '));
  return { ...r, de: (id: string) => r.filas.find((f) => f.id === id)! };
}

describe('predecesoras', () => {
  it('lee la sintaxis de MS Project en inglés y en español', () => {
    const r = leerPredecesoras('3; 4FC+2; 5CC-1; 6FF+2d; 7CF; 8SS+1,5 días');
    expect(r).toEqual({
      ok: true,
      relaciones: [
        { predecesora: '3', tipo: 'FS', retardo: 0 },
        { predecesora: '4', tipo: 'FS', retardo: 2 },
        { predecesora: '5', tipo: 'SS', retardo: -1 },
        { predecesora: '6', tipo: 'FF', retardo: 2 },
        { predecesora: '7', tipo: 'SF', retardo: 0 },
        { predecesora: '8', tipo: 'SS', retardo: 1.5 },
      ],
    });
  });
  it('un número solo (Excel convierte «3» en número) y vacío', () => {
    expect(leerPredecesoras(3)).toEqual({ ok: true, relaciones: [{ predecesora: '3', tipo: 'FS', retardo: 0 }] });
    expect(leerPredecesoras('')).toEqual({ ok: true, relaciones: [] });
    expect(leerPredecesoras(undefined)).toEqual({ ok: true, relaciones: [] });
  });
  it('rechaza lo que no admite, sin leerlo mal', () => {
    expect(leerPredecesoras('3FC+50%').ok).toBe(false);
    expect(leerPredecesoras('3FC+2ed').ok).toBe(false);
  });
  it('escribe una relación como en MS Project en español', () => {
    expect(textoRelacion({ predecesora: '3', tipo: 'FS', retardo: 0 })).toBe('3');
    expect(textoRelacion({ predecesora: '3', tipo: 'SS', retardo: -2 })).toBe('3CC-2');
  });
});

describe('calendario', () => {
  it('días de la semana y festivos', () => {
    expect(diaSemana(LUNES)).toBe(1);
    const cal = { ...CALENDARIO_ESTANDAR, festivos: new Set([LUNES + 7]) };
    const idx = new IndiceLaborable(cal, LUNES - 2); // empieza en sábado: salta al lunes
    expect(idx.fechaDeIndice(0)).toBe(LUNES);
    expect(idx.fechaDeIndice(4)).toBe(LUNES + 4); // viernes
    expect(idx.fechaDeIndice(5)).toBe(LUNES + 8); // el lunes siguiente es festivo
    expect(idx.indiceDesde(LUNES + 7)).toBe(5); // un festivo: el siguiente laborable
    expect(idx.indiceDesde(LUNES + 5)).toBe(5); // un sábado, igual
  });
  it('un calendario sin días laborables es un error', () => {
    expect(() => new IndiceLaborable({ laborables: new Array(7).fill(false), festivos: new Set() }, LUNES)).toThrow();
  });
});

describe('CPM', () => {
  it('cadena fin-comienzo con fechas de fin de MS Project', () => {
    const r = cpmOk(crono([{ id: 'A', duracion: 5 }, { id: 'B', duracion: 3, preds: 'A' }]));
    expect(r.de('A').fechaInicio).toBe(LUNES);
    expect(r.de('A').fechaFin).toBe(LUNES + 4); // viernes
    expect(r.de('B').fechaInicio).toBe(LUNES + 7); // lunes siguiente
    expect(r.de('B').fechaFin).toBe(LUNES + 9);
    expect(r.duracionProyecto).toBe(8);
    expect(r.filas.every((f) => f.critica)).toBe(true);
  });

  it('las cuatro relaciones con retardo', () => {
    const r = cpmOk(crono([
      { id: 'A', duracion: 10 },
      { id: 'SS', duracion: 4, preds: 'ACC+2' }, // empieza 2 días después de A
      { id: 'FF', duracion: 4, preds: 'AFF+1' }, // termina 1 día después de A: empieza en 7
      { id: 'SF', duracion: 4, preds: 'ACF+6' }, // termina ≥ inicio(A) + 6: empieza en 2
      { id: 'FS', duracion: 1, preds: 'AFC-3' }, // adelanto: empieza en 7
    ]));
    expect(r.de('SS').inicioTemprano).toBe(2);
    expect(r.de('FF').inicioTemprano).toBe(7);
    expect(r.de('FF').finTemprano).toBe(11);
    expect(r.de('SF').inicioTemprano).toBe(2);
    expect(r.de('FS').inicioTemprano).toBe(7);
    expect(r.duracionProyecto).toBe(11);
    expect(r.de('FF').critica).toBe(true);
    expect(r.de('A').critica).toBe(true);
    expect(r.de('SS').holguraTotal).toBe(5);
  });

  it('holgura en rutas paralelas y convergencia', () => {
    const r = cpmOk(crono([
      { id: 'A', duracion: 3 },
      { id: 'B', duracion: 8, preds: 'A' },
      { id: 'C', duracion: 5, preds: 'A' },
      { id: 'D', duracion: 2, preds: 'B;C' },
    ]));
    expect(r.de('C').holguraTotal).toBe(3);
    expect(r.de('B').critica).toBe(true);
    expect(r.de('C').critica).toBe(false);
    expect(r.orden[0]).toBe('A');
  });

  it('hitos: se enseñan el día en que termina su predecesora', () => {
    const r = cpmOk(crono([{ id: 'A', duracion: 5 }, { id: 'H', duracion: 0, preds: 'A' }]));
    expect(r.de('H').fechaInicio).toBe(LUNES + 4);
    expect(r.de('H').fechaFin).toBe(LUNES + 4);
  });

  it('inicio no antes de', () => {
    const r = cpmOk(crono([{ id: 'A', duracion: 2 }, { id: 'B', duracion: 2, preds: 'A', inicioNoAntesDe: LUNES + 14 }]));
    expect(r.de('B').fechaInicio).toBe(LUNES + 14);
    expect(r.de('A').holguraTotal).toBe(8);
  });

  it('errores: predecesora inexistente, ID repetido, ciclo', () => {
    const inexistente = calcularCPM(crono([{ id: 'A', duracion: 1, preds: 'Z' }]));
    expect(inexistente.ok).toBe(false);
    expect(!inexistente.ok && inexistente.problemas[0]!.mensaje).toContain('«Z», que no existe');
    const repetido = calcularCPM(crono([{ id: 'A', duracion: 1 }, { id: 'A', duracion: 2 }]));
    expect(!repetido.ok && repetido.problemas[0]!.mensaje).toContain('repetido');
    const ciclo = calcularCPM(crono([{ id: 'A', duracion: 1, preds: 'C' }, { id: 'B', duracion: 1, preds: 'A' }, { id: 'C', duracion: 1, preds: 'B' }, { id: 'D', duracion: 1 }, { id: 'E', duracion: 1, preds: 'C' }]));
    expect(ciclo.ok).toBe(false);
    expect(!ciclo.ok && ciclo.problemas[0]!.mensaje).toMatch(/circular entre: A, B, C\. /); // E cuelga del ciclo, pero no está en él
  });
});

describe('lector de las hojas', () => {
  it('encuentra el encabezado por su nombre, en cualquier orden y fila', () => {
    const r = leerActividades([
      ['Mi proyecto'],
      [],
      ['Duración (días)', 'Actividad', 'ID', 'Predecesoras', 'Mínimo', 'Máximo', 'Costo por día'],
      [5, 'Excavar', 1, '', 4, 8, 1000],
      [3, 'Rellenar', 2, 1, '', '', ''],
      ['', '', '', '', '', '', ''],
      ['2d', 'Sin ID', '', '', '', '', ''],
    ]);
    expect(r.actividades).toHaveLength(2);
    expect(r.actividades[0]).toMatchObject({ id: '1', nombre: 'Excavar', duracion: 5, tresPuntos: { min: 4, masProbable: 5, max: 8 }, costoPorDia: 1000, fila: 4 });
    expect(r.actividades[1]!.predecesoras).toEqual([{ predecesora: '1', tipo: 'FS', retardo: 0 }]);
    expect(r.problemas).toEqual([expect.objectContaining({ gravedad: 'aviso', fila: 7 })]);
  });
  it('dice qué fila está mal', () => {
    const r = leerActividades([['ID', 'Duración', 'Mínimo', 'Más probable', 'Máximo'], [1, 'cinco', '', '', ''], [2, 5, 6, 5, 8]]);
    expect(r.problemas.map((p) => p.fila)).toEqual([2, 3]);
    expect(r.problemas[1]!.mensaje).toContain('mínimo ≤ más probable ≤ máximo');
  });
  it('sin encabezado', () => {
    expect(leerActividades([['a', 'b']]).problemas[0]!.mensaje).toContain('«ID» y «Duración»');
  });
  it('calendario: inicio, días y festivos', () => {
    const r = leerCalendario([
      ['Inicio del proyecto', LUNES],
      ['Sábado', 'Sí'],
      ['Lunes', 'No'],
      ['Festivos'],
      [LUNES + 3, 'Algo'],
      ['texto'],
    ]);
    expect(r.inicio).toBe(LUNES);
    expect(r.calendario.laborables).toEqual([false, false, true, true, true, true, true]);
    expect([...r.calendario.festivos]).toEqual([LUNES + 3]);
    expect(r.problemas).toHaveLength(1); // «texto» no es una fecha
  });
  it('sin hoja de calendario ni fecha de inicio', () => {
    expect(leerCronograma([['ID', 'Duración'], [1, 2]], undefined).cronograma).toBeUndefined();
    expect(leerCronograma(undefined, undefined).problemas[0]!.mensaje).toContain('Falta la hoja «Actividades»');
  });
});

describe('capacidades y moneda (P0)', () => {
  it('todo habilitado hasta que haya licencia', () => {
    expect(tieneCapacidad('cronograma')).toBe(true);
    fijarCapacidades(['costo']);
    expect(tieneCapacidad('cronograma')).toBe(false);
    fijarCapacidades(TODAS_LAS_CAPACIDADES);
  });
  it('formato de Excel por moneda, USD por defecto', () => {
    expect(moneda().codigo).toBe('USD');
    expect(formatoMoneda()).toBe('"US$" #,##0');
    expect(formatoMoneda('EUR')).toBe('#,##0 "€"');
    expect(formatoMoneda('xxx')).toBe('"US$" #,##0');
  });
});
