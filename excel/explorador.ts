/**
 * El **explorador de distribución** (U3.1): lo que se enseña de una celda en
 * la ventana flotante —su histograma, su curva acumulada, sus estadísticas y
 * una muestra para los delimitadores que se arrastran—. Sin Office.js: lo
 * arma el panel con la última simulación y viaja a la ventana (en la URL al
 * abrirla y por mensaje al cambiar de celda). Ver `ui/explorador.tsx`.
 *
 * Una salida enseña su resultado; una entrada, lo que de verdad se muestreó
 * (con la distribución elegida encima). Sin simulación, una entrada del panel
 * enseña la forma de su distribución, sin estadísticas de muestra.
 */

import type { BinHistograma, MedidasRiesgo, PuntoCDF } from '../engine/stats/index.ts';
import { medidasDeRiesgo } from '../engine/stats/index.ts';
import { claveComparable } from './direcciones.ts';
import type { EntradaMuestreada } from './entradasMuestreadas.ts';
import type { ResultadoSalida, SimulacionCompletada } from './informe.ts';
import type { ColumnaIteraciones } from './iteraciones.ts';
import { reducirACuantiles } from './resultadosGuardados.ts';

export const VERSION_EXPLORADOR = 1;
/** Cuántos cuantiles viajan para los delimitadores: resolución de 0,2 puntos, y la URL no crece. */
export const CUANTILES_EXPLORADOR = 501;
export const PERCENTILES_EXPLORADOR = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99] as const;

export interface EstadisticasExplorador {
  n: number;
  media: number;
  desviacion: number;
  min: number;
  max: number;
  /** p1, p5, p10, p25, p50, p75, p90, p95, p99 (en ese orden). */
  percentiles: number[];
  riesgo?: MedidasRiesgo;
}

export interface VistaExplorador {
  version: typeof VERSION_EXPLORADOR;
  tipo: 'salida' | 'entrada';
  titulo: string;
  ref: string;
  fecha?: boolean;
  /** Una entrada: su distribución en palabras. */
  distribucion?: string;
  barras: BinHistograma[];
  /** Lo que esperaba la distribución teórica en cada barra (entradas). */
  esperado?: number[];
  cdf: PuntoCDF[];
  /** Cuantiles de la muestra (ordenados), para los delimitadores. */
  muestra: number[];
  estadisticas: EstadisticasExplorador;
  /** Las cifras salen de cuantiles guardados (resultados restaurados): aproximadas. */
  aproximada?: boolean;
  umbral?: { valor: number; sentido: 'below' | 'above' };
}

export type ResultadoVista = { ok: true; vista: VistaExplorador } | { ok: false; motivo: string };

const recortar = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(10)) : x);

function percentil(ordenada: ArrayLike<number>, p: number): number {
  const i = Math.min(ordenada.length - 1, Math.max(0, Math.round(p * (ordenada.length - 1))));
  return ordenada[i] as number;
}

/** Las estadísticas de una muestra ya ordenada (sin NaN). */
export function estadisticasDe(ordenada: Float64Array): EstadisticasExplorador {
  const n = ordenada.length;
  let suma = 0;
  for (let i = 0; i < n; i++) suma += ordenada[i] as number;
  const media = n > 0 ? suma / n : NaN;
  let m2 = 0;
  for (let i = 0; i < n; i++) m2 += ((ordenada[i] as number) - media) ** 2;
  const riesgo = medidasDeRiesgo(ordenada);
  return {
    n,
    media,
    desviacion: n > 1 ? Math.sqrt(m2 / (n - 1)) : 0,
    min: n > 0 ? (ordenada[0] as number) : NaN,
    max: n > 0 ? (ordenada[n - 1] as number) : NaN,
    percentiles: PERCENTILES_EXPLORADOR.map((p) => percentil(ordenada, p)),
    ...(riesgo ? { riesgo } : {}),
  };
}

export function vistaDeSalida(s: ResultadoSalida, umbral?: { value: number; direction: 'below' | 'above' }): ResultadoVista {
  if (s.categorias && s.categorias.length > 0) return { ok: false, motivo: `${s.nombre} es una salida de texto: sus frecuencias están en Resultados.` };
  if (!s.muestraOrdenada || s.muestraOrdenada.length < 2 || !s.histograma) {
    return { ok: false, motivo: `${s.nombre} no tiene muestra que enseñar (¿simulación cancelada?).` };
  }
  const est = estadisticasDe(s.muestraOrdenada);
  // La media y la desviación, las de la simulación entera (la muestra puede ser cuantiles).
  est.media = s.resumen.media;
  est.desviacion = s.resumen.desviacion;
  est.n = s.resumen.n;
  if (s.riesgo) est.riesgo = s.riesgo;
  return {
    ok: true,
    vista: {
      version: VERSION_EXPLORADOR,
      tipo: 'salida',
      titulo: s.nombre,
      ref: s.ref,
      ...(s.fecha ? { fecha: true } : {}),
      barras: s.histograma,
      cdf: s.cdf,
      muestra: reducirACuantiles(s.muestraOrdenada, CUANTILES_EXPLORADOR).map(recortar),
      estadisticas: est,
      ...(s.muestraReducida ? { aproximada: true } : {}),
      ...(umbral ? { umbral: { valor: umbral.value, sentido: umbral.direction } } : {}),
    },
  };
}

export function vistaDeEntrada(e: EntradaMuestreada, columna?: ColumnaIteraciones): ResultadoVista {
  if (e.frecuencias) return { ok: false, motivo: `${e.nombre} es una entrada de texto: sus frecuencias están en Resultados.` };
  const valores = columna ? Float64Array.from(columna.valores).filter((x) => Number.isFinite(x)).sort() : null;
  const est: EstadisticasExplorador = valores && valores.length > 1
    ? estadisticasDe(valores)
    : { n: e.n, media: e.media, desviacion: e.desviacion, min: e.min, max: e.max, percentiles: [] };
  return {
    ok: true,
    vista: {
      version: VERSION_EXPLORADOR,
      tipo: 'entrada',
      titulo: e.nombre,
      ref: e.ref,
      ...(e.fecha ? { fecha: true } : {}),
      distribucion: e.distribucion,
      barras: e.histograma,
      ...(e.esperado ? { esperado: e.esperado } : {}),
      cdf: e.cdf,
      muestra: valores ? reducirACuantiles(valores, CUANTILES_EXPLORADOR).map(recortar) : [],
      estadisticas: est,
    },
  };
}

/**
 * La vista de la celda seleccionada: una salida o una entrada de la última
 * simulación. Se busca por la celda (sin `$` ni mayúsculas que importen).
 */
export function vistaDeCelda(
  direccion: string,
  resultado: SimulacionCompletada | null,
  umbrales: ReadonlyMap<string, { value: number; direction: 'below' | 'above' }> = new Map(),
): ResultadoVista {
  if (!resultado) return { ok: false, motivo: 'Todavía no hay simulación: simula y vuelve a abrir el explorador.' };
  // Excel no distingue mayúsculas en los nombres de hoja ni en las celdas.
  const normal = (d: string) => claveComparable(d)?.toLowerCase();
  const clave = normal(direccion);
  const coincide = (ref: string) => clave !== undefined && normal(ref) === clave;
  const salida = resultado.salidas.find((s) => coincide(s.ref) || (s.clave !== undefined && coincide(s.clave)));
  if (salida) return vistaDeSalida(salida, umbrales.get(salida.id));
  const entrada = resultado.entradas?.find((e) => coincide(e.ref));
  if (entrada) return vistaDeEntrada(entrada, resultado.iteraciones?.entradas.find((c) => c.id === entrada.id));
  return {
    ok: false,
    motivo: `${direccion} no es una entrada ni una salida de la última simulación. Selecciona una celda amarilla (entrada), verde (salida) o con una función RIESGO.`,
  };
}

/** La primera salida numérica, para abrir el explorador sin nada seleccionado que sirva. */
export function vistaPorDefecto(resultado: SimulacionCompletada | null): ResultadoVista {
  if (!resultado) return vistaDeCelda('', null);
  for (const s of resultado.salidas) {
    const v = vistaDeSalida(s);
    if (v.ok) return v;
  }
  return { ok: false, motivo: 'La última simulación no tiene salidas numéricas que enseñar.' };
}

/** Una fila de la lista del modelo (U3.4). */
export interface FilaLista {
  nombre: string;
  ref: string;
  /** Entrada: su distribución en palabras. Salida de texto: el valor más frecuente. */
  detalle: string;
  /** Del panel, o de una función RIESGO escrita en la celda. */
  origen: 'panel' | 'funcion';
  fecha?: boolean;
  /** De la última simulación, si la hay. */
  media?: number;
  p5?: number;
  p95?: number;
}

export interface ListaModelo {
  entradas: FilaLista[];
  salidas: FilaLista[];
  /** Sin simulación, la lista enseña solo el modelo (sin cifras). */
  conSimulacion: boolean;
}

/**
 * Todas las entradas y salidas: las del panel y las que declaran las
 * funciones RIESGO del libro (esas solo se conocen tras simular), con sus
 * cifras de la última simulación. Una salida de texto enseña su valor más
 * frecuente.
 */
export function listaDelModelo(
  modelo: { inputs: readonly { id: string; name: string; ref: string }[]; outputs: readonly { id: string; name: string; ref: string }[] },
  resultado: SimulacionCompletada | null,
  resumir: (id: string) => string,
): ListaModelo {
  const muestreadas = new Map((resultado?.entradas ?? []).map((e) => [e.id, e] as const));
  const entradas: FilaLista[] = modelo.inputs.map((e) => {
    const m = muestreadas.get(e.id);
    return {
      nombre: e.name, ref: e.ref, detalle: m?.distribucion ?? resumir(e.id), origen: 'panel',
      ...(m?.fecha ? { fecha: true } : {}),
      ...(m && !m.frecuencias ? { media: m.media, p5: m.percentiles.p5, p95: m.percentiles.p95 } : {}),
    };
  });
  for (const f of resultado?.entradasDeFunciones ?? []) {
    const m = f.id ? muestreadas.get(f.id) : undefined;
    entradas.push({
      nombre: f.nombre && f.nombre !== f.ref ? f.nombre : f.ref, ref: f.ref, detalle: f.distribucion, origen: 'funcion',
      ...(m?.fecha ? { fecha: true } : {}),
      ...(m && !m.frecuencias ? { media: m.media, p5: m.percentiles.p5, p95: m.percentiles.p95 } : {}),
    });
  }
  const delPanel = new Set(modelo.outputs.map((o) => o.id));
  const salidas: FilaLista[] = resultado
    ? resultado.salidas.map((s) => {
        const moda = s.categorias?.[0];
        return {
          nombre: s.nombre, ref: s.ref, origen: delPanel.has(s.id) ? 'panel' : 'funcion',
          detalle: moda ? `«${moda.valor}» ${(moda.proporcion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : '',
          ...(s.fecha ? { fecha: true } : {}),
          ...(!moda && s.resumen.n > 0 ? { media: s.resumen.media, ...(s.resumen.percentiles.p5 !== undefined ? { p5: s.resumen.percentiles.p5 } : {}), ...(s.resumen.percentiles.p95 !== undefined ? { p95: s.resumen.percentiles.p95 } : {}) } : {}),
        } satisfies FilaLista;
      })
    : modelo.outputs.map((o) => ({ nombre: o.name, ref: o.ref, detalle: '', origen: 'panel' as const }));
  return { entradas, salidas, conSimulacion: resultado !== null };
}
