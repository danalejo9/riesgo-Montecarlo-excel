/**
 * Resto de B6: `RIESGO.SALIDA` (marcar una salida desde la fórmula) y
 * `RIESGO.CORRELACION` (correlacionar dos entradas desde la fórmula).
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { metadatosFunciones } from '../../engine/modelo/metadatosFunciones.ts';
import { NUMERO } from '../../engine/values/columna.ts';
import {
  aplicarCorrelacionesDeFunciones, formulaSinSalida, leerDeclaraciones, sustituirDeclaraciones,
} from '../../excel/declaracionesEnGrafo.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { modeloParaCompartir, modeloRestaurado, planificarCompartir } from '../../excel/compartirPuro.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function posicion(ref: string): { col: number; fila: number } {
  const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
  const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
  return { col, fila: Number(m[2]) };
}

function libro(formulas: Record<string, string>, valores: Record<string, number> = {}) {
  const f: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => ({ hoja: H, ...posicion(ref), formula }));
  const v: ValorCelda[] = Object.entries(valores).map(([ref, x]) => ({ hoja: H, ...posicion(ref), valor: { tipo: NUMERO, numero: x } }));
  return { formulas: f, grafo: construirGrafo(f, v).grafo };
}

describe('leer las declaraciones', () => {
  it('RIESGO.SALIDA con y sin nombre, y RIESGO.CORRELACION con número, porcentaje o celda', () => {
    const { grafo } = libro({
      A1: 'RIESGO.NORMAL(100,10)', A2: 'RIESGO.NORMAL(50,5)',
      B1: 'RIESGO.SALIDA("Suma")+A1+A2', B2: 'RIESGO.SALIDA()+A1', B3: '_xludf.RIESGO.SALIDA()*0+A2',
      C1: 'RIESGO.CORRELACION(A1,A2,0.8)', C2: 'RIESGO.CORRELACION(A1,A2,-50%)', C3: 'RIESGO.CORRELACION(A1,A2,D1)',
    }, { D1: 0.3 });
    const d = leerDeclaraciones(grafo);
    expect(d.errores).toEqual([]);
    expect(d.salidas.map((s) => [s.clave, s.nombre])).toEqual([[k('B1'), 'Suma'], [k('B2'), undefined], [k('B3'), undefined]]);
    expect(d.salidas[0]?.direccion).toBe('Hoja1!B1');
    expect(d.correlaciones.map((c) => c.coeficiente)).toEqual([0.8, -0.5, 0.3]);
    expect(d.correlaciones[0]).toMatchObject({ claveA: k('A1'), claveB: k('A2') });
  });

  it('los errores dicen la celda y el motivo', () => {
    const { grafo } = libro({
      A1: 'RIESGO.NORMAL(100,10)', A2: 'RIESGO.NORMAL(50,5)', D2: 'A1*2',
      B1: 'RIESGO.SALIDA(5)+A1', B2: 'RIESGO.SALIDA("a","b")',
      C1: 'RIESGO.CORRELACION(A1,A2,1.5)', C2: 'RIESGO.CORRELACION(A1,A1,0.5)', C3: 'RIESGO.CORRELACION(A1:A2,A2,0.5)',
      C4: 'RIESGO.CORRELACION(A1,A2,D2)', C5: 'RIESGO.CORRELACION(A1,A2)',
    });
    const errores = leerDeclaraciones(grafo).errores;
    expect(errores).toHaveLength(7);
    expect(errores[0]).toMatch(/^Hoja1!B1: .*texto entre comillas/);
    expect(errores.find((e) => e.startsWith('Hoja1!C1'))).toMatch(/entre -1 y 1 \(es 1\.5\)/);
    expect(errores.find((e) => e.startsWith('Hoja1!C2'))).toMatch(/dos celdas distintas/);
    expect(errores.find((e) => e.startsWith('Hoja1!C4'))).toMatch(/número escrito o una celda con un número/);
    expect(errores.find((e) => e.startsWith('Hoja1!C5'))).toMatch(/3 argumentos/);
  });

  it('al sustituir, la salida vale 0 y la correlación su coeficiente; sin dependencias de las entradas', () => {
    const { grafo } = libro({ A1: 'RIESGO.NORMAL(100,10)', A2: 'RIESGO.NORMAL(50,5)', B1: 'RIESGO.SALIDA("S")+A1+A2', C1: 'RIESGO.CORRELACION(A1,A2,0.7)' });
    const d = leerDeclaraciones(grafo);
    sustituirDeclaraciones(grafo, d.celdas);
    expect(grafo.nodos.get(k('C1'))?.ast).toMatchObject({ tipo: 'numero', valor: 0.7 });
    expect([...(grafo.dependencias.get(k('C1')) ?? [])]).toEqual([]);
    const b1 = grafo.nodos.get(k('B1'))?.ast as { tipo: string; izq: { izq: { tipo: string; valor: number } } };
    expect(b1.izq.izq).toMatchObject({ tipo: 'numero', valor: 0 });
    expect([...(grafo.dependencias.get(k('B1')) ?? [])].sort()).toEqual([k('A1'), k('A2')]);
  });

  it('formulaSinSalida deja una fórmula que Excel entiende sin el complemento', () => {
    expect(formulaSinSalida('=RIESGO.SALIDA("Beneficio")+C10-C11')).toBe('=0+C10-C11');
    expect(formulaSinSalida('=_xludf.RIESGO.SALIDA()+C10')).toBe('=0+C10');
    expect(formulaSinSalida('=riesgo.salida( "a ""b""" ) + 1')).toBe('=0 + 1');
  });
});

describe('aplicar las correlaciones a las entradas', () => {
  const e = (id: string, correlations: { with: string; coefficient: number }[] = []) => ({ id, correlations });

  it('por la celda de cada entrada; si el panel ya las correlacionaba, manda la fórmula', () => {
    const r = aplicarCorrelacionesDeFunciones(
      [e('a', [{ with: 'b', coefficient: 0.2 }]), e('b'), e('c')],
      ['H!A1', 'H!A2', 'H!A3'],
      [{ direccion: 'H!C1', claveA: 'H!A2', claveB: 'H!A1', coeficiente: 0.9 }, { direccion: 'H!C2', claveA: 'H!A1', claveB: 'H!A3', coeficiente: -0.4 }],
    );
    expect(r.errores).toEqual([]);
    expect(r.entradas.find((x) => x.id === 'a')?.correlations).toEqual([{ with: 'c', coefficient: -0.4 }]);
    expect(r.entradas.find((x) => x.id === 'b')?.correlations).toEqual([{ with: 'a', coefficient: 0.9 }]);
  });

  it('una celda que no es entrada, o el mismo par con dos coeficientes, es un error', () => {
    const r = aplicarCorrelacionesDeFunciones([e('a'), e('b')], ['H!A1', 'H!A2'], [
      { direccion: 'H!C1', claveA: 'H!A1', claveB: 'H!Z9', coeficiente: 0.5 },
      { direccion: 'H!C2', claveA: 'H!A1', claveB: 'H!A2', coeficiente: 0.5 },
      { direccion: 'H!C3', claveA: 'H!A2', claveB: 'H!A1', coeficiente: 0.5 },
      { direccion: 'H!C4', claveA: 'H!A2', claveB: 'H!A1', coeficiente: 0.6 },
    ]);
    expect(r.errores).toEqual([
      'H!C1: H!Z9 no es una entrada (ni tiene una función RIESGO ni está en el panel)',
      'H!C4: esas dos entradas ya se correlacionan en otra celda con otro coeficiente (0.5)',
    ]);
    expect(r.entradas[0]?.correlations).toEqual([{ with: 'b', coefficient: 0.5 }]);
    expect(r.entradas[1]?.correlations).toEqual([]);
  });
});

describe('simulación completa: la correlación se nota', () => {
  async function desviacionDeLaSuma(correlacion: string | null): Promise<number> {
    const formulas: Record<string, string> = { A1: 'RIESGO.NORMAL(100,10)', A2: '1+RIESGO.NORMAL(49,5)', B1: 'RIESGO.SALIDA("Suma")+A1+A2' };
    if (correlacion) formulas.C1 = `RIESGO.CORRELACION(A1,A2,${correlacion})`;
    const { formulas: f, grafo } = libro(formulas);
    const dec = leerDeclaraciones(grafo);
    sustituirDeclaraciones(grafo, dec.celdas);
    const salidas = dec.salidas.map((s) => s.clave);
    const d = entradasDeFunciones(f, grafo, [], salidas);
    expect(d.errores).toEqual([]);
    const celdas = d.entradas.map((x) => d.celdaDeEntrada.get(x.id) as string);
    const c = aplicarCorrelacionesDeFunciones(d.entradas, celdas, dec.correlaciones);
    expect(c.errores).toEqual([]);
    aplicarReescrituras(grafo, d);
    const base = modeloVacio();
    const n = 20_000;
    const modelo = { ...base, inputs: c.entradas, outputs: [{ id: 's', name: 'Suma', ref: 'B1' }], settings: { ...base.settings, iterations: n, seed: 5 } };
    const p = prepararEntradas(modelo, resolverConFunciones((ref) => k(ref), d), 5);
    if (!p.ok) throw new Error(p.errores.join('; '));
    const plan = compilarPlan(grafo, new Set(d.claves), salidas);
    if (!plan.ok) throw new Error(plan.error.motivo);
    const r = await simularPorBloques(grafo, plan.plan, p.entradas, 5, n);
    if (!r.ok) throw new Error(r.error.motivo);
    const w = (r.porSalida.get(salidas[0] as string) as { welford: { m2: number; n: number; media: number } }).welford;
    expect(w.media).toBeCloseTo(150, 0);
    return Math.sqrt(w.m2 / (w.n - 1));
  }

  it('sin correlación √125 ≈ 11,2; con 0,9 √215 ≈ 14,7; con -0,9 √35 ≈ 5,9', async () => {
    expect(await desviacionDeLaSuma(null)).toBeCloseTo(Math.sqrt(125), 0);
    expect(await desviacionDeLaSuma('0.9')).toBeCloseTo(Math.sqrt(215), 0);
    expect(await desviacionDeLaSuma('-0.9')).toBeCloseTo(Math.sqrt(35), 0);
  });
});

describe('compartir el libro', () => {
  const formulas: FormulaCelda[] = [
    { hoja: 'Pruebas', col: 3, fila: 46, formula: '=RIESGO.NORMAL(100,10)' },
    { hoja: 'Pruebas', col: 3, fila: 47, formula: '=RIESGO.NORMAL(50,5)' },
    { hoja: 'Pruebas', col: 3, fila: 48, formula: '=RIESGO.CORRELACION(C46,C47,0.9)' },
    { hoja: 'Pruebas', col: 3, fila: 49, formula: '=RIESGO.SALIDA("Suma correlada")+C46+C47' },
  ];

  it('la salida conserva la fórmula sin la llamada; la correlación se fija; ambas pasan al panel', () => {
    const plan = planificarCompartir(formulas);
    expect(plan.conversiones.map((c) => c.direccion)).toEqual(['Pruebas!C46', 'Pruebas!C47']);
    expect(plan.congelar).toEqual([
      { direccion: 'Pruebas!C48', clave: expect.any(String), formula: '=RIESGO.CORRELACION(C46,C47,0.9)' },
      { direccion: 'Pruebas!C49', clave: expect.any(String), formula: '=RIESGO.SALIDA("Suma correlada")+C46+C47', formulaNueva: '=0+C46+C47' },
    ]);
    const m = modeloParaCompartir(modeloVacio(), plan);
    expect(m.outputs).toMatchObject([{ name: 'Suma correlada', ref: 'Pruebas!C49' }]);
    const [a, b] = m.inputs;
    expect(a?.correlations).toEqual([{ with: b?.id, coefficient: 0.9 }]);

    const restaurado = modeloRestaurado(m, plan.congelar.map((c) => c.direccion).concat(plan.conversiones.map((c) => c.direccion)));
    expect(restaurado.inputs).toEqual([]);
    expect(restaurado.outputs).toEqual([]);
  });
});

describe('en Excel', () => {
  type Funcion = (...args: unknown[]) => unknown;
  const registradas = new Map<string, Funcion>();
  beforeAll(async () => {
    class ErrorCF extends Error {
      codigo: unknown;
      constructor(codigo: unknown, mensaje?: string) {
        super(mensaje);
        this.codigo = codigo;
      }
    }
    (globalThis as unknown as { CustomFunctions: unknown }).CustomFunctions = {
      associate: (id: string, f: Funcion) => registradas.set(id, f),
      Error: ErrorCF,
      ErrorCode: { invalidNumber: '#NUM!', invalidName: '#NAME?', invalidValue: '#VALUE!', notAvailable: '#N/A' },
    };
    await import('../../ui/funciones.ts');
  });

  it('RIESGO.SALIDA vale 0 y RIESGO.CORRELACION su coeficiente', () => {
    expect(registradas.get('SALIDA')?.('Beneficio')).toBe(0);
    expect(registradas.get('SALIDA')?.()).toBe(0);
    expect(registradas.get('CORRELACION')?.(100, 50, 0.7)).toBe(0.7);
    expect(() => registradas.get('CORRELACION')?.(100, 50, 2)).toThrow(/entre -1 y 1/);
    expect(() => registradas.get('SALIDA')?.(5)).toThrow(/texto/);
  });

  it('los metadatos las describen', () => {
    const m = metadatosFunciones() as { functions: { id: string; parameters: { optional?: boolean }[] }[] };
    expect(m.functions.find((f) => f.id === 'SALIDA')?.parameters[0]?.optional).toBe(true);
    expect(m.functions.find((f) => f.id === 'CORRELACION')?.parameters).toHaveLength(3);
  });
});
