import { describe, expect, it } from 'vitest';

import {
  fillUniform,
  mulhilo32,
  philox2x32,
  streamOf,
  uniformAt,
  uniformOpenAt,
} from '../../engine/random/index.ts';

const SEED = 20260915;

describe('mulhilo32', () => {
  it('coincide con la multiplicación exacta de 64 bits', () => {
    // BigInt es la referencia: lento, pero exacto. El código de producción no
    // puede usarlo (sería el cuello de botella del muestreo), así que la
    // descomposición en mitades de 16 bits se verifica contra él.
    const casos = [
      [0, 0],
      [1, 1],
      [0xffffffff, 0xffffffff],
      [0xd256d193, 0x9e3779b9],
      [0x80000000, 2],
      [123456789, 987654321],
      [0xffff, 0x10001],
    ];

    for (const [a, b] of casos) {
      const esperado = (BigInt(a) * BigInt(b)) & 0xffffffffffffffffn;
      const { hi, lo } = mulhilo32(a, b);
      expect(BigInt(hi) * 4294967296n + BigInt(lo)).toBe(esperado);
    }
  });

  it('es exacto para pares pseudoaleatorios', () => {
    for (let i = 0; i < 2000; i++) {
      const a = Math.floor(uniformAt(SEED, 1, i) * 4294967296);
      const b = Math.floor(uniformAt(SEED, 2, i) * 4294967296);
      const { hi, lo } = mulhilo32(a, b);
      expect(BigInt(hi) * 4294967296n + BigInt(lo)).toBe(BigInt(a) * BigInt(b));
    }
  });
});

describe('philox2x32', () => {
  it('devuelve palabras de 32 bits sin signo', () => {
    for (let i = 0; i < 100; i++) {
      const { a, b } = philox2x32(i, 7, SEED);
      expect(Number.isInteger(a)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(0xffffffff);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('cambia por completo ante un cambio de un solo bit en el contador', () => {
    // Efecto avalancha: contadores consecutivos no deben dar salidas parecidas,
    // que es justo lo que pasaría con un hash débil.
    const x = philox2x32(0, 0, SEED);
    const y = philox2x32(1, 0, SEED);
    const distintos = popcount(x.a ^ y.a) + popcount(x.b ^ y.b);
    expect(distintos).toBeGreaterThan(16);
    expect(distintos).toBeLessThan(48);
  });
});

describe('uniformAt', () => {
  it('es determinista: los mismos argumentos dan el mismo valor', () => {
    for (let i = 0; i < 50; i++) {
      expect(uniformAt(SEED, 3, i)).toBe(uniformAt(SEED, 3, i));
    }
  });

  it('no depende del orden en que se pidan los índices', () => {
    // Esta es la propiedad que permite repartir bloques entre workers.
    const directo = [10, 11, 12, 13].map((i) => uniformAt(SEED, 3, i));
    const reves = [13, 12, 11, 10].map((i) => uniformAt(SEED, 3, i)).reverse();
    expect(reves).toEqual(directo);
  });

  it('cae siempre en [0, 1)', () => {
    for (let i = 0; i < 200000; i++) {
      const u = uniformAt(SEED, 5, i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('cambia con la semilla y con el flujo', () => {
    expect(uniformAt(SEED, 1, 0)).not.toBe(uniformAt(SEED + 1, 1, 0));
    expect(uniformAt(SEED, 1, 0)).not.toBe(uniformAt(SEED, 2, 0));
  });
});

describe('uniformOpenAt', () => {
  it('nunca devuelve cero', () => {
    // Un cero rompería log(u) en lognormal, exponencial y Weibull.
    for (let i = 0; i < 100000; i++) {
      expect(uniformOpenAt(SEED, 9, i)).toBeGreaterThan(0);
    }
  });
});

describe('fillUniform', () => {
  it('trocear el bloque no cambia ni un solo número', () => {
    // La garantía de reproducibilidad independiente del número de núcleos:
    // el tamaño de bloque es adaptativo (§3.1) y no debe alterar resultados.
    const completo = new Float64Array(1000);
    fillUniform(completo, SEED, 42, 0);

    const troceado = new Float64Array(1000);
    for (const corte of [[0, 333], [333, 500], [833, 167]]) {
      const [inicio, largo] = corte;
      const trozo = new Float64Array(largo);
      fillUniform(trozo, SEED, 42, inicio);
      troceado.set(trozo, inicio);
    }

    expect(Array.from(troceado)).toEqual(Array.from(completo));
  });
});

describe('calidad estadística', () => {
  const N = 1_000_000;
  const muestra = new Float64Array(N);
  fillUniform(muestra, SEED, 1234, 0);

  it('tiene media y varianza de una uniforme(0,1)', () => {
    let suma = 0;
    for (let i = 0; i < N; i++) suma += muestra[i];
    const media = suma / N;

    let acum = 0;
    for (let i = 0; i < N; i++) acum += (muestra[i] - media) ** 2;
    const varianza = acum / N;

    // Error estándar de la media con N = 1e6 es 2.9e-4; 4 sigmas.
    expect(media).toBeCloseTo(0.5, 3);
    expect(varianza).toBeCloseTo(1 / 12, 4);
  });

  it('pasa una prueba chi-cuadrado de uniformidad sobre 100 intervalos', () => {
    const BINS = 100;
    const conteo = new Int32Array(BINS);
    for (let i = 0; i < N; i++) conteo[Math.floor(muestra[i] * BINS)]++;

    const esperado = N / BINS;
    let chi2 = 0;
    for (let b = 0; b < BINS; b++) chi2 += (conteo[b] - esperado) ** 2 / esperado;

    // 99 grados de libertad: el valor crítico al 0,1 % es 148,2. La semilla
    // está fijada, así que el test es determinista y no puede volverse
    // intermitente.
    expect(chi2).toBeLessThan(148.2);
  });

  it('no correlaciona muestras consecutivas', () => {
    // Un PRNG malo (congruencial de baja calidad) delata su rejilla aquí.
    let sx = 0;
    let sy = 0;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    const n = N - 1;
    for (let i = 0; i < n; i++) {
      const x = muestra[i];
      const y = muestra[i + 1];
      sx += x;
      sy += y;
      sxy += x * y;
      sxx += x * x;
      syy += y * y;
    }
    const r =
      (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));

    expect(Math.abs(r)).toBeLessThan(0.004);
  });

  it('mantiene independientes dos flujos distintos', () => {
    // Si los flujos correlacionaran, dos variables de entrada independientes
    // dejarían de serlo y la simulación entera sería incorrecta.
    const n = 200000;
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    fillUniform(a, SEED, streamOf('precio_acero'), 0);
    fillUniform(b, SEED, streamOf('precio_cemento'), 0);

    let sx = 0;
    let sy = 0;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sx += a[i];
      sy += b[i];
      sxy += a[i] * b[i];
      sxx += a[i] * a[i];
      syy += b[i] * b[i];
    }
    const r =
      (n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy));

    expect(Math.abs(r)).toBeLessThan(0.01);
  });
});

describe('streamOf', () => {
  it('es estable y distingue identificadores', () => {
    expect(streamOf('in_7f3a')).toBe(streamOf('in_7f3a'));
    expect(streamOf('in_7f3a')).not.toBe(streamOf('in_7f3b'));
    expect(streamOf('')).toBeGreaterThanOrEqual(0);
  });

  it('no colisiona en un conjunto grande de identificadores', () => {
    // D11: cientos de entradas. Una colisión haría que dos variables
    // compartieran exactamente los mismos números aleatorios.
    const vistos = new Set<number>();
    for (let i = 0; i < 5000; i++) vistos.add(streamOf(`in_${i.toString(36)}`));
    expect(vistos.size).toBe(5000);
  });
});

function popcount(x: number): number {
  let n = x >>> 0;
  let c = 0;
  while (n !== 0) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}
