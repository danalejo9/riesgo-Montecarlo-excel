import { describe, expect, it } from 'vitest';

import { modeloVacio } from '../../engine/modelo/index.ts';
import {
  compararSalida, restaurarReferencia, salidaDeReferencia, serializarReferencia,
} from '../../excel/comparacion.ts';
import type { ResultadoSalida, SimulacionCompletada } from '../../excel/informe.ts';

function salida(media: number, desplazamiento: number): ResultadoSalida {
  return {
    id: 'out_v', nombre: 'VAN', ref: 'Hoja1!B1', noNumericas: 0,
    resumen: { n: 1000, media, desviacion: 10, min: 0, max: 100, percentiles: { p5: media - 16, p50: media, p95: media + 16 }, percentilesAproximados: true },
    cdf: [],
    // 1.000 valores de desplazamiento a desplazamiento+999.
    muestraOrdenada: Float64Array.from({ length: 1000 }, (_, i) => i + desplazamiento),
  };
}

describe('compararSalida', () => {
  it('diferencias como actual − referencia', () => {
    const filas = compararSalida(salida(120, 0), salida(100, 0));
    expect(filas.find((f) => f.medida === 'Media')).toEqual({ medida: 'Media', referencia: 100, actual: 120, diferencia: 20 });
    expect(filas.map((f) => f.medida)).toEqual(['Media', 'Desviación', 'p5', 'p50', 'p95']);
  });

  it('con umbral, compara también la probabilidad', () => {
    // Referencia: valores 0..999 → P(<500) = 0,5. Actual: 200..1199 → 0,3.
    const filas = compararSalida(salida(700, 200), salida(500, 0), { value: 500, direction: 'below' });
    const p = filas.find((f) => f.esProbabilidad);
    expect(p?.medida).toBe('P(< 500)');
    expect(p?.referencia).toBe(0.5);
    expect(p?.actual).toBe(0.3);
    expect(p?.diferencia).toBeCloseTo(-0.2, 12);
  });
});

describe('guardar la referencia', () => {
  it('ida y vuelta con su etiqueta, emparejando salidas por id', () => {
    const m = modeloVacio();
    m.outputs.push({ id: 'out_v', name: 'VAN', ref: 'Hoja1!B1' });
    const r: SimulacionCompletada = {
      ok: true, motor: 'fast', iteracionesCompletadas: 1000, cancelada: false, milisegundos: 5,
      eleccion: { motor: 'fast', motivos: [], salidasConstantes: [], celdasDesconocidas: [], celdasNecesarias: 1 },
      lectura: { hojas: 1, hojasVisibles: 1, celdasRecorridas: 1, celdasConContenido: 1, formulas: 1, sincronizaciones: 1, milisegundos: 1 },
      idSimulacion: '2026-09-24T10:00:00.000Z',
      salidas: [salida(100, 0)],
    };
    const ref = restaurarReferencia(serializarReferencia(m, 'Sin refinanciación', r));
    expect(ref?.etiqueta).toBe('Sin refinanciación');
    expect(ref?.resultado.idSimulacion).toBe('2026-09-24T10:00:00.000Z');
    expect(ref && salidaDeReferencia(ref, 'out_v')?.resumen.media).toBe(100);
    expect(ref && salidaDeReferencia(ref, 'otra')).toBeUndefined();
  });

  it('lo que no se entiende es null, sin romper', () => {
    expect(restaurarReferencia('basura')).toBeNull();
    expect(restaurarReferencia('{"etiqueta":"x","datos":"{}"}')).toBeNull();
  });
});
