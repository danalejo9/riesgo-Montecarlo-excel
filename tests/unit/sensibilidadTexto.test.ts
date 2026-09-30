/**
 * T2 (ronda del 29/09): una entrada de texto tiene que salir en el tornado y
 * en la lectura con su peso de verdad. Antes se dejaba fuera y la hoja
 * «Zonas» decía que Unidades y Precio explicaban el 100 %.
 */
import { describe, expect, it } from 'vitest';

import { modeloVacio } from '../../engine/modelo/index.ts';
import { mediaPorCategoria, sensibilidadDeSalida } from '../../excel/informe.ts';
import { lecturaDeSalida } from '../../excel/lectura.ts';

/** Un generador reproducible, para no depender de Math.random. */
function lcg(semilla: number) {
  let s = semilla;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('sensibilidad con entradas de texto', () => {
  // Como la hoja «Zonas»: zona (Norte 20 %, Sur 50 %, Este 30 %) con recargo
  // 1,1 / 1,0 / 0,9, precio triangular(90;100;110) y unidades (900;1000;1100).
  const n = 20_000;
  const r = lcg(7);
  const tri = (a: number, m: number, b: number) => {
    const u = r();
    const f = (m - a) / (b - a);
    return u < f ? a + Math.sqrt(u * (b - a) * (m - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - m));
  };
  const zona = new Float64Array(n);
  const precio = new Float64Array(n);
  const unidades = new Float64Array(n);
  const ingresos = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const u = r();
    zona[i] = u < 0.2 ? 0 : u < 0.7 ? 1 : 2;
    precio[i] = tri(90, 100, 110);
    unidades[i] = tri(900, 1000, 1100);
    ingresos[i] = precio[i]! * unidades[i]! * [1.1, 1.0, 0.9][zona[i]!]!;
  }
  const base = modeloVacio();
  const modelo = {
    ...base,
    inputs: [
      { id: 'z', name: 'Zona de venta', ref: 'C4', dist: { type: 'categorical' as const, categories: ['Norte', 'Sur', 'Este'], weights: [0.2, 0.5, 0.3] }, correlations: [] },
      { id: 'p', name: 'Precio base', ref: 'C6', dist: { type: 'triangular' as const, min: 90, mode: 100, max: 110 }, correlations: [] },
      { id: 'u', name: 'Unidades', ref: 'C7', dist: { type: 'triangular' as const, min: 900, mode: 1000, max: 1100 }, correlations: [] },
    ],
  };
  const muestras = new Map<string, Float64Array>([['kz', zona], ['kp', precio], ['ku', unidades]]);
  const filas = sensibilidadDeSalida(modelo, ['kz', 'kp', 'ku'], muestras, ingresos);

  it('la zona sale, marcada como de texto, y es la que más pesa', () => {
    expect(filas.map((f) => f.id).sort()).toEqual(['p', 'u', 'z']);
    const z = filas.find((f) => f.id === 'z')!;
    expect(z.categorica).toBe(true);
    expect(z.spearman).toBeGreaterThan(0);
    // Coeficientes de variación: recargo 0,071, precio y unidades 0,041 cada
    // uno. En varianza relativa, 0,0050 frente a 0,0017 + 0,0017: la zona
    // explica en torno al 60 % de la variación.
    expect(z.contribucion).toBeGreaterThan(0.5);
    expect(z.contribucion).toBeLessThan(0.7);
    expect(filas[0]?.id).toBe('z');
  });

  it('la lectura en palabras la nombra primero, sin decir que «sube»', () => {
    const frases = lecturaDeSalida({
      nombre: 'Ingresos', resumen: { n, media: 99_000, percentiles: { p5: 85_000, p50: 98_600, p95: 114_000 } }, sensibilidad: filas,
    });
    const frase = frases.find((f) => f.startsWith('Lo que más la mueve'))!;
    expect(frase).toMatch(/^Lo que más la mueve es Zona de venta \([\d,]+ % de la variación; según el valor que tome\)/);
  });

  it('mediaPorCategoria pone en cada iteración la media de su categoría', () => {
    expect(Array.from(mediaPorCategoria([0, 1, 0, 1], [10, 20, 30, 40]))).toEqual([20, 30, 20, 30]);
  });
});
