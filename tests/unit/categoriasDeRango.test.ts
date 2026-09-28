import { describe, expect, it } from 'vitest';

import { categoriasDeRango } from '../../excel/categoriasDeRango.ts';

describe('categoriasDeRango (T1: leer las categorías de la hoja)', () => {
  it('dos columnas: nombre y probabilidad', () => {
    expect(categoriasDeRango([['Norte', 20], ['Sur', 50], ['Este', 30]])).toEqual({ ok: true, categories: ['Norte', 'Sur', 'Este'], weights: [20, 50, 30] });
  });
  it('una columna: todas con el mismo peso; se saltan las vacías', () => {
    expect(categoriasDeRango([['A'], [''], ['B']])).toEqual({ ok: true, categories: ['A', 'B'], weights: [1, 1] });
  });
  it('un nombre repetido suma sus pesos; pesos como texto con coma', () => {
    expect(categoriasDeRango([['A', '0,2'], ['A', 0.3], ['B', 0.5]])).toEqual({ ok: true, categories: ['A', 'B'], weights: [0.5, 0.5] });
  });
  it('errores claros', () => {
    expect(categoriasDeRango([['', 1]]).ok).toBe(false);
    expect(categoriasDeRango([['A', 'mucho']]).ok).toBe(false);
    expect(categoriasDeRango([['A', 0], ['B', 0]]).ok).toBe(false);
  });
});
