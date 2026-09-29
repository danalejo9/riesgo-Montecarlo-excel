/**
 * T9: opciones de decisión. Leer `RIESGO.DECISION`, combinar varias, fijar
 * cada opción en el grafo, y que la simulación con cada una use los mismos
 * números aleatorios.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { NUMERO, TEXTO } from '../../engine/values/columna.ts';
import { combinaciones, etiquetaCombinacion, fijarCombinacion, leerDecisiones, MAX_COMBINACIONES } from '../../excel/decisiones.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);
function posicion(ref: string) {
  const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
  return { col: (m[1] as string).charCodeAt(0) - 64, fila: Number(m[2]) };
}
function libro(formulas: Record<string, string>, valores: Record<string, number | string> = {}) {
  const f: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => ({ hoja: H, ...posicion(ref), formula }));
  const v: ValorCelda[] = Object.entries(valores).map(([ref, x]) => ({
    hoja: H, ...posicion(ref), valor: typeof x === 'number' ? { tipo: NUMERO, numero: x } : { tipo: TEXTO, texto: x },
  }));
  return { formulas: f, grafo: construirGrafo(f, v).grafo };
}

describe('leer las decisiones', () => {
  it('opciones escritas, en una lista {…} o en un rango', () => {
    const { grafo } = libro({
      B1: 'RIESGO.DECISION("Proveedor A","Proveedor B","Proveedor C")',
      B2: 'RIESGO.DECISION({0.6,0.7,0.8})',
      B3: 'RIESGO.DECISION(D1:D3)',
    }, { D1: 10, D2: 'veinte', D3: 30 });
    const r = leerDecisiones(grafo);
    expect(r.errores).toEqual([expect.stringMatching(/27 combinaciones/)]);
    expect(r.decisiones.map((d) => d.opciones)).toEqual([
      ['Proveedor A', 'Proveedor B', 'Proveedor C'],
      [0.6, 0.7, 0.8],
      [10, 'veinte', 30],
    ]);
    expect(MAX_COMBINACIONES).toBe(16);
  });

  it('errores: dentro de una operación, una sola opción, opciones con fórmulas', () => {
    const { grafo } = libro({ B1: '1+RIESGO.DECISION(1,2)', B2: 'RIESGO.DECISION(5)', B3: 'RIESGO.DECISION(D1:D2)', D1: '2*3' }, { D2: 4 });
    const errores = leerDecisiones(grafo).errores.sort();
    expect(errores).toEqual([
      'Hoja1!B1: RIESGO.DECISION tiene que ser toda la fórmula de la celda',
      'Hoja1!B2: RIESGO.DECISION necesita al menos 2 opciones',
      'Hoja1!B3: las celdas del rango de RIESGO.DECISION tienen que tener valores escritos, no fórmulas',
    ]);
  });

  it('combinaciones, la primera es la de la hoja; y su etiqueta', () => {
    const { grafo } = libro({ B1: 'RIESGO.DECISION("A","B")', B2: 'RIESGO.DECISION(0.6,0.7,0.8)' });
    const { decisiones } = leerDecisiones(grafo);
    const c = combinaciones(decisiones);
    expect(c).toEqual([[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
    expect(etiquetaCombinacion(decisiones, [1, 2])).toBe('B · 0,8');
  });
});

describe('simular cada opción', () => {
  it('la misma semilla: cada opción escala exactamente la misma muestra', async () => {
    const { formulas, grafo } = libro({ A1: 'RIESGO.NORMAL(100,10)', B1: 'RIESGO.DECISION(1,1.5,2)', C1: 'A1*B1' });
    const { decisiones } = leerDecisiones(grafo);
    const medias: number[] = [];
    for (const combo of combinaciones(decisiones)) {
      fijarCombinacion(grafo, decisiones, combo);
      const d = entradasDeFunciones(formulas, grafo, [], [k('C1')]);
      aplicarReescrituras(grafo, d);
      const base = modeloVacio();
      const modelo = { ...base, inputs: d.entradas, outputs: [{ id: 's', name: 'C', ref: 'C1' }], settings: { ...base.settings, iterations: 5000, seed: 9 } };
      const p = prepararEntradas(modelo, resolverConFunciones((ref) => k(ref), d), 9);
      if (!p.ok) throw new Error(p.errores.join('; '));
      const c = compilarPlan(grafo, new Set(d.claves), [k('C1')]);
      if (!c.ok) throw new Error(c.error.motivo);
      const r = await simularPorBloques(grafo, c.plan, p.entradas, 9, 5000);
      if (!r.ok) throw new Error(r.error.motivo);
      medias.push((r.porSalida.get(k('C1'))?.welford as { media: number }).media);
    }
    expect(medias[1]).toBeCloseTo((medias[0] as number) * 1.5, 9);
    expect(medias[2]).toBeCloseTo((medias[0] as number) * 2, 9);
  });
});

describe('en Excel', () => {
  type Funcion = (...args: unknown[]) => unknown;
  const registradas = new Map<string, Funcion>();
  beforeAll(async () => {
    (globalThis as unknown as { CustomFunctions: unknown }).CustomFunctions = {
      associate: (id: string, f: Funcion) => registradas.set(id, f),
      Error: class extends Error {},
      ErrorCode: { invalidNumber: '#NUM!', invalidName: '#NAME?', invalidValue: '#VALUE!', notAvailable: '#N/A' },
    };
    await import('../../ui/funciones.ts');
  });

  it('RIESGO.DECISION vale su primera opción', () => {
    expect(registradas.get('DECISION')?.([[['Proveedor A']], [['Proveedor B']]])).toBe('Proveedor A');
    expect(registradas.get('DECISION')?.([[['', 0.7], [0.8, 0.9]]])).toBe(0.7);
    expect(() => registradas.get('DECISION')?.([[['']]])).toThrow();
  });
});

describe('solo las decisiones que afectan a las salidas', () => {
  it('una DECISION que no toca ninguna salida no multiplica la simulación', () => {
    const { grafo } = libro({ A1: 'RIESGO.NORMAL(100,10)', B1: 'RIESGO.DECISION(1,2)', C1: 'A1*2', D1: 'A1*B1' });
    expect(leerDecisiones(grafo, [k('C1')]).decisiones).toEqual([]);
    expect(leerDecisiones(grafo, [k('D1')]).decisiones.map((d) => d.clave)).toEqual([k('B1')]);
  });
});
