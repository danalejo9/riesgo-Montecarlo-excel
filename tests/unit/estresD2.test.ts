/**
 * D2: estrés sobre las iteraciones retenidas.
 */
import { describe, expect, it } from 'vitest';

import { estres } from '../../excel/estres.ts';

// Salida = 2·x + zona (0, 10, 20) sobre 1.000 iteraciones deterministas.
const n = 1000;
const x = Float64Array.from({ length: n }, (_, i) => i / (n - 1));
const zona = Float64Array.from({ length: n }, (_, i) => i % 3);
const iter = {
  n,
  entradas: [
    { id: 'x', nombre: 'X', ref: 'A1', valores: x },
    { id: 'z', nombre: 'Zona', ref: 'A2', valores: zona, categorias: ['Norte', 'Sur', 'Este'] },
  ],
  salidas: [{ id: 's', nombre: 'S', ref: 'B1', valores: Float64Array.from({ length: n }, (_, i) => 2 * (x[i] as number) + 10 * (zona[i] as number)) }],
};

describe('estres', () => {
  it('con la entrada en su 10 % más alto: solo esas iteraciones', () => {
    const r = estres(iter, 'x', 's', { tipo: 'percentiles', desde: 0.9, hasta: 1 });
    expect(r?.estres.n).toBe(100);
    expect(r?.base.n).toBe(1000);
    expect(r?.limites?.desde).toBeCloseTo(0.9, 3);
    // Media de 2x en [0,9, 1] ≈ 1,9, más la zona (media 10) ≈ 11,9.
    expect(r?.estres.media).toBeCloseTo(11.9, 0);
    expect((r?.estres.media ?? 0) - (r?.base.media ?? 0)).toBeGreaterThan(0.7);
  });

  it('con una categoría de una entrada de texto; y con umbral', () => {
    const r = estres(iter, 'z', 's', { tipo: 'categoria', indice: 2 }, { valor: 15, sentido: 'below' });
    expect(r?.estres.n).toBe(333);
    expect(r?.estres.p5).toBeGreaterThanOrEqual(20);
    expect(r?.estres.probUmbral).toBe(0);
    expect(r?.base.probUmbral).toBeCloseTo(667 / 1000, 3);
  });

  it('una entrada o salida que no está: nada', () => {
    expect(estres(iter, 'q', 's', { tipo: 'categoria', indice: 0 })).toBeNull();
  });
});
