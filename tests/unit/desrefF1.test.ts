/**
 * F1: DESREF con desplazamientos constantes es una referencia fija.
 */
import { describe, expect, it } from 'vitest';

import { claveDeReferencia, construirGrafo } from '../../engine/graph/index.ts';
import { elegirMotor } from '../../engine/modelo/index.ts';
import { parsear } from '../../engine/parser/parse.ts';
import { resolverDesrefConstantes } from '../../engine/parser/desref.ts';
import { NUMERO } from '../../engine/values/columna.ts';

const H = 'Hoja1';
const k = (r: string) => claveDeReferencia(H, r);
const ast = (f: string) => {
  const r = parsear(f);
  if (!r.ok) throw new Error(r.error.mensaje);
  return resolverDesrefConstantes(r.ast);
};

describe('resolverDesrefConstantes', () => {
  it('celda desplazada, rango con alto y ancho, y rango base', () => {
    expect(ast('OFFSET(A1,2,1)')).toMatchObject({ tipo: 'celda', ref: { col: 2, fila: 3 } });
    expect(ast('OFFSET(A1,0,0,3,1)')).toMatchObject({ tipo: 'rango', ref: { col1: 1, fila1: 1, col2: 1, fila2: 3 } });
    expect(ast('OFFSET(B2:C3,1,-1)')).toMatchObject({ tipo: 'rango', ref: { col1: 1, fila1: 3, col2: 2, fila2: 4 } });
    expect(ast("OFFSET(Datos!A1,1,0)")).toMatchObject({ tipo: 'celda', ref: { hoja: 'Datos', col: 1, fila: 2 } });
  });

  it('dentro de otras funciones; fuera de la hoja, #¡REF!; con desplazamiento calculado, se queda', () => {
    expect(ast('SUM(OFFSET(A1,0,0,3,1))')).toMatchObject({ tipo: 'funcion', args: [{ tipo: 'rango' }] });
    expect(ast('OFFSET(A1,-1,0)')).toMatchObject({ tipo: 'error', valor: '#REF!' });
    expect(ast('OFFSET(A1,B1,0)')).toMatchObject({ tipo: 'funcion', nombre: 'OFFSET' });
  });
});

describe('en el grafo', () => {
  it('las dependencias son exactas y el motor rápido puede con ello', () => {
    const { grafo } = construirGrafo(
      [{ hoja: H, col: 3, fila: 1, formula: 'SUM(OFFSET(A1,0,0,3,1))' }],
      [1, 2, 3].map((fila) => ({ hoja: H, col: 1, fila, valor: { tipo: NUMERO, numero: fila } })),
    );
    expect([...(grafo.dependencias.get(k('C1')) ?? [])].sort()).toEqual([k('A1'), k('A2'), k('A3')]);
    expect(elegirMotor(grafo, [k('A1')], [k('C1')]).motor).toBe('fast');
  });
});
