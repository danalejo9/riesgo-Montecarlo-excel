/**
 * Importar un cronograma (QRSA, Q2.7 y Q3.1): MS Project XML (MSPDI) y
 * Primavera P6 XER, a las hojas del libro de cronograma. Sin Office.js: el
 * texto del archivo entra y salen las hojas (Actividades, Relaciones y
 * Calendario) y un resumen con las advertencias.
 *
 * - Las actividades resumen se importan como «Resumen» (fuera del cálculo,
 *   con aviso si tienen vínculos), las inactivas no se importan.
 * - Duraciones y desfases se pasan a días laborables con las horas por día
 *   del proyecto (MS Project) o del calendario de la actividad (P6). Un
 *   desfase transcurrido («ed» en MS Project) queda en días calendario.
 * - Los calendarios se traen con sus días laborables y sus excepciones.
 */

import { serieDeFecha } from '../engine/modelo/fechas.ts';
import {
  COLUMNA_EXCEPCIONES, COLUMNAS, hojasNuevasCronograma, HOJAS_CRONOGRAMA, type Celda, type HojaNueva,
} from './cronogramaHojas.ts';

// ------------------------------------------------------------- XML mínimo

export interface NodoXml {
  nombre: string;
  hijos: NodoXml[];
  texto: string;
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function desescapar(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTIDADES[e] ?? m;
  });
}

/** Un lector de XML suficiente para MSPDI: elementos, texto y entidades (sin atributos que importen). */
export function leerXml(xml: string): NodoXml {
  const raiz: NodoXml = { nombre: '#raiz', hijos: [], texto: '' };
  const pila: NodoXml[] = [raiz];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<\s*([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const actual = pila[pila.length - 1] as NodoXml;
    if (m[1] !== undefined) actual.texto += m[1];
    else if (m[2] !== undefined) {
      const nombre = local(m[2]);
      while (pila.length > 1 && (pila[pila.length - 1] as NodoXml).nombre !== nombre) pila.pop();
      if (pila.length > 1) pila.pop();
    } else if (m[3] !== undefined) {
      const nodo: NodoXml = { nombre: local(m[3]), hijos: [], texto: '' };
      actual.hijos.push(nodo);
      if (m[5] !== '/') pila.push(nodo);
    } else if (m[6] !== undefined) actual.texto += desescapar(m[6]);
  }
  return raiz;
}

function local(n: string): string {
  const i = n.indexOf(':');
  return i >= 0 ? n.slice(i + 1) : n;
}

function hijo(n: NodoXml | undefined, nombre: string): NodoXml | undefined {
  return n?.hijos.find((h) => h.nombre === nombre);
}

function hijos(n: NodoXml | undefined, nombre: string): NodoXml[] {
  return n?.hijos.filter((h) => h.nombre === nombre) ?? [];
}

function txt(n: NodoXml | undefined, nombre: string): string {
  return (hijo(n, nombre)?.texto ?? '').trim();
}

// ------------------------------------------------------------- modelo intermedio

export interface CalendarioImportado {
  nombre: string;
  /** De lunes (0) a domingo (6). */
  laborables: boolean[];
  festivos: number[];
  trabajados: number[];
}

export interface ActividadImportada {
  id: string;
  nombre: string;
  wbs: string;
  tipo: 'Tarea' | 'Hito' | 'Resumen';
  duracion: number;
  calendario?: string;
  restriccion?: string;
  fechaRestriccion?: number;
}

export interface RelacionImportada {
  predecesora: string;
  sucesora: string;
  tipo: 'FC' | 'CC' | 'FF' | 'CF';
  desfase: number;
  calendario: boolean;
}

export interface CronogramaImportado {
  formato: 'MS Project XML' | 'Primavera P6 XER';
  nombre: string;
  inicio: number;
  calendarioProyecto: string;
  calendarios: CalendarioImportado[];
  actividades: ActividadImportada[];
  relaciones: RelacionImportada[];
  avisos: string[];
}

export interface ResumenImportacion {
  actividades: number;
  hitos: number;
  resumenes: number;
  relaciones: number;
  calendarios: number;
}

export function resumenImportacion(c: CronogramaImportado): ResumenImportacion {
  return {
    actividades: c.actividades.filter((a) => a.tipo === 'Tarea').length,
    hitos: c.actividades.filter((a) => a.tipo === 'Hito').length,
    resumenes: c.actividades.filter((a) => a.tipo === 'Resumen').length,
    relaciones: c.relaciones.length,
    calendarios: c.calendarios.length,
  };
}

/** Una fecha ISO («2027-01-04T08:00:00» o «2027-01-04 08:00») como número de serie. */
function serieIso(t: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t.trim());
  return m ? serieDeFecha(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

function redondear(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Días entre dos números de serie, ambos incluidos. */
function rango(desde: number, hasta: number): number[] {
  const r: number[] = [];
  for (let d = desde; d <= hasta && r.length < 3700; d++) r.push(d);
  return r;
}

// ------------------------------------------------------------- MS Project XML

const RESTRICCION_MSP: Record<string, string> = {
  2: 'Debe comenzar el', 3: 'Debe terminar el', 4: 'No comenzar antes de', 5: 'No comenzar después de', 6: 'No terminar antes de', 7: 'No terminar después de',
};
const TIPO_MSP: Record<string, RelacionImportada['tipo']> = { 0: 'FF', 1: 'FC', 2: 'CF', 3: 'CC' };

/** «PT40H0M0S» → horas. */
function horasIso(t: string): number {
  const m = /^-?P(?:(\d+(?:\.\d+)?)D)?T?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?/.exec(t.trim());
  if (!m) return 0;
  const signo = t.trim().startsWith('-') ? -1 : 1;
  return signo * ((Number(m[1] ?? 0) * 24) + Number(m[2] ?? 0) + Number(m[3] ?? 0) / 60 + Number(m[4] ?? 0) / 3600);
}

export function importarMsProject(xml: string): CronogramaImportado {
  const raiz = leerXml(xml);
  const proyecto = hijo(raiz, 'Project');
  if (!proyecto) throw new Error('El archivo no es un XML de MS Project (falta el elemento Project)');
  const avisos: string[] = [];
  const minDia = Number(txt(proyecto, 'MinutesPerDay')) || 480;
  const inicio = serieIso(txt(proyecto, 'StartDate'));
  if (inicio === null) throw new Error('El XML de MS Project no trae la fecha de inicio del proyecto (StartDate)');

  // Calendarios.
  const porUid = new Map<string, CalendarioImportado>();
  const nodosCal = hijos(hijo(proyecto, 'Calendars'), 'Calendar');
  const leerCal = (n: NodoXml, visitados = new Set<string>()): CalendarioImportado => {
    const uid = txt(n, 'UID');
    const previo = porUid.get(uid);
    if (previo) return previo;
    const baseUid = txt(n, 'BaseCalendarUID');
    const base = baseUid && baseUid !== '-1' && !visitados.has(baseUid) ? nodosCal.find((c) => txt(c, 'UID') === baseUid) : undefined;
    const heredado = base ? leerCal(base, new Set([...visitados, uid])) : undefined;
    const cal: CalendarioImportado = {
      nombre: txt(n, 'Name') || `Calendario ${uid}`,
      laborables: heredado ? [...heredado.laborables] : [true, true, true, true, true, false, false],
      festivos: heredado ? [...heredado.festivos] : [],
      trabajados: heredado ? [...heredado.trabajados] : [],
    };
    for (const wd of hijos(hijo(n, 'WeekDays'), 'WeekDay')) {
      const tipo = Number(txt(wd, 'DayType'));
      const trabaja = txt(wd, 'DayWorking') === '1';
      if (tipo >= 1 && tipo <= 7) cal.laborables[(tipo + 5) % 7] = trabaja;
      else if (tipo === 0) {
        const tp = hijo(wd, 'TimePeriod');
        const d = serieIso(txt(tp, 'FromDate'));
        const h = serieIso(txt(tp, 'ToDate'));
        if (d !== null) (trabaja ? cal.trabajados : cal.festivos).push(...rango(d, h ?? d));
      }
    }
    for (const ex of hijos(hijo(n, 'Exceptions'), 'Exception')) {
      const tp = hijo(ex, 'TimePeriod');
      const d = serieIso(txt(tp, 'FromDate'));
      const h = serieIso(txt(tp, 'ToDate'));
      const trabaja = txt(ex, 'DayWorking') === '1';
      if (d !== null) (trabaja ? cal.trabajados : cal.festivos).push(...rango(d, h ?? d));
    }
    porUid.set(uid, cal);
    return cal;
  };
  const calendarios = nodosCal.filter((c) => txt(c, 'IsBaseCalendar') !== '0').map((c) => leerCal(c));
  if (calendarios.length === 0) {
    calendarios.push({ nombre: 'Lunes a viernes', laborables: [true, true, true, true, true, false, false], festivos: [], trabajados: [] });
    avisos.push('El XML no trae calendarios: se usa lunes a viernes sin festivos.');
  }
  const calProyecto = porUid.get(txt(proyecto, 'CalendarUID'))?.nombre ?? (calendarios[0] as CalendarioImportado).nombre;

  // Tareas.
  const tareas = hijos(hijo(proyecto, 'Tasks'), 'Task');
  const idPorUid = new Map<string, string>();
  const actividades: ActividadImportada[] = [];
  const usados = new Set<string>();
  for (const t of tareas) {
    const uid = txt(t, 'UID');
    if (uid === '0' || txt(t, 'Active') === '0' || txt(t, 'IsNull') === '1') continue;
    if (txt(t, 'Name') === '' && !hijo(t, 'Duration')) continue;
    let id = txt(t, 'ID') || uid;
    if (usados.has(id)) id = `U${uid}`;
    usados.add(id);
    idPorUid.set(uid, id);
    const resumen = txt(t, 'Summary') === '1';
    const horas = horasIso(txt(t, 'Duration'));
    const dias = redondear(horas / (minDia / 60));
    const hito = txt(t, 'Milestone') === '1' || (!resumen && dias === 0);
    const a: ActividadImportada = {
      id,
      nombre: txt(t, 'Name') || id,
      wbs: txt(t, 'WBS') || txt(t, 'OutlineNumber'),
      tipo: resumen ? 'Resumen' : hito ? 'Hito' : 'Tarea',
      duracion: hito ? 0 : dias,
    };
    const calUid = txt(t, 'CalendarUID');
    if (calUid && calUid !== '-1') {
      const cal = porUid.get(calUid) ?? (() => {
        const n = nodosCal.find((c) => txt(c, 'UID') === calUid);
        if (!n) return undefined;
        const c = leerCal(n);
        if (!calendarios.includes(c)) calendarios.push(c);
        return c;
      })();
      if (cal && cal.nombre !== calProyecto) a.calendario = cal.nombre;
    }
    const ct = txt(t, 'ConstraintType');
    if (ct && RESTRICCION_MSP[ct]) {
      const f = serieIso(txt(t, 'ConstraintDate'));
      if (f !== null) {
        a.restriccion = RESTRICCION_MSP[ct];
        a.fechaRestriccion = f;
      }
    } else if (ct === '1') avisos.push(`«${a.nombre}»: «lo más tarde posible» no se usa; se calcula lo antes posible.`);
    actividades.push(a);
  }

  // Vínculos.
  const relaciones: RelacionImportada[] = [];
  for (const t of tareas) {
    const suc = idPorUid.get(txt(t, 'UID'));
    if (!suc) continue;
    for (const l of hijos(t, 'PredecessorLink')) {
      const pred = idPorUid.get(txt(l, 'PredecessorUID'));
      if (!pred) {
        if (txt(l, 'CrossProject') === '1') avisos.push(`«${suc}»: un vínculo con otro proyecto no se importa.`);
        continue;
      }
      const tipo = TIPO_MSP[txt(l, 'Type') || '1'] ?? 'FC';
      const lag = Number(txt(l, 'LinkLag') || 0) / 10; // décimas de minuto → minutos
      const formato = Number(txt(l, 'LagFormat') || 7);
      const transcurrido = [4, 6, 8, 10, 12].includes(formato);
      if (formato === 19 || formato === 20) {
        avisos.push(`El vínculo ${pred} → ${suc} tiene un desfase en porcentaje: se importa sin desfase.`);
        relaciones.push({ predecesora: pred, sucesora: suc, tipo, desfase: 0, calendario: false });
        continue;
      }
      const desfase = redondear(transcurrido ? lag / 1440 : lag / minDia);
      relaciones.push({ predecesora: pred, sucesora: suc, tipo, desfase, calendario: transcurrido });
    }
  }
  avisarResumenes(actividades, relaciones, avisos);
  return { formato: 'MS Project XML', nombre: txt(proyecto, 'Title') || txt(proyecto, 'Name'), inicio, calendarioProyecto: calProyecto, calendarios, actividades, relaciones, avisos };
}

function avisarResumenes(actividades: ActividadImportada[], relaciones: RelacionImportada[], avisos: string[]): void {
  const resumen = new Set(actividades.filter((a) => a.tipo === 'Resumen').map((a) => a.id));
  const tocadas = relaciones.filter((r) => resumen.has(r.predecesora) || resumen.has(r.sucesora));
  if (tocadas.length) avisos.push(`${tocadas.length} ${tocadas.length === 1 ? 'vínculo toca' : 'vínculos tocan'} actividades resumen: no se usan en el cálculo (${tocadas.slice(0, 5).map((r) => `${r.predecesora} → ${r.sucesora}`).join(', ')}).`);
}

// ------------------------------------------------------------- Primavera P6 XER

const TIPO_XER: Record<string, RelacionImportada['tipo']> = { PR_FS: 'FC', PR_SS: 'CC', PR_FF: 'FF', PR_SF: 'CF' };
const RESTRICCION_XER: Record<string, string> = {
  CS_MSO: 'Debe comenzar el', CS_MANDSTART: 'Debe comenzar el', CS_MEO: 'Debe terminar el', CS_MANDFIN: 'Debe terminar el',
  CS_MSOA: 'No comenzar antes de', CS_MSOB: 'No comenzar después de', CS_MEOA: 'No terminar antes de', CS_MEOB: 'No terminar después de',
};

/** Las tablas de un XER: nombre → filas como objetos campo → valor. */
export function leerXer(texto: string): Map<string, Record<string, string>[]> {
  const tablas = new Map<string, Record<string, string>[]>();
  let actual: Record<string, string>[] | null = null;
  let campos: string[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const partes = linea.split('\t');
    if (partes[0] === '%T') {
      actual = [];
      tablas.set(partes[1] ?? '', actual);
    } else if (partes[0] === '%F') campos = partes.slice(1);
    else if (partes[0] === '%R' && actual) {
      const fila: Record<string, string> = {};
      campos.forEach((c, i) => { fila[c] = partes[i + 1] ?? ''; });
      actual.push(fila);
    }
  }
  return tablas;
}

/** Días laborables y excepciones del campo clndr_data de P6. */
export function calendarioXer(nombre: string, datos: string): CalendarioImportado {
  const d = datos.replace(/[\s\u007f]/g, '');
  const cal: CalendarioImportado = { nombre, laborables: [true, true, true, true, true, false, false], festivos: [], trabajados: [] };
  const iDias = d.indexOf('DaysOfWeek()(');
  const iExc = d.indexOf('Exceptions()(');
  if (iDias >= 0) {
    const seccion = d.slice(iDias, iExc > iDias ? iExc : undefined);
    for (let n = 1; n <= 7; n++) {
      const desde = seccion.indexOf(`(0||${n}()(`);
      if (desde < 0) continue;
      const hasta = n < 7 ? seccion.indexOf(`(0||${n + 1}()(`, desde) : -1;
      const trozo = seccion.slice(desde, hasta > desde ? hasta : undefined);
      cal.laborables[(n + 5) % 7] = trozo.includes('s|');
    }
  }
  if (iExc >= 0) {
    const piezas = d.slice(iExc).split('(d|').slice(1);
    for (const p of piezas) {
      const num = /^(\d+)/.exec(p);
      if (!num) continue;
      const serie = Number(num[1]);
      (p.includes('s|') ? cal.trabajados : cal.festivos).push(serie);
    }
  }
  return cal;
}

export function importarXer(texto: string): CronogramaImportado {
  const tablas = leerXer(texto);
  const tareas = tablas.get('TASK');
  if (!tareas) throw new Error('El archivo no es un XER de Primavera (falta la tabla TASK)');
  const avisos: string[] = [];
  const proyectos = tablas.get('PROJECT') ?? [];
  if (proyectos.length > 1) avisos.push(`El XER trae ${proyectos.length} proyectos: se importan todas sus actividades juntas.`);
  const proyecto = proyectos[0];
  const inicio = serieIso(proyecto?.plan_start_date ?? '') ?? serieIso(proyecto?.last_recalc_date ?? '');
  if (inicio === null) throw new Error('El XER no trae la fecha de inicio del proyecto (PROJECT.plan_start_date)');

  const horasDia = new Map<string, number>();
  const nombreCal = new Map<string, string>();
  const calendarios: CalendarioImportado[] = [];
  for (const c of tablas.get('CALENDAR') ?? []) {
    const cal = calendarioXer(c.clndr_name || `Calendario ${c.clndr_id}`, c.clndr_data ?? '');
    calendarios.push(cal);
    nombreCal.set(c.clndr_id ?? '', cal.nombre);
    horasDia.set(c.clndr_id ?? '', Number(c.day_hr_cnt) || 8);
  }
  if (calendarios.length === 0) {
    calendarios.push({ nombre: 'Lunes a viernes', laborables: [true, true, true, true, true, false, false], festivos: [], trabajados: [] });
    avisos.push('El XER no trae calendarios: se usa lunes a viernes sin festivos.');
  }
  const calDefecto = (tablas.get('CALENDAR') ?? []).find((c) => c.default_flag === 'Y')?.clndr_id;
  const calProyecto = nombreCal.get(proyecto?.clndr_id ?? '') ?? nombreCal.get(calDefecto ?? '') ?? (calendarios[0] as CalendarioImportado).nombre;

  // WBS: el código completo desde la raíz.
  const wbs = new Map<string, { codigo: string; padre: string }>();
  for (const w of tablas.get('PROJWBS') ?? []) wbs.set(w.wbs_id ?? '', { codigo: w.wbs_short_name ?? '', padre: w.parent_wbs_id ?? '' });
  const codigoWbs = (id: string): string => {
    const partes: string[] = [];
    let x = wbs.get(id);
    for (let k = 0; x && k < 30; k++) {
      partes.unshift(x.codigo);
      x = wbs.get(x.padre);
    }
    return partes.slice(1).join('.') || partes.join('.');
  };

  const idPorTarea = new Map<string, string>();
  const actividades: ActividadImportada[] = [];
  const usados = new Set<string>();
  for (const t of tareas) {
    const tipoXer = t.task_type ?? 'TT_Task';
    if (tipoXer === 'TT_LOE') {
      avisos.push(`«${t.task_name}» es de nivel de esfuerzo: no se importa (no empuja la red).`);
      continue;
    }
    let id = t.task_code || t.task_id || '';
    if (usados.has(id)) id = `${id}-${t.task_id}`;
    usados.add(id);
    idPorTarea.set(t.task_id ?? '', id);
    const hd = horasDia.get(t.clndr_id ?? '') ?? 8;
    const hito = tipoXer === 'TT_Mile' || tipoXer === 'TT_FinMile';
    const a: ActividadImportada = {
      id,
      nombre: t.task_name || id,
      wbs: codigoWbs(t.wbs_id ?? ''),
      tipo: tipoXer === 'TT_WBS' ? 'Resumen' : hito ? 'Hito' : 'Tarea',
      duracion: hito ? 0 : redondear(Number(t.target_drtn_hr_cnt || 0) / hd),
    };
    const cal = nombreCal.get(t.clndr_id ?? '');
    if (cal && cal !== calProyecto) a.calendario = cal;
    const r = RESTRICCION_XER[t.cstr_type ?? ''];
    if (r) {
      const f = serieIso(t.cstr_date ?? '');
      if (f !== null) {
        a.restriccion = r;
        a.fechaRestriccion = f;
      }
    } else if (t.cstr_type === 'CS_ALAP') avisos.push(`«${a.nombre}»: «lo más tarde posible» no se usa; se calcula lo antes posible.`);
    actividades.push(a);
  }
  const relaciones: RelacionImportada[] = [];
  for (const p of tablas.get('TASKPRED') ?? []) {
    const suc = idPorTarea.get(p.task_id ?? '');
    const pred = idPorTarea.get(p.pred_task_id ?? '');
    if (!suc || !pred) continue;
    const t = tareas.find((x) => x.task_id === p.task_id);
    const hd = horasDia.get(t?.clndr_id ?? '') ?? 8;
    relaciones.push({ predecesora: pred, sucesora: suc, tipo: TIPO_XER[p.pred_type ?? ''] ?? 'FC', desfase: redondear(Number(p.lag_hr_cnt || 0) / hd), calendario: false });
  }
  avisarResumenes(actividades, relaciones, avisos);
  return { formato: 'Primavera P6 XER', nombre: proyecto?.proj_short_name ?? '', inicio, calendarioProyecto: calProyecto, calendarios, actividades, relaciones, avisos };
}

/** Por el contenido: XML de MS Project o XER de Primavera. */
export function importarCronograma(texto: string): CronogramaImportado {
  const t = texto.replace(/^\uFEFF/, '');
  if (/^\s*</.test(t)) return importarMsProject(t);
  if (/^ERMHDR|^%T/m.test(t)) return importarXer(t);
  throw new Error('No se reconoce el archivo: tiene que ser un XML de MS Project o un XER de Primavera P6');
}

// ------------------------------------------------------------- a las hojas

const SI_NO = (b: boolean) => (b ? 'Sí' : 'No');

/**
 * Las hojas del libro de cronograma con el cronograma importado: Actividades,
 * Relaciones y Calendario llenas; las demás (incertidumbre, riesgos, costos…)
 * vacías, con sus encabezados, listas para completar.
 */
export function hojasImportadas(c: CronogramaImportado): HojaNueva[] {
  const base = hojasNuevasCronograma(c.inicio);
  const excepciones: Celda[][] = [];
  for (const cal of c.calendarios) {
    for (const f of cal.festivos) excepciones.push([f, 'No laborable (importado)', c.calendarios.length > 1 ? cal.nombre : '', 'Festivo']);
    for (const f of cal.trabajados) excepciones.push([f, 'Laborable (importado)', c.calendarios.length > 1 ? cal.nombre : '', 'Laborable']);
  }
  return base.map((h) => {
    if (h.nombre === HOJAS_CRONOGRAMA.config) {
      return {
        ...h,
        valores: h.valores.map((f) => {
          if (f[0] === 'Fecha meta' || f[0] === 'Costo meta') return [f[0], null, f[2] ?? null];
          if (f[0] === 'Calendario del proyecto') return [f[0], c.calendarioProyecto, f[2] ?? null];
          return [...f];
        }),
      };
    }
    if (h.nombre === HOJAS_CRONOGRAMA.calendario) {
      const filas: Celda[][] = [[...COLUMNAS.calendarios, null, ...COLUMNAS.excepciones]];
      for (let i = 0; i < Math.max(c.calendarios.length, excepciones.length); i++) {
        const cal = c.calendarios[i];
        const izq: Celda[] = cal ? [cal.nombre, ...cal.laborables.map(SI_NO)] : [null, null, null, null, null, null, null, null];
        const ex = excepciones[i] ?? [null, null, null, null];
        filas.push([...izq, null, ...ex]);
      }
      return { ...h, valores: filas, formatos: { [COLUMNA_EXCEPCIONES]: h.formatos?.[COLUMNA_EXCEPCIONES] ?? 'dd/mm/yyyy' } };
    }
    if (h.nombre === HOJAS_CRONOGRAMA.actividades) {
      return {
        ...h,
        valores: [h.valores[0] as Celda[], ...c.actividades.map((a) => [a.id, a.nombre, a.wbs, a.tipo, a.duracion, a.calendario ?? '', a.restriccion ?? '', a.fechaRestriccion ?? null, 'No', ''] as Celda[])],
      };
    }
    if (h.nombre === HOJAS_CRONOGRAMA.relaciones) {
      return {
        ...h,
        valores: [h.valores[0] as Celda[], ...c.relaciones.map((r) => [r.predecesora, r.sucesora, r.tipo, r.desfase, r.calendario ? 'Calendario' : 'Laborables'] as Celda[])],
      };
    }
    // Incertidumbre, riesgos, impactos, costos, correlaciones y ramas: vacías, para completar.
    return { ...h, valores: [h.valores[0] as Celda[]] };
  });
}

/** Las hojas que reemplaza una importación en un libro que ya tiene el cronograma. */
export const HOJAS_QUE_IMPORTA = [HOJAS_CRONOGRAMA.actividades, HOJAS_CRONOGRAMA.relaciones, HOJAS_CRONOGRAMA.calendario] as const;
