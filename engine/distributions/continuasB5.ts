/**
 * Distribuciones continuas de B5: t de Student (con centro y escala),
 * logística, log-logística y Pareto. Todas por transformada inversa, como el
 * resto (`types.ts`).
 */
import { invNormalCDF, invRegularizedIncompleteBeta, lgamma, regularizedIncompleteBeta } from './mathfn.ts';
import type { Distribution } from './types.ts';

/**
 * t de Student con `gl` grados de libertad, desplazada a `centro` y
 * escalada por `escala`: colas más gruesas que la normal. Media = centro si
 * gl > 1; varianza = escala²·gl/(gl−2) si gl > 2 (si no, no existen).
 */
export function student(gl: number, centro: number, escala: number): Distribution {
  if (!(gl > 0 && escala > 0 && Number.isFinite(centro))) {
    throw new Error(`STUDENT: los grados de libertad y la escala deben ser positivos (gl=${gl}, escala=${escala})`);
  }
  const logC = lgamma((gl + 1) / 2) - lgamma(gl / 2) - 0.5 * Math.log(gl * Math.PI);
  const pdf = (t: number) => Math.exp(logC - ((gl + 1) / 2) * Math.log(1 + (t * t) / gl));
  const cdfT = (t: number) => {
    const x = gl / (gl + t * t);
    const cola = 0.5 * regularizedIncompleteBeta(gl / 2, 0.5, x);
    return t >= 0 ? 1 - cola : cola;
  };
  const cuantilT = (u: number): number => {
    if (u === 0.5) return 0;
    // Newton desde el cuantil normal (con la corrección de Cornish–Fisher);
    // con pocos grados de libertad, la inversa de la beta, que siempre converge.
    const z = invNormalCDF(u);
    let t = z + (z ** 3 + z) / (4 * gl);
    if (gl >= 2) {
      for (let i = 0; i < 8; i++) {
        const f = cdfT(t) - u;
        const d = pdf(t);
        if (!(d > 0)) break;
        const paso = f / d;
        t -= paso;
        if (Math.abs(paso) < 1e-12 * (1 + Math.abs(t))) return t;
      }
      if (Number.isFinite(t) && Math.abs(cdfT(t) - u) < 1e-10) return t;
    }
    const x = invRegularizedIncompleteBeta(gl / 2, 0.5, 2 * Math.min(u, 1 - u));
    const r = Math.sqrt((gl * (1 - x)) / x);
    return u < 0.5 ? -r : r;
  };
  return {
    quantile: (u) => centro + escala * cuantilT(u),
    cdf: (x) => cdfT((x - centro) / escala),
    mean: () => (gl > 1 ? centro : NaN),
    variance: () => (gl > 2 ? (escala * escala * gl) / (gl - 2) : Infinity),
  };
}

/** Logística: parecida a la normal, con colas algo más gruesas. */
export function logistica(media: number, escala: number): Distribution {
  if (!(escala > 0 && Number.isFinite(media))) throw new Error(`LOGÍSTICA: la escala debe ser positiva (escala=${escala})`);
  return {
    quantile: (u) => media + escala * Math.log(u / (1 - u)),
    cdf: (x) => 1 / (1 + Math.exp(-(x - media) / escala)),
    mean: () => media,
    variance: () => (escala * escala * Math.PI * Math.PI) / 3,
  };
}

/** Log-logística (Fisk): positiva y con cola a la derecha; la mediana es `escala`. */
export function logLogistica(escala: number, forma: number): Distribution {
  if (!(escala > 0 && forma > 0)) throw new Error(`LOGLOGÍSTICA: escala y forma deben ser positivas (escala=${escala}, forma=${forma})`);
  const b = Math.PI / forma;
  return {
    quantile: (u) => escala * (u / (1 - u)) ** (1 / forma),
    cdf: (x) => (x <= 0 ? 0 : 1 / (1 + (x / escala) ** -forma)),
    mean: () => (forma > 1 ? (escala * b) / Math.sin(b) : Infinity),
    variance: () => (forma > 2 ? escala * escala * ((2 * b) / Math.sin(2 * b) - (b * b) / Math.sin(b) ** 2) : Infinity),
  };
}

/** Pareto: nunca por debajo de `minimo`, con una cola derecha muy larga (grandes siniestros). */
export function pareto(minimo: number, forma: number): Distribution {
  if (!(minimo > 0 && forma > 0)) throw new Error(`PARETO: el mínimo y la forma deben ser positivos (mínimo=${minimo}, forma=${forma})`);
  return {
    quantile: (u) => minimo * (1 - u) ** (-1 / forma),
    cdf: (x) => (x < minimo ? 0 : 1 - (minimo / x) ** forma),
    mean: () => (forma > 1 ? (forma * minimo) / (forma - 1) : Infinity),
    variance: () => (forma > 2 ? (minimo * minimo * forma) / ((forma - 1) ** 2 * (forma - 2)) : Infinity),
  };
}
