/**
 * MS Project en XML (MSPDI: «Guardar como → XML»). El `.mpp` binario no se
 * puede leer desde un complemento web; el XML sí, y lo guardan todas las
 * versiones de Project desde 2003.
 *
 * Se lee con expresiones regulares sobre el texto, no con `DOMParser`: así
 * funciona igual en el panel, en un hilo y en las pruebas de Node. El formato
 * es plano (Project › Tasks › Task › campos) y basta con quitar primero los
 * bloques anidados de cada tarea (relaciones, atributos extendidos, líneas
 * base, datos por periodos) para leer sus campos directos.
 *
 * Qué se traduce:
 * - Tareas (no las de resumen): ID de Project como ID, nombre, duración en
 *   días (con los minutos por día del proyecto), hitos.
 * - Relaciones FC/CC/FF/CF con su retardo en días. Las que entran o salen de
 *   una tarea de **resumen** se trasladan a sus tareas hijas, como las aplica
 *   Project.
 * - Avance (inicio y fin reales, % completado, duración restante) y la
 *   fecha de estado como fecha de corte.
 * - Restricciones y fechas límite.
 * - El calendario del proyecto: días laborables y excepciones no laborables.
 * - La categoría de cada tarea: un campo personalizado llamado «Categoría»
 *   (o «Frente») si el proyecto lo tiene; si no, la tarea de resumen de
 *   primer nivel que la contiene.
 */

import type { Actividad, Calendario, Relacion, TipoRelacion } from '../tipos.ts';
import { desescaparXml, serieDeIso, type CronogramaImportado } from './comun.ts';

function campo(xml: string, nombre: string): string | undefined {
  const m = new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`).exec(xml);
  return m ? desescaparXml(m[1] as string) : undefined;
}

function bloques(xml: string, nombre: string): string[] {
  return [...xml.matchAll(new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`, 'g'))].map((m) => m[1] as string);
}

function sinBloques(xml: string, nombres: string[]): string {
  let s = xml;
  for (const n of nombres) s = s.replace(new RegExp(`<${n}>[\\s\\S]*?</${n}>`, 'g'), '');
  return s;
}

/** «PT40H0M0S» → horas. */
function horasDe(dur: string | undefined): number | undefined {
  if (!dur) return undefined;
  const m = /^-?P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(dur.trim());
  if (!m) return undefined;
  const signo = dur.trim().startsWith('-') ? -1 : 1;
  return signo * ((Number(m[1] ?? 0) * 24) + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60 + Number(m[4] ?? 0) / 3600);
}

const TIPO_ENLACE: Record<string, TipoRelacion> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' };

interface TareaMsp {
  uid: string;
  categoria?: string;
  id: string;
  nombre: string;
  nivel: number;
  resumen: boolean;
  nula: boolean;
  horas: number;
  hito: boolean;
  enlaces: Array<{ uid: string; tipo: TipoRelacion; lagDecimasMin: number; formato: string }>;
  inicio?: number;
  fin?: number;
  inicioReal?: number;
  finReal?: number;
  completado?: number;
  restanteHoras?: number;
  restriccion: string;
  fechaRestriccion?: number;
  limite?: number;
  calendarioUid?: string;
}

export function leerMspdi(xml: string): CronogramaImportado {
  if (!/<Project[\s>]/.test(xml)) throw new Error('No parece un XML de MS Project (falta <Project>). En Project: Archivo → Guardar como → XML.');
  const avisos: string[] = [];
  const cabecera = sinBloques(xml, ['Tasks', 'Resources', 'Assignments', 'Calendars', 'ExtendedAttributes', 'OutlineCodes', 'WBSMasks']);
  const proyecto = campo(cabecera, 'Title') ?? campo(cabecera, 'Name') ?? 'Proyecto de MS Project';
  const minutosDia = Number(campo(cabecera, 'MinutesPerDay') ?? 480) || 480;
  const horasDia = minutosDia / 60;
  const inicioProyecto = serieDeIso(campo(cabecera, 'StartDate'));
  const fechaEstado = serieDeIso(campo(cabecera, 'StatusDate'));
  const calUid = campo(cabecera, 'CalendarUID');

  // Campo personalizado de categoría: <ExtendedAttribute> del proyecto cuyo
  // alias o nombre sea «Categoría» o «Frente».
  const normal = (x: string | undefined) => (x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const defCategoria = bloques(xml.split('<Tasks>')[0] ?? '', 'ExtendedAttribute')
    .find((d) => ['categoria', 'frente', 'category'].includes(normal(campo(d, 'Alias'))) || ['categoria', 'frente'].includes(normal(campo(d, 'FieldName'))));
  const idCategoria = defCategoria ? campo(defCategoria, 'FieldID') : undefined;

  // Calendarios: el del proyecto y, V7, los de las tareas que tienen otro (<CalendarUID> distinto de −1).
  const calendarios = bloques(xml, 'Calendar');
  const uidDe = (c: string) => campo(sinBloques(c, ['WeekDays', 'Exceptions', 'WorkWeeks']), 'UID');
  const cal = calendarios.find((c) => uidDe(c) === calUid) ?? calendarios[0];
  const { laborables, festivos } = cal ? calendarioMsp(cal, avisos) : { laborables: [false, true, true, true, true, true, false], festivos: new Set<number>() };
  const otrosCal = new Map<string, { nombre: string; calendario: Calendario }>();
  const calendarioDeTarea = (uid: string | undefined): string | undefined => {
    if (uid === undefined || uid === '-1' || uid === calUid || !cal) return undefined;
    const ya = otrosCal.get(uid);
    if (ya) return ya.nombre;
    const c = calendarios.find((x) => uidDe(x) === uid);
    if (!c) return undefined;
    let nombre = campo(sinBloques(c, ['WeekDays', 'Exceptions', 'WorkWeeks']), 'Name') ?? `Calendario ${uid}`;
    while ([...otrosCal.values()].some((x) => x.nombre === nombre)) nombre += ` (${uid})`;
    otrosCal.set(uid, { nombre, calendario: calendarioMsp(c, avisos) });
    return nombre;
  };

  // Tareas.
  const tareas: TareaMsp[] = [];
  for (const t of bloques(xml, 'Task')) {
    const directo = sinBloques(t, ['PredecessorLink', 'ExtendedAttribute', 'Baseline', 'TimephasedData']);
    const uid = campo(directo, 'UID') ?? '';
    if (uid === '0' && Number(campo(directo, 'OutlineLevel') ?? 0) === 0) continue; // la tarea resumen del proyecto
    const cat = idCategoria === undefined ? undefined : bloques(t, 'ExtendedAttribute').find((e) => campo(e, 'FieldID') === idCategoria);
    tareas.push({
      uid,
      ...(cat && campo(cat, 'Value') ? { categoria: campo(cat, 'Value') } : {}),
      id: campo(directo, 'ID') ?? uid,
      nombre: campo(directo, 'Name') ?? `Tarea ${uid}`,
      nivel: Number(campo(directo, 'OutlineLevel') ?? 1),
      resumen: campo(directo, 'Summary') === '1',
      nula: campo(directo, 'IsNull') === '1',
      horas: horasDe(campo(directo, 'Duration')) ?? 0,
      hito: campo(directo, 'Milestone') === '1',
      enlaces: bloques(t, 'PredecessorLink').map((l) => ({
        uid: campo(l, 'PredecessorUID') ?? '',
        tipo: TIPO_ENLACE[campo(l, 'Type') ?? '1'] ?? 'FS',
        lagDecimasMin: Number(campo(l, 'LinkLag') ?? 0),
        formato: campo(l, 'LagFormat') ?? '7',
      })),
      inicio: serieDeIso(campo(directo, 'Start')),
      fin: serieDeIso(campo(directo, 'Finish')),
      inicioReal: serieDeIso(campo(directo, 'ActualStart')),
      finReal: serieDeIso(campo(directo, 'ActualFinish')),
      completado: campo(directo, 'PercentComplete') === undefined ? undefined : Number(campo(directo, 'PercentComplete')) / 100,
      restanteHoras: horasDe(campo(directo, 'RemainingDuration')),
      restriccion: campo(directo, 'ConstraintType') ?? '0',
      fechaRestriccion: serieDeIso(campo(directo, 'ConstraintDate')),
      limite: serieDeIso(campo(directo, 'Deadline')),
      calendarioUid: campo(directo, 'CalendarUID'),
    });
  }
  const validas = tareas.filter((t) => !t.nula);

  // Jerarquía: el padre de cada tarea es la anterior con menos nivel.
  const padre = new Map<string, string>();
  const pila: TareaMsp[] = [];
  for (const t of validas) {
    while (pila.length > 0 && (pila[pila.length - 1] as TareaMsp).nivel >= t.nivel) pila.pop();
    if (pila.length > 0) padre.set(t.uid, (pila[pila.length - 1] as TareaMsp).uid);
    pila.push(t);
  }
  const porUid = new Map(validas.map((t) => [t.uid, t]));
  const hojasDe = (uid: string): string[] => {
    const t = porUid.get(uid);
    if (!t) return [];
    if (!t.resumen) return [uid];
    return validas.filter((x) => padre.get(x.uid) === uid).flatMap((x) => hojasDe(x.uid));
  };
  const categoriaDe = (uid: string): string | undefined => {
    let u: string | undefined = padre.get(uid);
    let ultimo: string | undefined;
    while (u) {
      ultimo = u;
      u = padre.get(u);
    }
    return ultimo ? porUid.get(ultimo)?.nombre : undefined;
  };

  // Relaciones, con las de las tareas de resumen trasladadas a sus hojas.
  const entrantes = new Map<string, Relacion[]>();
  let deResumen = 0;
  let lagsRaros = 0;
  const añadir = (a: string, r: Relacion) => {
    const lista = entrantes.get(a) ?? [];
    if (!lista.some((x) => x.predecesora === r.predecesora && x.tipo === r.tipo && x.retardo === r.retardo)) lista.push(r);
    entrantes.set(a, lista);
  };
  for (const t of validas) {
    for (const e of t.enlaces) {
      const pred = porUid.get(e.uid);
      if (!pred) continue;
      let retardo = e.lagDecimasMin / 10 / minutosDia;
      if (!['7', '8', '5', '6', '3', '4', '9', '10', '11', '12'].includes(e.formato)) {
        lagsRaros++;
        retardo = 0;
      }
      retardo = Math.round(retardo * 1000) / 1000;
      const desde = pred.resumen ? hojasDe(pred.uid) : [pred.uid];
      const hacia = t.resumen ? hojasDe(t.uid) : [t.uid];
      if (pred.resumen || t.resumen) deResumen++;
      for (const d of desde) for (const h of hacia) if (d !== h) añadir(h, { predecesora: (porUid.get(d) as TareaMsp).id, tipo: e.tipo, retardo });
    }
  }
  if (deResumen > 0) avisos.push(`${deResumen} relaciones con tareas de resumen se trasladaron a sus tareas hijas.`);
  if (lagsRaros > 0) avisos.push(`${lagsRaros} retardos en porcentaje se tomaron como 0 días.`);

  const actividades: Actividad[] = [];
  const fechasFuente = new Map<string, { inicio: number; fin: number }>();
  let alap = 0;
  for (const t of validas) {
    if (t.resumen) continue;
    const duracion = t.hito ? 0 : Math.round((t.horas / horasDia) * 1000) / 1000;
    const a: Actividad = { id: t.id, nombre: t.nombre, duracion, predecesoras: entrantes.get(t.uid) ?? [] };
    const cat = t.categoria ?? categoriaDe(t.uid);
    if (cat) a.categoria = cat;
    const calT = calendarioDeTarea(t.calendarioUid);
    if (calT) a.calendario = calT;
    const fr = t.fechaRestriccion;
    switch (t.restriccion) {
      case '1': alap++; break;
      case '2': if (fr !== undefined) { a.inicioNoAntesDe = fr; a.inicioNoDespuesDe = fr; } break;
      case '3': if (fr !== undefined) { a.terminarNoAntesDe = fr; a.terminarNoDespuesDe = fr; } break;
      case '4': if (fr !== undefined) a.inicioNoAntesDe = fr; break;
      case '5': if (fr !== undefined) a.inicioNoDespuesDe = fr; break;
      case '6': if (fr !== undefined) a.terminarNoAntesDe = fr; break;
      case '7': if (fr !== undefined) a.terminarNoDespuesDe = fr; break;
    }
    if (t.limite !== undefined) a.terminarNoDespuesDe = Math.min(a.terminarNoDespuesDe ?? Infinity, t.limite);
    if (t.finReal !== undefined) {
      a.finReal = t.finReal;
      a.inicioReal = t.inicioReal ?? t.finReal;
    } else if (t.inicioReal !== undefined) {
      a.inicioReal = t.inicioReal;
      if (t.restanteHoras !== undefined) a.restante = Math.round((t.restanteHoras / horasDia) * 1000) / 1000;
      else if (t.completado !== undefined) a.completado = t.completado;
    }
    actividades.push(a);
    if (t.inicio !== undefined && t.fin !== undefined) fechasFuente.set(t.id, { inicio: t.inicio, fin: t.fin });
  }
  if (alap > 0) avisos.push(`${alap} tareas «lo más tarde posible»: se calculan lo antes posible.`);
  const conAvance = actividades.some((a) => a.inicioReal !== undefined);
  if (conAvance && fechaEstado === undefined) avisos.push('El proyecto tiene avance pero no fecha de estado: pon la «Fecha de corte» en la hoja «Calendario».');
  if (inicioProyecto === undefined) throw new Error('El XML no trae la fecha de inicio del proyecto (<StartDate>).');

  return {
    fuente: 'MS Project',
    proyecto,
    cronograma: {
      inicio: inicioProyecto,
      calendario: { laborables, festivos },
      ...(otrosCal.size > 0 ? { calendarios: Object.fromEntries([...otrosCal.values()].map((x) => [x.nombre, x.calendario])) } : {}),
      actividades,
      ...(conAvance && fechaEstado !== undefined ? { fechaCorte: fechaEstado } : {}),
    },
    fechasFuente,
    avisos,
  };
}

/** Días laborables y excepciones no laborables de un <Calendar>. */
function calendarioMsp(cal: string, avisos: string[]): Calendario {
  const laborables = [false, true, true, true, true, true, false];
  const festivos = new Set<number>();
  for (const wd of bloques(cal, 'WeekDay')) {
    const tipo = Number(campo(wd, 'DayType'));
    const trabaja = campo(wd, 'DayWorking') === '1';
    if (tipo >= 1 && tipo <= 7) laborables[tipo - 1] = trabaja;
    else if (tipo === 0 && !trabaja) {
      // Formato antiguo: una excepción como WeekDay de tipo 0 con su periodo.
      añadirPeriodo(festivos, campo(wd, 'FromDate'), campo(wd, 'ToDate'));
    }
  }
  for (const ex of bloques(cal, 'Exception')) {
    if (campo(ex, 'DayWorking') === '1') {
      const aviso = 'Un calendario tiene días de excepción laborables (p. ej. un sábado trabajado): se ignoran.';
      if (!avisos.includes(aviso)) avisos.push(aviso);
      continue;
    }
    añadirPeriodo(festivos, campo(ex, 'FromDate'), campo(ex, 'ToDate'));
  }
  return { laborables, festivos };
}

function añadirPeriodo(festivos: Set<number>, desde: string | undefined, hasta: string | undefined): void {
  const a = serieDeIso(desde);
  const b = serieDeIso(hasta) ?? a;
  if (a === undefined || b === undefined) return;
  for (let d = a; d <= b && d - a < 3660; d++) festivos.add(d);
}
