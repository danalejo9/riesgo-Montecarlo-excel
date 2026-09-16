import { describe, expect, it } from 'vitest';

import {
  ABS, AND, AVERAGE, celda, COUNT, excelMod, excelRound, excelRoundUp,
  excelTrunc, funcionSoportada, IF, IFERROR, INT, LN, LOG, LOG10, MAX, MEDIAN, MIN,
  MOD, NOT, obtenerFuncion, OR, POWER, PRODUCT, ROUND, ROUNDDOWN, ROUNDUP,
  SIGN, SQRT, STDEV_P, STDEV_S, SUM, SUMPRODUCT, TRUNC, VAR_P, VAR_S, XOR,
  type Arg, type Buffer,
} from '../../engine/functions/index.ts';

/** Construye un Arg (celda) a partir de números planos, para brevedad. */
function c(...valores: number[]): Arg {
  return celda(Float64Array.from(valores));
}

/** Construye un Arg de rango a partir de varias celdas de un solo valor cada una. */
function rango(...columnas: number[][]): Arg {
  return columnas.map((v) => Float64Array.from(v));
}

function arr(b: Buffer): number[] {
  return Array.from(b);
}

describe('reductores: SUM, PRODUCT, MIN, MAX, COUNT, AVERAGE', () => {
  it('SUM combina celdas sueltas exactamente igual que un rango', () => {
    // El aplanado hace que SUM(A1,A2,A3) y SUM(A1:A3) compilen igual.
    const sueltas = SUM([c(1, 10), c(2, 20), c(3, 30)], 2);
    const enRango = SUM([rango([1, 10], [2, 20], [3, 30])], 2);
    expect(arr(sueltas)).toEqual([6, 60]);
    expect(arr(enRango)).toEqual([6, 60]);
  });

  it('PRODUCT, MIN, MAX', () => {
    expect(arr(PRODUCT([c(2, 3), c(3, 4)], 2))).toEqual([6, 12]);
    expect(arr(MIN([c(5, 1), c(2, 9)], 2))).toEqual([2, 1]);
    expect(arr(MAX([c(5, 1), c(2, 9)], 2))).toEqual([5, 9]);
  });

  it('COUNT cuenta cuántos buffers se pasaron (subconjunto numérico)', () => {
    expect(arr(COUNT([rango([1], [2], [3])], 1))).toEqual([3]);
  });

  it('AVERAGE por iteración', () => {
    expect(arr(AVERAGE([c(1, 4), c(3, 6)], 2))).toEqual([2, 5]);
  });

  it('MEDIAN con cantidad par e impar de valores', () => {
    expect(arr(MEDIAN([rango([1], [2], [3])], 1))).toEqual([2]);
    expect(arr(MEDIAN([rango([1], [2], [3], [4])], 1))).toEqual([2.5]);
  });
});

describe('varianza y desviación', () => {
  it('STDEV.P y STDEV.S de un conjunto conocido', () => {
    // {2,4,4,4,5,5,7,9}: media 5, varianza poblacional 4, muestral 32/7.
    const datos = [2, 4, 4, 4, 5, 5, 7, 9].map((v) => c(v));
    expect(VAR_P(datos, 1)[0]).toBeCloseTo(4, 10);
    expect(STDEV_P(datos, 1)[0]).toBeCloseTo(2, 10);
    expect(VAR_S(datos, 1)[0]).toBeCloseTo(32 / 7, 10);
    expect(STDEV_S(datos, 1)[0]).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it('STDEV.S con un solo valor da #DIV/0! (NaN en este subconjunto)', () => {
    expect(Number.isNaN(STDEV_S([c(5)], 1)[0])).toBe(true);
  });
});

describe('ROUND — se aleja de cero, a diferencia de Math.round', () => {
  it('redondea negativos simétricamente a los positivos', () => {
    expect(excelRound(2.5, 0)).toBe(3);
    expect(excelRound(-2.5, 0)).toBe(-3); // Math.round(-2.5) da -2: NO vale aquí
    expect(excelRound(1.45, 1)).toBeCloseTo(1.5, 10);
    expect(excelRound(-1.45, 1)).toBeCloseTo(-1.5, 10);
  });

  it('acepta decimales negativos (redondear a decenas, centenas)', () => {
    expect(excelRound(1234, -2)).toBe(1200);
    expect(excelRound(1250, -2)).toBe(1300);
  });

  it('vectorizado sobre buffers', () => {
    expect(arr(ROUND([c(2.5, -2.5), c(0, 0)], 2))).toEqual([3, -3]);
  });
});

describe('ROUNDUP y ROUNDDOWN', () => {
  it('ROUNDUP se aleja de cero siempre', () => {
    expect(excelRoundUp(1.01, 0)).toBe(2);
    expect(excelRoundUp(-1.01, 0)).toBe(-2);
    expect(excelRoundUp(1.1, 1)).toBeCloseTo(1.1, 10);
  });

  it('ROUNDDOWN trunca hacia cero', () => {
    expect(excelTrunc(1.99, 0)).toBe(1);
    expect(excelTrunc(-1.99, 0)).toBe(-1);
  });

  it('vectorizados', () => {
    expect(arr(ROUNDUP([c(1.01), c(0)], 1))).toEqual([2]);
    expect(arr(ROUNDDOWN([c(1.99), c(0)], 1))).toEqual([1]);
  });
});

describe('TRUNC vs INT — divergen en negativos', () => {
  it('TRUNC hacia cero, INT hacia -infinito', () => {
    expect(excelTrunc(-2.5, 0)).toBe(-2);
    expect(arr(INT([c(-2.5)], 1))).toEqual([-3]);
  });

  it('TRUNC con decimales opcionales', () => {
    expect(arr(TRUNC([c(3.14159)], 1))).toEqual([3]);
    expect(arr(TRUNC([c(3.14159), c(2)], 1))[0]).toBeCloseTo(3.14, 10);
  });
});

describe('MOD — el signo lo pone el divisor, no el dividendo', () => {
  it('difiere del operador % de JavaScript', () => {
    expect(excelMod(-7, 3)).toBe(2); // JS: -7 % 3 === -1
    expect(excelMod(7, -3)).toBe(-2); // JS: 7 % -3 === 1
    expect(excelMod(7, 3)).toBe(1);
  });

  it('divisor cero da NaN (canal de error pendiente, ver types.ts)', () => {
    expect(Number.isNaN(excelMod(5, 0))).toBe(true);
  });

  it('vectorizado', () => {
    expect(arr(MOD([c(-7, 7), c(3, -3)], 2))).toEqual([2, -2]);
  });
});

describe('otras funciones aritméticas', () => {
  it('ABS, SIGN', () => {
    expect(arr(ABS([c(-5, 5, 0)], 3))).toEqual([5, 5, 0]);
    expect(arr(SIGN([c(-5, 5, 0)], 3))).toEqual([-1, 1, 0]);
  });

  it('SQRT de negativo da NaN, no lanza', () => {
    expect(arr(SQRT([c(9)], 1))).toEqual([3]);
    expect(Number.isNaN(SQRT([c(-9)], 1)[0])).toBe(true);
  });

  it('POWER, incluido el caso 0^0 = 1 como en Excel', () => {
    expect(arr(POWER([c(2), c(10)], 1))).toEqual([1024]);
    expect(arr(POWER([c(0), c(0)], 1))).toEqual([1]);
  });

  it('EXP, LN, LOG10, LOG con base', () => {
    expect(arr(LN([c(Math.E)], 1))[0]).toBeCloseTo(1, 10);
    expect(arr(LOG10([c(1000)], 1))).toEqual([3]);
    expect(arr(LOG([c(8), c(2)], 1))).toEqual([3]);
    expect(arr(LOG([c(1000)], 1))).toEqual([3]); // sin base: LOG10
  });

  it('SUMPRODUCT multiplica posición a posición y suma', () => {
    // 1*10 + 2*20 + 3*30 = 140, ver tests/fixtures/fidelidad.xlsx caso L0-035.
    expect(arr(SUMPRODUCT([rango([1], [2], [3]), rango([10], [20], [30])], 1))).toEqual([140]);
  });

  it('SUMPRODUCT con rangos de distinto tamaño da NaN, no lanza (Excel: #¡VALOR!)', () => {
    expect(Number.isNaN(SUMPRODUCT([rango([1], [2]), rango([10])], 1)[0])).toBe(true);
  });
});

describe('lógica: IF, AND, OR, NOT, XOR', () => {
  it('IF elige por iteración según la condición', () => {
    expect(arr(IF([c(1, 0), c(10, 10), c(20, 20)], 2))).toEqual([10, 20]);
  });

  it('IF sin tercer argumento devuelve FALSE (0)', () => {
    expect(arr(IF([c(0), c(99)], 1))).toEqual([0]);
  });

  it('cualquier valor distinto de cero es verdadero, como en Excel', () => {
    expect(arr(IF([c(-3), c(1), c(2)], 1))).toEqual([1]);
  });

  it('AND y OR sobre varios argumentos', () => {
    expect(arr(AND([c(1, 1, 0), c(1, 0, 1)], 3))).toEqual([1, 0, 0]);
    expect(arr(OR([c(0, 0, 1), c(0, 1, 0)], 3))).toEqual([0, 1, 1]);
  });

  it('NOT y XOR', () => {
    expect(arr(NOT([c(0, 5)], 2))).toEqual([1, 0]);
    expect(arr(XOR([c(1, 0), c(0, 0)], 2))).toEqual([1, 0]);
  });

  it('IFERROR sustituye NaN (el convenio de error de este registro) por el valor alternativo', () => {
    // Ver tests/fixtures/fidelidad.xlsx caso L0-022: el caso con un
    // valor_si_error de texto queda fuera hasta que exista el canal de texto.
    expect(arr(IFERROR([c(5, NaN), c(-1, -1)], 2))).toEqual([5, -1]);
  });
});

describe('registro de funciones', () => {
  it('reconoce las funciones soportadas sin distinguir mayúsculas', () => {
    expect(funcionSoportada('sum')).toBe(true);
    expect(funcionSoportada('SUM')).toBe(true);
    expect(funcionSoportada('STDEV.S')).toBe(true);
    expect(funcionSoportada('VLOOKUP')).toBe(false);
    expect(funcionSoportada('SUBTOTAL')).toBe(false);
  });

  it('obtenerFuncion devuelve la implementación correcta', () => {
    const f = obtenerFuncion('sum');
    expect(f).toBeDefined();
    expect(arr((f as (a: Arg[], n: number) => Buffer)([c(1, 2), c(3, 4)], 2))).toEqual([4, 6]);
  });
});
