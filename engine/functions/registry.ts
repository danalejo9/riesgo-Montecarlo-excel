/**
 * Registro de funciones vectorizadas disponibles para el compilador.
 *
 * Deliberadamente pequeño todavía: es el subconjunto numérico de Nivel 0 (ver
 * types.ts para el alcance exacto). Cada función nueva se añade aquí como una
 * entrada más — es justo la propiedad de "añadir cobertura es barato" que
 * pide la decisión 16 del handoff, ahora que el producto es para público
 * abierto y el catálogo nunca estará completo.
 */

import {
  ABS, AVERAGE, COUNT, EXP, INT, LN, LOG, LOG10, MAX, MEDIAN, MIN, MOD,
  POWER, PRODUCT, ROUND, ROUNDDOWN, ROUNDUP, SIGN, SQRT, STDEV_P, STDEV_S,
  SUM, TRUNC, VAR_P, VAR_S,
} from './math.ts';
import { AND, IF, NOT, OR, XOR } from './logic.ts';
import type { FuncionNivel0 } from './types.ts';

export const REGISTRO_NIVEL_0: Record<string, FuncionNivel0> = {
  SUM, PRODUCT, MIN, MAX, COUNT, AVERAGE, MEDIAN,
  'STDEV.S': STDEV_S, 'STDEV.P': STDEV_P, 'VAR.S': VAR_S, 'VAR.P': VAR_P,
  ABS, SIGN, SQRT, INT, EXP, LN, LOG, LOG10, POWER, MOD,
  ROUND, ROUNDUP, ROUNDDOWN, TRUNC,
  IF, AND, OR, NOT, XOR,
};

export function funcionSoportada(nombre: string): boolean {
  return Object.prototype.hasOwnProperty.call(REGISTRO_NIVEL_0, nombre.toUpperCase());
}

export function obtenerFuncion(nombre: string): FuncionNivel0 | undefined {
  return REGISTRO_NIVEL_0[nombre.toUpperCase()];
}
