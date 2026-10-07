/**
 * Exportar el cronograma del Gantt (G3, V9): MS Project XML (MSPDI, que
 * también abren ProjectLibre y Primavera), Primavera P6 XER y CSV. Sin
 * Office.js: entra la vista calculada y sale el texto del archivo.
 *
 * Con simulación, los resultados viajan en campos personalizados de cada
 * actividad, para que el planificador vea el riesgo en su herramienta:
 *
 * | | MS Project (XML) | P6 (XER, campos de usuario) |
 * |---|---|---|
 * | Fin P50 | Fecha1 (Date1) | «Fin P50 (QRSA)» |
 * | Fin P80 | Fecha2 (Date2) | «Fin P80 (QRSA)» |
 * | Criticidad (%) | Número1 (Number1) | «Criticidad % (QRSA)» |
 *
 * El XML lleva lo que el complemento sabe: calendarios (días laborables y
 * festivos), actividades con su WBS y nivel de esquema, resúmenes, hitos,
 * duraciones, fechas calculadas, restricciones, fechas límite, avance real y
 * los vínculos con su tipo y desfase (en días laborables o transcurridos). Se
 * comprueba volviéndolo a importar con el propio importador.
 */

import { fechaDeSerie } from '../engine/modelo/fechas.ts';
import type { DatosGantt, VistaGantt } from './gantt.ts';

const MIN_DIA = 480;
const TIPO_MSPDI: Record<string, number> = { FF: 0, FC: 1, CF: 2, CC: 3 };
const RESTRICCION_MSPDI: Record<string, number> = { MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };

/** Identificadores de campo de MS Project (los mismos en todas las versiones). */
export const CAMPOS_MSP = { Number1: '188743767', Date1: '188743945', Date2: '188743946' } as const;

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function iso(serie: number, hora: string): string {
  const { anio, mes, dia } = fechaDeSerie(serie);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${hora}`;
}

const duracionIso = (dias: number) => `PT${Math.round(dias * 8 * 100) / 100}H0M0S`;

export function exportarMspdi(datos: DatosGantt, vista: VistaGantt, titulo = 'Cronograma'): string {
  const red = datos.modelo.red;
  const cals = red.calendarios;
  const uidCal = new Map(cals.map((c, i) => [c.id, i + 1]));
  const calProyecto = red.calendarioProyecto ?? cals[0]?.id ?? '';
  const actPorId = new Map(red.actividades.map((a) => [a.id, a]));
  const uidAct = new Map(vista.filas.map((f, i) => [f.id, i + 1]));
  const l: string[] = [];
  l.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  l.push('<Project xmlns="http://schemas.microsoft.com/project">');
  l.push(`  <Name>${esc(titulo)}</Name>`, `  <Title>${esc(titulo)}</Title>`);
  l.push(`  <StartDate>${iso(red.inicio, '08:00:00')}</StartDate>`, `  <FinishDate>${iso(vista.fin, '17:00:00')}</FinishDate>`);
  if (red.fechaCorte !== undefined) l.push(`  <StatusDate>${iso(red.fechaCorte, '17:00:00')}</StatusDate>`);
  l.push(`  <CalendarUID>${uidCal.get(calProyecto) ?? 1}</CalendarUID>`, `  <MinutesPerDay>${MIN_DIA}</MinutesPerDay>`, '  <MinutesPerWeek>2400</MinutesPerWeek>', '  <DaysPerMonth>20</DaysPerMonth>');
  // V9: los resultados de la simulación en campos personalizados.
  const conQrsa = vista.filas.some((f) => f.qrsa);
  if (conQrsa) {
    l.push('  <ExtendedAttributes>');
    for (const [campo, alias] of [['Date1', 'Fin P50 (QRSA)'], ['Date2', 'Fin P80 (QRSA)'], ['Number1', 'Criticidad % (QRSA)']] as const) {
      l.push(`    <ExtendedAttribute><FieldID>${CAMPOS_MSP[campo]}</FieldID><FieldName>${campo}</FieldName><Alias>${esc(alias)}</Alias></ExtendedAttribute>`);
    }
    l.push('  </ExtendedAttributes>');
  }
  l.push('  <Calendars>');
  cals.forEach((c, i) => {
    l.push('    <Calendar>', `      <UID>${i + 1}</UID>`, `      <Name>${esc(c.nombre ?? c.id)}</Name>`, '      <IsBaseCalendar>1</IsBaseCalendar>', '      <BaseCalendarUID>-1</BaseCalendarUID>', '      <WeekDays>');
    // DayType: 1 = domingo … 7 = sábado; `laborables` va de lunes (0) a domingo (6).
    for (let t = 1; t <= 7; t++) {
      const trabaja = c.laborables[(t + 5) % 7] === true;
      l.push('        <WeekDay>', `          <DayType>${t}</DayType>`, `          <DayWorking>${trabaja ? 1 : 0}</DayWorking>`);
      if (trabaja) l.push('          <WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>');
      l.push('        </WeekDay>');
    }
    l.push('      </WeekDays>');
    const excepciones = [...(c.festivos ?? []).map((f) => [f, 0] as const), ...(c.trabajados ?? []).map((f) => [f, 1] as const)];
    if (excepciones.length) {
      l.push('      <Exceptions>');
      for (const [f, trabaja] of excepciones) {
        l.push('        <Exception>', '          <EnteredByOccurrences>0</EnteredByOccurrences>', `          <TimePeriod><FromDate>${iso(f, '00:00:00')}</FromDate><ToDate>${iso(f, '23:59:00')}</ToDate></TimePeriod>`, '          <Occurrences>1</Occurrences>', `          <Name>${trabaja ? 'Laborable' : 'Festivo'}</Name>`, '          <Type>1</Type>', `          <DayWorking>${trabaja}</DayWorking>`, '        </Exception>');
      }
      l.push('      </Exceptions>');
    }
    l.push('    </Calendar>');
  });
  l.push('  </Calendars>', '  <Tasks>');
  vista.filas.forEach((f, i) => {
    const a = actPorId.get(f.id);
    const resumen = f.tipo === 'resumen';
    const hito = f.tipo === 'hito';
    l.push('    <Task>', `      <UID>${i + 1}</UID>`, `      <ID>${i + 1}</ID>`, `      <Name>${esc(f.nombre)}</Name>`);
    if (f.wbs) l.push(`      <WBS>${esc(f.wbs)}</WBS>`, `      <OutlineNumber>${esc(f.wbs)}</OutlineNumber>`);
    l.push(`      <OutlineLevel>${f.nivel}</OutlineLevel>`, `      <Summary>${resumen ? 1 : 0}</Summary>`, `      <Milestone>${hito ? 1 : 0}</Milestone>`);
    if (Number.isFinite(f.inicio)) {
      l.push(`      <Start>${iso(f.inicio, '08:00:00')}</Start>`, `      <Finish>${iso(f.fin, hito ? '08:00:00' : '17:00:00')}</Finish>`);
    }
    l.push(`      <Duration>${duracionIso(hito ? 0 : f.duracion ?? 0)}</Duration>`, '      <DurationFormat>7</DurationFormat>');
    if (a?.restriccion) l.push(`      <ConstraintType>${RESTRICCION_MSPDI[a.restriccion.tipo] ?? 0}</ConstraintType>`, `      <ConstraintDate>${iso(a.restriccion.fecha, '08:00:00')}</ConstraintDate>`);
    else l.push('      <ConstraintType>0</ConstraintType>');
    if (a?.fechaLimite !== undefined) l.push(`      <Deadline>${iso(a.fechaLimite, '17:00:00')}</Deadline>`);
    if (a?.calendario && a.calendario !== calProyecto) l.push(`      <CalendarUID>${uidCal.get(a.calendario) ?? -1}</CalendarUID>`);
    if (a?.avance?.inicioReal !== undefined) l.push(`      <ActualStart>${iso(a.avance.inicioReal, '08:00:00')}</ActualStart>`);
    if (a?.avance?.finReal !== undefined) l.push(`      <ActualFinish>${iso(a.avance.finReal, '17:00:00')}</ActualFinish>`);
    if (f.avance !== null && !resumen) l.push(`      <PercentComplete>${Math.round(f.avance * 100)}</PercentComplete>`);
    for (const p of a?.predecesoras ?? []) {
      const uid = uidAct.get(p.id);
      if (!uid) continue;
      // Desfase en décimas de minuto; formato 7 = días, 8 = días transcurridos.
      const minutos = p.transcurrido ? p.desfase * 1440 : p.desfase * MIN_DIA;
      l.push('      <PredecessorLink>', `        <PredecessorUID>${uid}</PredecessorUID>`, `        <Type>${TIPO_MSPDI[p.tipo] ?? 1}</Type>`, '        <CrossProject>0</CrossProject>', `        <LinkLag>${Math.round(minutos * 10)}</LinkLag>`, `        <LagFormat>${p.transcurrido ? 8 : 7}</LagFormat>`, '      </PredecessorLink>');
    }
    if (f.qrsa && !resumen) {
      const ext = (campo: keyof typeof CAMPOS_MSP, v: string) => `      <ExtendedAttribute><FieldID>${CAMPOS_MSP[campo]}</FieldID><Value>${esc(v)}</Value></ExtendedAttribute>`;
      l.push(ext('Date1', iso(f.qrsa.p50, '17:00:00')), ext('Date2', iso(f.qrsa.p80, '17:00:00')), ext('Number1', String(Math.round(f.qrsa.criticidad * 1000) / 10)));
    }
    l.push('    </Task>');
  });
  l.push('  </Tasks>', '</Project>', '');
  return l.join('\n');
}

// ------------------------------------------------------------- Primavera P6 XER

const HORAS_DIA = 8;
const TIPO_P6: Record<string, string> = { FC: 'PR_FS', CC: 'PR_SS', FF: 'PR_FF', CF: 'PR_SF' };
const RESTRICCION_P6: Record<string, string> = { MSO: 'CS_MSO', MFO: 'CS_MEO', SNET: 'CS_MSOA', SNLT: 'CS_MSOB', FNET: 'CS_MEOA', FNLT: 'CS_MEOB' };

function isoDia(serie: number): string {
  const { anio, mes, dia } = fechaDeSerie(serie);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * El `clndr_data` de P6: los días con un turno de 8 horas y las excepciones.
 * P6 guarda los saltos de línea como el carácter 127. Los días de P6 van de
 * domingo (1) a sábado (7); `laborables`, de lunes (0) a domingo (6).
 */
function clndrData(c: { laborables: readonly boolean[]; festivos?: readonly number[]; trabajados?: readonly number[] }): string {
  const S = '\x7f\x7f';
  const turno = `${S}      (0||0(s|08:00|f|12:00)())${S}      (0||1(s|13:00|f|17:00)())`;
  const semana = [1, 2, 3, 4, 5, 6, 7].map((d) => (c.laborables[(d + 5) % 7] ? `    (0||${d}()(${turno}))` : `    (0||${d}()())`));
  const excepciones = [
    ...(c.festivos ?? []).map((f) => [f, false] as const),
    ...(c.trabajados ?? []).map((f) => [f, true] as const),
  ].sort((a, b) => a[0] - b[0]).map(([f, trabaja], i) => `    (0||${i}(d|${Math.floor(f)})(${trabaja ? turno : ''}))`);
  return `(0||CalendarData()(${S}  (0||DaysOfWeek()(${S}${semana.join(S)}))${S}  (0||VIEW(ShowTotal|Y)())${S}  (0||Exceptions()(${S}${excepciones.join(S)}))))`;
}

export interface ExportacionXer {
  texto: string;
  /** Lo que el formato no admite tal cual, dicho con palabras. */
  avisos: string[];
}

/**
 * V9: el cronograma en un XER de Primavera P6: calendarios, la WBS (de los
 * resúmenes), las actividades con sus fechas, restricciones y avance, los
 * vínculos y, con simulación, el P50, el P80 y la criticidad en campos de
 * usuario. Se comprueba volviéndolo a importar con el propio importador.
 */
export function exportarXer(datos: DatosGantt, vista: VistaGantt, titulo = 'Cronograma'): ExportacionXer {
  const red = datos.modelo.red;
  const avisos: string[] = [];
  const actPorId = new Map(red.actividades.map((a) => [a.id, a]));
  const L: string[] = [`ERMHDR\t19.12\t${isoDia(red.inicio)}\tProject\tADMIN\tdbxDatabaseNoName\tProject Management\tCOP`];
  const tabla = (nombre: string, campos: string[], filas: (string | number)[][]) => {
    L.push(`%T\t${nombre}`, `%F\t${campos.join('\t')}`);
    for (const f of filas) L.push(`%R\t${f.map((v) => String(v).replace(/[\t\r\n]/g, ' ')).join('\t')}`);
  };
  const fecha = (serie: number, hora: string) => `${isoDia(serie)} ${hora}`;
  const PROY = 100;
  const calProyecto = red.calendarioProyecto ?? red.calendarios[0]?.id ?? '';
  const idCal = new Map(red.calendarios.map((c, i) => [c.id, i + 1]));
  tabla('CALENDAR', ['clndr_id', 'default_flag', 'clndr_name', 'day_hr_cnt', 'clndr_data'],
    red.calendarios.map((c) => [idCal.get(c.id) as number, c.id === calProyecto ? 'Y' : 'N', c.nombre ?? c.id, HORAS_DIA, clndrData(c)]));
  tabla('PROJECT', ['proj_id', 'proj_short_name', 'plan_start_date', 'last_recalc_date', 'clndr_id'],
    [[PROY, titulo.slice(0, 40), fecha(red.inicio, '08:00'), fecha(red.fechaCorte ?? red.inicio, '08:00'), idCal.get(calProyecto) ?? 1]]);

  // La WBS: un nodo por resumen, colgado del resumen que lo contiene (o de la raíz).
  const resumenes = vista.filas.filter((f) => f.tipo === 'resumen' && f.wbs);
  const idWbs = new Map(resumenes.map((f, i) => [f.wbs, 201 + i]));
  const padreDe = (wbs: string): number => {
    const partes = wbs.split('.');
    for (let k = partes.length - 1; k > 0; k--) {
      const id = idWbs.get(partes.slice(0, k).join('.'));
      if (id) return id;
    }
    return 200;
  };
  tabla('PROJWBS', ['wbs_id', 'proj_id', 'proj_node_flag', 'wbs_short_name', 'wbs_name', 'parent_wbs_id'], [
    [200, PROY, 'Y', titulo.slice(0, 20), titulo, ''],
    ...resumenes.map((f) => [idWbs.get(f.wbs) as number, PROY, 'N', f.wbs.split('.').pop() as string, f.nombre, padreDe(f.wbs)]),
  ]);

  const tareas = vista.filas.filter((f) => f.tipo !== 'resumen');
  const idTarea = new Map(tareas.map((f, i) => [f.id, 1001 + i]));
  let transcurridos = 0;
  tabla('TASK', [
    'task_id', 'proj_id', 'wbs_id', 'clndr_id', 'task_code', 'task_name', 'task_type', 'status_code', 'target_drtn_hr_cnt', 'remain_drtn_hr_cnt',
    'early_start_date', 'early_end_date', 'act_start_date', 'act_end_date', 'phys_complete_pct', 'cstr_type', 'cstr_date', 'cstr_type2', 'cstr_date2',
  ], tareas.map((f) => {
    const a = actPorId.get(f.id);
    const hito = f.tipo === 'hito';
    const dur = hito ? 0 : f.duracion ?? 0;
    const estado = f.estado === 'terminada' ? 'TK_Complete' : f.estado === 'en curso' ? 'TK_Active' : 'TK_NotStart';
    const restante = f.estado === 'terminada' ? 0 : f.restante ?? dur;
    const r = a?.restriccion;
    const hora = (t: string) => (t === 'FNET' || t === 'FNLT' || t === 'MFO' ? '17:00' : '08:00');
    return [
      idTarea.get(f.id) as number, PROY, padreDe(`${f.wbs}.x`), idCal.get(a?.calendario ?? calProyecto) ?? 1,
      f.id, f.nombre, hito ? ((a?.predecesoras.length ?? 0) > 0 ? 'TT_FinMile' : 'TT_Mile') : 'TT_Task', estado,
      Math.round(dur * HORAS_DIA * 1000) / 1000, Math.round(restante * HORAS_DIA * 1000) / 1000,
      Number.isFinite(f.inicio) ? fecha(f.inicio, '08:00') : '', Number.isFinite(f.fin) ? fecha(f.fin, '17:00') : '',
      f.inicioReal !== null ? fecha(f.inicioReal, '08:00') : '', f.finReal !== null ? fecha(f.finReal, '17:00') : '',
      f.avance !== null ? Math.round(f.avance * 100) : '',
      r ? RESTRICCION_P6[r.tipo] ?? '' : '', r ? fecha(r.fecha, hora(r.tipo)) : '',
      a?.fechaLimite !== undefined ? 'CS_MEOB' : '', a?.fechaLimite !== undefined ? fecha(a.fechaLimite, '17:00') : '',
    ];
  }));
  const preds: (string | number)[][] = [];
  for (const f of tareas) {
    for (const p of actPorId.get(f.id)?.predecesoras ?? []) {
      const pred = idTarea.get(p.id);
      if (pred === undefined) continue;
      if (p.transcurrido) transcurridos++;
      preds.push([5001 + preds.length, idTarea.get(f.id) as number, pred, PROY, PROY, TIPO_P6[p.tipo] ?? 'PR_FS', Math.round(p.desfase * HORAS_DIA * 1000) / 1000]);
    }
  }
  tabla('TASKPRED', ['task_pred_id', 'task_id', 'pred_task_id', 'proj_id', 'pred_proj_id', 'pred_type', 'lag_hr_cnt'], preds);
  if (transcurridos) avisos.push(`${transcurridos} ${transcurridos === 1 ? 'desfase va' : 'desfases van'} en días calendario: P6 no los distingue por vínculo y se exportan como días laborables.`);
  if (tareas.some((f) => f.qrsa)) {
    tabla('UDFTYPE', ['udf_type_id', 'table_name', 'udf_type_name', 'udf_type_label', 'logical_data_type'], [
      [9001, 'TASK', 'user_field_9001', 'Fin P50 (QRSA)', 'FT_END_DATE'],
      [9002, 'TASK', 'user_field_9002', 'Fin P80 (QRSA)', 'FT_END_DATE'],
      [9003, 'TASK', 'user_field_9003', 'Criticidad % (QRSA)', 'FT_FLOAT_2_DECIMALS'],
    ]);
    const valores: (string | number)[][] = [];
    for (const f of tareas) {
      if (!f.qrsa) continue;
      const t = idTarea.get(f.id) as number;
      valores.push([9001, t, PROY, fecha(f.qrsa.p50, '17:00'), '', ''], [9002, t, PROY, fecha(f.qrsa.p80, '17:00'), '', ''], [9003, t, PROY, '', Math.round(f.qrsa.criticidad * 1000) / 10, '']);
    }
    tabla('UDFVALUE', ['udf_type_id', 'fk_id', 'proj_id', 'udf_date', 'udf_number', 'udf_text'], valores);
  }
  L.push('%E');
  return { texto: `${L.join('\r\n')}\r\n`, avisos };
}

/** Texto a Windows-1252, la codificación habitual de los XER (lo que no cabe, «?»). */
export function aWindows1252(texto: string): Uint8Array<ArrayBuffer> {
  const extra: Record<string, number> = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
    '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
  };
  const out: Uint8Array<ArrayBuffer> = new Uint8Array(texto.length);
  let n = 0;
  for (const ch of texto) {
    const cp = ch.codePointAt(0) as number;
    out[n++] = cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) ? cp : (extra[ch] ?? 0x3f);
  }
  return out.slice(0, n);
}

/** Una celda CSV (punto y coma, como lo abre Excel en español). */
function celda(v: string | number | null): string {
  if (v === null) return '';
  const t = typeof v === 'number' ? v.toLocaleString('es-ES', { maximumFractionDigits: 4, useGrouping: false }) : v;
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const fechaTexto = (s: number | null) => {
  if (s === null || !Number.isFinite(s)) return null;
  const { anio, mes, dia } = fechaDeSerie(s);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
};

/** La tabla del Gantt en CSV, con BOM para que Excel lea los acentos. */
export function csvGantt(vista: VistaGantt): string {
  const enc = ['ID', 'WBS', 'Nombre', 'Tipo', 'Duración (días)', 'Comienzo', 'Fin', 'Comienzo tardío', 'Fin tardío', 'Holgura total', 'Holgura libre', 'Crítica',
    'Ruta de holgura', 'Predecesoras', 'Sucesoras', 'Restricción', 'Fecha de la restricción', 'Fecha límite', 'Estado', '% completado', 'Comienzo real', 'Fin real',
    'LB comienzo', 'LB fin', 'Variación (días)', 'P80 fin', 'Criticidad', 'P(cumplir el hito)'];
  const filas = vista.filas.map((f) => [
    f.id, f.wbs, f.nombre, f.tipo, f.duracion, fechaTexto(f.inicio), fechaTexto(f.fin), fechaTexto(f.inicioTardio), fechaTexto(f.finTardio),
    f.holguraTotal, f.holguraLibre, f.tipo === 'resumen' ? null : f.critica ? 'Sí' : 'No', f.rutaHolgura || null, f.predecesoras, f.sucesoras,
    f.restriccion, fechaTexto(f.fechaRestriccion), fechaTexto(f.fechaLimite), f.estado, f.avance === null ? null : Math.round(f.avance * 100),
    fechaTexto(f.inicioReal), fechaTexto(f.finReal), fechaTexto(f.lineaBase?.inicio ?? null), fechaTexto(f.lineaBase?.fin ?? null), f.variacion,
    fechaTexto(f.qrsa?.p80 ?? null), f.qrsa ? Math.round(f.qrsa.criticidad * 100) : null, f.probabilidadHito ? Math.round(f.probabilidadHito.p * 100) : null,
  ].map(celda).join(';'));
  return `\uFEFF${[enc.join(';'), ...filas].join('\r\n')}\r\n`;
}
