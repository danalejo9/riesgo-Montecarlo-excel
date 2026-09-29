/**
 * Trigen (B5): una triangular dada por dos percentiles en vez de por su
 * mínimo y su máximo («el 10 % de las veces baja de 80, el 10 % sube de
 * 150»), que es como suelen dar sus estimaciones los expertos. Se resuelven el
 * mínimo y el máximo de verdad y se construye la triangular.
 */
import { triangular } from './triangular.ts';
import type { Distribution } from './types.ts';

export function limitesTrigen(inferior: number, moda: number, superior: number, pInferior: number, pSuperior: number): { min: number; max: number } {
  if (!(inferior <= moda && moda <= superior && inferior < superior)) {
    throw new Error(`TRIGEN: hace falta inferior ≤ moda ≤ superior (inferior=${inferior}, moda=${moda}, superior=${superior})`);
  }
  if (!(pInferior >= 0 && pInferior < pSuperior && pSuperior <= 1)) {
    throw new Error(`TRIGEN: los percentiles tienen que cumplir 0 ≤ p inferior < p superior ≤ 1 (p inferior=${pInferior}, p superior=${pSuperior})`);
  }
  if ((pInferior > 0 && inferior === moda) || (pSuperior < 1 && superior === moda)) {
    throw new Error('TRIGEN: con un percentil distinto de 0 (o de 1), su valor no puede coincidir con la moda');
  }
  // Punto fijo: con el mínimo a y el máximo b de la triangular,
  // F(inferior) = (inferior − a)² / ((b − a)(moda − a)) = pInferior y
  // 1 − F(superior) = (b − superior)² / ((b − a)(b − moda)) = 1 − pSuperior.
  let a = inferior;
  let b = superior;
  for (let i = 0; i < 500; i++) {
    const na = inferior - Math.sqrt(pInferior * (b - a) * (moda - a));
    const nb = superior + Math.sqrt((1 - pSuperior) * (b - a) * (b - moda));
    const cambio = Math.abs(na - a) + Math.abs(nb - b);
    a = na;
    b = nb;
    if (!(Number.isFinite(a) && Number.isFinite(b))) throw new Error('TRIGEN: no se pudo resolver la triangular con esos percentiles');
    if (cambio < 1e-12 * (1 + Math.abs(a) + Math.abs(b))) break;
  }
  return { min: a, max: b };
}

export function trigen(inferior: number, moda: number, superior: number, pInferior: number, pSuperior: number): Distribution {
  const { min, max } = limitesTrigen(inferior, moda, superior, pInferior, pSuperior);
  return triangular(min, moda, max);
}
