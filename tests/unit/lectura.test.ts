import { describe, expect, it } from 'vitest';

import { lecturaDeSalida } from '../../excel/lectura.ts';

const base = {
  nombre: 'VAN al 11 %',
  resumen: { n: 10_000, media: 262634, percentiles: { p5: -674525, p50: 252837, p95: 1194657 } },
};

describe('lecturaDeSalida (C7: la salida en palabras, con reglas)', () => {
  it('rango del 90 %, umbral y lo que más la mueve', () => {
    const f = lecturaDeSalida({
      ...base,
      umbral: { valor: 0, sentido: 'below', probabilidad: 0.307 },
      sensibilidad: [
        { id: 'a', nombre: 'Precio unitario', ref: 'Modelo!C5', spearman: 0.79, peso: 0.6, contribucion: 0.64 },
        { id: 'b', nombre: 'Coste variable', ref: 'Modelo!C8', spearman: -0.41, peso: 0.2, contribucion: 0.18 },
        { id: 'c', nombre: 'Costes fijos', ref: 'Modelo!C9', spearman: -0.09, peso: 0.01, contribucion: 0.01 },
      ],
    });
    expect(f[0]).toBe('VAN al 11 % tiene una media de 262.634 y una mediana de 252.837; en el 90 % de los casos simulados queda entre -674.525 y 1.194.657.');
    expect(f[1]).toBe('La probabilidad de que quede por debajo de 0 es del 30,7 %.');
    expect(f[2]).toBe('Lo que más la mueve es Precio unitario (64 % de la variación; cuando sube, la sube), seguido de Coste variable (18 %).');
    expect(f.join(' ')).not.toContain('Costes fijos'); // pesa menos del 5 %
  });

  it('avisa si las iteraciones no bastan y de las iteraciones sin número', () => {
    const f = lecturaDeSalida({
      ...base,
      noNumericas: 35,
      precision: { margenMedia: 10861, margenRelativo: 0.041, iteracionesParaObjetivo: 171026, objetivo: 0.01, suficiente: false, percentiles: [] },
    });
    expect(f.some((x) => x.includes('35 iteraciones no dio un número'))).toBe(true);
    expect(f.some((x) => x.includes('±4,1 %') && x.includes('171.026'))).toBe(true);
  });

  it('sin datos, ninguna frase', () => {
    expect(lecturaDeSalida({ ...base, resumen: { n: 0, media: NaN, percentiles: {} } })).toEqual([]);
  });
});
