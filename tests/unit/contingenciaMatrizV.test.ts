/**
 * V1: contingencia y probabilidad de cumplir el valor base. V2: matriz de
 * probabilidad e impacto del registro de riesgos.
 */
import { describe, expect, it } from 'vitest';

import { claseSugerida, contingencia } from '../../excel/contingencia.ts';
import { matrizDeRiesgos, nivelImpacto, nivelProbabilidad, severidad } from '../../excel/matrizRiesgos.ts';
import type { FilaRiesgo } from '../../excel/registroRiesgos.ts';

// 1.000 valores: 1, 2, …, 1.000.
const muestra = Float64Array.from({ length: 1000 }, (_, i) => i + 1);

describe('contingencia (V1)', () => {
  it('un coste: probabilidad de no pasarse del base y reserva para P50, P80 y P90', () => {
    const c = contingencia(muestra, 600, 'cost');
    expect(c?.probabilidadBase).toBe(0.6);
    expect(c?.niveles.map((n) => [n.confianza, n.percentil, n.valor, n.diferencia])).toEqual([
      [0.5, 0.5, 501, -99], [0.8, 0.8, 800, 200], [0.9, 0.9, 900, 300],
    ]);
    expect(c?.niveles[1]?.relativa).toBeCloseTo(200 / 600, 12);
  });

  it('un beneficio: probabilidad de alcanzar el base y lo que se obtiene con esa confianza', () => {
    const c = contingencia(muestra, 600, 'benefit');
    expect(c?.probabilidadBase).toBeCloseTo(0.401, 12); // 600…1.000
    const p80 = c?.niveles[1];
    expect(p80).toMatchObject({ confianza: 0.8, valor: 201, diferencia: 399 });
    expect(p80?.percentil).toBeCloseTo(0.2, 12);
  });

  it('sin base o sin muestra, nada; base 0 sin relativa', () => {
    expect(contingencia(muestra, NaN, 'cost')).toBeNull();
    expect(contingencia(new Float64Array(1), 1, 'cost')).toBeNull();
    expect(contingencia(muestra, 0, 'cost')?.niveles[0]?.relativa).toBeNull();
  });

  it('la clase que se propone por el nombre', () => {
    expect(claseSugerida('VAN del proyecto')).toBe('benefit');
    expect(claseSugerida('Ingresos')).toBe('benefit');
    expect(claseSugerida('Coste total')).toBe('cost');
    expect(claseSugerida('Fin de obra')).toBe('cost');
  });
});

describe('matriz de probabilidad e impacto (V2)', () => {
  it('bandas de probabilidad e impacto, y severidad', () => {
    expect([0.05, 0.1, 0.3, 0.5, 0.7, 0.95].map(nivelProbabilidad)).toEqual([0, 1, 2, 3, 4, 4]);
    expect([1000, 500, 250, 125, 62.5, 10].map((x) => nivelImpacto(x, 1000))).toEqual([4, 4, 3, 2, 1, 0]);
    expect([severidad(0, 0), severidad(1, 2), severidad(2, 2), severidad(3, 3), severidad(4, 4)]).toEqual(['baja', 'media', 'media', 'alta', 'critica']);
  });

  it('cada riesgo en su casilla; los de cifras variables, aparte', () => {
    const fila = (nombre: string, p: number | null, imp: number | null): FilaRiesgo => ({
      celda: `R!${nombre}`, nombre, probabilidad: p, impacto: '', impactoMedio: imp, impactoDesviacion: 0, valorEsperado: null, desviacion: null,
    });
    const m = matrizDeRiesgos([fila('A', 0.3, 30_000), fila('B', 0.1, 50_000), fila('C', null, 1000), fila('D', 0.75, 2000)]);
    expect(m.mayorImpacto).toBe(50_000);
    expect(m.ubicados.map((r) => [r.nombre, r.nivelProbabilidad, r.nivelImpacto, r.severidad])).toEqual([
      ['A', 2, 4, 'alta'], ['B', 1, 4, 'alta'], ['D', 4, 0, 'media'],
    ]);
    expect(m.casillas[4]?.[2]?.map((r) => r.nombre)).toEqual(['A']);
    expect(m.sinUbicar).toEqual(['C']);
  });
});
