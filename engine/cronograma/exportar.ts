/**
 * Devolver el cronograma y los resultados a MS Project y a Primavera P6
 * (V9). Se escribe el proyecto entero (actividades, relaciones, calendarios,
 * avance y restricciones, con las fechas del CPM) y, si hay simulación, en
 * campos personalizados de cada actividad:
 *
 * | | MS Project (XML) | P6 (XER, campos de usuario) |
 * |---|---|---|
 * | Fin P50 | Fecha1 (Date1) | «Fin P50 (QSRA)» |
 * | Fin P80 | Fecha2 (Date2) | «Fin P80 (QSRA)» |
 * | Criticidad (%) | Número1 (Number1) | «Criticidad % (QSRA)» |
 *
 * El planificador abre el archivo (o lo combina con su proyecto) y ve el
 * riesgo en su herramienta. Los importadores de `importar/` leen estos
 * archivos: así se prueba que lo exportado dice lo mismo que el libro.
 */

import type { FilaCPM } from './cpm.ts';
import type { ResultadoSimulacionPlazo } from './simulacion.ts';
import type { Actividad, Calendario, Cronograma, TipoRelacion } from './tipos.ts';

const EPOCA = Date.UTC(1899, 11, 30);
const HORAS_DIA = 8;

/** Número de serie → «2027-02-01». */
function isoDia(serie: number): string {
  return new Date(EPOCA + Math.floor(serie) * 86_400_000).toISOString().slice(0, 10);
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface Exportado {
  texto: string;
  nombreArchivo: string;
  /** Lo que el formato no admite tal cual, dicho con palabras. */
  avisos: string[];
}

interface Resultados {
  finP50: number;
  finP80: number;
  criticidad: number;
}

function resultadosPorId(r?: ResultadoSimulacionPlazo): Map<string, Resultados> {
  const m = new Map<string, Resultados>();
  for (const a of r?.actividades ?? []) m.set(a.id, { finP50: a.fin.p50, finP80: a.fin.p80, criticidad: a.criticidad });
  return m;
}

/** Nombre de archivo seguro a partir del nombre del proyecto. */
function nombreDe(proyecto: string, extension: string): string {
  const base = proyecto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'cronograma';
  return `${base}-riesgo.${extension}`;
}

/** Las restricciones de una actividad, como una principal y (P6) una secundaria. */
function restricciones(a: Actividad): Array<{ tipo: 'INA' | 'INDD' | 'TNAD' | 'TNDD' | 'MSO' | 'MEO'; fecha: number }> {
  const out: Array<{ tipo: 'INA' | 'INDD' | 'TNAD' | 'TNDD' | 'MSO' | 'MEO'; fecha: number }> = [];
  const ina = a.inicioNoAntesDe;
  const indd = a.inicioNoDespuesDe;
  const tnad = a.terminarNoAntesDe;
  const tndd = a.terminarNoDespuesDe;
  if (ina !== undefined && ina === indd) out.push({ tipo: 'MSO', fecha: ina });
  else {
    if (ina !== undefined) out.push({ tipo: 'INA', fecha: ina });
    if (indd !== undefined) out.push({ tipo: 'INDD', fecha: indd });
  }
  if (tnad !== undefined && tnad === tndd) out.push({ tipo: 'MEO', fecha: tnad });
  else {
    if (tnad !== undefined) out.push({ tipo: 'TNAD', fecha: tnad });
    if (tndd !== undefined) out.push({ tipo: 'TNDD', fecha: tndd });
  }
  return out;
}

// ---------------------------------------------------------------------------
// MS Project (MSPDI)
// ---------------------------------------------------------------------------

/** Identificadores de campo de MS Project (los mismos en todas las versiones). */
export const CAMPOS_MSP = { Text1: '188743731', Text2: '188743734', Number1: '188743767', Date1: '188743945', Date2: '188743946' } as const;
const TIPO_MSP: Record<TipoRelacion, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };
const RESTRICCION_MSP = { MSO: 2, MEO: 3, INA: 4, INDD: 5, TNAD: 6, TNDD: 7 } as const;

function calendarioMsp(uid: number, nombre: string, c: Calendario): string {
  const dias = [0, 1, 2, 3, 4, 5, 6].map((d) => `<WeekDay><DayType>${d + 1}</DayType><DayWorking>${c.laborables[d] ? 1 : 0}</DayWorking>${
    c.laborables[d] ? '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>' : ''
  }</WeekDay>`).join('');
  const excepciones = [...c.festivos].sort((a, b) => a - b).map((f) =>
    `<Exception><TimePeriod><FromDate>${isoDia(f)}T00:00:00</FromDate><ToDate>${isoDia(f)}T23:59:00</ToDate></TimePeriod><Name>No laborable</Name><DayWorking>0</DayWorking></Exception>`).join('');
  return `<Calendar><UID>${uid}</UID><Name>${escapar(nombre)}</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${dias}</WeekDays>${excepciones ? `<Exceptions>${excepciones}</Exceptions>` : ''}</Calendar>`;
}

export function exportarMspdi(e: { cronograma: Cronograma; filas: readonly FilaCPM[]; simulacion?: ResultadoSimulacionPlazo; proyecto: string }): Exportado {
  const c = e.cronograma;
  const avisos: string[] = [];
  const res = resultadosPorId(e.simulacion);
  const fila = new Map(e.filas.map((f) => [f.id, f]));
  // El ID de MS Project es un número correlativo: si los del libro no lo son, se numeran y el original va a Texto2.
  const numericos = c.actividades.every((a, i, l) => /^\d+$/.test(a.id) && Number(a.id) > 0 && l.findIndex((b) => b.id === a.id) === i);
  const uid = new Map(c.actividades.map((a, i) => [a.id, numericos ? Number(a.id) : i + 1]));
  if (!numericos) avisos.push('Los ID del libro no son números: en MS Project se numeran 1, 2, 3… y el ID del libro va en «Texto2».');
  const nombresCal = Object.keys(c.calendarios ?? {});
  const uidCal = new Map(nombresCal.map((n, i) => [n, i + 2]));

  const campos: Array<[keyof typeof CAMPOS_MSP, string]> = [['Text1', 'Categoría']];
  if (!numericos) campos.push(['Text2', 'ID (Excel)']);
  if (e.simulacion) campos.push(['Date1', 'Fin P50 (QSRA)'], ['Date2', 'Fin P80 (QSRA)'], ['Number1', 'Criticidad % (QSRA)']);

  const x: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    `<SaveVersion>14</SaveVersion><Name>${escapar(nombreDe(e.proyecto, 'xml'))}</Name><Title>${escapar(e.proyecto)}</Title>`,
    `<ScheduleFromStart>1</ScheduleFromStart><StartDate>${isoDia(c.inicio)}T08:00:00</StartDate>${c.fechaCorte !== undefined ? `<StatusDate>${isoDia(c.fechaCorte)}T08:00:00</StatusDate>` : ''}`,
    `<MinutesPerDay>${HORAS_DIA * 60}</MinutesPerDay><MinutesPerWeek>${HORAS_DIA * 60 * 5}</MinutesPerWeek><CalendarUID>1</CalendarUID>`,
    `<ExtendedAttributes>${campos.map(([k, alias]) => `<ExtendedAttribute><FieldID>${CAMPOS_MSP[k]}</FieldID><FieldName>${k}</FieldName><Alias>${escapar(alias)}</Alias></ExtendedAttribute>`).join('')}</ExtendedAttributes>`,
    `<Calendars>${calendarioMsp(1, 'Proyecto', c.calendario)}${nombresCal.map((n) => calendarioMsp(uidCal.get(n) as number, n, (c.calendarios as Record<string, Calendario>)[n] as Calendario)).join('')}</Calendars>`,
    '<Tasks>',
    `<Task><UID>0</UID><ID>0</ID><Name>${escapar(e.proyecto)}</Name><OutlineLevel>0</OutlineLevel><Summary>1</Summary></Task>`,
  ];
  let dosRestricciones = 0;
  for (const a of c.actividades) {
    const u = uid.get(a.id) as number;
    const f = fila.get(a.id);
    const t: string[] = [
      `<Task><UID>${u}</UID><ID>${u}</ID><Name>${escapar(a.nombre)}</Name><OutlineLevel>1</OutlineLevel><Summary>0</Summary>`,
      `<Milestone>${a.duracion === 0 ? 1 : 0}</Milestone><Duration>PT${Math.round(a.duracion * HORAS_DIA * 1000) / 1000}H0M0S</Duration><DurationFormat>7</DurationFormat>`,
    ];
    if (f) t.push(`<Start>${isoDia(f.fechaInicio)}T08:00:00</Start><Finish>${isoDia(f.fechaFin)}T17:00:00</Finish>`);
    if (a.calendario && uidCal.has(a.calendario)) t.push(`<CalendarUID>${uidCal.get(a.calendario)}</CalendarUID>`);
    // Una restricción (y, si hace falta, la fecha límite para «terminar no después de»).
    const rs = restricciones(a);
    const tndd = rs.find((r) => r.tipo === 'TNDD');
    const principal = rs.find((r) => r.tipo !== 'TNDD') ?? tndd;
    if (principal) t.push(`<ConstraintType>${RESTRICCION_MSP[principal.tipo]}</ConstraintType><ConstraintDate>${isoDia(principal.fecha)}T${principal.tipo === 'TNAD' || principal.tipo === 'TNDD' || principal.tipo === 'MEO' ? '17:00' : '08:00'}:00</ConstraintDate>`);
    else t.push('<ConstraintType>0</ConstraintType>');
    if (tndd && principal !== tndd) t.push(`<Deadline>${isoDia(tndd.fecha)}T17:00:00</Deadline>`);
    if (rs.filter((r) => r.tipo !== 'TNDD').length > 1) dosRestricciones++;
    // Avance.
    if (a.inicioReal !== undefined) t.push(`<ActualStart>${isoDia(a.inicioReal)}T08:00:00</ActualStart>`);
    if (a.finReal !== undefined) t.push(`<ActualFinish>${isoDia(a.finReal)}T17:00:00</ActualFinish><PercentComplete>100</PercentComplete>`);
    else if (a.inicioReal !== undefined) {
      const restante = a.restante ?? a.duracion * (1 - (a.completado ?? 0));
      t.push(`<RemainingDuration>PT${Math.round(restante * HORAS_DIA * 1000) / 1000}H0M0S</RemainingDuration>`);
      if (a.completado !== undefined && a.restante === undefined) t.push(`<PercentComplete>${Math.round(a.completado * 100)}</PercentComplete>`);
    }
    for (const p of a.predecesoras) {
      t.push(`<PredecessorLink><PredecessorUID>${uid.get(p.predecesora)}</PredecessorUID><Type>${TIPO_MSP[p.tipo]}</Type><CrossProject>0</CrossProject><LinkLag>${Math.round(p.retardo * HORAS_DIA * 600)}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`);
    }
    const ext = (k: keyof typeof CAMPOS_MSP, v: string) => `<ExtendedAttribute><FieldID>${CAMPOS_MSP[k]}</FieldID><Value>${escapar(v)}</Value></ExtendedAttribute>`;
    if (a.categoria) t.push(ext('Text1', a.categoria));
    if (!numericos) t.push(ext('Text2', a.id));
    const r = res.get(a.id);
    if (r) t.push(ext('Date1', `${isoDia(r.finP50)}T17:00:00`), ext('Date2', `${isoDia(r.finP80)}T17:00:00`), ext('Number1', String(Math.round(r.criticidad * 1000) / 10)));
    t.push('</Task>');
    x.push(t.join(''));
  }
  x.push('</Tasks></Project>');
  if (dosRestricciones > 0) avisos.push(`${dosRestricciones} actividades tienen dos restricciones de inicio o fin: MS Project admite una (más la fecha límite); se exporta la de inicio.`);
  if (c.clima) avisos.push('El clima (hoja «Clima») no tiene equivalente en MS Project: sus efectos están en las fechas P50 y P80.');
  return { texto: x.join('\n'), nombreArchivo: nombreDe(e.proyecto, 'xml'), avisos };
}

// ---------------------------------------------------------------------------
// Primavera P6 (XER)
// ---------------------------------------------------------------------------

const TIPO_P6: Record<TipoRelacion, string> = { FS: 'PR_FS', SS: 'PR_SS', FF: 'PR_FF', SF: 'PR_SF' };
const RESTRICCION_P6 = { MSO: 'CS_MSO', MEO: 'CS_MEO', INA: 'CS_MSOA', INDD: 'CS_MSOB', TNAD: 'CS_MEOA', TNDD: 'CS_MEOB' } as const;

/** El `clndr_data` de P6: los días con un turno de 8 horas y los festivos como excepciones. P6 guarda los saltos de línea como el carácter 127. */
function clndrData(c: Calendario): string {
  const S = '\x7f\x7f';
  const semana = [1, 2, 3, 4, 5, 6, 7].map((d) => (c.laborables[d - 1]
    ? `    (0||${d}()(${S}      (0||0(s|08:00|f|12:00)())${S}      (0||1(s|13:00|f|17:00)())))`
    : `    (0||${d}()())`));
  const excepciones = [...c.festivos].sort((a, b) => a - b).map((f, i) => `    (0||${i}(d|${Math.floor(f)})())`);
  return `(0||CalendarData()(${S}  (0||DaysOfWeek()(${S}${semana.join(S)}))${S}  (0||VIEW(ShowTotal|Y)())${S}  (0||Exceptions()(${S}${excepciones.join(S)}))))`;
}

export function exportarXer(e: { cronograma: Cronograma; filas: readonly FilaCPM[]; simulacion?: ResultadoSimulacionPlazo; proyecto: string }): Exportado {
  const c = e.cronograma;
  const avisos: string[] = [];
  const res = resultadosPorId(e.simulacion);
  const fila = new Map(e.filas.map((f) => [f.id, f]));
  const fecha = (serie: number, hora: string) => `${isoDia(serie)} ${hora}`;
  const L: string[] = [`ERMHDR\t19.12\t${isoDia(c.inicio)}\tProject\tADMIN\tdbxDatabaseNoName\tProject Management\tUSD`];
  const tabla = (nombre: string, campos: string[], filas: Array<Array<string | number>>) => {
    L.push(`%T\t${nombre}`, `%F\t${campos.join('\t')}`);
    for (const f of filas) L.push(`%R\t${f.map((v) => String(v).replace(/[\t\r\n]/g, ' ')).join('\t')}`);
  };
  const PROY = 100;
  const nombresCal = Object.keys(c.calendarios ?? {});
  const idCal = new Map(nombresCal.map((n, i) => [n, i + 2]));
  tabla('CALENDAR', ['clndr_id', 'default_flag', 'clndr_name', 'day_hr_cnt', 'clndr_data'], [
    [1, 'Y', 'Proyecto', HORAS_DIA, clndrData(c.calendario)],
    ...nombresCal.map((n) => [idCal.get(n) as number, 'N', n, HORAS_DIA, clndrData((c.calendarios as Record<string, Calendario>)[n] as Calendario)]),
  ]);
  const corte = c.fechaCorte ?? c.inicio;
  tabla('PROJECT', ['proj_id', 'proj_short_name', 'plan_start_date', 'last_recalc_date', 'clndr_id'], [[PROY, e.proyecto.slice(0, 40), fecha(c.inicio, '08:00'), fecha(corte, '08:00'), 1]]);
  const categorias = [...new Set(c.actividades.map((a) => a.categoria).filter((x): x is string => !!x))];
  const wbs = new Map(categorias.map((k, i) => [k, 201 + i]));
  tabla('PROJWBS', ['wbs_id', 'proj_id', 'proj_node_flag', 'wbs_short_name', 'wbs_name', 'parent_wbs_id'], [
    [200, PROY, 'Y', e.proyecto.slice(0, 20), e.proyecto, ''],
    ...categorias.map((k) => [wbs.get(k) as number, PROY, 'N', k.slice(0, 20), k, 200]),
  ]);
  const idTarea = new Map(c.actividades.map((a, i) => [a.id, 1001 + i]));
  const conPreds = new Set(c.actividades.filter((a) => a.predecesoras.length > 0).map((a) => a.id));
  tabla('TASK', [
    'task_id', 'proj_id', 'wbs_id', 'clndr_id', 'task_code', 'task_name', 'task_type', 'status_code', 'target_drtn_hr_cnt', 'remain_drtn_hr_cnt',
    'early_start_date', 'early_end_date', 'act_start_date', 'act_end_date', 'cstr_type', 'cstr_date', 'cstr_type2', 'cstr_date2',
  ], c.actividades.map((a) => {
    const f = fila.get(a.id);
    const estado = a.finReal !== undefined ? 'TK_Complete' : a.inicioReal !== undefined ? 'TK_Active' : 'TK_NotStart';
    const restante = a.finReal !== undefined ? 0 : a.inicioReal !== undefined ? (a.restante ?? a.duracion * (1 - (a.completado ?? 0))) : a.duracion;
    const rs = restricciones(a);
    const hora = (t: string) => (t === 'TNAD' || t === 'TNDD' || t === 'MEO' ? '17:00' : '08:00');
    return [
      idTarea.get(a.id) as number, PROY, a.categoria ? (wbs.get(a.categoria) as number) : 200, a.calendario && idCal.has(a.calendario) ? (idCal.get(a.calendario) as number) : 1,
      a.id, a.nombre, a.duracion === 0 ? (conPreds.has(a.id) ? 'TT_FinMile' : 'TT_Mile') : 'TT_Task', estado,
      Math.round(a.duracion * HORAS_DIA * 1000) / 1000, Math.round(restante * HORAS_DIA * 1000) / 1000,
      f ? fecha(f.fechaInicio, '08:00') : '', f ? fecha(f.fechaFin, '17:00') : '',
      a.inicioReal !== undefined ? fecha(a.inicioReal, '08:00') : '', a.finReal !== undefined ? fecha(a.finReal, '17:00') : '',
      rs[0] ? RESTRICCION_P6[rs[0].tipo] : '', rs[0] ? fecha(rs[0].fecha, hora(rs[0].tipo)) : '',
      rs[1] ? RESTRICCION_P6[rs[1].tipo] : '', rs[1] ? fecha(rs[1].fecha, hora(rs[1].tipo)) : '',
    ];
  }));
  if (c.actividades.some((a) => restricciones(a).length > 2)) avisos.push('Alguna actividad tiene más de dos restricciones: P6 admite dos; se exportan las dos primeras.');
  const preds: Array<Array<string | number>> = [];
  for (const a of c.actividades) {
    for (const p of a.predecesoras) preds.push([5001 + preds.length, idTarea.get(a.id) as number, idTarea.get(p.predecesora) as number, PROY, PROY, TIPO_P6[p.tipo], Math.round(p.retardo * HORAS_DIA * 1000) / 1000]);
  }
  tabla('TASKPRED', ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id', 'pred_type', 'lag_hr_cnt'], preds);
  if (e.simulacion) {
    tabla('UDFTYPE', ['udf_type_id', 'table_name', 'udf_type_name', 'udf_type_label', 'logical_data_type'], [
      [9001, 'TASK', 'user_field_9001', 'Fin P50 (QSRA)', 'FT_END_DATE'],
      [9002, 'TASK', 'user_field_9002', 'Fin P80 (QSRA)', 'FT_END_DATE'],
      [9003, 'TASK', 'user_field_9003', 'Criticidad % (QSRA)', 'FT_FLOAT_2_DECIMALS'],
    ]);
    const valores: Array<Array<string | number>> = [];
    for (const a of c.actividades) {
      const r = res.get(a.id);
      if (!r) continue;
      const t = idTarea.get(a.id) as number;
      valores.push([9001, t, PROY, fecha(r.finP50, '17:00'), '', ''], [9002, t, PROY, fecha(r.finP80, '17:00'), '', ''], [9003, t, PROY, '', Math.round(r.criticidad * 1000) / 10, '']);
    }
    tabla('UDFVALUE', ['udf_type_id', 'fk_id', 'proj_id', 'udf_date', 'udf_number', 'udf_text'], valores);
  }
  L.push('%E');
  if (c.clima) avisos.push('El clima (hoja «Clima») no se exporta como calendario de P6: sus efectos están en las fechas P50 y P80.');
  return { texto: `${L.join('\r\n')}\r\n`, nombreArchivo: nombreDe(e.proyecto, 'xer'), avisos };
}

/** Texto a Windows-1252, la codificación habitual de los XER (lo que no cabe, «?»). */
export function aWindows1252(texto: string): Uint8Array {
  const extra: Record<string, number> = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
    '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
  };
  const out = new Uint8Array(texto.length);
  let n = 0;
  for (const ch of texto) {
    const cp = ch.codePointAt(0) as number;
    out[n++] = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : (extra[ch] ?? 0x3f);
  }
  return out.slice(0, n);
}
