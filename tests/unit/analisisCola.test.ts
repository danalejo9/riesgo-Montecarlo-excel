import { describe, expect, it } from 'vitest';

import { modeloVacio } from '../../engine/modelo/index.ts';
import { analisisPorCola } from '../../excel/analisisCola.ts';

describe('analisisPorCola (D1: qué tiene que pasar)', () => {
  // Salida = precio − coste; el ruido no importa.
  const n = 2_000;
  const precio = Float64Array.from({ length: n }, (_, i) => (i * 7919) % n);
  const coste = Float64Array.from({ length: n }, (_, i) => (i * 104729) % n);
  const ruido = Float64Array.from({ length: n }, (_, i) => (i * 31) % 17);
  const zona = Float64Array.from({ length: n }, (_, i) => (precio[i]! < 400 ? 0 : 1)); // «Barata» va con precio bajo
  const salida = Float64Array.from({ length: n }, (_, i) => precio[i]! - coste[i]!);
  const m = modeloVacio();
  m.inputs.push(
    { id: 'p', name: 'Precio', ref: 'A1', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [] },
    { id: 'c', name: 'Coste', ref: 'A2', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [] },
    { id: 'r', name: 'Ruido', ref: 'A3', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [] },
    { id: 'z', name: 'Zona', ref: 'A4', dist: { type: 'categorical', categories: ['Barata', 'Cara'], weights: [1, 4] }, correlations: [] },
  );
  const muestras = new Map<string, ArrayLike<number>>([['A1', precio], ['A2', coste], ['A3', ruido], ['A4', zona]]);
  const [baja, alta] = analisisPorCola(m, ['A1', 'A2', 'A3', 'A4'], muestras, salida);

  it('en la cola baja, el precio está bajo y el coste alto; el ruido, en su sitio', () => {
    expect(baja?.cola).toBe('baja');
    const porNombre = new Map(baja!.filas.map((f) => [f.nombre, f]));
    expect(porNombre.get('Precio')!.desplazamiento!).toBeLessThan(-0.5);
    expect(porNombre.get('Coste')!.desplazamiento!).toBeGreaterThan(0.5);
    expect(Math.abs(porNombre.get('Ruido')!.desplazamiento!)).toBeLessThan(0.2);
    expect(baja!.filas.at(-1)?.nombre).toBe('Ruido'); // lo que no importa, al final
  });

  it('la entrada de texto dice qué categoría abunda en la cola', () => {
    const z = baja!.filas.find((f) => f.nombre === 'Zona')!;
    expect(z.categoria).toBe('Barata');
    expect(z.proporcionCola!).toBeGreaterThan(z.proporcion!);
  });

  it('en la cola alta, al revés', () => {
    expect(alta!.filas.find((f) => f.nombre === 'Precio')!.desplazamiento!).toBeGreaterThan(0.5);
  });
});
