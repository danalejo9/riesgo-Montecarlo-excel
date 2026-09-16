import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { normal, uniform } from '../../engine/distributions/index.ts';
import {
  calcularBloque,
  particionarEnBloques,
  resolverEntradas,
  simularPorBloques,
  tamanoBloqueAdaptativo,
  type DefinicionEntrada,
} from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { muestrearLHS, muestrearMonteCarlo } from '../../engine/sampling/index.ts';
import { cuantilTDigest, percentilExacto } from '../../engine/stats/index.ts';

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

describe('tamanoBloqueAdaptativo', () => {
  it('sigue la fórmula de Fase 2 §3.1: clamp(presupuesto / (vivos*8), 4096, 65536)', () => {
    expect(tamanoBloqueAdaptativo(1, 8 * 1024 * 1024)).toBe(65536); // 8MB/(1*8) > 65536, se acota arriba
    expect(tamanoBloqueAdaptativo(300, 8 * 1024 * 1024)).toBeLessThan(65536);
    expect(tamanoBloqueAdaptativo(1_000_000, 8 * 1024 * 1024)).toBe(4096); // se acota abajo
  });

  it('con cero o menos buffers vivos, no se cae: devuelve el máximo', () => {
    expect(tamanoBloqueAdaptativo(0)).toBe(65536);
  });
});

describe('particionarEnBloques', () => {
  it('cubre exactamente [0,n) sin huecos ni solapes', () => {
    const bloques = particionarEnBloques(10_000, 3000);
    let cubierto = 0;
    for (const b of bloques) {
      expect(b.inicio).toBe(cubierto);
      cubierto += b.largo;
    }
    expect(cubierto).toBe(10_000);
    expect(bloques.length).toBe(4); // 3000+3000+3000+1000
  });

  it('n=0 no produce bloques', () => {
    expect(particionarEnBloques(0, 100)).toEqual([]);
  });
});

describe('calcularBloque', () => {
  it('el parcial de un bloque coincide con Welford calculado sobre el mismo tramo', () => {
    const g = grafoDe({ A1: 'X1*2' });
    const compilado = compilarPlan(g, new Set([k('X1')]), [k('A1')]);
    expect(compilado.ok).toBe(true);
    if (!compilado.ok) return;

    const def: DefinicionEntrada = {
      tipo: 'distribucion',
      clave: k('X1'),
      id: 'x',
      distribucion: { tipo: 'normal', media: 100, desviacion: 10 },
      metodo: 'monte-carlo',
    };

    const r = calcularBloque(g, compilado.plan, [def], SEED, { inicio: 500, largo: 1000 }, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Referencia: generar la variable completa y quedarse con el mismo tramo.
    const xCompleto = muestrearMonteCarlo(normal(100, 10), 'x', SEED, 2000);
    const tramo = xCompleto.subarray(500, 1500);
    const esperado = Float64Array.from(tramo, (v) => v * 2);

    const parcial = r.parcial.get(k('A1'));
    expect(parcial).toBeDefined();
    expect(parcial?.welford.n).toBe(1000);
    let suma = 0;
    for (const v of esperado) suma += v;
    expect(parcial?.welford.media).toBeCloseTo(suma / 1000, 6);
  });
});

describe('resolverEntradas', () => {
  it('deja Monte Carlo perezosa y materializa LHS de una vez', () => {
    const defs: DefinicionEntrada[] = [
      { tipo: 'distribucion', clave: 'mc', id: 'mc', distribucion: { tipo: 'uniforme', min: 0, max: 1 }, metodo: 'monte-carlo' },
      { tipo: 'distribucion', clave: 'lhs', id: 'lhs', distribucion: { tipo: 'uniforme', min: 0, max: 1 }, metodo: 'lhs' },
    ];
    const resueltas = resolverEntradas(defs, SEED, 1000);
    expect(resueltas[0]?.tipo).toBe('distribucion');
    expect(resueltas[1]?.tipo).toBe('buffer');

    const esperadoLHS = muestrearLHS(uniform(0, 1), 'lhs', SEED, 1000);
    expect(Array.from((resueltas[1] as { buffer: Float64Array }).buffer)).toEqual(Array.from(esperadoLHS));
  });
});

describe('simularPorBloques', () => {
  function modeloSimple() {
    const g = grafoDe({ A1: 'X1*2+1' });
    const compilado = compilarPlan(g, new Set([k('X1')]), [k('A1')]);
    if (!compilado.ok) throw new Error('no compiló');
    const def: DefinicionEntrada = {
      tipo: 'distribucion',
      clave: k('X1'),
      id: 'x',
      distribucion: { tipo: 'normal', media: 500, desviacion: 50 },
      metodo: 'monte-carlo',
    };
    return { g, plan: compilado.plan, def };
  }

  it('el resultado no depende del tamaño de bloque (uno grande vs muchos chicos)', async () => {
    const { g, plan, def } = modeloSimple();
    const n = 50_000;

    const unSoloBloque = await simularPorBloques(g, plan, [def], SEED, n, { presupuestoBytesPorWorker: 8 * 1024 * 1024 * 1024 });
    const muchosBloques = await simularPorBloques(g, plan, [def], SEED, n, { presupuestoBytesPorWorker: 4096 * 8 });

    expect(unSoloBloque.ok).toBe(true);
    expect(muchosBloques.ok).toBe(true);
    if (!unSoloBloque.ok || !muchosBloques.ok) return;

    const sA = unSoloBloque.porSalida.get(k('A1'))!;
    const sB = muchosBloques.porSalida.get(k('A1'))!;
    expect(sA.welford.n).toBe(n);
    expect(sB.welford.n).toBe(n);
    expect(sB.welford.media).toBeCloseTo(sA.welford.media, 6);
    expect(sB.welford.m2).toBeCloseTo(sA.welford.m2, 0);
  });

  it('coincide con generar todo de una vez y evaluar con evaluarModelo', async () => {
    const { g, plan, def } = modeloSimple();
    const n = 20_000;

    const resultado = await simularPorBloques(g, plan, [def], SEED, n, { presupuestoBytesPorWorker: 4096 * 8 });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const xCompleto = muestrearMonteCarlo(normal(500, 50), 'x', SEED, n);
    const ref = evaluarModelo(g, new Map([[k('X1'), xCompleto]]), [k('A1')], n);
    expect(ref.ok).toBe(true);
    if (!ref.ok) return;
    const bufferRef = ref.valores.get(k('A1')) as Float64Array;

    const salida = resultado.porSalida.get(k('A1'))!;
    const p50Exacto = percentilExacto(bufferRef, 0.5);
    const p50Digest = cuantilTDigest(salida.digest, 0.5);
    expect(p50Digest).toBeCloseTo(p50Exacto, 0);
  });

  it('se puede cancelar entre rondas, y queda lo acumulado hasta ese punto', async () => {
    const { g, plan, def } = modeloSimple();
    const n = 100_000;
    let rondas = 0;

    const resultado = await simularPorBloques(g, plan, [def], SEED, n, {
      presupuestoBytesPorWorker: 4096 * 8,
      bloquesPorRonda: 1,
      debeCancelar: () => {
        rondas++;
        return rondas > 3;
      },
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.cancelada).toBe(true);
    expect(resultado.iteracionesCompletadas).toBeGreaterThan(0);
    expect(resultado.iteracionesCompletadas).toBeLessThan(n);
  });

  it('reporta progreso creciente hasta completar n', async () => {
    const { g, plan, def } = modeloSimple();
    const n = 30_000;
    const reportes: number[] = [];

    const resultado = await simularPorBloques(g, plan, [def], SEED, n, {
      presupuestoBytesPorWorker: 4096 * 8,
      bloquesPorRonda: 1,
      progreso: (completadas) => reportes.push(completadas),
    });

    expect(resultado.ok).toBe(true);
    expect(reportes.length).toBeGreaterThan(1);
    expect(reportes[reportes.length - 1]).toBe(n);
    for (let i = 1; i < reportes.length; i++) expect(reportes[i]).toBeGreaterThan(reportes[i - 1] as number);
  });

  it('una función no soportada se reporta con la celda exacta, no una excepción sin contexto', async () => {
    const g = grafoDe({ A1: 'FUNCIONINEXISTENTE(X1)' });
    const compilado = compilarPlan(g, new Set([k('X1')]), [k('A1')]);
    expect(compilado.ok).toBe(true);
    if (!compilado.ok) return;

    const def: DefinicionEntrada = {
      tipo: 'distribucion',
      clave: k('X1'),
      id: 'x',
      distribucion: { tipo: 'uniforme', min: 0, max: 1 },
      metodo: 'monte-carlo',
    };
    const resultado = await simularPorBloques(g, compilado.plan, [def], SEED, 100, {});
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.clave).toBe(k('A1'));
    expect(resultado.error.motivo).toMatch(/no soportada/i);
  });
});
