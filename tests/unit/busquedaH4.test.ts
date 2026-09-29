/**
 * H4: la bisección de la búsqueda de objetivo (con una probabilidad de mentira).
 */
import { describe, expect, it } from 'vitest';

import { biseccion } from '../../excel/busquedaObjetivo.ts';

describe('biseccion', () => {
  // P(pérdida) baja con el precio: 1 − precio/200, en [0, 200].
  const prob = async (x: number) => Math.min(1, Math.max(0, 1 - x / 200));

  it('encuentra el valor que da la probabilidad objetivo', async () => {
    const r = await biseccion(prob, 100, 200, 0.1);
    expect(r.solucion).toBeCloseTo(180, 0);
    expect(r.probSolucion).toBeCloseTo(0.1, 2);
    expect(r.puntos.length).toBeLessThanOrEqual(16);
  });

  it('si el rango no la contiene, lo dice', async () => {
    const r = await biseccion(prob, 0, 50, 0.1);
    expect(r.solucion).toBeUndefined();
    expect(r.motivo).toMatch(/no pasa por el 10 %/);
  });

  it('con el rango al revés, igual', async () => {
    const r = await biseccion(prob, 200, 100, 0.25);
    expect(r.solucion).toBeCloseTo(150, 0);
  });
});
