import { describe, expect, it } from 'vitest';

import { normal, triangular, uniform } from '../../engine/distributions/index.ts';
import {
  correlacionarImanConover,
  generarEntrada,
  muestrearLHS,
  muestrearMonteCarlo,
} from '../../engine/sampling/index.ts';

const SEED = 20260915;

function momentos(muestra: Float64Array): { media: number; varianza: number } {
  let suma = 0;
  for (const x of muestra) suma += x;
  const media = suma / muestra.length;
  let acum = 0;
  for (const x of muestra) acum += (x - media) ** 2;
  return { media, varianza: acum / muestra.length };
}

function pearson(a: Float64Array, b: Float64Array): number {
  const n = a.length;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sx += a[i] as number;
    sy += b[i] as number;
    sxy += (a[i] as number) * (b[i] as number);
    sxx += (a[i] as number) * (a[i] as number);
    syy += (b[i] as number) * (b[i] as number);
  }
  return (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));
}

/** Rangos (1..n) para la correlación de Spearman, con empates promediados. */
function rangos(valores: Float64Array): Float64Array {
  const n = valores.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((i, j) => (valores[i] as number) - (valores[j] as number));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[indices[i] as number] = i + 1;
  return out;
}

function spearman(a: Float64Array, b: Float64Array): number {
  return pearson(rangos(a), rangos(b));
}

describe('muestrearMonteCarlo', () => {
  it('es determinista y reproduce la media/varianza de la distribución', () => {
    const dist = normal(1000, 50);
    const a = muestrearMonteCarlo(dist, 'in_precio', SEED, 200_000);
    const b = muestrearMonteCarlo(dist, 'in_precio', SEED, 200_000);
    expect(Array.from(a)).toEqual(Array.from(b));

    const { media, varianza } = momentos(a);
    expect(media).toBeCloseTo(1000, 0);
    expect(varianza).toBeCloseTo(2500, -2);
  });

  it('variables con id distinto no comparten flujo (independientes)', () => {
    const dist = uniform(0, 1);
    const a = muestrearMonteCarlo(dist, 'in_acero', SEED, 100_000);
    const b = muestrearMonteCarlo(dist, 'in_cemento', SEED, 100_000);
    expect(Math.abs(pearson(a, b))).toBeLessThan(0.02);
  });

  it('añadir una variable no cambia los números de las demás', () => {
    const dist = uniform(0, 1);
    const sinNueva = muestrearMonteCarlo(dist, 'in_acero', SEED, 1000);
    // Simplemente muestrear otra variable (con otro id) antes o después no
    // debe alterar el flujo de 'in_acero': cada una depende solo de su id.
    muestrearMonteCarlo(dist, 'in_cemento', SEED, 1000);
    const conNueva = muestrearMonteCarlo(dist, 'in_acero', SEED, 1000);
    expect(Array.from(conNueva)).toEqual(Array.from(sinNueva));
  });
});

describe('muestrearLHS', () => {
  it('estratifica: cada tramo de 1/n contiene exactamente una muestra', () => {
    const dist = uniform(0, 1);
    const n = 1000;
    const muestra = muestrearLHS(dist, 'in_x', SEED, n);
    const conteoPorTramo = new Int32Array(n);
    for (const x of muestra) {
      const tramo = Math.min(n - 1, Math.floor(x * n));
      conteoPorTramo[tramo]!++;
    }
    for (const c of conteoPorTramo) expect(c).toBe(1);
  });

  it('reproduce la media y varianza con más precisión que Monte Carlo a igual n', () => {
    const dist = normal(1000, 50);
    const n = 2000;
    const mc = muestrearMonteCarlo(dist, 'in_y', SEED, n);
    const lhs = muestrearLHS(dist, 'in_y', SEED, n);

    const errorMC = Math.abs(momentos(mc).media - 1000);
    const errorLHS = Math.abs(momentos(lhs).media - 1000);
    expect(errorLHS).toBeLessThan(errorMC);
  });

  it('es determinista', () => {
    const dist = triangular(0, 50, 100);
    const a = muestrearLHS(dist, 'in_z', SEED, 5000);
    const b = muestrearLHS(dist, 'in_z', SEED, 5000);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('variables con id distinto se estratifican con barajas independientes', () => {
    const dist = uniform(0, 1);
    const a = muestrearLHS(dist, 'in_acero', SEED, 50_000);
    const b = muestrearLHS(dist, 'in_cemento', SEED, 50_000);
    expect(Math.abs(pearson(a, b))).toBeLessThan(0.02);
  });
});

describe('generarEntrada', () => {
  it('despacha al método pedido', () => {
    const dist = uniform(0, 1);
    expect(Array.from(generarEntrada(dist, 'in_a', SEED, 100, 'monte-carlo'))).toEqual(
      Array.from(muestrearMonteCarlo(dist, 'in_a', SEED, 100)),
    );
    expect(Array.from(generarEntrada(dist, 'in_a', SEED, 100, 'lhs'))).toEqual(
      Array.from(muestrearLHS(dist, 'in_a', SEED, 100)),
    );
  });
});

describe('correlacionarImanConover', () => {
  it('induce la correlación objetivo sin tocar las marginales', () => {
    const n = 100_000;
    const acero = muestrearMonteCarlo(normal(800, 50), 'acero', SEED, n);
    const cemento = muestrearMonteCarlo(normal(300, 20), 'cemento', SEED, n);

    const objetivo = 0.7;
    const [aceroCorr, cementoCorr] = correlacionarImanConover(
      [acero, cemento],
      [
        [1, objetivo],
        [objetivo, 1],
      ],
      SEED,
      'grupo-materiales',
    );

    expect(spearman(aceroCorr!, cementoCorr!)).toBeCloseTo(objetivo, 1);

    // Marginales intactas: mismo multiconjunto de valores, solo reordenado.
    expect(Array.from(Float64Array.from(aceroCorr!).sort())).toEqual(
      Array.from(Float64Array.from(acero).sort()),
    );
    expect(Array.from(Float64Array.from(cementoCorr!).sort())).toEqual(
      Array.from(Float64Array.from(cemento).sort()),
    );
  });

  it('con correlación 0 dos variables antes correlacionadas quedan casi independientes', () => {
    const n = 100_000;
    // Se parte de un par ya correlacionado (mismo id da el mismo flujo) para
    // comprobar que el algoritmo también puede *quitar* correlación.
    const a = muestrearMonteCarlo(normal(0, 1), 'compartida', SEED, n);
    const b = a.slice(); // perfectamente correlacionado consigo mismo

    const [aOut, bOut] = correlacionarImanConover([a, b], [[1, 0], [0, 1]], SEED, 'grupo-neutro');
    expect(Math.abs(spearman(aOut!, bOut!))).toBeLessThan(0.05);
  });

  it('rechaza una matriz de correlación no simétrica o con diagonal distinta de 1', () => {
    const buf = muestrearMonteCarlo(uniform(0, 1), 'x', SEED, 100);
    expect(() => correlacionarImanConover([buf, buf], [[1, 0.5], [0.4, 1]], SEED, 'g')).toThrow();
    expect(() => correlacionarImanConover([buf, buf], [[1, 0.5], [0.5, 0.9]], SEED, 'g')).toThrow();
  });

  it('rechaza una matriz de correlación no definida positiva', () => {
    const buf = muestrearMonteCarlo(uniform(0, 1), 'x', SEED, 100);
    // Tres variables mutuamente anticorrelacionadas al máximo: imposible.
    const imposible = [
      [1, -0.9, -0.9],
      [-0.9, 1, -0.9],
      [-0.9, -0.9, 1],
    ];
    expect(() => correlacionarImanConover([buf, buf, buf], imposible, SEED, 'g')).toThrow();
  });
});
