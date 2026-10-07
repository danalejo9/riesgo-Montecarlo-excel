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
  BIBLIOTECA_RANGOS, CAMBIOS, construirDistribucion, festivosColombiaEntre, LUNES_A_VIERNES, MESES, type MesClima,
  type ActividadRed, type ConfiguracionCronograma, type DefinicionCalendario, type DistribucionDuracion,
  type IncertidumbreActividad, type ModeloCronograma, type Predecesora, type RiesgoCronograma, type TipoRelacion,
  type TipoRestriccion, CONFIGURACION_POR_DEFECTO,
  type CorrelacionPar, type GrupoCorrelacion, type HitoContractual, type RiesgoRegistro, type InfoActividad, type PartidaCosto, type Ramificacion,
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
  costos: 'Costos',
  correlaciones: 'Correlaciones',
  ramas: 'Ramas',
  lineasBase: 'Lineas_Base',
  hitosContrato: 'Hitos_Contrato',
  clima: 'Clima',
  escenarios: 'Escenarios',
  rangosTipo: 'Rangos_Tipo',
  seguimiento: 'Seguimiento',
} as const;
export const HOJA_RESULTADOS = 'Resultados_Cronograma';

/** V11: las hojas que cambian el resultado (no las de salida ni las de seguimiento). */
export const HOJAS_ENTRADA_CRONOGRAMA: ReadonlySet<string> = new Set([
  HOJAS_CRONOGRAMA.config, HOJAS_CRONOGRAMA.calendario, HOJAS_CRONOGRAMA.actividades, HOJAS_CRONOGRAMA.relaciones, HOJAS_CRONOGRAMA.incertidumbre,
  HOJAS_CRONOGRAMA.riesgos, HOJAS_CRONOGRAMA.impactos, HOJAS_CRONOGRAMA.costos, HOJAS_CRONOGRAMA.correlaciones, HOJAS_CRONOGRAMA.ramas,
  HOJAS_CRONOGRAMA.hitosContrato, HOJAS_CRONOGRAMA.clima,
]);

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
  /** Todas las filas de Actividades en su orden, también las resumen (para el Gantt). */
  orden?: FilaOrden[];
  /** Relaciones que tocan una actividad resumen (no se usan en el cálculo). */
  vinculosResumen?: [string, string][];
  /** G3: las líneas base guardadas, por id (posición 0 = LB1). */
  lineasBase?: Record<string, (LineaBase | null)[]>;
  /** V10: todos los riesgos de la hoja (también los cerrados), para el registro. */
  registro?: RiesgoRegistro[];
}

export interface LineaBase {
  inicio: number;
  fin: number;
}

/** Una fila de Actividades tal como está en la hoja. */
export interface FilaOrden {
  id: string;
  nombre: string;
  wbs: string;
  tipo: 'tarea' | 'hito' | 'resumen';
  /** Fila de Excel. */
  fila: number;
}

// ------------------------------------------------------------- encabezados

export const COLUMNAS = {
  calendarios: ['Calendario', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  excepciones: ['Fecha', 'Descripción', 'Calendario', 'Tipo'],
  actividades: ['ID', 'Nombre', 'WBS', 'Tipo', 'Duración (días)', 'Calendario', 'Restricción', 'Fecha de la restricción', 'Excluir de la simulación', 'Grupo', 'Fecha límite', 'Comienzo real', 'Fin real', '% completado', 'Duración restante'],
  relaciones: ['Predecesora', 'Sucesora', 'Tipo', 'Desfase (días)', 'Unidad del desfase'],
  incertidumbre: ['Actividad o grupo', 'Distribución', 'Mínimo o P10', 'Más probable', 'Máximo o P90', 'Unidad', 'Lambda (PERT)'],
  riesgos: ['ID', 'Descripción', 'Causa', 'Consecuencia', 'Dueño', 'Categoría', 'Probabilidad', 'Estado', 'Probabilidad post', '% del impacto post', 'Costo de mitigación', 'Modo', 'Próxima revisión', 'Impacto cualitativo'],
  impactos: ['Riesgo', 'Actividad', 'Distribución', 'Mínimo (días)', 'Más probable (días)', 'Máximo (días)', 'Costo mínimo', 'Costo más probable', 'Costo máximo'],
  costos: ['ID', 'Partida', 'Tipo', 'Actividad', 'Valor (monto o tarifa diaria)', 'Unidades', 'Distribución', 'Mínimo', 'Más probable', 'Máximo', 'Escalamiento anual'],
  correlacionPares: ['Elemento A', 'Elemento B', 'Coeficiente'],
  correlacionGrupos: ['Grupo', 'Miembros', 'Coeficiente'],
  ramas: ['Rama', 'Opción', 'Probabilidad', 'Actividades'],
  lineasBase: ['ID', 'LB1 comienzo', 'LB1 fin', 'LB2 comienzo', 'LB2 fin', 'LB3 comienzo', 'LB3 fin'],
  hitosContrato: ['Hito (ID)', 'Fecha contractual', 'Multa por día de retraso', 'Tope de la multa', 'Nota'],
  clima: ['Mes', 'Días perdidos mínimo', 'Días perdidos más probable', 'Días perdidos máximo'],
  climaAfecta: ['Afecta a'],
  escenarios: ['Escenario', 'Cambio', 'Sobre (ID)', 'Valor', 'Nota'],
  rangosTipo: ['Tipo', 'Palabras clave (grupo o nombre)', 'Menos', 'Más', 'Nota'],
  seguimiento: [
    'Fecha de referencia', 'Fin del cronograma', 'P50', 'P80', 'P90', 'Prob. de cumplir el cronograma', 'Prob. de cumplir la meta', 'Reserva al P80 (días lab.)',
    'Costo P50', 'Costo P80', 'JCL', 'Escenario', 'Iteraciones', 'Fecha de corte', 'Guardada el', 'Nota',
  ],
} as const;

/** G3: hasta tres líneas base. */
export const LINEAS_BASE = 3;

/** La tabla de excepciones del calendario empieza en la columna J. */
export const COLUMNA_EXCEPCIONES = 9;
/** En la hoja Clima, la lista de actividades expuestas está en la columna F. */
export const COLUMNA_AFECTA_CLIMA = 5;
/** La tabla de grupos de correlación empieza en la columna E. */
export const COLUMNA_GRUPOS_CORRELACION = 4;

export const LISTAS = {
  tipoActividad: ['Tarea', 'Hito', 'Resumen'],
  restriccion: ['No comenzar antes de', 'No terminar antes de', 'No comenzar después de', 'No terminar después de', 'Debe comenzar el', 'Debe terminar el'],
  tipoRelacion: ['FC', 'CC', 'FF', 'CF'],
  unidadDesfase: ['Laborables', 'Calendario'],
  distribucion: ['Triangular', 'PERT', 'Trigen', 'Uniforme', 'Lognormal'],
  distribucionImpacto: ['Triangular', 'PERT', 'Uniforme', 'Fija'],
  unidad: ['Días', '% de la base'],
  siNo: ['Sí', 'No'],
  estadoRiesgo: ['Activo', 'En seguimiento', 'Cerrado'],
  impactoCualitativo: ['1', '2', '3', '4', '5'],
  muestreo: ['Hipercubo latino', 'Monte Carlo'],
  redondeo: ['Al día', 'Con decimales'],
  duras: ['Respetar', 'Ignorar'],
  tipoCosto: ['Fijo', 'Por tiempo', 'Por recurso'],
  distribucionCosto: ['Triangular', 'PERT', 'Uniforme', 'Lognormal'],
  modoRiesgo: ['Extiende actividades', 'Actividad insertada'],
  logicaAvance: ['Retenida', 'Anulación por progreso'],
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
  moneda: 'Moneda',
  costoMeta: 'Costo meta',
  percentil: 'Percentil de la contingencia',
  corte: 'Fecha de corte',
  logica: 'Lógica del avance',
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

export function vacia(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export function texto(v: unknown): string {
  return vacia(v) ? '' : String(v).trim();
}

export function numero(v: unknown): number | null {
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

export function siNo(v: unknown, porDefecto: boolean): boolean {
  if (typeof v === 'boolean') return v;
  const t = normalizar(v);
  if (t === '') return porDefecto;
  return ['si', 's', 'x', 'verdadero', 'true', '1', 'yes'].includes(t);
}

/** Proporción: 0,35 o 35 (%). */
export function proporcion(v: unknown): number | null {
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
  // Primero los encabezados exactos; después, los que empiezan igual
  // («Duración» por «Duración (días)», «Actividad» por «Actividad o grupo»).
  const usadas = new Set<number>();
  for (let c = desde; c < fin; c++) {
    const h = normalizar(enc[c]);
    for (const e of esperadas) {
      const ne = normalizar(e);
      if (!col.has(ne) && h === ne) { col.set(ne, c); usadas.add(c); }
    }
  }
  for (let c = desde; c < fin; c++) {
    if (usadas.has(c)) continue;
    const h = normalizar(enc[c]);
    for (const e of esperadas) {
      const ne = normalizar(e);
      const corta = ne.split(' (')[0] as string;
      if (!col.has(ne) && (h.startsWith(corta) || (h.length >= 6 && ne.startsWith(h)))) { col.set(ne, c); break; }
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
  if (it && normalizar(it.v).startsWith('autom')) configuracion.iteracionesAutomaticas = true;
  else if (it && !vacia(it.v)) {
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
  const mo = leerCfg('moneda');
  if (mo && !vacia(mo.v)) configuracion.moneda = texto(mo.v);
  const cm = leerCfg('costoMeta');
  if (cm && !vacia(cm.v)) {
    const x = numero(cm.v);
    if (x === null || x < 0) error(H.config, cm.fila, 'B', 'El costo meta tiene que ser un número positivo');
    else configuracion.costoMeta = x;
  }
  const pc = leerCfg('percentil');
  if (pc && !vacia(pc.v)) {
    const x = proporcion(pc.v);
    if (x === null || x <= 0 || x >= 1) error(H.config, pc.fila, 'B', 'El percentil de la contingencia tiene que estar entre 1 % y 99 %');
    else configuracion.percentilContingencia = x;
  }
  // G3: seguimiento.
  let fechaCorte: number | undefined;
  const co = leerCfg('corte');
  if (co && !vacia(co.v)) {
    const f = fechaDeCelda(co.v);
    if (f === null) error(H.config, co.fila, 'B', 'La fecha de corte no es una fecha válida');
    else fechaCorte = f;
  }
  const lo = leerCfg('logica');
  const logicaProgreso: 'retenida' | 'anulacion' = lo && normalizar(lo.v).startsWith('anul') ? 'anulacion' : 'retenida';
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
  const info: InfoActividad[] = [];
  const orden: FilaOrden[] = [];
  const vinculosResumen: [string, string][] = [];
  const vistos = new Map<string, number>();
  for (const { fila, valores } of ta.filas) {
    const id = texto(valor(ta, valores, 'ID'));
    if (!id) { error(H.actividades, fila, letra(ta, 'ID'), 'Falta el ID'); continue; }
    const clave = normalizar(id);
    if (vistos.has(clave)) { error(H.actividades, fila, letra(ta, 'ID'), `El ID «${id}» ya está en la fila ${vistos.get(clave)}`); continue; }
    vistos.set(clave, fila);
    const tipo = normalizar(valor(ta, valores, 'Tipo'));
    orden.push({ id, nombre: texto(valor(ta, valores, 'Nombre')) || id, wbs: texto(valor(ta, valores, 'WBS')), tipo: tipo.startsWith('resumen') ? 'resumen' : tipo.startsWith('hito') ? 'hito' : 'tarea', fila });
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
    const flTxt = valor(ta, valores, 'Fecha límite');
    let fechaLimite: number | undefined;
    if (!vacia(flTxt)) {
      const f = fechaDeCelda(flTxt);
      if (f === null) { error(H.actividades, fila, letra(ta, 'Fecha límite'), 'La fecha límite no es una fecha válida'); invalidas.add(clave); continue; }
      fechaLimite = f;
    }
    if (siNo(valor(ta, valores, 'Excluir de la simulación'), false)) excluidas.add(id);
    // G3: el avance.
    const avance: NonNullable<ActividadRed['avance']> = {};
    let malAvance = false;
    for (const [col, campo] of [['Comienzo real', 'inicioReal'], ['Fin real', 'finReal']] as const) {
      const v = valor(ta, valores, col);
      if (vacia(v)) continue;
      const f = fechaDeCelda(v);
      if (f === null) { error(H.actividades, fila, letra(ta, col), `«${col}» no es una fecha válida`); malAvance = true; continue; }
      avance[campo] = f;
    }
    const pcV = valor(ta, valores, '% completado');
    if (!vacia(pcV)) {
      const x = proporcion(pcV);
      if (x === null || x < 0 || x > 1) { error(H.actividades, fila, letra(ta, '% completado'), 'El % completado tiene que estar entre 0 % y 100 %'); malAvance = true; } else avance.porcentaje = x;
    }
    const reV = valor(ta, valores, 'Duración restante');
    if (!vacia(reV)) {
      const x = numero(reV);
      if (x === null || x < 0) { error(H.actividades, fila, letra(ta, 'Duración restante'), 'La duración restante tiene que ser un número mayor o igual que 0'); malAvance = true; } else avance.restante = x;
    }
    if (avance.finReal !== undefined && avance.inicioReal !== undefined && avance.finReal < avance.inicioReal) {
      error(H.actividades, fila, letra(ta, 'Fin real'), 'El fin real es anterior al comienzo real'); malAvance = true;
    }
    // Un 100 % sin fin real, o un % sin comienzo real: se avisa y se toma lo que se puede.
    if (avance.porcentaje !== undefined && avance.porcentaje > 0 && avance.inicioReal === undefined && avance.finReal === undefined) {
      avisos.push(`${H.actividades}, fila ${fila}: «${id}» tiene % completado pero no comienzo real; se toma como pendiente.`);
    }
    if (malAvance) { invalidas.add(clave); continue; }
    const conAvance = avance.inicioReal !== undefined || avance.finReal !== undefined;
    const wbs = texto(valor(ta, valores, 'WBS'));
    const grupo = texto(valor(ta, valores, 'Grupo'));
    info.push({ id, ...(wbs ? { wbs } : {}), ...(grupo ? { grupo } : {}) });
    actividades.push({ id, nombre: texto(valor(ta, valores, 'Nombre')) || id, duracion, calendario, restriccion, ...(fechaLimite !== undefined ? { fechaLimite } : {}), ...(conAvance ? { avance } : {}), predecesoras: [] });
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
      vinculosResumen.push([p, s]);
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
  const colAct = 'Actividad o grupo';
  for (const { fila, valores } of ti.filas) {
    const id = texto(valor(ti, valores, colAct));
    if (invalidas.has(normalizar(id))) continue;
    // Una fila de grupo (Q2.6): «WBS 2» (y sus hijas) o «Grupo Siembra».
    const sel = /^(wbs|grupo)\s*[:=]?\s+(.+)$/i.exec(id) ?? /^(wbs|grupo)\s*[:=]\s*(.+)$/i.exec(id);
    const a = sel ? null : porId.get(normalizar(id));
    if (!sel && !a) { error(H.incertidumbre, fila, letra(ti, colAct), id ? `La actividad «${id}» no existe (para un grupo escriba «WBS 2» o «Grupo nombre»)` : 'Falta la actividad'); continue; }
    if (a) {
      if (conInc.has(a.id)) { error(H.incertidumbre, fila, letra(ti, colAct), `«${a.id}» ya tiene una distribución más arriba`); continue; }
      conInc.add(a.id);
      if (excluidas.has(a.id)) continue;
      if (a.duracion === 0) { avisos.push(`${H.incertidumbre}, fila ${fila}: «${a.id}» es un hito; su incertidumbre no se usa.`); continue; }
    }
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
      construirDistribucion(d, relativa && a ? a.duracion : 1);
    } catch (e) {
      error(H.incertidumbre, fila, letra(ti, 'Mínimo o P10'), (e as Error).message);
      continue;
    }
    if (sel) {
      const clase = (sel[1] as string).toLowerCase();
      const valorSel = (sel[2] as string).trim();
      const alguna = info.some((x) => clase === 'wbs'
        ? x.wbs !== undefined && (x.wbs === valorSel || x.wbs.startsWith(`${valorSel}.`))
        : x.grupo !== undefined && normalizar(x.grupo) === normalizar(valorSel));
      if (!alguna) avisos.push(`${H.incertidumbre}, fila ${fila}: ninguna actividad tiene ${clase === 'wbs' ? `la WBS ${valorSel}` : `el grupo «${valorSel}»`}.`);
      incertidumbre.push({ actividad: id, selector: clase === 'wbs' ? { wbs: valorSel } : { grupo: valorSel }, distribucion: d, relativa });
    } else {
      incertidumbre.push({ actividad: (a as ActividadRed).id, distribucion: d, relativa });
    }
  }

  // Riesgos e impactos.
  const tk = tabla(H.riesgos, hojas[H.riesgos], COLUMNAS.riesgos);
  const riesgos: (RiesgoCronograma & { impactos: RiesgoCronograma['impactos'][number][] })[] = [];
  const cerrados = new Set<string>();
  const idsRiesgo = new Set<string>();
  const registro: RiesgoRegistro[] = [];
  for (const { fila, valores } of tk.filas) {
    const id = texto(valor(tk, valores, 'ID'));
    if (!id) { error(H.riesgos, fila, letra(tk, 'ID'), 'Falta el ID del riesgo'); continue; }
    if (idsRiesgo.has(normalizar(id))) { error(H.riesgos, fila, letra(tk, 'ID'), `El riesgo «${id}» está repetido`); continue; }
    idsRiesgo.add(normalizar(id));
    // V10: el registro (también los cerrados).
    const revTxt = valor(tk, valores, 'Próxima revisión');
    const rev = vacia(revTxt) ? null : fechaDeCelda(revTxt);
    if (!vacia(revTxt) && rev === null) error(H.riesgos, fila, letra(tk, 'Próxima revisión'), 'La próxima revisión no es una fecha válida');
    const icTxt = valor(tk, valores, 'Impacto cualitativo');
    const ic = vacia(icTxt) ? null : numero(icTxt);
    if (!vacia(icTxt) && (ic === null || !Number.isInteger(ic) || ic < 1 || ic > 5)) error(H.riesgos, fila, letra(tk, 'Impacto cualitativo'), 'El impacto cualitativo es un nivel de 1 a 5');
    const pReg = proporcion(valor(tk, valores, 'Probabilidad'));
    registro.push({
      id, nombre: texto(valor(tk, valores, 'Descripción')) || id, estado: texto(valor(tk, valores, 'Estado')) || 'Activo',
      probabilidad: pReg !== null && pReg >= 0 && pReg <= 1 ? pReg : null,
      ...(texto(valor(tk, valores, 'Dueño')) ? { dueno: texto(valor(tk, valores, 'Dueño')) } : {}),
      ...(texto(valor(tk, valores, 'Categoría')) ? { categoria: texto(valor(tk, valores, 'Categoría')) } : {}),
      ...(rev !== null ? { proximaRevision: rev } : {}),
      ...(ic !== null && Number.isInteger(ic) && ic >= 1 && ic <= 5 ? { impactoCualitativo: ic } : {}),
    });
    if (normalizar(valor(tk, valores, 'Estado')).startsWith('cerrado')) { cerrados.add(normalizar(id)); continue; }
    const p = proporcion(valor(tk, valores, 'Probabilidad'));
    if (p === null || p < 0 || p > 1) {
      error(H.riesgos, fila, letra(tk, 'Probabilidad'), 'La probabilidad tiene que estar entre 0 y 1 (o entre 0 % y 100 %)');
      cerrados.add(normalizar(id));
      continue;
    }
    // Un error en las columnas post también cierra el riesgo para no arrastrar errores en Impactos.
    cerrados.add(normalizar(id));
    const r: RiesgoCronograma & { impactos: RiesgoCronograma['impactos'][number][] } = { id, nombre: texto(valor(tk, valores, 'Descripción')) || id, probabilidad: p, impactos: [] };
    const pp = valor(tk, valores, 'Probabilidad post');
    if (!vacia(pp)) {
      const x = proporcion(pp);
      if (x === null || x < 0 || x > 1) { error(H.riesgos, fila, letra(tk, 'Probabilidad post'), 'La probabilidad post tiene que estar entre 0 % y 100 %'); continue; }
      r.probabilidadPost = x;
    }
    const fp = valor(tk, valores, '% del impacto post');
    if (!vacia(fp)) {
      const x = numero(fp);
      if (x === null || x < 0) { error(H.riesgos, fila, letra(tk, '% del impacto post'), 'El % del impacto post tiene que ser un número (100 % = igual)'); continue; }
      r.factorImpactoPost = x > 3 ? x / 100 : x;
    }
    const cm = valor(tk, valores, 'Costo de mitigación');
    if (!vacia(cm)) {
      const x = numero(cm);
      if (x === null || x < 0) { error(H.riesgos, fila, letra(tk, 'Costo de mitigación'), 'El costo de mitigación tiene que ser un número positivo'); continue; }
      r.costoMitigacion = x;
    }
    if (normalizar(valor(tk, valores, 'Modo')).startsWith('actividad')) r.modo = 'actividad';
    cerrados.delete(normalizar(id));
    riesgos.push(r);
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
    const c1 = numero(valor(tm, valores, 'Costo mínimo'));
    const c2 = numero(valor(tm, valores, 'Costo más probable'));
    const c3 = numero(valor(tm, valores, 'Costo máximo'));
    const ndTxt = normalizar(valor(tm, valores, 'Distribución'));
    const impacto: RiesgoCronograma['impactos'][number] = { actividad: a.id };
    if (x1 !== null || x2 !== null || x3 !== null) {
      const nd = ndTxt || (x1 === null && x3 === null ? 'fija' : 'triangular');
      const d = distribucionDeFila(nd, x1, x2, x3);
      if (typeof d === 'string') { error(H.impactos, fila, letra(tm, d.startsWith('Distribución') ? 'Distribución' : 'Mínimo (días)'), d); continue; }
      try {
        construirDistribucion(d);
      } catch (e) {
        error(H.impactos, fila, letra(tm, 'Mínimo (días)'), (e as Error).message);
        continue;
      }
      impacto.dias = d;
    }
    if (c1 !== null || c2 !== null || c3 !== null) {
      const nd = c1 === null && c3 === null ? 'fija' : (ndTxt && ndTxt !== 'fija' ? ndTxt : 'triangular');
      const d = distribucionDeFila(nd, c1, c2, c3);
      if (typeof d === 'string') { error(H.impactos, fila, letra(tm, 'Costo mínimo'), d.replace('días', 'costo')); continue; }
      try {
        construirDistribucion(d);
      } catch (e) {
        error(H.impactos, fila, letra(tm, 'Costo mínimo'), (e as Error).message);
        continue;
      }
      impacto.costo = d;
    }
    if (!impacto.dias && !impacto.costo) { error(H.impactos, fila, letra(tm, 'Más probable (días)'), 'Falta el impacto: en días, en costo o en los dos'); continue; }
    r.impactos.push(impacto);
  }
  for (const r of riesgos) if (!conFilas.has(r.id)) avisos.push(`El riesgo «${r.id}» no tiene impactos en la hoja Impactos: no cambia nada.`);

  // Costos (Q2.1).
  const tco = tabla(H.costos, hojas[H.costos], COLUMNAS.costos);
  const costos: PartidaCosto[] = [];
  const idsCosto = new Set<string>();
  for (const { fila, valores } of tco.filas) {
    const id = texto(valor(tco, valores, 'ID'));
    if (!id) { error(H.costos, fila, letra(tco, 'ID'), 'Falta el ID de la partida'); continue; }
    if (idsCosto.has(normalizar(id))) { error(H.costos, fila, letra(tco, 'ID'), `La partida «${id}» está repetida`); continue; }
    if (porId.has(normalizar(id)) || invalidas.has(normalizar(id))) { error(H.costos, fila, letra(tco, 'ID'), `«${id}» ya es el ID de una actividad: use otro para la partida`); continue; }
    idsCosto.add(normalizar(id));
    const tTxt = normalizar(valor(tco, valores, 'Tipo'));
    const tipo = tTxt.includes('tiempo') ? 'tiempo' : tTxt.includes('recurso') ? 'recurso' : tTxt === '' || tTxt.startsWith('fij') ? 'fijo' : null;
    if (!tipo) { error(H.costos, fila, letra(tco, 'Tipo'), `Tipo de costo desconocido «${texto(valor(tco, valores, 'Tipo'))}» (Fijo, Por tiempo o Por recurso)`); continue; }
    const aid = texto(valor(tco, valores, 'Actividad'));
    let actividad: string | undefined;
    if (aid && !/^proyecto$/i.test(aid)) {
      if (invalidas.has(normalizar(aid))) continue;
      const a = porId.get(normalizar(aid));
      if (!a) { error(H.costos, fila, letra(tco, 'Actividad'), `La actividad «${aid}» no existe (vacío: todo el proyecto)`); continue; }
      actividad = a.id;
    }
    const v = numero(valor(tco, valores, 'Valor (monto o tarifa diaria)'));
    if (v === null) { error(H.costos, fila, letra(tco, 'Valor (monto o tarifa diaria)'), 'Falta el valor (monto o tarifa diaria)'); continue; }
    const uTxt = valor(tco, valores, 'Unidades');
    const unidades = vacia(uTxt) ? undefined : numero(uTxt);
    if (unidades === null || (tipo === 'recurso' && unidades !== undefined && unidades < 0)) { error(H.costos, fila, letra(tco, 'Unidades'), 'Las unidades tienen que ser un número'); continue; }
    const m1 = numero(valor(tco, valores, 'Mínimo'));
    const m2 = numero(valor(tco, valores, 'Más probable'));
    const m3 = numero(valor(tco, valores, 'Máximo'));
    const ndTxt = normalizar(valor(tco, valores, 'Distribución'));
    let distribucion: DistribucionDuracion | undefined;
    if (ndTxt || m1 !== null || m3 !== null) {
      const d = distribucionDeFila(ndTxt || 'triangular', m1, m2 ?? v, m3);
      if (typeof d === 'string') { error(H.costos, fila, letra(tco, d.startsWith('Distribución') ? 'Distribución' : 'Mínimo'), d); continue; }
      try {
        construirDistribucion(d);
      } catch (e) {
        error(H.costos, fila, letra(tco, 'Mínimo'), (e as Error).message);
        continue;
      }
      distribucion = d;
    }
    const eTxt = valor(tco, valores, 'Escalamiento anual');
    let escalamiento: number | undefined;
    if (!vacia(eTxt)) {
      const x = numero(eTxt);
      if (x === null) { error(H.costos, fila, letra(tco, 'Escalamiento anual'), 'El escalamiento tiene que ser un porcentaje anual'); continue; }
      escalamiento = Math.abs(x) >= 1 ? x / 100 : x;
    }
    costos.push({ id, nombre: texto(valor(tco, valores, 'Partida')) || id, tipo, actividad, valor: v, unidades: unidades ?? undefined, distribucion, escalamiento });
  }

  // Correlaciones (Q2.2): pares (A:C) y grupos (desde la E).
  const conocido = (x: string) => porId.get(normalizar(x))?.id ?? costos.find((c) => normalizar(c.id) === normalizar(x))?.id;
  // Una actividad o partida con su propio error no arrastra otro aquí.
  const conError = (x: string) => invalidas.has(normalizar(x)) || (idsCosto.has(normalizar(x)) && !costos.some((c) => normalizar(c.id) === normalizar(x)));
  const expandir = (x: string): string[] | null => {
    const sel = /^(wbs|grupo)\s*[:=]?\s+(.+)$/i.exec(x);
    if (sel) {
      const clase = (sel[1] as string).toLowerCase();
      const v = (sel[2] as string).trim();
      return info.filter((i) => clase === 'wbs' ? i.wbs !== undefined && (i.wbs === v || i.wbs.startsWith(`${v}.`)) : i.grupo !== undefined && normalizar(i.grupo) === normalizar(v)).map((i) => i.id);
    }
    const id = conocido(x);
    return id ? [id] : null;
  };
  const tcp = tabla(H.correlaciones, hojas[H.correlaciones], COLUMNAS.correlacionPares);
  const correlaciones: CorrelacionPar[] = [];
  for (const { fila, valores } of tcp.filas) {
    const a = texto(valor(tcp, valores, 'Elemento A'));
    const b = texto(valor(tcp, valores, 'Elemento B'));
    const rho = numero(valor(tcp, valores, 'Coeficiente'));
    if (conError(a) || conError(b)) continue;
    const ia = conocido(a);
    const ib = conocido(b);
    if (!ia) { error(H.correlaciones, fila, letra(tcp, 'Elemento A'), a ? `«${a}» no es una actividad ni una partida de costo` : 'Falta el elemento A'); continue; }
    if (!ib) { error(H.correlaciones, fila, letra(tcp, 'Elemento B'), b ? `«${b}» no es una actividad ni una partida de costo` : 'Falta el elemento B'); continue; }
    if (rho === null || rho < -1 || rho > 1) { error(H.correlaciones, fila, letra(tcp, 'Coeficiente'), 'El coeficiente tiene que estar entre −1 y 1'); continue; }
    correlaciones.push({ a: ia, b: ib, rho });
  }
  const tcg = tabla(H.correlaciones, hojas[H.correlaciones], COLUMNAS.correlacionGrupos, COLUMNA_GRUPOS_CORRELACION);
  const gruposCorrelacion: GrupoCorrelacion[] = [];
  for (const { fila, valores } of tcg.filas) {
    const nombre = texto(valor(tcg, valores, 'Grupo')) || `Grupo ${fila}`;
    const rho = numero(valor(tcg, valores, 'Coeficiente'));
    if (rho === null || rho < -1 || rho > 1) { error(H.correlaciones, fila, letra(tcg, 'Coeficiente'), 'El coeficiente tiene que estar entre −1 y 1'); continue; }
    const miembros: string[] = [];
    let mal = false;
    for (const parte of texto(valor(tcg, valores, 'Miembros')).split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
      if (conError(parte)) continue;
      const ids = expandir(parte);
      if (!ids) { error(H.correlaciones, fila, letra(tcg, 'Miembros'), `«${parte}» no es una actividad, una partida, una WBS ni un grupo`); mal = true; break; }
      for (const id of ids) if (!miembros.includes(id)) miembros.push(id);
    }
    if (mal) continue;
    if (miembros.length < 2) { error(H.correlaciones, fila, letra(tcg, 'Miembros'), 'Un grupo necesita al menos dos miembros'); continue; }
    gruposCorrelacion.push({ nombre, miembros, rho });
  }

  // Ramas (Q3.4).
  const tra = tabla(H.ramas, hojas[H.ramas], COLUMNAS.ramas);
  const ramas: (Ramificacion & { opciones: Ramificacion['opciones'][number][] })[] = [];
  for (const { fila, valores } of tra.filas) {
    const rama = texto(valor(tra, valores, 'Rama'));
    const opcion = texto(valor(tra, valores, 'Opción'));
    const p = proporcion(valor(tra, valores, 'Probabilidad'));
    if (!rama) { error(H.ramas, fila, letra(tra, 'Rama'), 'Falta el nombre de la rama'); continue; }
    if (!opcion) { error(H.ramas, fila, letra(tra, 'Opción'), 'Falta el nombre de la opción'); continue; }
    if (p === null || p < 0 || p > 1) { error(H.ramas, fila, letra(tra, 'Probabilidad'), 'La probabilidad tiene que estar entre 0 % y 100 %'); continue; }
    const acts: string[] = [];
    let mal = false;
    for (const parte of texto(valor(tra, valores, 'Actividades')).split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
      const a = porId.get(normalizar(parte));
      if (!a) { error(H.ramas, fila, letra(tra, 'Actividades'), `La actividad «${parte}» no existe`); mal = true; break; }
      acts.push(a.id);
    }
    if (mal) continue;
    let r = ramas.find((x) => normalizar(x.rama) === normalizar(rama));
    if (!r) { r = { rama, opciones: [] }; ramas.push(r); }
    r.opciones.push({ opcion, probabilidad: p, actividades: acts });
  }
  for (const r of ramas) {
    const total = r.opciones.reduce((x, o) => x + o.probabilidad, 0);
    if (Math.abs(total - 1) > 1e-6) error(H.ramas, 0, '', `Las opciones de la rama «${r.rama}» suman ${Math.round(total * 1000) / 10} %; tienen que sumar 100 %`);
  }

  // W1: hitos contractuales y multas.
  const thc = tabla(H.hitosContrato, hojas[H.hitosContrato], COLUMNAS.hitosContrato);
  const hitosContractuales: HitoContractual[] = [];
  for (const { fila, valores } of thc.filas) {
    const id = texto(valor(thc, valores, 'Hito (ID)'));
    if (!id) { error(H.hitosContrato, fila, letra(thc, 'Hito (ID)'), 'Falta el ID del hito'); continue; }
    if ([...resumen].some((x) => normalizar(x) === normalizar(id))) { error(H.hitosContrato, fila, letra(thc, 'Hito (ID)'), `«${id}» es una actividad resumen: use el hito o la actividad que la cierra`); continue; }
    if (invalidas.has(normalizar(id))) continue;
    const a = porId.get(normalizar(id));
    if (!a) { error(H.hitosContrato, fila, letra(thc, 'Hito (ID)'), `La actividad «${id}» no existe`); continue; }
    if (hitosContractuales.some((h) => h.actividad === a.id)) { error(H.hitosContrato, fila, letra(thc, 'Hito (ID)'), `«${a.id}» ya está más arriba`); continue; }
    const f = fechaDeCelda(valor(thc, valores, 'Fecha contractual'));
    if (f === null) { error(H.hitosContrato, fila, letra(thc, 'Fecha contractual'), 'La fecha contractual no es una fecha válida'); continue; }
    const mTxt = valor(thc, valores, 'Multa por día de retraso');
    const tTxt = valor(thc, valores, 'Tope de la multa');
    const multa = vacia(mTxt) ? undefined : numero(mTxt);
    const tope = vacia(tTxt) ? undefined : numero(tTxt);
    if (multa === null || (multa !== undefined && multa < 0)) { error(H.hitosContrato, fila, letra(thc, 'Multa por día de retraso'), 'La multa por día tiene que ser un número positivo'); continue; }
    if (tope === null || (tope !== undefined && tope < 0)) { error(H.hitosContrato, fila, letra(thc, 'Tope de la multa'), 'El tope tiene que ser un número positivo'); continue; }
    if (tope !== undefined && !multa) avisos.push(`${H.hitosContrato}, fila ${fila}: «${a.id}» tiene tope pero no multa por día; el tope no se usa.`);
    hitosContractuales.push({ actividad: a.id, fecha: f, ...(multa ? { multaDia: multa } : {}), ...(tope !== undefined ? { tope } : {}) });
  }

  // V8: clima probabilístico.
  let clima: { meses: MesClima[]; afecta: string[] } | undefined;
  if (hojas[H.clima]) {
    const tcl = tabla(H.clima, hojas[H.clima], COLUMNAS.clima);
    const meses: MesClima[] = MESES.map(() => ({ min: 0, masProbable: 0, max: 0 }));
    let bien = true;
    for (const { fila, valores } of tcl.filas) {
      const nombre = normalizar(valor(tcl, valores, 'Mes'));
      const k = MESES.findIndex((m) => normalizar(m) === nombre || (nombre.length >= 3 && normalizar(m).startsWith(nombre.slice(0, 3))));
      if (k < 0) { error(H.clima, fila, letra(tcl, 'Mes'), `«${texto(valor(tcl, valores, 'Mes'))}» no es un mes`); bien = false; continue; }
      const x1 = numero(valor(tcl, valores, 'Días perdidos mínimo')) ?? 0;
      const x3 = numero(valor(tcl, valores, 'Días perdidos máximo')) ?? 0;
      const x2 = numero(valor(tcl, valores, 'Días perdidos más probable')) ?? (x1 + x3) / 2;
      if (!(x1 >= 0 && x1 <= x2 && x2 <= x3 && x3 <= 31)) {
        error(H.clima, fila, letra(tcl, 'Días perdidos mínimo'), `${MESES[k]}: hace falta 0 ≤ mínimo ≤ más probable ≤ máximo ≤ 31 días`);
        bien = false;
        continue;
      }
      meses[k] = { min: x1, masProbable: x2, max: x3 };
    }
    const tca = tabla(H.clima, hojas[H.clima], COLUMNAS.climaAfecta, COLUMNA_AFECTA_CLIMA);
    const afecta: string[] = [];
    for (const { fila, valores } of tca.filas) {
      const parte = texto(valor(tca, valores, 'Afecta a'));
      if (!parte || invalidas.has(normalizar(parte))) continue;
      const sel = /^(wbs|grupo)\s*[:=]?\s+(.+)$/i.exec(parte);
      let ids: string[];
      if (sel) {
        const clase = (sel[1] as string).toLowerCase();
        const v = (sel[2] as string).trim();
        ids = info.filter((i) => clase === 'wbs' ? i.wbs !== undefined && (i.wbs === v || i.wbs.startsWith(`${v}.`)) : i.grupo !== undefined && normalizar(i.grupo) === normalizar(v)).map((i) => i.id);
        if (ids.length === 0) avisos.push(`${H.clima}, fila ${fila}: ninguna actividad tiene ${clase === 'wbs' ? `la WBS ${v}` : `el grupo «${v}»`}.`);
      } else {
        const a = porId.get(normalizar(parte));
        if (!a) { error(H.clima, fila, letra(tca, 'Afecta a'), `«${parte}» no es una actividad, una WBS («WBS 2») ni un grupo («Grupo Obra»)`); bien = false; continue; }
        ids = [a.id];
      }
      for (const id of ids) if (!afecta.includes(id) && !excluidas.has(id)) afecta.push(id);
    }
    if (bien && afecta.length > 0 && meses.some((m) => m.max > 0)) clima = { meses, afecta };
    else if (bien && afecta.length > 0) avisos.push(`${H.clima}: todos los meses están en 0; el clima no cambia nada.`);
  }

  if (configuracion.hitos) {
    for (const h of configuracion.hitos) {
      if (!porId.has(normalizar(h))) error(H.config, hi?.fila ?? 0, 'B', `El hito «${h}» no existe en Actividades`);
    }
    configuracion.hitos = configuracion.hitos.map((h) => porId.get(normalizar(h))?.id ?? h);
  }

  // G3: líneas base (no entran en el cálculo; las enseña el Gantt).
  const lineasBase: Record<string, (LineaBase | null)[]> = {};
  const tlb = tabla(H.lineasBase, hojas[H.lineasBase], COLUMNAS.lineasBase);
  for (const { fila, valores } of tlb.filas) {
    const id = texto(valor(tlb, valores, 'ID'));
    if (!id) continue;
    const lineas: (LineaBase | null)[] = [];
    for (let k = 1; k <= LINEAS_BASE; k++) {
      const i0 = fechaDeCelda(valor(tlb, valores, `LB${k} comienzo`));
      const f0 = fechaDeCelda(valor(tlb, valores, `LB${k} fin`));
      if ((i0 === null) !== (f0 === null)) avisos.push(`${H.lineasBase}, fila ${fila}: la línea base ${k} de «${id}» no tiene comienzo y fin; no se usa.`);
      lineas.push(i0 !== null && f0 !== null ? { inicio: i0, fin: f0 } : null);
    }
    if (lineas.some(Boolean)) lineasBase[porId.get(normalizar(id))?.id ?? id] = lineas;
  }

  if (errores.length) return { modelo: null, errores, avisos, orden, vinculosResumen, lineasBase, registro };
  return {
    orden,
    vinculosResumen,
    lineasBase,
    registro,
    modelo: {
      red: { inicio, calendarios, calendarioProyecto, actividades, ...(fechaCorte !== undefined ? { fechaCorte } : {}), logicaProgreso },
      incertidumbre,
      riesgos,
      configuracion,
      costos,
      correlaciones,
      gruposCorrelacion,
      ramas,
      info,
      ...(hitosContractuales.length ? { hitosContractuales } : {}),
      ...(clima ? { clima } : {}),
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
  id: string; nombre: string; wbs: string; tipo: 'Tarea' | 'Hito' | 'Resumen'; dur: number | null; cal?: string; restr?: [string, string]; grupo?: string;
  tri?: [string, number, number, number, string?];
}

const EJEMPLO: ActividadEjemplo[] = [
  { id: 'INI', nombre: 'Inicio del proyecto', wbs: '0', tipo: 'Hito', dur: 0 },
  { id: 'S1', nombre: 'Diseño y licencias', wbs: '1', tipo: 'Resumen', dur: null },
  { id: 'A', nombre: 'Diseño y estudios', wbs: '1.1', tipo: 'Tarea', dur: 25, tri: ['Triangular', 20, 25, 35] },
  { id: 'B', nombre: 'Licencia de construcción', wbs: '1.2', tipo: 'Tarea', dur: 45, tri: ['Trigen', 35, 45, 80] },
  { id: 'S2', nombre: 'Obra gris', wbs: '2', tipo: 'Resumen', dur: null },
  { id: 'C', nombre: 'Adecuación del terreno', wbs: '2.1', tipo: 'Tarea', dur: 14, tri: ['Triangular', 10, 14, 20] },
  { id: 'D', nombre: 'Cimentación', wbs: '2.2', tipo: 'Tarea', dur: 25, tri: ['PERT', 20, 25, 40] },
  { id: 'E', nombre: 'Estructura', wbs: '2.3', tipo: 'Tarea', dur: 50, cal: 'Lunes a sábado', tri: ['PERT', 42, 50, 70] },
  { id: 'F', nombre: 'Desencofrado', wbs: '2.4', tipo: 'Tarea', dur: 5, tri: ['Triangular', 4, 5, 8] },
  { id: 'S3', nombre: 'Instalaciones, fachada y cubierta', wbs: '3', tipo: 'Resumen', dur: null },
  { id: 'G', nombre: 'Instalaciones', wbs: '3.1', tipo: 'Tarea', dur: 30, grupo: 'Instalaciones' },
  { id: 'H', nombre: 'Mampostería y fachada', wbs: '3.2', tipo: 'Tarea', dur: 35, tri: ['Triangular', 30, 35, 50] },
  { id: 'I', nombre: 'Cubierta', wbs: '3.3', tipo: 'Tarea', dur: 15, tri: ['Triangular', 12, 15, 22] },
  { id: 'M', nombre: 'Obra gris terminada', wbs: '3.4', tipo: 'Hito', dur: 0 },
  { id: 'S4', nombre: 'Acabados y entrega', wbs: '4', tipo: 'Resumen', dur: null },
  { id: 'J', nombre: 'Acabados', wbs: '4.1', tipo: 'Tarea', dur: 30, tri: ['Triangular', 90, 100, 140, '% de la base'] },
  { id: 'K', nombre: 'Pruebas y puesta en marcha', wbs: '4.2', tipo: 'Tarea', dur: 7, tri: ['Triangular', 5, 7, 12] },
  { id: 'L', nombre: 'Entrega', wbs: '4.3', tipo: 'Hito', dur: 0 },
];

const RELACIONES_EJEMPLO: [string, string, string, number, string?][] = [
  ['INI', 'A', 'FC', 0], ['A', 'B', 'FC', 0], ['A', 'C', 'FC', 0], ['B', 'D', 'FC', 0], ['C', 'D', 'FC', 0],
  ['D', 'E', 'FC', 0], ['E', 'F', 'FC', 7, 'Calendario'], ['F', 'G', 'FC', 0], ['F', 'H', 'CC', 5], ['E', 'I', 'FC', 0],
  ['H', 'M', 'FC', 0], ['I', 'M', 'FC', 0], ['G', 'J', 'FC', 0], ['M', 'J', 'FC', 0], ['J', 'K', 'FC', 0], ['K', 'L', 'FC', 0],
];

/** ID, descripción, causa, consecuencia, dueño, categoría, probabilidad, estado, probabilidad post, % impacto post, costo de mitigación, modo. */
const RIESGOS_EJEMPLO: Celda[][] = [
  ['R1', 'Lluvias fuertes durante la estructura', 'Temporada de lluvias', 'Paradas en vaciado y mampostería', 'Residente de obra', 'Clima', 0.35, 'Activo', 0.35, 0.5, 60_000_000, 'Extiende actividades', 30, null],
  ['R2', 'Licencia devuelta para correcciones', 'Observaciones de la curaduría', 'Nueva radicación', 'Director de diseño', 'Permisos', 0.25, 'En seguimiento', 0.1, null, 15_000_000, 'Extiende actividades', 14, null],
  ['R3', 'Suelo más blando de lo previsto', 'Estudio de suelos con pocas perforaciones', 'Rediseño de la cimentación', 'Ingeniero estructural', 'Técnico', 0.1, 'Activo', null, null, null, 'Extiende actividades', 45, null],
  ['R4', 'Cubierta prefabricada disponible (oportunidad)', 'Proveedor con existencias', 'Montaje más rápido', 'Compras', 'Oportunidad', 0.5, 'Activo', null, null, null, 'Extiende actividades', 60, null],
];

/** Riesgo, actividad, distribución, días (mín, más probable, máx), costo (mín, más probable, máx). */
const IMPACTOS_EJEMPLO: Celda[][] = [
  ['R1', 'E', 'Triangular', 10, 15, 25, 20_000_000, 40_000_000, 80_000_000],
  ['R1', 'H', 'Triangular', 3, 5, 10, null, null, null],
  ['R2', 'B', 'Triangular', 15, 20, 30, null, null, null],
  ['R3', 'D', 'Triangular', 10, 20, 40, 50_000_000, 120_000_000, 250_000_000],
  ['R4', 'I', 'Fija', null, -4, null, null, -30_000_000, null],
];

/** ID, partida, tipo, actividad, valor, unidades, distribución, mín, más probable, máx, escalamiento anual. */
const COSTOS_EJEMPLO: Celda[][] = [
  ['ADM', 'Administración y dirección de obra', 'Por tiempo', '', 2_500_000, null, 'Triangular', 2_300_000, 2_500_000, 2_900_000, null],
  ['INT', 'Interventoría', 'Por tiempo', '', 1_200_000, null, 'Triangular', 1_100_000, 1_200_000, 1_400_000, null],
  ['CIM', 'Cimentación: concreto y acero', 'Fijo', 'D', 600_000_000, null, 'Triangular', 560_000_000, 600_000_000, 720_000_000, 0.06],
  ['EST', 'Estructura: concreto y acero', 'Fijo', 'E', 1_800_000_000, null, 'PERT', 1_700_000_000, 1_800_000_000, 2_150_000_000, 0.06],
  ['GRUA', 'Grúa torre', 'Por recurso', 'E', 900_000, 1, null, null, null, null, null],
  ['FACH', 'Mampostería y fachada', 'Fijo', 'H', 700_000_000, null, 'Triangular', 650_000_000, 700_000_000, 820_000_000, 0.06],
  ['ACAB', 'Acabados', 'Fijo', 'J', 950_000_000, null, 'Triangular', 880_000_000, 950_000_000, 1_150_000_000, 0.06],
];

/** El presupuesto comprometido del ejemplo (COP). */
const COSTO_META_EJEMPLO = 5_600_000_000;
/** Días desde el inicio hasta la fecha meta del ejemplo (también la fecha contractual de la entrega). */
const DIAS_META_EJEMPLO = 392;

/** La hoja Rangos_Tipo con la biblioteca. */
export function hojaRangosTipo(): HojaNueva {
  return {
    nombre: HOJAS_CRONOGRAMA.rangosTipo,
    valores: [[...COLUMNAS.rangosTipo], ...BIBLIOTECA_RANGOS.map((t) => [t.tipo, t.claves.join(', '), t.menos, t.mas, t.nota] as Celda[])],
    formatos: { 2: '0%', 3: '0%' },
    anchos: [34, 60, 10, 10, 44],
    listas: {},
    notas: {
      0: 'Valores de partida, no datos de referencia: ajústelos con el histórico. «Rellenar rangos vacíos» usa la primera fila cuyas palabras clave aparezcan en el grupo o el nombre de la actividad.',
      2: 'Cuánto puede acortarse la actividad (10 %: hasta el 90 % de la duración).',
      3: 'Cuánto puede alargarse (30 %: hasta el 130 %). Suele ser más que «Menos».',
    },
  };
}

/** W7: la hoja Escenarios con unas filas de ejemplo y, a la derecha, la lista de cambios posibles. */
export function hojaEscenarios(filas: readonly Celda[][]): HojaNueva {
  const leyenda: Celda[][] = [['Cambios posibles', 'Sobre qué y qué valor'], ...CAMBIOS.map((c) => [c.texto, `${c.sobre === 'actividad' ? 'Actividad, «WBS x» o «Grupo y»' : c.sobre === 'riesgo' ? 'Riesgo' : c.sobre === 'partida' ? 'Partida de costo' : 'Proyecto'}: ${c.valor}`] as Celda[])];
  const valores: Celda[][] = [];
  for (let i = 0; i < Math.max(filas.length + 1, leyenda.length); i++) {
    const izq: Celda[] = i === 0 ? [...COLUMNAS.escenarios] : [...(filas[i - 1] ?? [null, null, null, null, null])];
    while (izq.length < 5) izq.push(null);
    valores.push([...izq, null, ...(leyenda[i] ?? [null, null])]);
  }
  return {
    nombre: HOJAS_CRONOGRAMA.escenarios,
    valores,
    formatos: { 3: 'General' },
    anchos: [28, 22, 16, 12, 44, 3, 22, 80],
    listas: { 1: CAMBIOS.map((c) => c.texto) },
    notas: {
      0: 'Las filas con el mismo nombre forman un escenario. Cada uno se simula con los mismos números aleatorios que la base: la diferencia es solo la del cambio.',
      2: 'El ID de la actividad, el riesgo o la partida (varios, separados por «;»). Para sábados o domingos, un calendario; vacío: todos.',
    },
  };
}

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
        [ETIQUETAS_CONFIG.iteraciones, 5000, 'Cuántas veces se recalcula el cronograma (5.000 basta casi siempre). «Automático»: sube de 1.000 a 20.000 hasta que el P80 se estabilice.'],
        [ETIQUETAS_CONFIG.semilla, 12345, 'Con la misma semilla salen los mismos números.'],
        [ETIQUETAS_CONFIG.muestreo, L.muestreo[0], 'Hipercubo latino: más preciso con las mismas iteraciones.'],
        [ETIQUETAS_CONFIG.redondeo, L.redondeo[0], 'Al día: duraciones enteras, como un cronograma real. Con decimales: sin redondear.'],
        [ETIQUETAS_CONFIG.duras, L.duras[0], '«Debe comenzar / terminar el» fijan fechas; ignorarlas deja que los retrasos se propaguen.'],
        [ETIQUETAS_CONFIG.meta, inicio + DIAS_META_EJEMPLO, 'La fecha comprometida: se calcula la probabilidad de cumplirla (puede quedar vacía).'],
        [ETIQUETAS_CONFIG.hitos, '', 'IDs separados por comas; vacío: los hitos intermedios (el fin del proyecto siempre se sigue).'],
        [ETIQUETAS_CONFIG.moneda, 'COP', 'Solo para los títulos.'],
        [ETIQUETAS_CONFIG.costoMeta, COSTO_META_EJEMPLO, 'El presupuesto comprometido: con la fecha meta da la probabilidad conjunta (JCL).'],
        [ETIQUETAS_CONFIG.percentil, 0.8, 'La contingencia es este percentil del costo menos el costo base (P80 en la práctica).'],
        [ETIQUETAS_CONFIG.corte, '', 'Seguimiento: la fecha hasta la que está registrado el avance (comienzo y fin reales, % completado). Vacía: sin seguimiento.'],
        [ETIQUETAS_CONFIG.logica, L.logicaAvance[0], 'Si una actividad empezó antes de que terminaran sus predecesoras: «Retenida» hace esperar lo que le falta; «Anulación por progreso» lo deja seguir.'],
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
        ...EJEMPLO.map((a) => [a.id, a.nombre, a.wbs, a.tipo, a.dur, a.cal ?? '', a.restr?.[0] ?? '', a.restr ? fechaDeCelda(a.restr[1]) : null, a.tipo === 'Resumen' ? '' : 'No', a.grupo ?? '', null, null, null, null, null] as Celda[]),
      ],
      formatos: { 7: FORMATO_FECHA, 4: '0', 10: FORMATO_FECHA, 11: FORMATO_FECHA, 12: FORMATO_FECHA, 13: '0%' },
      anchos: [8, 32, 8, 10, 14, 18, 24, 14, 12, 16, 14, 14, 14, 12, 12],
      listas: { 3: L.tipoActividad, 5: listaCal, 6: L.restriccion, 8: L.siNo },
      notas: { 2: 'Jerarquía: 2.1 y 2.2 cuelgan de 2. Una fila «Resumen» no entra en el cálculo: sus fechas salen de sus hijas.', 4: 'En días laborables de su calendario. Un hito tiene 0; un resumen, vacía (se calcula).', 6: 'Vacío: lo antes posible.', 10: 'No mueve la actividad: si su fin pasa de esta fecha, la holgura sale negativa.', 11: 'Seguimiento: el día en que empezó de verdad. Con comienzo real y sin fin real, está en curso.', 12: 'El día en que terminó de verdad: se usa en vez de la duración.', 13: 'Lo hecho de una en curso; sin «Duración restante», lo que falta es la duración × (1 − %).', 14: 'Días laborables que le faltan desde la fecha de corte (manda sobre el %).', 9: 'Libre (tipo de obra, contratista): sirve para dar un rango a todo el grupo en Incertidumbre.' },
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
        ['WBS 3', 'Triangular', 90, 100, 150, '% de la base', null],
      ],
      formatos: {},
      anchos: [16, 14, 14, 14, 14, 14, 14],
      listas: { 1: L.distribucion, 5: L.unidad },
      notas: {
        0: 'Un ID de actividad, o un grupo: «WBS 3» (y sus hijas, 3.1, 3.2…) o «Grupo Instalaciones». La fila de grupo vale para las que no tienen fila propia.',
        2: 'Trigen: aquí el P10 y en «Máximo o P90» el P90 (los expertos se quedan cortos en los extremos).',
        5: '«% de la base»: 90, 100, 140 es del 90 % al 140 % de la duración.',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.riesgos,
      // La próxima revisión, en días desde el inicio del proyecto.
      valores: [[...COLUMNAS.riesgos], ...RIESGOS_EJEMPLO.map((r) => r.map((x, j) => (j === 12 && typeof x === 'number' ? inicio + x : x)))],
      formatos: { 6: '0%', 8: '0%', 9: '0%', 10: '#,##0', 12: FORMATO_FECHA, 13: '0' },
      anchos: [6, 40, 30, 30, 20, 14, 12, 14, 14, 14, 16, 20, 14, 14],
      listas: { 7: L.estadoRiesgo, 11: L.modoRiesgo, 13: L.impactoCualitativo },
      notas: {
        6: 'De ocurrir en el proyecto (0 % a 100 %).',
        8: 'Escenario post mitigación: la probabilidad después de mitigar (vacía: la misma).',
        9: 'Escenario post: qué parte del impacto queda (50 %: la mitad; vacío: todo).',
        10: 'Lo que cuesta mitigar: se suma al costo del escenario post.',
        11: '«Actividad insertada»: el riesgo entra en la red como una actividad nueva tras la afectada, en vez de alargarla.',
        12: 'Cuándo se vuelve a revisar el riesgo. Si la fecha pasa y no está cerrado, el registro lo marca como vencido.',
        13: 'Opcional: el nivel de impacto de 1 (muy bajo) a 5 (muy alto) que da el equipo. Vacío: sale de la simulación (lo que el riesgo aporta al P80).',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.impactos,
      valores: [[...COLUMNAS.impactos], ...IMPACTOS_EJEMPLO.map((r) => [...r])],
      formatos: { 6: '#,##0', 7: '#,##0', 8: '#,##0' },
      anchos: [8, 10, 12, 14, 18, 14, 16, 18, 16],
      listas: { 2: L.distribucionImpacto },
      notas: {
        1: 'Un riesgo puede afectar varias actividades: todas a la vez cuando ocurre.',
        4: 'Días laborables que se suman. Negativo: una oportunidad.',
        7: 'Costo que suma si el riesgo ocurre (solo el más probable: un valor fijo). Negativo: un ahorro.',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.costos,
      valores: [[...COLUMNAS.costos], ...COSTOS_EJEMPLO.map((r) => [...r])],
      formatos: { 4: '#,##0', 7: '#,##0', 8: '#,##0', 9: '#,##0', 10: '0%' },
      anchos: [8, 34, 12, 10, 22, 10, 12, 16, 16, 16, 14],
      listas: { 2: L.tipoCosto, 3: `=${HOJAS_CRONOGRAMA.actividades}!$A$2:$A$500`, 6: L.distribucionCosto },
      notas: {
        2: 'Fijo: el monto. Por tiempo: tarifa diaria × duración simulada (de la actividad o del proyecto). Por recurso: unidades × tarifa × duración.',
        3: 'Vacío: todo el proyecto (para lo que se paga mientras dure la obra).',
        6: 'La incertidumbre del monto o de la tarifa, en las mismas unidades. Vacía: el valor fijo.',
        10: 'Escalamiento anual según la fecha simulada en que se ejecuta (6 %: la obra que se retrasa un año cuesta un 6 % más).',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.correlaciones,
      valores: [
        [...COLUMNAS.correlacionPares, null, ...COLUMNAS.correlacionGrupos],
        ['ADM', 'INT', 0.6, null, 'Obra húmeda', 'D, E, H', 0.5],
        [null, null, null, null, 'Materiales', 'CIM, EST, FACH, ACAB', 0.7],
      ],
      formatos: { 2: '0.00', [COLUMNA_GRUPOS_CORRELACION + 2]: '0.00' },
      anchos: [12, 12, 12, 3, 16, 30, 12],
      listas: {},
      notas: {
        0: 'Pares de actividades (sus duraciones) o partidas (sus tarifas) que se mueven juntas: de −1 a 1.',
        [COLUMNA_GRUPOS_CORRELACION + 1]: 'Todos los miembros con el mismo coeficiente: IDs separados por comas, «WBS 3» o «Grupo Instalaciones».',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.lineasBase,
      valores: [[...COLUMNAS.lineasBase]],
      formatos: { 1: FORMATO_FECHA, 2: FORMATO_FECHA, 3: FORMATO_FECHA, 4: FORMATO_FECHA, 5: FORMATO_FECHA, 6: FORMATO_FECHA },
      anchos: [10, 14, 14, 14, 14, 14, 14],
      listas: {},
      notas: { 0: 'Las líneas base se guardan desde el Gantt («Guardar línea base»): las fechas del cronograma en ese momento, para comparar después.' },
    },
    {
      nombre: HOJAS_CRONOGRAMA.hitosContrato,
      valores: [
        [...COLUMNAS.hitosContrato],
        ['L', inicio + DIAS_META_EJEMPLO, 4_000_000, 280_000_000, 'Entrega al cliente: cláusula penal del contrato (tope del 5 %).'],
      ],
      formatos: { 1: FORMATO_FECHA, 2: '#,##0', 3: '#,##0' },
      anchos: [10, 16, 22, 18, 50],
      listas: { 0: `=${HOJAS_CRONOGRAMA.actividades}!$A$2:$A$500` },
      notas: {
        0: 'La actividad cuyo fin fija el contrato (una entrega, un acta). No mueve el cronograma: se mide contra ella.',
        2: 'Por día natural de retraso. Vacía: solo se calcula la probabilidad de cumplir la fecha.',
        3: 'La multa no pasa de este valor (la cláusula penal suele topar en un % del contrato).',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.clima,
      valores: [
        [...COLUMNAS.clima, null, ...COLUMNAS.climaAfecta],
        ...MESES.map((m) => [m, 0, 0, 0, null, null] as Celda[]),
      ],
      formatos: {},
      anchos: [14, 20, 26, 22, 3, 30],
      listas: {},
      notas: {
        0: 'Días laborables que el clima hace perder cada mes del año. En cada iteración se sortean mes a mes (una PERT); la actividad expuesta avanza más despacio ese mes. Todo en 0: sin clima.',
        [COLUMNA_AFECTA_CLIMA]: 'Las actividades a la intemperie, una por fila: un ID, «WBS 2» (y sus hijas) o «Grupo Obra». Vacía: el clima no afecta a nada.',
      },
    },
    hojaEscenarios([
      ['Trabajar los sábados', 'Trabajar sábados', '', 'Sí', 'Un turno más por semana en toda la obra'],
      ['Acelerar la estructura', 'Duración en %', 'E', -0.2, 'Una cuadrilla más: 20 % menos de duración…'],
      ['Acelerar la estructura', 'Valor de la partida', 'GRUA', 1_300_000, '…y la grúa cuesta más por día'],
      ['Sin el riesgo de la licencia', 'Quitar riesgo', 'R2', null, '¿Cuánto vale eliminarlo del todo?'],
      ['Todas las mitigaciones', 'Aplicar mitigación', 'R1; R2', null, 'Con la probabilidad y el impacto post de la hoja Riesgos'],
      ['Mampostería en paralelo', 'Predecesoras', 'H', 'F CC', 'Empezar la fachada a la vez que el desencofrado'],
    ]),
    hojaRangosTipo(),
    {
      nombre: HOJAS_CRONOGRAMA.seguimiento,
      valores: [[...COLUMNAS.seguimiento]],
      formatos: {},
      anchos: [16, 16, 12, 12, 12, 16, 16, 16, 15, 15, 8, 18, 11, 14, 17, 40],
      listas: {},
      notas: {
        0: 'Una fila por instantánea: «Guardar en el seguimiento» en los resultados del cronograma. Con la misma fecha de corte, la nueva reemplaza a la anterior.',
        15: 'Su comentario (qué cambió ese mes): se conserva al guardar.',
      },
    },
    {
      nombre: HOJAS_CRONOGRAMA.ramas,
      valores: [[...COLUMNAS.ramas]],
      formatos: { 2: '0%' },
      anchos: [18, 18, 12, 40],
      listas: {},
      notas: {
        0: 'Rutas alternativas: en cada iteración se sigue una sola opción de cada rama; las actividades de las otras no cuentan. Las opciones de una rama suman 100 %.',
        3: 'IDs separados por comas. Ejemplo: rama «Permiso», opción «Negado» (30 %), actividades «B2, B3».',
      },
    },
  ];
}

