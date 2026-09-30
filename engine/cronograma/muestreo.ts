/**
 * Muestreo rápido de las duraciones del cronograma.
 *
 * El motor de costos muestrea por transformada inversa (`quantile`), que en
 * una PERT (una Beta) exige invertir la beta incompleta: ~10 µs por muestra.
 * Con 5.000 actividades y 10.000 iteraciones eso son 50 millones de muestras,
 * más de ocho minutos. Aquí se usa el algoritmo BA de Cheng (1978) para la
 * Beta, por rechazo: ~0,1 µs por muestra, válido para cualquier α, β > 0.
 *
 * Sigue siendo **reproducible**: los uniformes de la iteración `i` salen de
 * Philox en posiciones fijas (`i·16 + j`), así que el resultado no depende
 * del troceado en bloques ni del orden. Tras 8 rechazos seguidos (con α, β
 * de una PERT la probabilidad es despreciable) se cae a la inversa exacta.
 */

import type { Distribution } from '../distributions/types.ts';
import { pert } from '../distributions/pert.ts';
import { triangular } from '../distributions/triangular.ts';
import { uniformOpenAt } from '../random/philox.ts';

export interface Muestreador {
  /** Una muestra para la iteración `i` del flujo `flujo`. */
  muestra(semilla: number, flujo: number, i: number): number;
  media: number;
}

const LN4 = Math.log(4);
const INTENTOS = 8;

/** Beta(α, β) reescalada a [min, max] por el algoritmo BA de Cheng. */
export function betaCheng(alpha: number, beta: number, min: number, max: number, respaldo: Distribution): Muestreador {
  const a0 = alpha + beta;
  const bParam = Math.min(alpha, beta) <= 1 ? Math.max(1 / alpha, 1 / beta) : Math.sqrt((a0 - 2) / (2 * alpha * beta - a0));
  const gamma = alpha + 1 / bParam;
  const rango = max - min;
  return {
    media: min + (rango * alpha) / a0,
    muestra(semilla, flujo, i) {
      const base = i * 16;
      for (let j = 0; j < INTENTOS; j++) {
        const u1 = uniformOpenAt(semilla, flujo, base + 2 * j);
        const u2 = uniformOpenAt(semilla, flujo, base + 2 * j + 1);
        const v = bParam * Math.log(u1 / (1 - u1));
        const w = alpha * Math.exp(v);
        if (!Number.isFinite(w)) continue;
        if (a0 * Math.log(a0 / (beta + w)) + gamma * v - LN4 >= Math.log(u1 * u1 * u2)) {
          return min + (rango * w) / (beta + w);
        }
      }
      return respaldo.quantile(uniformOpenAt(semilla, flujo, base + 15));
    },
  };
}

/** PERT (λ = 4) o triangular sobre mínimo, más probable y máximo. `null` si no hay rango. */
export function muestreadorDuracion(min: number, mp: number, max: number, forma: 'pert' | 'triangular'): Muestreador | null {
  if (!(max > min)) return null;
  if (forma === 'triangular') {
    const t = triangular(min, mp, max);
    return { media: (min + mp + max) / 3, muestra: (s, f, i) => t.quantile(uniformOpenAt(s, f, i * 16)) };
  }
  const rango = max - min;
  const alpha = 1 + (4 * (mp - min)) / rango;
  const beta = 1 + (4 * (max - mp)) / rango;
  return betaCheng(alpha, beta, min, max, pert(min, mp, max));
}

/**
 * V6: mínimo y máximo de la PERT (o triangular) cuyo más probable es `mp` y
 * cuyos percentiles 10 y 90 son `p10` y `p90` (la idea de la Trigen: se
 * estima mejor «en 1 de cada 10 casos baja de…» que un mínimo absoluto).
 * Se resuelve por bisección alternada: el mínimo ajusta el P10 y el máximo
 * el P90 (cada uno depende casi solo de su extremo); en pocas vueltas los
 * dos casan al milésimo. Requiere p10 ≤ mp ≤ p90 y p10 < p90.
 */
export function extremosDePercentiles(p10: number, mp: number, p90: number, forma: 'pert' | 'triangular'): { min: number; max: number } {
  if (!(p10 <= mp && mp <= p90 && p10 < p90)) throw new Error(`se requiere P10 ≤ más probable ≤ P90 (${p10}; ${mp}; ${p90})`);
  const w = p90 - p10;
  let min = p10 - 0.5 * w;
  let max = p90 + 0.5 * w;
  const q = (a: number, b: number, p: number) => (forma === 'pert' ? pert(a, mp, b) : triangular(a, mp, b)).quantile(p);
  const tol = w * 1e-7;
  // f decreciente en t con f(0) > 0: el t donde cruza cero, por la secante con respaldo de bisección.
  const raiz = (f: (t: number) => number, t0: number) => {
    let lo = 0;
    let hi = 40;
    let t = Math.min(hi, Math.max(lo, t0));
    for (let k = 0; k < 60; k++) {
      const v = f(t);
      if (Math.abs(v) < tol) return t;
      if (v > 0) lo = t;
      else hi = t;
      const h = 1e-4;
      const d = (f(t + h) - v) / h;
      const n = d < 0 ? t - v / d : NaN;
      t = n > lo && n < hi ? n : (lo + hi) / 2;
    }
    return t;
  };
  let t1 = 0.5;
  let t2 = 0.5;
  for (let vuelta = 0; vuelta < 40; vuelta++) {
    const b = max;
    t1 = raiz((t) => q(p10 - w * t, b, 0.1) - p10, t1);
    const a = p10 - w * t1;
    t2 = raiz((t) => p90 - q(a, p90 + w * t, 0.9), t2);
    const nMin = a;
    const nMax = p90 + w * t2;
    const quieto = Math.abs(nMin - min) < tol && Math.abs(nMax - max) < tol;
    min = nMin;
    max = nMax;
    if (quieto) break;
  }
  return { min, max };
}
