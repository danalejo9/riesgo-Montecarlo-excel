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
