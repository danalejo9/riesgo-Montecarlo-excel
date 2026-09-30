/**
 * Forma serializable de una distribución: `{ tipo, ...parámetros }`, todo
 * datos planos, sin funciones. Hacen falta dos formas de la misma
 * distribución porque una `Distribution` (`types.ts`) es un objeto con
 * closures (`quantile`, `cdf`) — no se puede clonar entre hilos ni guardar en
 * JSON. Un `DescriptorDistribucion` sí: es literalmente el formato que
 * `RiskModel v1` va a persistir en `workbook.settings` (Fase 2 §7.2, campo
 * `dist`), y es también lo que viaja a un Web Worker cuando el ejecutor por
 * bloques (`engine/executor/`) reparte el trabajo — cada worker reconstruye
 * su propia `Distribution` a partir del descriptor, en vez de intentar clonar
 * un objeto con funciones.
 *
 * Quedan fuera por ahora `empirical` y `truncar`: la primera tiene una forma
 * más rica (lista de puntos de control) y la segunda envuelve otra
 * distribución en vez de ser una hoja — se añaden cuando haga falta
 * serializarlas, no antes.
 */
import { bernoulli } from './bernoulli.ts';
import { beta } from './beta.ts';
import { binomial } from './binomial.ts';
import { discrete } from './discrete.ts';
import { exponential, gamma } from './gamma.ts';
import { lognormal, type ParametrizacionLognormal } from './lognormal.ts';
import { normal } from './normal.ts';
import { pert } from './pert.ts';
import { poisson } from './poisson.ts';
import { triangular } from './triangular.ts';
import { truncar } from './truncate.ts';
import type { Distribution } from './types.ts';
import { uniform } from './uniform.ts';
import { weibull } from './weibull.ts';
import { logistica, logLogistica, pareto, student } from './continuasB5.ts';
import { binomialNegativa, geometrica, hipergeometrica, uniformeEntera } from './discretasB5.ts';
import { trigen } from './trigen.ts';
import { histograma } from './histograma.ts';

export type DescriptorBase =
  | { tipo: 'normal'; media: number; desviacion: number }
  | { tipo: 'lognormal'; p1: number; p2: number; parametrizacion?: ParametrizacionLognormal }
  | { tipo: 'uniforme'; min: number; max: number }
  | { tipo: 'triangular'; min: number; moda: number; max: number }
  | { tipo: 'pert'; min: number; moda: number; max: number; lambda?: number }
  | { tipo: 'beta'; alpha: number; beta: number }
  | { tipo: 'gamma'; forma: number; escala: number }
  | { tipo: 'exponencial'; lambda: number }
  | { tipo: 'weibull'; forma: number; escala: number }
  | { tipo: 'bernoulli'; p: number }
  | { tipo: 'binomial'; n: number; p: number }
  | { tipo: 'poisson'; lambda: number }
  | { tipo: 'discreta'; valores: number[]; pesos: number[] }
  // B5
  | { tipo: 'student'; gl: number; centro: number; escala: number }
  | { tipo: 'logistica'; media: number; escala: number }
  | { tipo: 'loglogistica'; escala: number; forma: number }
  | { tipo: 'pareto'; minimo: number; forma: number }
  | { tipo: 'geometrica'; p: number }
  | { tipo: 'binomialNegativa'; r: number; p: number }
  | { tipo: 'hipergeometrica'; n: number; exitos: number; poblacion: number }
  | { tipo: 'uniformeEntera'; min: number; max: number }
  | { tipo: 'trigen'; inferior: number; moda: number; superior: number; pInferior: number; pSuperior: number }
  | { tipo: 'histograma'; min: number; max: number; pesos: number[] };

/**
 * Una distribución, opcionalmente **acotada** (B4): la masa fuera de
 * `[min, max]` se descarta y se reescala (`truncate.ts`). Cualquiera de los
 * dos límites puede faltar.
 */
export type DescriptorDistribucion = DescriptorBase & { truncado?: { min?: number; max?: number } };

export function construirDesdeDescriptor(d: DescriptorDistribucion): Distribution {
  const base = construirBase(d);
  if (!d.truncado || (d.truncado.min === undefined && d.truncado.max === undefined)) return base;
  return truncar(base, d.truncado.min ?? -Infinity, d.truncado.max ?? Infinity);
}

function construirBase(d: DescriptorBase): Distribution {
  switch (d.tipo) {
    case 'normal': return normal(d.media, d.desviacion);
    case 'lognormal': return lognormal(d.p1, d.p2, d.parametrizacion);
    case 'uniforme': return uniform(d.min, d.max);
    case 'triangular': return triangular(d.min, d.moda, d.max);
    case 'pert': return pert(d.min, d.moda, d.max, d.lambda);
    case 'beta': return beta(d.alpha, d.beta);
    case 'gamma': return gamma(d.forma, d.escala);
    case 'exponencial': return exponential(d.lambda);
    case 'weibull': return weibull(d.forma, d.escala);
    case 'bernoulli': return bernoulli(d.p);
    case 'binomial': return binomial(d.n, d.p);
    case 'poisson': return poisson(d.lambda);
    case 'discreta': return discrete(d.valores, d.pesos);
    case 'student': return student(d.gl, d.centro, d.escala);
    case 'logistica': return logistica(d.media, d.escala);
    case 'loglogistica': return logLogistica(d.escala, d.forma);
    case 'pareto': return pareto(d.minimo, d.forma);
    case 'geometrica': return geometrica(d.p);
    case 'binomialNegativa': return binomialNegativa(d.r, d.p);
    case 'hipergeometrica': return hipergeometrica(d.n, d.exitos, d.poblacion);
    case 'uniformeEntera': return uniformeEntera(d.min, d.max);
    case 'trigen': return trigen(d.inferior, d.moda, d.superior, d.pInferior, d.pSuperior);
    case 'histograma': return histograma(d.min, d.max, d.pesos);
  }
}
