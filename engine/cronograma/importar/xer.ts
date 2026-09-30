/**
 * Primavera P6 en XER (Exportar → Primavera PM/EPPM XER). Es texto separado
 * por tabuladores, en tablas: `%T` nombre, `%F` campos, `%R` filas.
 *
 * Qué se traduce:
 * - PROJECT: nombre, inicio planificado y fecha de datos (*data date*) como
 *   fecha de corte. Si el archivo trae varios proyectos, el que más
 *   actividades tiene (se avisa).
 * - TASK: el código de actividad como ID, nombre, duración original (o la
 *   restante en las empezadas) en días con las horas por día de su
 *   calendario, hitos, avance (fechas reales, % físico) y restricciones.
 *   Los niveles de esfuerzo (LOE) y las barras WBS se ignoran (se avisa).
 * - TASKPRED: relaciones PR_FS/SS/FF/SF con su retardo en días.
 * - CALENDAR: el calendario del proyecto (días de la semana con trabajo y
 *   excepciones no laborables del campo `clndr_data`).
 * - PROJWBS: la categoría de cada actividad es el nombre de su WBS.
 */

import type { Actividad, Calendario, Relacion, TipoRelacion } from '../tipos.ts';
import { serieDeIso, type CronogramaImportado } from './comun.ts';

type Fila = Record<string, string>;

export function tablasXer(texto: string): Map<string, Fila[]> {
  const tablas = new Map<string, Fila[]>();
  let actual: Fila[] | null = null;
  let campos: string[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const partes = linea.split('\t');
    const marca = partes[0];
    if (marca === '%T') {
      actual = [];
      tablas.set((partes[1] ?? '').trim(), actual);
      campos = [];
    } else if (marca === '%F') {
      campos = partes.slice(1).map((c) => c.trim());
    } else if (marca === '%R' && actual) {
      const fila: Fila = {};
      campos.forEach((c, i) => (fila[c] = partes[i + 1] ?? ''));
      actual.push(fila);
    }
  }
  return tablas;
}

const TIPO: Record<string, TipoRelacion> = { PR_FS: 'FS', PR_SS: 'SS', PR_FF: 'FF', PR_SF: 'SF' };

/** Días de la semana laborables y excepciones de un `clndr_data` de P6. */
export function calendarioDeClndr(datos: string): { laborables: boolean[] | null; festivos: number[] } {
  let laborables: boolean[] | null = null;
  const semana = /DaysOfWeek\(\)\(([\s\S]*?)\)\s*\)\s*\(0\|\|(?:VIEW|Exceptions)/.exec(datos) ?? /DaysOfWeek\(\)\(([\s\S]*)$/.exec(datos);
  if (semana) {
    laborables = new Array<boolean>(7).fill(false);
    // Cada día: (0||N()( … periodos … )) — trabaja si tiene algún periodo (s|hh:mm|f|hh:mm).
    const re = /\(0\|\|([1-7])\(\)\(([\s\S]*?)\)\)/g;
    for (const m of (semana[1] as string).matchAll(re)) {
      laborables[Number(m[1]) - 1] = /s\|\d/.test(m[2] as string);
    }
    // Días sin cuerpo (0||7()()) no casan con la expresión de arriba: quedan como no laborables.
  }
  const festivos: number[] = [];
  const ex = /Exceptions\(\)\(([\s\S]*)$/.exec(datos);
  if (ex) {
    // (0||k(d|45000)()) sin periodos = día no laborable; con periodos = laborable (se ignora).
    for (const m of (ex[1] as string).matchAll(/\(0\|\|\d+\(d\|(\d+)\)\(([\s\S]*?)\)\)/g)) {
      if (!/s\|\d/.test(m[2] as string)) festivos.push(Number(m[1]));
    }
  }
  return { laborables, festivos };
}

export function leerXer(texto: string): CronogramaImportado {
  if (!texto.startsWith('ERMHDR') && !texto.includes('%T\tTASK')) throw new Error('No parece un archivo XER de Primavera P6 (falta la tabla TASK).');
  const t = tablasXer(texto);
  const avisos: string[] = [];
  const proyectos = t.get('PROJECT') ?? [];
  const tareasTodas = t.get('TASK') ?? [];
  if (tareasTodas.length === 0) throw new Error('El XER no trae actividades (tabla TASK vacía).');
  const cuenta = new Map<string, number>();
  for (const x of tareasTodas) cuenta.set(x.proj_id ?? '', (cuenta.get(x.proj_id ?? '') ?? 0) + 1);
  const proj = [...proyectos].sort((a, b) => (cuenta.get(b.proj_id ?? '') ?? 0) - (cuenta.get(a.proj_id ?? '') ?? 0))[0];
  const projId = proj?.proj_id ?? tareasTodas[0]?.proj_id ?? '';
  if (proyectos.length > 1) avisos.push(`El archivo trae ${proyectos.length} proyectos; se importa «${proj?.proj_short_name ?? projId}», el de más actividades.`);

  const calendarios = new Map((t.get('CALENDAR') ?? []).map((c) => [c.clndr_id ?? '', c]));
  const calProyecto = calendarios.get(proj?.clndr_id ?? '') ?? [...calendarios.values()].find((c) => c.default_flag === 'Y') ?? [...calendarios.values()][0];
  const horasDe = (clndrId: string | undefined) => Number(calendarios.get(clndrId ?? '')?.day_hr_cnt ?? calProyecto?.day_hr_cnt ?? 8) || 8;
  const laborablesDef = [false, true, true, true, true, true, false];
  let laborables = laborablesDef;
  const festivos = new Set<number>();
  if (calProyecto?.clndr_data) {
    const c = calendarioDeClndr(calProyecto.clndr_data);
    if (c.laborables && c.laborables.some(Boolean)) laborables = c.laborables;
    c.festivos.forEach((d) => festivos.add(d));
  }
  // V7: los calendarios de las actividades que no usan el del proyecto, por su nombre en P6.
  const otrosCal = new Map<string, { nombre: string; calendario: Calendario }>();
  const calendarioDeTarea = (clndrId: string | undefined): string | undefined => {
    if (!clndrId || clndrId === calProyecto?.clndr_id) return undefined;
    const ya = otrosCal.get(clndrId);
    if (ya) return ya.nombre;
    const c = calendarios.get(clndrId);
    if (!c) return undefined;
    const d = calendarioDeClndr(c.clndr_data ?? '');
    let nombre = c.clndr_name ?? `Calendario ${clndrId}`;
    while ([...otrosCal.values()].some((x) => x.nombre === nombre)) nombre += ` (${clndrId})`;
    otrosCal.set(clndrId, { nombre, calendario: { laborables: d.laborables && d.laborables.some(Boolean) ? d.laborables : laborables, festivos: new Set(d.festivos) } });
    return nombre;
  };

  const wbs = new Map((t.get('PROJWBS') ?? []).map((w) => [w.wbs_id ?? '', w]));
  const tareas = tareasTodas.filter((x) => x.proj_id === projId);
  const codigo = new Map(tareas.map((x) => [x.task_id ?? '', x.task_code ?? x.task_id ?? '']));

  const entrantes = new Map<string, Relacion[]>();
  let fuera = 0;
  for (const p of t.get('TASKPRED') ?? []) {
    const suc = codigo.get(p.task_id ?? '');
    const pre = codigo.get(p.pred_task_id ?? '');
    if (!suc) continue;
    if (!pre) {
      fuera++;
      continue;
    }
    const tarea = tareas.find((x) => x.task_id === p.pred_task_id);
    const retardo = Math.round((Number(p.lag_hr_cnt ?? 0) / horasDe(tarea?.clndr_id)) * 1000) / 1000;
    const lista = entrantes.get(suc) ?? [];
    lista.push({ predecesora: pre, tipo: TIPO[p.pred_type ?? 'PR_FS'] ?? 'FS', retardo });
    entrantes.set(suc, lista);
  }
  if (fuera > 0) avisos.push(`${fuera} relaciones con actividades de otros proyectos se ignoraron.`);

  const actividades: Actividad[] = [];
  const fechasFuente = new Map<string, { inicio: number; fin: number }>();
  let loe = 0;
  for (const x of tareas) {
    const tipo = x.task_type ?? 'TT_Task';
    if (tipo === 'TT_LOE' || tipo === 'TT_WBS') {
      loe++;
      continue;
    }
    const id = x.task_code ?? x.task_id ?? '';
    const hd = horasDe(x.clndr_id);
    const hito = tipo === 'TT_Mile' || tipo === 'TT_FinMile';
    const a: Actividad = {
      id,
      nombre: x.task_name ?? id,
      duracion: hito ? 0 : Math.round((Number(x.target_drtn_hr_cnt ?? 0) / hd) * 1000) / 1000,
      predecesoras: entrantes.get(id) ?? [],
    };
    const calT = calendarioDeTarea(x.clndr_id);
    if (calT) a.calendario = calT;
    const w = wbs.get(x.wbs_id ?? '');
    if (w && w.proj_node_flag !== 'Y' && w.wbs_name) a.categoria = w.wbs_name;
    // La restricción principal y la secundaria (cstr_type2) de P6.
    for (const [tipoR, fechaR] of [[x.cstr_type, x.cstr_date], [x.cstr_type2, x.cstr_date2]] as const) {
      const fr = serieDeIso(fechaR);
      switch (tipoR) {
        case 'CS_MSOA': if (fr !== undefined) a.inicioNoAntesDe = fr; break;
        case 'CS_MSOB': if (fr !== undefined) a.inicioNoDespuesDe = fr; break;
        case 'CS_MEOA': if (fr !== undefined) a.terminarNoAntesDe = fr; break;
        case 'CS_MEOB': if (fr !== undefined) a.terminarNoDespuesDe = fr; break;
        case 'CS_MSO': case 'CS_MANDSTART': if (fr !== undefined) { a.inicioNoAntesDe = fr; a.inicioNoDespuesDe = fr; } break;
        case 'CS_MEO': case 'CS_MANDFIN': if (fr !== undefined) { a.terminarNoAntesDe = fr; a.terminarNoDespuesDe = fr; } break;
        case 'CS_ALAP': avisos.push(`«${id}» es «lo más tarde posible»: se calcula lo antes posible.`); break;
      }
    }
    const estado = x.status_code ?? 'TK_NotStart';
    if (estado === 'TK_Complete') {
      a.finReal = serieDeIso(x.act_end_date);
      a.inicioReal = serieDeIso(x.act_start_date) ?? a.finReal;
      if (a.finReal === undefined) delete a.finReal;
    } else if (estado === 'TK_Active') {
      const ir = serieDeIso(x.act_start_date);
      if (ir !== undefined) {
        a.inicioReal = ir;
        a.restante = Math.round((Number(x.remain_drtn_hr_cnt ?? 0) / hd) * 1000) / 1000;
      }
    }
    actividades.push(a);
    const ini = serieDeIso(x.act_start_date) ?? serieDeIso(x.early_start_date) ?? serieDeIso(x.target_start_date);
    const fin = serieDeIso(x.act_end_date) ?? serieDeIso(x.early_end_date) ?? serieDeIso(x.target_end_date);
    if (ini !== undefined && fin !== undefined) fechasFuente.set(id, { inicio: ini, fin });
  }
  if (loe > 0) avisos.push(`${loe} actividades de nivel de esfuerzo o de WBS se ignoraron.`);

  const inicio = serieDeIso(proj?.plan_start_date) ?? Math.min(...[...fechasFuente.values()].map((f) => f.inicio));
  const corte = serieDeIso(proj?.last_recalc_date) ?? serieDeIso(proj?.next_data_date);
  const conAvance = actividades.some((a) => a.inicioReal !== undefined);
  return {
    fuente: 'Primavera P6',
    proyecto: proj?.proj_short_name ?? 'Proyecto de P6',
    cronograma: {
      inicio,
      calendario: { laborables, festivos },
      ...(otrosCal.size > 0 ? { calendarios: Object.fromEntries([...otrosCal.values()].map((x) => [x.nombre, x.calendario])) } : {}),
      actividades,
      ...(conAvance && corte !== undefined ? { fechaCorte: corte } : {}),
    },
    fechasFuente,
    avisos,
  };
}
