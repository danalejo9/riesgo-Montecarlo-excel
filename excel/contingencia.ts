/**
 * Contingencia y probabilidad de cumplir el valor base (V1). Sin Office.js.
 *
 * El **valor base** es lo que enseña la hoja sin incertidumbre (el modo
 * «Valores fijos» del libro): la estimación determinista de siempre, la que
 * se presentaría sin simular. La simulación dice cuánto se puede fiar uno de
 * ella:
 *
 * - en un **coste o un plazo** (malo si sube): la probabilidad de no pasarse
 *   del base y la **reserva** que haría falta para tener un 50, 80 o 90 % de
 *   confianza (P80 − base, en la práctica de riesgo de costes);
 * - en un **beneficio** (malo si baja): la probabilidad de alcanzar el base y
 *   lo que se obtiene con esa confianza (P20 para un 80 %), y cuánto queda por
 *   debajo del base.
 */

import type { EstadisticoFijo } from '../engine/modelo/valorFijo.ts';

export type ClaseSalida = 'cost' | 'benefit';

/** Con qué valor fijo enseñan las funciones RIESGO la hoja base: «la media». */
export function textoEstadistico(f: EstadisticoFijo): string {
  switch (f.tipo) {
    case 'media': return 'la media';
    case 'mediana': return 'la mediana';
    case 'moda': return 'el valor más probable';
    default: return `el percentil ${Math.round(f.p * 100)}`;
  }
}

export const CONFIANZAS = [0.5, 0.8, 0.9] as const;

/** Por el nombre, una primera propuesta (el usuario la cambia en el panel). */
export function claseSugerida(nombre: string): ClaseSalida {
  const n = nombre.toLowerCase();
  if (/\b(van|vpn|npv|tir|irr|beneficio|ingreso|venta|margen|utilidad|ganancia|rentabilidad|ahorro|valor final|flujo)/.test(n)) return 'benefit';
  return 'cost';
}

export interface NivelContingencia {
  confianza: number;
  /** El percentil que da esa confianza: P80 en un coste, P20 en un beneficio. */
  percentil: number;
  valor: number;
  /** Coste: valor − base (la reserva). Beneficio: base − valor (lo que se queda por debajo). */
  diferencia: number;
  /** La diferencia sobre |base|; `null` si el base es 0. */
  relativa: number | null;
}

export interface Contingencia {
  base: number;
  clase: ClaseSalida;
  /** Coste: P(salida ≤ base). Beneficio: P(salida ≥ base). */
  probabilidadBase: number;
  niveles: NivelContingencia[];
}

function cuantil(ordenada: ArrayLike<number>, p: number): number {
  const i = Math.min(ordenada.length - 1, Math.max(0, Math.round(p * (ordenada.length - 1))));
  return ordenada[i] as number;
}

/** Cuántos valores quedan por debajo de x (o en x, con `incluir`), en una muestra ordenada. */
function contar(ordenada: ArrayLike<number>, x: number, incluir: boolean): number {
  let lo = 0;
  let hi = ordenada.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    const v = ordenada[m] as number;
    if (v < x || (incluir && v === x)) lo = m + 1;
    else hi = m;
  }
  return lo;
}

export function contingencia(ordenada: ArrayLike<number>, base: number, clase: ClaseSalida): Contingencia | null {
  const n = ordenada.length;
  if (n < 2 || !Number.isFinite(base)) return null;
  const probabilidadBase = clase === 'cost' ? contar(ordenada, base, true) / n : 1 - contar(ordenada, base, false) / n;
  const niveles = CONFIANZAS.map((c) => {
    const percentil = clase === 'cost' ? c : 1 - c;
    const valor = cuantil(ordenada, percentil);
    const diferencia = clase === 'cost' ? valor - base : base - valor;
    return { confianza: c, percentil, valor, diferencia, relativa: base !== 0 ? diferencia / Math.abs(base) : null };
  });
  return { base, clase, probabilidadBase, niveles };
}
