import { describe, expect, it } from 'vitest';

import {
  ABS, AND, AVERAGE, COUNT, COUNTA, COUNTBLANK, excelMod, excelRound, excelRoundUp,
  excelTrunc, funcionSoportada, IF, IFERROR, IFNA, INT, ISBLANK, ISERR, ISERROR,
  ISNUMBER, ISTEXT, LN, LOG, LOG10, MAX, MEDIAN, MIN, MOD, NOT, obtenerFuncion,
  OR, POWER, PRODUCT, ROUND, ROUNDDOWN, ROUNDUP, SIGN, SQRT, STDEV_P, STDEV_S,
  SUM, SUMPRODUCT, TRUNC, VAR_P, VAR_S, XOR,
  argRango, argValor, type Argumento, type FuncionExcel,
} from '../../engine/functions/index.ts';
import type { ErrorExcel } from '../../engine/parser/ast.ts';
import {
  errorConstante, errorEn, logicoConstante, numeroEn, textoConstante, textoEn,
  tipoEn, vacioConstante, vectorNumerico, ERROR, LOGICO, TEXTO,
  type Columna,
} from '../../engine/values/columna.ts';
import { nums } from '../helpers/valores.ts';

/** Argumento suelto numérico, un valor por iteración. */
function c(...valores: number[]): Argumento {
  return argValor(vectorNumerico(Float64Array.from(valores)));
}

/** Argumento de rango, una celda por lista. */
function rango(...columnas: number[][]): Argumento {
  return argRango(columnas.map((v) => vectorNumerico(Float64Array.from(v))));
}

const txt = (s: string, n = 1): Argumento => argValor(textoConstante(s, n));
const vacio = (n = 1): Argumento => argValor(vacioConstante(n));
const err = (e: ErrorExcel, n = 1): Argumento => argValor(errorConstante(e, n));
const log = (b: boolean, n = 1): Argumento => argValor(logicoConstante(b, n));

/** El código de error de la primera iteración, o undefined si no lo hay. */
function errorDe(c: Columna): ErrorExcel | undefined {
  return tipoEn(c, 0) === ERROR ? errorEn(c, 0) : undefined;
}

describe('reductores: SUM, PRODUCT, MIN, MAX, COUNT, AVERAGE', () => {
  it('SUM combina celdas sueltas exactamente igual que un rango', () => {
    expect(nums(SUM([c(1, 10), c(2, 20), c(3, 30)], 2))).toEqual([6, 60]);
    expect(nums(SUM([rango([1, 10], [2, 20], [3, 30])], 2))).toEqual([6, 60]);
  });

  it('PRODUCT, MIN, MAX', () => {
    expect(nums(PRODUCT([c(2, 3), c(3, 4)], 2))).toEqual([6, 12]);
    expect(nums(MIN([c(5, 1), c(2, 9)], 2))).toEqual([2, 1]);
    expect(nums(MAX([c(5, 1), c(2, 9)], 2))).toEqual([5, 9]);
  });

  it('MIN y MAX de un conjunto sin números dan 0, no infinito', () => {
    expect(nums(MIN([argRango([vacioConstante(1), vacioConstante(1)])], 1))).toEqual([0]);
    expect(nums(MAX([argRango([vacioConstante(1)])], 1))).toEqual([0]);
  });

  it('MEDIAN con cantidad par e impar de valores', () => {
    expect(nums(MEDIAN([rango([1], [2], [3])], 1))).toEqual([2]);
    expect(nums(MEDIAN([rango([1], [2], [3], [4])], 1))).toEqual([2.5]);
  });
});

describe('reglas de contexto: qué participa en una agregación', () => {
  it('dentro de un rango se ignoran el texto, los lógicos y las celdas vacías', () => {
    const r = argRango([
      vectorNumerico(Float64Array.from([10])),
      textoConstante('5', 1),
      logicoConstante(true, 1),
      vacioConstante(1),
    ]);
    expect(nums(SUM([r], 1))).toEqual([10]);
    expect(nums(COUNT([r], 1))).toEqual([1]);
  });

  it('sueltos, el lógico vale 1 y el texto numérico se convierte', () => {
    expect(nums(SUM([c(10), txt('5'), log(true)], 1))).toEqual([16]);
  });

  it('un texto suelto no convertible es #¡VALOR! en SUMA pero 0 en CONTAR', () => {
    expect(errorDe(SUM([c(10), txt('cemento')], 1))).toBe('#VALUE!');
    expect(nums(COUNT([c(10), txt('cemento')], 1))).toEqual([1]);
  });

  it('PROMEDIO no cuenta las celdas vacías en el denominador (caso L0-031)', () => {
    // Rango {10, vacía, 30}: Excel da 20, no 13,33.
    const r = argRango([
      vectorNumerico(Float64Array.from([10])),
      vacioConstante(1),
      vectorNumerico(Float64Array.from([30])),
    ]);
    expect(nums(AVERAGE([r], 1))).toEqual([20]);
  });

  it('PROMEDIO de un rango sin ningún número es #¡DIV/0! (caso L0-032)', () => {
    expect(errorDe(AVERAGE([argRango([vacioConstante(1), vacioConstante(1)])], 1))).toBe('#DIV/0!');
  });

  it('un error dentro de un rango se propaga en SUMA y se ignora en CONTAR', () => {
    const r = argRango([vectorNumerico(Float64Array.from([1])), errorConstante('#N/A', 1)]);
    expect(errorDe(SUM([r], 1))).toBe('#N/A');
    expect(nums(COUNT([r], 1))).toEqual([1]);
  });

  it('CONTARA cuenta todo lo que no esté vacío, errores incluidos (caso L0-034)', () => {
    const r = argRango([
      vectorNumerico(Float64Array.from([1])),
      textoConstante('cemento', 1),
      errorConstante('#N/A', 1),
      vacioConstante(1),
    ]);
    expect(nums(COUNTA([r], 1))).toEqual([3]);
    expect(nums(COUNT([r], 1))).toEqual([1]); // caso L0-033
  });

  it('CONTAR.BLANCO cuenta las vacías y también la cadena vacía de una fórmula', () => {
    const r = argRango([
      vacioConstante(1),
      textoConstante('', 1),
      textoConstante('algo', 1),
      vectorNumerico(Float64Array.from([0])),
    ]);
    expect(nums(COUNTBLANK([r], 1))).toEqual([2]);
  });
});

describe('varianza y desviación', () => {
  it('STDEV.P y STDEV.S de un conjunto conocido', () => {
    // {2,4,4,4,5,5,7,9}: media 5, varianza poblacional 4, muestral 32/7.
    const datos = [2, 4, 4, 4, 5, 5, 7, 9].map((v) => c(v));
    expect(nums(VAR_P(datos, 1))[0]).toBeCloseTo(4, 10);
    expect(nums(STDEV_P(datos, 1))[0]).toBeCloseTo(2, 10);
    expect(nums(VAR_S(datos, 1))[0]).toBeCloseTo(32 / 7, 10);
    expect(nums(STDEV_S(datos, 1))[0]).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });

  it('STDEV.S con un solo valor es #¡DIV/0!', () => {
    expect(errorDe(STDEV_S([c(5)], 1))).toBe('#DIV/0!');
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

  it('vectorizado sobre columnas', () => {
    expect(nums(ROUND([c(2.5, -2.5), c(0, 0)], 2))).toEqual([3, -3]);
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
    expect(nums(ROUNDUP([c(1.01), c(0)], 1))).toEqual([2]);
    expect(nums(ROUNDDOWN([c(1.99), c(0)], 1))).toEqual([1]);
  });
});

describe('TRUNC vs INT — divergen en negativos', () => {
  it('TRUNC hacia cero, INT hacia -infinito', () => {
    expect(excelTrunc(-2.5, 0)).toBe(-2);
    expect(nums(INT([c(-2.5)], 1))).toEqual([-3]);
  });

  it('TRUNC con decimales opcionales', () => {
    expect(nums(TRUNC([c(3.14159)], 1))).toEqual([3]);
    expect(nums(TRUNC([c(3.14159), c(2)], 1))[0]).toBeCloseTo(3.14, 10);
  });
});

describe('MOD — el signo lo pone el divisor, no el dividendo', () => {
  it('difiere del operador % de JavaScript', () => {
    expect(excelMod(-7, 3)).toBe(2); // JS: -7 % 3 === -1
    expect(excelMod(7, -3)).toBe(-2); // JS: 7 % -3 === 1
    expect(excelMod(7, 3)).toBe(1);
  });

  it('divisor cero es #¡DIV/0!', () => {
    expect(errorDe(MOD([c(5), c(0)], 1))).toBe('#DIV/0!');
  });

  it('vectorizado', () => {
    expect(nums(MOD([c(-7, 7), c(3, -3)], 2))).toEqual([2, -2]);
  });
});

describe('otras funciones aritméticas', () => {
  it('ABS, SIGN', () => {
    expect(nums(ABS([c(-5, 5, 0)], 3))).toEqual([5, 5, 0]);
    expect(nums(SIGN([c(-5, 5, 0)], 3))).toEqual([-1, 1, 0]);
  });

  it('SQRT de negativo es #¡NUM!', () => {
    expect(nums(SQRT([c(9)], 1))).toEqual([3]);
    expect(errorDe(SQRT([c(-9)], 1))).toBe('#NUM!');
  });

  it('LN y LOG10 de cero o negativo son #¡NUM!', () => {
    expect(errorDe(LN([c(0)], 1))).toBe('#NUM!');
    expect(errorDe(LOG10([c(-1)], 1))).toBe('#NUM!');
  });

  it('POWER, incluido el caso 0^0 = 1 como en Excel', () => {
    expect(nums(POWER([c(2), c(10)], 1))).toEqual([1024]);
    expect(nums(POWER([c(0), c(0)], 1))).toEqual([1]);
  });

  it('EXP, LN, LOG10, LOG con base', () => {
    expect(nums(LN([c(Math.E)], 1))[0]).toBeCloseTo(1, 10);
    expect(nums(LOG10([c(1000)], 1))).toEqual([3]);
    expect(nums(LOG([c(8), c(2)], 1))).toEqual([3]);
    expect(nums(LOG([c(1000)], 1))).toEqual([3]); // sin base: LOG10
  });

  it('SUMPRODUCT multiplica posición a posición y suma', () => {
    // 1*10 + 2*20 + 3*30 = 140, ver tests/fixtures/fidelidad.xlsx caso L0-035.
    expect(nums(SUMPRODUCT([rango([1], [2], [3]), rango([10], [20], [30])], 1))).toEqual([140]);
  });

  it('SUMPRODUCT con rangos de distinto tamaño es #¡VALOR!', () => {
    expect(errorDe(SUMPRODUCT([rango([1], [2]), rango([10])], 1))).toBe('#VALUE!');
  });

  it('SUMPRODUCT trata como cero lo que no sea numérico', () => {
    const a = argRango([vectorNumerico(Float64Array.from([2])), textoConstante('x', 1)]);
    const b = argRango([vectorNumerico(Float64Array.from([3])), vectorNumerico(Float64Array.from([9]))]);
    expect(nums(SUMPRODUCT([a, b], 1))).toEqual([6]);
  });
});

describe('lógica: IF, AND, OR, NOT, XOR', () => {
  it('IF elige por iteración según la condición', () => {
    expect(nums(IF([c(1, 0), c(10, 10), c(20, 20)], 2))).toEqual([10, 20]);
  });

  it('IF sin tercer argumento devuelve FALSO, el valor lógico', () => {
    const r = IF([c(0), c(99)], 1);
    expect(tipoEn(r, 0)).toBe(LOGICO);
    expect(numeroEn(r, 0)).toBe(0);
  });

  it('IF conserva el tipo de la rama elegida, incluido el texto (caso L0-040)', () => {
    const r = IF([c(1, 0), txt('mayor', 2), txt('menor', 2)], 2);
    expect(textoEn(r, 0)).toBe('mayor');
    expect(textoEn(r, 1)).toBe('menor');
  });

  it('IF con ramas de tipo distinto por iteración produce una columna mixta', () => {
    const r = IF([c(1, 0), txt('alto', 2), c(5, 5)], 2);
    expect(tipoEn(r, 0)).toBe(TEXTO);
    expect(textoEn(r, 0)).toBe('alto');
    expect(numeroEn(r, 1)).toBe(5);
  });

  it('cualquier valor distinto de cero es verdadero, como en Excel', () => {
    expect(nums(IF([c(-3), c(1), c(2)], 1))).toEqual([1]);
  });

  it('una condición de texto no booleano es #¡VALOR!', () => {
    expect(errorDe(IF([txt('cemento'), c(1), c(2)], 1))).toBe('#VALUE!');
  });

  it('AND y OR sobre varios argumentos', () => {
    expect(nums(AND([c(1, 1, 0), c(1, 0, 1)], 3))).toEqual([1, 0, 0]);
    expect(nums(OR([c(0, 0, 1), c(0, 1, 0)], 3))).toEqual([0, 1, 1]);
  });

  it('Y sin ningún valor lógico que evaluar es #¡VALOR!, no VERDADERO', () => {
    expect(errorDe(AND([argRango([vacioConstante(1)])], 1))).toBe('#VALUE!');
  });

  it('NOT y XOR', () => {
    expect(nums(NOT([c(0, 5)], 2))).toEqual([1, 0]);
    expect(nums(XOR([c(1, 0), c(0, 0)], 2))).toEqual([1, 0]);
  });

  it('IFERROR sustituye el error conservando el tipo del alternativo (caso L0-022)', () => {
    const r = IFERROR([err('#DIV/0!'), txt('sin datos')], 1);
    expect(textoEn(r, 0)).toBe('sin datos');
  });

  it('IFERROR deja pasar el valor cuando no hay error', () => {
    expect(nums(IFERROR([c(5), c(-1)], 1))).toEqual([5]);
  });

  it('IFNA solo sustituye #N/A, no cualquier error', () => {
    expect(nums(IFNA([err('#N/A'), c(0)], 1))).toEqual([0]);
    expect(errorDe(IFNA([err('#DIV/0!'), c(0)], 1))).toBe('#DIV/0!');
  });
});

describe('funciones de tipo', () => {
  it('ESBLANCO distingue una celda vacía de un cero y de una cadena vacía', () => {
    expect(nums(ISBLANK([vacio()], 1))).toEqual([1]);
    expect(nums(ISBLANK([c(0)], 1))).toEqual([0]);
    expect(nums(ISBLANK([txt('')], 1))).toEqual([0]);
  });

  it('ESNUMERO y ESTEXTO', () => {
    expect(nums(ISNUMBER([c(1)], 1))).toEqual([1]);
    expect(nums(ISNUMBER([txt('1')], 1))).toEqual([0]);
    expect(nums(ISTEXT([txt('x')], 1))).toEqual([1]);
    expect(nums(ISTEXT([c(1)], 1))).toEqual([0]);
  });

  it('ESERROR incluye #N/A y ESERR no', () => {
    expect(nums(ISERROR([err('#N/A')], 1))).toEqual([1]);
    expect(nums(ISERR([err('#N/A')], 1))).toEqual([0]);
    expect(nums(ISERR([err('#DIV/0!')], 1))).toEqual([1]);
  });
});

describe('registro de funciones', () => {
  it('reconoce las funciones soportadas sin distinguir mayúsculas', () => {
    expect(funcionSoportada('sum')).toBe(true);
    expect(funcionSoportada('SUM')).toBe(true);
    expect(funcionSoportada('STDEV.S')).toBe(true);
    expect(funcionSoportada('ISBLANK')).toBe(true);
    expect(funcionSoportada('VLOOKUP')).toBe(false);
    expect(funcionSoportada('SUBTOTAL')).toBe(false);
  });

  it('obtenerFuncion devuelve la implementación correcta', () => {
    const f = obtenerFuncion('sum');
    expect(f).toBeDefined();
    expect(nums((f as FuncionExcel)([c(1, 2), c(3, 4)], 2))).toEqual([4, 6]);
  });
});
