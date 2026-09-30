/**
 * T8: registro de riesgos. `RIESGO.EVENTO(p; impacto)` se expande a
 * BERNOULLI × impacto, se simula, y el registro da el valor esperado.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { NUMERO, TEXTO } from '../../engine/values/columna.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { registroDeRiesgos } from '../../excel/registroRiesgos.ts';
import { indiceDeTextos } from '../../excel/nombreSugerido.ts';

const H = 'Riesgos';
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
  const textos = indiceDeTextos(Object.entries(valores).map(([ref, x]) => ({ hoja: H, ...posicion(ref), ...(typeof x === 'number' ? { tipo: 'numero' as const, numero: x } : { tipo: 'texto' as const, texto: x }) })));
  return { formulas: f, grafo: construirGrafo(f, v).grafo, nombrar: textos.nombre };
}

const REGISTRO = {
  formulas: {
    B2: 'RIESGO.EVENTO(0.3,RIESGO.TRIANGULAR(10,20,60))',
    B3: 'RIESGO.EVENTO(0.1,500)',
    B4: 'RIESGO.EVENTO(0.5,B7)',
    B5: 'SUM(B2:B4)+1000',
  },
  valores: { A2: 'Retraso de permisos', A3: 'Avería grave', A4: 'Subida de precios', A5: 'Coste total', B7: 40 } as Record<string, number | string>,
};

describe('RIESGO.EVENTO', () => {
  it('se expande a BERNOULLI × impacto, con entradas «ocurre» e «impacto»', () => {
    const { formulas, grafo, nombrar } = libro(REGISTRO.formulas, REGISTRO.valores);
    const d = entradasDeFunciones(formulas, grafo, [], [k('B5')], nombrar);
    expect(d.errores).toEqual([]);
    expect(d.eventos.sort()).toEqual([k('B2'), k('B3'), k('B4')]);
    expect(d.entradas.map((e) => [e.name, e.dist.type])).toEqual(expect.arrayContaining([
      ['Retraso de permisos (ocurre)', 'bernoulli'],
      ['Retraso de permisos (impacto)', 'triangular'],
      ['Avería grave (ocurre)', 'bernoulli'],
    ]));
  });

  it('mal escrita, un error que lo dice', () => {
    const { formulas, grafo } = libro({ B2: 'RIESGO.EVENTO(0.3)', B5: 'B2' });
    const d = entradasDeFunciones(formulas, grafo, [], [k('B5')]);
    expect(d.errores[0]).toMatch(/RIESGO.EVENTO necesita 2 argumentos/);
  });

  it('el registro: probabilidad, impacto y valor esperado, de más a menos', () => {
    const { formulas, grafo, nombrar } = libro(REGISTRO.formulas, REGISTRO.valores);
    const d = entradasDeFunciones(formulas, grafo, [], [k('B5')], nombrar);
    const r = registroDeRiesgos(d, grafo, (c) => c);
    expect(r.map((f) => f.nombre)).toEqual(['Avería grave', 'Subida de precios', 'Retraso de permisos']);
    const [averia, subida, retraso] = r;
    expect(averia).toMatchObject({ probabilidad: 0.1, impacto: '500', impactoMedio: 500, valorEsperado: 50 });
    // σ de p·500 con p = 0,1: 500·√(0,1·0,9) = 150.
    expect(averia?.desviacion).toBeCloseTo(150, 9);
    expect(subida).toMatchObject({ probabilidad: 0.5, valorEsperado: 20 });
    expect(retraso?.impactoMedio).toBeCloseTo(30, 9);
    expect(retraso?.valorEsperado).toBeCloseTo(9, 9);
  });

  it('simulado, la media del total es 1000 + la suma de los valores esperados (1.079)', async () => {
    const { formulas, grafo, nombrar } = libro(REGISTRO.formulas, REGISTRO.valores);
    const d = entradasDeFunciones(formulas, grafo, [], [k('B5')], nombrar);
    aplicarReescrituras(grafo, d);
    const base = modeloVacio();
    const n = 40_000;
    const modelo = { ...base, inputs: d.entradas, outputs: [{ id: 's', name: 'Total', ref: 'B5' }], settings: { ...base.settings, iterations: n, seed: 3 } };
    const p = prepararEntradas(modelo, resolverConFunciones((ref) => k(ref), d), 3);
    if (!p.ok) throw new Error(p.errores.join('; '));
    const c = compilarPlan(grafo, new Set(d.claves), [k('B5')]);
    if (!c.ok) throw new Error(c.error.motivo);
    const r = await simularPorBloques(grafo, c.plan, p.entradas, 3, n);
    if (!r.ok) throw new Error(r.error.motivo);
    const w = r.porSalida.get(k('B5'))?.welford as { media: number };
    expect(w.media).toBeGreaterThan(1075);
    expect(w.media).toBeLessThan(1083);
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

  it('en «Valores fijos» (la media) vale p × impacto; una probabilidad fuera de [0, 1] es un error', () => {
    expect(registradas.get('EVENTO')?.(0.3, 100, { address: 'Riesgos!B2' })).toBeCloseTo(30, 12);
    expect(() => registradas.get('EVENTO')?.(1.3, 100, { address: 'Riesgos!B2' })).toThrow();
  });
});
