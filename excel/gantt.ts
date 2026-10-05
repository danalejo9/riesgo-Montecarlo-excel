/**
 * Lo que dibuja el Gantt (G1/G2): filas en el orden de la hoja (con los
 * resúmenes), fechas, holguras, ruta crítica por las dos definiciones,
 * relaciones con su holgura y si son impulsoras, días no laborables y el
 * diagnóstico por fila. Sin Office.js: lo calcula la ventana con el mismo
 * motor del QRSA a partir del modelo que le manda el panel.
 */

import {
  analizarRutas, chequearCalidad, compilarRed, CalendarioLaboral, descendientes, nivelDeWbs, porQueCritica, rutaImpulsoraHacia,
  textoRelacion, TOLERANCIA_CRITICA, type AnalisisRutas, type ExplicacionCritica, type ModeloCronograma, type RedCompilada,
  type TipoRelacion, type UmbralesCalidad,
} from '../engine/cronograma/index.ts';
import type { FilaOrden } from './cronogramaHojas.ts';

const TIPOS: readonly TipoRelacion[] = ['FC', 'CC', 'FF', 'CF'];
const NOMBRE_RESTRICCION: Record<string, string> = {
  SNET: 'No comenzar antes de', FNET: 'No terminar antes de', SNLT: 'No comenzar después de', FNLT: 'No terminar después de', MSO: 'Debe comenzar el', MFO: 'Debe terminar el',
};

export type DefinicionCritica = 'holgura' | 'masLarga';

/** Lo que el panel manda a la ventana para el Gantt. */
export interface DatosGantt {
  version: 1;
  modelo: ModeloCronograma;
  orden: FilaOrden[];
  vinculosResumen: [string, string][];
  /** De la última simulación QRSA, por id: criticidad y P10/P50/P80/P90 del fin. */
  qrsa?: Record<string, { criticidad: number; p10: number; p50: number; p80: number; p90: number }>;
}

export interface EstadoEdicion {
  deshacer: string | null;
  rehacer: string | null;
  /** Lo último que pasó (una edición escrita, deshecha…). */
  mensaje: string | null;
  /** Una edición rechazada, con el motivo. */
  error: string | null;
  ocupado: boolean;
  /** La actividad que hay que seleccionar (la recién insertada). */
  seleccion?: string;
}

export const ESTADO_INICIAL: EstadoEdicion = { deshacer: null, rehacer: null, mensaje: null, error: null, ocupado: false };

export interface FilaGantt {
  id: string;
  nombre: string;
  wbs: string;
  nivel: number;
  tipo: 'tarea' | 'hito' | 'resumen';
  /** Índice en la red compilada (−1 en un resumen). */
  indice: number;
  duracion: number | null;
  /** Números de serie del primer y último día (un hito: su día). */
  inicio: number;
  fin: number;
  inicioTardio: number;
  finTardio: number;
  holguraTotal: number | null;
  holguraLibre: number | null;
  critica: boolean;
  casiCritica: boolean;
  enRutaMasLarga: boolean;
  calendario: string;
  restriccion: string | null;
  fechaRestriccion: number | null;
  fechaLimite: number | null;
  predecesoras: string;
  sucesoras: string;
  qrsa?: { criticidad: number; p10: number; p50: number; p80: number; p90: number };
  /** Ids de los criterios de calidad que la señalan. */
  diagnosticos: string[];
  /** Fila de la hoja Actividades. */
  filaHoja: number;
}

export interface RelacionGantt {
  /** Índice en la red compilada. */
  indice: number;
  pred: string;
  suc: string;
  tipo: TipoRelacion;
  desfase: number;
  transcurrido: boolean;
  holgura: number;
  impulsora: boolean;
  masLarga: boolean;
}

export interface CriterioGantt {
  id: string;
  criterio: string;
  estado: 'verde' | 'amarillo' | 'rojo';
  detalle: string;
  actividades: string[];
}

export interface VistaGantt {
  filas: FilaGantt[];
  relaciones: RelacionGantt[];
  inicio: number;
  fin: number;
  fechaMeta: number | null;
  /** Días no laborables del calendario del proyecto entre el inicio − 60 y el fin + 120. */
  noLaborables: Set<number>;
  calidad: CriterioGantt[];
  definicion: DefinicionCritica;
  umbralCasiCritica: number;
  /** Para el trazado de cadenas y «¿por qué es crítica?». */
  red: RedCompilada;
  rutas: AnalisisRutas;
}

export interface OpcionesVista {
  definicion?: DefinicionCritica;
  umbralCasiCritica?: number;
  umbrales?: Partial<UmbralesCalidad>;
}

export function construirVista(d: DatosGantt, opciones: OpcionesVista = {}): VistaGantt {
  const definicion = opciones.definicion ?? 'holgura';
  const umbral = opciones.umbralCasiCritica ?? 5;
  const m = d.modelo;
  const red = compilarRed(m.red);
  const rutas = analizarRutas(red, red.duracion, { ignorarDuras: false });
  const { esp } = rutas;
  const cp = red.calendarios[red.calProyecto] as CalendarioLaboral;
  const actPorId = new Map(m.red.actividades.map((a) => [a.id, a]));

  const sucesoras = new Map<string, string[]>();
  const relaciones: RelacionGantt[] = [];
  for (let r = 0; r < red.relPred.length; r++) {
    const pred = red.ids[red.relPred[r] as number] as string;
    const suc = red.ids[red.relSuc[r] as number] as string;
    const tipo = TIPOS[red.relTipo[r] as number] as TipoRelacion;
    const desfase = red.relDesfase[r] as number;
    const transcurrido = red.relTranscurrido[r] === 1;
    relaciones.push({ indice: r, pred, suc, tipo, desfase, transcurrido, holgura: rutas.holguraRelacion[r] as number, impulsora: rutas.impulsora[r] === 1, masLarga: rutas.relacionMasLarga[r] === 1 });
    if (!sucesoras.has(pred)) sucesoras.set(pred, []);
    (sucesoras.get(pred) as string[]).push(textoRelacion(suc, tipo, desfase, transcurrido));
  }

  const calidad = diagnostico(d, red, rutas, opciones.umbrales);
  const porActividad = new Map<string, string[]>();
  for (const c of calidad) {
    if (c.estado === 'verde') continue;
    for (const id of c.actividades) {
      if (!porActividad.has(id)) porActividad.set(id, []);
      (porActividad.get(id) as string[]).push(c.id);
    }
  }

  const filas: FilaGantt[] = d.orden.map((o) => {
    const i = red.indice.get(o.id);
    const a = actPorId.get(o.id);
    const base = {
      id: o.id, nombre: o.nombre, wbs: o.wbs, nivel: nivelDeWbs(o.wbs), tipo: o.tipo, filaHoja: o.fila,
      diagnosticos: porActividad.get(o.id) ?? [], ...(d.qrsa?.[o.id] ? { qrsa: d.qrsa[o.id] } : {}),
    };
    if (i === undefined || !a) {
      return {
        ...base, tipo: 'resumen' as const, indice: -1, duracion: null, inicio: NaN, fin: NaN, inicioTardio: NaN, finTardio: NaN,
        holguraTotal: null, holguraLibre: null, critica: false, casiCritica: false, enRutaMasLarga: false, calendario: '',
        restriccion: null, fechaRestriccion: null, fechaLimite: null, predecesoras: '', sucesoras: '',
      };
    }
    const c = red.calendarios[red.cal[i] as number] as CalendarioLaboral;
    const dur = red.duracion[i] as number;
    const h = esp.holgura[i] as number;
    const enLarga = rutas.rutaMasLarga[i] === 1;
    const critica = definicion === 'holgura' ? h <= TOLERANCIA_CRITICA : enLarga;
    return {
      ...base,
      tipo: dur === 0 ? 'hito' as const : 'tarea' as const,
      indice: i,
      duracion: dur,
      inicio: c.serieInicio(esp.es[i] as number),
      fin: c.serieFin(esp.ef[i] as number, dur),
      inicioTardio: c.serieInicio(esp.ls[i] as number),
      finTardio: c.serieFin(esp.lf[i] as number, dur),
      holguraTotal: h,
      holguraLibre: esp.holguraLibre[i] as number,
      critica,
      casiCritica: !critica && h > TOLERANCIA_CRITICA && h <= umbral,
      enRutaMasLarga: enLarga,
      calendario: c.nombre,
      restriccion: a.restriccion ? NOMBRE_RESTRICCION[a.restriccion.tipo] ?? a.restriccion.tipo : null,
      fechaRestriccion: a.restriccion?.fecha ?? null,
      fechaLimite: a.fechaLimite ?? null,
      predecesoras: a.predecesoras.map((p) => textoRelacion(p.id, p.tipo, p.desfase, p.transcurrido)).join('; '),
      sucesoras: (sucesoras.get(o.id) ?? []).join('; '),
    };
  });

  // Resúmenes: de la primera a la última de sus hijas.
  const jer = d.orden.map((o) => ({ id: o.id, wbs: o.wbs, resumen: o.tipo === 'resumen' }));
  filas.forEach((f, k) => {
    if (f.tipo !== 'resumen') return;
    const hijas = descendientes(jer, k).map((j) => filas[j] as FilaGantt).filter((x) => x.tipo !== 'resumen' && Number.isFinite(x.inicio));
    if (hijas.length === 0) return;
    f.inicio = Math.min(...hijas.map((x) => x.inicio));
    f.fin = Math.max(...hijas.map((x) => x.fin));
    f.inicioTardio = Math.min(...hijas.map((x) => x.inicioTardio));
    f.finTardio = Math.max(...hijas.map((x) => x.finTardio));
    f.critica = hijas.some((x) => x.critica);
    f.duracion = cp.cuenta(cp.instante(f.fin) + 1) - cp.cuenta(cp.instante(f.inicio));
  });

  const inicio = cp.base + Math.floor(red.inicio);
  const fin = cp.base + Math.ceil(esp.fin) - 1;
  const noLaborables = new Set<number>();
  for (let s = inicio - 60; s <= fin + 120; s++) if (!cp.esLaborable(s)) noLaborables.add(s);
  return {
    filas, relaciones, inicio, fin, fechaMeta: m.configuracion.fechaMeta ?? null, noLaborables, calidad, definicion,
    umbralCasiCritica: umbral, red, rutas,
  };
}

/** Calidad del QRSA más lo del Gantt: vínculos a resúmenes y alertas de la ruta crítica (§7.4 y §8). */
function diagnostico(d: DatosGantt, red: RedCompilada, rutas: AnalisisRutas, umbrales?: Partial<UmbralesCalidad>): CriterioGantt[] {
  const base = chequearCalidad(d.modelo, umbrales).criterios
    .filter((c) => c.id !== 'incertidumbre' && c.id !== 'correlacion')
    .map((c) => ({ id: c.id, criterio: c.criterio, estado: c.estado, detalle: c.detalle, actividades: [...c.actividades] }));
  const vr = d.vinculosResumen;
  base.push({
    id: 'resumen',
    criterio: 'Vínculos a actividades resumen',
    estado: vr.length === 0 ? 'verde' : 'rojo',
    detalle: vr.length === 0 ? 'Ninguno.' : `${vr.map(([p, s]) => `${p} → ${s}`).join(', ')}: un resumen no entra en el cálculo, así que el vínculo no hace nada.`,
    actividades: [...new Set(vr.flat())],
  });
  // La ruta más larga tiene que arrancar en una actividad sin predecesoras (el inicio).
  const n = red.n;
  const enLarga: number[] = [];
  for (let a = 0; a < n; a++) if (rutas.rutaMasLarga[a] === 1) enLarga.push(a);
  const arranques = enLarga.filter((a) => {
    for (let k = red.entradaInicio[a] as number; k < (red.entradaInicio[a + 1] as number); k++) {
      if (rutas.relacionMasLarga[red.relEntrada[k] as number] === 1) return false;
    }
    return true;
  });
  const rotas = arranques.filter((a) => (red.entradaInicio[a + 1] as number) > (red.entradaInicio[a] as number) || (red.resTipo[a] as number) !== 0);
  base.push({
    id: 'ruta-continua',
    criterio: 'La ruta crítica va del inicio al fin',
    estado: rotas.length === 0 ? 'verde' : 'rojo',
    detalle: rotas.length === 0
      ? 'La ruta más larga arranca en una actividad sin predecesoras.'
      : `La ruta más larga arranca en ${rotas.map((a) => red.ids[a]).join(', ')}, que tiene predecesoras o una restricción: la lógica está rota o una restricción fija la fecha.`,
    actividades: rotas.map((a) => red.ids[a] as string),
  });
  const criticas = [...Array(n).keys()].filter((a) => (rutas.esp.holgura[a] as number) <= TOLERANCIA_CRITICA);
  const prop = n ? criticas.length / n : 0;
  base.push({
    id: 'proporcion',
    criterio: 'Proporción de actividades críticas (5 % a 60 %)',
    estado: prop < 0.05 || prop > 0.6 ? 'amarillo' : 'verde',
    detalle: `${criticas.length} de ${n} actividades (${Math.round(prop * 100)} %) son críticas.${prop > 0.6 ? ' Tantas suelen indicar una red en serie o restricciones.' : prop < 0.05 ? ' Tan pocas suelen indicar lógica incompleta.' : ''}`,
    actividades: [],
  });
  const durasCriticas = criticas.filter((a) => (red.resTipo[a] as number) >= 5);
  base.push({
    id: 'critica-dura',
    criterio: 'Ruta crítica por una restricción dura',
    estado: durasCriticas.length === 0 ? 'verde' : 'amarillo',
    detalle: durasCriticas.length === 0 ? 'Ninguna.' : `${durasCriticas.map((a) => red.ids[a]).join(', ')}: una fecha fija, no la lógica, decide la ruta.`,
    actividades: durasCriticas.map((a) => red.ids[a] as string),
  });
  return base;
}

/** La cadena impulsora hasta una fila (por su id). */
export function impulsoraHacia(v: VistaGantt, id: string): { actividades: Set<string>; relaciones: Set<number> } {
  const i = v.red.indice.get(id);
  if (i === undefined) return { actividades: new Set(), relaciones: new Set() };
  const c = rutaImpulsoraHacia(v.red, v.rutas, i);
  return { actividades: new Set([...c.actividades].map((x) => v.red.ids[x] as string)), relaciones: c.relaciones };
}

export function explicarCritica(v: VistaGantt, id: string): ExplicacionCritica | null {
  const i = v.red.indice.get(id);
  return i === undefined ? null : porQueCritica(v.red, v.rutas, i, (x) => v.red.ids[x] as string);
}

/** Lo que el Gantt toma de la última simulación QRSA: criticidad y P10/P50/P80/P90 del fin de cada actividad. */
export function qrsaDeSimulacion(sim: { red: RedCompilada; criticidad: Float64Array; fechas: { fin: Float32Array[] }; riesgoInsertado: boolean[] }): NonNullable<DatosGantt['qrsa']> {
  const out: NonNullable<DatosGantt['qrsa']> = {};
  const q = (v: Float64Array, p: number) => v[Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1))] as number;
  for (let a = 0; a < sim.red.n; a++) {
    if (sim.riesgoInsertado[a]) continue;
    const fin = Float64Array.from(sim.fechas.fin[a] ?? []).sort();
    if (fin.length === 0) continue;
    out[sim.red.ids[a] as string] = { criticidad: sim.criticidad[a] as number, p10: q(fin, 0.1), p50: q(fin, 0.5), p80: q(fin, 0.8), p90: q(fin, 0.9) };
  }
  return out;
}
