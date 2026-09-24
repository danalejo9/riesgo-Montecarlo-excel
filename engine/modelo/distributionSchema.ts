/**
 * Forma de una distribución tal como se persiste en `RiskModel v1`
 * (Fase 2 §7.2) — en inglés a propósito, a diferencia del resto del código:
 * es un producto comercial internacional (decisión 14 del handoff, §10), y
 * este es el único formato que un desarrollador externo o un archivo movido
 * entre libros de usuarios de habla no española va a leer directamente.
 *
 * Es una traducción 1:1 de `DescriptorDistribucion`
 * (`engine/distributions/descriptor.ts`), que sigue en español porque es
 * puramente interno (serialización hacia un Web Worker, nunca se guarda ni
 * lo lee un humano). `toDescriptor`/`fromDescriptor` son la frontera entre
 * los dos: el resto del motor (muestreo, ejecutor) no sabe que `RiskModel`
 * existe, y `RiskModel` no sabe que `DescriptorDistribucion` tiene nombres
 * en español — cada uno solo ve su propio idioma.
 */
import type { DescriptorDistribucion, ParametrizacionLognormal } from '../distributions/index.ts';

export type LognormalParametrization = 'variable' | 'log';

export type DistributionSpec =
  | { type: 'normal'; mean: number; stdDev: number }
  | { type: 'lognormal'; p1: number; p2: number; parametrization?: LognormalParametrization }
  | { type: 'uniform'; min: number; max: number }
  | { type: 'triangular'; min: number; mode: number; max: number }
  | { type: 'pert'; min: number; mode: number; max: number; lambda?: number }
  | { type: 'beta'; alpha: number; beta: number }
  | { type: 'gamma'; shape: number; scale: number }
  | { type: 'exponential'; lambda: number }
  | { type: 'weibull'; shape: number; scale: number }
  | { type: 'bernoulli'; p: number }
  | { type: 'binomial'; n: number; p: number }
  | { type: 'poisson'; lambda: number }
  | { type: 'discrete'; values: number[]; weights: number[] };

const PARAMETRIZACION_A_INGLES: Record<ParametrizacionLognormal, LognormalParametrization> = {
  variable: 'variable',
  logaritmo: 'log',
};
const PARAMETRIZACION_A_ESPANOL: Record<LognormalParametrization, ParametrizacionLognormal> = {
  variable: 'variable',
  log: 'logaritmo',
};

export function toDescriptor(spec: DistributionSpec): DescriptorDistribucion {
  switch (spec.type) {
    case 'normal': return { tipo: 'normal', media: spec.mean, desviacion: spec.stdDev };
    case 'lognormal':
      return {
        tipo: 'lognormal',
        p1: spec.p1,
        p2: spec.p2,
        parametrizacion: spec.parametrization ? PARAMETRIZACION_A_ESPANOL[spec.parametrization] : undefined,
      };
    case 'uniform': return { tipo: 'uniforme', min: spec.min, max: spec.max };
    case 'triangular': return { tipo: 'triangular', min: spec.min, moda: spec.mode, max: spec.max };
    case 'pert': return { tipo: 'pert', min: spec.min, moda: spec.mode, max: spec.max, lambda: spec.lambda };
    case 'beta': return { tipo: 'beta', alpha: spec.alpha, beta: spec.beta };
    case 'gamma': return { tipo: 'gamma', forma: spec.shape, escala: spec.scale };
    case 'exponential': return { tipo: 'exponencial', lambda: spec.lambda };
    case 'weibull': return { tipo: 'weibull', forma: spec.shape, escala: spec.scale };
    case 'bernoulli': return { tipo: 'bernoulli', p: spec.p };
    case 'binomial': return { tipo: 'binomial', n: spec.n, p: spec.p };
    case 'poisson': return { tipo: 'poisson', lambda: spec.lambda };
    case 'discrete': return { tipo: 'discreta', valores: spec.values, pesos: spec.weights };
    default:
      // `spec` puede venir de JSON sin validar (workbook.settings): a
      // diferencia de un `switch` sobre un tipo ya comprobado por TypeScript,
      // aquí un `type` desconocido es un dato real, no un caso imposible.
      throw new Error(`Tipo de distribución no reconocido: ${JSON.stringify((spec as { type?: unknown }).type)}`);
  }
}

export function fromDescriptor(d: DescriptorDistribucion): DistributionSpec {
  switch (d.tipo) {
    case 'normal': return { type: 'normal', mean: d.media, stdDev: d.desviacion };
    case 'lognormal':
      return {
        type: 'lognormal',
        p1: d.p1,
        p2: d.p2,
        parametrization: d.parametrizacion ? PARAMETRIZACION_A_INGLES[d.parametrizacion] : undefined,
      };
    case 'uniforme': return { type: 'uniform', min: d.min, max: d.max };
    case 'triangular': return { type: 'triangular', min: d.min, mode: d.moda, max: d.max };
    case 'pert': return { type: 'pert', min: d.min, mode: d.moda, max: d.max, lambda: d.lambda };
    case 'beta': return { type: 'beta', alpha: d.alpha, beta: d.beta };
    case 'gamma': return { type: 'gamma', shape: d.forma, scale: d.escala };
    case 'exponencial': return { type: 'exponential', lambda: d.lambda };
    case 'weibull': return { type: 'weibull', shape: d.forma, scale: d.escala };
    case 'bernoulli': return { type: 'bernoulli', p: d.p };
    case 'binomial': return { type: 'binomial', n: d.n, p: d.p };
    case 'poisson': return { type: 'poisson', lambda: d.lambda };
    case 'discreta': return { type: 'discrete', values: d.valores, weights: d.pesos };
    default:
      throw new Error(`Tipo de distribución no reconocido: ${JSON.stringify((d as { tipo?: unknown }).tipo)}`);
  }
}
