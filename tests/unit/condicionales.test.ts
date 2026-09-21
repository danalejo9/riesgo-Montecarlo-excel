import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import {
  AVERAGEIF, AVERAGEIFS, COUNTIF, COUNTIFS, SUMIF, SUMIFS,
} from '../../engine/functions/condicionales.ts';
import { compilarCriterioTexto, cumple } from '../../engine/functions/criterios.ts';
import { argRango, argValor, type Argumento } from '../../engine/functions/types.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  errorEn, numeroConstante, textoConstante, tipoEn, vacioConstante, vectorNumerico,
  ERROR, type Columna,
} from '../../engine/values/columna.ts';
import { nums } from '../helpers/valores.ts';

/** Rango de números constantes en todas las iteraciones. */
const rangoNum = (...v: number[]): Argumento =>
  argRango(v.map((x) => numeroConstante(x, 1)));

/** Rango de etiquetas de texto, como una columna de categorías real. */
const rangoTxt = (...v: string[]): Argumento =>
  argRango(v.map((s) => textoConstante(s, 1)));

const crit = (s: string): Argumento => argValor(textoConstante(s, 1));
const critNum = (x: number): Argumento => argValor(numeroConstante(x, 1));

function errorDe(c: Columna): string | undefined {
  return tipoEn(c, 0) === ERROR ? errorEn(c, 0) : undefined;
}

describe('gramática de criterios', () => {
  it('separa el comparador del valor', () => {
    expect(compilarCriterioTexto('>100')).toMatchObject({ comparador: '>', numero: 100 });
    expect(compilarCriterioTexto('<=5')).toMatchObject({ comparador: '<=', numero: 5 });
    expect(compilarCriterioTexto('<>0')).toMatchObject({ comparador: '<>', numero: 0 });
    expect(compilarCriterioTexto('100')).toMatchObject({ comparador: '=', numero: 100 });
    expect(compilarCriterioTexto('cemento')).toMatchObject({ comparador: '=', texto: 'cemento' });
  });

  it('reconoce los criterios que hablan de estar vacío', () => {
    expect(compilarCriterioTexto('')).toMatchObject({ comparador: '=', sobreVacio: true });
    expect(compilarCriterioTexto('<>')).toMatchObject({ comparador: '<>', sobreVacio: true });
  });

  it('traduce los comodines * y ?', () => {
    const c = compilarCriterioTexto('cem*');
    expect(cumple(c, textoConstante('Cemento gris', 1), 0)).toBe(true);
    expect(cumple(c, textoConstante('acero', 1), 0)).toBe(false);

    const uno = compilarCriterioTexto('?asa');
    expect(cumple(uno, textoConstante('casa', 1), 0)).toBe(true);
    expect(cumple(uno, textoConstante('carcasa', 1), 0)).toBe(false);
  });

  it('~ escapa el comodín para buscarlo literalmente', () => {
    const c = compilarCriterioTexto('~*');
    expect(cumple(c, textoConstante('*', 1), 0)).toBe(true);
    expect(cumple(c, textoConstante('cualquier cosa', 1), 0)).toBe(false);
  });

  it('el texto no distingue mayúsculas', () => {
    expect(cumple(compilarCriterioTexto('CEMENTO'), textoConstante('cemento', 1), 0)).toBe(true);
  });

  it('una celda vacía no coincide con ningún criterio numérico', () => {
    for (const s of ['>0', '<1', '<>5', '0']) {
      expect(cumple(compilarCriterioTexto(s), vacioConstante(1), 0)).toBe(false);
    }
  });

  it('"" coincide con las vacías y "<>" con las no vacías', () => {
    expect(cumple(compilarCriterioTexto(''), vacioConstante(1), 0)).toBe(true);
    expect(cumple(compilarCriterioTexto(''), numeroConstante(0, 1), 0)).toBe(false);
    expect(cumple(compilarCriterioTexto('<>'), numeroConstante(0, 1), 0)).toBe(true);
    expect(cumple(compilarCriterioTexto('<>'), vacioConstante(1), 0)).toBe(false);
  });

  it('una celda con error no coincide con nada, pero tampoco rompe la cuenta', () => {
    expect(nums(COUNTIF([argRango([
      numeroConstante(5, 1),
      { forma: 'constante', n: 1, valor: { tipo: ERROR, error: '#N/A' } } as Columna,
      numeroConstante(7, 1),
    ]), crit('>0')], 1))).toEqual([2]);
  });
});

describe('SUMIF y SUMIFS', () => {
  it('SUMAR.SI suma el propio rango cuando no se da rango_suma', () => {
    expect(nums(SUMIF([rangoNum(5, 15, 25), crit('>10')], 1))).toEqual([40]);
  });

  it('SUMAR.SI con rango_suma aparte', () => {
    const categorias = rangoTxt('cemento', 'acero', 'cemento');
    const costes = rangoNum(100, 200, 300);
    expect(nums(SUMIF([categorias, crit('cemento'), costes], 1))).toEqual([400]);
  });

  it('SUMAR.SI.CONJUNTO cruza varios criterios (el rango de suma va primero)', () => {
    const costes = rangoNum(100, 200, 300, 400);
    const categorias = rangoTxt('obra', 'obra', 'suministro', 'obra');
    const cantidades = rangoNum(1, 5, 5, 9);
    // categoría = obra Y cantidad > 3  ->  200 + 400
    expect(nums(SUMIFS([costes, categorias, crit('obra'), cantidades, crit('>3')], 1))).toEqual([600]);
  });

  it('solo suma los números del rango objetivo, como SUMA', () => {
    const objetivo = argRango([numeroConstante(10, 1), textoConstante('x', 1), vacioConstante(1)]);
    expect(nums(SUMIF([rangoNum(1, 1, 1), critNum(1), objetivo], 1))).toEqual([10]);
  });

  it('rangos de distinto tamaño dan #¡VALOR! en vez de adivinar', () => {
    expect(errorDe(SUMIF([rangoNum(1, 2, 3), crit('>0'), rangoNum(10)], 1))).toBe('#VALUE!');
  });

  it('un error en una celda que coincide se propaga', () => {
    const objetivo = argRango([
      { forma: 'constante', n: 1, valor: { tipo: ERROR, error: '#DIV/0!' } } as Columna,
    ]);
    expect(errorDe(SUMIF([rangoNum(1), critNum(1), objetivo], 1))).toBe('#DIV/0!');
  });
});

describe('COUNTIF y COUNTIFS', () => {
  it('CONTAR.SI con criterio numérico y de texto', () => {
    expect(nums(COUNTIF([rangoNum(5, 15, 25), crit('>10')], 1))).toEqual([2]);
    expect(nums(COUNTIF([rangoTxt('a', 'b', 'a'), crit('a')], 1))).toEqual([2]);
  });

  it('CONTAR.SI.CONJUNTO exige que se cumplan todos los criterios', () => {
    const cat = rangoTxt('obra', 'obra', 'suministro');
    const cant = rangoNum(1, 5, 5);
    expect(nums(COUNTIFS([cat, crit('obra'), cant, crit('>3')], 1))).toEqual([1]);
  });
});

describe('AVERAGEIF y AVERAGEIFS', () => {
  it('PROMEDIO.SI promedia solo lo que coincide', () => {
    expect(nums(AVERAGEIF([rangoNum(10, 20, 30), crit('>15')], 1))).toEqual([25]);
  });

  it('PROMEDIO.SI.CONJUNTO con dos criterios', () => {
    const valores = rangoNum(100, 200, 300);
    const cat = rangoTxt('a', 'a', 'b');
    const cant = rangoNum(1, 9, 9);
    expect(nums(AVERAGEIFS([valores, cat, crit('a'), cant, crit('>5')], 1))).toEqual([200]);
  });

  it('sin ninguna coincidencia da #¡DIV/0!, no 0', () => {
    expect(errorDe(AVERAGEIF([rangoNum(1, 2, 3), crit('>100')], 1))).toBe('#DIV/0!');
  });
});

describe('criterios que dependen de la simulación', () => {
  it('un criterio que cambia por iteración se reevalúa en cada una', () => {
    // El criterio es una columna numérica distinta en cada iteración: el
    // conjunto de coincidencias no se puede precalcular.
    const umbral = argValor(vectorNumerico(Float64Array.from([1, 2, 3])));
    const rango = argRango([
      numeroConstante(1, 3),
      numeroConstante(2, 3),
      numeroConstante(3, 3),
    ]);
    expect(nums(COUNTIF([rango, umbral], 3))).toEqual([1, 1, 1]);
  });

  it('el rango objetivo puede variar aunque el criterio sea fijo', () => {
    const categorias = rangoTxt('a', 'b');
    const costes = argRango([
      vectorNumerico(Float64Array.from([10, 20, 30])),
      vectorNumerico(Float64Array.from([1, 1, 1])),
    ]);
    expect(nums(SUMIF([categorias, crit('a'), costes], 3))).toEqual([10, 20, 30]);
  });
});

describe('integración: desde la fórmula escrita', () => {
  const H = 'Hoja1';
  const k = (ref: string) => claveDeReferencia(H, ref);

  function grafoDe(formulas: Record<string, string>) {
    const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
      const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
      const col = [...(m[1] as string)].reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0);
      return { hoja: H, col, fila: Number(m[2]), formula };
    });
    return construirGrafo(celdas).grafo;
  }

  it('SUMAR.SI.CONJUNTO escrito como en una hoja real', () => {
    const g = grafoDe({
      A1: '"obra"', A2: '"obra"', A3: '"suministro"',
      B1: '100', B2: '200', B3: '300',
      D1: 'SUMIFS(B1:B3,A1:A3,"obra")',
    });
    const r = evaluarModelo(g, new Map(), [k('D1')], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('D1')))).toEqual([300]);
  });

  it('CONTAR.SI con un criterio que referencia otra celda', () => {
    const g = grafoDe({
      A1: '5', A2: '15', A3: '25',
      C1: '">10"',
      D1: 'COUNTIF(A1:A3,C1)',
    });
    const r = evaluarModelo(g, new Map(), [k('D1')], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('D1')))).toEqual([2]);
  });
});
