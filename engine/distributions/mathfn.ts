/**
 * Funciones matemáticas especiales compartidas por las distribuciones.
 *
 * La auditoría (Fase 1 §4.3) señaló `erf` duplicado en dos sitios del código
 * heredado. Aquí hay una sola implementación de cada función especial, usada
 * por todas las distribuciones que la necesitan — exactamente la corrección
 * que pide Fase 2 §8.
 *
 * Todas las funciones son puras y deterministas: mismo argumento, mismo
 * resultado, sin estado. Es lo que permite que `engine/` se ejecute en
 * cualquier Web Worker sin coordinación.
 */

/**
 * Función de error `erf(x)`, aproximación racional de Abramowitz & Stegun
 * (7.1.26). Error absoluto máximo ~1.5e-7, sobrado para muestreo y para las
 * pruebas de bondad de ajuste (tolerancias de Fase 2 §11.2).
 */
export function erf(x: number): number {
  const signo = x < 0 ? -1 : 1;
  const ax = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * ax);
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const y = 1 - poly * Math.exp(-ax * ax);

  return signo * y;
}

export function erfc(x: number): number {
  return 1 - erf(x);
}

/**
 * Inversa de `erf`. Arranca de la aproximación de Winitzki y refina con
 * Newton usando la propia `erf`, hasta precisión de máquina para los rangos
 * que nos interesan (evita heredar el error de 1.5e-7 de la aproximación).
 */
export function erfinv(x: number): number {
  if (x <= -1) return -Infinity;
  if (x >= 1) return Infinity;
  if (x === 0) return 0;

  const a = 0.147;
  const ln1mx2 = Math.log(1 - x * x);
  const term1 = 2 / (Math.PI * a) + ln1mx2 / 2;
  let y = Math.sign(x) * Math.sqrt(Math.sqrt(term1 * term1 - ln1mx2 / a) - term1);

  // Dos pasos de Newton sobre erf(y) - x = 0; erf'(y) = 2/sqrt(pi) * exp(-y^2).
  for (let i = 0; i < 2; i++) {
    const err = erf(y) - x;
    y -= err / ((2 / Math.sqrt(Math.PI)) * Math.exp(-y * y));
  }
  return y;
}

/** Cuantil de la normal estándar N(0,1) a partir de `erfinv`. */
export function invNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  return Math.SQRT2 * erfinv(2 * p - 1);
}

/** CDF de la normal estándar N(0,1). */
export function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Logaritmo de la función Gamma, aproximación de Lanczos (g=7, 9 términos).
 * Precisión de máquina en todo el rango positivo que usan las
 * distribuciones de este módulo.
 */
const LANCZOS_G = 7;
const LANCZOS_COEF = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) {
    // Reflexión: Gamma(x)Gamma(1-x) = pi/sin(pi x).
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS_COEF[0] as number;
  const t = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_COEF.length; i++) {
    a += (LANCZOS_COEF[i] as number) / (z + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Gamma incompleta inferior regularizada `P(a,x) = γ(a,x)/Γ(a)`.
 *
 * Serie de potencias para `x < a+1`, fracción continua para `x >= a+1`
 * (Numerical Recipes §6.2): cada rama converge rápido en su mitad del
 * dominio, la otra sería lenta o inestable.
 */
export function lowerIncompleteGammaRegularized(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;

  if (x < a + 1) {
    return gserie(a, x);
  }
  return 1 - gcontinua(a, x);
}

export function upperIncompleteGammaRegularized(a: number, x: number): number {
  return 1 - lowerIncompleteGammaRegularized(a, x);
}

function gserie(a: number, x: number): number {
  const ITMAX = 200;
  const EPS = 1e-14;
  let ap = a;
  let suma = 1 / a;
  let del = suma;
  for (let n = 0; n < ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    suma += del;
    if (Math.abs(del) < Math.abs(suma) * EPS) break;
  }
  return suma * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

function gcontinua(a: number, x: number): number {
  const ITMAX = 200;
  const EPS = 1e-14;
  const FPMIN = 1e-300;

  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

/**
 * Cuantil de la gamma incompleta: resuelve `P(a,x) = p` para `x`.
 *
 * Arranque con la aproximación de Wilson–Hilferty (buena a partir de a
 * moderado) y refinamiento por Newton, con acotado por bisección para que
 * nunca se salga de `[lo, hi]` — la salvaguarda estándar cuando la derivada
 * puede ser muy pequeña cerca de los extremos.
 */
export function invLowerIncompleteGammaRegularized(a: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;

  const z = invNormalCDF(p);
  const wh = a * (1 - 1 / (9 * a) + (z * Math.sqrt(1 / (9 * a)))) ** 3;
  let x = Number.isFinite(wh) && wh > 0 ? wh : a;

  let lo = 0;
  let hi = Infinity;
  for (let i = 0; i < 100; i++) {
    const fx = lowerIncompleteGammaRegularized(a, x) - p;
    if (fx > 0) hi = x; else lo = x;

    // Densidad gamma(a,1): x^(a-1) e^-x / Gamma(a).
    const logDensidad = (a - 1) * Math.log(x) - x - lgamma(a);
    const densidad = Math.exp(logDensidad);

    let siguiente = densidad > 0 ? x - fx / densidad : NaN;
    if (!Number.isFinite(siguiente) || siguiente <= lo || (hi !== Infinity && siguiente >= hi)) {
      siguiente = hi === Infinity ? x * 2 + 1 : (lo + hi) / 2;
    }
    if (Math.abs(siguiente - x) < 1e-12 * (x + 1e-12)) {
      x = siguiente;
      break;
    }
    x = siguiente;
  }
  return x;
}

/**
 * Beta incompleta regularizada `I_x(a,b)`, vía fracción continua (Numerical
 * Recipes §6.4). Se usa la relación de simetría `I_x(a,b) = 1 - I_{1-x}(b,a)`
 * cuando `x` cae en la mitad donde la fracción continúa converge despacio.
 */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const logBeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const frente = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logBeta);

  if (x < (a + 1) / (a + b + 2)) {
    return (frente * betacf(a, b, x)) / a;
  }
  return 1 - (frente * betacf(b, a, 1 - x)) / b;
}

function betacf(a: number, b: number, x: number): number {
  const ITMAX = 300;
  const EPS = 1e-14;
  const FPMIN = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= ITMAX; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPS) break;
  }
  return h;
}

/**
 * Cuantil de la beta incompleta: resuelve `I_x(a,b) = p` para `x` en (0,1).
 *
 * Bisección pura: más lenta que Newton, pero robusta en todo el rango de
 * `a, b` que necesitan Beta y PERT, incluidas las formas en U (a,b < 1)
 * donde la derivada se dispara cerca de los extremos y Newton se desestabiliza.
 */
export function invRegularizedIncompleteBeta(a: number, b: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break; // precisión de double agotada
    const fx = regularizedIncompleteBeta(a, b, mid);
    if (fx < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
