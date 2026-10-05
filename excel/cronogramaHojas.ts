/**
 * Las hojas del libro de cronograma (QRSA, Q1.1–Q1.2): qué columnas tiene
 * cada una, el ejemplo con que se crean y la lectura con validación. Sin
 * Office.js: recibe los valores de cada hoja como una matriz (la de
 * `range.values`, desde A1) y devuelve el modelo o los errores, cada uno con
 * su hoja, fila, columna y causa.
 *
 * Las columnas se encuentran por su encabezado (fila 1), así que el usuario
 * puede reordenarlas o añadir las suyas.
 */

import {
  construirDistribucion, festivosColombiaEntre, LUNES_A_VIERNES,
  type ActividadRed, type ConfiguracionCronograma, type DefinicionCalendario, type DistribucionDuracion,
  type IncertidumbreActividad, type ModeloCronograma, type Predecesora, type RiesgoCronograma, type TipoRelacion,
  type TipoRestriccion, CONFIGURACION_POR_DEFECTO,
} from '../engine/cronograma/index.ts';
import { fechaDeSerie, serieDeFecha } from '../engine/modelo/fechas.ts';

export const HOJAS_CRONOGRAMA = {
  config: 'Config',
  calendario: 'Calendario',
  actividades: 'Actividades',
  relaciones: 'Relaciones',
  incertidumbre: 'Incertidumbre',
  riesgos: 'Riesgos',
  impactos: 'Impactos',
} as const;
export const HOJA_RESULTADOS = 'Resultados_Cronograma';

export type Celda = string | number | boolean | null;
export type MatrizHoja = readonly (readonly unknown[])[];

export interface ErrorHoja {
  hoja: string;
  /** Fila de Excel (1 = encabezado). */
  fila: number;
  /** Letra de la columna ('' si es de la hoja entera). */
  columna: string;
  mensaje: string;
}

export interface LecturaCronograma {
  modelo: ModeloCronograma | null;
  errores: ErrorHoja[];
  avisos: string[];
}

// ------------------------------------------------------------- encabezados

export const COLUMNAS = {
  calendarios: ['Calendario', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  excepciones: ['Fecha', 'Descripción', 'Calendario', 'Tipo'],
  actividades: ['ID', 'Nombre', 'WBS', 'Tipo', 'Duración (días)', 'Calendario', 'Restricción', 'Fecha de la restricción', 'Excluir de la simulación'],
  relaciones: ['Predecesora', 'Sucesora', 'Tipo', 'Desfase (días)', 'Unidad del desfase'],
  incertidumbre: ['Actividad', 'Distribución', 'Mínimo o P10', 'Más probable', 'Máximo o P90', 'Unidad', 'Lambda (PERT)'],
  riesgos: ['ID', 'Descripción', 'Causa', 'Consecuencia', 'Dueño', 'Categoría', 'Probabilidad', 'Estado'],
  impactos: ['Riesgo', 'Actividad', 'Distribución', 'Mínimo (días)', 'Más probable (días)', 'Máximo (días)'],
} as const;

/** La tabla de excepciones del calendario empieza en la columna J. */
export const COLUMNA_EXCEPCIONES = 9;

export const LISTAS = {
  tipoActividad: ['Tarea', 'Hito', 'Resumen'],
  restriccion: ['No comenzar antes de', 'No terminar antes de', 'No comenzar después de', 'No terminar después de', 'Debe comenzar el', 'Debe terminar el'],
  tipoRelacion: ['FC', 'CC', 'FF', 'CF'],
  unidadDesfase: ['Laborables', 'Calendario'],
  distribucion: ['Triangular', 'PERT', 'Trigen', 'Uniforme', 'Lognormal'],
  distribucionImpacto: ['Triangular', 'PERT', 'Uniforme', 'Fija'],
  unidad: ['Días', '% de la base'],
  siNo: ['Sí', 'No'],
  estadoRiesgo: ['Activo', 'Cerrado'],
  muestreo: ['Hipercubo latino', 'Monte Carlo'],
  redondeo: ['Al día', 'Con decimales'],
  duras: ['Respetar', 'Ignorar'],
} as const;

const CODIGO_RESTRICCION: Record<string, TipoRestriccion> = {
  'no comenzar antes de': 'SNET', snet: 'SNET',
  'no terminar antes de': 'FNET', fnet: 'FNET',
  'no comenzar despues de': 'SNLT', snlt: 'SNLT',
  'no terminar despues de': 'FNLT', fnlt: 'FNLT',
  'debe comenzar el': 'MSO', mso: 'MSO',
  'debe terminar el': 'MFO', mfo: 'MFO',
};
const CODIGO_RELACION: Record<string, TipoRelacion> = {
  fc: 'FC', fs: 'FC', 'fin-comienzo': 'FC', 'fin comienzo': 'FC',
  cc: 'CC', ss: 'CC', 'comienzo-comienzo': 'CC', 'comienzo comienzo': 'CC',
  ff: 'FF', 'fin-fin': 'FF', 'fin fin': 'FF',
  cf: 'CF', sf: 'CF', 'comienzo-fin': 'CF', 'comienzo fin': 'CF',
};

export const ETIQUETAS_CONFIG = {
  inicio: 'Fecha de inicio',
  calendario: 'Calendario del proyecto',
  iteraciones: 'Iteraciones',
  semilla: 'Semilla',
  muestreo: 'Muestreo',
  redondeo: 'Duraciones simuladas',
  duras: 'Restricciones duras en la simulación',
  meta: 'Fecha meta',
  hitos: 'Hitos a seguir',
} as const;

// ------------------------------------------------------------- utilidades

export function normalizar(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function letraColumna(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function vacia(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function texto(v: unknown): string {
  return vacia(v) ? '' : String(v).trim();
}

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const t = v.trim().replace(/\s/g, '');
    const porc = t.endsWith('%');
    const limpio = (porc ? t.slice(0, -1) : t).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const x = Number(limpio);
    if (!Number.isFinite(x)) return null;
    return porc ? x / 100 : x;
  }
  return null;
}

/** Fecha de una celda: número de serie, o texto dd/mm/aaaa o aaaa-mm-dd. */
export function fechaDeCelda(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
  const t = texto(v);
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return serieDeFecha(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return serieDeFecha(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function siNo(v: unknown, porDefecto: boolean): boolean {
  if (typeof v === 'boolean') return v;
  const t = normalizar(v);
  if (t === '') return porDefecto;
  return ['si', 's', 'x', 'verdadero', 'true', '1', 'yes'].includes(t);
}

/** Proporción: 0,35 o 35 (%). */
function proporcion(v: unknown): number | null {
  const x = numero(v);
  if (x === null) return null;
  return x > 1 && x <= 100 ? x / 100 : x;
}

interface Tabla {
  hoja: string;
  /** Índice de columna por clave normalizada del encabezado. */
  col: Map<string, number>;
  filas: { fila: number; valores: readonly unknown[] }[];
}

/** Lee una tabla con encabezado en la fila 1, desde la columna `desde` (hasta la primera columna vacía). */
function tabla(hoja: string, m: MatrizHoja | undefined, esperadas: readonly string[], desde = 0): Tabla {
  const col = new Map<string, number>();
  const filas: { fila: number; valores: readonly unknown[] }[] = [];
  if (!m || m.length === 0) return { hoja, col, filas };
  const enc = m[0] ?? [];
  let fin = desde;
  while (fin < enc.length && !vacia(enc[fin])) fin++;
  for (let c = desde; c < fin; c++) {
    const h = normalizar(enc[c]);
    for (const e of esperadas) {
      const ne = normalizar(e);
      if (!col.has(ne) && (h === ne || h.startsWith(ne.split(' (')[0] as string))) col.set(ne, c);
    }
  }
  for (let f = 1; f < m.length; f++) {
    const fila = m[f] ?? [];
    let alguna = false;
    for (let c = desde; c < fin; c++) if (!vacia(fila[c])) alguna = true;
    if (alguna) filas.push({ fila: f + 1, valores: fila });
  }
  return { hoja, col, filas };
}

function valor(t: Tabla, fila: readonly unknown[], clave: string): unknown {
  const c = t.col.get(normalizar(clave));
  return c === undefined ? undefined : fila[c];
}

function letra(t: Tabla, clave: string): string {
  const c = t.col.get(normalizar(clave));
  return c === undefined ? '' : letraColumna(c);
}

// ------------------------------------------------------------- lectura

const MAX_ERRORES = 60;

export function leerCronograma(hojas: Readonly<Record<string, MatrizHoja | undefined>>): LecturaCronograma {
  const errores: ErrorHoja[] = [];
  const avisos: string[] = [];
  const error = (hoja: string, fila: number, columna: string, mensaje: string) => {
    if (errores.length < MAX_ERRORES) errores.push({ hoja, fila, columna, mensaje });
  };
  const H = HOJAS_CRONOGRAMA;
  for (const nombre of [H.actividades]) {
    if (!hojas[nombre]) error(nombre, 0, '', `Falta la hoja «${nombre}». Use «Crear libro de cronograma» para generarla.`);
  }
  if (errores.length) return { modelo: null, errores, avisos };

  // Config (pares etiqueta–valor en las columnas A y B).
  const cfg = new Map<string, { v: unknown; fila: number }>();
  (hojas[H.config] ?? []).forEach((f, i) => {
    if (!vacia(f[0])) cfg.set(normalizar(f[0]), { v: f[1], fila: i + 1 });
  });
  const leerCfg = (k: keyof typeof ETIQUETAS_CONFIG) => cfg.get(normalizar(ETIQUETAS_CONFIG[k]));
  const inicioCfg = leerCfg('inicio');
  let inicio = inicioCfg ? fechaDeCelda(inicioCfg.v) : null;
  if (inicio === null) {
    if (inicioCfg) error(H.config, inicioCfg.fila, 'B', 'La fecha de inicio no es una fecha válida');
    else error(H.config, 0, '', `Falta «${ETIQUETAS_CONFIG.inicio}» en la hoja Config`);
    inicio = serieDeFecha(2027, 1, 4);
  }
  const configuracion: ConfiguracionCronograma = { ...CONFIGURACION_POR_DEFECTO };
  const it = leerCfg('iteraciones');
  if (it && !vacia(it.v)) {
    const x = numero(it.v);
    if (x === null || !Number.isInteger(x) || x < 100 || x > 1_000_000) error(H.config, it.fila, 'B', 'Las iteraciones tienen que ser un número entero entre 100 y 1.000.000');
    else configuracion.iteraciones = x;
  }
  const se = leerCfg('semilla');
  if (se && !vacia(se.v)) {
    const x = numero(se.v);
    if (x === null || !Number.isInteger(x) || x < 0) error(H.config, se.fila, 'B', 'La semilla tiene que ser un número entero positivo');
    else configuracion.semilla = x;
  }
  const mu = leerCfg('muestreo');
  if (mu && !vacia(mu.v)) configuracion.metodo = normalizar(mu.v).startsWith('monte') ? 'monte-carlo' : 'lhs';
  const re = leerCfg('redondeo');
  if (re && !vacia(re.v)) configuracion.redondeo = normalizar(re.v).includes('decimal') ? 'decimal' : 'entero';
  const du = leerCfg('duras');
  if (du && !vacia(du.v)) configuracion.ignorarRestriccionesDuras = normalizar(du.v).startsWith('ignorar');
  const me = leerCfg('meta');
  if (me && !vacia(me.v)) {
    const f = fechaDeCelda(me.v);
    if (f === null) error(H.config, me.fila, 'B', 'La fecha meta no es una fecha válida');
    else configuracion.fechaMeta = f;
  }
  const hi = leerCfg('hitos');
  if (hi && !vacia(hi.v)) configuracion.hitos = texto(hi.v).split(/[,;]/).map((s) => s.trim()).filter(Boolean);

  // Calendarios.
  const anio = fechaDeSerie(inicio).anio;
  const calendarios: DefinicionCalendario[] = [];
  const tc = tabla(H.calendario, hojas[H.calendario], COLUMNAS.calendarios);
  const dias = COLUMNAS.calendarios.slice(1);
  for (const { fila, valores } of tc.filas) {
    const id = texto(valor(tc, valores, 'Calendario'));
    if (!id) { error(H.calendario, fila, 'A', 'Falta el nombre del calendario'); continue; }
    if (calendarios.some((c) => normalizar(c.id) === normalizar(id))) { error(H.calendario, fila, 'A', `El calendario «${id}» está repetido`); continue; }
    const laborables = dias.map((d) => siNo(valor(tc, valores, d), false));
    if (!laborables.some(Boolean)) { error(H.calendario, fila, 'B', `El calendario «${id}» no tiene ningún día laborable`); continue; }
    calendarios.push({ id, nombre: id, laborables, festivos: [], trabajados: [] });
  }
  if (!hojas[H.calendario]) {
    // Sin hoja: lunes a viernes con los festivos de Colombia de diez años.
    calendarios.push({ id: 'Lunes a viernes', laborables: LUNES_A_VIERNES, festivos: festivosColombiaEntre(anio, anio + 10).map((f) => f.dia) });
    avisos.push('No hay hoja Calendario: se usa lunes a viernes con los festivos de Colombia.');
  } else if (calendarios.length === 0) {
    error(H.calendario, 2, 'A', 'No hay ningún calendario definido');
  }
  const te = tabla(H.calendario, hojas[H.calendario], COLUMNAS.excepciones, COLUMNA_EXCEPCIONES);
  for (const { fila, valores } of te.filas) {
    const f = fechaDeCelda(valor(te, valores, 'Fecha'));
    if (f === null) { error(H.calendario, fila, letra(te, 'Fecha'), 'La fecha de la excepción no es válida'); continue; }
    const cal = texto(valor(te, valores, 'Calendario'));
    const laborable = normalizar(valor(te, valores, 'Tipo')).startsWith('laborable');
    const destino = cal ? calendarios.filter((c) => normalizar(c.id) === normalizar(cal)) : calendarios;
    if (cal && destino.length === 0) { error(H.calendario, fila, letra(te, 'Calendario'), `El calendario «${cal}» no existe`); continue; }
    for (const c of destino) ((laborable ? c.trabajados : c.festivos) as number[]).push(f);
  }

  const cfgCal = leerCfg('calendario');
  let calendarioProyecto = calendarios[0]?.id;
  if (cfgCal && !vacia(cfgCal.v)) {
    const c = calendarios.find((x) => normalizar(x.id) === normalizar(cfgCal.v));
    if (!c) error(H.config, cfgCal.fila, 'B', `El calendario «${texto(cfgCal.v)}» no existe en la hoja Calendario`);
    else calendarioProyecto = c.id;
  }
  const idCal = (v: unknown) => calendarios.find((c) => normalizar(c.id) === normalizar(v))?.id;

  // Actividades.
  const ta = tabla(H.actividades, hojas[H.actividades], COLUMNAS.actividades);
  const actividades: (ActividadRed & { predecesoras: Predecesora[] })[] = [];
  const resumen = new Set<string>();
  const excluidas = new Set<string>();
  // Las filas con un error siguen contando como IDs conocidos: así una
  // actividad mal escrita no arrastra errores en cada relación que la nombra.
  const invalidas = new Set<string>();
  const vistos = new Map<string, number>();
  for (const { fila, valores } of ta.filas) {
    const id = texto(valor(ta, valores, 'ID'));
    if (!id) { error(H.actividades, fila, letra(ta, 'ID'), 'Falta el ID'); continue; }
    const clave = normalizar(id);
    if (vistos.has(clave)) { error(H.actividades, fila, letra(ta, 'ID'), `El ID «${id}» ya está en la fila ${vistos.get(clave)}`); continue; }
    vistos.set(clave, fila);
    const tipo = normalizar(valor(ta, valores, 'Tipo'));
    if (tipo.startsWith('resumen')) { resumen.add(id); invalidas.add(clave); continue; }
    const esHito = tipo.startsWith('hito');
    let duracion = numero(valor(ta, valores, 'Duración (días)'));
    if (esHito) {
      if (duracion !== null && duracion !== 0) avisos.push(`${H.actividades}, fila ${fila}: «${id}» es un hito; se toma con duración 0.`);
      duracion = 0;
    } else if (duracion === null || duracion < 0) {
      error(H.actividades, fila, letra(ta, 'Duración (días)'), 'La duración tiene que ser un número mayor o igual que 0');
      invalidas.add(clave);
      continue;
    }
    const calTxt = valor(ta, valores, 'Calendario');
    let calendario: string | undefined;
    if (!vacia(calTxt)) {
      calendario = idCal(calTxt);
      if (!calendario) { error(H.actividades, fila, letra(ta, 'Calendario'), `El calendario «${texto(calTxt)}» no existe en la hoja Calendario`); invalidas.add(clave); continue; }
    }
    let restriccion: ActividadRed['restriccion'];
    const rTxt = valor(ta, valores, 'Restricción');
    if (!vacia(rTxt) && !normalizar(rTxt).startsWith('lo antes')) {
      const tr = CODIGO_RESTRICCION[normalizar(rTxt)];
      const f = fechaDeCelda(valor(ta, valores, 'Fecha de la restricción'));
      if (!tr) { error(H.actividades, fila, letra(ta, 'Restricción'), `Restricción desconocida «${texto(rTxt)}»`); invalidas.add(clave); continue; }
      if (f === null) { error(H.actividades, fila, letra(ta, 'Fecha de la restricción'), 'La restricción necesita una fecha válida'); invalidas.add(clave); continue; }
      restriccion = { tipo: tr, fecha: f };
    }
    if (siNo(valor(ta, valores, 'Excluir de la simulación'), false)) excluidas.add(id);
    actividades.push({ id, nombre: texto(valor(ta, valores, 'Nombre')) || id, duracion, calendario, restriccion, predecesoras: [] });
  }
  if (ta.filas.length === 0) error(H.actividades, 2, '', 'No hay actividades');
  const porId = new Map(actividades.map((a) => [normalizar(a.id), a]));

  // Relaciones.
  const tr = tabla(H.relaciones, hojas[H.relaciones], COLUMNAS.relaciones);
  for (const { fila, valores } of tr.filas) {
    const p = texto(valor(tr, valores, 'Predecesora'));
    const s = texto(valor(tr, valores, 'Sucesora'));
    if (resumen.has(p) || resumen.has(s)) {
      avisos.push(`${H.relaciones}, fila ${fila}: la relación ${p} → ${s} toca una actividad resumen y no se usa.`);
      continue;
    }
    if (invalidas.has(normalizar(p)) || invalidas.has(normalizar(s))) continue;
    const ap = porId.get(normalizar(p));
    const asuc = porId.get(normalizar(s));
    if (!ap) { error(H.relaciones, fila, letra(tr, 'Predecesora'), p ? `La actividad «${p}» no existe` : 'Falta la predecesora'); continue; }
    if (!asuc) { error(H.relaciones, fila, letra(tr, 'Sucesora'), s ? `La actividad «${s}» no existe` : 'Falta la sucesora'); continue; }
    const tTxt = valor(tr, valores, 'Tipo');
    const tipo = vacia(tTxt) ? 'FC' : CODIGO_RELACION[normalizar(tTxt)];
    if (!tipo) { error(H.relaciones, fila, letra(tr, 'Tipo'), `Tipo de relación desconocido «${texto(tTxt)}» (FC, CC, FF o CF)`); continue; }
    const dTxt = valor(tr, valores, 'Desfase (días)');
    const desfase = vacia(dTxt) ? 0 : numero(dTxt);
    if (desfase === null) { error(H.relaciones, fila, letra(tr, 'Desfase (días)'), 'El desfase no es un número'); continue; }
    const transcurrido = normalizar(valor(tr, valores, 'Unidad del desfase')).startsWith('calendario');
    asuc.predecesoras.push({ id: ap.id, tipo, desfase, transcurrido });
  }

  // Incertidumbre.
  const ti = tabla(H.incertidumbre, hojas[H.incertidumbre], COLUMNAS.incertidumbre);
  const incertidumbre: IncertidumbreActividad[] = [];
  const conInc = new Set<string>();
  for (const { fila, valores } of ti.filas) {
    const id = texto(valor(ti, valores, 'Actividad'));
    if (invalidas.has(normalizar(id))) continue;
    const a = porId.get(normalizar(id));
    if (!a) { error(H.incertidumbre, fila, letra(ti, 'Actividad'), id ? `La actividad «${id}» no existe` : 'Falta la actividad'); continue; }
    if (conInc.has(a.id)) { error(H.incertidumbre, fila, letra(ti, 'Actividad'), `«${a.id}» ya tiene una distribución más arriba`); continue; }
    conInc.add(a.id);
    if (excluidas.has(a.id)) continue;
    if (a.duracion === 0) { avisos.push(`${H.incertidumbre}, fila ${fila}: «${a.id}» es un hito; su incertidumbre no se usa.`); continue; }
    const relativa = normalizar(valor(ti, valores, 'Unidad')).startsWith('%');
    let x1 = numero(valor(ti, valores, 'Mínimo o P10'));
    let x2 = numero(valor(ti, valores, 'Más probable'));
    let x3 = numero(valor(ti, valores, 'Máximo o P90'));
    if (relativa && [x1, x2, x3].some((x) => x !== null && x > 5)) {
      x1 = x1 === null ? null : x1 / 100;
      x2 = x2 === null ? null : x2 / 100;
      x3 = x3 === null ? null : x3 / 100;
    }
    const nd = normalizar(valor(ti, valores, 'Distribución') || 'triangular');
    const lambda = numero(valor(ti, valores, 'Lambda (PERT)'));
    const d = distribucionDeFila(nd, x1, x2, x3, lambda ?? undefined);
    if (typeof d === 'string') { error(H.incertidumbre, fila, letra(ti, d.startsWith('Distribución') ? 'Distribución' : 'Mínimo o P10'), d); continue; }
    try {
      construirDistribucion(d, relativa ? a.duracion : 1);
    } catch (e) {
      error(H.incertidumbre, fila, letra(ti, 'Mínimo o P10'), (e as Error).message);
      continue;
    }
    incertidumbre.push({ actividad: a.id, distribucion: d, relativa });
  }

  // Riesgos e impactos.
  const tk = tabla(H.riesgos, hojas[H.riesgos], COLUMNAS.riesgos);
  const riesgos: (RiesgoCronograma & { impactos: RiesgoCronograma['impactos'][number][] })[] = [];
  const cerrados = new Set<string>();
  const idsRiesgo = new Set<string>();
  for (const { fila, valores } of tk.filas) {
    const id = texto(valor(tk, valores, 'ID'));
    if (!id) { error(H.riesgos, fila, letra(tk, 'ID'), 'Falta el ID del riesgo'); continue; }
    if (idsRiesgo.has(normalizar(id))) { error(H.riesgos, fila, letra(tk, 'ID'), `El riesgo «${id}» está repetido`); continue; }
    idsRiesgo.add(normalizar(id));
    if (normalizar(valor(tk, valores, 'Estado')).startsWith('cerrado')) { cerrados.add(normalizar(id)); continue; }
    const p = proporcion(valor(tk, valores, 'Probabilidad'));
    if (p === null || p < 0 || p > 1) {
      error(H.riesgos, fila, letra(tk, 'Probabilidad'), 'La probabilidad tiene que estar entre 0 y 1 (o entre 0 % y 100 %)');
      cerrados.add(normalizar(id));
      continue;
    }
    riesgos.push({ id, nombre: texto(valor(tk, valores, 'Descripción')) || id, probabilidad: p, impactos: [] });
  }
  const porRiesgo = new Map(riesgos.map((r) => [normalizar(r.id), r]));
  const tm = tabla(H.impactos, hojas[H.impactos], COLUMNAS.impactos);
  const conFilas = new Set<string>();
  for (const { fila, valores } of tm.filas) {
    const rid = texto(valor(tm, valores, 'Riesgo'));
    if (cerrados.has(normalizar(rid))) continue;
    const r = porRiesgo.get(normalizar(rid));
    if (r) conFilas.add(r.id);
    if (!r) { error(H.impactos, fila, letra(tm, 'Riesgo'), rid ? `El riesgo «${rid}» no existe en la hoja Riesgos` : 'Falta el riesgo'); continue; }
    const aid = texto(valor(tm, valores, 'Actividad'));
    if (invalidas.has(normalizar(aid))) continue;
    const a = porId.get(normalizar(aid));
    if (!a) { error(H.impactos, fila, letra(tm, 'Actividad'), aid ? `La actividad «${aid}» no existe` : 'Falta la actividad'); continue; }
    if (excluidas.has(a.id)) continue;
    const x1 = numero(valor(tm, valores, 'Mínimo (días)'));
    const x2 = numero(valor(tm, valores, 'Más probable (días)'));
    const x3 = numero(valor(tm, valores, 'Máximo (días)'));
    const ndTxt = normalizar(valor(tm, valores, 'Distribución'));
    const nd = ndTxt || (x1 === null && x3 === null ? 'fija' : 'triangular');
    const d = distribucionDeFila(nd, x1, x2, x3);
    if (typeof d === 'string') { error(H.impactos, fila, letra(tm, d.startsWith('Distribución') ? 'Distribución' : 'Mínimo (días)'), d); continue; }
    try {
      construirDistribucion(d);
    } catch (e) {
      error(H.impactos, fila, letra(tm, 'Mínimo (días)'), (e as Error).message);
      continue;
    }
    r.impactos.push({ actividad: a.id, dias: d });
  }
  for (const r of riesgos) if (!conFilas.has(r.id)) avisos.push(`El riesgo «${r.id}» no tiene impactos en la hoja Impactos: no cambia nada.`);

  if (configuracion.hitos) {
    for (const h of configuracion.hitos) {
      if (!porId.has(normalizar(h))) error(H.config, hi?.fila ?? 0, 'B', `El hito «${h}» no existe en Actividades`);
    }
    configuracion.hitos = configuracion.hitos.map((h) => porId.get(normalizar(h))?.id ?? h);
  }

  if (errores.length) return { modelo: null, errores, avisos };
  return {
    modelo: {
      red: { inicio, calendarios, calendarioProyecto, actividades },
      incertidumbre,
      riesgos,
      configuracion,
    },
    errores,
    avisos,
  };
}

/** La distribución de una fila (mínimo o P10, más probable, máximo o P90), o el error. */
function distribucionDeFila(nd: string, x1: number | null, x2: number | null, x3: number | null, lambda?: number): DistribucionDuracion | string {
  const faltan = (...xs: (number | null)[]) => xs.some((x) => x === null);
  if (nd.startsWith('tri') && !nd.startsWith('trig')) {
    if (faltan(x1, x2, x3)) return 'La triangular necesita mínimo, más probable y máximo';
    return { tipo: 'triangular', min: x1 as number, moda: x2 as number, max: x3 as number };
  }
  if (nd.startsWith('pert') || nd.startsWith('beta')) {
    if (faltan(x1, x2, x3)) return 'La PERT necesita mínimo, más probable y máximo';
    return { tipo: 'pert', min: x1 as number, moda: x2 as number, max: x3 as number, lambda };
  }
  if (nd.startsWith('trig')) {
    if (faltan(x1, x2, x3)) return 'La Trigen necesita P10, más probable y P90';
    return { tipo: 'trigen', bajo: x1 as number, moda: x2 as number, alto: x3 as number };
  }
  if (nd.startsWith('unif')) {
    if (faltan(x1, x3)) return 'La uniforme necesita mínimo y máximo';
    return { tipo: 'uniforme', min: x1 as number, max: x3 as number };
  }
  if (nd.startsWith('logn')) {
    if (faltan(x2, x3)) return 'La lognormal necesita la media (columna «Más probable») y la desviación (columna «Máximo»)';
    return { tipo: 'lognormal', media: x2 as number, desv: x3 as number };
  }
  if (nd.startsWith('fij')) {
    const v = x2 ?? x1 ?? x3;
    if (v === null) return 'Falta el valor del impacto (columna «Más probable»)';
    return { tipo: 'fija', valor: v };
  }
  return `Distribución desconocida «${nd}» (Triangular, PERT, Trigen, Uniforme o Lognormal)`;
}

// ------------------------------------------------------------- ejemplo

/** Una hoja nueva: valores desde A1 y, por columna, el formato de número. */
export interface HojaNueva {
  nombre: string;
  valores: Celda[][];
  /** Formato de número por columna (índice → formato). */
  formatos?: Record<number, string>;
  anchos?: number[];
  /** Listas desplegables por columna (desde la fila 2). */
  listas?: Record<number, readonly string[] | string>;
  /** Notas de ayuda en la fila 1, por columna. */
  notas?: Record<number, string>;
}

export const FORMATO_FECHA = 'dd/mm/yyyy';

interface ActividadEjemplo {
  id: string; nombre: string; wbs: string; tipo: 'Tarea' | 'Hito'; dur: number; cal?: string; restr?: [string, string];
  tri?: [string, number, number, number, string?];
}

const EJEMPLO: ActividadEjemplo[] = [
  { id: 'INI', nombre: 'Inicio del proyecto', wbs: '1', tipo: 'Hito', dur: 0 },
  { id: 'A', nombre: 'Diseño y estudios', wbs: '1.1', tipo: 'Tarea', dur: 25, tri: ['Triangular', 20, 25, 35] },
  { id: 'B', nombre: 'Licencia de construcción', wbs: '1.2', tipo: 'Tarea', dur: 45, tri: ['Trigen', 35, 45, 80] },
  { id: 'C', nombre: 'Adecuación del terreno', wbs: '2.1', tipo: 'Tarea', dur: 14, tri: ['Triangular', 10, 14, 20] },
  { id: 'D', nombre: 'Cimentación', wbs: '2.2', tipo: 'Tarea', dur: 25, tri: ['PERT', 20, 25, 40] },
  { id: 'E', nombre: 'Estructura', wbs: '2.3', tipo: 'Tarea', dur: 50, cal: 'Lunes a sábado', tri: ['PERT', 42, 50, 70] },
  { id: 'F', nombre: 'Desencofrado', wbs: '2.4', tipo: 'Tarea', dur: 5, tri: ['Triangular', 4, 5, 8] },
  { id: 'G', nombre: 'Instalaciones', wbs: '3.1', tipo: 'Tarea', dur: 30, tri: ['Triangular', 25, 30, 45] },
  { id: 'H', nombre: 'Mampostería y fachada', wbs: '3.2', tipo: 'Tarea', dur: 35, tri: ['Triangular', 30, 35, 50] },
  { id: 'I', nombre: 'Cubierta', wbs: '3.3', tipo: 'Tarea', dur: 15, tri: ['Triangular', 12, 15, 22] },
  { id: 'M', nombre: 'Obra gris terminada', wbs: '3', tipo: 'Hito', dur: 0 },
  { id: 'J', nombre: 'Acabados', wbs: '4.1', tipo: 'Tarea', dur: 30, tri: ['Triangular', 90, 100, 140, '% de la base'] },
  { id: 'K', nombre: 'Pruebas y puesta en marcha', wbs: '4.2', tipo: 'Tarea', dur: 7, tri: ['Triangular', 5, 7, 12] },
  { id: 'L', nombre: 'Entrega', wbs: '5', tipo: 'Hito', dur: 0 },
];

const RELACIONES_EJEMPLO: [string, string, string, number, string?][] = [
  ['INI', 'A', 'FC', 0], ['A', 'B', 'FC', 0], ['A', 'C', 'FC', 0], ['B', 'D', 'FC', 0], ['C', 'D', 'FC', 0],
  ['D', 'E', 'FC', 0], ['E', 'F', 'FC', 7, 'Calendario'], ['F', 'G', 'FC', 0], ['F', 'H', 'CC', 5], ['E', 'I', 'FC', 0],
  ['H', 'M', 'FC', 0], ['I', 'M', 'FC', 0], ['G', 'J', 'FC', 0], ['M', 'J', 'FC', 0], ['J', 'K', 'FC', 0], ['K', 'L', 'FC', 0],
];

const RIESGOS_EJEMPLO: [string, string, string, string, string, string, number][] = [
  ['R1', 'Lluvias fuertes durante la estructura', 'Temporada de lluvias', 'Paradas en vaciado y mampostería', 'Residente de obra', 'Clima', 0.35],
  ['R2', 'Licencia devuelta para correcciones', 'Observaciones de la curaduría', 'Nueva radicación', 'Director de diseño', 'Permisos', 0.25],
  ['R3', 'Suelo más blando de lo previsto', 'Estudio de suelos con pocas perforaciones', 'Rediseño de la cimentación', 'Ingeniero estructural', 'Técnico', 0.1],
  ['R4', 'Cubierta prefabricada disponible (oportunidad)', 'Proveedor con existencias', 'Montaje más rápido', 'Compras', 'Oportunidad', 0.5],
];

const IMPACTOS_EJEMPLO: [string, string, string, number | null, number, number | null][] = [
  ['R1', 'E', 'Triangular', 10, 15, 25],
  ['R1', 'H', 'Triangular', 3, 5, 10],
  ['R2', 'B', 'Triangular', 15, 20, 30],
  ['R3', 'D', 'Triangular', 10, 20, 40],
  ['R4', 'I', 'Fija', null, -4, null],
];

/** Las hojas del libro de cronograma, con el ejemplo de la obra, para empezar en `inicio` (número de serie, un lunes). */
export function hojasNuevasCronograma(inicio: number): HojaNueva[] {
  const anio = fechaDeSerie(inicio).anio;
  const festivos = festivosColombiaEntre(anio, anio + 4);
  const nombresCal = ['Lunes a viernes', 'Lunes a sábado'];
  const listaCal = `=${HOJAS_CRONOGRAMA.calendario}!$A$2:$A$20`;
  const L = LISTAS;
  return [
    {
      nombre: HOJAS_CRONOGRAMA.config,
      valores: [
        ['Parámetro', 'Valor', 'Para qué sirve'],
        [ETIQUETAS_CONFIG.inicio, inicio, 'Primer día del proyecto; nadie empieza antes.'],
        [ETIQUETAS_CONFIG.calendario, nombresCal[0] as string, 'El de las actividades que no dicen otro (hoja Calendario).'],
        [ETIQUETAS_CONFIG.iteraciones, 5000, 'Cuántas veces se recalcula el cronograma (5.000 basta casi siempre).'],
        [ETIQUETAS_CONFIG.semilla, 12345, 'Con la misma semilla salen los mismos números.'],
        [ETIQUETAS_CONFIG.muestreo, L.muestreo[0], 'Hipercubo latino: más preciso con las mismas iteraciones.'],
        [ETIQUETAS_CONFIG.redondeo, L.redondeo[0], 'Al día: duraciones enteras, como un cronograma real. Con decimales: sin redondear.'],
        [ETIQUETAS_CONFIG.duras, L.duras[0], '«Debe comenzar / terminar el» fijan fechas; ignorarlas deja que los retrasos se propaguen.'],
        [ETIQUETAS_CONFIG.meta, inicio + 392, 'La fecha comprometida: se calcula la probabilidad de cumplirla (puede quedar vacía).'],
        [ETIQUETAS_CONFIG.hitos, '', 'IDs separados por comas; vacío: los hitos intermedios (el fin del proyecto siempre se sigue).'],
      ],
      formatos: {},
      anchos: [36, 18, 90],
      listas: {},
    },
    {
      nombre: HOJAS_CRONOGRAMA.calendario,
      valores: (() => {
        const filas: Celda[][] = [];
        const enc: Celda[] = [...COLUMNAS.calendarios, null, ...COLUMNAS.excepciones];
        filas.push(enc);
        const cal: Celda[][] = [
          [nombresCal[0] as string, 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'No', 'No'],
          [nombresCal[1] as string, 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'No'],
        ];
        for (let i = 0; i < Math.max(cal.length, festivos.length); i++) {
          const c = cal[i] ?? [null, null, null, null, null, null, null, null];
          const f = festivos[i];
          filas.push([...c, null, f ? f.dia : null, f ? f.nombre : null, f ? '' : null, f ? 'Festivo' : null]);
        }
        return filas;
      })(),
      formatos: { [COLUMNA_EXCEPCIONES]: FORMATO_FECHA },
      anchos: [18, 8, 8, 10, 8, 8, 8, 9, 3, 12, 34, 18, 12],
      listas: { 1: L.siNo, 2: L.siNo, 3: L.siNo, 4: L.siNo, 5: L.siNo, 6: L.siNo, 7: L.siNo, [COLUMNA_EXCEPCIONES + 2]: listaCal, [COLUMNA_EXCEPCIONES + 3]: ['Festivo', 'Laborable'] },
      notas: {
        0: 'Un calendario por fila: qué días de la semana se trabaja.',
        [COLUMNA_EXCEPCIONES]: 'Festivos de Colombia generados para cinco años (ley Emiliani y Semana Santa). Añada paros o días trabajados; «Calendario» vacío vale para todos.',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.actividades,
      valores: [
        [...COLUMNAS.actividades],
        ...EJEMPLO.map((a) => [a.id, a.nombre, a.wbs, a.tipo, a.dur, a.cal ?? '', a.restr?.[0] ?? '', a.restr ? fechaDeCelda(a.restr[1]) : null, 'No'] as Celda[]),
      ],
      formatos: { 7: FORMATO_FECHA, 4: '0' },
      anchos: [8, 32, 8, 10, 14, 18, 24, 14, 12],
      listas: { 3: L.tipoActividad, 5: listaCal, 6: L.restriccion, 8: L.siNo },
      notas: { 4: 'En días laborables de su calendario. Un hito tiene 0.', 6: 'Vacío: lo antes posible.' },
    },
    {
      nombre: HOJAS_CRONOGRAMA.relaciones,
      valores: [[...COLUMNAS.relaciones], ...RELACIONES_EJEMPLO.map(([p, s, t, d, u]) => [p, s, t, d, u ?? 'Laborables'] as Celda[])],
      formatos: {},
      anchos: [12, 12, 8, 14, 18],
      listas: { 2: L.tipoRelacion, 4: L.unidadDesfase },
      notas: { 2: 'FC fin–comienzo, CC comienzo–comienzo, FF fin–fin, CF comienzo–fin.', 3: 'Negativo: un adelanto. En «Calendario» cuenta fines de semana y festivos (el curado del concreto).' },
    },
    {
      nombre: HOJAS_CRONOGRAMA.incertidumbre,
      valores: [
        [...COLUMNAS.incertidumbre],
        ...EJEMPLO.filter((a) => a.tri).map((a) => {
          const [d, x1, x2, x3, u] = a.tri as [string, number, number, number, string?];
          return [a.id, d, x1, x2, x3, u ?? 'Días', null] as Celda[];
        }),
      ],
      formatos: {},
      anchos: [10, 14, 14, 14, 14, 14, 14],
      listas: { 1: L.distribucion, 5: L.unidad },
      notas: { 2: 'Trigen: aquí el P10 y en «Máximo o P90» el P90 (los expertos se quedan cortos en los extremos).', 5: '«% de la base»: 90, 100, 140 es del 90 % al 140 % de la duración.' },
    },
    {
      nombre: HOJAS_CRONOGRAMA.riesgos,
      valores: [[...COLUMNAS.riesgos], ...RIESGOS_EJEMPLO.map((r) => [...r, 'Activo'] as Celda[])],
      formatos: { 6: '0%' },
      anchos: [6, 40, 30, 30, 20, 14, 12, 10],
      listas: { 7: L.estadoRiesgo },
      notas: { 6: 'De ocurrir en el proyecto (0 % a 100 %).' },
    },
    {
      nombre: HOJAS_CRONOGRAMA.impactos,
      valores: [[...COLUMNAS.impactos], ...IMPACTOS_EJEMPLO.map((r) => [...r] as Celda[])],
      formatos: {},
      anchos: [8, 10, 12, 14, 18, 14],
      listas: { 2: L.distribucionImpacto },
      notas: { 1: 'Un riesgo puede afectar varias actividades: todas a la vez cuando ocurre.', 4: 'Días laborables que se suman. Negativo: una oportunidad.' },
    },
  ];
}

