/**
 * La vista previa de una distribución mientras se edita (C5): su forma y sus
 * percentiles 5, 50 y 95, para no elegir parámetros a ciegas. Sin Office.js.
 *
 * Todas las distribuciones del motor saben dar su función de distribución
 * (`cdf`) y sus cuantiles, así que la curva sale de ahí: la densidad se
 * aproxima por diferencias de la acumulada en una rejilla entre el 0,1 % y el
 * 99,9 %, y las discretas enseñan barras con la probabilidad de cada valor.
 */

import { construirDesdeDescriptor } from '../distributions/index.ts';
import { toDescriptor, type DistributionSpec } from './distributionSchema.ts';

export type VistaPrevia =
  | {
      tipo: 'continua';
      puntos: { x: number; y: number }[];
      p5: number;
      p50: number;
      p95: number;
      media: number;
    }
  | {
      tipo: 'discreta';
      barras: { etiqueta: string; x?: number; p: number }[];
      p5?: number;
      p50?: number;
      p95?: number;
      media?: number;
    };

const PUNTOS = 80;
const MAX_BARRAS = 40;

export function vistaPrevia(spec: DistributionSpec): VistaPrevia | null {
  try {
    if (spec.type === 'categorical') {
      const total = spec.weights.reduce((a, b) => a + b, 0) || 1;
      return { tipo: 'discreta', barras: spec.categories.map((c, i) => ({ etiqueta: c, p: (spec.weights[i] ?? 0) / total })) };
    }
    const dist = construirDesdeDescriptor(toDescriptor(spec));
    const q = (u: number) => dist.quantile(u);
    const media = dist.mean();

    if (spec.type === 'discrete') {
      const total = spec.weights.reduce((a, b) => a + b, 0) || 1;
      const pares = spec.values.map((v, i) => ({ x: v, p: (spec.weights[i] ?? 0) / total })).sort((a, b) => a.x - b.x);
      return { tipo: 'discreta', barras: pares.map((b) => ({ etiqueta: String(b.x), x: b.x, p: b.p })), p5: q(0.05), p50: q(0.5), p95: q(0.95), media };
    }
    if (spec.type === 'bernoulli' || spec.type === 'binomial' || spec.type === 'poisson') {
      const desde = Math.floor(q(0.0005));
      const hasta = Math.ceil(q(0.9995));
      const paso = Math.max(1, Math.ceil((hasta - desde + 1) / MAX_BARRAS));
      const barras: { etiqueta: string; x: number; p: number }[] = [];
      for (let k = desde; k <= hasta; k += paso) {
        const p = dist.cdf(k + paso - 1) - dist.cdf(k - 1);
        barras.push({ etiqueta: paso === 1 ? String(k) : `${k}–${k + paso - 1}`, x: k, p });
      }
      return { tipo: 'discreta', barras, p5: q(0.05), p50: q(0.5), p95: q(0.95), media };
    }

    const a = q(0.001);
    const b = q(0.999);
    if (!(b > a) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    const h = (b - a) / PUNTOS;
    const puntos: { x: number; y: number }[] = [];
    for (let i = 0; i <= PUNTOS; i++) {
      const x = a + i * h;
      const y = (dist.cdf(x + h / 2) - dist.cdf(x - h / 2)) / h;
      puntos.push({ x, y: Number.isFinite(y) && y > 0 ? y : 0 });
    }
    return { tipo: 'continua', puntos, p5: q(0.05), p50: q(0.5), p95: q(0.95), media };
  } catch {
    return null;
  }
}
