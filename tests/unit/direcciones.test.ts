/**
 * Partir `Hoja!Rango` es de las pocas cosas del adaptador de Excel que se
 * pueden probar sin Excel, y de las que más fácil se rompen con un libro real:
 * basta una hoja llamada "Flujo de caja" para que un `split('!')` ingenuo
 * empiece a fallar.
 */
import { describe, expect, it } from 'vitest';

import {
  claveDesdeDireccion,
  componerDireccion,
  esDireccionDirecta,
  partirDireccion,
} from '../../excel/direcciones.ts';

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

describe('claveDesdeDireccion', () => {
  it('da la clave que usa el grafo del motor', () => {
    expect(claveDesdeDireccion('Hoja1!B7')).toBe('Hoja1!B7');
  });

  it('normaliza las referencias absolutas', () => {
    // Si el modelo guardara $B$7 y el libro devolviera B7, el motor buscaría
    // una celda que no existe.
    expect(claveDesdeDireccion('Hoja1!$B$7')).toBe('Hoja1!B7');
    expect(claveDesdeDireccion('Hoja1!$B7')).toBe('Hoja1!B7');
  });

  it('una dirección sin hoja usa la hoja activa', () => {
    expect(claveDesdeDireccion('B7', 'Flujo de caja')).toBe('Flujo de caja!B7');
    expect(claveDesdeDireccion('B7')).toBeUndefined();
  });

  it('un rango o un nombre no dan clave: no son una celda', () => {
    expect(claveDesdeDireccion('Hoja1!B7:C9')).toBeUndefined();
    expect(claveDesdeDireccion('Tasa_IVA', 'Hoja1')).toBeUndefined();
  });
});

describe('esDireccionDirecta', () => {
  it('distingue una dirección de un nombre definido', () => {
    expect(esDireccionDirecta('Hoja1!B7')).toBe(true);
    expect(esDireccionDirecta('$B$7')).toBe(true);
    expect(esDireccionDirecta('Tasa_IVA')).toBe(false);
    expect(esDireccionDirecta('Hoja1!B7:C9')).toBe(false);
    // Una eñe no hace directa a una dirección, ni rompe la comprobación.
    expect(esDireccionDirecta('Año_base')).toBe(false);
  });
});
