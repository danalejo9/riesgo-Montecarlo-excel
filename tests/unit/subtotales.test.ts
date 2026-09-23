/**
 * `SUBTOTALES` y `AGREGAR` existen para no contar dos veces. Implementarlas sin
 * eso sería peor que no implementarlas: el total general de un presupuesto con
 * subtotales por capítulo saldría el doble de lo correcto, sin avisar.
 *
 * Por eso lo que más se prueba aquí es la exclusión, y **por los dos
 * evaluadores**: el de referencia y el compilado. El compilado difunde las
 * constantes a `n` iteraciones creando columnas nuevas, y ese es el sitio
 * exacto donde la marca de "esto es un subtotal" podía perderse.
 */
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { ejecutarPlan } from '../../engine/compiler/executor.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
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

/**
 * Un presupuesto con dos capítulos y sus subtotales, y un total general que
 * abarca la columna entera. Es el patrón para el que existe `SUBTOTALES`.
 *
 *   B1  100   \\
 *   B2  200    | capítulo 1
 *   B3  =SUBTOTAL(9,B1:B2)   -> 300
 *   B4   50   \\
 *   B5   25    | capítulo 2
 *   B6  =SUBTOTAL(9,B4:B5)   -> 75
 *   B7  =SUBTOTAL(9,B1:B6)   -> 375, no 750
 */
const PRESUPUESTO = {
  B1: '100', B2: '200', B3: 'SUBTOTAL(9,B1:B2)',
  B4: '50', B5: '25', B6: 'SUBTOTAL(9,B4:B5)',
  B7: 'SUBTOTAL(9,B1:B6)',
};

function numeroDe(c: Columna, i = 0): number {
  expect(tipoEn(c, i)).toBe(NUMERO);
  return numeroEn(c, i);
}

describe('SUBTOTALES no cuenta dos veces', () => {
  it('el total general ignora los subtotales intermedios', () => {
    const g = grafoDe(PRESUPUESTO);
    const r = evaluarModelo(g, new Map(), [k('B7')], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(numeroDe(r.valores.get(k('B7')) as Columna)).toBe(375);
  });

  it('una SUMA sobre el mismo rango sí cuenta dos veces: es la diferencia', () => {
    const g = grafoDe({ ...PRESUPUESTO, B8: 'SUM(B1:B6)' });
    const r = evaluarModelo(g, new Map(), [k('B8')], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(numeroDe(r.valores.get(k('B8')) as Columna)).toBe(750);
  });

  it('también con una entrada incierta, por el ejecutor compilado', () => {
    // B1 es una entrada: el capítulo 1 varía, el capítulo 2 es constante. El
    // ejecutor calcula B6 una sola vez y lo **difunde** para que B7 lo lea
    // junto a lo que varía. La columna difundida es otro objeto: sin heredar
    // la marca, B7 contaría el capítulo 2 dos veces (150 en vez de 75).
    const g = grafoDe(PRESUPUESTO);
    const entradas = new Map([[k('B1'), Float64Array.from([100, 1000])]]);

    const plan = compilarPlan(g, new Set(entradas.keys()), [k('B7')]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.esConstante.has(k('B6'))).toBe(true);

    const r = ejecutarPlan(g, plan.plan, entradas, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const total = r.valores.get(k('B7')) as Columna;
    expect(numeroDe(total, 0)).toBe(375);
    expect(numeroDe(total, 1)).toBe(1275);
  });

  it('los códigos 1–11 son las once funciones', () => {
    const datos = { A1: '2', A2: '4', A3: '6' };
    const casos: Array<[string, number]> = [
      ['SUBTOTAL(1,A1:A3)', 4], ['SUBTOTAL(2,A1:A3)', 3], ['SUBTOTAL(4,A1:A3)', 6],
      ['SUBTOTAL(5,A1:A3)', 2], ['SUBTOTAL(6,A1:A3)', 48], ['SUBTOTAL(9,A1:A3)', 12],
    ];
    for (const [formula, esperado] of casos) {
      const r = evaluarModelo(grafoDe({ ...datos, Z1: formula }), new Map(), [k('Z1')], 1);
      expect(r.ok, formula).toBe(true);
      if (r.ok) expect(numeroDe(r.valores.get(k('Z1')) as Columna), formula).toBeCloseTo(esperado, 12);
    }
  });

  it('109 se trata como 9: el motor no sabe qué filas están ocultas', () => {
    const r = evaluarModelo(grafoDe({ ...PRESUPUESTO, B8: 'SUBTOTAL(109,B1:B6)' }), new Map(), [k('B8')], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(numeroDe(r.valores.get(k('B8')) as Columna)).toBe(375);
  });

  it('un código desconocido es #¡VALOR!', () => {
    const r = evaluarModelo(grafoDe({ A1: '1', Z1: 'SUBTOTAL(12,A1)' }), new Map(), [k('Z1')], 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.valores.get(k('Z1')) as Columna;
    expect(tipoEn(c, 0)).toBe(ERROR);
    expect(errorEn(c, 0)).toBe('#VALUE!');
  });

  it('un error en el rango se propaga, como en la función base', () => {
    const r = evaluarModelo(grafoDe({ A1: '1', A2: '1/0', Z1: 'SUBTOTAL(9,A1:A2)' }), new Map(), [k('Z1')], 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(errorEn(r.valores.get(k('Z1')) as Columna, 0)).toBe('#DIV/0!');
  });
});

describe('AGREGAR', () => {
  function valor(formula: string, datos: Record<string, string>): Columna {
    const r = evaluarModelo(grafoDe({ ...datos, Z1: formula }), new Map(), [k('Z1')], 1);
    if (!r.ok) throw new Error(r.error.motivo);
    return r.valores.get(k('Z1')) as Columna;
  }

  const CON_ERROR = { A1: '10', A2: '1/0', A3: '30' };

  it('la opción 6 ignora los errores del rango', () => {
    expect(numeroDe(valor('AGGREGATE(9,6,A1:A3)', CON_ERROR))).toBe(40);
    expect(numeroDe(valor('AGGREGATE(1,6,A1:A3)', CON_ERROR))).toBe(20);
  });

  it('la opción 4 no ignora nada: el error se propaga', () => {
    const c = valor('AGGREGATE(9,4,A1:A3)', CON_ERROR);
    expect(errorEn(c, 0)).toBe('#DIV/0!');
  });

  it('con las opciones 0–3 ignora también los subtotales intermedios', () => {
    expect(numeroDe(valor('AGGREGATE(9,0,B1:B6)', PRESUPUESTO))).toBe(375);
    // Con la 4 no los ignora, y cuenta dos veces.
    expect(numeroDe(valor('AGGREGATE(9,4,B1:B6)', PRESUPUESTO))).toBe(750);
  });

  it('un total con SUBTOTALES ignora un AGREGAR intermedio, y al revés', () => {
    const datos = { B1: '1', B2: '2', B3: 'AGGREGATE(9,0,B1:B2)', B4: 'SUBTOTAL(9,B1:B3)' };
    expect(numeroDe(valor('B4+0', datos))).toBe(3);
  });

  it('las funciones con k: k-ésimo, percentil y cuartil', () => {
    const datos = { A1: '1', A2: '2', A3: '3', A4: '4', A5: '1/0' };
    expect(numeroDe(valor('AGGREGATE(14,6,A1:A5,1)', datos))).toBe(4);
    expect(numeroDe(valor('AGGREGATE(15,6,A1:A5,2)', datos))).toBe(2);
    expect(numeroDe(valor('AGGREGATE(16,6,A1:A5,0.5)', datos))).toBe(2.5);
    expect(numeroDe(valor('AGGREGATE(17,6,A1:A5,1)', datos))).toBeCloseTo(1.75, 12);
  });

  it('el percentil exclusivo no alcanza los extremos con pocos datos', () => {
    const datos = { A1: '1', A2: '2', A3: '3' };
    // Con 3 datos, p·(n+1) tiene que caer entre 1 y 3: p = 0,1 da 0,4 y no vale.
    expect(errorEn(valor('AGGREGATE(18,6,A1:A3,0.1)', datos), 0)).toBe('#NUM!');
    expect(numeroDe(valor('AGGREGATE(18,6,A1:A3,0.5)', datos))).toBe(2);
  });

  it('la moda, y #N/A cuando no se repite nada', () => {
    expect(numeroDe(valor('AGGREGATE(13,6,A1:A4)', { A1: '3', A2: '5', A3: '5', A4: '3' }))).toBe(3);
    expect(errorEn(valor('AGGREGATE(13,6,A1:A3)', { A1: '1', A2: '2', A3: '3' }), 0)).toBe('#N/A');
  });

  it('una opción fuera de 0–7 es #¡VALOR!', () => {
    expect(errorEn(valor('AGGREGATE(9,8,A1:A3)', CON_ERROR), 0)).toBe('#VALUE!');
  });
});
