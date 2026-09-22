/**
 * Partir `Hoja!Rango` es de las pocas cosas del adaptador de Excel que se
 * pueden probar sin Excel, y de las que más fácil se rompen con un libro real:
 * basta una hoja llamada "Flujo de caja" para que un `split('!')` ingenuo
 * empiece a fallar.
 */
import { describe, expect, it } from 'vitest';

import { componerDireccion, partirDireccion } from '../../excel/direcciones.ts';

describe('partirDireccion', () => {
  it('separa hoja y rango', () => {
    expect(partirDireccion('Hoja1!B7')).toEqual({ hoja: 'Hoja1', rango: 'B7' });
  });

  it('una dirección sin hoja no inventa ninguna', () => {
    expect(partirDireccion('B7')).toEqual({ rango: 'B7' });
  });

  it('quita las comillas de un nombre de hoja con espacios', () => {
    expect(partirDireccion("'Flujo de caja'!A1:C9")).toEqual({ hoja: 'Flujo de caja', rango: 'A1:C9' });
  });

  it('una comilla dentro del nombre viene duplicada y se restaura', () => {
    expect(partirDireccion("'Caja de Ana''s'!A1")).toEqual({ hoja: "Caja de Ana's", rango: 'A1' });
  });

  it('un nombre de hoja con signo de admiración comillado no despista al corte', () => {
    expect(partirDireccion("'¡Ojo!'!D4")).toEqual({ hoja: '¡Ojo!', rango: 'D4' });
  });

  it('tolera espacios alrededor', () => {
    expect(partirDireccion('  Hoja1 ! B7 ')).toEqual({ hoja: 'Hoja1', rango: 'B7' });
  });
});

describe('componerDireccion', () => {
  it('no comilla un nombre simple', () => {
    expect(componerDireccion('Hoja1', 'B7')).toBe('Hoja1!B7');
  });

  it('comilla un nombre con espacios', () => {
    expect(componerDireccion('Flujo de caja', 'A1')).toBe("'Flujo de caja'!A1");
  });

  it('duplica las comillas del nombre', () => {
    expect(componerDireccion("Caja de Ana's", 'A1')).toBe("'Caja de Ana''s'!A1");
  });

  it('ida y vuelta sobre nombres difíciles', () => {
    for (const hoja of ['Hoja1', 'Flujo de caja', "Caja de Ana's", '¡Ojo!', 'Año 2026']) {
      expect(partirDireccion(componerDireccion(hoja, 'B7'))).toEqual({ hoja, rango: 'B7' });
    }
  });
});
