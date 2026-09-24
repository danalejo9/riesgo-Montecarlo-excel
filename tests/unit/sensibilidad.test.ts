/**
 * El análisis de sensibilidad: el cálculo (Spearman por rangos), la muestra
 * que retienen los dos motores para poder hacerlo, y su paso al informe.
 */
import { describe, expect, it } from 'vitest';

import { simularCompatible } from '../../engine/compatible/index.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { generarTramoDeEntrada, simularPorBloques, type DefinicionEntrada } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { modeloVacio } from '../../engine/modelo/index.ts';
import { analizarSensibilidad, rangos, spearman } from '../../engine/stats/index.ts';
import { sensibilidadDeSalida } from '../../excel/informe.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);
const SEED = 20260924;

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

describe('rangos', () => {
  it('numera desde 1 en orden ascendente', () => {
    expect(Array.from(rangos([30, 10, 20]))).toEqual([3, 1, 2]);
  });

  it('reparte los empates: dos valores iguales comparten el puesto medio', () => {
    expect(Array.from(rangos([5, 1, 5, 9]))).toEqual([2.5, 1, 2.5, 4]);
  });
});

describe('spearman', () => {
  it('una relación monótona no lineal da exactamente 1', () => {
    const x = [1, 2, 3, 4, 5, 6];
    expect(spearman(x, x.map((v) => Math.exp(v)))).toBeCloseTo(1, 12);
    expect(spearman(x, x.map((v) => -(v ** 3)))).toBeCloseTo(-1, 12);
  });

  it('el ejemplo de manual: d² = 2 con n = 5 da 0,9', () => {
    // ρ = 1 − 6·Σd² / (n(n²−1)) = 1 − 12/120.
    expect(spearman([1, 2, 3, 4, 5], [2, 1, 3, 4, 5])).toBeCloseTo(0.9, 12);
  });

  it('una serie constante no se correlaciona con nada: 0, no NaN', () => {
    expect(spearman([1, 2, 3, 4], [7, 7, 7, 7])).toBe(0);
  });

  it('ignora los pares sin número', () => {
    expect(spearman([1, 2, 3, 4, 5], [1, NaN, 3, 4, 5])).toBeCloseTo(1, 12);
  });
});

describe('analizarSensibilidad', () => {
  it('ordena por |ρ| y el peso suma 1', () => {
    const n = 2000;
    const a = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
    const b = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 78.233) * 12345.678 % 1);
    // La salida depende mucho de b (en contra) y poco de a.
    const y = Float64Array.from({ length: n }, (_, i) => 0.2 * (a[i] as number) - 3 * (b[i] as number));

    const filas = analizarSensibilidad([{ id: 'a', muestras: a }, { id: 'b', muestras: b }], y);
    expect(filas.map((f) => f.id)).toEqual(['b', 'a']);
    expect(filas[0]?.spearman).toBeLessThan(-0.9);
    expect(filas[1]?.spearman).toBeGreaterThan(0);
    expect(filas.reduce((s, f) => s + f.peso, 0)).toBeCloseTo(1, 12);
  });

  it('una salida sin números no inventa sensibilidad', () => {
    const filas = analizarSensibilidad([{ id: 'a', muestras: [1, 2, 3] }], [NaN, NaN, NaN]);
    expect(filas).toEqual([{ id: 'a', spearman: 0, peso: 0 }]);
  });
});

describe('la muestra que retiene el motor rápido', () => {
  const g = grafoDe({ C1: 'A1*10-B1' });
  const compilado = compilarPlan(g, new Set([k('A1'), k('B1')]), [k('C1')]);
  if (!compilado.ok) throw new Error('no compiló');
  const defs: DefinicionEntrada[] = [
    { tipo: 'distribucion', clave: k('A1'), id: 'a', distribucion: { tipo: 'normal', media: 0, desviacion: 1 }, metodo: 'monte-carlo' },
    { tipo: 'distribucion', clave: k('B1'), id: 'b', distribucion: { tipo: 'normal', media: 0, desviacion: 1 }, metodo: 'monte-carlo' },
  ];

  it('está alineada iteración a iteración con las entradas regeneradas, a través de varios bloques', async () => {
    const n = 5000;
    // Un presupuesto mínimo fuerza muchos bloques pequeños.
    const r = await simularPorBloques(g, compilado.plan, defs, SEED, n, {
      retenerMuestra: 3000, presupuestoBytesPorWorker: 64 * 1024,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const muestra = r.porSalida.get(k('C1'))?.muestra as Float64Array;
    expect(muestra.length).toBe(3000);

    const a = generarTramoDeEntrada(defs[0] as DefinicionEntrada, SEED, 0, 3000);
    const b = generarTramoDeEntrada(defs[1] as DefinicionEntrada, SEED, 0, 3000);
    for (let i = 0; i < 3000; i++) {
      expect(muestra[i]).toBeCloseTo((a[i] as number) * 10 - (b[i] as number), 9);
    }
  });

  it('sin pedirla no se retiene nada', async () => {
    const r = await simularPorBloques(g, compilado.plan, defs, SEED, 1000);
    expect(r.ok && r.porSalida.get(k('C1'))?.muestra).toBeUndefined();
  });

  it('el límite no puede pasar de n', async () => {
    const r = await simularPorBloques(g, compilado.plan, defs, SEED, 500, { retenerMuestra: 100_000 });
    expect(r.ok && r.porSalida.get(k('C1'))?.muestra?.length).toBe(500);
  });
});

describe('la muestra que retiene el modo compatible', () => {
  it('guarda las primeras iteraciones tal como las devolvió Excel', async () => {
    const r = await simularCompatible({
      libro: { calcularIteracion: async ([x]) => [(x as number) === 2 ? NaN : (x as number) * 3] },
      entradas: [{ direccion: 'Hoja1!A1', muestras: Float64Array.from([1, 2, 3, 4]) }],
      salidas: ['Hoja1!B1'],
      iteraciones: 4,
      retenerMuestra: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.porSalida.get('Hoja1!B1')?.muestra ?? [])).toEqual([3, NaN, 9]);
  });
});

describe('sensibilidadDeSalida', () => {
  it('pone nombre y celda del modelo a cada fila', () => {
    const modelo = modeloVacio();
    modelo.inputs.push(
      { id: 'p', name: 'Precio', ref: 'Hoja1!A1', dist: { type: 'normal', mean: 0, stdDev: 1 }, correlations: [] },
      { id: 'c', name: 'Coste', ref: 'Hoja1!B1', dist: { type: 'normal', mean: 0, stdDev: 1 }, correlations: [] },
    );
    const muestras = new Map([
      ['Hoja1!A1', [1, 2, 3, 4, 5]],
      ['Hoja1!B1', [5, 3, 4, 1, 2]],
    ]);
    const filas = sensibilidadDeSalida(modelo, ['Hoja1!A1', 'Hoja1!B1'], muestras, [10, 20, 30, 40, 50]);
    expect(filas[0]).toMatchObject({ id: 'p', nombre: 'Precio', ref: 'Hoja1!A1' });
    expect(filas[0]?.spearman).toBeCloseTo(1, 12);
    expect(filas[1]).toMatchObject({ id: 'c', nombre: 'Coste' });
    expect(filas[1]?.spearman).toBeLessThan(0);
  });
});
