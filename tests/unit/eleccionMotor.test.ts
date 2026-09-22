/**
 * La prueba que de verdad importa aquí no es que `elegirMotor` devuelva lo
 * que yo creo: es que **coincida con lo que el evaluador hace de verdad**.
 * Predecir de más manda al modo lento a quien no lo necesita; predecir de
 * menos promete una simulación que va a fallar a mitad.
 *
 * Por eso cada caso incompatible se comprueba dos veces: que `elegirMotor` lo
 * señale, y que el evaluador real efectivamente falle con esa fórmula.
 */
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { describirMotivo, elegirMotor } from '../../engine/modelo/eleccionMotor.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.toUpperCase().charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

/** ¿El evaluador de verdad sabe calcular esta salida? */
function elEvaluadorPuede(grafo: ReturnType<typeof grafoDe>, entrada: string, salida: string): boolean {
  const entradas = new Map([[k(entrada), Float64Array.from([1, 2])]]);
  return evaluarModelo(grafo, entradas, [k(salida)], 2).ok;
}

describe('elegirMotor — cuando el motor rápido sirve', () => {
  it('un modelo de funciones conocidas va por el rápido, sin motivos', () => {
    const g = grafoDe({ B1: 'SUM(A1:A1)*2', C1: 'IF(B1>3,B1,0)' });
    const e = elegirMotor(g, [k('A1')], [k('C1')]);

    expect(e.motor).toBe('fast');
    expect(e.motivos).toEqual([]);
    expect(e.celdasDesconocidas).toEqual([]);
    expect(elEvaluadorPuede(g, 'A1', 'C1')).toBe(true);
  });

  it('cuenta las celdas necesarias para las salidas pedidas', () => {
    const g = grafoDe({ B1: 'A1*2', C1: 'B1+1', D1: 'A1*99' });
    // D1 no hace falta para C1, así que no se cuenta.
    expect(elegirMotor(g, [k('A1')], [k('C1')]).celdasNecesarias).toBe(3);
  });
});

describe('elegirMotor — las cinco cosas que el evaluador rechaza', () => {
  it('una función que el motor no conoce', () => {
    const g = grafoDe({ B1: 'YEARFRAC(A1,A1)' });
    const e = elegirMotor(g, [k('A1')], [k('B1')]);

    expect(e.motor).toBe('compatible');
    expect(e.motivos).toEqual([{ tipo: 'funcion', clave: k('B1'), nombre: 'YEARFRAC' }]);
    expect(elEvaluadorPuede(g, 'A1', 'B1')).toBe(false);
  });

  it('una fórmula matricial: rango por rango', () => {
    const g = grafoDe({ B1: 'SUM(A1:A3*C1:C3)' });
    const e = elegirMotor(g, [k('A1')], [k('B1')]);

    expect(e.motor).toBe('compatible');
    expect(e.motivos.map((m) => m.tipo)).toEqual(['matricial']);
    expect(elEvaluadorPuede(g, 'A1', 'B1')).toBe(false);
  });

  it('un nombre definido sin resolver', () => {
    const g = grafoDe({ B1: 'Tasa*A1' });
    const e = elegirMotor(g, [k('A1')], [k('B1')]);

    expect(e.motor).toBe('compatible');
    expect(e.motivos).toEqual([{ tipo: 'nombre', clave: k('B1'), nombre: 'Tasa' }]);
    expect(elEvaluadorPuede(g, 'A1', 'B1')).toBe(false);
  });

  it('una constante matricial', () => {
    const g = grafoDe({ B1: 'SUM({1,2,3})+A1' });
    const e = elegirMotor(g, [k('A1')], [k('B1')]);

    expect(e.motor).toBe('compatible');
    expect(e.motivos.map((m) => m.tipo)).toEqual(['matriz']);
    expect(elEvaluadorPuede(g, 'A1', 'B1')).toBe(false);
  });

  it('una fórmula que el parser no entiende', () => {
    const g = grafoDe({ B1: 'A1 +* 2' });
    const e = elegirMotor(g, [k('A1')], [k('B1')]);

    expect(e.motor).toBe('compatible');
    expect(e.motivos.map((m) => m.tipo)).toEqual(['sintaxis']);
    expect(elEvaluadorPuede(g, 'A1', 'B1')).toBe(false);
  });
});

describe('elegirMotor — lo que mira y lo que avisa', () => {
  it('una función que falta en una celda constante bloquea igual', () => {
    // C1 no depende de A1, pero hay que evaluarla una vez para tener B1.
    const g = grafoDe({ B1: 'A1+C1', C1: 'YEARFRAC("2026-01-01","2026-06-01")' });
    const e = elegirMotor(g, [k('A1')], [k('B1')]);

    expect(e.motor).toBe('compatible');
    expect(e.motivos[0]).toMatchObject({ tipo: 'funcion', nombre: 'YEARFRAC' });
  });

  it('la misma función en mil celdas es un motivo, con la primera celda', () => {
    const g = grafoDe({ B1: 'YEARFRAC(A1,A1)', B2: 'YEARFRAC(A1,A1)', B3: 'B1+B2' });
    const e = elegirMotor(g, [k('A1')], [k('B3')]);

    expect(e.motivos).toHaveLength(1);
    expect(e.motivos[0]).toMatchObject({ tipo: 'funcion', nombre: 'YEARFRAC' });
  });

  it('avisa de una salida que no depende de ninguna entrada', () => {
    const g = grafoDe({ B1: 'A1*2', C1: '40+2' });
    const e = elegirMotor(g, [k('A1')], [k('B1'), k('C1')]);

    expect(e.motor).toBe('fast');
    expect(e.salidasConstantes).toEqual([k('C1')]);
  });

  it('avisa de una celda que no existe en el libro', () => {
    const g = grafoDe({ B1: 'A1*2' });
    const e = elegirMotor(g, [k('A1')], [k('Z99')]);

    expect(e.celdasDesconocidas).toEqual([k('Z99')]);
  });
});

describe('elegirMotor — la preferencia del usuario manda, pero no oculta nada', () => {
  it('forzar el compatible con un modelo que el rápido podría', () => {
    const g = grafoDe({ B1: 'A1*2' });
    const e = elegirMotor(g, [k('A1')], [k('B1')], 'compatible');

    expect(e.motor).toBe('compatible');
    expect(e.motivos).toEqual([]);
  });

  it('forzar el rápido con un modelo que no puede devuelve los motivos igual', () => {
    const g = grafoDe({ B1: 'YEARFRAC(A1,A1)' });
    const e = elegirMotor(g, [k('A1')], [k('B1')], 'fast');

    expect(e.motor).toBe('fast');
    expect(e.motivos).toHaveLength(1);
  });
});

describe('describirMotivo', () => {
  it('dice la celda y la causa, en palabras del usuario', () => {
    expect(describirMotivo({ tipo: 'funcion', clave: 'Flujo!D12', nombre: 'YEARFRAC' })).toBe(
      'Flujo!D12 usa YEARFRAC, que el motor rápido no conoce todavía.',
    );
    expect(describirMotivo({ tipo: 'matricial', clave: 'Con Refi!E47' })).toContain('rangos enteros');
  });
});
