import type { Distribution } from '../distributions/types.ts';
import type { Buffer } from '../values/buffer.ts';
import { muestrearLHS } from './lhs.ts';
import { muestrearMonteCarlo } from './montecarlo.ts';
import type { MetodoMuestreo } from './types.ts';

export { correlacionarImanConover, esDefinidaPositiva } from './correlate.ts';
export { muestrearLHS } from './lhs.ts';
export { muestrearMonteCarlo, muestrearMonteCarloBloque } from './montecarlo.ts';
export type { MetodoMuestreo } from './types.ts';

/**
 * Genera el buffer de `n` muestras de una variable de entrada, con el
 * método seleccionado (D10). Punto de entrada único para el adaptador de
 * Excel y para los tests: no hace falta saber si el método es Monte Carlo o
 * LHS para llamarlo, solo declararlo en `settings.sampling` del modelo
 * (Fase 2 §7.2).
 */
export function generarEntrada(
  dist: Distribution,
  id: string,
  seed: number,
  n: number,
  metodo: MetodoMuestreo,
): Buffer {
  return metodo === 'lhs' ? muestrearLHS(dist, id, seed, n) : muestrearMonteCarlo(dist, id, seed, n);
}
export { correlacionMasCercana, autodescomposicion, type CorreccionHigham } from './higham.ts';
