/**
 * **Ajustar una distribución a datos**: el usuario pega sus datos históricos
 * (precios de los últimos años, duraciones de obras parecidas) y el motor
 * propone qué distribución los describe mejor, con sus parámetros.
 *
 * Es la forma honrada de elegir una distribución. La alternativa habitual
 * —"pongo una triangular con lo que me parece"— es donde más se equivoca un
 * análisis de riesgo, y nadie lo revisa porque no queda rastro de por qué.
 *
 * **Cómo se estiman los parámetros**, candidata a candidata, con el método que
 * mejor funciona para cada una sin optimizadores genéricos:
 * - normal, lognormal, exponencial: máxima verosimilitud, que aquí tiene
 *   fórmula cerrada;
 * - gamma: máxima verosimilitud con la aproximación de Minka para la forma
 *   (error relativo < 1,5 %, sin iterar);
 * - Weibull: máxima verosimilitud resolviendo la ecuación de la forma por
 *   Newton;
 * - uniforme, triangular, PERT: extremos ampliados sin sesgo
 *   (mín − rango/(n−1), máx + rango/(n−1)) y la moda por momentos;
 * - beta: por momentos, solo si todos los datos están entre 0 y 1.
 *
 * **Cómo se ordenan**: por **AIC** por defecto (criterio de Akaike, que
 * premia el ajuste y castiga cada parámetro: una PERT de tres parámetros no
 * gana a una normal de dos solo por tener uno más). Se dan también **BIC**
 * (castiga más los parámetros cuando hay muchos datos), **Anderson–Darling**
 * (pesa las colas, que en riesgo es lo que importa) y **Kolmogorov–Smirnov**
 * (la que la gente conoce). La interfaz deja elegir por cuál ordenar. AIC y
 * BIC necesitan la densidad de cada candidata, que se escribe aquí
 * (`logDensidad`); A–D y K–S solo la función de distribución.
 *
 * **Lo que no dice**: si el ajuste es "estadísticamente aceptable". Los
 * valores críticos de A–D dependen de la distribución y de que los parámetros
 * se hayan estimado de los mismos datos; dar un "p = 0,23" aquí sería
 * aparentar un rigor que no hay. Se ordena, se enseña el número, y el panel
 * pide mirar la curva.
 */

import { construirDesdeDescriptor } from '../distributions/index.ts';
import { lgamma } from '../distributions/mathfn.ts';
import { toDescriptor, type DistributionSpec } from './distributionSchema.ts';

export interface AjusteCandidato {
  spec: DistributionSpec;
  /** Criterio de información de Akaike: 2k − 2·ln L. Cuanto menor, mejor; penaliza parámetros. */
  aic: number;
  /** Criterio bayesiano: k·ln n − 2·ln L. Penaliza más los parámetros con muchos datos. */
  bic: number;
  /** AIC corregido para muestras pequeñas (I1): AIC + 2k(k+1)/(n−k−1). Converge al AIC con muchos datos. */
  aicc: number;
  /** Cramér–von Mises (I1): distancia cuadrática entre la acumulada empírica y la teórica. Cuanto menor, mejor. */
  cramerVonMises: number;
  /** Número de parámetros estimados de los datos. */
  parametros: number;
  /** Anderson–Darling: cuanto menor, mejor. */
  andersonDarling: number;
  /** Kolmogorov–Smirnov (distancia máxima entre CDF empírica y teórica, 0..1). */
  kolmogorovSmirnov: number;
  /**
   * Error en percentiles (I2): la media de |percentil ajustado − percentil de
   * los datos|, en desviaciones típicas de los datos, en los percentiles de
   * cada objetivo (`PERCENTILES_OBJETIVO`). Cuanto menor, mejor. Cada uno se
   * enseña por separado: no hay puntuación combinada.
   */
  errorGeneral: number;
  errorSuperior: number;
  errorInferior: number;
  /** Poisson o binomial (I2): su verosimilitud es una probabilidad, no una densidad; el AIC no se compara con las continuas. */
  discreta?: boolean;
}

/** Objetivo del ajuste (I2): qué parte de la distribución importa más. */
export type ObjetivoAjuste = 'general' | 'superior' | 'inferior';

/** Los percentiles que mira cada objetivo. */
export const PERCENTILES_OBJETIVO: Record<ObjetivoAjuste, readonly number[]> = {
  general: [0.05, 0.25, 0.5, 0.75, 0.95],
  superior: [0.5, 0.8, 0.9, 0.95, 0.99],
  inferior: [0.01, 0.05, 0.1, 0.2, 0.5],
};

/** El criterio de error en percentiles de cada objetivo. */
export const CRITERIO_DE_OBJETIVO: Record<ObjetivoAjuste, 'errorGeneral' | 'errorSuperior' | 'errorInferior'> = {
  general: 'errorGeneral',
  superior: 'errorSuperior',
  inferior: 'errorInferior',
};

/**
 * Lo que dicen los datos antes de ajustar nada (I1): la vía local, sin IA, a
 * «sugerir distribuciones». Explica por qué se proponen unas familias y se
 * descartan otras.
 */
export interface DiagnosticoDatos {
  asimetria: number;
  curtosis: number;
  negativos: number;
  ceros: number;
  todosEnteros: boolean;
  entreCeroYUno: boolean;
  notas: string[];
}

export interface ResultadoAjuste {
  n: number;
  media: number;
  desviacion: number;
  min: number;
  max: number;
  diagnostico?: DiagnosticoDatos;
  /** Los datos tal cual como distribución (discreta con sus valores observados). */
  empirica?: DistributionSpec;
  /** De mejor a peor según AIC (ver `ordenarCandidatos` para otro criterio). */
  candidatos: AjusteCandidato[];
}

/**
 * Lee números de un texto pegado: una columna copiada de Excel (uno por
 * línea), o separados por punto y coma, espacios o tabuladores.
 *
 * Con coma decimal (español), un punto que agrupa de tres en tres es de miles
 * —"1.234,5"— y uno que no agrupa se entiende como decimal ("2.5"). Con punto
 * decimal, las comas son de miles. Lo que no es un número se ignora (una
 * cabecera, una celda vacía) y se cuenta aparte.
 */
export function leerDatos(texto: string, decimal = ','): { valores: number[]; ignorados: number } {
  const trozos = texto.split(/[\s;]+/).map((t) => t.trim()).filter(Boolean);
  const valores: number[] = [];
  let ignorados = 0;
  for (const t of trozos) {
    let s = t.replace('\u2212', '-');
    if (decimal === ',') {
      const [entera = '', fraccion, ...resto] = s.split(',');
      if (resto.length > 0) { ignorados++; continue; }
      const miles = /^-?\d{1,3}(\.\d{3})+$/.test(entera);
      if (fraccion !== undefined || miles) s = entera.replace(/\./g, '') + (fraccion !== undefined ? `.${fraccion}` : '');
    } else {
      s = s.replace(/,/g, '');
    }
    const v = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN;
    if (Number.isFinite(v)) valores.push(v);
    else ignorados++;
  }
  return { valores, ignorados };
}

/**
 * Seis cifras significativas en cada parámetro: más precisión que la que dan
 * los datos, y un modelo que se puede leer ("Normal(1.250; 83,4)", no con
 * dieciséis decimales). La bondad se mide ya con los valores redondeados, que
 * son los que se van a usar.
 */
function redondearSpec(spec: DistributionSpec): DistributionSpec {
  const r = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(6)) : v);
  return Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, k === 'type' ? v : r(v)])) as DistributionSpec;
}

const Z = 1e-12;

/** ln B(a, b). */
const lbeta = (a: number, b: number) => lgamma(a) + lgamma(b) - lgamma(a + b);

/** ln de la densidad de una beta de parámetros (a, b) escalada a [min, max]. */
function logBetaEscalada(x: number, a: number, b: number, min: number, max: number): number {
  if (x < min || x > max) return -Infinity;
  const r = max - min;
  const u = (x - min) / r;
  // En los extremos con un exponente 0 la densidad es finita; con uno negativo, infinita.
  const t1 = a === 1 ? 0 : (a - 1) * Math.log(u);
  const t2 = b === 1 ? 0 : (b - 1) * Math.log(1 - u);
  return t1 + t2 - lbeta(a, b) - Math.log(r);
}

/**
 * ln f(x) de una candidata, y cuántos parámetros se estimaron de los datos.
 * Solo las familias que propone el ajuste.
 */
export function logDensidad(spec: DistributionSpec): { f: (x: number) => number; k: number } | null {
  switch (spec.type) {
    case 'normal': {
      const { mean: m, stdDev: s } = spec;
      return { k: 2, f: (x) => -0.5 * ((x - m) / s) ** 2 - Math.log(s) - 0.5 * Math.log(2 * Math.PI) };
    }
    case 'lognormal': {
      // Parámetros de la variable -> mu y sigma del logaritmo.
      const sigma = Math.sqrt(Math.log(1 + (spec.p2 * spec.p2) / (spec.p1 * spec.p1)));
      const mu = Math.log(spec.p1) - (sigma * sigma) / 2;
      return {
        k: 2,
        f: (x) => (x <= 0 ? -Infinity : -Math.log(x * sigma * Math.sqrt(2 * Math.PI)) - (Math.log(x) - mu) ** 2 / (2 * sigma * sigma)),
      };
    }
    case 'uniform':
      return { k: 2, f: (x) => (x < spec.min || x > spec.max ? -Infinity : -Math.log(spec.max - spec.min)) };
    case 'triangular': {
      const { min: a, mode: c, max: b } = spec;
      return {
        k: 3,
        f: (x) => {
          if (x < a || x > b) return -Infinity;
          const d = x < c ? (2 * (x - a)) / ((b - a) * (c - a)) : x > c ? (2 * (b - x)) / ((b - a) * (b - c)) : 2 / (b - a);
          return Math.log(d);
        },
      };
    }
    case 'pert': {
      const { min: a, mode: c, max: b } = spec;
      const l = spec.lambda ?? 4;
      const al = 1 + (l * (c - a)) / (b - a);
      const be = 1 + (l * (b - c)) / (b - a);
      return { k: 3, f: (x) => logBetaEscalada(x, al, be, a, b) };
    }
    case 'beta':
      return { k: 2, f: (x) => logBetaEscalada(x, spec.alpha, spec.beta, 0, 1) };
    case 'gamma': {
      const { shape: k, scale: t } = spec;
      return { k: 2, f: (x) => (x <= 0 ? -Infinity : (k - 1) * Math.log(x) - x / t - lgamma(k) - k * Math.log(t)) };
    }
    case 'exponential':
      return { k: 1, f: (x) => (x < 0 ? -Infinity : Math.log(spec.lambda) - spec.lambda * x) };
    case 'weibull': {
      const { shape: k, scale: l } = spec;
      return { k: 2, f: (x) => (x <= 0 ? -Infinity : Math.log(k / l) + (k - 1) * Math.log(x / l) - (x / l) ** k) };
    }
    // Discretas (I2): el logaritmo de la probabilidad de cada valor.
    case 'poisson': {
      const l = spec.lambda;
      return { k: 1, f: (x) => (x < 0 || !Number.isInteger(x) ? -Infinity : x * Math.log(l) - l - lgamma(x + 1)) };
    }
    case 'binomial': {
      const { n: m, p: q } = spec;
      return {
        k: 2,
        f: (x) => (x < 0 || x > m || !Number.isInteger(x) ? -Infinity
          : lgamma(m + 1) - lgamma(x + 1) - lgamma(m - x + 1) + (x === 0 ? 0 : x * Math.log(q)) + (x === m ? 0 : (m - x) * Math.log(1 - q))),
      };
    }
    default:
      return null;
  }
}

function bondad(spec: DistributionSpec, ordenados: Float64Array): AjusteCandidato | null {
  let dist;
  try {
    dist = construirDesdeDescriptor(toDescriptor(spec));
  } catch {
    return null; // parámetros que el constructor rechaza: la candidata no vale
  }
  const n = ordenados.length;
  const F = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = dist.cdf(ordenados[i] as number);
    if (!Number.isFinite(f)) return null;
    F[i] = Math.min(1 - Z, Math.max(Z, f));
  }
  let ks = 0;
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const f = F[i] as number;
    ks = Math.max(ks, (i + 1) / n - f, f - i / n);
    suma += (2 * i + 1) * (Math.log(f) + Math.log(1 - (F[n - 1 - i] as number)));
  }
  const densidad = logDensidad(spec);
  if (!densidad) return null;
  let ll = 0;
  for (let i = 0; i < n; i++) ll += densidad.f(ordenados[i] as number);
  const k = densidad.k;
  let cvm = 1 / (12 * n);
  for (let i = 0; i < n; i++) cvm += ((F[i] as number) - (2 * i + 1) / (2 * n)) ** 2;
  const errorDe = (o: ObjetivoAjuste) => errorEnPercentiles(dist, ordenados, PERCENTILES_OBJETIVO[o], desviacionDe(ordenados));
  return {
    spec,
    aic: 2 * k - 2 * ll,
    aicc: 2 * k - 2 * ll + (n - k - 1 > 0 ? (2 * k * (k + 1)) / (n - k - 1) : Infinity),
    cramerVonMises: cvm,
    bic: k * Math.log(n) - 2 * ll,
    parametros: k,
    andersonDarling: -n - suma / n,
    kolmogorovSmirnov: ks,
    errorGeneral: errorDe('general'),
    errorSuperior: errorDe('superior'),
    errorInferior: errorDe('inferior'),
    ...(spec.type === 'poisson' || spec.type === 'binomial' ? { discreta: true } : {}),
  };
}

/** Percentil `p` de unos datos ordenados (interpolación lineal, la de PERCENTIL.INC de Excel). */
export function percentilDatos(ordenados: ArrayLike<number>, p: number): number {
  const n = ordenados.length;
  const h = (n - 1) * p;
  const i = Math.floor(h);
  const a = ordenados[i] as number;
  const b = ordenados[Math.min(n - 1, i + 1)] as number;
  return a + (h - i) * (b - a);
}

function desviacionDe(x: ArrayLike<number>): number {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i] as number;
  const m = s / n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += ((x[i] as number) - m) ** 2;
  return Math.sqrt(ss / (n - 1));
}

function errorEnPercentiles(dist: { quantile(u: number): number }, ordenados: Float64Array, ps: readonly number[], desviacion: number): number {
  let e = 0;
  for (const p of ps) e += Math.abs(dist.quantile(p) - percentilDatos(ordenados, p));
  const r = e / ps.length / desviacion;
  return Number.isFinite(r) ? r : Infinity;
}

export interface FilaPercentil {
  p: number;
  datos: number;
  ajustado: number;
  /** Diferencia ajustado − datos, en desviaciones típicas de los datos. */
  error: number;
}

/** Percentil a percentil (I2): lo que dicen los datos y lo que dice la candidata, en los del objetivo. */
export function tablaPercentiles(spec: DistributionSpec, datos: readonly number[], objetivo: ObjetivoAjuste): FilaPercentil[] {
  const x = Float64Array.from(datos.filter(Number.isFinite)).sort();
  if (x.length < 2) return [];
  const dist = construirDesdeDescriptor(toDescriptor(spec));
  const s = desviacionDe(x);
  return PERCENTILES_OBJETIVO[objetivo].map((p) => {
    const d = percentilDatos(x, p);
    const a = dist.quantile(p);
    return { p, datos: d, ajustado: a, error: s > 0 ? (a - d) / s : 0 };
  });
}

export type CriterioAjuste = 'aicc' | 'aic' | 'bic' | 'andersonDarling' | 'cramerVonMises' | 'errorGeneral' | 'errorSuperior' | 'errorInferior';

/** Digamma y trigamma (series asintóticas con recurrencia), para la gamma por máxima verosimilitud. */
function digamma(x: number): number {
  let r = 0;
  while (x < 6) { r -= 1 / x; x += 1; }
  const f = 1 / (x * x);
  return r + Math.log(x) - 0.5 / x - f * (1 / 12 - f * (1 / 120 - f * (1 / 252 - f * (1 / 240 - f / 132))));
}
function trigamma(x: number): number {
  let r = 0;
  while (x < 6) { r += 1 / (x * x); x += 1; }
  const f = 1 / (x * x);
  return r + 1 / x + f / 2 + (f / x) * (1 / 6 - f * (1 / 30 - f * (1 / 42 - f / 30)));
}

/**
 * Forma de la gamma por máxima verosimilitud exacta (I1): resuelve
 * ln k − ψ(k) = s por Newton, partiendo de la aproximación de Minka (la que se
 * usaba antes, buena pero no exacta).
 */
export function gammaFormaMLE(s: number): number {
  let k = (3 - s + Math.sqrt((s - 3) ** 2 + 24 * s)) / (12 * s);
  for (let it = 0; it < 50; it++) {
    const f = Math.log(k) - digamma(k) - s;
    const df = 1 / k - trigamma(k);
    const nuevo = k - f / df;
    if (!Number.isFinite(nuevo) || nuevo <= 0) break;
    if (Math.abs(nuevo - k) < 1e-12 * k) return nuevo;
    k = nuevo;
  }
  return k;
}

function diagnosticar(x: Float64Array, media: number, desviacion: number): DiagnosticoDatos {
  const n = x.length;
  let m3 = 0;
  let m4 = 0;
  let negativos = 0;
  let ceros = 0;
  let enteros = true;
  for (const v of x) {
    const d = v - media;
    m3 += d ** 3;
    m4 += d ** 4;
    if (v < 0) negativos++;
    if (v === 0) ceros++;
    if (!Number.isInteger(v)) enteros = false;
  }
  const m2 = ((n - 1) / n) * desviacion * desviacion;
  const asimetria = m2 > 0 ? m3 / n / m2 ** 1.5 : 0;
  const curtosis = m2 > 0 ? m4 / n / (m2 * m2) - 3 : 0;
  const entreCeroYUno = (x[0] as number) >= 0 && (x[n - 1] as number) <= 1;
  const notas: string[] = [];
  if (n < 30) notas.push(`Solo ${n} datos: los criterios distinguen poco entre familias parecidas; mira la curva y usa el AICc (corregido para pocos datos).`);
  if (negativos > 0 || ceros > 0) {
    notas.push(`Hay ${negativos > 0 ? `${negativos} valores negativos` : ''}${negativos > 0 && ceros > 0 ? ' y ' : ''}${ceros > 0 ? `${ceros} ceros` : ''}: se descartan la lognormal, la gamma y la Weibull, que solo valen para valores positivos.`);
  }
  if (asimetria > 0.5) notas.push(`Asimetría ${asimetria.toLocaleString('es-ES', { maximumFractionDigits: 2 })}: cola larga a la derecha, típica de costes, plazos e importes. La normal y la uniforme suelen encajar mal.`);
  else if (asimetria < -0.5) notas.push(`Asimetría ${asimetria.toLocaleString('es-ES', { maximumFractionDigits: 2 })}: cola larga a la izquierda. Las familias de cola derecha (lognormal, gamma) encajarán mal.`);
  else notas.push('Casi simétricos: la normal, la triangular o la PERT son candidatas naturales.');
  if (curtosis > 1.5) notas.push(`Curtosis en exceso ${curtosis.toLocaleString('es-ES', { maximumFractionDigits: 2 })}: colas más gruesas que una normal; cuidado con subestimar los extremos.`);
  // Enteros que parecen conteos: pequeños o muy repetidos (un importe redondeado no lo es).
  const distintos = new Set(x).size;
  if (enteros && ((x[n - 1] as number) <= 100 || distintos < n * 0.6)) notas.push('Todos son enteros: puede ser una cantidad contable (unidades, incidencias). Si lo es, valora una Poisson o una binomial, o usar los datos tal cual.');
  if (entreCeroYUno) notas.push('Todos están entre 0 y 1: parecen una proporción; se prueba la beta.');
  return { asimetria, curtosis, negativos, ceros, todosEnteros: enteros, entreCeroYUno, notas };
}

/** Los datos tal cual: una discreta con cada valor observado y cuántas veces aparece (hasta 2.000 distintos). */
function empiricaDe(x: Float64Array): DistributionSpec | undefined {
  const cuenta = new Map<number, number>();
  for (const v of x) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  if (cuenta.size > 2_000 || cuenta.size < 2) return undefined;
  const valores = [...cuenta.keys()].sort((a, b) => a - b);
  return { type: 'discrete', values: valores, weights: valores.map((v) => cuenta.get(v) as number) };
}

/** Ordena las candidatas por el criterio elegido (todos: cuanto menor, mejor). */
export function ordenarCandidatos(c: readonly AjusteCandidato[], criterio: CriterioAjuste): AjusteCandidato[] {
  return [...c].sort((p, q) => p[criterio] - q[criterio]);
}

function weibullForma(x: Float64Array, mediaLn: number): number | null {
  let k = 1.2;
  for (let it = 0; it < 100; it++) {
    let s0 = 0; let s1 = 0; let s2 = 0;
    for (const v of x) {
      const p = v ** k;
      const l = Math.log(v);
      s0 += p; s1 += p * l; s2 += p * l * l;
    }
    const f = s1 / s0 - 1 / k - mediaLn;
    const df = (s2 * s0 - s1 * s1) / (s0 * s0) + 1 / (k * k);
    const nuevo = k - f / df;
    if (!Number.isFinite(nuevo) || nuevo <= 0) return null;
    if (Math.abs(nuevo - k) < 1e-10 * k) return nuevo;
    k = nuevo;
  }
  return k;
}

export function ajustarDistribuciones(datos: readonly number[]): ResultadoAjuste | null {
  const x = Float64Array.from(datos.filter(Number.isFinite)).sort();
  const n = x.length;
  if (n < 5) return null;

  const { media, desviacion } = momentos(x);
  const min = x[0] as number;
  const max = x[n - 1] as number;
  if (!(desviacion > 0)) return { n, media, desviacion, min, max, candidatos: [] };

  const diagnostico = diagnosticar(x, media, desviacion);
  const candidatos = specsDe(x, conteo(x, diagnostico))
    .map(redondearSpec)
    .map((s) => bondad(s, x))
    .filter((c): c is AjusteCandidato => c !== null && Number.isFinite(c.andersonDarling) && Number.isFinite(c.aic))
    .sort((p, q) => p.aicc - q.aicc);

  return { n, media, desviacion, min, max, candidatos, diagnostico, empirica: empiricaDe(x) };
}

function momentos(x: Float64Array): { media: number; desviacion: number } {
  let suma = 0;
  for (const v of x) suma += v;
  const media = suma / x.length;
  let ss = 0;
  for (const v of x) ss += (v - media) ** 2;
  return { media, desviacion: Math.sqrt(ss / (x.length - 1)) };
}

/** ¿Parecen un conteo (enteros no negativos, pequeños o muy repetidos)? Entonces se prueban las discretas. */
function conteo(x: Float64Array, d: DiagnosticoDatos): boolean {
  if (!d.todosEnteros || (x[0] as number) < 0) return false;
  return (x[x.length - 1] as number) <= 100 || new Set(x).size < x.length * 0.6;
}

/**
 * Las candidatas ajustadas a unos datos ordenados, o solo la de la familia
 * `solo` (para el bootstrap, que reajusta la misma familia muchas veces).
 */
function specsDe(x: Float64Array, discretas: boolean, solo?: DistributionSpec['type']): DistributionSpec[] {
  const n = x.length;
  const quiere = (t: DistributionSpec['type']) => solo === undefined || solo === t;
  const { media, desviacion } = momentos(x);
  const min = x[0] as number;
  const max = x[n - 1] as number;
  const specs: DistributionSpec[] = [];
  if (quiere('normal')) specs.push({ type: 'normal', mean: media, stdDev: desviacion });

  // Extremos ampliados: el mínimo de la muestra casi nunca es el mínimo posible.
  const holgura = (max - min) / (n - 1);
  const a = min - holgura;
  const b = max + holgura;
  if (quiere('uniform')) specs.push({ type: 'uniform', min: a, max: b });
  if (quiere('triangular')) specs.push({ type: 'triangular', min: a, mode: Math.min(b, Math.max(a, 3 * media - a - b)), max: b });
  if (quiere('pert')) specs.push({ type: 'pert', min: a, mode: Math.min(b, Math.max(a, (6 * media - a - b) / 4)), max: b });

  if (min > 0 && (quiere('lognormal') || quiere('gamma') || quiere('weibull'))) {
    let sl = 0;
    for (const v of x) sl += Math.log(v);
    const mu = sl / n;
    if (quiere('lognormal')) {
      let sl2 = 0;
      for (const v of x) sl2 += (Math.log(v) - mu) ** 2;
      const sigma = Math.sqrt(sl2 / n);
      // Lognormal en la parametrización por defecto del modelo: media y
      // desviación de la variable, que es lo que el usuario entiende.
      const mediaVar = Math.exp(mu + (sigma * sigma) / 2);
      specs.push({ type: 'lognormal', p1: mediaVar, p2: mediaVar * Math.sqrt(Math.exp(sigma * sigma) - 1) });
    }
    const s = Math.log(media) - mu;
    if (quiere('gamma') && s > 0) {
      const forma = gammaFormaMLE(s);
      specs.push({ type: 'gamma', shape: forma, scale: media / forma });
    }
    const k = quiere('weibull') ? weibullForma(x, mu) : null;
    if (k) {
      let sk = 0;
      for (const v of x) sk += v ** k;
      specs.push({ type: 'weibull', shape: k, scale: (sk / n) ** (1 / k) });
    }
  }
  if (min >= 0 && quiere('exponential')) specs.push({ type: 'exponential', lambda: 1 / media });
  if (min >= 0 && max <= 1 && quiere('beta')) {
    const v = desviacion * desviacion;
    const comun = (media * (1 - media)) / v - 1;
    if (comun > 0) specs.push({ type: 'beta', alpha: media * comun, beta: (1 - media) * comun });
  }
  // I2: conteos. Poisson (λ = la media, su MLE) y, si los datos varían menos
  // que su media, binomial por momentos (con n al menos el máximo visto).
  if (discretas && min >= 0) {
    if (quiere('poisson') && media > 0) specs.push({ type: 'poisson', lambda: media });
    const v = desviacion * desviacion;
    if (quiere('binomial') && v < media) {
      let ensayos = Math.max(max, Math.round(media / (1 - v / media)));
      if (!(ensayos >= 1)) ensayos = max;
      const p = media / ensayos;
      if (p > 0 && p < 1) specs.push({ type: 'binomial', n: ensayos, p });
    }
  }
  return specs;
}

export interface IntervaloBootstrap {
  /** El parámetro de la especificación (`mean`, `shape`…) o el percentil (`p95`). */
  nombre: string;
  /** Para enseñar: «Media», «Forma», «p95». */
  etiqueta: string;
  estimado: number;
  /** Percentil 5 de las repeticiones. */
  bajo: number;
  /** Percentil 95 de las repeticiones. */
  alto: number;
}

export interface ResultadoBootstrap {
  repeticiones: number;
  /** Cuántas repeticiones dieron un ajuste válido de la familia. */
  validas: number;
  parametros: IntervaloBootstrap[];
  percentiles: (IntervaloBootstrap & { p: number })[];
}

/**
 * Bootstrap (I2): se remuestrean los datos con reemplazo, se reajusta la misma
 * familia y se mira cuánto bailan sus parámetros y sus percentiles. Un
 * intervalo ancho dice que con estos datos el ajuste es poco fiable, lo diga
 * el criterio que lo diga. Intervalos del 90 %. Con semilla: da lo mismo cada vez.
 */
const ETIQUETAS_PARAMETRO: Record<string, string> = {
  mean: 'Media', stdDev: 'Desviación', p1: 'Media', p2: 'Desviación', min: 'Mínimo', mode: 'Moda', max: 'Máximo',
  alpha: 'α', beta: 'β', shape: 'Forma', scale: 'Escala', lambda: 'λ', n: 'Ensayos', p: 'Probabilidad',
};

export function bootstrapAjuste(
  datos: readonly number[],
  spec: DistributionSpec,
  percentiles: readonly number[],
  repeticiones = 200,
  semilla = 12345,
): ResultadoBootstrap | null {
  const x = Float64Array.from(datos.filter(Number.isFinite)).sort();
  const n = x.length;
  if (n < 5) return null;
  const discretas = spec.type === 'poisson' || spec.type === 'binomial';
  const claves = Object.keys(spec).filter((k) => k !== 'type' && typeof (spec as unknown as Record<string, unknown>)[k] === 'number');
  const porClave = new Map(claves.map((k) => [k, [] as number[]]));
  const porPercentil = percentiles.map(() => [] as number[]);
  let estado = semilla >>> 0 || 1;
  const azar = () => {
    // mulberry32: rápido y suficiente para remuestrear.
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const muestra = new Float64Array(n);
  let validas = 0;
  for (let r = 0; r < repeticiones; r++) {
    for (let i = 0; i < n; i++) muestra[i] = x[Math.floor(azar() * n)] as number;
    muestra.sort();
    if (!(momentos(muestra).desviacion > 0)) continue;
    const s = specsDe(muestra, discretas, spec.type)[0];
    if (!s) continue;
    let dist;
    try {
      dist = construirDesdeDescriptor(toDescriptor(s));
    } catch {
      continue;
    }
    validas++;
    for (const k of claves) {
      const v = (s as unknown as Record<string, number>)[k];
      if (typeof v === 'number' && Number.isFinite(v)) porClave.get(k)?.push(v);
    }
    percentiles.forEach((p, i) => porPercentil[i]?.push(dist.quantile(p)));
  }
  if (validas === 0) return { repeticiones, validas, parametros: [], percentiles: [] };
  const intervalo = (vs: number[]) => {
    const o = Float64Array.from(vs).sort();
    return { bajo: percentilDatos(o, 0.05), alto: percentilDatos(o, 0.95) };
  };
  const base = construirDesdeDescriptor(toDescriptor(spec));
  return {
    repeticiones,
    validas,
    parametros: claves
      .filter((k) => (porClave.get(k)?.length ?? 0) > 0)
      .map((k) => ({ nombre: k, etiqueta: ETIQUETAS_PARAMETRO[k] ?? k, estimado: (spec as unknown as Record<string, number>)[k] as number, ...intervalo(porClave.get(k) as number[]) })),
    percentiles: percentiles.map((p, i) => ({ nombre: `p${Math.round(p * 100)}`, etiqueta: `p${Math.round(p * 100)}`, p, estimado: base.quantile(p), ...intervalo(porPercentil[i] as number[]) })),
  };
}
