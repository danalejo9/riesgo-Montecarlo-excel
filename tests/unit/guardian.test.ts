import { describe, expect, it } from 'vitest';

import {
  descartarRecuperacion,
  finalizarProteccion,
  hayRecuperacionPendiente,
  iniciarProteccion,
  restaurarDesdeRecuperacion,
  type AlmacenGuardian,
  type RecoveryRecord,
} from '../../engine/modelo/guardian.ts';

/** Almacén en memoria, para probar la lógica sin Office.js. */
function almacenFalso(valoresIniciales: Record<string, number>, modoInicial = 'automatic') {
  const valores = { ...valoresIniciales };
  let modo = modoInicial;
  let recovery: RecoveryRecord | undefined;

  const store: AlmacenGuardian = {
    readRecovery: () => recovery,
    writeRecovery: (r) => { recovery = r; },
    clearRecovery: () => { recovery = undefined; },
    readCalculationMode: () => modo,
    setCalculationMode: (m) => { modo = m; },
    readValue: (ref) => valores[ref] as number,
    writeValue: (ref, v) => { valores[ref] = v; },
  };

  return { store, valores: () => ({ ...valores }), modo: () => modo, recovery: () => recovery };
}

describe('iniciarProteccion', () => {
  it('guarda el modo de cálculo y los valores originales, y cambia al modo pedido', () => {
    const a = almacenFalso({ RM_in_acero: 950, RM_in_cemento: 300 }, 'automatic');
    const r = iniciarProteccion(a.store, ['RM_in_acero', 'RM_in_cemento'], 'manual', () => '2026-09-19T10:00:00.000Z');

    expect(r.ok).toBe(true);
    expect(a.modo()).toBe('manual');
    expect(a.recovery()).toEqual({
      schema: 1,
      startedAt: '2026-09-19T10:00:00.000Z',
      calculationMode: 'automatic',
      originalValues: { RM_in_acero: 950, RM_in_cemento: 300 },
    });
    // Las celdas en sí no se tocan al iniciar, solo se leen.
    expect(a.valores()).toEqual({ RM_in_acero: 950, RM_in_cemento: 300 });
  });

  it('no pisa un registro de recuperación ya existente', () => {
    const a = almacenFalso({ RM_x: 1 });
    iniciarProteccion(a.store, ['RM_x'], 'manual');
    a.valores(); // no-op, solo para legibilidad
    const segundo = iniciarProteccion(a.store, ['RM_x'], 'manual');
    expect(segundo.ok).toBe(false);
  });
});

describe('finalizarProteccion', () => {
  it('restaura el modo de cálculo original y borra el registro, sin tocar las celdas', () => {
    const a = almacenFalso({ RM_x: 10 }, 'automatic');
    iniciarProteccion(a.store, ['RM_x'], 'manual');
    a.store.writeValue('RM_x', 999); // la simulación cambió la celda de verdad

    finalizarProteccion(a.store);

    expect(a.modo()).toBe('automatic');
    expect(a.recovery()).toBeUndefined();
    expect(a.valores()).toEqual({ RM_x: 999 }); // finalizar con éxito no restaura el valor
  });

  it('no hace nada si no hay ninguna protección activa', () => {
    const a = almacenFalso({ RM_x: 1 }, 'manual');
    finalizarProteccion(a.store);
    expect(a.modo()).toBe('manual');
  });
});

describe('hayRecuperacionPendiente / restaurarDesdeRecuperacion / descartarRecuperacion', () => {
  it('detecta una recuperación pendiente tras un cierre a medio camino', () => {
    const a = almacenFalso({ RM_x: 10 }, 'automatic');
    iniciarProteccion(a.store, ['RM_x'], 'manual');
    a.store.writeValue('RM_x', 12345); // simulación a medias, nunca llamó a finalizarProteccion

    const pendiente = hayRecuperacionPendiente(a.store);
    expect(pendiente).toBeDefined();
    expect(pendiente?.originalValues).toEqual({ RM_x: 10 });
  });

  it('restaurar devuelve las celdas y el modo de cálculo a como estaban, y limpia el registro', () => {
    const a = almacenFalso({ RM_x: 10, RM_y: 20 }, 'automatic');
    iniciarProteccion(a.store, ['RM_x', 'RM_y'], 'manual');
    a.store.writeValue('RM_x', 999);
    a.store.writeValue('RM_y', 888);

    restaurarDesdeRecuperacion(a.store);

    expect(a.valores()).toEqual({ RM_x: 10, RM_y: 20 });
    expect(a.modo()).toBe('automatic');
    expect(a.recovery()).toBeUndefined();
  });

  it('descartar limpia el registro sin tocar celdas ni modo de cálculo', () => {
    const a = almacenFalso({ RM_x: 10 }, 'automatic');
    iniciarProteccion(a.store, ['RM_x'], 'manual');
    a.store.writeValue('RM_x', 999);

    descartarRecuperacion(a.store);

    expect(a.valores()).toEqual({ RM_x: 999 }); // se queda como el usuario decidió
    expect(a.modo()).toBe('manual'); // tampoco se restaura el modo
    expect(a.recovery()).toBeUndefined();
  });

  it('después de restaurar o descartar, se puede iniciar una protección nueva', () => {
    const a = almacenFalso({ RM_x: 10 }, 'automatic');
    iniciarProteccion(a.store, ['RM_x'], 'manual');
    restaurarDesdeRecuperacion(a.store);

    const r = iniciarProteccion(a.store, ['RM_x'], 'manual');
    expect(r.ok).toBe(true);
  });
});
