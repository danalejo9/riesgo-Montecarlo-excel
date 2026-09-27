import { describe, expect, it } from 'vitest';

import { modeloVacio } from '../../engine/modelo/index.ts';
import { serializarReferencia } from '../../excel/comparacion.ts';
import {
  elegirActivo, escenarioActivo, guardarEscenario, MAXIMO_ESCENARIOS, quitarEscenario, restaurarEscenarios,
  serializarEscenarios, tablaEscenarios, vacio,
} from '../../excel/escenarios.ts';
import type { ResultadoSalida, SimulacionCompletada } from '../../excel/informe.ts';

function salida(media: number): ResultadoSalida {
  return {
    id: 'out_v', nombre: 'VAN', ref: 'Hoja1!B1', noNumericas: 0,
    resumen: { n: 1000, media, desviacion: 10, min: 0, max: 100, percentiles: { p5: media - 16, p50: media, p95: media + 16 }, percentilesAproximados: true },
    cdf: [],
    muestraOrdenada: Float64Array.from({ length: 1000 }, (_, i) => i + media - 500),
  };
}

function simulacion(media: number, id: string): SimulacionCompletada {
  return {
    ok: true, motor: 'fast', iteracionesCompletadas: 1000, cancelada: false, milisegundos: 5,
    eleccion: { motor: 'fast', motivos: [], salidasConstantes: [], celdasDesconocidas: [], celdasNecesarias: 1 },
    lectura: { hojas: 1, hojasVisibles: 1, celdasRecorridas: 1, celdasConContenido: 1, formulas: 1, sincronizaciones: 1, milisegundos: 1 },
    idSimulacion: id,
    salidas: [salida(media)],
  };
}

const modelo = () => {
  const m = modeloVacio();
  m.outputs.push({ id: 'out_v', name: 'VAN', ref: 'Hoja1!B1' });
  return m;
};

describe('administrador de escenarios (E7)', () => {
  it('guardar varios; el primero queda activo y guardar otro no lo cambia; el mismo nombre sustituye', () => {
    let a = vacio();
    const r1 = guardarEscenario(a, 'Base', simulacion(100, 's1'));
    if (!r1.ok) throw new Error();
    const r2 = guardarEscenario(r1.almacen, 'Con refinanciación', simulacion(130, 's2'));
    if (!r2.ok) throw new Error();
    a = r2.almacen;
    expect(a.escenarios.map((e) => e.etiqueta)).toEqual(['Base', 'Con refinanciación']);
    expect(escenarioActivo(a)?.etiqueta).toBe('Base');

    const r3 = guardarEscenario(a, 'Base', simulacion(110, 's3'));
    if (!r3.ok) throw new Error();
    expect(r3.almacen.escenarios).toHaveLength(2);
    expect(r3.almacen.escenarios[0]?.resultado.salidas[0]?.resumen.media).toBe(110);
  });

  it('no borra ninguno sin preguntar cuando no caben más', () => {
    let a = vacio();
    for (let i = 0; i < MAXIMO_ESCENARIOS; i++) {
      const r = guardarEscenario(a, `E${i}`, simulacion(i, `s${i}`));
      if (!r.ok) throw new Error();
      a = r.almacen;
    }
    const r = guardarEscenario(a, 'Uno más', simulacion(1, 'x'));
    expect(r.ok).toBe(false);
  });

  it('quitar el activo deja sin activo; elegir otro', () => {
    const r1 = guardarEscenario(vacio(), 'A', simulacion(1, 'a'));
    if (!r1.ok) throw new Error();
    const r2 = guardarEscenario(r1.almacen, 'B', simulacion(2, 'b'));
    if (!r2.ok) throw new Error();
    const conB = elegirActivo(r2.almacen, r2.id);
    const sinB = quitarEscenario(conB, r2.id);
    expect(escenarioActivo(sinB)).toBeNull();
    expect(escenarioActivo(elegirActivo(sinB, r1.id))?.etiqueta).toBe('A');
    expect(escenarioActivo(elegirActivo(sinB, null))).toBeNull();
  });

  it('ida y vuelta por el libro', () => {
    const r = guardarEscenario(vacio(), 'Base', simulacion(100, 's1'), new Date('2026-09-27T10:00:00Z'));
    if (!r.ok) throw new Error();
    const leido = restaurarEscenarios(serializarEscenarios(modelo(), r.almacen));
    expect(leido.escenarios[0]?.etiqueta).toBe('Base');
    expect(leido.escenarios[0]?.guardadoEn).toBe('2026-09-27T10:00:00.000Z');
    expect(escenarioActivo(leido)?.resultado.idSimulacion).toBe('s1');
  });

  it('la referencia única de antes pasa a ser el primer escenario, activo', () => {
    const legado = serializarReferencia(modelo(), 'Sin refinanciación', simulacion(90, 'viejo'));
    const a = restaurarEscenarios(null, legado);
    expect(a.escenarios.map((e) => e.etiqueta)).toEqual(['Sin refinanciación']);
    expect(escenarioActivo(a)?.etiqueta).toBe('Sin refinanciación');
    // Con escenarios ya guardados, el legado se ignora.
    expect(restaurarEscenarios(serializarEscenarios(modelo(), vacio()), legado).escenarios).toHaveLength(0);
  });

  it('lo ilegible no rompe', () => {
    expect(restaurarEscenarios('basura')).toEqual(vacio());
  });

  it('tabla con todos los escenarios y la simulación actual, sin repetirla', () => {
    const r1 = guardarEscenario(vacio(), 'Base', simulacion(100, 's1'));
    if (!r1.ok) throw new Error();
    const actual = simulacion(130, 's2');
    const filas = tablaEscenarios(actual.salidas[0]!, actual, r1.almacen, { value: 100, direction: 'below' });
    expect(filas.map((f) => f.etiqueta)).toEqual(['Base', 'Esta simulación']);
    expect(filas[0]?.probabilidad).toBe(0.5);
    expect(filas[1]?.probabilidad).toBeCloseTo(0.47, 2);

    // Recién guardada la actual como escenario: no sale dos veces.
    const r2 = guardarEscenario(r1.almacen, 'Refi', actual);
    if (!r2.ok) throw new Error();
    const otra = tablaEscenarios(actual.salidas[0]!, actual, r2.almacen);
    expect(otra.map((f) => f.etiqueta)).toEqual(['Base', 'Refi (esta simulación)']);
  });
});
