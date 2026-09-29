/**
 * C3: las iteraciones de la simulación, a una tabla para la hoja.
 */
import { describe, expect, it } from 'vitest';

import { tablaIteraciones } from '../../excel/iteraciones.ts';

describe('tablaIteraciones', () => {
  const it3 = {
    n: 3,
    entradas: [
      { id: 'a', nombre: 'Precio', ref: 'Modelo!B3', valores: Float64Array.of(10, 11, 12) },
      { id: 'z', nombre: 'Zona', ref: 'Zonas!C4', valores: Float64Array.of(0, 2, 1), categorias: ['Norte', 'Sur', 'Este'] },
      { id: 'f', nombre: 'Inicio', ref: 'Modelo!B29', valores: Float64Array.of(46400, 46401, 46402), fecha: true },
    ],
    salidas: [
      { id: 's', nombre: 'Beneficio', ref: 'Modelo!B10', valores: Float64Array.of(100, NaN, 300) },
      { id: 't', nombre: 'Gama', ref: 'Zonas!C9', valores: Float64Array.of(NaN, NaN, NaN), texto: ['Alta', null, 'Baja'] },
    ],
  };

  it('cabecera, referencias y una fila por iteración, con textos y huecos', () => {
    const t = tablaIteraciones(it3, 10);
    expect(t.cabecera).toEqual(['Iteración', 'Precio', 'Zona', 'Inicio', 'Beneficio', 'Gama']);
    expect(t.refs).toEqual(['', 'Modelo!B3', 'Zonas!C4', 'Modelo!B29', 'Modelo!B10', 'Zonas!C9']);
    expect(t.filas).toEqual([
      [1, 10, 'Norte', 46400, 100, 'Alta'],
      [2, 11, 'Este', 46401, '', ''],
      [3, 12, 'Sur', 46402, 300, 'Baja'],
    ]);
    expect(t.fechas).toEqual([false, false, false, true, false, false]);
  });

  it('respeta el límite', () => {
    expect(tablaIteraciones(it3, 2).filas).toHaveLength(2);
  });
});
