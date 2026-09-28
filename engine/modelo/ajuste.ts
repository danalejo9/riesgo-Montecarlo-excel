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
}

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
  return {
    spec,
    aic: 2 * k - 2 * ll,
    aicc: 2 * k - 2 * ll + (n - k - 1 > 0 ? (2 * k * (k + 1)) / (n - k - 1) : Infinity),
    cramerVonMises: cvm,
    bic: k * Math.log(n) - 2 * ll,
    parametros: k,
    andersonDarling: -n - suma / n,
    kolmogorovSmirnov: ks,
  };
}

export type CriterioAjuste = 'aicc' | 'aic' | 'bic' | 'andersonDarling' | 'cramerVonMises';

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

  let suma = 0;
  for (const v of x) suma += v;
  const media = suma / n;
  let ss = 0;
  for (const v of x) ss += (v - media) ** 2;
  const desviacion = Math.sqrt(ss / (n - 1));
  const min = x[0] as number;
  const max = x[n - 1] as number;
  if (!(desviacion > 0)) return { n, media, desviacion, min, max, candidatos: [] };

  const specs: DistributionSpec[] = [{ type: 'normal', mean: media, stdDev: desviacion }];

  // Extremos ampliados: el mínimo de la muestra casi nunca es el mínimo posible.
  const holgura = (max - min) / (n - 1);
  const a = min - holgura;
  const b = max + holgura;
  specs.push({ type: 'uniform', min: a, max: b });
  const modaTri = Math.min(b, Math.max(a, 3 * media - a - b));
  specs.push({ type: 'triangular', min: a, mode: modaTri, max: b });
  const modaPert = Math.min(b, Math.max(a, (6 * media - a - b) / 4));
  specs.push({ type: 'pert', min: a, mode: modaPert, max: b });

  if (min > 0) {
    let sl = 0;
    for (const v of x) sl += Math.log(v);
    const mu = sl / n;
    let sl2 = 0;
    for (const v of x) sl2 += (Math.log(v) - mu) ** 2;
    const sigma = Math.sqrt(sl2 / n);
    // Lognormal en la parametrización por defecto del modelo: media y
    // desviación de la variable, que es lo que el usuario entiende.
    const mediaVar = Math.exp(mu + (sigma * sigma) / 2);
    specs.push({ type: 'lognormal', p1: mediaVar, p2: mediaVar * Math.sqrt(Math.exp(sigma * sigma) - 1) });

    const s = Math.log(media) - mu;
    if (s > 0) {
      const forma = gammaFormaMLE(s);
      specs.push({ type: 'gamma', shape: forma, scale: media / forma });
    }
    const k = weibullForma(x, mu);
    if (k) {
      let sk = 0;
      for (const v of x) sk += v ** k;
      specs.push({ type: 'weibull', shape: k, scale: (sk / n) ** (1 / k) });
    }
  }
  if (min >= 0) specs.push({ type: 'exponential', lambda: 1 / media });
  if (min >= 0 && max <= 1) {
    const v = desviacion * desviacion;
    const comun = (media * (1 - media)) / v - 1;
    if (comun > 0) specs.push({ type: 'beta', alpha: media * comun, beta: (1 - media) * comun });
  }

  const candidatos = specs
    .map(redondearSpec)
    .map((s) => bondad(s, x))
    .filter((c): c is AjusteCandidato => c !== null && Number.isFinite(c.andersonDarling) && Number.isFinite(c.aic))
    .sort((p, q) => p.aicc - q.aicc);

  return { n, media, desviacion, min, max, candidatos, diagnostico: diagnosticar(x, media, desviacion), empirica: empiricaDe(x) };
}
