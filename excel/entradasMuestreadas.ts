/**
 * Cómo se muestreó cada entrada (C9): con los valores que de verdad se
 * generaron en la simulación, sus estadísticos, su histograma y su curva
 * acumulada, y lo que la distribución elegida esperaba en cada barra, para
 * poder comprobar de un vistazo que el modelo usó lo que se quería. Sin
 * Office.js.
 *
 * Sale gratis: las muestras de las entradas ya se guardan (las primeras
 * 100.000 iteraciones) para el tornado.
 */

import { construirDesdeDescriptor } from '../engine/distributions/index.ts';
import { esDiscretaEntera, PREFIJO_DINAMICA, resumirDistribucion, toDescriptor, type ModeloRiesgo } from '../engine/modelo/index.ts';
import { histogramaDeMuestra, ordenarUtiles, type BinHistograma, type PuntoCDF } from '../engine/stats/index.ts';

export interface EntradaMuestreada {
  id: string;
  nombre: string;
  ref: string;
  /** Con formato de fecha en su celda (T7). */
  fecha?: boolean;
  /** La distribución elegida, en palabras: «Triangular(105; 120; 140)». */
  distribucion: string;
  n: number;
  media: number;
  desviacion: number;
  min: number;
  max: number;
  percentiles: { p5: number; p50: number; p95: number };
  /** Media y desviación de la distribución teórica, para compararlas. */
  teorica?: { media: number; desviacion: number };
  histograma: BinHistograma[];
  /** Iteraciones que la distribución teórica esperaba en cada barra. */
  esperado?: number[];
  cdf: PuntoCDF[];
  /** Entradas de texto (T1): cada categoría, cuántas veces salió y cuántas se esperaban. */
  frecuencias?: { valor: string; conteo: number; proporcion: number; esperada: number }[];
}

const PUNTOS_CDF = 51;

function percentil(ordenada: Float64Array, p: number): number {
  const i = Math.min(ordenada.length - 1, Math.max(0, Math.round(p * (ordenada.length - 1))));
  return ordenada[i] as number;
}

export function entradasMuestreadas(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
): EntradaMuestreada[] {
  const out: EntradaMuestreada[] = [];
  modelo.inputs.forEach((e, i) => {
    // Las entradas de apoyo de B7 son un uniforme técnico (0,1): enseñarlo
    // como «lo que se muestreó» confundiría más que aclarar.
    if (e.id.startsWith(PREFIJO_DINAMICA)) return;
    const muestras = muestrasPorClave.get(clavesEntrada[i] as string);
    if (!muestras || muestras.length === 0) return;
    if (e.dist.type === 'categorical') {
      const nombres = e.dist.categories;
      const pesos = e.dist.weights;
      const totalPesos = pesos.reduce((a, b) => a + b, 0) || 1;
      const conteos = nombres.map(() => 0);
      for (let k = 0; k < muestras.length; k++) {
        const c = Math.round(muestras[k] as number);
        if (c >= 0 && c < conteos.length) conteos[c] = (conteos[c] as number) + 1;
      }
      const n = muestras.length;
      out.push({
        id: e.id, nombre: e.name, ref: e.ref, distribucion: resumirDistribucion(e.dist),
        n, media: NaN, desviacion: NaN, min: NaN, max: NaN, percentiles: { p5: NaN, p50: NaN, p95: NaN },
        histograma: [], cdf: [],
        frecuencias: nombres.map((valor, c) => ({
          valor, conteo: conteos[c] as number, proporcion: (conteos[c] as number) / n, esperada: (pesos[c] ?? 0) / totalPesos,
        })),
      });
      return;
    }
    const ordenada = ordenarUtiles(muestras);
    const n = ordenada.length;
    if (n === 0) return;

    let suma = 0;
    for (let k = 0; k < n; k++) suma += ordenada[k] as number;
    const media = suma / n;
    let m2 = 0;
    for (let k = 0; k < n; k++) m2 += ((ordenada[k] as number) - media) ** 2;
    const desviacion = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;

    const histograma = histogramaDeMuestra(ordenada);
    const cdf: PuntoCDF[] = Array.from({ length: PUNTOS_CDF }, (_, k) => {
      const p = k / (PUNTOS_CDF - 1);
      return { x: percentil(ordenada, p), p };
    });

    let teorica: EntradaMuestreada['teorica'];
    let esperado: number[] | undefined;
    try {
      const dist = construirDesdeDescriptor(toDescriptor(e.dist));
      teorica = { media: dist.mean(), desviacion: Math.sqrt(dist.variance()) };
      // Las discretas no tienen una curva que dibujar encima de las barras.
      if (e.dist.type !== 'discrete' && !esDiscretaEntera(e.dist.type)) {
        esperado = histograma.map((b) => n * Math.max(0, dist.cdf(b.x1) - dist.cdf(b.x0)));
      }
    } catch {
      // Sin distribución teórica legible se enseña solo lo muestreado.
    }

    out.push({
      id: e.id,
      nombre: e.name,
      ref: e.ref,
      distribucion: resumirDistribucion(e.dist),
      n, media, desviacion,
      min: ordenada[0] as number,
      max: ordenada[n - 1] as number,
      percentiles: { p5: percentil(ordenada, 0.05), p50: percentil(ordenada, 0.5), p95: percentil(ordenada, 0.95) },
      ...(teorica ? { teorica } : {}),
      histograma,
      ...(esperado ? { esperado } : {}),
      cdf,
    });
  });
  return out;
}
