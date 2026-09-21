import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { num, nums } from '../helpers/valores.ts';
import { errorEn, tipoEn, ERROR, type Columna } from '../../engine/values/columna.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref) as RegExpExecArray;
    const col = [...m[1] as string].reduce((acc, c) => acc * 26 + (c.toUpperCase().charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

function entradaConstante(valor: number, n: number): Float64Array {
  const b = new Float64Array(n);
  b.fill(valor);
  return b;
}

describe('evaluarModelo — aritmética básica', () => {
  it('propaga una entrada a través de una cadena de fórmulas', () => {
    const g = grafoDe({ A1: 'B1*2', B1: 'C1+10' });
    const n = 4;
    const entradas = new Map([[k('C1'), Float64Array.from([0, 1, 2, 3])]]);

    const r = evaluarModelo(g, entradas, [k('A1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('A1')))).toEqual([20, 22, 24, 26]);
  });

  it('respeta la precedencia ya resuelta en el AST', () => {
    const g = grafoDe({ A1: '(B1+C1)*2' });
    const n = 1;
    const entradas = new Map([
      [k('B1'), entradaConstante(3, n)],
      [k('C1'), entradaConstante(4, n)],
    ]);
    const r = evaluarModelo(g, entradas, [k('A1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) expect(num(r.valores.get(k('A1')))).toBe(14);
  });

  it('una celda sin fórmula y sin entrada se trata como vacía (0)', () => {
    const g = grafoDe({ B1: 'A1+5' }); // A1 no está en la lista de fórmulas
    const n = 2;
    const r = evaluarModelo(g, new Map(), [k('B1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('B1')))).toEqual([5, 5]);
  });

  it('división por cero da el error #¡DIV/0! de Excel, no lanza', () => {
    const g = grafoDe({ A1: 'B1/C1' });
    const n = 1;
    const entradas = new Map([
      [k('B1'), entradaConstante(10, n)],
      [k('C1'), entradaConstante(0, n)],
    ]);
    const r = evaluarModelo(g, entradas, [k('A1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const c = r.valores.get(k('A1')) as Columna;
      expect(tipoEn(c, 0)).toBe(ERROR);
      expect(errorEn(c, 0)).toBe('#DIV/0!');
    }
  });
});

describe('evaluarModelo — funciones y rangos', () => {
  it('evalúa SUM sobre un rango construido desde el grafo', () => {
    const g = grafoDe({ A1: '1', A2: '2', A3: '3', B1: 'SUM(A1:A3)*2' });
    const n = 1;
    const r = evaluarModelo(g, new Map(), [k('B1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) expect(num(r.valores.get(k('B1')))).toBe(12);
  });

  it('IF selecciona rama por iteración usando una entrada como condición', () => {
    const g = grafoDe({ A1: 'IF(B1>5,100,-100)' });
    const n = 3;
    const entradas = new Map([[k('B1'), Float64Array.from([1, 10, 5])]]);
    const r = evaluarModelo(g, entradas, [k('A1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('A1')))).toEqual([-100, 100, -100]);
  });

  it('funciones anidadas con una cadena de dependencias real de presupuesto', () => {
    // A1 = cantidad (entrada), B1 = precio (constante), C1 = subtotal,
    // D1 = IVA, E1 = total (la salida).
    const g = grafoDe({
      B1: '950',              // precio
      C1: 'A1*B1',            // subtotal
      D1: 'ROUND(C1*0.19,2)', // iva
      E1: 'C1+D1',            // total
    });
    const n = 2;
    const entradas = new Map([[k('A1'), Float64Array.from([10, 20])]]);
    const r = evaluarModelo(g, entradas, [k('E1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 10*950=9500, iva=1805, total=11305 | 20*950=19000, iva=3610, total=22610
      expect(nums(r.valores.get(k('E1')))).toEqual([11305, 22610]);
    }
  });
});

describe('evaluarModelo — comparaciones y lógica', () => {
  it('los operadores de comparación producen 0/1', () => {
    const g = grafoDe({ A1: 'B1>=10' });
    const n = 3;
    const entradas = new Map([[k('B1'), Float64Array.from([5, 10, 15])]]);
    const r = evaluarModelo(g, entradas, [k('A1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('A1')))).toEqual([0, 1, 1]);
  });

  it('unario y porcentaje', () => {
    const g = grafoDe({ A1: '-B1', C1: '50%' });
    const n = 1;
    const entradas = new Map([[k('B1'), entradaConstante(7, n)]]);
    const r = evaluarModelo(g, entradas, [k('A1'), k('C1')], n);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(num(r.valores.get(k('A1')))).toBe(-7);
      expect(num(r.valores.get(k('C1')))).toBe(0.5);
    }
  });
});

describe('evaluarModelo — errores', () => {
  it('detecta una referencia circular sin colgarse', () => {
    const g = grafoDe({ A1: 'B1+1', B1: 'A1+1' });
    const r = evaluarModelo(g, new Map(), [k('A1')], 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.motivo).toMatch(/circular/);
  });

  it('reporta una función no soportada con el nombre y la celda exactos', () => {
    const g = grafoDe({ A1: 'SUBTOTAL(9,B1:B2)', B1: '1', B2: '2' });
    const r = evaluarModelo(g, new Map(), [k('A1')], 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.clave).toBe(k('A1'));
      expect(r.error.motivo).toMatch(/SUBTOTAL/);
    }
  });

  it('reporta un error de sintaxis con su celda', () => {
    const g = grafoDe({ A1: '1+' });
    const r = evaluarModelo(g, new Map(), [k('A1')], 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.clave).toBe(k('A1'));
  });

  it('rechaza una entrada cuyo buffer no tiene el tamaño esperado', () => {
    const g = grafoDe({ A1: 'B1*2' });
    const r = evaluarModelo(g, new Map([[k('B1'), Float64Array.from([1, 2, 3])]]), [k('A1')], 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.motivo).toMatch(/5/);
  });

  it('un rango de columna entera no soportada da un mensaje claro', () => {
    const g = grafoDe({ A1: 'SUM(B:B)', B1: '1' });
    const r = evaluarModelo(g, new Map(), [k('A1')], 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.motivo).toMatch(/entera/);
  });
});
