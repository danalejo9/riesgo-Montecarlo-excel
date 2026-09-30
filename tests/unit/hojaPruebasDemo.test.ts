/**
 * La hoja «Pruebas» del libro de demostración, con las fórmulas que la guía
 * (docs/GUIA_PRUEBAS_EXCEL.md) pide escribir, pasada por el motor: lo que la
 * guía da como resultado esperado sale de aquí, no de una suposición.
 */
import { describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { simularPorBloques, type DefinicionEntrada } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, elegirMotor, modeloVacio, prepararEntradas, toDescriptor } from '../../engine/modelo/index.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { NUMERO, numeroEn, type Columna } from '../../engine/values/columna.ts';

const H = 'Pruebas';
const k = (ref: string) => claveDeReferencia(H, ref);

// Como las devuelve Office.js: nombres en inglés y comas.
const HOJA: Record<string, string> = {
  C5: 'RIESGO.NORMAL(1000,150)',
  C6: 'RIESGO.TRIANGULAR(8,10,14)',
  C7: 'C5*C6',
  C10: '_xlfn.LET(_xlpm.coste,C7*0.6,C7-_xlpm.coste)',
  C12: '100',
  F13: '120*$C$5/1000', F14: '80*$C$5/1000', F15: '150*$C$5/1000', F16: '60*$C$5/1000', F17: '200*$C$5/1000',
  C13: 'SUM(_xlfn._xlws.FILTER(F13:F17,F13:F17>C12,0))',
  C14: 'SUMPRODUCT((F13:F17>C12)*F13:F17)',
  C15: 'INDEX(_xlfn._xlws.SORT(F13:F17,1,-1),1)',
  H13: '_xlfn._xlws.FILTER(E13:E17,F13:F17>C12)',
  C21: '7+1',
  C22: 'C21*C5',
};

function celdas(formulas: Record<string, string>): FormulaCelda[] {
  return Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    return { hoja: H, col: (m[1] as string).charCodeAt(0) - 64, fila: Number(m[2]), formula };
  });
}

describe('hoja «Pruebas» del libro de demostración', () => {
  const formulas = celdas(HOJA);
  const { grafo } = construirGrafo(formulas);

  it('las funciones RIESGO se descubren solas como entradas', () => {
    const d = entradasDeFunciones(formulas, grafo, [], [k('C7'), k('C10'), k('C13'), k('C14'), k('C15')]);
    expect(d.claves.sort()).toEqual([k('C5'), k('C6')]);
    expect(d.errores).toEqual([]);
  });

  it('con C7, C10, C13, C14 y C15 como salidas, motor rápido; H13 (derrame) lo manda al compatible', () => {
    const entradas = [k('C5'), k('C6')];
    expect(elegirMotor(grafo, entradas, [k('C7'), k('C10'), k('C13'), k('C14'), k('C15')]).motor).toBe('fast');
    const conDerrame = elegirMotor(grafo, entradas, [k('C13'), k('H13')]);
    expect(conDerrame.motor).toBe('compatible');
    expect(conDerrame.motivos.some((m) => m.tipo === 'matricial')).toBe(true);
  });

  it('valores con las medias (lo que Excel enseña fuera de la simulación)', () => {
    const r = evaluarModelo(grafo, new Map([[k('C5'), Float64Array.of(1000)], [k('C6'), Float64Array.of(32 / 3)]]),
      [k('C7'), k('C10'), k('C13'), k('C14'), k('C15')], 1);
    if (!r.ok) throw new Error(r.error.motivo);
    const v = (ref: string) => numeroEn(r.valores.get(k(ref)) as Columna, 0);
    expect(v('C7')).toBeCloseTo(10666.67, 1);
    expect(v('C10')).toBeCloseTo(4266.67, 1);
    expect(v('C13')).toBeCloseTo(470, 9);
    expect(v('C14')).toBeCloseTo(470, 9);
    expect(v('C15')).toBeCloseTo(200, 9);
  });

  it('simulado: FILTRAR y SUMAPRODUCTO coinciden iteración a iteración', async () => {
    const entradas = new Set([k('C5'), k('C6')]);
    const salidas = [k('C7'), k('C10'), k('C13'), k('C14')];
    const c = compilarPlan(grafo, entradas, salidas);
    if (!c.ok) throw new Error(c.error.motivo);
    const defs: DefinicionEntrada[] = [
      { tipo: 'distribucion', clave: k('C5'), id: 'rf_C5', distribucion: toDescriptor({ type: 'normal', mean: 1000, stdDev: 150 }), metodo: 'monte-carlo' },
      { tipo: 'distribucion', clave: k('C6'), id: 'rf_C6', distribucion: toDescriptor({ type: 'triangular', min: 8, mode: 10, max: 14 }), metodo: 'monte-carlo' },
    ];
    const r = await simularPorBloques(grafo, c.plan, defs, 12345, 20_000, { retenerMuestra: 20_000 });
    if (!r.ok) throw new Error(r.error.motivo);
    const m13 = r.porSalida.get(k('C13'))?.muestra as Float64Array;
    const m14 = r.porSalida.get(k('C14'))?.muestra as Float64Array;
    for (let i = 0; i < m13.length; i++) expect(m13[i]).toBeCloseTo(m14[i] as number, 9);
    // Media de los ingresos ≈ 1000 × 10,667.
    expect(r.porSalida.get(k('C7'))?.welford.media).toBeGreaterThan(10_500);
    expect(r.porSalida.get(k('C7'))?.welford.media).toBeLessThan(10_850);
    // Media de C13 medida: ≈ 462 (la guía de pruebas lo usa).
    expect(r.porSalida.get(k('C13'))?.welford.media).toBeGreaterThan(440);
    expect(r.porSalida.get(k('C13'))?.welford.media).toBeLessThan(485);
  });
});

describe('secciones 7 y 8 de «Pruebas»: RIESGO con celdas (B7) y resultados en la hoja (B6)', () => {
  const HOJA_B7: Record<string, string> = {
    C34: 'RIESGO.NORMAL(C32,C33)',
    C35: '10+RIESGO.NORMAL(0,1)',
    C36: 'RIESGO.NORMAL(C34,50)',
    C37: 'C36*C35',
    C40: 'RIESGO.MEDIA(C37)',
  };
  const valores: ValorCelda[] = [
    { hoja: H, col: 3, fila: 32, valor: { tipo: NUMERO, numero: 1000 } },
    { hoja: H, col: 3, fila: 33, valor: { tipo: NUMERO, numero: 150 } },
  ];

  it('C34 es una entrada fija; C35 (en una suma) y C36 (media aleatoria) se reescriben', () => {
    const formulas = celdas(HOJA_B7);
    const { grafo } = construirGrafo(formulas, valores);
    const d = entradasDeFunciones(formulas, grafo, [], [k('C37')]);
    expect(d.errores).toEqual([]);
    expect(d.entradas.find((e) => e.ref === k('C34'))?.dist).toEqual({ type: 'normal', mean: 1000, stdDev: 150 });
    expect(d.reescritas.sort()).toEqual([k('C35'), k('C36')]);
  });

  it('simulado, C37 da una media en torno a 10.000 y una desviación en torno a 1.875 (lo que dice la guía)', async () => {
    const formulas = celdas(HOJA_B7);
    const { grafo } = construirGrafo(formulas, valores);
    const d = entradasDeFunciones(formulas, grafo, [], [k('C37')]);
    aplicarReescrituras(grafo, d);
    const base = modeloVacio();
    const n = 50_000;
    const modelo = { ...base, inputs: d.entradas, outputs: [{ id: 's', name: 'C37', ref: 'C37' }], settings: { ...base.settings, iterations: n } };
    const p = prepararEntradas(modelo, resolverConFunciones((ref) => k(ref), d), 12345);
    if (!p.ok) throw new Error(p.errores.join('; '));
    const c = compilarPlan(grafo, new Set(d.claves), [k('C37')]);
    if (!c.ok) throw new Error(c.error.motivo);
    const r = await simularPorBloques(grafo, c.plan, p.entradas, 12345, n, { retenerMuestra: n });
    if (!r.ok) throw new Error(r.error.motivo);
    const s = r.porSalida.get(k('C37'));
    const w = s?.welford;
    expect(w?.media).toBeCloseTo(10_000, -2);
    expect(Math.sqrt((w?.m2 ?? 0) / ((w?.n ?? 2) - 1))).toBeGreaterThan(1_800);
    expect(Math.sqrt((w?.m2 ?? 0) / ((w?.n ?? 2) - 1))).toBeLessThan(1_950);
    const muestra = Float64Array.from(s?.muestra ?? []).sort();
    const bajo8000 = muestra.filter((x) => x < 8000).length / muestra.length;
    expect(bajo8000).toBeGreaterThan(0.12);
    expect(bajo8000).toBeLessThan(0.16);
  });
});
