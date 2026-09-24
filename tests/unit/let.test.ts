/**
 * `LET`, resuelto al parsear (`engine/parser/let.ts`) y evaluado por el motor
 * completo.
 */
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { elegirMotor } from '../../engine/modelo/index.ts';
import { parsear } from '../../engine/parser/parse.ts';
import { NODOS_MAXIMOS } from '../../engine/parser/let.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { numeroEn, textoEn, tipoEn, errorEn, ERROR, NUMERO, TEXTO, type Columna } from '../../engine/values/columna.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

function evaluar(formula: string, datos: Record<string, string> = {}): Columna {
  const g = grafoDe({ ...datos, Z1: formula });
  const r = evaluarModelo(g, new Map(), [k('Z1')], 1);
  if (!r.ok) throw new Error(r.error.motivo);
  return r.valores.get(k('Z1')) as Columna;
}

const num = (f: string, d?: Record<string, string>) => {
  const c = evaluar(f, d);
  expect(tipoEn(c, 0)).toBe(NUMERO);
  return numeroEn(c, 0);
};

describe('LET', () => {
  it('el ejemplo de Microsoft: LET(x; 5; SUMA(x; 1))', () => {
    expect(num('LET(x,5,SUM(x,1))')).toBe(6);
  });

  it('cada nombre puede usar los anteriores', () => {
    expect(num('LET(a,A1*2,b,a+1,a*b)', { A1: '3' })).toBe(42); // a=6, b=7
  });

  it('un LET dentro de otro redefine el nombre solo dentro', () => {
    expect(num('LET(x,1,LET(x,10,x)+x)')).toBe(11);
  });

  it('los nombres no distinguen mayúsculas', () => {
    expect(num('LET(Tasa,0.1,TASA*100)')).toBeCloseTo(10, 12);
  });

  it('un nombre fuera de todo LET sigue siendo un nombre definido del libro', () => {
    const r = parsear('LET(x,1,x)+y');
    expect(r.ok && r.ast.tipo).toBe('binaria');
    if (r.ok && r.ast.tipo === 'binaria') expect(r.ast.der).toMatchObject({ tipo: 'nombre', nombre: 'y' });
  });

  it('acepta la forma del XML: _xlfn.LET con parámetros _xlpm.', () => {
    expect(num('_xlfn.LET(_xlpm.x,4,_xlpm.x*_xlpm.x)')).toBe(16);
  });

  it('conserva los tipos: texto y errores pasan tal cual', () => {
    const t = evaluar('LET(s,"hola",UPPER(s))');
    expect(tipoEn(t, 0)).toBe(TEXTO);
    expect(textoEn(t, 0)).toBe('HOLA');
    const e = evaluar('LET(d,1/0,IFERROR(d,-1)+d)');
    expect(tipoEn(e, 0)).toBe(ERROR);
    expect(errorEn(e, 0)).toBe('#DIV/0!');
  });

  it('mal formado (número par de argumentos) no se evalúa: queda como no soportado', () => {
    const r = parsear('LET(x,1)');
    expect(r.ok && r.ast.tipo).toBe('no-soportado');
  });

  it('una cadena que crece exponencialmente se rechaza en vez de colgar', () => {
    // Nombres como "a1" serían referencias a celdas; Excel tampoco los admite.
    const partes = ['v_0', '1'];
    for (let i = 1; i <= 20; i++) partes.push(`v_${i}`, `v_${i - 1}+v_${i - 1}`);
    const r = parsear(`LET(${partes.join(',')},v_20)`);
    expect(r.ok && r.ast.tipo).toBe('no-soportado');
    if (r.ok && r.ast.tipo === 'no-soportado') expect(r.ast.motivo).toContain(String(NODOS_MAXIMOS));
  });
});

describe('LET en una simulación', () => {
  it('las dependencias salen del árbol expandido: el motor rápido lo acepta y simula', async () => {
    const g = grafoDe({ B1: 'LET(margen,A1-A2,margen*100)', A2: '4' });
    const eleccion = elegirMotor(g, [k('A1')], [k('B1')], 'auto');
    expect(eleccion.motor).toBe('fast');

    const c = compilarPlan(g, new Set([k('A1')]), [k('B1')]);
    if (!c.ok) throw new Error(c.error.motivo);
    const r = await simularPorBloques(g, c.plan, [
      { tipo: 'distribucion', clave: k('A1'), id: 'a', distribucion: { tipo: 'uniforme', min: 5, max: 7 }, metodo: 'monte-carlo' },
    ], 1, 20_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.porSalida.get(k('B1'))?.welford.media).toBeCloseTo(200, 0); // (6-4)*100
  });
});
