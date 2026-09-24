/**
 * Matrices en el motor rápido: operaciones entre rangos dentro de funciones,
 * las fórmulas matriciales clásicas y las funciones de matrices dinámicas,
 * siempre dentro de algo que las consuma. Probadas con el motor completo.
 * Los valores esperados son los de la documentación de Excel o cuentas a mano;
 * la octava tanda del libro de fidelidad los contrastará con Excel.
 */
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { elegirMotor } from '../../engine/modelo/index.ts';
import { errorEn, numeroEn, tipoEn, ERROR, NUMERO, type Columna } from '../../engine/values/columna.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

// A: 1..4 · B: 10, 20, 30, 40 · C: textos con repetidos
const DATOS = {
  A1: '1', A2: '2', A3: '3', A4: '4',
  B1: '10', B2: '20', B3: '30', B4: '40',
  C1: '"rojo"', C2: '"azul"', C3: '"Rojo"', C4: '"verde"', C5: '"azul"',
};

function evaluar(formula: string): Columna {
  const g = grafoDe({ ...DATOS, Z1: formula });
  const r = evaluarModelo(g, new Map(), [k('Z1')], 1);
  if (!r.ok) throw new Error(r.error.motivo);
  return r.valores.get(k('Z1')) as Columna;
}
const num = (f: string) => {
  const c = evaluar(f);
  expect(tipoEn(c, 0), f).toBe(NUMERO);
  return numeroEn(c, 0);
};
const err = (f: string) => {
  const c = evaluar(f);
  expect(tipoEn(c, 0), f).toBe(ERROR);
  return errorEn(c, 0);
};

describe('operaciones entre rangos dentro de una función', () => {
  it('SUMA(A*B) es el producto escalar', () => {
    expect(num('SUM(A1:A4*B1:B4)')).toBe(300);
  });

  it('SUMAPRODUCTO con condición', () => {
    expect(num('SUMPRODUCT((A1:A4>2)*B1:B4)')).toBe(70);
  });

  it('la matricial clásica SUMA(SI(…))', () => {
    expect(num('SUM(IF(A1:A4>2,B1:B4))')).toBe(70);
    expect(num('MAX(IF(A1:A4<3,B1:B4))')).toBe(20);
  });

  it('difusión: una columna contra un escalar', () => {
    expect(num('SUM(B1:B4/10)')).toBe(10);
  });

  it('constantes matriciales', () => {
    expect(num('SUM({1,2,3}*2)')).toBe(12);
  });
});

describe('funciones de matrices dinámicas', () => {
  it('FILTRAR dentro de SUMA', () => {
    expect(num('SUM(FILTER(B1:B4,A1:A4>2))')).toBe(70);
    expect(num('COUNTA(FILTER(B1:B4,A1:A4>1))')).toBe(3);
  });

  it('FILTRAR sin resultados: #CALC!, o el valor de si_vacío', () => {
    expect(err('SUM(FILTER(B1:B4,A1:A4>9))')).toBe('#CALC!');
    expect(num('SUM(FILTER(B1:B4,A1:A4>9,0))')).toBe(0);
  });

  it('FILTRAR deja las filas que pasan arriba y en orden', () => {
    expect(num('INDEX(FILTER(B1:B4,A1:A4>2),1)')).toBe(30);
  });

  it('ORDENAR y ORDENARPOR', () => {
    expect(num('INDEX(SORT(B1:B4,1,-1),1)')).toBe(40);
    expect(num('INDEX(SORTBY(B1:B4,A1:A4,-1),2)')).toBe(30);
  });

  it('UNICOS no distingue mayúsculas; exactamente_una_vez', () => {
    expect(num('COUNTA(UNIQUE(C1:C5))')).toBe(3); // rojo, azul, verde
    expect(num('COUNTA(UNIQUE(C1:C5,FALSE,TRUE))')).toBe(1); // solo verde
  });

  it('SECUENCIA', () => {
    expect(num('SUM(SEQUENCE(10))')).toBe(55);
    expect(num('SUM(SEQUENCE(2,3,0,2))')).toBe(30); // 0,2,4,6,8,10
  });

  it('TRANSPONER', () => {
    expect(num('INDEX(TRANSPOSE(A1:A4),1,2)')).toBe(2);
  });

  it('MMULT y MINVERSA', () => {
    expect(num('SUM(MMULT({1,2;3,4},{1;1}))')).toBe(10);
    expect(num('INDEX(MINVERSE({2,0;0,4}),2,2)')).toBeCloseTo(0.25, 12);
    expect(err('SUM(MINVERSE({1,2;2,4}))')).toBe('#NUM!');
  });

  it('se admiten con el prefijo del XML', () => {
    expect(num('SUM(_xlfn._xlws.FILTER(B1:B4,A1:A4>2))')).toBe(70);
  });
});

describe('lo que derramaría va al modo compatible', () => {
  it('FILTRAR sola en la celda', () => {
    const g = grafoDe({ ...DATOS, Z1: 'FILTER(B1:B4,A1:A4>A1)' });
    const e = elegirMotor(g, [k('A1')], [k('Z1')]);
    expect(e.motor).toBe('compatible');
    expect(e.motivos[0]).toMatchObject({ tipo: 'matricial' });
  });

  it('dentro de una función que no consume matrices (derramaría igual)', () => {
    const g = grafoDe({ ...DATOS, Z1: 'ROUND(FILTER(B1:B4,A1:A4>A1),0)' });
    expect(elegirMotor(g, [k('A1')], [k('Z1')]).motor).toBe('compatible');
  });

  it('dentro de SUMA, en cambio, el motor rápido', () => {
    const g = grafoDe({ ...DATOS, Z1: 'SUM(ROUND(FILTER(B1:B4,A1:A4>A1),0))' });
    expect(elegirMotor(g, [k('A1')], [k('Z1')]).motor).toBe('fast');
  });
});

describe('una matriz que cambia en cada iteración', () => {
  it('FILTRAR con un criterio que depende de la entrada deja pasar filas distintas', () => {
    const g = grafoDe({ ...DATOS, Z1: 'SUM(FILTER(B1:B4,A1:A4<=E1,0))', E1: '0' });
    const umbrales = Float64Array.from([0, 1.5, 2, 3.9, 4, 10]);
    const r = evaluarModelo(g, new Map([[k('E1'), umbrales]]), [k('Z1')], umbrales.length);
    if (!r.ok) throw new Error(r.error.motivo);
    const z = r.valores.get(k('Z1')) as Columna;
    expect(Array.from({ length: umbrales.length }, (_, i) => numeroEn(z, i))).toEqual([0, 10, 30, 60, 100, 100]);
  });
});
