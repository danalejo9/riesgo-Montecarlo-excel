/**
 * D3: una fila o columna de celdas como serie de salidas: sus celdas y sus nombres.
 */
import { describe, expect, it } from 'vitest';

import { celdasDelRango } from '../../excel/direcciones.ts';
import { nombresDeSerie } from '../../excel/nombreSugerido.ts';

describe('celdasDelRango', () => {
  it('una fila y una columna, en orden; con la hoja comillada si hace falta', () => {
    expect(celdasDelRango('Modelo!D28:F28')).toEqual(['Modelo!D28', 'Modelo!E28', 'Modelo!F28']);
    expect(celdasDelRango("'Mi hoja'!$B$2:$B$4")).toEqual(["'Mi hoja'!B2", "'Mi hoja'!B3", "'Mi hoja'!B4"]);
    expect(celdasDelRango('Modelo!D28')).toEqual([]);
  });
});

describe('nombresDeSerie', () => {
  it('fila: la etiqueta de la izquierda y el periodo de encima', () => {
    const vecinos = new Map([
      ['M!D28', { izquierda: [1200, 'Flujo de caja libre'], arriba: [null, '#N/A', 'Año 1'] }],
      ['M!E28', { izquierda: [1300, 1200, 'Flujo de caja libre'], arriba: ['Año 2'] }],
      ['M!F28', { izquierda: [1, 2, 3], arriba: [7, 8] }],
    ]);
    expect(nombresDeSerie(['M!D28', 'M!E28', 'M!F28'], vecinos, 'fila')).toEqual([
      'Flujo de caja libre · Año 1', 'Flujo de caja libre · Año 2', 'Flujo de caja libre (F28)',
    ]);
  });

  it('columna: la cabecera de encima y el periodo de la izquierda', () => {
    const vecinos = new Map([
      ['M!C5', { izquierda: ['Enero'], arriba: ['Ventas'] }],
      ['M!C6', { izquierda: ['Febrero'], arriba: [10, 'Ventas'] }],
    ]);
    expect(nombresDeSerie(['M!C5', 'M!C6'], vecinos, 'columna')).toEqual(['Ventas · Enero', 'Ventas · Febrero']);
  });
});
