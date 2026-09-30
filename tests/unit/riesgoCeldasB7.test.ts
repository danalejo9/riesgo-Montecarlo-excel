/**
 * B7: funciones RIESGO con argumentos que son celdas o cálculos, dentro de
 * una operación, y con parámetros que cambian en cada iteración.
 */
import { describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, elegirMotor, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { NUMERO, TEXTO } from '../../engine/values/columna.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function posicion(ref: string): { col: number; fila: number } {
  const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
  const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
  return { col, fila: Number(m[2]) };
}

function libro(formulas: Record<string, string>, valores: Record<string, number | string> = {}) {
  const f: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => ({ hoja: H, ...posicion(ref), formula }));
  const v: ValorCelda[] = Object.entries(valores).map(([ref, x]) => ({
    hoja: H, ...posicion(ref),
    valor: typeof x === 'number' ? { tipo: NUMERO, numero: x } : { tipo: TEXTO, texto: x },
  }));
  return { formulas: f, grafo: construirGrafo(f, v).grafo };
}

/** Todo el camino del panel, sin Excel: analizar, reescribir, preparar y simular. */
async function simular(formulas: Record<string, string>, valores: Record<string, number | string>, salida: string, n = 20_000, semilla = 11) {
  const { formulas: f, grafo } = libro(formulas, valores);
  const d = entradasDeFunciones(f, grafo, [], [k(salida)]);
  if (d.errores.length > 0) throw new Error(d.errores.join('; '));
  aplicarReescrituras(grafo, d);
  const base = modeloVacio();
  const modelo = { ...base, inputs: d.entradas, outputs: [{ id: 's', name: salida, ref: salida }], settings: { ...base.settings, iterations: n, seed: semilla } };
  const resolver = resolverConFunciones((ref) => k(ref), d);
  const p = prepararEntradas(modelo, resolver, semilla);
  if (!p.ok) throw new Error(p.errores.join('; '));
  expect(elegirMotor(grafo, d.claves, [k(salida)]).motor).toBe('fast');
  const c = compilarPlan(grafo, new Set(d.claves), [k(salida)]);
  if (!c.ok) throw new Error(c.error.motivo);
  const r = await simularPorBloques(grafo, c.plan, p.entradas, semilla, n);
  if (!r.ok) throw new Error(r.error.motivo);
  const s = r.porSalida.get(k(salida));
  if (!s) throw new Error('sin salida');
  return { ...s.welford, desv: Math.sqrt(s.welford.m2 / (s.welford.n - 1)), noNumericas: s.noNumericas, d };
}

describe('caso 1: toda la fórmula, con argumentos fijos que son celdas o cálculos', () => {
  it('=RIESGO.NORMAL(C1; 15) con C1 = 50 es una normal(50; 15)', () => {
    const { formulas, grafo } = libro({ A1: 'RIESGO.NORMAL(C1,15)', B1: 'A1*2' }, { C1: 50 });
    const d = entradasDeFunciones(formulas, grafo, [], [k('B1')]);
    expect(d.errores).toEqual([]);
    expect(d.entradas[0]).toMatchObject({ ref: k('A1'), dist: { type: 'normal', mean: 50, stdDev: 15 } });
    expect(d.reescritas).toEqual([]);
  });

  it('también si la celda del argumento es una fórmula, o el argumento es un cálculo', () => {
    const { formulas, grafo } = libro({ A1: 'RIESGO.TRIANGULAR(C1,C1*2,D1+10)', C1: '25*2', D1: 'SUM(E1:E2)', B1: 'A1' }, { E1: 40, E2: 60 });
    const d = entradasDeFunciones(formulas, grafo, [], [k('B1')]);
    expect(d.errores).toEqual([]);
    expect(d.entradas[0]?.dist).toEqual({ type: 'triangular', min: 50, mode: 100, max: 110 });
  });

  it('una celda vacía vale 0, como en Excel; un texto no es un número', () => {
    const { formulas, grafo } = libro({ A1: 'RIESGO.NORMAL(C1,10)', A2: 'RIESGO.NORMAL(D1,10)', B1: 'A1+A2' }, { D1: 'hola' });
    const d = entradasDeFunciones(formulas, grafo, [], [k('B1')]);
    expect(d.entradas.find((e) => e.ref === k('A1'))?.dist).toEqual({ type: 'normal', mean: 0, stdDev: 10 });
    expect(d.errores).toHaveLength(1);
    expect(d.errores[0]).toContain(k('A2'));
  });

  it('RIESGO.CATEGORIA con pesos calculados por fórmulas', () => {
    const { formulas, grafo } = libro({ A1: 'RIESGO.CATEGORIA(E1:E2,F1:F2)', F2: '1-F1', B1: 'A1' }, { E1: 'Norte', E2: 'Sur', F1: 0.25 });
    const d = entradasDeFunciones(formulas, grafo, [], [k('B1')]);
    expect(d.errores).toEqual([]);
    expect(d.entradas[0]?.dist).toEqual({ type: 'categorical', categories: ['Norte', 'Sur'], weights: [0.25, 0.75] });
  });

  it('simula igual que con los números escritos', async () => {
    const r = await simular({ A1: 'RIESGO.NORMAL(C1,C2)', B1: 'A1' }, { C1: 50, C2: 5 }, 'B1');
    expect(r.media).toBeCloseTo(50, 0);
    expect(r.desv).toBeCloseTo(5, 0);
  });
});

describe('caso 2: dentro de una operación', () => {
  it('=1000+RIESGO.NORMAL(0; 50) se reescribe con una celda virtual y simula', async () => {
    const r = await simular({ B1: '1000+RIESGO.NORMAL(0,50)' }, {}, 'B1');
    expect(r.d.reescritas).toEqual([k('B1')]);
    expect(r.d.entradas[0]).toMatchObject({ ref: k('B1'), dist: { type: 'normal', mean: 0, stdDev: 50 } });
    expect(r.media).toBeCloseTo(1000, -1);
    expect(r.desv).toBeCloseTo(50, -1);
  });

  it('dos funciones en la misma fórmula son dos entradas distintas', async () => {
    const r = await simular({ B1: 'RIESGO.UNIFORME(0,1)+RIESGO.UNIFORME(0,1)' }, {}, 'B1');
    expect(r.d.entradas.map((e) => e.ref)).toEqual([`${k('B1')} (1)`, `${k('B1')} (2)`]);
    expect(r.media).toBeCloseTo(1, 1);
    // La suma de dos uniformes independientes: desviación √(2/12) ≈ 0,408.
    expect(r.desv).toBeCloseTo(Math.sqrt(2 / 12), 2);
  });
});

describe('caso 3: parámetros que cambian en cada iteración', () => {
  it('=RIESGO.NORMAL(A1; 5) con A1 = RIESGO.NORMAL(100; 10): media 100 y desviación √125', async () => {
    const r = await simular({ A1: 'RIESGO.NORMAL(100,10)', B1: 'RIESGO.NORMAL(A1,5)' }, {}, 'B1', 50_000);
    expect(r.d.reescritas).toEqual([k('B1')]);
    expect(r.d.descripciones.size).toBe(1);
    expect(r.media).toBeCloseTo(100, 0);
    expect(r.desv).toBeCloseTo(Math.sqrt(125), 0);
    expect(r.noNumericas).toBe(0);
  });

  it('la desviación puede ser otra celda aleatoria', async () => {
    const r = await simular({ A1: 'RIESGO.UNIFORME(1,3)', B1: 'RIESGO.NORMAL(50,A1)' }, {}, 'B1', 50_000);
    // Var = E[σ²] = (1 + 3 + 9)/3 ≈ 4,33 (uniforme en [1, 3]).
    expect(r.media).toBeCloseTo(50, 0);
    expect(r.desv).toBeCloseTo(Math.sqrt(13 / 3), 1);
  });

  it('RIESGO.TRUNCAR con la media aleatoria respeta los límites', async () => {
    const r = await simular({ A1: 'RIESGO.NORMAL(100,10)', B1: 'RIESGO.TRUNCAR(RIESGO.NORMAL(A1,20),90,110)' }, {}, 'B1');
    expect(r.min).toBeGreaterThanOrEqual(90);
    expect(r.max).toBeLessThanOrEqual(110);
  });

  it('una función dentro de otra: RIESGO.NORMAL(RIESGO.NORMAL(10; 1); 2)', async () => {
    const r = await simular({ B1: 'RIESGO.NORMAL(RIESGO.NORMAL(10,1),2)' }, {}, 'B1', 50_000);
    expect(r.d.entradas).toHaveLength(2);
    expect(r.media).toBeCloseTo(10, 1);
    expect(r.desv).toBeCloseTo(Math.sqrt(5), 1);
  });

  it('parámetros inválidos en una iteración dan #NUM! en esa iteración, no rompen la simulación', async () => {
    const r = await simular({ A1: 'RIESGO.NORMAL(0,1)', B1: 'RIESGO.NORMAL(0,A1)' }, {}, 'B1', 10_000);
    // Media casi la mitad de las iteraciones tienen desviación negativa.
    expect(r.noNumericas).toBeGreaterThan(4_000);
    expect(r.noNumericas).toBeLessThan(6_000);
  });

  it('es reproducible: misma semilla, mismos números', async () => {
    const f = { A1: 'RIESGO.NORMAL(100,10)', B1: 'RIESGO.GAMMA(A1/10,2)' };
    const a = await simular(f, {}, 'B1', 5_000, 3);
    const b = await simular(f, {}, 'B1', 5_000, 3);
    expect(a.media).toBe(b.media);
    expect(a.m2).toBe(b.m2);
  });

  it('una entrada del panel también cuenta como aleatoria', () => {
    const { formulas, grafo } = libro({ B1: 'RIESGO.NORMAL(A1,5)' }, { A1: 100 });
    const d = entradasDeFunciones(formulas, grafo, [k('A1')], [k('B1')]);
    expect(d.reescritas).toEqual([k('B1')]);
    expect(d.entradas[0]?.id.startsWith('rd_')).toBe(true);
  });

  it('RIESGO.CATEGORIA con pesos aleatorios todavía no: error claro', () => {
    const { formulas, grafo } = libro({ A1: 'RIESGO.UNIFORME(0,1)', F2: '1-A1', B1: 'RIESGO.CATEGORIA(E1:E2,F1:F2)' }, { E1: 'a', E2: 'b', F1: 0.5 });
    const d = entradasDeFunciones(formulas, grafo, [], [k('B1')]);
    expect(d.errores[0]).toMatch(/B1: RIESGO\.CATEGORIA con valores que cambian/);
  });
});
