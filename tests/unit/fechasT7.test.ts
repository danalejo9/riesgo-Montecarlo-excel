/**
 * T7: fechas. Formatos de fecha de Excel, números de serie y lectura de
 * fechas escritas por el usuario; la lectura en palabras y el formato del panel.
 */
import { describe, expect, it } from 'vitest';

import { esFormatoFecha, fechaDeSerie, leerFecha, serieDeFecha, textoFecha } from '../../engine/modelo/fechas.ts';
import { resumirDistribucionFecha } from '../../engine/modelo/index.ts';
import { lecturaDeSalida } from '../../excel/lectura.ts';
import { formatoDe } from '../../ui/formato.ts';

describe('formatos de fecha', () => {
  it.each([
    ['m/d/yyyy', true], ['dd/mm/yyyy', true], ['d-mmm-yy', true], ['mmm yyyy', true], ['[$-x-sysdate]dddd, mmmm dd, yyyy', true],
    ['[$-es-ES]d "de" mmmm "de" yyyy', true], ['mmmm', true],
    ['General', false], ['0.00', false], ['#,##0 "días"', false], ['h:mm', false], ['[h]:mm:ss', false], ['0%', false], ['"Día" 0', false], ['', false],
  ])('%s → %s', (f, esperado) => {
    expect(esFormatoFecha(f)).toBe(esperado);
  });
});

describe('números de serie', () => {
  it('como Excel (sistema de 1900, con su 29/02/1900)', () => {
    expect(serieDeFecha(2027, 3, 15)).toBe(46461);
    expect(serieDeFecha(1900, 1, 1)).toBe(1);
    expect(serieDeFecha(1900, 3, 1)).toBe(61);
    expect(fechaDeSerie(46461)).toEqual({ anio: 2027, mes: 3, dia: 15 });
    expect(fechaDeSerie(46461.75)).toEqual({ anio: 2027, mes: 3, dia: 15 });
    expect(fechaDeSerie(1)).toEqual({ anio: 1900, mes: 1, dia: 1 });
    expect(textoFecha(46461)).toBe('15/03/2027');
    expect(textoFecha(NaN)).toBe('sin datos');
  });

  it('lee fechas escritas', () => {
    expect(leerFecha('15/03/2027')).toBe(46461);
    expect(leerFecha('15-3-27')).toBe(46461);
    expect(leerFecha('2027-03-15')).toBe(46461);
    expect(leerFecha('31/02/2027')).toBeNull();
    expect(leerFecha('1.500')).toBeNull();
  });
});

describe('en los resultados', () => {
  it('la lectura dice fechas', () => {
    const [frase] = lecturaDeSalida({ nombre: 'Fin', fecha: true, resumen: { n: 100, media: 46461, percentiles: { p5: 46450, p50: 46461, p95: 46480 } } });
    expect(frase).toBe('Fin tiene una media de 15/03/2027 y una mediana de 15/03/2027; en el 90 % de los casos simulados queda entre 04/03/2027 y 03/04/2027.');
  });

  it('el formato del panel: fecha, dispersión en días, y lee fechas o números', () => {
    const f = formatoDe(true);
    expect(f.valor(46461)).toBe('15/03/2027');
    expect(f.dispersion(12.345)).toBe('12,3 días');
    expect(f.leer('15/03/2027')).toBe(46461);
    expect(f.leer('46461')).toBe(46461);
    expect(formatoDe(false).valor(12345)).toBe('12.345');
  });
});

describe('en la tabla de entradas', () => {
  it('posiciones como fecha y dispersión en días', () => {
    const d = serieDeFecha(2027, 1, 1) as number;
    expect(resumirDistribucionFecha({ type: 'triangular', min: d, mode: d + 31, max: d + 90 })).toBe('Triangular(01/01/2027; 01/02/2027; 01/04/2027)');
    expect(resumirDistribucionFecha({ type: 'normal', mean: d, stdDev: 21.5 })).toMatch(/^Normal\(01\/01\/2027; 21,5 días\)$/);
  });
});
