/**
 * Convierte lo que produce el ejecutor (`EstadoWelford` + `TDigest` por
 * salida) en las formas que de verdad va a pintar el panel: un resumen
 * estadístico, y los puntos de una curva CDF. Es la pieza de "Resultados:
 * estadísticos, histograma y CDF" de Fase 3 E3 que no depende de Office.js —
 * pura transformación de datos ya calculados.
 *
 * Los percentiles son siempre aproximados aquí, porque vienen del t-digest:
 * el ejecutor por bloques nunca retiene el buffer completo de una salida
 * (esa es la razón de ser de D11), así que no hay dónde sacar un percentil
 * exacto sin volver a correr la simulación reteniendo todo. Fase 2 §3.3
 * exige que la UI pueda distinguir cuál es cuál — `percentilesAproximados`
 * está para eso, no como adorno.
 *
 * El histograma queda fuera de esta pieza a propósito: Fase 2 §3.3 pide
 * fijar su rango "en una pasada previa corta" y acumular los conteos bloque
 * a bloque dentro del ejecutor — el ejecutor de hoy no lo hace todavía (solo
 * acumula Welford y t-digest). `puntosHistograma` de aquí abajo sirve para
 * cuando sí se tiene el buffer completo (`construirHistograma` sobre un
 * resultado de `evaluarModelo`, por ejemplo), no para el camino por bloques.
 * Ese hueco queda para cuando se aborde E6 (escala D11).
 */
import type { Histograma } from './histogram.ts';
import { cuantilTDigest, type TDigest } from './tdigest.ts';
import { varianzaPoblacional, type EstadoWelford } from './welford.ts';

/** Percentiles estándar de un informe de riesgo. */
const PERCENTILES_ESTANDAR = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99] as const;

export interface ResumenEstadistico {
  n: number;
  media: number;
  desviacion: number;
  min: number;
  max: number;
  /** Clave `p1`..`p99`, ver `PERCENTILES_ESTANDAR`. */
  percentiles: Record<string, number>;
  /** Siempre `true` aquí — ver docstring del módulo. */
  percentilesAproximados: true;
}

/**
 * La clave de un percentil en `percentiles`: `p5`, `p50`, `p97.5` (C6: el
 * usuario puede pedir percentiles que no son enteros).
 */
export function clavePercentil(p: number): string {
  return `p${Math.round(p * 1000) / 10}`;
}

/** Cómo se enseña: `p5`, `p97,5`. */
export function etiquetaPercentil(p: number): string {
  return `p${(Math.round(p * 1000) / 10).toLocaleString('es-ES')}`;
}

/** Los percentiles de un resumen, ordenados por su probabilidad (las claves pueden venir en cualquier orden). */
export function percentilesOrdenados(percentiles: Record<string, number>): [string, number][] {
  return Object.entries(percentiles).sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)));
}

/** Los estándar más los que pida el modelo (C6). */
export function resumenEstadistico(welford: EstadoWelford, digest: TDigest, adicionales: readonly number[] = []): ResumenEstadistico {
  const percentiles: Record<string, number> = {};
  for (const p of [...PERCENTILES_ESTANDAR, ...adicionales]) percentiles[clavePercentil(p)] = cuantilTDigest(digest, p);

  return {
    n: welford.n,
    media: welford.media,
    desviacion: Math.sqrt(varianzaPoblacional(welford)),
    min: welford.min,
    max: welford.max,
    percentiles,
    percentilesAproximados: true,
  };
}

export interface PuntoCDF {
  x: number;
  p: number;
}

/**
 * `puntos` valores de `(x, p)` a lo largo de toda la distribución, con `p`
 * espaciado uniformemente por el punto medio de cada tramo — evita los
 * extremos exactos 0 y 1, donde una cola no acotada no tiene un cuantil útil
 * que dibujar.
 */
export function curvaCDF(digest: TDigest, puntos = 100): PuntoCDF[] {
  const out: PuntoCDF[] = new Array(puntos);
  for (let i = 0; i < puntos; i++) {
    const p = (i + 0.5) / puntos;
    out[i] = { x: cuantilTDigest(digest, p), p };
  }
  return out;
}

export interface BinHistograma {
  x0: number;
  x1: number;
  count: number;
}

/** Formatea un `Histograma` (ver `histogram.ts`) como bins listos para un gráfico de barras. */
export function puntosHistograma(h: Histograma): BinHistograma[] {
  return Array.from(h.conteos, (count, i) => ({
    x0: h.min + i * h.ancho,
    x1: h.min + (i + 1) * h.ancho,
    count,
  }));
}
