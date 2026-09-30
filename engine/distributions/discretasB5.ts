/**
 * Distribuciones discretas de B5: geométrica, binomial negativa,
 * hipergeométrica y uniforme entera. Las que no tienen inversa cerrada
 * precalculan su acumulada una vez (sus parámetros no cambian) y el cuantil
 * es una búsqueda binaria: O(log n) por muestra.
 */
import { lgamma, regularizedIncompleteBeta } from './mathfn.ts';
import type { Distribution } from './types.ts';

/** Una tabla de la acumulada desde `desde`, para buscar el cuantil. */
function porTabla(desde: number, acumulada: Float64Array, media: number, varianza: number): Distribution {
  const n = acumulada.length;
  const cdf = (x: number) => {
    const k = Math.floor(x) - desde;
    if (k < 0) return 0;
    if (k >= n) return 1;
    return Math.min(1, acumulada[k] as number);
  };
  return {
    quantile: (u) => {
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const m = (lo + hi) >> 1;
        if ((acumulada[m] as number) < u) lo = m + 1;
        else hi = m;
      }
      return desde + lo;
    },
    cdf,
    mean: () => media,
    variance: () => varianza,
  };
}

/** Tope de la tabla: más valores no caben en memoria de forma razonable. */
const MAX_TABLA = 2_000_000;

/** Geométrica: los fracasos antes del primer éxito (0, 1, 2…), con probabilidad de éxito `p`. */
export function geometrica(p: number): Distribution {
  if (!(p > 0 && p <= 1)) throw new Error(`GEOMÉTRICA: la probabilidad debe estar en (0, 1] (p=${p})`);
  const lq = Math.log1p(-p);
  return {
    quantile: (u) => (p === 1 ? 0 : Math.max(0, Math.ceil(Math.log1p(-u) / lq - 1 - 1e-12))),
    cdf: (x) => (x < 0 ? 0 : 1 - (1 - p) ** (Math.floor(x) + 1)),
    mean: () => (1 - p) / p,
    variance: () => (1 - p) / (p * p),
  };
}

/** Binomial negativa: los fracasos antes del éxito número `r`, con probabilidad de éxito `p`. */
export function binomialNegativa(r: number, p: number): Distribution {
  if (!(r > 0 && p > 0 && p <= 1)) throw new Error(`BINOMNEG: r debe ser positivo y p estar en (0, 1] (r=${r}, p=${p})`);
  const media = (r * (1 - p)) / p;
  const varianza = (r * (1 - p)) / (p * p);
  if (p === 1) return porTabla(0, Float64Array.of(1), 0, 0);
  const tope = Math.min(MAX_TABLA, Math.ceil(media + 40 * Math.sqrt(varianza) + 50));
  const tabla: number[] = [];
  let logPmf = r * Math.log(p);
  let acumulado = 0;
  for (let k = 0; k <= tope; k++) {
    if (k > 0) logPmf += Math.log((k - 1 + r) / k) + Math.log1p(-p);
    acumulado += Math.exp(logPmf);
    tabla.push(acumulado);
    if (acumulado >= 1 - 1e-13 && k > media) break;
  }
  // La suma pierde algo de precisión: la acumulada exacta, por la beta incompleta, en el último valor.
  const ultimo = tabla.length - 1;
  tabla[ultimo] = Math.max(tabla[ultimo] as number, regularizedIncompleteBeta(r, ultimo + 1, p));
  return porTabla(0, Float64Array.from(tabla), media, varianza);
}

/**
 * Hipergeométrica: cuántos «éxitos» salen al sacar `n` elementos sin
 * devolverlos de una población de `N` con `K` éxitos (piezas defectuosas en
 * un lote, por ejemplo).
 */
export function hipergeometrica(n: number, K: number, N: number): Distribution {
  const enteros = [n, K, N].every((x) => Number.isInteger(x));
  if (!(enteros && N > 0 && K >= 0 && K <= N && n >= 0 && n <= N)) {
    throw new Error(`HIPERGEOM: hacen falta enteros con 0 ≤ éxitos ≤ población y 0 ≤ muestra ≤ población (muestra=${n}, éxitos=${K}, población=${N})`);
  }
  const desde = Math.max(0, n + K - N);
  const hasta = Math.min(n, K);
  const lc = (a: number, b: number) => lgamma(a + 1) - lgamma(b + 1) - lgamma(a - b + 1);
  const total = lc(N, n);
  const tabla = new Float64Array(hasta - desde + 1);
  let acumulado = 0;
  for (let k = desde; k <= hasta; k++) {
    acumulado += Math.exp(lc(K, k) + lc(N - K, n - k) - total);
    tabla[k - desde] = acumulado;
  }
  const media = (n * K) / N;
  const varianza = N > 1 ? (n * K * (N - K) * (N - n)) / (N * N * (N - 1)) : 0;
  return porTabla(desde, tabla, media, varianza);
}

/** Uniforme entera: cada entero entre `minimo` y `maximo` (incluidos), con la misma probabilidad. */
export function uniformeEntera(minimo: number, maximo: number): Distribution {
  if (!(Number.isInteger(minimo) && Number.isInteger(maximo) && minimo <= maximo)) {
    throw new Error(`UNIFORMEENTERA: el mínimo y el máximo tienen que ser enteros, con mínimo ≤ máximo (mínimo=${minimo}, máximo=${maximo})`);
  }
  const m = maximo - minimo + 1;
  return {
    quantile: (u) => Math.min(maximo, minimo + Math.floor(u * m)),
    cdf: (x) => (x < minimo ? 0 : x >= maximo ? 1 : (Math.floor(x) - minimo + 1) / m),
    mean: () => (minimo + maximo) / 2,
    variance: () => (m * m - 1) / 12,
  };
}
