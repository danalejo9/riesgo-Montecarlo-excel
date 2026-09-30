/**
 * El libro de pruebas del cronograma (`ejemplos/demo-cronograma.xlsx`,
 * generado por `ejemplos/generar-cronograma.py`): el motor debe dar las
 * mismas fechas, holguras y actividades críticas que la hoja «Esperado»,
 * que calculó el script con su propio CPM.
 */
import { describe, expect, it } from 'vitest';

import { calcularCPM, ENCABEZADO_RESULTADO, hojaResultadoCPM, leerCronograma, plantillaActividades, plantillaCalendario, leerActividades, leerCalendario } from '../../engine/cronograma/index.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';

describe('libro de pruebas del cronograma', () => {
  const lectura = leerCronograma(leerHojaComoMatriz(LIBRO, 'Actividades'), leerHojaComoMatriz(LIBRO, 'Calendario'));
  const esperado = leerHojaComoMatriz(LIBRO, 'Esperado') as unknown[][];

  it('se lee sin problemas', () => {
    expect(lectura.problemas).toEqual([]);
    expect(lectura.cronograma?.actividades).toHaveLength(20);
    expect(lectura.cronograma?.calendario.festivos.size).toBe(5);
  });

  it('el CPM coincide con «Esperado», actividad por actividad', () => {
    const r = calcularCPM(lectura.cronograma!);
    if (!r.ok) throw new Error(r.problemas[0]!.mensaje);
    expect(r.fechaFinProyecto).toBe(esperado[1]![1]);
    expect(r.duracionProyecto).toBe(esperado[2]![1]);
    const filas = esperado.slice(5).filter((f) => f[0] !== '');
    expect(filas).toHaveLength(20);
    for (const [id, , duracion, inicio, fin, inicioT, finT, holgura, critica] of filas) {
      const f = r.filas.find((x) => x.id === id)!;
      expect({ id, duracion: f.duracion, inicio: f.fechaInicio, fin: f.fechaFin, inicioT: f.fechaInicioTardio, finT: f.fechaFinTardio, holgura: f.holguraTotal, critica: f.critica })
        .toEqual({ id, duracion, inicio, fin, inicioT, finT, holgura, critica: critica === 'Sí' });
    }
  });

  it('la hoja de resultado tiene las mismas columnas y valores que «Esperado»', () => {
    const r = calcularCPM(lectura.cronograma!);
    if (!r.ok) throw new Error('CPM');
    const h = hojaResultadoCPM(r);
    expect(h.valores[h.filaEncabezado]).toEqual(ENCABEZADO_RESULTADO);
    expect(esperado[4]).toEqual(ENCABEZADO_RESULTADO);
    expect(h.valores.slice(h.primeraFilaDatos)).toEqual(esperado.slice(5).filter((f) => f[0] !== ''));
  });

  it('la plantilla vacía se lee sin errores y da un cronograma calculable', () => {
    const a = leerActividades(plantillaActividades().valores);
    const c = leerCalendario(plantillaCalendario(46000).valores);
    expect([...a.problemas, ...c.problemas]).toEqual([]);
    const r = calcularCPM({ inicio: c.inicio!, calendario: c.calendario, actividades: a.actividades });
    expect(r.ok && r.duracionProyecto).toBe(40);
  });
});
