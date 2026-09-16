import { afterEach, describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques, type DefinicionEntrada } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { crearPoolDeWorkers, type PoolDeWorkers } from '../helpers/poolNodeWorkers.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);
const SEED = 20260915;

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.toUpperCase().charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

let poolActivo: PoolDeWorkers | undefined;
afterEach(async () => {
  await poolActivo?.cerrar();
  poolActivo = undefined;
});

describe('pool de worker_threads (prueba de paralelismo real)', () => {
  it('da el mismo resultado que el ejecutor secuencial, con hilos reales de verdad', async () => {
    const g = grafoDe({ A1: 'X1*2+1' });
    const compilado = compilarPlan(g, new Set([k('X1')]), [k('A1')]);
    expect(compilado.ok).toBe(true);
    if (!compilado.ok) return;

    const def: DefinicionEntrada = {
      tipo: 'distribucion',
      clave: k('X1'),
      id: 'x',
      distribucion: { tipo: 'normal', media: 500, desviacion: 50 },
      metodo: 'monte-carlo',
    };
    const n = 40_000;
    const compresion = 100;

    const secuencial = await simularPorBloques(g, compilado.plan, [def], SEED, n, {
      presupuestoBytesPorWorker: 4096 * 8,
      compresionTDigest: compresion,
    });
    expect(secuencial.ok).toBe(true);
    if (!secuencial.ok) return;

    poolActivo = crearPoolDeWorkers(3, g, compilado.plan, [def], SEED, compresion);
    const paralelo = await simularPorBloques(g, compilado.plan, [def], SEED, n, {
      presupuestoBytesPorWorker: 4096 * 8,
      compresionTDigest: compresion,
      ejecutor: poolActivo.ejecutor,
    });
    expect(paralelo.ok).toBe(true);
    if (!paralelo.ok) return;

    const sSec = secuencial.porSalida.get(k('A1'))!;
    const sPar = paralelo.porSalida.get(k('A1'))!;

    // Mismos bloques, mismo PRNG de contador: da igual cuántos hilos los
    // calculen, cada bloque es una función pura de (seed, id, rango). La
    // única diferencia posible es de redondeo por el orden de combinación de
    // Welford (no asociativo en punto flotante), de ahí la tolerancia.
    expect(sPar.welford.n).toBe(sSec.welford.n);
    expect(sPar.welford.media).toBeCloseTo(sSec.welford.media, 9);
    expect(sPar.welford.m2).toBeCloseTo(sSec.welford.m2, 3);
  }, 30_000);

  it('reparte de verdad entre varios hilos: más trabajos que workers no se pierden ni se cruzan', async () => {
    const g = grafoDe({ A1: 'X1+1' });
    const compilado = compilarPlan(g, new Set([k('X1')]), [k('A1')]);
    if (!compilado.ok) throw new Error('no compiló');

    const def: DefinicionEntrada = {
      tipo: 'distribucion',
      clave: k('X1'),
      id: 'x',
      distribucion: { tipo: 'uniforme', min: 0, max: 1 },
      metodo: 'monte-carlo',
    };

    poolActivo = crearPoolDeWorkers(2, g, compilado.plan, [def], SEED, 50);
    // 10 bloques de 100, repartidos entre 2 workers: cada worker resuelve 5.
    const trabajos = Array.from({ length: 10 }, (_, i) => ({ inicio: i * 100, largo: 100 }));
    const resultados = await poolActivo.ejecutor.ejecutar(trabajos);

    expect(resultados.length).toBe(10);
    for (let i = 0; i < resultados.length; i++) {
      expect(resultados[i]?.get(k('A1'))?.welford.n).toBe(100);
    }
  }, 30_000);
});
