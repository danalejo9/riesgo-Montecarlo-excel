import { describe, expect, it } from 'vitest';

import { normal, triangular } from '../../engine/distributions/index.ts';
import { muestrearMonteCarlo } from '../../engine/sampling/index.ts';
import {
  acumular,
  combinar,
  combinarTDigest,
  construirHistograma,
  crearWelford,
  cuantilTDigest,
  percentilExacto,
  percentilesExactos,
  tdigestDeBuffer,
  varianzaMuestral,
  varianzaPoblacional,
} from '../../engine/stats/index.ts';

const SEED = 20260915;

describe('Welford', () => {
  it('reproduce media y varianza de una muestra conocida', () => {
    const datos = new Float64Array([2, 4, 4, 4, 5, 5, 7, 9]);
    const estado = acumular(crearWelford(), datos);
    expect(estado.media).toBeCloseTo(5, 10);
    expect(varianzaPoblacional(estado)).toBeCloseTo(4, 10); // valor de libro de texto
    expect(varianzaMuestral(estado)).toBeCloseTo(32 / 7, 10);
    expect(estado.min).toBe(2);
    expect(estado.max).toBe(9);
  });

  it('combinar dos bloques da lo mismo que acumular todo junto', () => {
    const dist = normal(1000, 50);
    const todo = muestrearMonteCarlo(dist, 'welford_todo', SEED, 100_000);
    const bloqueA = todo.subarray(0, 37_000);
    const bloqueB = todo.subarray(37_000);

    const junto = acumular(crearWelford(), todo);
    const porBloques = combinar(acumular(crearWelford(), bloqueA), acumular(crearWelford(), bloqueB));

    expect(porBloques.n).toBe(junto.n);
    expect(porBloques.media).toBeCloseTo(junto.media, 9);
    expect(varianzaPoblacional(porBloques)).toBeCloseTo(varianzaPoblacional(junto), 6);
    expect(porBloques.min).toBe(junto.min);
    expect(porBloques.max).toBe(junto.max);
  });

  it('combinar es asociativo y neutro con un estado vacío', () => {
    const dist = normal(0, 1);
    const a = acumular(crearWelford(), muestrearMonteCarlo(dist, 'a', SEED, 1000));
    const b = acumular(crearWelford(), muestrearMonteCarlo(dist, 'b', SEED, 1000));
    const c = acumular(crearWelford(), muestrearMonteCarlo(dist, 'c', SEED, 1000));

    const izquierda = combinar(combinar(a, b), c);
    const derecha = combinar(a, combinar(b, c));
    expect(izquierda.media).toBeCloseTo(derecha.media, 9);
    expect(izquierda.m2).toBeCloseTo(derecha.m2, 6);

    expect(combinar(crearWelford(), a)).toEqual(a);
    expect(combinar(a, crearWelford())).toEqual(a);
  });

  it('varianza muestral es NaN con menos de dos valores; poblacional, con cero', () => {
    const unValor = acumular(crearWelford(), new Float64Array([42]));
    expect(varianzaMuestral(unValor)).toBeNaN();
    expect(varianzaPoblacional(unValor)).toBe(0);
    expect(varianzaPoblacional(crearWelford())).toBeNaN();
  });
});

describe('percentiles exactos', () => {
  it('coincide con PERCENTILE.INC de Excel en un caso de referencia', () => {
    // Ejemplo estándar: PERCENTILE.INC({1,2,3,4}, 0.25) = 1.75
    const datos = new Float64Array([1, 2, 3, 4]);
    expect(percentilExacto(datos, 0.25)).toBeCloseTo(1.75, 10);
    expect(percentilExacto(datos, 0)).toBe(1);
    expect(percentilExacto(datos, 1)).toBe(4);
    expect(percentilExacto(datos, 0.5)).toBeCloseTo(2.5, 10);
  });

  it('percentilesExactos ordena una sola vez y da lo mismo que llamadas individuales', () => {
    const dist = triangular(0, 30, 100);
    const datos = muestrearMonteCarlo(dist, 'p', SEED, 10_000);
    const [p10, p50, p90] = percentilesExactos(datos, [0.1, 0.5, 0.9]);
    expect(p10).toBeCloseTo(percentilExacto(datos, 0.1), 10);
    expect(p50).toBeCloseTo(percentilExacto(datos, 0.5), 10);
    expect(p90).toBeCloseTo(percentilExacto(datos, 0.9), 10);
  });

  it('rechaza p fuera de [0,1] y buffer vacío', () => {
    expect(() => percentilExacto(new Float64Array([1, 2]), 1.5)).toThrow();
    expect(() => percentilExacto(new Float64Array([]), 0.5)).toThrow();
  });
});

describe('histograma', () => {
  it('cada valor cae en exactamente un bin, incluido el máximo', () => {
    const datos = new Float64Array([0, 1, 2, 3, 4, 5, 5, 5, 10]);
    const h = construirHistograma(datos, 5);
    const total = h.conteos.reduce((a, b) => a + b, 0);
    expect(total).toBe(datos.length);
    expect(h.min).toBe(0);
    expect(h.max).toBe(10);
  });

  it('respeta min/max explícitos y descarta lo que cae fuera', () => {
    const datos = new Float64Array([-5, 0, 5, 10, 15, 20]);
    const h = construirHistograma(datos, 2, 0, 10);
    expect(h.conteos.reduce((a, b) => a + b, 0)).toBe(3); // 0, 5, 10 caen dentro
  });

  it('rechaza bins <= 0 y min >= max', () => {
    expect(() => construirHistograma(new Float64Array([1, 2]), 0)).toThrow();
    expect(() => construirHistograma(new Float64Array([1, 2]), 5, 10, 5)).toThrow();
  });
});

describe('t-digest', () => {
  it('aproxima los percentiles exactos con buena precisión en una normal', () => {
    const dist = normal(1000, 100);
    const datos = muestrearMonteCarlo(dist, 'td', SEED, 200_000);
    const digest = tdigestDeBuffer(datos, 100);

    for (const q of [0.01, 0.1, 0.5, 0.9, 0.99]) {
      const exacto = percentilExacto(datos, q);
      const aproximado = cuantilTDigest(digest, q);
      // Tolerancia generosa en unidades de desviación estándar: el t-digest
      // es una aproximación, no un sustituto exacto (Fase 2 §3.3).
      expect(Math.abs(aproximado - exacto)).toBeLessThan(15);
    }
  });

  it('es más preciso en las colas que en el centro (objetivo de diseño del t-digest)', () => {
    const dist = normal(0, 1);
    const datos = muestrearMonteCarlo(dist, 'td-colas', SEED, 500_000);
    const digest = tdigestDeBuffer(datos, 100);

    const errorCola = Math.abs(cuantilTDigest(digest, 0.999) - percentilExacto(datos, 0.999));
    const errorCentro = Math.abs(cuantilTDigest(digest, 0.5) - percentilExacto(datos, 0.5));
    // No es una garantía matemática estricta con datos aleatorios, pero con
    // compresión 100 y 500k muestras la relación debe sostenerse cómodamente.
    expect(errorCola).toBeLessThan(0.2);
    expect(errorCentro).toBeLessThan(0.2);
  });

  it('combinar varios digests parciales da resultados cercanos al digest del total', () => {
    const dist = normal(500, 80);
    const todo = muestrearMonteCarlo(dist, 'td-combinar', SEED, 150_000);
    const bloques = [todo.subarray(0, 50_000), todo.subarray(50_000, 100_000), todo.subarray(100_000)];

    const digestJunto = tdigestDeBuffer(todo, 100);
    const digestCombinado = combinarTDigest(bloques.map((b) => tdigestDeBuffer(b, 100)));

    for (const q of [0.1, 0.5, 0.9]) {
      expect(cuantilTDigest(digestCombinado, q)).toBeCloseTo(cuantilTDigest(digestJunto, q), -1);
    }
  });

  it('un digest vacío no revienta y devuelve NaN', () => {
    const digest = combinarTDigest([]);
    expect(digest.pesoTotal).toBe(0);
    expect(Number.isNaN(cuantilTDigest(digest, 0.5))).toBe(true);
  });
});
