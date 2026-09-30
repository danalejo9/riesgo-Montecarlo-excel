/**
 * Lo que se lee de la muestra ordenada de una salida: umbrales e histograma.
 * Y cómo lee el panel el número que escribe el usuario para el umbral.
 */
import { describe, expect, it } from 'vitest';

import { histogramaDeMuestra, ordenarUtiles, probabilidadUmbral } from '../../engine/stats/index.ts';
import { validarRiskModel, modeloVacio } from '../../engine/modelo/index.ts';
import { leerNumero, numeroEditable } from '../../ui/formato.ts';

describe('ordenarUtiles', () => {
  it('ordena y aparta lo que no es número', () => {
    expect(Array.from(ordenarUtiles([3, NaN, -1, Infinity, 2]))).toEqual([-1, 2, 3]);
  });
});

describe('probabilidadUmbral', () => {
  const o = ordenarUtiles([-2, -1, 0, 0, 1, 2, 3, 4, 5, 6]);

  it('por debajo es estricto: un cero no cuenta como pérdida', () => {
    expect(probabilidadUmbral(o, 0, 'debajo')).toBe(0.2);
  });

  it('por encima también es estricto', () => {
    expect(probabilidadUmbral(o, 0, 'encima')).toBe(0.6);
  });

  it('fuera del rango da 0 o 1', () => {
    expect(probabilidadUmbral(o, -100, 'debajo')).toBe(0);
    expect(probabilidadUmbral(o, 100, 'debajo')).toBe(1);
  });

  it('sin valores no inventa una probabilidad', () => {
    expect(probabilidadUmbral(new Float64Array(0), 0, 'debajo')).toBeNaN();
  });
});

describe('histogramaDeMuestra', () => {
  it('cubre del mínimo al máximo y cuenta todas las iteraciones', () => {
    const o = ordenarUtiles(Array.from({ length: 1000 }, (_, i) => Math.sin(i) * 100));
    const h = histogramaDeMuestra(o);
    expect(h.length).toBeGreaterThanOrEqual(10);
    expect(h.length).toBeLessThanOrEqual(50);
    expect(h[0]?.x0).toBe(o[0]);
    expect(h[h.length - 1]?.x1).toBeCloseTo(o[o.length - 1] as number, 9);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(1000);
  });

  it('una salida constante es una sola barra', () => {
    expect(histogramaDeMuestra(ordenarUtiles([7, 7, 7]))).toEqual([{ x0: 7, x1: 7, count: 3 }]);
  });

  it('sin valores, sin barras', () => {
    expect(histogramaDeMuestra(new Float64Array(0))).toEqual([]);
  });
});

describe('el umbral en el modelo', () => {
  function conSalida(salida: Record<string, unknown>) {
    const m = modeloVacio() as unknown as Record<string, unknown>;
    return { ...m, outputs: [{ id: 's', name: 'VAN', ref: 'Hoja1!A1', ...salida }] };
  }

  it('se guarda y se lee', () => {
    const r = validarRiskModel(conSalida({ threshold: { value: 0, direction: 'below' } }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.modelo.outputs[0]?.threshold).toEqual({ value: 0, direction: 'below' });
  });

  it('un modelo sin umbral sigue siendo válido', () => {
    const r = validarRiskModel(conSalida({}));
    expect(r.ok && r.modelo.outputs[0]?.threshold).toBeUndefined();
  });

  it('un umbral mal formado se rechaza con motivo', () => {
    const r = validarRiskModel(conSalida({ threshold: { value: 'cero', direction: 'below' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(' ')).toContain('threshold');
  });
});

describe('leerNumero (el campo del umbral)', () => {
  it('en español el punto que agrupa de tres en tres es de miles', () => {
    expect(leerNumero('71.153')).toBe(71153);
    expect(leerNumero('-1.500.000')).toBe(-1500000);
    expect(leerNumero('1.234,5')).toBe(1234.5);
  });

  it('la coma es la decimal, y un punto que no agrupa también se entiende', () => {
    expect(leerNumero('2,5')).toBe(2.5);
    expect(leerNumero('2.5')).toBe(2.5);
    expect(leerNumero('0')).toBe(0);
    expect(leerNumero('−3')).toBe(-3);
  });

  it('un cero a la izquierda nunca es de miles, y lo que escribe numeroEditable se lee igual', () => {
    expect(leerNumero('0.054')).toBe(0.054);
    expect(leerNumero('-0.125')).toBe(-0.125);
    expect(leerNumero('23.000')).toBe(23000);
    for (const v of [0.054, 16000, -2.5, 1.125, 1e-7, 0]) expect(leerNumero(numeroEditable(v))).toBe(v);
  });

  it('con punto decimal, las comas son de miles', () => {
    expect(leerNumero('1,500,000.25', '.')).toBe(1500000.25);
  });

  it('lo que no es un número es null', () => {
    expect(leerNumero('')).toBeNull();
    expect(leerNumero('abc')).toBeNull();
    expect(leerNumero('1,2,3')).toBeNull();
  });
});
