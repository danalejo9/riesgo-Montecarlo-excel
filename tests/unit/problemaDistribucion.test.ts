import { describe, expect, it } from 'vitest';

import { problemaDeDistribucion } from '../../engine/modelo/index.ts';

describe('problemaDeDistribucion (el editor avisa sin guardar)', () => {
  it('una triangular con el máximo por debajo de la moda no es válida (prueba del 27/09)', () => {
    expect(problemaDeDistribucion({ type: 'triangular', min: 16000, mode: 20000, max: 2 })).toMatch(/min <= moda <= max/);
  });

  it('una válida no tiene problema', () => {
    expect(problemaDeDistribucion({ type: 'triangular', min: 16000, mode: 20000, max: 23000 })).toBeNull();
    expect(problemaDeDistribucion({ type: 'normal', mean: 0, stdDev: 1 })).toBeNull();
  });

  it('una desviación negativa tampoco', () => {
    expect(problemaDeDistribucion({ type: 'normal', mean: 0, stdDev: -1 })).not.toBeNull();
  });
});
