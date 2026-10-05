/**
 * La matriz de correlación válida más cercana (QRSA, Q2.2): el método de
 * proyecciones alternadas de Higham (2002), con la corrección de Dykstra.
 *
 * Declarar que A va con B (0,9), B con C (0,9) y A al revés de C (−0,9) no
 * describe tres variables posibles: la matriz no es semidefinida positiva y
 * Cholesky (lo que usa Iman–Conover) falla. En vez de rechazarla, se busca
 * la matriz de correlación posible más parecida (en norma de Frobenius) y se
 * avisa de cuánto cambió cada coeficiente.
 *
 * Referencia: N. J. Higham, «Computing the nearest correlation matrix — a
 * problem from finance», IMA Journal of Numerical Analysis 22 (2002).
 */

import { esDefinidaPositiva } from './correlate.ts';

type Matriz = number[][];

/** Autovalores y autovectores de una matriz simétrica (Jacobi cíclico). Columnas de `vectores`. */
export function autodescomposicion(a: readonly (readonly number[])[]): { valores: number[]; vectores: Matriz } {
  const n = a.length;
  const m: Matriz = a.map((f) => [...f]);
  const v: Matriz = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let barrido = 0; barrido < 100; barrido++) {
    let fuera = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) fuera += (m[p]![q] as number) ** 2;
    if (fuera < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p]![q] as number;
        if (Math.abs(apq) < 1e-300) continue;
        const app = m[p]![p] as number;
        const aqq = m[q]![q] as number;
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k]![p] as number;
          const mkq = m[k]![q] as number;
          m[k]![p] = c * mkp - s * mkq;
          m[k]![q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p]![k] as number;
          const mqk = m[q]![k] as number;
          m[p]![k] = c * mpk - s * mqk;
          m[q]![k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p] as number;
          const vkq = v[k]![q] as number;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { valores: m.map((f, i) => f[i] as number), vectores: v };
}

/** Proyección sobre las matrices semidefinidas positivas con autovalores ≥ `minimo`. */
function proyectarPSD(a: Matriz, minimo: number): Matriz {
  const { valores, vectores } = autodescomposicion(a);
  const n = a.length;
  const l = valores.map((x) => Math.max(x, minimo));
  const r: Matriz = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += (vectores[i]![k] as number) * (l[k] as number) * (vectores[j]![k] as number);
      r[i]![j] = s;
      r[j]![i] = s;
    }
  }
  return r;
}

export interface CorreccionHigham {
  matriz: Matriz;
  /** El mayor cambio absoluto en un coeficiente. */
  cambioMaximo: number;
  iteraciones: number;
}

/**
 * La matriz de correlación definida positiva más cercana a `a` (simétrica,
 * diagonal 1). Si `a` ya lo es, la devuelve tal cual.
 */
export function correlacionMasCercana(a: readonly (readonly number[])[], tolerancia = 1e-10): CorreccionHigham {
  const n = a.length;
  if (esDefinidaPositiva(a)) return { matriz: a.map((f) => [...f]), cambioMaximo: 0, iteraciones: 0 };
  // Un margen pequeño en los autovalores, para que Cholesky no falle por redondeo.
  const minimo = 1e-6;
  let y: Matriz = a.map((f) => [...f]);
  let ds: Matriz = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let it = 0;
  for (; it < 500; it++) {
    const r = y.map((f, i) => f.map((v, j) => v - (ds[i]![j] as number)));
    const x = proyectarPSD(r, minimo);
    ds = x.map((f, i) => f.map((v, j) => v - (r[i]![j] as number)));
    const yNueva = x.map((f, i) => f.map((v, j) => (i === j ? 1 : v)));
    let cambio = 0;
    let norma = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        cambio += ((yNueva[i]![j] as number) - (y[i]![j] as number)) ** 2;
        norma += (yNueva[i]![j] as number) ** 2;
      }
    }
    y = yNueva;
    if (Math.sqrt(cambio / norma) < tolerancia) break;
  }
  // La proyección sobre la diagonal unitaria puede dejar un autovalor un pelo
  // negativo: se vuelve a proyectar y se reescala a diagonal 1.
  let m = y;
  for (let k = 0; k < 5 && !esDefinidaPositiva(m); k++) {
    const p = proyectarPSD(m, minimo);
    const d = p.map((f, i) => Math.sqrt(f[i] as number));
    m = p.map((f, i) => f.map((v, j) => (i === j ? 1 : v / ((d[i] as number) * (d[j] as number)))));
  }
  let cambioMaximo = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cambioMaximo = Math.max(cambioMaximo, Math.abs((m[i]![j] as number) - (a[i]![j] as number)));
  return { matriz: m, cambioMaximo, iteraciones: it };
}
