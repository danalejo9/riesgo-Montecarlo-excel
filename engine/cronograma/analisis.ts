/**
 * Lo que se lee de una simulación del cronograma (QRSA, Q1.5): la tabla de
 * percentiles del fin y de cada hito, la probabilidad de cumplir la fecha
 * determinística y la meta, la curva S, los índices de las actividades
 * (criticidad, *cruciality* y SSI) y la convergencia del P80. Sin Office.js.
 */

import { histogramaDeMuestra, spearman, type BinHistograma } from '../stats/index.ts';
import { percentilOrdenado, type SerieTiempo, type SimulacionCronograma } from './simulacion.ts';

export const PERCENTILES_CRONOGRAMA = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] as const;

export interface FilaPercentil {
  p: number;
  /** Días laborables desde el inicio (PERCENTIL.INC). */
  dias: number;
  /** El día (número de serie) con al menos esa probabilidad de no pasarse. */
  serie: number;
}

export interface ResumenTiempo {
  id: string;
  nombre: string;
  media: number;
  desviacion: number;
  minimo: number;
  maximo: number;
  /** Fechas mínima y máxima simuladas. */
  serieMinima: number;
  serieMaxima: number;
  percentiles: FilaPercentil[];
  /** P(terminar a más tardar en la fecha determinística). */
  probabilidadDeterministica: number;
  /** P(terminar a más tardar en la fecha meta), si la hay. */
  probabilidadMeta: number | null;
  /** Fecha determinística (número de serie). */
  serieDeterministica: number;
  histograma: BinHistograma[];
  /** Curva S en fechas: [número de serie, probabilidad acumulada]. */
  curvaS: [number, number][];
}

/** El percentil de rango más cercano: el menor valor con al menos `p` de la muestra por debajo o en él. */
function rangoCercano(o: Float64Array, p: number): number {
  const k = Math.min(o.length - 1, Math.max(0, Math.ceil(p * o.length) - 1));
  return o[k] as number;
}

function proporcionHasta(o: Float64Array, x: number): number {
  let lo = 0;
  let hi = o.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if ((o[m] as number) <= x) lo = m + 1;
    else hi = m;
  }
  return lo / o.length;
}

export function resumirTiempo(s: SerieTiempo, serieDeterministica: number, fechaMeta?: number): ResumenTiempo {
  const dias = Float64Array.from(s.dias).sort();
  const fechas = Float64Array.from(s.serie).sort();
  const n = dias.length;
  let suma = 0;
  for (let i = 0; i < n; i++) suma += dias[i] as number;
  const media = suma / n;
  let q = 0;
  for (let i = 0; i < n; i++) q += ((dias[i] as number) - media) ** 2;
  const curvaS: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const f = fechas[i] as number;
    if (i === n - 1 || fechas[i + 1] !== f) curvaS.push([f, (i + 1) / n]);
  }
  return {
    id: s.id,
    nombre: s.nombre,
    media,
    desviacion: n > 1 ? Math.sqrt(q / (n - 1)) : 0,
    minimo: dias[0] as number,
    maximo: dias[n - 1] as number,
    serieMinima: fechas[0] as number,
    serieMaxima: fechas[n - 1] as number,
    percentiles: PERCENTILES_CRONOGRAMA.map((p) => ({ p, dias: percentilOrdenado(dias, p), serie: Math.floor(rangoCercano(fechas, p)) })),
    probabilidadDeterministica: proporcionHasta(fechas, serieDeterministica),
    probabilidadMeta: fechaMeta === undefined ? null : proporcionHasta(fechas, fechaMeta),
    serieDeterministica,
    histograma: histogramaDeMuestra(dias, 30),
    curvaS,
  };
}

export interface IndiceActividad {
  id: string;
  nombre: string;
  /** Proporción de iteraciones en la ruta crítica. */
  criticidad: number;
  /** ρ de Spearman entre la duración de la actividad y el fin del proyecto. */
  cruciality: number;
  /** Índice de sensibilidad del cronograma: criticidad × σ actividad / σ proyecto. */
  ssi: number;
  duracionMedia: number;
  /** Holgura total en el cronograma determinístico. */
  holgura: number;
}

function mediaYDesv(v: ArrayLike<number>): [number, number] {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] as number;
  const m = s / v.length;
  let q = 0;
  for (let i = 0; i < v.length; i++) q += ((v[i] as number) - m) ** 2;
  return [m, v.length > 1 ? Math.sqrt(q / (v.length - 1)) : 0];
}

/** Índices por actividad, de mayor a menor criticidad (y SSI). */
export function indicesActividades(sim: SimulacionCronograma): IndiceActividad[] {
  const [, sigmaP] = mediaYDesv(sim.fin.dias);
  const filas: IndiceActividad[] = [];
  for (let a = 0; a < sim.red.n; a++) {
    const d = sim.duraciones[a] as Float32Array;
    const [m, sigma] = mediaYDesv(d);
    const ci = sim.criticidad[a] as number;
    filas.push({
      id: sim.red.ids[a] as string,
      nombre: sim.red.nombres[a] as string,
      criticidad: ci,
      cruciality: sigma > 0 ? spearman(d, sim.fin.dias) : 0,
      ssi: sigmaP > 0 ? (ci * sigma) / sigmaP : 0,
      duracionMedia: m,
      holgura: sim.deterministico.filas[a]?.holguraTotal ?? 0,
    });
  }
  return filas.sort((x, y) => y.criticidad - x.criticidad || y.ssi - x.ssi);
}

export interface Convergencia {
  /** P80 del fin (días) con las primeras 500, 1000, … iteraciones. */
  puntos: { iteraciones: number; p80: number }[];
  /** Cambio relativo del P80 en el último bloque. */
  ultimoCambio: number | null;
  convergio: boolean;
}

/** El criterio de la especificación: el P80 cambia menos del 0,5 % entre bloques de 500. */
export function convergenciaP80(dias: Float64Array, bloque = 500, tolerancia = 0.005): Convergencia {
  const puntos: { iteraciones: number; p80: number }[] = [];
  for (let k = bloque; k <= dias.length; k += bloque) {
    puntos.push({ iteraciones: k, p80: percentilOrdenado(Float64Array.from(dias.subarray(0, k)).sort(), 0.8) });
  }
  if (puntos.length < 2) return { puntos, ultimoCambio: null, convergio: false };
  const a = puntos[puntos.length - 2] as { p80: number };
  const b = puntos[puntos.length - 1] as { p80: number };
  const ultimoCambio = Math.abs(b.p80 - a.p80) / Math.max(Math.abs(a.p80), 1e-12);
  return { puntos, ultimoCambio, convergio: ultimoCambio < tolerancia };
}

// ------------------------------------------------------------- Q2 y Q3

export interface ResumenCosto {
  media: number;
  desviacion: number;
  minimo: number;
  maximo: number;
  percentiles: { p: number; valor: number }[];
  /** Costo base: valores base, duraciones base, sin riesgos. */
  base: number;
  /** Probabilidad de no pasarse del costo base. */
  probabilidadBase: number;
  /** El percentil de la contingencia (0,8 por defecto), su valor y la contingencia (valor − base). */
  pContingencia: number;
  valorContingencia: number;
  contingencia: number;
  probabilidadMeta: number | null;
  histograma: BinHistograma[];
  curvaS: [number, number][];
}

export function resumirCosto(costo: Float64Array, base: number, pContingencia = 0.8, costoMeta?: number): ResumenCosto {
  const o = Float64Array.from(costo).sort();
  const n = o.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += o[i] as number;
  const media = s / n;
  let q = 0;
  for (let i = 0; i < n; i++) q += ((o[i] as number) - media) ** 2;
  const valorContingencia = percentilOrdenado(o, pContingencia);
  const curvaS: [number, number][] = [];
  const paso = Math.max(1, Math.floor(n / 200));
  for (let i = paso - 1; i < n; i += paso) curvaS.push([o[i] as number, (i + 1) / n]);
  if (curvaS.at(-1)?.[1] !== 1) curvaS.push([o[n - 1] as number, 1]);
  return {
    media,
    desviacion: n > 1 ? Math.sqrt(q / (n - 1)) : 0,
    minimo: o[0] as number,
    maximo: o[n - 1] as number,
    percentiles: PERCENTILES_CRONOGRAMA.map((p) => ({ p, valor: percentilOrdenado(o, p) })),
    base,
    probabilidadBase: proporcionHasta(o, base),
    pContingencia,
    valorContingencia,
    contingencia: valorContingencia - base,
    probabilidadMeta: costoMeta === undefined ? null : proporcionHasta(o, costoMeta),
    histograma: histogramaDeMuestra(o, 30),
    curvaS,
  };
}

export interface ConfianzaConjunta {
  /** Proporción que cumple a la vez la fecha meta y el costo meta (JCL). */
  jcl: number;
  soloPlazo: number;
  soloCosto: number;
  /** Puntos [número de serie del fin, costo] para la dispersión (una muestra de hasta `max`). */
  puntos: [number, number][];
}

export function confianzaConjunta(finSerie: Float64Array, costo: Float64Array, fechaMeta: number, costoMeta: number, max = 1500): ConfianzaConjunta {
  const n = finSerie.length;
  let ambos = 0;
  let plazo = 0;
  let cuesta = 0;
  for (let i = 0; i < n; i++) {
    const p = (finSerie[i] as number) <= fechaMeta;
    const c = (costo[i] as number) <= costoMeta;
    if (p) plazo++;
    if (c) cuesta++;
    if (p && c) ambos++;
  }
  const paso = Math.max(1, Math.ceil(n / max));
  const puntos: [number, number][] = [];
  for (let i = 0; i < n; i += paso) puntos.push([finSerie[i] as number, costo[i] as number]);
  return { jcl: ambos / n, soloPlazo: plazo / n, soloCosto: cuesta / n, puntos };
}

export interface FilaAjustada {
  id: string;
  nombre: string;
  inicioBase: number;
  finBase: number;
  /** Números de serie: el día con esa probabilidad de no pasarse. */
  inicioP50: number;
  finP50: number;
  inicioP: number;
  finP: number;
  /** Días calendario entre el fin base y el fin Pxx. */
  desplazamiento: number;
}

/** El cronograma ajustado por riesgo (Q3.3): las fechas P50 y Pxx de cada actividad. */
export function cronogramaAjustado(sim: SimulacionCronograma, p = 0.8): FilaAjustada[] {
  const filas: FilaAjustada[] = [];
  for (let a = 0; a < sim.red.n; a++) {
    if (sim.riesgoInsertado[a]) continue;
    const ini = Float64Array.from(sim.fechas.inicio[a] as Float32Array).sort();
    const fin = Float64Array.from(sim.fechas.fin[a] as Float32Array).sort();
    const det = sim.deterministico.filas[a];
    const finP = rangoCercano(fin, p);
    filas.push({
      id: sim.red.ids[a] as string,
      nombre: sim.red.nombres[a] as string,
      inicioBase: det?.inicio ?? NaN,
      finBase: det?.fin ?? NaN,
      inicioP50: rangoCercano(ini, 0.5),
      finP50: rangoCercano(fin, 0.5),
      inicioP: rangoCercano(ini, p),
      finP,
      desplazamiento: finP - (det?.fin ?? finP),
    });
  }
  return filas;
}

export interface FilaPrePost {
  medida: string;
  pre: number;
  post: number;
  /** pre − post: lo que gana la mitigación (positivo, mejor). */
  diferencia: number;
  /** 'dias', 'fecha', 'costo' o 'probabilidad', para darle formato. */
  unidad: 'dias' | 'fecha' | 'costo' | 'probabilidad';
}

/** La comparación pre y post mitigación (Q2.5), con los mismos números aleatorios. */
export function comparacionPrePost(sim: SimulacionCronograma, fechaMeta?: number, pContingencia = 0.8): FilaPrePost[] {
  if (!sim.post) return [];
  const filas: FilaPrePost[] = [];
  const pre = Float64Array.from(sim.fin.dias).sort();
  const post = Float64Array.from(sim.post.fin.dias).sort();
  const preS = Float64Array.from(sim.fin.serie).sort();
  const postS = Float64Array.from(sim.post.fin.serie).sort();
  const media = (o: Float64Array) => o.reduce((s, x) => s + x, 0) / o.length;
  filas.push({ medida: 'Fin: media (días)', pre: media(pre), post: media(post), diferencia: media(pre) - media(post), unidad: 'dias' });
  for (const p of [0.5, 0.8]) {
    filas.push({ medida: `Fin: P${p * 100} (días)`, pre: percentilOrdenado(pre, p), post: percentilOrdenado(post, p), diferencia: percentilOrdenado(pre, p) - percentilOrdenado(post, p), unidad: 'dias' });
    filas.push({ medida: `Fin: P${p * 100} (fecha)`, pre: rangoCercano(preS, p), post: rangoCercano(postS, p), diferencia: rangoCercano(preS, p) - rangoCercano(postS, p), unidad: 'fecha' });
  }
  if (fechaMeta !== undefined) {
    const a = proporcionHasta(preS, fechaMeta);
    const b = proporcionHasta(postS, fechaMeta);
    filas.push({ medida: 'Probabilidad de cumplir la fecha meta', pre: a, post: b, diferencia: b - a, unidad: 'probabilidad' });
  }
  if (sim.costo && sim.post.costo) {
    const c1 = Float64Array.from(sim.costo).sort();
    const c2 = Float64Array.from(sim.post.costo).sort();
    filas.push({ medida: 'Costo: media (con la mitigación)', pre: media(c1), post: media(c2), diferencia: media(c1) - media(c2), unidad: 'costo' });
    const pc = pContingencia;
    filas.push({ medida: `Costo: P${Math.round(pc * 100)}`, pre: percentilOrdenado(c1, pc), post: percentilOrdenado(c2, pc), diferencia: percentilOrdenado(c1, pc) - percentilOrdenado(c2, pc), unidad: 'costo' });
  }
  return filas;
}
