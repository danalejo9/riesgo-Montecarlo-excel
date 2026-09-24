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
 * **Cómo se ordenan**: por el estadístico de **Anderson–Darling**, que pesa
 * más las colas que Kolmogorov–Smirnov —y en riesgo lo que importa son las
 * colas—. Se da también el de K–S porque es el que la gente conoce. Los dos
 * solo necesitan la función de distribución, que todas las del motor tienen.
 *
 * **Lo que no dice**: si el ajuste es "estadísticamente aceptable". Los
 * valores críticos de A–D dependen de la distribución y de que los parámetros
 * se hayan estimado de los mismos datos; dar un "p = 0,23" aquí sería
 * aparentar un rigor que no hay. Se ordena, se enseña el número, y el panel
 * pide mirar la curva.
 */

import { construirDesdeDescriptor } from '../distributions/index.ts';
import { toDescriptor, type DistributionSpec } from './distributionSchema.ts';

export interface AjusteCandidato {
  spec: DistributionSpec;
  /** Anderson–Darling: cuanto menor, mejor. */
  andersonDarling: number;
  /** Kolmogorov–Smirnov (distancia máxima entre CDF empírica y teórica, 0..1). */
  kolmogorovSmirnov: number;
}

export interface ResultadoAjuste {
  n: number;
  media: number;
  desviacion: number;
  min: number;
  max: number;
  /** De mejor a peor. */
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
  return { spec, andersonDarling: -n - suma / n, kolmogorovSmirnov: ks };
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
      const forma = (3 - s + Math.sqrt((s - 3) ** 2 + 24 * s)) / (12 * s);
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
    .filter((c): c is AjusteCandidato => c !== null && Number.isFinite(c.andersonDarling))
    .sort((p, q) => p.andersonDarling - q.andersonDarling);

  return { n, media, desviacion, min, max, candidatos };
}
