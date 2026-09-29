/**
 * Lo que enseña una celda `RIESGO.*` fuera de la simulación (B2, «modo del
 * libro»). Sin Office.js.
 *
 * - **Valores fijos** (por defecto): un estadístico de la distribución, a
 *   elegir entre la media (lo de siempre), la mediana, la moda o un percentil.
 *   El libro calcula como un modelo determinista con ese valor.
 * - **Aleatorio**: un valor sorteado en cada recálculo (F9 vuelve a sortear),
 *   para ver cómo se mueve el modelo sin simular.
 *
 * La simulación no usa nada de esto: sus muestras las pone el motor.
 */

import { construirDesdeDescriptor } from '../distributions/index.ts';
import { toDescriptor, type DistributionSpec } from './distributionSchema.ts';

export type EstadisticoFijo =
  | { tipo: 'media' }
  | { tipo: 'mediana' }
  | { tipo: 'moda' }
  | { tipo: 'percentil'; p: number };

export interface ModoLibro {
  modo: 'fijo' | 'aleatorio';
  fijo: EstadisticoFijo;
}

export const MODO_POR_DEFECTO: ModoLibro = { modo: 'fijo', fijo: { tipo: 'media' } };

/** El valor más probable. En las continuas, el máximo de la densidad. */
export function modaDe(spec: DistributionSpec): number | string {
  const acotar = (x: number) => Math.min(spec.truncate?.max ?? Infinity, Math.max(spec.truncate?.min ?? -Infinity, x));
  switch (spec.type) {
    case 'normal': return acotar(spec.mean);
    case 'lognormal': {
      // Con los parámetros del logaritmo (mu, sigma): exp(mu − sigma²).
      const [mu, sigma2] = spec.parametrization === 'log'
        ? [spec.p1, spec.p2 * spec.p2]
        : (() => {
            const s2 = Math.log(1 + (spec.p2 * spec.p2) / (spec.p1 * spec.p1));
            return [Math.log(spec.p1) - s2 / 2, s2] as const;
          })();
      return acotar(Math.exp(mu - sigma2));
    }
    case 'uniform': return acotar((spec.min + spec.max) / 2); // todas igual de probables: el centro
    case 'triangular':
    case 'pert': return acotar(spec.mode);
    case 'beta': {
      const { alpha: a, beta: b } = spec;
      if (a > 1 && b > 1) return acotar((a - 1) / (a + b - 2));
      return acotar(a < b ? 0 : a > b ? 1 : 0.5);
    }
    case 'gamma': return acotar(spec.shape >= 1 ? (spec.shape - 1) * spec.scale : 0);
    case 'exponential': return acotar(0);
    case 'weibull': return acotar(spec.shape > 1 ? spec.scale * ((spec.shape - 1) / spec.shape) ** (1 / spec.shape) : 0);
    case 'bernoulli': return spec.p > 0.5 ? 1 : 0;
    case 'binomial': return Math.min(spec.n, Math.floor((spec.n + 1) * spec.p));
    case 'poisson': return Math.floor(spec.lambda);
    case 'discrete': {
      let mejor = 0;
      spec.weights.forEach((w, i) => {
        if (w > (spec.weights[mejor] as number)) mejor = i;
      });
      return spec.values[mejor] as number;
    }
    case 'categorical': {
      let mejor = 0;
      spec.weights.forEach((w, i) => {
        if (w > (spec.weights[mejor] as number)) mejor = i;
      });
      return spec.categories[mejor] as string;
    }
  }
}

/** El valor fijo de una distribución según el estadístico elegido. */
export function valorFijo(spec: DistributionSpec, e: EstadisticoFijo): number | string {
  // Una entrada de texto no tiene media ni percentiles: su valor más probable.
  if (spec.type === 'categorical' || e.tipo === 'moda') return modaDe(spec);
  const d = construirDesdeDescriptor(toDescriptor(spec));
  switch (e.tipo) {
    case 'media': return d.mean();
    case 'mediana': return d.quantile(0.5);
    case 'percentil': return d.quantile(Math.min(1 - 1e-9, Math.max(1e-9, e.p)));
  }
}

/** Un valor al azar de la distribución, con `u` uniforme en (0,1). */
export function valorAleatorio(spec: DistributionSpec, u: number): number | string {
  if (spec.type === 'categorical') {
    const total = spec.weights.reduce((a, b) => a + b, 0);
    let acumulado = 0;
    for (let i = 0; i < spec.categories.length; i++) {
      acumulado += (spec.weights[i] as number) / total;
      if (u < acumulado) return spec.categories[i] as string;
    }
    return spec.categories[spec.categories.length - 1] as string;
  }
  return construirDesdeDescriptor(toDescriptor(spec)).quantile(u);
}

/** Lo que enseña la celda en el modo del libro. */
export function valorEnModo(spec: DistributionSpec, modo: ModoLibro, aleatorio: () => number = Math.random): number | string {
  if (modo.modo === 'aleatorio') {
    let u = aleatorio();
    while (u <= 0 || u >= 1) u = aleatorio();
    return valorAleatorio(spec, u);
  }
  return valorFijo(spec, modo.fijo);
}

/** Lee un modo guardado; lo que no se entienda, por defecto. */
export function leerModoLibro(texto: string | null | undefined): ModoLibro {
  if (!texto) return MODO_POR_DEFECTO;
  try {
    const j = JSON.parse(texto) as Partial<ModoLibro>;
    const modo = j.modo === 'aleatorio' ? 'aleatorio' : 'fijo';
    const f = j.fijo as Partial<EstadisticoFijo> | undefined;
    const fijo: EstadisticoFijo =
      f?.tipo === 'mediana' || f?.tipo === 'moda' ? { tipo: f.tipo }
      : f?.tipo === 'percentil' && typeof (f as { p?: unknown }).p === 'number' && (f as { p: number }).p > 0 && (f as { p: number }).p < 1
        ? { tipo: 'percentil', p: (f as { p: number }).p }
        : { tipo: 'media' };
    return { modo, fijo };
  } catch {
    return MODO_POR_DEFECTO;
  }
}

/** En palabras, para el panel: «la media», «el percentil 90»… */
export function describirEstadistico(e: EstadisticoFijo): string {
  switch (e.tipo) {
    case 'media': return 'la media';
    case 'mediana': return 'la mediana';
    case 'moda': return 'la moda (el valor más probable)';
    case 'percentil': return `el percentil ${Math.round(e.p * 1000) / 10}`;
  }
}
