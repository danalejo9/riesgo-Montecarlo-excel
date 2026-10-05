/**
 * La red del cronograma (QRSA, Q1.3): actividades, relaciones y
 * restricciones, ya validadas y compiladas en arreglos para que el motor CPM
 * recorra miles de iteraciones sin crear objetos. Sin Office.js.
 */

import { CalendarioLaboral, type DefinicionCalendario } from './calendario.ts';

export type TipoRelacion = 'FC' | 'CC' | 'FF' | 'CF';
export const TIPOS_RELACION: readonly TipoRelacion[] = ['FC', 'CC', 'FF', 'CF'];

/**
 * Restricciones de fecha, con los nombres de MS Project:
 * - `SNET` no comenzar antes de, `FNET` no terminar antes de: mueven las fechas;
 * - `SNLT` no comenzar después de, `FNLT` no terminar después de: solo
 *   cambian la holgura (puede quedar negativa);
 * - `MSO` debe comenzar el, `MFO` debe terminar el: **duras**, anulan la
 *   lógica (se pueden ignorar en la simulación).
 */
export type TipoRestriccion = 'SNET' | 'FNET' | 'SNLT' | 'FNLT' | 'MSO' | 'MFO';
export const RESTRICCIONES_DURAS: readonly TipoRestriccion[] = ['MSO', 'MFO'];

export interface Predecesora {
  id: string;
  tipo: TipoRelacion;
  /** En días laborables del calendario de la sucesora (o días calendario con `transcurrido`). Puede ser negativo. */
  desfase: number;
  /** Desfase en días calendario (el curado del concreto sigue los fines de semana). */
  transcurrido?: boolean;
}

export interface ActividadRed {
  id: string;
  nombre: string;
  /** Duración base en días laborables; 0 es un hito. */
  duracion: number;
  /** Id del calendario; sin él, el del proyecto. */
  calendario?: string;
  restriccion?: { tipo: TipoRestriccion; fecha: number };
  /**
   * Fecha límite (*deadline*, número de serie): no mueve la actividad, pero si
   * su fin temprano la pasa, la holgura queda negativa. Puede convivir con una
   * restricción.
   */
  fechaLimite?: number;
  predecesoras: readonly Predecesora[];
  /**
   * Seguimiento (Gantt G3): comienzo y fin reales (números de serie), % completado y
   * duración restante (días laborables). Con fin real está terminada; con
   * comienzo real y sin fin, en curso; sin nada, pendiente.
   */
  avance?: AvanceActividad;
}

export interface AvanceActividad {
  inicioReal?: number;
  finReal?: number;
  /** 0 a 1. */
  porcentaje?: number;
  restante?: number;
}

/**
 * Cómo se programa lo que falta de una actividad en curso cuyas predecesoras
 * no han terminado: `retenida` (lo restante espera a la lógica, como P6 por
 * defecto) o `anulacion` (anulación por progreso: sigue desde la fecha de corte).
 */
export type LogicaProgreso = 'retenida' | 'anulacion';

export interface DefinicionRed {
  /** Fecha de inicio del proyecto (número de serie). */
  inicio: number;
  calendarios: readonly DefinicionCalendario[];
  /** Id del calendario del proyecto (por defecto, el primero). */
  calendarioProyecto?: string;
  actividades: readonly ActividadRed[];
  /** Fecha de corte (número de serie): nada pendiente empieza antes. */
  fechaCorte?: number;
  logicaProgreso?: LogicaProgreso;
}

/** Error de la red con las actividades implicadas (para señalarlas en la hoja). */
export class ErrorRed extends Error {
  readonly actividades: readonly string[];
  constructor(mensaje: string, actividades: readonly string[]) {
    super(mensaje);
    this.name = 'ErrorRed';
    this.actividades = actividades;
  }
}

export const CODIGO_TIPO: Record<TipoRelacion, number> = { FC: 0, CC: 1, FF: 2, CF: 3 };
export const CODIGO_RESTRICCION: Record<TipoRestriccion, number> = { SNET: 1, FNET: 2, SNLT: 3, FNLT: 4, MSO: 5, MFO: 6 };

export interface RedCompilada {
  n: number;
  ids: readonly string[];
  nombres: readonly string[];
  indice: ReadonlyMap<string, number>;
  /** Duraciones base. */
  duracion: Float64Array;
  /** Orden topológico (índices de actividad). */
  orden: Int32Array;
  calendarios: readonly CalendarioLaboral[];
  /** Calendario de cada actividad (índice en `calendarios`). */
  cal: Int32Array;
  /** Índice del calendario del proyecto. */
  calProyecto: number;
  /** Instante de inicio del proyecto (relativo a la base común de los calendarios). */
  inicio: number;
  /** Relaciones: predecesora, sucesora, tipo (código), desfase, transcurrido. */
  relPred: Int32Array;
  relSuc: Int32Array;
  relTipo: Uint8Array;
  relDesfase: Float64Array;
  relTranscurrido: Uint8Array;
  /** Relaciones que entran en cada actividad: `relEntrada[entradaInicio[a] … entradaInicio[a+1])`. */
  entradaInicio: Int32Array;
  relEntrada: Int32Array;
  /** Relaciones que salen de cada actividad. */
  salidaInicio: Int32Array;
  relSalida: Int32Array;
  /** Restricción (código, 0 si no hay) e instante de su fecha. */
  resTipo: Uint8Array;
  resFecha: Float64Array;
  /** Instante de la fecha límite (NaN si no hay). */
  limite: Float64Array;
  /** Seguimiento: 0 pendiente, 1 en curso, 2 terminada. */
  estado: Uint8Array;
  /** Instantes del comienzo real y del final del último día real (NaN si no hay). */
  realInicio: Float64Array;
  realFin: Float64Array;
  /** Duración restante base de las que están en curso (días laborables). */
  restante: Float64Array;
  /** Instante de la fecha de corte (NaN si no hay). */
  corte: number;
  /** Lógica retenida (true) o anulación por progreso. */
  retenida: boolean;
  /** Hay alguna actividad con avance. */
  conAvance: boolean;
}

/** Valida y compila la red. Lanza `ErrorRed` con las actividades implicadas. */
export function compilarRed(def: DefinicionRed): RedCompilada {
  const acts = def.actividades;
  const n = acts.length;
  if (n === 0) throw new ErrorRed('El cronograma no tiene actividades', []);
  if (def.calendarios.length === 0) throw new ErrorRed('El cronograma no tiene calendario', []);

  const indice = new Map<string, number>();
  acts.forEach((a, i) => {
    if (indice.has(a.id)) throw new ErrorRed(`El id «${a.id}» está repetido`, [a.id]);
    indice.set(a.id, i);
  });

  const base = Math.floor(def.inicio) - 400;
  const calendarios = def.calendarios.map((c) => new CalendarioLaboral(c, base));
  const idxCal = new Map(calendarios.map((c, i) => [c.id, i]));
  const calProyecto = def.calendarioProyecto ?? (calendarios[0] as CalendarioLaboral).id;
  if (!idxCal.has(calProyecto)) throw new ErrorRed(`El calendario del proyecto «${calProyecto}» no existe`, []);

  const duracion = new Float64Array(n);
  const cal = new Int32Array(n);
  const resTipo = new Uint8Array(n);
  const resFecha = new Float64Array(n);
  const limite = new Float64Array(n).fill(NaN);
  const estado = new Uint8Array(n);
  const realInicio = new Float64Array(n).fill(NaN);
  const realFin = new Float64Array(n).fill(NaN);
  const restante = new Float64Array(n).fill(NaN);
  const corte = def.fechaCorte !== undefined ? def.fechaCorte - base : NaN;
  const rels: { p: number; s: number; tipo: number; desfase: number; transcurrido: boolean }[] = [];
  acts.forEach((a, i) => {
    if (!(Number.isFinite(a.duracion) && a.duracion >= 0)) throw new ErrorRed(`La duración de «${a.id}» tiene que ser un número mayor o igual que 0`, [a.id]);
    duracion[i] = a.duracion;
    const c = idxCal.get(a.calendario ?? calProyecto);
    if (c === undefined) throw new ErrorRed(`El calendario «${a.calendario}» de «${a.id}» no existe`, [a.id]);
    cal[i] = c;
    if (a.restriccion) {
      resTipo[i] = CODIGO_RESTRICCION[a.restriccion.tipo];
      resFecha[i] = a.restriccion.fecha - base;
    }
    if (a.fechaLimite !== undefined) limite[i] = a.fechaLimite - base;
    const av = a.avance;
    if (av && (av.inicioReal !== undefined || av.finReal !== undefined)) {
      if (av.inicioReal !== undefined && av.finReal !== undefined && av.finReal < av.inicioReal) {
        throw new ErrorRed(`El fin real de «${a.id}» es anterior a su comienzo real`, [a.id]);
      }
      if (av.finReal !== undefined) {
        estado[i] = 2;
        // Un hito no dura: su «fin» es el comienzo de su día; una tarea termina al final del día.
        realFin[i] = av.finReal - base + (a.duracion === 0 ? 0 : 1);
        if (av.inicioReal !== undefined) realInicio[i] = av.inicioReal - base;
      } else {
        estado[i] = 1;
        realInicio[i] = (av.inicioReal as number) - base;
        const r = av.restante ?? (av.porcentaje !== undefined ? a.duracion * (1 - Math.min(1, Math.max(0, av.porcentaje))) : NaN);
        if (r === r && !(r >= 0)) throw new ErrorRed(`La duración restante de «${a.id}» tiene que ser mayor o igual que 0`, [a.id]);
        restante[i] = r;
      }
    }
    for (const p of a.predecesoras) {
      const pi = indice.get(p.id);
      if (pi === undefined) throw new ErrorRed(`La predecesora «${p.id}» de «${a.id}» no existe`, [a.id]);
      if (pi === i) throw new ErrorRed(`«${a.id}» no puede ser su propia predecesora`, [a.id]);
      if (!Number.isFinite(p.desfase)) throw new ErrorRed(`El desfase de «${p.id}» a «${a.id}» no es un número`, [a.id]);
      rels.push({ p: pi, s: i, tipo: CODIGO_TIPO[p.tipo], desfase: p.desfase, transcurrido: p.transcurrido === true });
    }
  });

  const m = rels.length;
  const relPred = Int32Array.from(rels, (r) => r.p);
  const relSuc = Int32Array.from(rels, (r) => r.s);
  const relTipo = Uint8Array.from(rels, (r) => r.tipo);
  const relDesfase = Float64Array.from(rels, (r) => r.desfase);
  const relTranscurrido = Uint8Array.from(rels, (r) => (r.transcurrido ? 1 : 0));
  const [entradaInicio, relEntrada] = agrupar(n, m, relSuc);
  const [salidaInicio, relSalida] = agrupar(n, m, relPred);
  const orden = ordenTopologico(n, entradaInicio, salidaInicio, relSalida, relSuc, relPred, relEntrada, acts.map((a) => a.id));

  const iProyecto = idxCal.get(calProyecto) as number;
  const cp = calendarios[iProyecto] as CalendarioLaboral;
  return {
    n, ids: acts.map((a) => a.id), nombres: acts.map((a) => a.nombre), indice, duracion, orden, calendarios, cal, calProyecto: iProyecto,
    inicio: cp.instante(def.inicio), relPred, relSuc, relTipo, relDesfase, relTranscurrido,
    entradaInicio, relEntrada, salidaInicio, relSalida, resTipo, resFecha, limite,
    estado, realInicio, realFin, restante, corte, retenida: def.logicaProgreso !== 'anulacion', conAvance: estado.some((x) => x !== 0),
  };
}

/** Agrupa las relaciones por actividad (formato CSR). */
function agrupar(n: number, m: number, clave: Int32Array): [Int32Array, Int32Array] {
  const inicio = new Int32Array(n + 1);
  for (let r = 0; r < m; r++) inicio[(clave[r] as number) + 1] = (inicio[(clave[r] as number) + 1] as number) + 1;
  for (let i = 0; i < n; i++) inicio[i + 1] = (inicio[i + 1] as number) + (inicio[i] as number);
  const pos = inicio.slice(0, n);
  const lista = new Int32Array(m);
  for (let r = 0; r < m; r++) {
    const k = clave[r] as number;
    lista[pos[k] as number] = r;
    pos[k] = (pos[k] as number) + 1;
  }
  return [inicio, lista];
}

/** Kahn; con un ciclo, `ErrorRed` con las actividades del ciclo en orden. */
function ordenTopologico(
  n: number, entradaInicio: Int32Array, salidaInicio: Int32Array, relSalida: Int32Array, relSuc: Int32Array,
  relPred: Int32Array, relEntrada: Int32Array, ids: readonly string[],
): Int32Array {
  const grado = new Int32Array(n);
  for (let a = 0; a < n; a++) grado[a] = (entradaInicio[a + 1] as number) - (entradaInicio[a] as number);
  const orden = new Int32Array(n);
  let cab = 0;
  let col = 0;
  for (let a = 0; a < n; a++) if (grado[a] === 0) orden[col++] = a;
  while (cab < col) {
    const a = orden[cab++] as number;
    for (let k = salidaInicio[a] as number; k < (salidaInicio[a + 1] as number); k++) {
      const s = relSuc[relSalida[k] as number] as number;
      grado[s] = (grado[s] as number) - 1;
      if (grado[s] === 0) orden[col++] = s;
    }
  }
  if (col === n) return orden;
  // Un ciclo: desde una actividad que quedó, se sigue a una predecesora que
  // también quedó hasta repetir.
  const quedan = new Set<number>();
  for (let a = 0; a < n; a++) if ((grado[a] as number) > 0) quedan.add(a);
  let a = quedan.values().next().value as number;
  const visto = new Map<number, number>();
  const camino: number[] = [];
  while (!visto.has(a)) {
    visto.set(a, camino.length);
    camino.push(a);
    let sig = -1;
    for (let k = entradaInicio[a] as number; k < (entradaInicio[a + 1] as number); k++) {
      const p = relPred[relEntrada[k] as number] as number;
      if (quedan.has(p)) { sig = p; break; }
    }
    a = sig;
  }
  const ciclo = camino.slice(visto.get(a)).reverse().map((i) => ids[i] as string);
  throw new ErrorRed(`Hay un ciclo en las relaciones: ${[...ciclo, ciclo[0]].join(' → ')}`, ciclo);
}
