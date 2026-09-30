/** P3c: las vistas del cronograma (ventana Gantt y hoja «Cronograma (Gantt)»). */
import { describe, expect, it } from 'vitest';

import {
  calcularCPM, columnasTiempo, COLORES_GANTT, diaSemana, hojaGantt, leerCronograma, leerRiesgosPlazo, simularPlazo, vistaGantt,
  OPCIONES_PLAZO_POR_DEFECTO, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const cron = leerCronograma(leerHojaComoMatriz(LIBRO, 'Actividades'), leerHojaComoMatriz(LIBRO, 'Calendario')).cronograma as Cronograma;
const cpm = calcularCPM(cron);
if (!cpm.ok) throw new Error('cpm');

describe('columnas de la línea de tiempo', () => {
  it('elige la escala por la duración y empieza las semanas en lunes', () => {
    const d0 = serieDeFecha(2027, 2, 3); // miércoles
    expect(columnasTiempo(d0, d0 + 30).escala).toBe('dia');
    const s = columnasTiempo(d0, d0 + 200);
    expect(s.escala).toBe('semana');
    expect(diaSemana(s.inicios[0]!)).toBe(1);
    expect(s.inicios[0]).toBe(d0 - 2);
    const m = columnasTiempo(d0, d0 + 1000);
    expect(m.escala).toBe('mes');
    expect(m.inicios[0]).toBe(serieDeFecha(2027, 2, 1));
    expect(m.inicios[1]).toBe(serieDeFecha(2027, 3, 1));
  });
});

describe('vista y hoja del Gantt', () => {
  it('sin simular: barras, hitos, enlaces con su tipo y la marca del fin', () => {
    const v = vistaGantt(cron.actividades, cpm.filas, cpm.fechaFinProyecto);
    expect(v.barras).toHaveLength(20);
    expect(v.enlaces).toContainEqual({ de: '7', a: '10', tipo: 'SS', retardo: 10 });
    expect(v.enlaces).toContainEqual({ de: '19', a: '20', tipo: 'SF', retardo: 0 });
    expect(v.barras.find((b) => b.id === '8')!.predecesoras).toBe('3FC+5');
    expect(v.barras.find((b) => b.id === '19')!.hito).toBe(true);
    expect(v.simulado).toBe(false);

    const h = hojaGantt(v);
    expect(h.escala).toBe('semana');
    expect(h.valores[h.filaEncabezado]!.slice(0, 7)).toEqual(['ID', 'Actividad', 'Predecesoras', 'Inicio', 'Fin', 'Holgura', 'Crítica']);
    // 18 barras (dos hitos van como ◆, no como tramo), en rojo las críticas.
    expect(h.tramos).toHaveLength(18);
    const estructura = h.tramos.find((t) => t.fila === h.filaEncabezado + 7)!;
    expect(estructura.color).toBe(COLORES_GANTT.critica);
    expect(h.tramos.find((t) => t.fila === h.filaEncabezado + 8)!.color).toBe(COLORES_GANTT.normal); // el ascensor
    expect(h.hitos).toHaveLength(2);
    for (const x of h.hitos) expect(h.valores[x.fila]![x.col]).toBe('◆');
    expect(h.marcas).toEqual([expect.objectContaining({ texto: 'Fin del cronograma' })]);
    // La barra de la estructura cubre sus semanas: del 07/04/2027 (miércoles) al 18/05/2027 (martes).
    const cabecera = h.valores[h.filaEncabezado] as number[];
    expect(cabecera[estructura.col]).toBeLessThanOrEqual(serieDeFecha(2027, 4, 7));
    expect(cabecera[estructura.col + estructura.cols - 1]).toBeLessThanOrEqual(serieDeFecha(2027, 5, 18));
    expect(cabecera[estructura.col + estructura.cols]).toBeGreaterThan(serieDeFecha(2027, 5, 18));
  });

  it('tras simular: franjas P10–P90, criticidad y la marca del P80', async () => {
    const riesgos = leerRiesgosPlazo(leerHojaComoMatriz(LIBRO, 'Riesgos de plazo'), cron.actividades).riesgos;
    const sim = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2000 });
    const v = vistaGantt(cron.actividades, cpm.filas, cpm.fechaFinProyecto, sim);
    expect(v.simulado).toBe(true);
    expect(v.fechaP80).toBe(sim.fechas.p80);
    expect(v.hasta).toBeGreaterThanOrEqual(sim.fechas.p90);
    for (const b of v.barras) {
      expect(b.franja!.desde).toBeLessThanOrEqual(b.inicio);
      expect(b.franja!.hasta).toBeGreaterThanOrEqual(b.fin);
      expect(b.criticidad).toBeGreaterThanOrEqual(0);
    }
    const h = hojaGantt(v);
    expect(h.valores[h.filaEncabezado]![6]).toBe('Crítica en');
    expect(h.tramos).toHaveLength(18 + 20); // barras + franjas
    expect(h.marcas.map((m) => m.texto)).toEqual(['Fin del cronograma', 'P80']);
  });
});
