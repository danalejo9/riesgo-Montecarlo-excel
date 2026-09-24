import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import {
  CHOOSE, HLOOKUP, INDEX, MATCH, VLOOKUP, XLOOKUP, XMATCH,
} from '../../engine/functions/busquedas.ts';
import { argRango, argValor, type Argumento } from '../../engine/functions/types.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  errorEn, numeroConstante, textoConstante, textoEn, tipoEn, vectorNumerico,
  ERROR, type Columna,
} from '../../engine/values/columna.ts';
import { nums } from '../helpers/valores.ts';

const num = (x: number): Argumento => argValor(numeroConstante(x, 1));
const txt = (s: string): Argumento => argValor(textoConstante(s, 1));

/**
 * Una tabla se escribe aquí **por filas**, que es como se ve en la hoja, y se
 * aplana por columnas, que es como la recibe el motor. Hacerlo a mano en cada
 * test es la forma segura de transponerla sin querer.
 */
function tabla(filas: (number | string)[][]): Argumento {
  const nFilas = filas.length;
  const nCols = (filas[0] as (number | string)[]).length;
  const columnas: Columna[] = [];
  for (let c = 0; c < nCols; c++) {
    for (let f = 0; f < nFilas; f++) {
      const v = (filas[f] as (number | string)[])[c];
      columnas.push(typeof v === 'number' ? numeroConstante(v, 1) : textoConstante(String(v), 1));
    }
  }
  return argRango(columnas, { filas: nFilas, cols: nCols });
}

function errorDe(c: Columna): string | undefined {
  return tipoEn(c, 0) === ERROR ? errorEn(c, 0) : undefined;
}

// Una tabla de tarifas como la de cualquier presupuesto: tramos ordenados.
const TARIFAS = tabla([
  [0, 'básico', 10],
  [100, 'medio', 8],
  [500, 'alto', 6],
  [1000, 'premium', 5],
]);

describe('BUSCARV', () => {
  it('coincidencia aproximada: el mayor tramo que no supera al buscado', () => {
    // 250 cae en el tramo que empieza en 100.
    expect(nums(VLOOKUP([num(250), TARIFAS, num(3)], 1))).toEqual([8]);
    // La columna 2 es texto: se devuelve el texto, no un número.
    expect(textoEn(VLOOKUP([num(250), TARIFAS, num(2)], 1), 0)).toBe('medio');
  });

  it('el modo aproximado es el predeterminado, como en Excel', () => {
    // Sin cuarto argumento debe comportarse igual que con VERDADERO. Es la
    // trampa clásica de esta función y por eso tiene test propio.
    expect(nums(VLOOKUP([num(700), TARIFAS, num(3)], 1)))
      .toEqual(nums(VLOOKUP([num(700), TARIFAS, num(3), num(1)], 1)));
    expect(nums(VLOOKUP([num(700), TARIFAS, num(3)], 1))).toEqual([6]);
  });

  it('un valor por debajo del primer tramo es #N/A', () => {
    expect(errorDe(VLOOKUP([num(-5), TARIFAS, num(3)], 1))).toBe('#N/A');
  });

  it('coincidencia exacta encuentra y falla cuando toca', () => {
    expect(nums(VLOOKUP([num(500), TARIFAS, num(3), num(0)], 1))).toEqual([6]);
    expect(errorDe(VLOOKUP([num(250), TARIFAS, num(3), num(0)], 1))).toBe('#N/A');
  });

  it('busca texto sin distinguir mayúsculas y admite comodines', () => {
    const catalogo = tabla([
      ['cemento gris', 120],
      ['acero', 300],
      ['arena', 45],
    ]);
    expect(nums(VLOOKUP([txt('ACERO'), catalogo, num(2), num(0)], 1))).toEqual([300]);
    expect(nums(VLOOKUP([txt('cem*'), catalogo, num(2), num(0)], 1))).toEqual([120]);
  });

  it('un índice de columna fuera de la tabla es #¡REF!, y menor que 1 es #¡VALOR!', () => {
    expect(errorDe(VLOOKUP([num(250), TARIFAS, num(9)], 1))).toBe('#REF!');
    expect(errorDe(VLOOKUP([num(250), TARIFAS, num(0)], 1))).toBe('#VALUE!');
  });
});

describe('BUSCARH', () => {
  it('busca por la primera fila en vez de por la primera columna', () => {
    const horizontal = tabla([
      [1, 2, 3],
      [10, 20, 30],
    ]);
    expect(nums(HLOOKUP([num(2), horizontal, num(2), num(0)], 1))).toEqual([20]);
  });
});

describe('INDICE', () => {
  it('devuelve la celda de la fila y columna pedidas, empezando en 1', () => {
    expect(nums(INDEX([TARIFAS, num(3), num(3)], 1))).toEqual([6]);
    expect(textoEn(INDEX([TARIFAS, num(1), num(2)], 1), 0)).toBe('básico');
  });

  it('con un solo índice sobre una columna, ese índice es la fila', () => {
    const columna = tabla([[10], [20], [30]]);
    expect(nums(INDEX([columna, num(2)], 1))).toEqual([20]);
  });

  it('fuera de rango es #¡REF!', () => {
    expect(errorDe(INDEX([TARIFAS, num(99), num(1)], 1))).toBe('#REF!');
  });
});

describe('COINCIDIR', () => {
  const lista = argRango([10, 20, 30, 40].map((v) => numeroConstante(v, 1)));

  it('tipo 0: posición exacta, empezando en 1', () => {
    expect(nums(MATCH([num(30), lista, num(0)], 1))).toEqual([3]);
    expect(errorDe(MATCH([num(35), lista, num(0)], 1))).toBe('#N/A');
  });

  it('tipo 1 (predeterminado): el mayor valor que no supera al buscado', () => {
    expect(nums(MATCH([num(35), lista], 1))).toEqual([3]);
    expect(nums(MATCH([num(35), lista, num(1)], 1))).toEqual([3]);
  });

  it('tipo -1: el menor valor que no baja del buscado, en lista descendente', () => {
    const desc = argRango([40, 30, 20, 10].map((v) => numeroConstante(v, 1)));
    expect(nums(MATCH([num(25), desc, num(-1)], 1))).toEqual([2]);
  });
});

describe('BUSCARX', () => {
  const claves = argRango(['a', 'b', 'c'].map((s) => textoConstante(s, 1)));
  const valores = argRango([1, 2, 3].map((v) => numeroConstante(v, 1)));

  it('por omisión busca coincidencia exacta, al revés que BUSCARV', () => {
    expect(nums(XLOOKUP([txt('b'), claves, valores], 1))).toEqual([2]);
    expect(errorDe(XLOOKUP([txt('z'), claves, valores], 1))).toBe('#N/A');
  });

  it('acepta un valor para cuando no encuentra', () => {
    expect(nums(XLOOKUP([txt('z'), claves, valores, num(-1)], 1))).toEqual([-1]);
    expect(textoEn(XLOOKUP([txt('z'), claves, valores, txt('sin dato')], 1), 0)).toBe('sin dato');
  });

  it('busca de atrás hacia delante cuando se le pide', () => {
    const repetidas = argRango(['a', 'b', 'a'].map((s) => textoConstante(s, 1)));
    const pesos = argRango([10, 20, 30].map((v) => numeroConstante(v, 1)));
    expect(nums(XLOOKUP([txt('a'), repetidas, pesos], 1))).toEqual([10]);
    expect(nums(XLOOKUP([txt('a'), repetidas, pesos, num(0), num(0), num(-1)], 1))).toEqual([30]);
  });

  it('rangos de distinto tamaño dan #¡VALOR!', () => {
    expect(errorDe(XLOOKUP([txt('a'), claves, argRango([numeroConstante(1, 1)])], 1))).toBe('#VALUE!');
  });
});

describe('COINCIDIRX y ELEGIR', () => {
  it('COINCIDIRX devuelve la posición con coincidencia exacta por omisión', () => {
    const lista = argRango(['x', 'y', 'z'].map((s) => textoConstante(s, 1)));
    expect(nums(XMATCH([txt('y'), lista], 1))).toEqual([2]);
  });

  it('ELEGIR selecciona por índice, empezando en 1', () => {
    expect(nums(CHOOSE([num(2), num(10), num(20), num(30)], 1))).toEqual([20]);
    expect(textoEn(CHOOSE([num(1), txt('uno'), txt('dos')], 1), 0)).toBe('uno');
    expect(errorDe(CHOOSE([num(5), num(10), num(20)], 1))).toBe('#VALUE!');
  });
});

describe('el valor buscado puede variar en cada iteración', () => {
  it('BUSCARV se reevalúa por iteración cuando la entrada es una muestra', () => {
    // Es el caso real de una simulación: la tabla es fija y lo que se busca
    // depende de una variable de entrada.
    const cantidades = argValor(vectorNumerico(Float64Array.from([50, 250, 1200])));
    // Todas las columnas tienen que tener la longitud del número de
    // iteraciones, incluidas las constantes: es lo que hace el compilador al
    // difundir una celda constante, y aquí hay que reproducirlo a mano.
    const tarifas = argRango(
      [0, 100, 500, 1000].map((v) => numeroConstante(v, 3))
        .concat([10, 8, 6, 5].map((v) => numeroConstante(v, 3))),
      { filas: 4, cols: 2 },
    );
    const columnaDos = argValor(numeroConstante(2, 3));
    expect(nums(VLOOKUP([cantidades, tarifas, columnaDos], 3))).toEqual([10, 8, 5]);
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

  it('BUSCARV sobre un rango escrito en la hoja', () => {
    const g = grafoDe({
      A1: '0', B1: '10',
      A2: '100', B2: '8',
      A3: '500', B3: '6',
      D1: 'VLOOKUP(250,A1:B3,2)',
    });
    const r = evaluarModelo(g, new Map(), [k('D1')], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('D1')))).toEqual([8]);
  });

  it('INDICE y COINCIDIR combinados, el patrón habitual', () => {
    const g = grafoDe({
      A1: '"acero"', A2: '"cemento"', A3: '"arena"',
      B1: '300', B2: '120', B3: '45',
      D1: 'INDEX(B1:B3,MATCH("cemento",A1:A3,0))',
    });
    const r = evaluarModelo(g, new Map(), [k('D1')], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(nums(r.valores.get(k('D1')))).toEqual([120]);
  });
});
