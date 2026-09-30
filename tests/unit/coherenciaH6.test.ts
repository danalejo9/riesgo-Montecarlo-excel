/**
 * H6 y H7: avisos de coherencia y trazado de dependencias.
 */
import { describe, expect, it } from 'vitest';

import { claveDeReferencia, construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import type { EntradaRiskModel } from '../../engine/modelo/index.ts';
import { NUMERO } from '../../engine/values/columna.ts';
import { avisosDeCoherencia, trazarDependencias } from '../../excel/coherencia.ts';

const H = 'Hoja1';
const k = (r: string) => claveDeReferencia(H, r);
const pos = (r: string) => ({ col: r.charCodeAt(0) - 64, fila: Number(r.slice(1)) });

function libro(formulas: Record<string, string>, valores: Record<string, number>) {
  const f: FormulaCelda[] = Object.entries(formulas).map(([r, formula]) => ({ hoja: H, ...pos(r), formula }));
  const v: ValorCelda[] = Object.entries(valores).map(([r, x]) => ({ hoja: H, ...pos(r), valor: { tipo: NUMERO, numero: x } }));
  return construirGrafo(f, v).grafo;
}

const entrada = (id: string, ref: string, dist: EntradaRiskModel['dist']): EntradaRiskModel => ({ id, name: id, ref, dist, correlations: [] });

describe('avisos de coherencia', () => {
  const grafo = libro({ C1: 'A1*A2', C2: 'C1-100' }, { A1: 50, A2: 10, A3: 7 });
  const entradas = [
    entrada('Unidades', 'A1', { type: 'normal', mean: 50, stdDev: 30 }),
    entrada('Precio', 'A2', { type: 'triangular', min: 9, mode: 10, max: 12 }),
    entrada('Suelta', 'A3', { type: 'uniform', min: 1, max: 2 }),
  ];
  const avisos = avisosDeCoherencia(grafo, entradas, ['A1', 'A2', 'A3'].map(k), [k('C2')], (c) => c);

  it('una entrada que no llega a ninguna salida', () => {
    expect(avisos.some((a) => a.includes('«Suelta»') && a.includes('no afecta a ninguna salida'))).toBe(true);
  });

  it('una normal ancha en una celda positiva: negativos (el 4,8 % de las veces)', () => {
    const a = avisos.find((x) => x.includes('«Unidades»'));
    expect(a).toMatch(/negativos el 4,8 %/);
    expect(avisos.some((x) => x.includes('«Precio»'))).toBe(false);
  });
});

describe('trazado de dependencias', () => {
  it('el camino más corto de cada entrada a cada salida', () => {
    const grafo = libro({ B1: 'A1*2', B2: 'B1+A2', C1: 'B2*3', C2: 'A2' }, { A1: 1, A2: 2, A3: 3 });
    const t = trazarDependencias(
      grafo,
      [entrada('X', 'A1', { type: 'uniform', min: 0, max: 1 }), entrada('Y', 'A2', { type: 'uniform', min: 0, max: 1 }), entrada('Z', 'A3', { type: 'uniform', min: 0, max: 1 })],
      ['A1', 'A2', 'A3'].map(k),
      [{ nombre: 'Total', clave: k('C1') }, { nombre: 'Otra', clave: k('C2') }],
      (c) => c.replace('Hoja1!', ''),
    );
    expect(t[0]).toEqual({ entrada: 'X', salidas: [{ salida: 'Total', camino: ['A1', 'B1', 'B2', 'C1'] }] });
    expect(t[1]?.salidas).toEqual([{ salida: 'Total', camino: ['A2', 'B2', 'C1'] }, { salida: 'Otra', camino: ['A2', 'C2'] }]);
    expect(t[2]?.salidas).toEqual([]);
  });
});
