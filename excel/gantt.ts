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
import type { FilaOrden, LecturaCronograma, LineaBase } from './cronogramaHojas.ts';

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
  /** G3: líneas base guardadas, por id (posición 0 = LB1). */
  lineasBase?: Record<string, (LineaBase | null)[]>;
}

/** Lo que se manda al Gantt, desde una lectura de las hojas (null si tiene errores). */
export function datosGanttDe(l: LecturaCronograma, qrsa?: DatosGantt['qrsa']): DatosGantt | null {
  if (!l.modelo) return null;
  return {
    version: 1, modelo: l.modelo, orden: l.orden ?? [], vinculosResumen: l.vinculosResumen ?? [],
    ...(qrsa ? { qrsa } : {}),
    ...(l.lineasBase && Object.keys(l.lineasBase).length ? { lineasBase: l.lineasBase } : {}),
  };
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
  /** G3: seguimiento. */
  estado: 'pendiente' | 'en curso' | 'terminada';
  /** Avance (0 a 1): lo registrado, o el de lo hecho hasta la fecha de corte. */
  avance: number | null;
  inicioReal: number | null;
  finReal: number | null;
  restante: number | null;
  /** G3: la línea base elegida y la variación del fin (días laborables; positiva = va tarde). */
  lineaBase: LineaBase | null;
  variacion: number | null;
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
  /** G3: fecha de corte (número de serie), si hay. */
  fechaCorte: number | null;
  /** Días no laborables del calendario del proyecto entre el inicio − 60 y el fin + 120. */
  noLaborables: Set<number>;
  calidad: CriterioGantt[];
  definicion: DefinicionCritica;
  umbralCasiCritica: number;
  /** G3: la línea base que se enseña (1 a 3; 0 ninguna) y cuáles hay guardadas. */
  lineaBase: number;
  lineasBaseGuardadas: number[];
  /** Para el trazado de cadenas y «¿por qué es crítica?». */
  red: RedCompilada;
  rutas: AnalisisRutas;
}

export interface OpcionesVista {
  definicion?: DefinicionCritica;
  umbralCasiCritica?: number;
  umbrales?: Partial<UmbralesCalidad>;
  /** G3: qué línea base enseñar (1 a 3; 0 ninguna). Por defecto, la primera guardada. */
  lineaBase?: number;
}

export function construirVista(d: DatosGantt, opciones: OpcionesVista = {}): VistaGantt {
  const definicion = opciones.definicion ?? 'holgura';
  const umbral = opciones.umbralCasiCritica ?? 5;
  const m = d.modelo;
  const guardadas = [1, 2, 3].filter((k) => Object.values(d.lineasBase ?? {}).some((l) => l[k - 1]));
  const nLb = opciones.lineaBase ?? guardadas[0] ?? 0;
  const lbDe = (id: string): LineaBase | null => (nLb > 0 ? d.lineasBase?.[id]?.[nLb - 1] ?? null : null);
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
        estado: 'pendiente' as const, avance: null, inicioReal: null, finReal: null, restante: null,
        lineaBase: null, variacion: null,
      };
    }
    const c = red.calendarios[red.cal[i] as number] as CalendarioLaboral;
    const dur = esp.dur[i] as number;
    const h = esp.holgura[i] as number;
    const st = red.estado[i] as number;
    const av = a.avance;
    const hecho = st === 2 ? 1 : st === 1
      ? av?.porcentaje ?? (Number.isFinite(red.corte) && dur > 0 ? Math.max(0, Math.min(1, (c.cuenta(red.corte) - (esp.es[i] as number)) / dur)) : 0)
      : av?.porcentaje ?? null;
    const enLarga = rutas.rutaMasLarga[i] === 1;
    const critica = definicion === 'holgura' ? h <= TOLERANCIA_CRITICA : enLarga;
    return {
      ...base,
      tipo: (red.duracion[i] as number) === 0 ? 'hito' as const : 'tarea' as const,
      indice: i,
      duracion: dur,
      estado: st === 2 ? 'terminada' as const : st === 1 ? 'en curso' as const : 'pendiente' as const,
      avance: hecho,
      inicioReal: av?.inicioReal ?? null,
      finReal: av?.finReal ?? null,
      lineaBase: lbDe(o.id),
      variacion: (() => {
        const lb = lbDe(o.id);
        if (!lb) return null;
        const f = c.serieFin(esp.ef[i] as number, dur);
        return f >= lb.fin ? c.cuenta(c.instante(f)) - c.cuenta(c.instante(lb.fin)) : -(c.cuenta(c.instante(lb.fin)) - c.cuenta(c.instante(f)));
      })(),
      restante: st === 1 ? Math.max(0, (esp.ef[i] as number) - Math.max(Number.isFinite(red.corte) ? c.cuenta(red.corte) : -Infinity, esp.es[i] as number)) : null,
      inicio: c.serieInicio(esp.es[i] as number),
      fin: c.serieFin(esp.ef[i] as number, dur),
      inicioTardio: c.serieInicio(esp.ls[i] as number),
      finTardio: c.serieFin(esp.lf[i] as number, dur),
      holguraTotal: Number.isFinite(h) ? h : null,
      holguraLibre: Number.isFinite(esp.holguraLibre[i] as number) ? esp.holguraLibre[i] as number : null,
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
    const conLb = hijas.filter((x) => x.lineaBase);
    if (conLb.length) {
      f.lineaBase = { inicio: Math.min(...conLb.map((x) => (x.lineaBase as LineaBase).inicio)), fin: Math.max(...conLb.map((x) => (x.lineaBase as LineaBase).fin)) };
      f.variacion = cp.cuenta(cp.instante(f.fin)) - cp.cuenta(cp.instante(f.lineaBase.fin));
    }
    // G3: el avance del resumen, ponderado por la duración de sus hijas.
    const conPeso = hijas.filter((x) => x.avance !== null && (x.duracion ?? 0) > 0);
    if (conPeso.length) {
      const total = hijas.reduce((t, x) => t + (x.duracion ?? 0), 0);
      f.avance = total > 0 ? hijas.reduce((t, x) => t + (x.duracion ?? 0) * (x.avance ?? 0), 0) / total : null;
      f.estado = hijas.every((x) => x.estado === 'terminada') ? 'terminada' : hijas.some((x) => x.estado !== 'pendiente') ? 'en curso' : 'pendiente';
    }
    f.duracion = cp.cuenta(cp.instante(f.fin) + 1) - cp.cuenta(cp.instante(f.inicio));
  });

  const inicio = cp.base + Math.floor(red.inicio);
  const fin = cp.base + Math.ceil(esp.fin) - 1;
  const noLaborables = new Set<number>();
  for (let s = inicio - 60; s <= fin + 120; s++) if (!cp.esLaborable(s)) noLaborables.add(s);
  return {
    filas, relaciones, inicio, fin, fechaMeta: m.configuracion.fechaMeta ?? null, fechaCorte: m.red.fechaCorte ?? null, noLaborables,
    calidad: [...calidad, ...indicesLineaBase(filas, m.red.fechaCorte, cp, fin)], definicion,
    umbralCasiCritica: umbral, lineaBase: nLb, lineasBaseGuardadas: guardadas, red, rutas,
  };
}

/**
 * G3: BEI y CPLI (DCMA, informativos), con la línea base que se enseña.
 * - **BEI**: actividades terminadas entre las que la línea base decía que
 *   tenían que estar terminadas a la fecha de corte.
 * - **CPLI**: (lo que le queda a la ruta crítica + la holgura frente al fin de
 *   la línea base) / lo que le queda; por debajo de 1, el fin se va a escapar.
 */
function indicesLineaBase(filas: FilaGantt[], corte: number | undefined, cp: CalendarioLaboral, fin: number): CriterioGantt[] {
  const tareas = filas.filter((f) => f.tipo !== 'resumen');
  const conLb = tareas.filter((f) => f.lineaBase);
  if (conLb.length === 0) return [];
  const out: CriterioGantt[] = [];
  if (corte !== undefined) {
    const debian = conLb.filter((f) => (f.lineaBase as LineaBase).fin <= corte);
    const hechas = debian.filter((f) => f.estado === 'terminada').length;
    const bei = debian.length ? hechas / debian.length : 1;
    out.push({
      id: 'bei', criterio: 'BEI (índice de ejecución de la línea base, ≥ 0,95)', estado: bei >= 0.95 ? 'verde' : 'amarillo',
      detalle: debian.length ? `${hechas} de ${debian.length} actividades que la línea base daba por terminadas al corte lo están: BEI ${bei.toFixed(2).replace('.', ',')}.` : 'La línea base no daba ninguna por terminada a la fecha de corte.',
      actividades: debian.filter((f) => f.estado !== 'terminada').map((f) => f.id),
    });
  }
  const finLb = Math.max(...conLb.map((f) => (f.lineaBase as LineaBase).fin));
  const desde = corte !== undefined ? Math.max(corte, Math.min(...tareas.map((f) => f.inicio))) : Math.min(...tareas.map((f) => f.inicio));
  const cpl = cp.cuenta(cp.instante(fin) + 1) - cp.cuenta(cp.instante(desde));
  const holgura = cp.cuenta(cp.instante(finLb) + 1) - cp.cuenta(cp.instante(fin) + 1);
  if (cpl > 0) {
    const cpli = (cpl + holgura) / cpl;
    out.push({
      id: 'cpli', criterio: 'CPLI (índice de longitud de la ruta crítica, ≥ 0,95)', estado: cpli >= 0.95 ? 'verde' : 'amarillo',
      detalle: `Faltan ${cpl} días laborables por la ruta crítica y el fin va ${holgura >= 0 ? `${holgura} días antes` : `${-holgura} días después`} del de la línea base: CPLI ${cpli.toFixed(2).replace('.', ',')}.`,
      actividades: [],
    });
  }
  return out;
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
  // G3: seguimiento. Fechas reales después de la fecha de corte y avance fuera de secuencia.
  if (red.conAvance || Number.isFinite(red.corte)) {
    const corte = d.modelo.red.fechaCorte;
    const futuras = corte === undefined ? [] : d.modelo.red.actividades.filter((a) => (a.avance?.inicioReal ?? -Infinity) > corte || (a.avance?.finReal ?? -Infinity) > corte).map((a) => a.id);
    base.push({
      id: 'fechas-invalidas',
      criterio: 'Fechas reales después de la fecha de corte',
      estado: corte === undefined && red.conAvance ? 'amarillo' : futuras.length ? 'rojo' : 'verde',
      detalle: corte === undefined && red.conAvance
        ? 'Hay avance registrado pero no fecha de corte en Config: lo pendiente no se ajusta a ella.'
        : futuras.length ? `${futuras.join(', ')}: un comienzo o fin real no puede ser posterior a la fecha de corte.` : 'Ninguna.',
      actividades: futuras,
    });
    const fuera: string[] = [];
    for (let r = 0; r < red.relPred.length; r++) {
      const p = red.relPred[r] as number;
      const s = red.relSuc[r] as number;
      if ((red.estado[s] as number) === 0 || red.relTipo[r] !== 0) continue;
      // La sucesora empezó (FC) y la predecesora no ha terminado, o terminó después.
      const terminoAntes = (red.estado[p] as number) === 2 && (red.realFin[p] as number) <= (red.realInicio[s] as number) + 1e-9;
      if (!terminoAntes && !fuera.includes(red.ids[s] as string)) fuera.push(red.ids[s] as string);
    }
    base.push({
      id: 'fuera-secuencia',
      criterio: 'Avance fuera de secuencia',
      estado: fuera.length ? 'amarillo' : 'verde',
      detalle: fuera.length
        ? `${fuera.join(', ')}: empezó antes de que terminara una predecesora fin–comienzo. Con lógica ${red.retenida ? '«retenida», lo que le falta espera a la predecesora' : '«anulación por progreso», lo que le falta sigue sin esperarla'}.`
        : 'Ninguno.',
      actividades: fuera,
    });
  }
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
