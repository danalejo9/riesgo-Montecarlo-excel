import { describe, expect, it } from 'vitest';

import {
  claveDeReferencia,
  clausuraDependencias,
  clausuraDependientes,
  construirGrafo,
  ordenarTopologicamente,
  subgrafoRelevante,
  type FormulaCelda,
} from '../../engine/graph/index.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref) as RegExpExecArray;
    const col = [...m[1] as string].reduce((n, c) => n * 26 + (c.toUpperCase().charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

describe('construirGrafo', () => {
  it('crea un nodo por cada celda con fórmula', () => {
    const g = grafoDe({ A1: '10', B1: 'A1*2' });
    expect(g.nodos.has(k('A1'))).toBe(true);
    expect(g.nodos.has(k('B1'))).toBe(true);
    expect(g.nodos.get(k('A1'))?.ast?.tipo).toBe('numero');
  });

  it('crea también un nodo, sin AST, para una celda solo referenciada (constante o valor)', () => {
    // A1 no aparece en la lista de fórmulas: es una entrada con valor puro.
    // El ejecutor necesita un nodo para ella igualmente, para saber que
    // existe y que hay que leer su valor en vez de calcularla.
    const { grafo } = construirGrafo([{ hoja: H, col: 2, fila: 1, formula: 'A1*2' }]);
    expect(grafo.nodos.has(k('A1'))).toBe(true);
    expect(grafo.nodos.get(k('A1'))?.ast).toBeUndefined();
  });

  it('registra la dependencia en ambos sentidos', () => {
    const g = grafoDe({ A1: '1', B1: 'A1*2' });
    expect(g.dependencias.get(k('B1'))?.has(k('A1'))).toBe(true);
    expect(g.dependientes.get(k('A1'))?.has(k('B1'))).toBe(true);
  });

  it('expande un rango en una arista por celda', () => {
    const g = grafoDe({ A1: '1', A2: '2', A3: '3', B1: 'SUM(A1:A3)' });
    const deps = g.dependencias.get(k('B1')) as Set<string>;
    expect(deps.has(k('A1'))).toBe(true);
    expect(deps.has(k('A2'))).toBe(true);
    expect(deps.has(k('A3'))).toBe(true);
    expect(deps.size).toBe(3);
  });

  it('no crea una autorreferencia como dependencia', () => {
    // Caso degenerado (=A1 en A1); no debe aparecer como arista real.
    const g = grafoDe({ A1: 'A1' });
    expect(g.dependencias.get(k('A1'))?.has(k('A1'))).toBe(false);
  });

  it('cuenta los rangos abiertos como no expandidos', () => {
    const { rangosNoExpandidos } = construirGrafo([
      { hoja: H, col: 2, fila: 1, formula: 'SUM(A:A)' },
    ]);
    expect(rangosNoExpandidos).toBe(1);
  });

  it('registra el error de parseo en el nodo sin tumbar el resto del grafo', () => {
    const g = grafoDe({ A1: '1+', B1: 'A1*2' });
    expect(g.nodos.get(k('A1'))?.errorParseo?.mensaje).toMatch(/termina antes de tiempo/);
    // B1 se procesó igual, aunque su referencia (A1) tenga un error de parseo.
    expect(g.dependencias.get(k('B1'))?.has(k('A1'))).toBe(true);
  });

  it('sigue referencias a otra hoja', () => {
    const celdas: FormulaCelda[] = [
      { hoja: 'Datos', col: 1, fila: 1, formula: '10' },
      { hoja: H, col: 1, fila: 1, formula: 'Datos!A1*2' },
    ];
    const { grafo } = construirGrafo(celdas);
    expect(grafo.dependencias.get(k('A1'))?.has(claveDeReferencia('Datos', 'A1'))).toBe(true);
  });
});

describe('ordenarTopologicamente', () => {
  it('coloca cada celda después de sus dependencias', () => {
    const g = grafoDe({ A1: '1', B1: 'A1*2', C1: 'B1+1' });
    const { orden, enCiclo } = ordenarTopologicamente(g);
    expect(enCiclo.size).toBe(0);
    expect(orden.indexOf(k('A1'))).toBeLessThan(orden.indexOf(k('B1')));
    expect(orden.indexOf(k('B1'))).toBeLessThan(orden.indexOf(k('C1')));
  });

  it('detecta un ciclo directo y marca las celdas implicadas', () => {
    const g = grafoDe({ A1: 'B1+1', B1: 'A1+1' });
    const { enCiclo } = ordenarTopologicamente(g);
    expect(enCiclo.has(k('A1'))).toBe(true);
    expect(enCiclo.has(k('B1'))).toBe(true);
  });

  it('detecta un ciclo indirecto de tres celdas', () => {
    const g = grafoDe({ A1: 'B1+1', B1: 'C1+1', C1: 'A1+1' });
    const { enCiclo } = ordenarTopologicamente(g);
    expect(enCiclo.has(k('A1'))).toBe(true);
    expect(enCiclo.has(k('B1'))).toBe(true);
    expect(enCiclo.has(k('C1'))).toBe(true);
  });

  it('no marca como ciclo una celda que se referencia dos veces sin bucle', () => {
    // C1 depende de A1 y B1, y B1 depende de A1: en diamante, no es un ciclo.
    const g = grafoDe({ A1: '1', B1: 'A1*2', C1: 'A1+B1' });
    const { enCiclo, orden } = ordenarTopologicamente(g);
    expect(enCiclo.size).toBe(0);
    expect(orden.indexOf(k('A1'))).toBeLessThan(orden.indexOf(k('C1')));
    expect(orden.indexOf(k('B1'))).toBeLessThan(orden.indexOf(k('C1')));
  });

  it('aguanta una cadena larga sin desbordar la pila', () => {
    const formulas: Record<string, string> = { A1: '1' };
    for (let f = 2; f <= 20000; f++) formulas[`A${f}`] = `A${f - 1}*1.01`;
    const g = grafoDe(formulas);
    const { orden, enCiclo } = ordenarTopologicamente(g);
    expect(enCiclo.size).toBe(0);
    expect(orden.indexOf(k('A1'))).toBeLessThan(orden.indexOf(k('A20000')));
  });

  it('puede restringirse a un subconjunto de raíces', () => {
    const g = grafoDe({ A1: '1', B1: 'A1*2', X1: '99' });
    const { orden } = ordenarTopologicamente(g, [k('B1')]);
    expect(orden).toContain(k('A1'));
    expect(orden).toContain(k('B1'));
    expect(orden).not.toContain(k('X1'));
  });
});

describe('clausuras', () => {
  it('clausuraDependencias trae todo lo necesario para calcular la raíz', () => {
    const g = grafoDe({ A1: '1', B1: 'A1*2', C1: 'B1+1', X1: '99' });
    const c = clausuraDependencias(g, [k('C1')]);
    expect(c).toEqual(new Set([k('C1'), k('B1'), k('A1')]));
  });

  it('clausuraDependientes trae todo lo que se ve afectado por la raíz', () => {
    const g = grafoDe({ A1: '1', B1: 'A1*2', C1: 'B1+1', X1: '99' });
    const c = clausuraDependientes(g, [k('A1')]);
    expect(c).toEqual(new Set([k('A1'), k('B1'), k('C1')]));
  });
});

describe('subgrafoRelevante', () => {
  it('incluye solo lo que está en el camino entrada -> salida', () => {
    // A1 = tarifa constante, no afectada por la entrada.
    // A2 = cantidad, la entrada incierta.
    // A3 = subtotal = A2*A1, A4 = impuesto, A5 = total (la salida).
    // A6 = celda sin ninguna relación con el resto.
    const g = grafoDe({
      A1: '950',
      A2: '10',
      A3: 'A2*A1',
      A4: 'A3*0.19',
      A5: 'A4+A3',
      A6: '123',
    });
    const rel = subgrafoRelevante(g, [k('A2')], [k('A5')]);

    expect(rel.has(k('A2'))).toBe(true);
    expect(rel.has(k('A3'))).toBe(true);
    expect(rel.has(k('A4'))).toBe(true);
    expect(rel.has(k('A5'))).toBe(true);
    // A1 (la tarifa) participa en el cálculo pero no depende de la entrada:
    // no forma parte del subgrafo entrada->salida (es constante para el motor).
    expect(rel.has(k('A1'))).toBe(false);
    expect(rel.has(k('A6'))).toBe(false);
  });

  it('una salida que no depende de ninguna entrada no aparece en el subgrafo', () => {
    const g = grafoDe({
      A1: '5',   // entrada
      A2: '42',  // salida, pero no depende de A1
    });
    const rel = subgrafoRelevante(g, [k('A1')], [k('A2')]);
    expect(rel.has(k('A2'))).toBe(false);
    expect(rel.has(k('A1'))).toBe(false);
  });

  it('varias entradas y varias salidas', () => {
    const g = grafoDe({
      A1: '1',        // entrada 1
      A2: '2',        // entrada 2
      A3: 'A1*2',     // intermedia de A1
      A4: 'A2*3',     // intermedia de A2
      A5: 'A3+A4',    // salida 1
      A6: 'A4-1',     // salida 2
    });
    const rel = subgrafoRelevante(g, [k('A1'), k('A2')], [k('A5'), k('A6')]);
    expect(rel.has(k('A1'))).toBe(true);
    expect(rel.has(k('A2'))).toBe(true);
    expect(rel.has(k('A3'))).toBe(true);
    expect(rel.has(k('A4'))).toBe(true);
    expect(rel.has(k('A5'))).toBe(true);
    expect(rel.has(k('A6'))).toBe(true);
  });

  it('una entrada que es directamente la salida', () => {
    const g = grafoDe({ A1: '5' });
    const rel = subgrafoRelevante(g, [k('A1')], [k('A1')]);
    expect(rel.has(k('A1'))).toBe(true);
  });
});
