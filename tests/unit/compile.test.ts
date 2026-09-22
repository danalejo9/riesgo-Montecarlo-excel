import { describe, expect, it } from 'vitest';

import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { ejecutarPlan } from '../../engine/compiler/executor.ts';
import { compilarPlan, type Plan } from '../../engine/compiler/plan.ts';
import { nums } from '../helpers/valores.ts';
import { errorEn, NUMERO, TEXTO, type Columna, type ValorEscalar } from '../../engine/values/columna.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.toUpperCase().charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

function entradaConstante(valor: number, n: number): Float64Array {
  const b = new Float64Array(n);
  b.fill(valor);
  return b;
}

/** Compila y ejecuta en un solo paso, para no repetirlo en cada test. */
function compilarYEjecutar(
  grafo: ReturnType<typeof grafoDe>,
  entradas: Map<string, Float64Array>,
  salidas: string[],
  n: number,
) {
  const compilado = compilarPlan(grafo, new Set(entradas.keys()), salidas);
  if (!compilado.ok) return compilado;
  return ejecutarPlan(grafo, compilado.plan, entradas, n);
}

describe('compilarPlan + ejecutarPlan — paridad con el evaluador de referencia', () => {
  it('cadena de dependencias con una entrada', () => {
    const g = grafoDe({ A1: 'B1*2', B1: 'C1+10' });
    const n = 4;
    const entradas = new Map([[k('C1'), Float64Array.from([0, 1, 2, 3])]]);

    const referencia = evaluarModelo(g, entradas, [k('A1')], n);
    const compilado = compilarYEjecutar(g, entradas, [k('A1')], n);

    expect(referencia.ok).toBe(true);
    expect(compilado.ok).toBe(true);
    if (referencia.ok && compilado.ok) {
      expect(nums(compilado.valores.get(k('A1')))).toEqual(
        nums(referencia.valores.get(k('A1'))),
      );
    }
  });

  it('funciones anidadas con una cadena de presupuesto real (precio constante)', () => {
    const g = grafoDe({
      B1: '950',
      C1: 'A1*B1',
      D1: 'ROUND(C1*0.19,2)',
      E1: 'C1+D1',
    });
    const n = 5;
    const entradas = new Map([[k('A1'), Float64Array.from([10, 20, 30, 40, 50])]]);

    const referencia = evaluarModelo(g, entradas, [k('E1')], n);
    const compilado = compilarYEjecutar(g, entradas, [k('E1')], n);

    expect(referencia.ok).toBe(true);
    expect(compilado.ok).toBe(true);
    if (referencia.ok && compilado.ok) {
      expect(nums(compilado.valores.get(k('E1')))).toEqual(
        nums(referencia.valores.get(k('E1'))),
      );
    }
  });

  it('SUM sobre un rango y varias salidas a la vez', () => {
    const g = grafoDe({ A1: '1', A2: '2', A3: '3', B1: 'SUM(A1:A3)*X1', C1: 'X1+1' });
    const n = 3;
    const entradas = new Map([[k('X1'), Float64Array.from([1, 2, 3])]]);
    const salidas = [k('B1'), k('C1')];

    const referencia = evaluarModelo(g, entradas, salidas, n);
    const compilado = compilarYEjecutar(g, entradas, salidas, n);

    expect(referencia.ok).toBe(true);
    expect(compilado.ok).toBe(true);
    if (referencia.ok && compilado.ok) {
      for (const clave of salidas) {
        expect(nums(compilado.valores.get(clave))).toEqual(
          nums(referencia.valores.get(clave)),
        );
      }
    }
  });

  it('división por cero da #¡DIV/0! en ambos, no lanza', () => {
    const g = grafoDe({ A1: 'B1/C1' });
    const n = 1;
    const entradas = new Map([[k('B1'), entradaConstante(10, n)], [k('C1'), entradaConstante(0, n)]]);

    const referencia = evaluarModelo(g, entradas, [k('A1')], n);
    const compilado = compilarYEjecutar(g, entradas, [k('A1')], n);
    expect(referencia.ok).toBe(true);
    expect(compilado.ok).toBe(true);
    if (referencia.ok && compilado.ok) {
      expect(errorEn(compilado.valores.get(k('A1')) as Columna, 0)).toBe('#DIV/0!');
      expect(errorEn(referencia.valores.get(k('A1')) as Columna, 0)).toBe('#DIV/0!');
    }
  });

  it('un modelo íntegramente constante (sin entradas relevantes) da el mismo resultado', () => {
    const g = grafoDe({ A1: '10', B1: '20', C1: 'SUM(A1,B1)*2' });
    const n = 100;

    const referencia = evaluarModelo(g, new Map(), [k('C1')], n);
    const compilado = compilarYEjecutar(g, new Map(), [k('C1')], n);
    expect(referencia.ok).toBe(true);
    expect(compilado.ok).toBe(true);
    if (referencia.ok && compilado.ok) {
      const esperado = nums(referencia.valores.get(k('C1')));
      expect(esperado.every((x) => x === 60)).toBe(true);
      expect(nums(compilado.valores.get(k('C1')))).toEqual(esperado);
    }
  });
});

describe('compilarPlan — constant folding', () => {
  it('marca como constante lo que no depende de ninguna entrada, y como variable lo que sí', () => {
    // B1 y D1 son constantes (tabla de tarifas); C1 y E1 dependen de A1 (entrada).
    const g = grafoDe({
      B1: '950',
      C1: 'A1*B1',
      D1: '0.19',
      E1: 'C1*D1',
    });
    const r = compilarPlan(g, new Set([k('A1')]), [k('E1')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.esConstante.has(k('B1'))).toBe(true);
      expect(r.plan.esConstante.has(k('D1'))).toBe(true);
      expect(r.plan.esConstante.has(k('C1'))).toBe(false);
      expect(r.plan.esConstante.has(k('E1'))).toBe(false);
    }
  });

  it('una salida que no depende de ninguna entrada también se marca constante', () => {
    const g = grafoDe({ A1: '10', B1: 'A1*2' });
    const r = compilarPlan(g, new Set(), [k('B1')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.esConstante.has(k('A1'))).toBe(true);
      expect(r.plan.esConstante.has(k('B1'))).toBe(true);
    }
  });

  it('una celda constante consumida por otra constante no se difunde de más (verificable por resultado, no por implementación)', () => {
    // F1 (constante) alimenta a G1 (constante) y no a nada variable: el
    // resultado debe ser correcto igual, difunda o no internamente.
    const g = grafoDe({ F1: '2', G1: 'F1*F1', H1: 'A1+G1' });
    const n = 6;
    const entradas = new Map([[k('A1'), Float64Array.from([1, 2, 3, 4, 5, 6])]]);
    const referencia = evaluarModelo(g, entradas, [k('H1')], n);
    const compilado = compilarYEjecutar(g, entradas, [k('H1')], n);
    expect(referencia.ok).toBe(true);
    expect(compilado.ok).toBe(true);
    if (referencia.ok && compilado.ok) {
      expect(nums(compilado.valores.get(k('H1')))).toEqual(
        nums(referencia.valores.get(k('H1'))),
      );
    }
  });
});

describe('compilarPlan — errores', () => {
  it('detecta referencias circulares, igual que el evaluador de referencia', () => {
    const g = grafoDe({ A1: 'B1+1', B1: 'A1+1' });
    const r = compilarPlan(g, new Set(), [k('A1')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.motivo).toMatch(/circular/i);
  });

  it('reporta una función no soportada al ejecutar, con la celda exacta', () => {
    const g = grafoDe({ A1: 'FUNCIONINEXISTENTE(1)' });
    const compilado = compilarPlan(g, new Set(), [k('A1')]);
    expect(compilado.ok).toBe(true);
    if (compilado.ok) {
      const r = ejecutarPlan(g, compilado.plan, new Map(), 3);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.clave).toBe(k('A1'));
        expect(r.error.motivo).toMatch(/no soportada/i);
      }
    }
  });

  it('rechaza un buffer de entrada de longitud distinta a n', () => {
    const g = grafoDe({ A1: 'B1*2' });
    const compilado = compilarPlan(g, new Set([k('B1')]), [k('A1')]);
    expect(compilado.ok).toBe(true);
    if (compilado.ok) {
      const r = ejecutarPlan(g, compilado.plan, new Map([[k('B1'), new Float64Array(2)]]), 5);
      expect(r.ok).toBe(false);
    }
  });
});

describe('ejecutarPlan — contrato de salida', () => {
  it('solo devuelve las salidas pedidas, no todas las celdas intermedias', () => {
    const g = grafoDe({ A1: 'B1*2', B1: 'C1+10' });
    const n = 3;
    const entradas = new Map([[k('C1'), Float64Array.from([1, 2, 3])]]);
    const compilado = compilarPlan(g, new Set(entradas.keys()), [k('A1')]);
    expect(compilado.ok).toBe(true);
    if (compilado.ok) {
      const r = ejecutarPlan(g, compilado.plan, entradas, n);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.valores.size).toBe(1);
        expect(r.valores.has(k('A1'))).toBe(true);
        expect(r.valores.has(k('B1'))).toBe(false);
      }
    }
  });
});

describe('valores estáticos del libro', () => {
  // Hasta que el grafo supo de ellos, una celda sin fórmula se evaluaba como
  // vacía. En un libro de juguete daba igual, porque las constantes viven
  // dentro de las fórmulas; en un modelo real los datos están en celdas y las
  // fórmulas los referencian, así que media hoja valía cero sin avisar.
  function grafoConValores(formulas: Record<string, string>, valores: Record<string, ValorEscalar>) {
    const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => ({
      hoja: H,
      col: colDe(ref),
      fila: filaDe(ref),
      formula,
    }));
    const datos = Object.entries(valores).map(([ref, valor]) => ({
      hoja: H,
      col: colDe(ref),
      fila: filaDe(ref),
      valor,
    }));
    return construirGrafo(celdas, datos).grafo;
  }

  const colDe = (ref: string) =>
    [...((/^\$?([A-Za-z]{1,3})/.exec(ref) as RegExpExecArray)[1] as string)].reduce(
      (acc, c) => acc * 26 + (c.toUpperCase().charCodeAt(0) - 64),
      0,
    );
  const filaDe = (ref: string) => Number((/([0-9]{1,7})$/.exec(ref) as RegExpExecArray)[1]);

  it('una fórmula ve el número de la celda de datos', () => {
    const g = grafoConValores({ C1: 'A1*B1' }, { B1: { tipo: NUMERO, numero: 7 } });
    const entradas = new Map([[k('A1'), Float64Array.from([2, 3])]]);

    const r = ejecutarPlan(g, (compilarPlan(g, new Set(entradas.keys()), [k('C1')]) as { plan: Plan }).plan, entradas, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(nums(r.valores.get(k('C1')) as Columna)).toEqual([14, 21]);
  });

  it('el evaluador de referencia y el compilado coinciden', () => {
    const g = grafoConValores(
      { C1: 'IF(B1="alto",A1*2,A1)', D1: 'C1+E1' },
      { B1: { tipo: TEXTO, texto: 'alto' }, E1: { tipo: NUMERO, numero: 100 } },
    );
    const entradas = new Map([[k('A1'), Float64Array.from([5, 6])]]);

    const referencia = evaluarModelo(g, entradas, [k('D1')], 2);
    const compilado = compilarYEjecutar(g, entradas, [k('D1')], 2);

    expect(referencia.ok).toBe(true);
    expect(compilado.ok).toBe(true);
    if (!referencia.ok || !compilado.ok) return;
    expect(nums(compilado.valores.get(k('D1')) as Columna)).toEqual([110, 112]);
    expect(nums(referencia.valores.get(k('D1')) as Columna)).toEqual([110, 112]);
  });

  it('una celda sin valor y sin fórmula sigue siendo vacía, no cero', () => {
    // La distinción que costó rehacer medio motor: CONTAR cuenta números, y
    // una celda vacía no es un número.
    const g = grafoConValores({ C1: 'COUNT(A1:B1)' }, {});
    const entradas = new Map([[k('A1'), Float64Array.from([1, 1])]]);
    const r = compilarYEjecutar(g, entradas, [k('C1')], 2);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(nums(r.valores.get(k('C1')) as Columna)).toEqual([1, 1]);
  });

  it('si una celda tiene fórmula y valor, manda la fórmula', () => {
    // Un valor es el resultado de calcular la fórmula, no un dato aparte.
    const g = grafoConValores({ B1: 'A1*10' }, { B1: { tipo: NUMERO, numero: 999 } });
    const entradas = new Map([[k('A1'), Float64Array.from([2, 2])]]);
    const r = compilarYEjecutar(g, entradas, [k('B1')], 2);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(nums(r.valores.get(k('B1')) as Columna)).toEqual([20, 20]);
  });
});
