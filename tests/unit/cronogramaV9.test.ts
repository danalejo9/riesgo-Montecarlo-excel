/**
 * V9: devolver el cronograma y los resultados a MS Project (XML) y a
 * Primavera P6 (XER). Se prueba de ida y vuelta: lo exportado, leído con los
 * importadores del complemento, es el mismo cronograma (mismo CPM, mismas
 * fechas que el archivo dice), y los campos personalizados traen el P50, el
 * P80 y la criticidad de la simulación.
 */
import { describe, expect, it } from 'vitest';

import {
  aWindows1252, calcularCPM, exportarMspdi, exportarXer, leerCronograma, leerRiesgosPlazo, simularPlazo, OPCIONES_PLAZO_POR_DEFECTO,
  CAMPOS_MSP, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { importarCronograma, verificarContraFuente } from '../../engine/cronograma/importar/index.ts';
import { tablasXer } from '../../engine/cronograma/importar/xer.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];
const base = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma as Cronograma;

function conAvance(): Cronograma {
  const actividades = hoja('Actividades').map((f) => [...f]);
  const calendario = hoja('Calendario').map((f) => [...f]);
  const av = hoja('Avance (prueba)');
  const encAct = actividades[2] as string[];
  const encAv = av[3] as string[];
  for (const fila of av.slice(4).filter((f) => f[0] !== '')) {
    const d = actividades.find((f) => f[0] === fila[0]) as unknown[];
    encAv.slice(1).forEach((n, j) => { if (fila[j + 1] !== '') d[encAct.indexOf(n)] = fila[j + 1]; });
  }
  (calendario[1] as unknown[])[1] = av[1]![1];
  return leerCronograma(actividades, calendario).cronograma as Cronograma;
}

function conCalendarios(): Cronograma {
  const prueba = hoja('Calendarios (prueba)');
  const actividades = hoja('Actividades').map((f) => [...f]);
  const col = (actividades[2] as string[]).indexOf('Calendario');
  for (const f of prueba.slice(9).filter((x) => x[0] !== '' && x[0] !== undefined)) (actividades.find((g, i) => i > 2 && String(g[0]) === String(f[0])) as unknown[])[col] = f[1];
  return leerCronograma(actividades, hoja('Calendario'), [[''], [''], ...prueba.slice(2, 6)]).cronograma as Cronograma;
}

const cpm = (c: Cronograma) => {
  const r = calcularCPM(c);
  if (!r.ok) throw new Error(r.problemas[0]!.mensaje);
  return r;
};
const fechas = (c: Cronograma) => cpm(c).filas.map((f) => [f.id, f.fechaInicio, f.fechaFin, f.critica]);
const exportar = (formato: 'xml' | 'xer', c: Cronograma, simulacion?: Awaited<ReturnType<typeof simularPlazo>>) => {
  const e = (formato === 'xml' ? exportarMspdi : exportarXer)({ cronograma: c, filas: cpm(c).filas, proyecto: 'Centro comunitario', ...(simulacion ? { simulacion } : {}) });
  const bytes = formato === 'xer' ? aWindows1252(e.texto) : new TextEncoder().encode(e.texto);
  return { e, imp: importarCronograma(`x.${formato}`, bytes) };
};
const mismasActividades = (a: Cronograma, b: Cronograma, ids: (id: string) => string = (x) => x) => {
  const campos = (x: Cronograma['actividades'][number]) => ({
    nombre: x.nombre, duracion: x.duracion, categoria: x.categoria, calendario: x.calendario,
    predecesoras: x.predecesoras.map((p) => ({ ...p, predecesora: ids(p.predecesora) })),
    inicioNoAntesDe: x.inicioNoAntesDe, inicioNoDespuesDe: x.inicioNoDespuesDe, terminarNoAntesDe: x.terminarNoAntesDe, terminarNoDespuesDe: x.terminarNoDespuesDe,
    inicioReal: x.inicioReal, finReal: x.finReal,
  });
  expect(b.actividades.map(campos)).toEqual(a.actividades.map(campos));
};

describe('exportar a MS Project y a P6 (V9)', () => {
  for (const formato of ['xml', 'xer'] as const) {
    it(`${formato}: ida y vuelta del libro de pruebas — mismo cronograma, mismas fechas, verificación 100 %`, () => {
      const { imp, e } = exportar(formato, base);
      expect(e.avisos).toEqual([]);
      expect(imp.cronograma.inicio).toBe(base.inicio);
      expect(imp.cronograma.calendario.laborables).toEqual(base.calendario.laborables);
      expect([...imp.cronograma.calendario.festivos].sort()).toEqual([...base.calendario.festivos].sort());
      if (formato === 'xml') mismasActividades(base, imp.cronograma);
      else mismasActividades({ ...base, actividades: base.actividades.map((a) => ({ ...a })) }, imp.cronograma);
      expect(fechas(imp.cronograma)).toEqual(fechas(base));
      const v = verificarContraFuente(imp);
      expect(v.coinciden).toBe(v.total);
    });

    it(`${formato}: con calendarios por actividad (V7)`, () => {
      const c = conCalendarios();
      const { imp } = exportar(formato, c);
      // Mismo contenido (el importador los crea en el orden en que las tareas los usan).
      const ordenados = (x: Cronograma) => Object.entries(x.calendarios!).sort(([a], [b]) => a.localeCompare(b)).map(([n, k]) => [n, k.laborables, [...k.festivos].sort()]);
      expect(ordenados(imp.cronograma)).toEqual(ordenados(c));
      expect(imp.cronograma.actividades.map((a) => a.calendario)).toEqual(c.actividades.map((a) => a.calendario));
      expect(fechas(imp.cronograma)).toEqual(fechas(c));
    });
  }

  it('xer: con avance y dos restricciones (principal y secundaria), exacto', () => {
    const c = conAvance();
    const { imp } = exportar('xer', c);
    expect(imp.cronograma.fechaCorte).toBe(c.fechaCorte);
    mismasActividades(c, imp.cronograma);
    expect(fechas(imp.cronograma)).toEqual(fechas(c));
  });

  it('xml: con avance; MS Project admite una restricción más la fecha límite, y lo avisa', () => {
    const c = conAvance();
    const { imp, e } = exportar('xml', c);
    expect(e.avisos.join()).toContain('dos restricciones');
    expect(imp.cronograma.fechaCorte).toBe(c.fechaCorte);
    const x = (cr: Cronograma) => cr.actividades.map((a) => [a.id, a.inicioReal, a.finReal, a.restante ?? a.duracion * (1 - (a.completado ?? 0))]);
    expect(x(imp.cronograma)).toEqual(x(c));
    // La fecha límite de la fachada viaja como <Deadline>.
    expect(imp.cronograma.actividades.find((a) => a.id === '15')!.terminarNoDespuesDe).toBe(c.actividades.find((a) => a.id === '15')!.terminarNoDespuesDe);
  });

  it('los resultados de la simulación van en campos personalizados (Fecha1, Fecha2, Número1 / campos de usuario de P6)', async () => {
    const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), base.actividades).riesgos;
    const r = await simularPlazo(base, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2000 });
    const iso = (s: number) => new Date(Date.UTC(1899, 11, 30) + s * 86_400_000).toISOString().slice(0, 10);
    const a7 = r.actividades.find((a) => a.id === '7')!;

    const xml = exportar('xml', base, r).e.texto;
    expect(xml).toContain(`<FieldID>${CAMPOS_MSP.Date2}</FieldID><FieldName>Date2</FieldName><Alias>Fin P80 (QSRA)</Alias>`);
    const tarea7 = /<Task><UID>7<\/UID>[\s\S]*?<\/Task>/.exec(xml)![0];
    expect(tarea7).toContain(`<FieldID>${CAMPOS_MSP.Date1}</FieldID><Value>${iso(a7.fin.p50)}T17:00:00</Value>`);
    expect(tarea7).toContain(`<FieldID>${CAMPOS_MSP.Date2}</FieldID><Value>${iso(a7.fin.p80)}T17:00:00</Value>`);
    expect(tarea7).toContain(`<FieldID>${CAMPOS_MSP.Number1}</FieldID><Value>${Math.round(a7.criticidad * 1000) / 10}</Value>`);

    const t = tablasXer(exportar('xer', base, r).e.texto);
    expect(t.get('UDFTYPE')!.map((u) => u.udf_type_label)).toEqual(['Fin P50 (QSRA)', 'Fin P80 (QSRA)', 'Criticidad % (QSRA)']);
    const id7 = t.get('TASK')!.find((x) => x.task_code === '7')!.task_id;
    const v = t.get('UDFVALUE')!.filter((x) => x.fk_id === id7);
    expect(v.map((x) => x.udf_date || x.udf_number)).toEqual([`${iso(a7.fin.p50)} 17:00`, `${iso(a7.fin.p80)} 17:00`, String(Math.round(a7.criticidad * 1000) / 10)]);
  });

  it('IDs que no son números: MS Project numera y guarda el ID en Texto2', () => {
    const c: Cronograma = { ...base, actividades: base.actividades.map((a) => ({ ...a, id: `A${a.id}`, predecesoras: a.predecesoras.map((p) => ({ ...p, predecesora: `A${p.predecesora}` })) })) };
    const { e, imp } = exportar('xml', c);
    expect(e.avisos[0]).toContain('Texto2');
    expect(e.texto).toContain(`<FieldID>${CAMPOS_MSP.Text2}</FieldID><Value>A7</Value>`);
    expect(fechas(imp.cronograma).map((f) => f.slice(1))).toEqual(fechas(c).map((f) => f.slice(1)));
  });

  it('Windows-1252 para el XER', () => {
    expect(Array.from(aWindows1252('ñ€a中'))).toEqual([0xf1, 0x80, 0x61, 0x3f]);
  });
});
