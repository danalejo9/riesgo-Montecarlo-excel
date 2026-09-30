/**
 * V7: calendarios por actividad. El reloj de cada calendario, el CPM y la
 * simulación con varios calendarios contra el oráculo Python
 * («Calendarios (prueba)» → «Esperado (calendarios)»), y la garantía de que,
 * con calendarios iguales, el camino de los relojes da lo mismo que el de
 * siempre.
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, Reloj, calcularCPM, hojaActividadesDe, hojaCalendarios, hojaResultadoCPM, leerActividades, leerCalendarios, leerCronograma,
  leerRiesgosPlazo, narrativaPlazo, simularPlazo, simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { readFileSync } from 'node:fs';

import { importarCronograma } from '../../engine/cronograma/importar/index.ts';
import { crearHilosPlazoNode } from '../helpers/hilosPlazoNode.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];

/** Lo que pide la guía: la tabla de «Calendarios (prueba)» como hoja «Calendarios» y la columna «Calendario» rellena. */
function libroConCalendarios(): { actividades: unknown[][]; calendarios: unknown[][] } {
  const prueba = hoja('Calendarios (prueba)');
  const calendarios = [[''], [''], ...prueba.slice(2, 6)];
  const actividades = hoja('Actividades').map((f) => [...f]);
  const col = (actividades[2] as string[]).indexOf('Calendario');
  for (const f of prueba.slice(9).filter((x) => x[0] !== '' && x[0] !== undefined)) {
    (actividades.find((g, i) => i > 2 && String(g[0]) === String(f[0])) as unknown[])[col] = f[1];
  }
  return { actividades, calendarios };
}

const { actividades, calendarios } = libroConCalendarios();
const lectura = leerCronograma(actividades, hoja('Calendario'), calendarios);
const cron = lectura.cronograma as Cronograma;

describe('reloj de un calendario (V7)', () => {
  // Lunes 01/02/2027 = día 0; lunes a viernes.
  const r = new Reloj(CALENDARIO_ESTANDAR, 46_419);
  it('cuenta, avanza y alinea en días laborables', () => {
    expect(r.W(5)).toBe(5); // lunes a viernes
    expect(r.W(6.5)).toBe(5); // sábado a mediodía: no suma
    expect(r.W(7.5)).toBe(5.5); // lunes siguiente a mediodía
    expect(r.avanzar(0, 5)).toBe(5); // una semana: termina el viernes (fin = 5)
    expect(r.avanzar(0, 6)).toBe(8); // seis días: el lunes siguiente (fin = 8)
    expect(r.alinearInicio(5)).toBe(7); // tras el viernes, el lunes
    expect(r.alinearFin(7)).toBe(5); // el lunes a primera hora = el viernes al final
    expect(r.avanzar(7, -1)).toBe(4); // un día antes del lunes: el viernes
    expect(r.inicioParaFin(12, 5)).toBe(7); // termina el viernes 2: empezó el lunes
  });
});

describe('leer los calendarios (V7)', () => {
  it('el escenario de prueba: tres calendarios, sin errores', () => {
    expect(lectura.problemas.filter((p) => p.gravedad === 'error')).toEqual([]);
    expect(Object.keys(cron.calendarios!)).toEqual(['6 días', 'Continuo', 'Proveedor']);
    expect(cron.calendarios!['6 días']!.laborables).toEqual([false, true, true, true, true, true, true]);
    expect(cron.calendarios!['Continuo']!.festivos.size).toBe(0);
    expect(cron.calendarios!['6 días']!.festivos).toEqual(cron.calendario.festivos);
    expect([...cron.calendarios!['Proveedor']!.festivos]).toEqual([46_538, 46_573]);
    expect(cron.actividades.find((a) => a.id === '7')!.calendario).toBe('6 días');
  });

  it('errores: calendario que no existe, día sin Sí/No, festivo mal escrito, nombre repetido', () => {
    const a = actividades.map((f) => [...f]);
    const col = (a[2] as string[]).indexOf('Calendario');
    (a[5] as unknown[])[col] = 'Nocturno';
    expect(leerCronograma(a, hoja('Calendario'), calendarios).problemas.map((p) => p.mensaje).join()).toContain('el calendario «Nocturno» no está en la hoja «Calendarios»');
    const c = leerCalendarios([
      ['Calendario', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Festivos del proyecto', 'Festivos propios'],
      ['A', 'Sí', 'quizá', 'Sí', 'Sí', 'Sí', 'No', 'No', '', ''],
      ['B', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'No', 'No', '', '31/02/2027'],
      ['C', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'No', 'No', 'No', '01/06/2027; 2/6/2027'],
      ['c', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'No', 'No', '', ''],
    ], CALENDARIO_ESTANDAR);
    expect(Object.keys(c.calendarios)).toEqual(['C']);
    expect([...c.calendarios['C']!.festivos]).toEqual([46_539, 46_540]);
    expect(c.problemas.map((p) => p.mensaje)).toEqual([
      expect.stringContaining('«quizá»'), expect.stringContaining('31/02/2027'), expect.stringContaining('repetido'),
    ]);
    // «Proyecto» (o vacío) es el calendario del proyecto.
    const b = actividades.map((f) => [...f]);
    (b[5] as unknown[])[col] = 'Proyecto';
    expect(leerCronograma(b, hoja('Calendario'), calendarios).cronograma!.actividades[2]!.calendario).toBeUndefined();
  });

  it('las hojas «Calendarios» y «Actividades» escritas por el complemento se vuelven a leer igual', () => {
    const h = hojaCalendarios(cron.calendarios, cron.calendario);
    const vuelta = leerCalendarios(h.valores, cron.calendario);
    expect(vuelta.problemas).toEqual([]);
    expect(vuelta.calendarios).toEqual(cron.calendarios);
    const acts = leerActividades(hojaActividadesDe(cron, 'x').valores);
    expect(acts.actividades.map((a) => a.calendario)).toEqual(cron.actividades.map((a) => a.calendario));
  });
});

describe('CPM con calendarios (V7)', () => {
  const r = calcularCPM(cron);
  if (!r.ok) throw new Error('cpm');
  const esperado = hoja('Esperado (calendarios)');

  it('coincide con «Esperado (calendarios)» fila a fila (fechas, holgura, crítica)', () => {
    expect(r.unidad).toBe('naturales');
    expect(r.fechaFinProyecto).toBe(esperado[1]![1]);
    expect(r.duracionProyecto).toBeCloseTo(esperado[2]![1] as number, 9);
    const h = hojaResultadoCPM(r);
    const filas = h.valores.slice(h.primeraFilaDatos).map((f) => [...f.slice(0, 7), Math.round((f[7] as number) * 1e6) / 1e6, f[8]]);
    expect(filas).toEqual(esperado.slice(5).filter((f) => f[0] !== '').map((f) => [...f.slice(0, 7), Math.round((f[7] as number) * 1e6) / 1e6, f[8]]));
  });

  it('el calendario sí cambia el resultado: la estructura en 6 días termina antes que en 5', () => {
    const base = calcularCPM(leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma!);
    if (!base.ok) throw new Error('cpm');
    const f = (x: typeof r, id: string) => x.filas.find((y) => y.id === id)!.fechaFin;
    expect(f(r, '7')).toBeLessThan(f(base, '7'));
  });

  it('con calendarios iguales al del proyecto, los relojes dan las mismas fechas que el CPM de siempre', () => {
    const base = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma!;
    const a = calcularCPM(base);
    const b = calcularCPM(base, { forzarRelojes: true });
    if (!a.ok || !b.ok) throw new Error('cpm');
    expect(b.filas.map((x) => [x.fechaInicio, x.fechaFin, x.fechaInicioTardio, x.fechaFinTardio, x.critica]))
      .toEqual(a.filas.map((x) => [x.fechaInicio, x.fechaFin, x.fechaInicioTardio, x.fechaFinTardio, x.critica]));
  });
});

describe('simulación con calendarios (V7)', () => {
  const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos;
  const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 20_000 };

  it('coincide con el Monte Carlo en Python (±1 día, ±3 puntos de criticidad, ±1 % de costo, ±3 de JCL)', async () => {
    const r = await simularPlazo(cron, riesgos, op);
    const e = hoja('Esperado (calendarios)');
    expect(r.unidad).toBe('naturales');
    const fecha = (i: number) => e[5 + i]![12] as number;
    for (const [i, v] of [r.fechas.p10, r.fechas.p50, r.fechas.p80, r.fechas.p90].entries()) expect(Math.abs(v - fecha(i))).toBeLessThanOrEqual(1);
    const costo = (i: number) => e[5 + i]![13] as number;
    for (const [i, v] of [r.costos!.p10, r.costos!.p50, r.costos!.p80, r.costos!.p90].entries()) expect(Math.abs(v / costo(i) - 1)).toBeLessThan(0.01);
    expect(Math.abs(r.costos!.jclP80 - (e[9]![12] as number))).toBeLessThan(0.03);
    const crit = new Map(e.slice(12).filter((f) => f[11] !== '' && f[11] !== undefined).map((f) => [String(f[11]), f[12] as number]));
    for (const a of r.actividades) expect(Math.abs(a.criticidad - crit.get(a.id)!), a.id).toBeLessThanOrEqual(0.03);
    expect(narrativaPlazo(r)[0]).toContain('días naturales');
  });

  it('en varios hilos, lo mismo', async () => {
    const hilos = crearHilosPlazoNode(2);
    try {
      const o = { ...op, iteraciones: 5_000 };
      const par = await simularPlazoEnParalelo(cron, riesgos, o, hilos.para(cron, riesgos, o), hilos.hilos);
      const uno = await simularPlazo(cron, riesgos, o);
      expect(Array.from(par.finProyecto)).toEqual(Array.from(uno.finProyecto));
      expect(par.fechas).toEqual(uno.fechas);
    } finally {
      hilos.cerrar();
    }
  }, 30_000);

  it('con calendarios iguales al del proyecto, las mismas fechas iteración a iteración', async () => {
    const base = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma!;
    // Un calendario igual salvo un festivo en 2040: fuerza el camino de los relojes.
    const gemelo: Cronograma = {
      ...base, calendarios: { X: { ...base.calendario, festivos: new Set([...base.calendario.festivos, 51_500]) } },
      actividades: base.actividades.map((a) => ({ ...a, calendario: 'X' })),
    };
    const rs = leerRiesgosPlazo(hoja('Riesgos de plazo'), base.actividades).riesgos;
    const o = { ...op, iteraciones: 3_000 };
    const a = await simularPlazo(base, rs, o);
    const b = await simularPlazo(gemelo, rs, o);
    expect(b.unidad).toBe('naturales');
    expect(b.fechas).toEqual(a.fechas);
    expect(b.actividades.map((x) => [x.criticidad, x.inicio, x.fin])).toEqual(a.actividades.map((x) => [x.criticidad, x.inicio, x.fin]));
    expect(b.costos!.p80).toBeCloseTo(a.costos!.p80, 6);
  });
});

describe('importar calendarios por tarea (V7)', () => {
  const seisDias = [false, true, true, true, true, true, true];

  it('MS Project: el <CalendarUID> de cada tarea, con su calendario por nombre', () => {
    let xml = readFileSync('ejemplos/demo-cronograma.xml', 'utf8');
    const cal6 = '<Calendar><UID>2</UID><Name>6 días</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>'
      + [1, 2, 3, 4, 5, 6, 7].map((d) => `<WeekDay><DayType>${d}</DayType><DayWorking>${d === 1 ? 0 : 1}</DayWorking></WeekDay>`).join('')
      + '</WeekDays></Calendar>';
    xml = xml.replace('</Calendars>', `${cal6}</Calendars>`).replace(/(<Task>(?:(?!<\/Task>)[\s\S])*?<ID>7<\/ID>)/, '$1<CalendarUID>2</CalendarUID>');
    const imp = importarCronograma('p.xml', new TextEncoder().encode(xml));
    expect(imp.cronograma.calendarios).toEqual({ '6 días': { laborables: seisDias, festivos: new Set() } });
    expect(imp.cronograma.actividades.filter((a) => a.calendario).map((a) => [a.id, a.calendario])).toEqual([['7', '6 días']]);
    expect(imp.avisos.join()).not.toContain('calendarios base');
  });

  it('Primavera P6: el clndr_id de cada actividad', () => {
    let xer = readFileSync('ejemplos/demo-cronograma.xer', 'latin1');
    const dia = (d: number) => (d === 1 ? '(0||1()())' : `(0||${d}()((0||0(s|08:00|f|16:00)())))`);
    const datos = `(0||CalendarData()((0||DaysOfWeek()(${[1, 2, 3, 4, 5, 6, 7].map(dia).join('')}))(0||Exceptions()()))`;
    xer = xer.replace('%T\tPROJECT', `%R\t2\tN\t6 días\t8\t${datos}\r\n%T\tPROJECT`)
      .replace(/(%R\t\d+\t100\t\d+\t)1(\tA70\t)/, '$12$2');
    const imp = importarCronograma('p.xer', Uint8Array.from([...xer].map((c) => c.charCodeAt(0) & 0xff)));
    expect(imp.cronograma.calendarios?.['6 días']?.laborables).toEqual(seisDias);
    expect(imp.cronograma.actividades.filter((a) => a.calendario).map((a) => [a.id, a.calendario])).toEqual([['A70', '6 días']]);
    // Y se calcula con él: la estructura termina antes que con el calendario del proyecto.
    const con = calcularCPM(imp.cronograma);
    const sin = calcularCPM({ ...imp.cronograma, calendarios: {} });
    if (!con.ok || !sin.ok) throw new Error('cpm');
    expect(con.filas.find((f) => f.id === 'A70')!.fechaFin).toBeLessThan(sin.filas.find((f) => f.id === 'A70')!.fechaFin);
  });
});
