/**
 * El libro de pruebas del cronograma (`ejemplos/demo-cronograma.xlsx`,
 * generado por `ejemplos/generar-cronograma.py`): el motor debe dar las
 * mismas fechas, holguras y actividades críticas que la hoja «Esperado»,
 * que calculó el script con su propio CPM.
 */
import { describe, expect, it } from 'vitest';

import { calcularCPM, ENCABEZADO_RESULTADO, hojaResultadoCPM, leerCronograma, plantillaActividades, plantillaCalendario, leerActividades, leerCalendario, leerRiesgosPlazo, simularPlazo, OPCIONES_PLAZO_POR_DEFECTO } from '../../engine/cronograma/index.ts';
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

describe('escenario con avance y restricciones (resto de P1)', () => {
  // Las filas de «Avance (prueba)» se copian en sus columnas de «Actividades», y la fecha de corte en Calendario!B2.
  const actividades = leerHojaComoMatriz(LIBRO, 'Actividades') as unknown[][];
  const calendario = leerHojaComoMatriz(LIBRO, 'Calendario') as unknown[][];
  const avance = leerHojaComoMatriz(LIBRO, 'Avance (prueba)') as unknown[][];
  const encAct = actividades[2] as string[];
  const encAv = avance[3] as string[];
  for (const fila of avance.slice(4).filter((f) => f[0] !== '')) {
    const destino = actividades.find((f) => f[0] === fila[0]) as unknown[];
    encAv.slice(1).forEach((nombre, j) => {
      if (fila[j + 1] !== '') destino[encAct.indexOf(nombre)] = fila[j + 1];
    });
  }
  (calendario[1] as unknown[])[1] = (avance[1] as unknown[])[1];
  const esperado = leerHojaComoMatriz(LIBRO, 'Esperado (con avance)') as unknown[][];

  it('coincide con «Esperado (con avance)»: terminadas, en curso, pendientes, fecha límite y «terminar no antes de»', () => {
    const lectura = leerCronograma(actividades, calendario);
    expect(lectura.problemas).toEqual([]);
    const r = calcularCPM(lectura.cronograma!);
    if (!r.ok) throw new Error(r.problemas[0]!.mensaje);
    expect(r.fechaFinProyecto).toBe(esperado[1]![1]);
    expect(r.duracionProyecto).toBe(esperado[2]![1]);
    const h = hojaResultadoCPM(r);
    expect(h.valores.slice(h.primeraFilaDatos)).toEqual(esperado.slice(5).filter((f) => f[0] !== ''));
    // La fecha límite de la fachada no se cumple: holgura negativa, y la salud lo pone en rojo.
    expect(r.filas.find((f) => f.id === '15')!.holguraTotal).toBeLessThan(0);
  });

  it('avance sin fecha de corte, o con fechas reales después del corte, es un error', () => {
    const sinCorte = calendario.map((f, i) => (i === 1 ? [f[0], ''] : f));
    expect(leerCronograma(actividades, sinCorte).problemas.map((p) => p.mensaje).join()).toContain('falta la «Fecha de corte»');
    const tarde = calendario.map((f, i) => (i === 1 ? [f[0], (avance[1] as number[])[1]! - 30] : f));
    expect(leerCronograma(actividades, tarde).problemas.some((p) => p.mensaje.includes('posterior a la fecha de corte'))).toBe(true);
  });

  it('la simulación respeta el avance: lo terminado no se mueve', async () => {
    const cron = leerCronograma(actividades, calendario).cronograma!;
    const riesgos = leerRiesgosPlazo(leerHojaComoMatriz(LIBRO, 'Riesgos de plazo'), cron.actividades).riesgos;
    const s = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 3000 });
    const r = calcularCPM(cron);
    if (!r.ok) throw new Error('cpm');
    for (const id of ['2', '3', '4']) {
      const a = s.actividades.find((x) => x.id === id)!;
      const f = r.filas.find((x) => x.id === id)!;
      expect(a.fin.p10).toBe(f.fechaFin);
      expect(a.fin.p90).toBe(f.fechaFin);
      expect(a.criticidad).toBe(0);
    }
    expect(s.determinista.dias).toBe(r.duracionProyecto);
    // La excavación, en curso: nunca empieza en otra fecha que su inicio real.
    const exc = s.actividades.find((x) => x.id === '5')!;
    expect(exc.inicio.p10).toBe(exc.inicio.p90);
  });
});
