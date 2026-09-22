/**
 * El formato de los números es producto, no adorno: un informe de riesgo se
 * lee de un vistazo o no se lee. Estas reglas son las que evitan que el panel
 * enseñe `0` donde hay 0,000034, o se descuadre con 3.020.927,6712.
 */
import { describe, expect, it } from 'vitest';

import { duracion, miles, numero, porcentaje } from '../../ui/formato.ts';

describe('numero', () => {
  it('da cifras significativas, no decimales fijos', () => {
    expect(numero(3_020_927.6712)).toBe('3.020.928');
    expect(numero(1234.5678)).toBe('1234,6');
    expect(numero(1.23456)).toBe('1,2346');
    expect(numero(0.00123456)).toBe('0,001235');
  });

  it('el cero es cero, sin decimales de relleno', () => {
    expect(numero(0)).toBe('0');
  });

  it('lo muy pequeño no se redondea a cero', () => {
    // Enseñar "0" donde hay algo es peor que enseñar notación científica.
    expect(numero(0.000034)).toBe('3,4000e-5');
  });

  it('lo muy grande no descuadra el panel', () => {
    expect(numero(1.5e14)).toBe('1,5000e+14');
  });

  it('lo que no es un número se dice con palabras', () => {
    expect(numero(NaN)).toBe('sin datos');
    expect(numero(Infinity)).toBe('∞');
    expect(numero(-Infinity)).toBe('−∞');
  });

  it('los negativos conservan su signo y su precisión', () => {
    expect(numero(-1234.5678)).toBe('-1234,6');
  });
});

describe('miles', () => {
  it('un contador va entero y con separador', () => {
    expect(miles(1_000_000)).toBe('1.000.000');
    expect(miles(999)).toBe('999');
  });
});

describe('duracion', () => {
  it('siempre en una unidad que se pueda sentir', () => {
    expect(duracion(187)).toBe('187 ms');
    expect(duracion(1_500)).toBe('1,5 s');
    expect(duracion(18_640)).toBe('19 s');
    expect(duracion(90_000)).toBe('1 min 30 s');
    expect(duracion(120_000)).toBe('2 min');
    expect(duracion(10_800_000)).toBe('3 h');
    expect(duracion(5_400_000)).toBe('1 h 30 min');
  });

  it('sin medida, un guion y no un cero', () => {
    expect(duracion(NaN)).toBe('—');
  });
});

describe('porcentaje', () => {
  it('acota a [0, 100] y no divide por cero', () => {
    expect(porcentaje(25, 100)).toBe(25);
    expect(porcentaje(5, 0)).toBe(0);
    expect(porcentaje(150, 100)).toBe(100);
  });
});
