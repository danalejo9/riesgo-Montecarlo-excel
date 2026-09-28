/**
 * Las funciones RIESGO.* escritas en celdas: su lectura, su conversión en
 * entradas del modelo, y que el motor rápido no intente evaluarlas.
 */
import { describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques, type DefinicionEntrada } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  elegirMotor, FUNCIONES_RIESGO, modeloVacio, prepararEntradas, idDeFuncionRiesgo, leerFuncionRiesgo, mediaDeFuncionRiesgo, mencionaRiesgo,
  toDescriptor,
} from '../../engine/modelo/index.ts';
import { metadatosFunciones } from '../../engine/modelo/metadatosFunciones.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function celdas(formulas: Record<string, string>): FormulaCelda[] {
  return Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
}

describe('leerFuncionRiesgo', () => {
  it('convierte la fórmula en la distribución del modelo, con su media', () => {
    expect(leerFuncionRiesgo('=RIESGO.NORMAL(100,15)')).toEqual({
      ok: true, id: 'NORMAL', spec: { type: 'normal', mean: 100, stdDev: 15 }, media: 100,
    });
    const t = leerFuncionRiesgo('RIESGO.TRIANGULAR(10,20,60)');
    expect(t.ok && t.media).toBeCloseTo(30, 12);
  });

  it('acepta RISK.* y la forma del XML, y negativos escritos', () => {
    expect(leerFuncionRiesgo('RISK.UNIFORME(-5,5)').ok).toBe(true);
    expect(leerFuncionRiesgo('_xludf.RIESGO.PERT(1,2,4)').ok).toBe(true);
  });

  it('rechaza con motivo lo que no puede simular', () => {
    const casos: [string, string][] = [
      ['RIESGO.NORMAL(B2,15)', 'números escritos'],
      ['1+RIESGO.NORMAL(100,15)', 'toda la fórmula'],
      ['RIESGO.NORMAL(100)', 'necesita 2'],
      ['RIESGO.INVENTADA(1)', 'no existe'],
      ['RIESGO.NORMAL(100,-1)', 'no válidos'],
    ];
    for (const [f, texto] of casos) {
      const r = leerFuncionRiesgo(f);
      expect(r.ok, f).toBe(false);
      if (!r.ok) expect(r.motivo, f).toContain(texto);
    }
  });

  it('nombres y detección', () => {
    expect(idDeFuncionRiesgo('riesgo.normal')).toBe('NORMAL');
    expect(idDeFuncionRiesgo('SUMA')).toBeNull();
    expect(mencionaRiesgo('=2*RIESGO.PERT(1,2,3)')).toBe(true);
    expect(mencionaRiesgo('=SUM(A1:A3)')).toBe(false);
  });

  it('la media que enseña la celda en Excel', () => {
    expect(mediaDeFuncionRiesgo('EXPON', [0.5])).toBeCloseTo(2, 12);
    expect(mediaDeFuncionRiesgo('NORMAL', [1, -1])).toBe('#NUM!');
    expect(mediaDeFuncionRiesgo('NADA', [])).toBe('#NAME?');
  });

  it('todas las funciones del catálogo construyen una distribución válida del motor', () => {
    const ejemplos: Record<string, number[]> = {
      NORMAL: [0, 1], LOGNORMAL: [10, 2], UNIFORME: [0, 1], TRIANGULAR: [0, 1, 2], PERT: [0, 1, 2],
      BETA: [2, 3], GAMMA: [2, 1], EXPON: [1], WEIBULL: [2, 1], BERNOULLI: [0.3], BINOMIAL: [10, 0.5], POISSON: [3],
    };
    for (const f of FUNCIONES_RIESGO) {
      expect(ejemplos[f.id], `falta ejemplo para ${f.id}`).toBeDefined();
      expect(() => toDescriptor(f.construir(ejemplos[f.id] as number[]))).not.toThrow();
      expect(typeof mediaDeFuncionRiesgo(f.id, ejemplos[f.id] as number[])).toBe('number');
    }
  });
});

describe('metadatos para Excel (funciones.json)', () => {
  it('uno por función del catálogo, con sus parámetros', () => {
    const m = metadatosFunciones() as { functions: { id: string; parameters: unknown[] }[] };
    expect(m.functions.map((f) => f.id)).toEqual([...FUNCIONES_RIESGO.map((f) => f.id), 'CATEGORIA']);
    expect(m.functions.find((f) => f.id === 'TRIANGULAR')?.parameters).toHaveLength(3);
  });
});

describe('entradasDeFunciones', () => {
  const formulas = celdas({
    A1: 'RIESGO.NORMAL(100,10)',   // la usa la salida
    A2: 'RIESGO.UNIFORME(0,1)',    // no la usa nadie
    A3: 'RIESGO.PERT(1,2,3)',      // también en el panel
    B1: 'A1*2+A3',
  });
  const { grafo } = construirGrafo(formulas);

  it('solo las que afectan a una salida; manda el panel si está en los dos', () => {
    const r = entradasDeFunciones(formulas, grafo, [k('A3')], [k('B1')]);
    expect(r.claves).toEqual([k('A1')]);
    expect(r.entradas[0]).toMatchObject({ ref: k('A1'), dist: { type: 'normal', mean: 100, stdDev: 10 } });
    expect(r.duplicadas).toEqual([k('A3')]);
    expect(r.errores).toEqual([]);
  });

  it('preparar la simulación resuelve las celdas RIESGO (fallo «Referencia sin resolver» de la prueba E3)', () => {
    // Como el de Excel: solo conoce las referencias del panel, y lanza con las demás.
    const delPanel = new Map([['B1', k('B1')]]);
    const estricto = (ref: string) => {
      const c = delPanel.get(ref);
      if (!c) throw new Error(`Referencia sin resolver: ${ref}`);
      return c;
    };
    const d = entradasDeFunciones(formulas, grafo, [], [k('B1')]);
    const base = modeloVacio();
    const modelo = {
      ...base,
      inputs: d.entradas,
      outputs: [{ id: 'sal', name: 'B1', ref: 'B1' }],
      settings: { ...base.settings, iterations: 100 },
    };
    expect(() => prepararEntradas(modelo, estricto, 1)).toThrow(/Referencia sin resolver/);
    const r = prepararEntradas(modelo, resolverConFunciones(estricto, d), 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entradas.map((e) => e.clave).sort()).toEqual([k('A1'), k('A3')].sort());
  });

  it('una RIESGO mal escrita que afecta a la salida es un error con su celda', () => {
    const f = celdas({ A1: 'RIESGO.NORMAL(C1,10)', B1: 'A1+1' });
    const r = entradasDeFunciones(f, construirGrafo(f).grafo, [], [k('B1')]);
    expect(r.errores[0]).toContain(k('A1'));
  });
});

describe('el motor rápido no evalúa lo que hay dentro de una entrada', () => {
  it('una celda con RIESGO.* marcada como entrada no manda al modo compatible, y simula', async () => {
    const f = celdas({ A1: 'RIESGO.NORMAL(100,10)', B1: 'A1*2' });
    const { grafo } = construirGrafo(f);
    expect(elegirMotor(grafo, [k('A1')], [k('B1')]).motor).toBe('fast');

    const c = compilarPlan(grafo, new Set([k('A1')]), [k('B1')]);
    if (!c.ok) throw new Error(c.error.motivo);
    const defs: DefinicionEntrada[] = [
      { tipo: 'distribucion', clave: k('A1'), id: 'a', distribucion: toDescriptor({ type: 'normal', mean: 100, stdDev: 10 }), metodo: 'monte-carlo' },
    ];
    const r = await simularPorBloques(grafo, c.plan, defs, 7, 20_000);
    expect(r.ok && r.porSalida.get(k('B1'))?.welford.media).toBeCloseTo(200, 0);
  });

  it('sin marcarla como entrada, en cambio, sí es una función desconocida', () => {
    const f = celdas({ A1: 'RIESGO.NORMAL(100,10)', B1: 'A1*2', C1: '5' });
    expect(elegirMotor(construirGrafo(f).grafo, [k('C1')], [k('B1')]).motor).toBe('compatible');
  });
});
