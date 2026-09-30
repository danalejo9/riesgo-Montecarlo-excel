/**
 * B2: el modo del libro — qué enseñan las celdas RIESGO fuera de la
 * simulación (un valor fijo o uno al azar).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

import {
  describirEstadistico, leerModoLibro, modaDe, MODO_POR_DEFECTO, valorEnModo, valorFijo, type DistributionSpec,
} from '../../engine/modelo/index.ts';
import { metadatosFunciones } from '../../engine/modelo/metadatosFunciones.ts';
import { modoLibroEnMemoria, ponerModoLibroEnMemoria } from '../../excel/modoLibroCompartido.ts';

const normal: DistributionSpec = { type: 'normal', mean: 100, stdDev: 15 };
const tri: DistributionSpec = { type: 'triangular', min: 8, mode: 10, max: 14 };

describe('valor fijo', () => {
  it('media, mediana, moda y percentil', () => {
    expect(valorFijo(tri, { tipo: 'media' })).toBeCloseTo(32 / 3, 12);
    expect(valorFijo(tri, { tipo: 'moda' })).toBe(10);
    // Mediana de la triangular (8;10;14): 14 − √(0,5·6·4) = 10,536.
    expect(valorFijo(tri, { tipo: 'mediana' }) as number).toBeCloseTo(14 - Math.sqrt(12), 10);
    expect(valorFijo(normal, { tipo: 'percentil', p: 0.95 }) as number).toBeCloseTo(100 + 15 * 1.6448536, 5);
  });

  it('la moda de cada familia', () => {
    expect(modaDe({ type: 'lognormal', p1: 0, p2: 0.5, parametrization: 'log' }) as number).toBeCloseTo(Math.exp(-0.25), 12);
    // Lognormal con media 100 y desviación 20: sigma² = ln(1,04), mu = ln(100) − sigma²/2.
    const s2 = Math.log(1.04);
    expect(modaDe({ type: 'lognormal', p1: 100, p2: 20 }) as number).toBeCloseTo(Math.exp(Math.log(100) - s2 / 2 - s2), 9);
    expect(modaDe({ type: 'gamma', shape: 3, scale: 2 })).toBe(4);
    expect(modaDe({ type: 'beta', alpha: 2, beta: 5 }) as number).toBeCloseTo(0.2, 12);
    expect(modaDe({ type: 'poisson', lambda: 3.7 })).toBe(3);
    expect(modaDe({ type: 'binomial', n: 10, p: 0.3 })).toBe(3);
    expect(modaDe({ type: 'discrete', values: [3, 5, 10], weights: [0.2, 0.5, 0.3] })).toBe(5);
    expect(modaDe({ type: 'categorical', categories: ['Norte', 'Sur'], weights: [0.2, 0.8] })).toBe('Sur');
    // Acotada: la moda queda dentro de los límites.
    expect(modaDe({ ...normal, truncate: { min: 110, max: 150 } })).toBe(110);
  });

  it('una entrada de texto enseña su valor más probable, se pida lo que se pida', () => {
    const cat: DistributionSpec = { type: 'categorical', categories: ['Norte', 'Sur', 'Este'], weights: [0.2, 0.5, 0.3] };
    expect(valorFijo(cat, { tipo: 'media' })).toBe('Sur');
    expect(valorFijo(cat, { tipo: 'percentil', p: 0.9 })).toBe('Sur');
  });
});

describe('modo aleatorio', () => {
  it('sortea con el generador que se le dé, y recorre toda la distribución', () => {
    const modo = { modo: 'aleatorio' as const, fijo: { tipo: 'media' as const } };
    expect(valorEnModo(tri, modo, () => 0.5)).toBeCloseTo(14 - Math.sqrt(12), 10);
    const muestras = Array.from({ length: 5000 }, () => valorEnModo(normal, modo) as number);
    const media = muestras.reduce((a, b) => a + b, 0) / muestras.length;
    expect(media).toBeGreaterThan(98);
    expect(media).toBeLessThan(102);
    expect(new Set(muestras).size).toBeGreaterThan(4990);
  });

  it('en una entrada de texto, las categorías salen con su peso', () => {
    const cat: DistributionSpec = { type: 'categorical', categories: ['a', 'b'], weights: [1, 3] };
    const modo = { modo: 'aleatorio' as const, fijo: { tipo: 'media' as const } };
    const n = 8000;
    const b = Array.from({ length: n }, () => valorEnModo(cat, modo)).filter((x) => x === 'b').length / n;
    expect(b).toBeGreaterThan(0.72);
    expect(b).toBeLessThan(0.78);
  });
});

describe('el modo guardado y en memoria', () => {
  it('se lee lo guardado; lo que no se entienda, por defecto (valores fijos, la media)', () => {
    expect(leerModoLibro(null)).toEqual(MODO_POR_DEFECTO);
    expect(leerModoLibro('basura')).toEqual(MODO_POR_DEFECTO);
    expect(leerModoLibro('{"modo":"aleatorio","fijo":{"tipo":"moda"}}')).toEqual({ modo: 'aleatorio', fijo: { tipo: 'moda' } });
    expect(leerModoLibro('{"modo":"fijo","fijo":{"tipo":"percentil","p":0.9}}')).toEqual({ modo: 'fijo', fijo: { tipo: 'percentil', p: 0.9 } });
    expect(leerModoLibro('{"modo":"fijo","fijo":{"tipo":"percentil","p":7}}').fijo).toEqual({ tipo: 'media' });
  });

  it('las funciones lo leen de memoria (runtime compartido)', () => {
    ponerModoLibroEnMemoria({ modo: 'fijo', fijo: { tipo: 'mediana' } });
    expect(modoLibroEnMemoria()).toEqual({ modo: 'fijo', fijo: { tipo: 'mediana' } });
    ponerModoLibroEnMemoria(MODO_POR_DEFECTO);
  });

  it('describe el estadístico en palabras', () => {
    expect(describirEstadistico({ tipo: 'percentil', p: 0.9 })).toBe('el percentil 90');
  });
});

describe('Excel: funciones volátiles y botones del modo', () => {
  it('las distribuciones son volátiles (F9 vuelve a sortear); las de resultados, no', () => {
    const m = metadatosFunciones() as { functions: { id: string; options?: { volatile?: boolean } }[] };
    for (const id of ['NORMAL', 'TRIANGULAR', 'CATEGORIA', 'DISCRETA', 'EMPIRICA', 'TRUNCAR']) {
      expect(m.functions.find((f) => f.id === id)?.options?.volatile).toBe(true);
    }
    expect(m.functions.find((f) => f.id === 'MEDIA')?.options?.volatile).toBeUndefined();
  });

  it('la cinta tiene el grupo «Modo del libro» con sus dos acciones, y Valores fijos empieza desactivado', () => {
    const x = readFileSync(resolve(__dirname, '../../manifest.xml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    expect(x).toMatch(/<Group id="GrupoModo">/);
    expect(x).toMatch(/<FunctionName>modoFijo<\/FunctionName>\s*<\/Action>\s*<Enabled>false<\/Enabled>/);
    expect(x).toMatch(/<FunctionName>modoAleatorio<\/FunctionName>/);
  });
});
