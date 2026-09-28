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
import { construirDesdeDescriptor, type DescriptorDistribucion, type ParametrizacionLognormal } from '../distributions/index.ts';

export type LognormalParametrization = 'variable' | 'log';

export type DistributionSpec = BaseSpec & {
  /** Acotada (B4): se descarta lo que cae fuera de [min, max]. Cualquiera de los dos puede faltar. */
  truncate?: { min?: number; max?: number };
};

type BaseSpec =
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
  | { type: 'discrete'; values: number[]; weights: number[] }
  /**
   * Una entrada de **texto** (T1): «Norte» con peso 20, «Sur» con 25… Se
   * muestrea como el índice de la categoría (una discreta 0..m−1), y el
   * motor pone el texto en la celda justo antes de calcular. Así el muestreo,
   * el hipercubo latino, las correlaciones y la reproducibilidad son los de
   * siempre.
   */
  | { type: 'categorical'; categories: string[]; weights: number[] };

/** Límite de categorías de una entrada de texto: más no se leen en un panel. */
export const MAXIMO_CATEGORIAS = 200;

/** Las categorías de una entrada de texto, o `undefined` si es numérica. */
export function categoriasDe(spec: DistributionSpec): readonly string[] | undefined {
  return spec.type === 'categorical' ? spec.categories : undefined;
}

const PARAMETRIZACION_A_INGLES: Record<ParametrizacionLognormal, LognormalParametrization> = {
  variable: 'variable',
  logaritmo: 'log',
};
const PARAMETRIZACION_A_ESPANOL: Record<LognormalParametrization, ParametrizacionLognormal> = {
  variable: 'variable',
  log: 'logaritmo',
};

export function toDescriptor(spec: DistributionSpec): DescriptorDistribucion {
  const base = descriptorBase(spec);
  const t = spec.truncate;
  if (!t || (t.min === undefined && t.max === undefined)) return base;
  if (spec.type === 'categorical') throw new Error('Una entrada de texto no se puede acotar');
  if ((t.min !== undefined && !Number.isFinite(t.min)) || (t.max !== undefined && !Number.isFinite(t.max))) {
    throw new Error('Los límites de la distribución acotada tienen que ser números');
  }
  return { ...base, truncado: { ...(t.min !== undefined ? { min: t.min } : {}), ...(t.max !== undefined ? { max: t.max } : {}) } };
}

function descriptorBase(spec: DistributionSpec): DescriptorDistribucion {
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
    case 'categorical': {
      const c = spec.categories;
      if (!Array.isArray(c) || c.length === 0) throw new Error('CATEGÓRICA: hace falta al menos una categoría');
      if (c.length > MAXIMO_CATEGORIAS) throw new Error(`CATEGÓRICA: como mucho ${MAXIMO_CATEGORIAS} categorías`);
      if (!c.every((x) => typeof x === 'string' && x.trim() !== '')) throw new Error('CATEGÓRICA: cada categoría tiene que ser un texto no vacío');
      if (new Set(c).size !== c.length) throw new Error('CATEGÓRICA: hay categorías repetidas');
      if (!Array.isArray(spec.weights) || spec.weights.length !== c.length) {
        throw new Error('CATEGÓRICA: tiene que haber un peso por categoría');
      }
      return { tipo: 'discreta', valores: c.map((_, i) => i), pesos: spec.weights };
    }
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

/**
 * Por qué una distribución no se puede muestrear tal como está (mínimo mayor
 * que la moda, desviación negativa…), o `null` si es válida. Lo usa el editor
 * del panel para avisar sin guardar, en vez de dejar que el guardado falle.
 */
export function problemaDeDistribucion(spec: DistributionSpec): string | null {
  try {
    construirDesdeDescriptor(toDescriptor(spec));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
