import { describe, expect, it } from 'vitest';

import {
  bernoulli,
  beta,
  binomial,
  discrete,
  empirical,
  erf,
  erfinv,
  exponential,
  gamma,
  invNormalCDF,
  lognormal,
  normal,
  normalCDF,
  pert,
  poisson,
  regularizedIncompleteBeta,
  triangular,
  truncar,
  uniform,
  weibull,
  type Distribution,
} from '../../engine/distributions/index.ts';
import { fillUniform } from '../../engine/random/index.ts';

const SEED = 20260915;
const N = 200_000;

/**
 * Prueba de Kolmogorov–Smirnov de una muestra contra la CDF teórica.
 *
 * Fase 2 §11.2: cada distribución se contrasta así, con semilla fija para que
 * el test sea determinista. El valor crítico al 0,1 % para N grande es
 * `1.95 / sqrt(N)` (aprox. asintótica de Kolmogorov); se usa un margen algo
 * mayor para no depender de la cola exacta de esa aproximación.
 */
function estadisticoKS(muestra: Float64Array, cdf: (x: number) => number): number {
  const ordenada = Float64Array.from(muestra).sort();
  let dMax = 0;
  for (let i = 0; i < ordenada.length; i++) {
    const f = cdf(ordenada[i] as number);
    const dPlus = (i + 1) / ordenada.length - f;
    const dMinus = f - i / ordenada.length;
    dMax = Math.max(dMax, dPlus, dMinus);
  }
  return dMax;
}

function muestrearDistribucion(dist: Distribution, stream: number, n = N): Float64Array {
  const u = new Float64Array(n);
  fillUniform(u, SEED, stream, 0);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = dist.quantile(u[i] as number);
  return out;
}

function esperarKS(dist: Distribution, stream: number, umbral = 0.01, n = N) {
  const muestra = muestrearDistribucion(dist, stream, n);
  const d = estadisticoKS(muestra, dist.cdf);
  expect(d).toBeLessThan(umbral);
}

function momentosDe(muestra: Float64Array): { media: number; varianza: number } {
  let suma = 0;
  for (const x of muestra) suma += x;
  const media = suma / muestra.length;
  let acum = 0;
  for (const x of muestra) acum += (x - media) ** 2;
  return { media, varianza: acum / muestra.length };
}

describe('mathfn', () => {
  it('erfinv es la inversa de erf', () => {
    for (const x of [-0.99, -0.5, -0.01, 0, 0.01, 0.5, 0.99]) {
      expect(erfinv(x)).toBeCloseTo(erfinv(x), 10);
      expect(erf(erfinv(x))).toBeCloseTo(x, 6);
    }
  });

  it('invNormalCDF es la inversa de normalCDF', () => {
    for (const p of [0.001, 0.05, 0.25, 0.5, 0.75, 0.95, 0.999]) {
      const z = invNormalCDF(p);
      expect(normalCDF(z)).toBeCloseTo(p, 6);
    }
    // Puntos de referencia conocidos.
    expect(invNormalCDF(0.5)).toBeCloseTo(0, 9);
    expect(invNormalCDF(0.975)).toBeCloseTo(1.959963985, 5);
  });

  it('regularizedIncompleteBeta(a,b,x) coincide con la simétrica I_x(a,b)=1-I_1-x(b,a)', () => {
    expect(regularizedIncompleteBeta(2, 5, 0.3)).toBeCloseTo(1 - regularizedIncompleteBeta(5, 2, 0.7), 8);
  });
});

describe('normal', () => {
  const dist = normal(1000, 50);

  it('pasa KS contra su propia CDF', () => esperarKS(dist, 1001));

  it('tiene la media y varianza declaradas', () => {
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1002));
    expect(media).toBeCloseTo(1000, 0);
    expect(varianza).toBeCloseTo(2500, -2);
  });
});

describe('lognormal', () => {
  it('parametrización "variable": media=1000 no da Infinity (bug del heredado)', () => {
    // Fase 1 §4.3: con media y desviación en escala de la variable, el
    // heredado interpretaba los parámetros como los del logaritmo y
    // `exp(1000)` desbordaba. Aquí debe dar una muestra finita y con la media
    // pedida.
    const dist = lognormal(1000, 200, 'variable');
    const muestra = muestrearDistribucion(dist, 1101);
    for (const x of muestra) expect(Number.isFinite(x)).toBe(true);
    const { media } = momentosDe(muestra);
    expect(media).toBeCloseTo(1000, -1);
  });

  it('parametrización "logaritmo" pasa KS contra su CDF', () => {
    const dist = lognormal(6.5, 0.3, 'logaritmo');
    esperarKS(dist, 1102);
  });
});

describe('uniform', () => {
  const dist = uniform(10, 20);
  it('pasa KS y tiene media/varianza de una uniforme', () => {
    esperarKS(dist, 1201);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1202));
    expect(media).toBeCloseTo(15, 1);
    expect(varianza).toBeCloseTo(100 / 12, 1);
  });

  it('rechaza min >= max', () => {
    expect(() => uniform(5, 5)).toThrow();
    expect(() => uniform(5, 4)).toThrow();
  });
});

describe('triangular', () => {
  const dist = triangular(0, 30, 100);

  it('pasa KS contra su CDF', () => esperarKS(dist, 1301));

  it('tiene la media y varianza teóricas', () => {
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1302));
    expect(media).toBeCloseTo(dist.mean(), 0);
    expect(varianza).toBeCloseTo(dist.variance(), -1);
  });

  it('rechaza min <= moda <= max violado, y min === max (Fase 1 §4.3)', () => {
    expect(() => triangular(10, 5, 20)).toThrow();
    expect(() => triangular(10, 25, 20)).toThrow();
    expect(() => triangular(10, 10, 10)).toThrow();
  });
});

describe('PERT', () => {
  // Caso de la auditoría: el heredado devolvía (triangular+media+moda)/3,
  // reduciendo la varianza a ~1/9 de la triangular. Este es exactamente el
  // test que lo habría detectado (Fase 2 §11.2).
  it('NO reduce la varianza a ~1/9 de la triangular equivalente', () => {
    const min = 800;
    const moda = 950;
    const max = 1400;

    const varTriangular = triangular(min, moda, max).variance();
    const distPert = pert(min, moda, max);
    const varPertTeorica = distPert.variance();

    // La PERT real tiene menor varianza que la triangular (más masa cerca de
    // la moda por el peso beta), pero nada parecido a ~1/9: debe quedar en
    // una banda razonable, no colapsar.
    const ratio = varPertTeorica / varTriangular;
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.9);
  });

  it('pasa KS contra su CDF (Beta reescalada)', () => {
    const dist = pert(800, 950, 1400);
    esperarKS(dist, 1401);
  });

  it('la muestra reproduce la media y varianza declaradas', () => {
    const dist = pert(800, 950, 1400);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1402));
    expect(media).toBeCloseTo(dist.mean(), -1);
    expect(varianza / dist.variance()).toBeCloseTo(1, 1);
  });

  it('rechaza min <= moda <= max violado', () => {
    expect(() => pert(10, 5, 20)).toThrow();
  });
});

describe('beta', () => {
  it('pasa KS para formas asimétricas y en U', () => {
    esperarKS(beta(2, 5), 1501);
    // Forma en U: la inversión por bisección converge mucho más despacio
    // cerca de los extremos, así que esta rama usa menos muestras para no
    // volverse un test lento — la potencia estadística sigue sobrando para
    // detectar un error de implementación real.
    esperarKS(beta(0.5, 0.5), 1502, 0.02, 20_000);
  });

  it('tiene la media y varianza teóricas', () => {
    const dist = beta(2, 5);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1503));
    expect(media).toBeCloseTo(dist.mean(), 2);
    expect(varianza).toBeCloseTo(dist.variance(), 2);
  });
});

describe('gamma y exponential', () => {
  it('gamma pasa KS y tiene media/varianza teóricas', () => {
    const dist = gamma(3, 2);
    esperarKS(dist, 1601);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1602));
    expect(media).toBeCloseTo(dist.mean(), 0);
    expect(varianza).toBeCloseTo(dist.variance(), -1);
  });

  it('exponential pasa KS y tiene media/varianza teóricas', () => {
    const dist = exponential(0.02);
    esperarKS(dist, 1701);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1702));
    expect(media).toBeCloseTo(dist.mean(), 0);
    expect(varianza).toBeCloseTo(dist.variance(), -2);
  });
});

describe('weibull', () => {
  it('pasa KS y tiene media/varianza teóricas', () => {
    const dist = weibull(2, 100);
    esperarKS(dist, 1801);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 1802));
    expect(media).toBeCloseTo(dist.mean(), 0);
    expect(varianza).toBeCloseTo(dist.variance(), -2);
  });
});

describe('bernoulli, binomial y poisson', () => {
  it('bernoulli reproduce p', () => {
    const dist = bernoulli(0.3);
    const { media } = momentosDe(muestrearDistribucion(dist, 1901));
    expect(media).toBeCloseTo(0.3, 2);
  });

  it('binomial: inversión reproduce media y varianza (n·p·(1-p) pequeño)', () => {
    const dist = binomial(20, 0.3);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 2001));
    expect(media).toBeCloseTo(dist.mean(), 1);
    expect(varianza).toBeCloseTo(dist.variance(), 0);
  });

  it('binomial: aproximación normal reproduce media y varianza (n grande)', () => {
    // n·p·(1-p) = 100000*0.5*0.5 = 25000, por encima del umbral de inversión:
    // ejercita la rama O(1) que sustituye a los n ensayos de Bernoulli del
    // heredado (Fase 1 §4.3).
    const dist = binomial(100_000, 0.5);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 2002));
    expect(media).toBeCloseTo(dist.mean(), -1);
    expect(varianza).toBeCloseTo(dist.variance(), -2);
  });

  it('poisson: inversión reproduce media y varianza (lambda pequeño)', () => {
    const dist = poisson(4);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 2101));
    expect(media).toBeCloseTo(dist.mean(), 1);
    expect(varianza).toBeCloseTo(dist.variance(), 0);
  });

  it('poisson: lambda grande no cuelga y reproduce media/varianza (Fase 1 §4.3)', () => {
    // El heredado usaba exp(-lambda), que desborda a 0 para lambda > ~745.
    // Aquí lambda=2000 debe resolverse en O(1) vía aproximación normal.
    const dist = poisson(2000);
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 2102));
    expect(media).toBeCloseTo(dist.mean(), -1);
    expect(varianza).toBeCloseTo(dist.variance(), -1);
  });
});

describe('discrete', () => {
  it('reproduce las probabilidades declaradas', () => {
    const dist = discrete([1, 2, 3], [0.2, 0.3, 0.5]);
    const muestra = muestrearDistribucion(dist, 2201);
    const conteo = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (const x of muestra) conteo[x] = (conteo[x] ?? 0) + 1;
    expect(conteo[1]! / muestra.length).toBeCloseTo(0.2, 2);
    expect(conteo[2]! / muestra.length).toBeCloseTo(0.3, 2);
    expect(conteo[3]! / muestra.length).toBeCloseTo(0.5, 2);
  });

  it('rechaza pesos negativos o listas de distinta longitud', () => {
    expect(() => discrete([1, 2], [0.5, -0.5])).toThrow();
    expect(() => discrete([1, 2], [1])).toThrow();
  });
});

describe('empirical', () => {
  const dist = empirical(0, [
    [50, 0.3],
    [80, 0.7],
  ], 100);

  it('pasa KS contra su propia CDF lineal a trozos', () => esperarKS(dist, 2301));

  it('tiene la media y varianza que integra de su propia CDF', () => {
    const { media, varianza } = momentosDe(muestrearDistribucion(dist, 2302));
    expect(media).toBeCloseTo(dist.mean(), 0);
    expect(varianza).toBeCloseTo(dist.variance(), -1);
  });

  it('rechaza puntos de control no crecientes', () => {
    expect(() => empirical(0, [[80, 0.7], [50, 0.3]], 100)).toThrow();
    expect(() => empirical(0, [[50, 0.7], [80, 0.3]], 100)).toThrow();
  });
});

describe('truncar', () => {
  it('normal truncada solo produce valores dentro del rango', () => {
    const dist = truncar(normal(1000, 200), 800, 1200);
    const muestra = muestrearDistribucion(dist, 2401);
    for (const x of muestra) {
      expect(x).toBeGreaterThanOrEqual(800);
      expect(x).toBeLessThanOrEqual(1200);
    }
  });

  it('pasa KS contra su propia CDF truncada', () => {
    const dist = truncar(normal(1000, 200), 800, 1200);
    esperarKS(dist, 2402);
  });

  it('rechaza un rango sin masa de la distribución base', () => {
    expect(() => truncar(normal(0, 1), 100, 200)).toThrow();
  });
});
