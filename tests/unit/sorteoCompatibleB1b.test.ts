/**
 * B1b: con Excel en el bucle, la función RIESGO de una celda que conserva su
 * fórmula devuelve el sorteo de la iteración en curso.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { empezarSimulacionEnExcel, terminarSimulacionEnExcel } from '../../excel/modoLibroCompartido.ts';
import { analizarRiesgoEnGrafo } from '../../engine/modelo/index.ts';
import { claveDeReferencia, construirGrafo } from '../../engine/graph/index.ts';

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

const invocacion = (address: string) => ({ address });

describe('la función devuelve el sorteo que le toca', () => {
  it('una celda con la función dentro de una operación: la muestra de la iteración', () => {
    const sim = empezarSimulacionEnExcel(new Map([['PRUEBAS!C35', { tipo: 'muestra' as const, muestras: Float64Array.of(0.5, -1.2, 2) }]]));
    try {
      const normal = registradas.get('NORMAL') as Funcion;
      sim.iteracion = 1;
      expect(normal(0, 1, invocacion('[Libro1]Pruebas!C35'))).toBe(-1.2);
      sim.iteracion = 2;
      expect(normal(0, 1, invocacion('Pruebas!$C$35'))).toBe(2);
      // Evaluada dos veces en la misma iteración, lo mismo (Excel puede hacerlo).
      expect(normal(0, 1, invocacion('Pruebas!C35'))).toBe(2);
      // Otra celda sin sorteo: el modo del libro (la media).
      expect(normal(0, 1, invocacion('Pruebas!C99'))).toBe(0);
    } finally {
      terminarSimulacionEnExcel();
    }
  });

  it('con parámetros que cambian: el cuantil del uniforme con los argumentos de esta iteración', () => {
    const sim = empezarSimulacionEnExcel(new Map([['PRUEBAS!C36', { tipo: 'uniforme' as const, muestras: Float64Array.of(0.5, 0.975) }]]));
    try {
      const normal = registradas.get('NORMAL') as Funcion;
      sim.iteracion = 0;
      expect(normal(1000, 50, invocacion('Pruebas!C36'))).toBeCloseTo(1000, 9);
      sim.iteracion = 1;
      // La media es ahora otra (la de C34 en esta iteración): 1200 + 50·1,96.
      expect(normal(1200, 50, invocacion('Pruebas!C36')) as number).toBeCloseTo(1200 + 50 * 1.959964, 3);
    } finally {
      terminarSimulacionEnExcel();
    }
  });

  it('fuera de una simulación, el modo del libro de siempre', () => {
    expect(registradas.get('TRIANGULAR')?.(8, 10, 14, invocacion('Pruebas!C6'))).toBeCloseTo(32 / 3, 12);
  });
});

describe('qué celdas reescritas puede simular el modo compatible', () => {
  const H = 'Hoja1';
  const k = (r: string) => claveDeReferencia(H, r);
  const f = (ref: string, formula: string) => ({ hoja: H, col: ref.charCodeAt(0) - 64, fila: Number(ref.slice(1)), formula });

  it('una función por celda sí; dos en la misma fórmula, o TRUNCAR con parámetros aleatorios, no', () => {
    const { grafo } = construirGrafo([
      f('A1', 'RIESGO.NORMAL(100,10)'),
      f('B1', '1+RIESGO.NORMAL(0,1)'),
      f('B2', 'RIESGO.NORMAL(A1,5)'),
      f('B3', 'RIESGO.UNIFORME(0,1)+RIESGO.UNIFORME(0,1)'),
      f('B4', 'RIESGO.TRUNCAR(RIESGO.NORMAL(A1,20),90,110)'),
      f('C1', 'B1+B2+B3+B4'),
    ]);
    const r = analizarRiesgoEnGrafo(grafo, { clavesEntradaPanel: [], clavesSalida: [k('C1')] });
    expect(r.reescritas.sort()).toEqual([k('B1'), k('B2'), k('B3'), k('B4')]);
    expect([...r.noCompatibles.keys()].sort()).toEqual([k('B3'), k('B4')]);
    expect(r.noCompatibles.get(k('B3'))).toMatch(/varias funciones RIESGO/);
  });
});
