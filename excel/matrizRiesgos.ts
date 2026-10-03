/**
 * La matriz de probabilidad e impacto del registro de riesgos (V2): la
 * cuadrícula 5 × 5 de la gestión de riesgos, con cada `RIESGO.EVENTO` en su
 * casilla y el color de su severidad. Sin Office.js.
 *
 * - **Probabilidad**, en las bandas habituales: muy baja (< 10 %), baja
 *   (10–30 %), media (30–50 %), alta (50–70 %) y muy alta (≥ 70 %).
 * - **Impacto medio**, frente al **mayor del registro**, en una escala que se
 *   duplica (≥ 1/2 muy alto, ≥ 1/4 alto, ≥ 1/8 medio, ≥ 1/16 bajo): los
 *   impactos de un registro suelen ir de cientos a millones, y una escala
 *   lineal dejaría casi todos en «muy bajo». Sin unidades que lo fijen (el
 *   complemento no sabe si 50.000 es mucho), compararlos entre sí es lo honesto.
 * - **Severidad**, por el producto de los dos niveles (1 a 25): baja (≤ 4),
 *   media (≤ 9), alta (≤ 16) y crítica.
 *
 * Un riesgo con la probabilidad o el impacto variables (dependen de otras
 * celdas aleatorias) no tiene casilla fija: se lista aparte.
 */

import type { FilaRiesgo } from './registroRiesgos.ts';

export const NIVELES_PROBABILIDAD = ['Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'] as const;
export const NIVELES_IMPACTO = ['Muy bajo', 'Bajo', 'Medio', 'Alto', 'Muy alto'] as const;
export type Severidad = 'baja' | 'media' | 'alta' | 'critica';
export const NOMBRE_SEVERIDAD: Record<Severidad, string> = { baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica' };

export function nivelProbabilidad(p: number): number {
  return p >= 0.7 ? 4 : p >= 0.5 ? 3 : p >= 0.3 ? 2 : p >= 0.1 ? 1 : 0;
}

export function nivelImpacto(impacto: number, mayor: number): number {
  if (!(mayor > 0)) return 0;
  const r = Math.abs(impacto) / mayor;
  return r >= 1 / 2 ? 4 : r >= 1 / 4 ? 3 : r >= 1 / 8 ? 2 : r >= 1 / 16 ? 1 : 0;
}

export function severidad(nivelP: number, nivelI: number): Severidad {
  const s = (nivelP + 1) * (nivelI + 1);
  return s <= 4 ? 'baja' : s <= 9 ? 'media' : s <= 16 ? 'alta' : 'critica';
}

export interface RiesgoUbicado {
  nombre: string;
  celda: string;
  nivelProbabilidad: number;
  nivelImpacto: number;
  severidad: Severidad;
}

export interface MatrizRiesgos {
  /** `casillas[i][p]`: los riesgos con nivel de impacto i y de probabilidad p. */
  casillas: RiesgoUbicado[][][];
  ubicados: RiesgoUbicado[];
  /** Los que no tienen casilla (probabilidad o impacto que cambian en cada iteración). */
  sinUbicar: string[];
  /** El mayor impacto medio, la referencia de la escala. */
  mayorImpacto: number;
}

export function matrizDeRiesgos(filas: readonly FilaRiesgo[]): MatrizRiesgos {
  const conCifras = filas.filter((f) => f.probabilidad !== null && f.impactoMedio !== null);
  const mayorImpacto = conCifras.reduce((m, f) => Math.max(m, Math.abs(f.impactoMedio as number)), 0);
  const casillas: RiesgoUbicado[][][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []));
  const ubicados = conCifras.map((f) => {
    const np = nivelProbabilidad(f.probabilidad as number);
    const ni = nivelImpacto(f.impactoMedio as number, mayorImpacto);
    const r: RiesgoUbicado = { nombre: f.nombre, celda: f.celda, nivelProbabilidad: np, nivelImpacto: ni, severidad: severidad(np, ni) };
    (casillas[ni] as RiesgoUbicado[][])[np]?.push(r);
    return r;
  });
  return { casillas, ubicados, sinUbicar: filas.filter((f) => !conCifras.includes(f)).map((f) => f.nombre), mayorImpacto };
}
