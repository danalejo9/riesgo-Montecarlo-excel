/**
 * U1: las plantillas funcionan. Cada una se lleva al grafo como si estuviera
 * en el libro y se simula con el motor rápido, con todo el camino del panel:
 * salidas y correlaciones declaradas, eventos, reescrituras y muestreo.
 */
import { describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { NUMERO, TEXTO } from '../../engine/values/columna.ts';
import { aplicarCorrelacionesDeFunciones, leerDeclaraciones, sustituirDeclaraciones } from '../../excel/declaracionesEnGrafo.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { PLANTILLAS, type Plantilla } from '../../excel/plantillas.ts';

const pos = (r: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(r) as RegExpExecArray;
  return { col: (m[1] as string).charCodeAt(0) - 64, fila: Number(m[2]) };
};

async function simular(p: Plantilla, n = 20_000) {
  const formulas: FormulaCelda[] = [];
  const valores: ValorCelda[] = [];
  for (const c of p.celdas) {
    if (typeof c.valor === 'string' && c.valor.startsWith('=')) formulas.push({ hoja: p.hoja, ...pos(c.ref), formula: c.valor.slice(1) });
    else valores.push({ hoja: p.hoja, ...pos(c.ref), valor: typeof c.valor === 'number' ? { tipo: NUMERO, numero: c.valor } : { tipo: TEXTO, texto: c.valor } });
  }
  const { grafo } = construirGrafo(formulas, valores);
  const dec = leerDeclaraciones(grafo);
  expect(dec.errores).toEqual([]);
  sustituirDeclaraciones(grafo, dec.celdas);
  const salidas = dec.salidas.map((s) => s.clave);
  const d = entradasDeFunciones(formulas, grafo, [], salidas);
  expect(d.errores).toEqual([]);
  const c = aplicarCorrelacionesDeFunciones(d.entradas, d.entradas.map((e) => d.celdaDeEntrada.get(e.id) as string), dec.correlaciones);
  expect(c.errores).toEqual([]);
  aplicarReescrituras(grafo, d);
  const base = modeloVacio();
  const modelo = { ...base, inputs: c.entradas, outputs: dec.salidas.map((s) => ({ id: s.clave, name: s.nombre ?? s.clave, ref: s.clave })), settings: { ...base.settings, iterations: n, seed: 7 } };
  const prep = prepararEntradas(modelo, resolverConFunciones((ref) => ref, d), 7);
  if (!prep.ok) throw new Error(prep.errores.join('; '));
  const plan = compilarPlan(grafo, new Set(d.claves), salidas);
  if (!plan.ok) throw new Error(plan.error.motivo);
  const r = await simularPorBloques(grafo, plan.plan, prep.entradas, 7, n);
  if (!r.ok) throw new Error(r.error.motivo);
  return new Map(dec.salidas.map((s) => [s.nombre ?? s.clave, r.porSalida.get(s.clave)?.welford as { media: number; m2: number; n: number }] as const));
}

describe('plantillas', () => {
  it('hay tres, con sus salidas declaradas', () => {
    expect(PLANTILLAS.map((p) => p.id)).toEqual(['inversion', 'obra', 'cartera']);
  });

  it('proyecto de inversión: el VAN sale con media razonable y dispersión', async () => {
    const r = await simular(PLANTILLAS[0] as Plantilla);
    const van = r.get('VAN');
    expect(van?.n).toBe(20_000);
    // Con las medias: ventas 226.667, crecimiento 5 %, margen 0,30 → VAN ≈ 30.000.
    expect(van?.media).toBeGreaterThan(0);
    expect(van?.media).toBeLessThan(80_000);
    expect(Math.sqrt((van?.m2 ?? 0) / 19_999)).toBeGreaterThan(20_000);
  });

  it('presupuesto de obra: la media es la suma de las medias y los valores esperados (≈ 323.400)', async () => {
    const r = await simular(PLANTILLAS[1] as Plantilla);
    expect(r.get('Coste total')?.media).toBeGreaterThan(321_000);
    expect(r.get('Coste total')?.media).toBeLessThan(326_000);
  });

  it('cartera: rentabilidad media 5,5 % y valor medio ≈ 105.500', async () => {
    const r = await simular(PLANTILLAS[2] as Plantilla);
    expect(r.get('Rentabilidad de la cartera')?.media).toBeCloseTo(0.055, 2);
    expect(r.get('Valor al cabo de un año')?.media).toBeGreaterThan(104_500);
    expect(r.get('Valor al cabo de un año')?.media).toBeLessThan(106_500);
  });
});
