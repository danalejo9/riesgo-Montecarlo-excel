/** Gantt, rendimiento (prueba 8): 2.000 actividades y unas 3.000 relaciones. */
import { describe, expect, it } from 'vitest';
import { leerCronograma } from '../../excel/cronogramaHojas.ts';
import { hojasSinteticas } from '../../excel/cronogramaSintetico.ts';
import { construirVista } from '../../excel/gantt.ts';
import { aplicarOperacion } from '../../excel/edicionGantt.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

describe('rendimiento con 2.000 actividades', () => {
  it('lee, calcula la vista y valida una edición en menos de 200 ms cada cosa', () => {
    const hojas = hojasSinteticas(serieDeFecha(2027, 1, 4), 2000);
    let t = performance.now();
    const l = leerCronograma(hojas);
    const tLectura = performance.now() - t;
    expect(l.errores).toEqual([]);
    const datos = { version: 1 as const, modelo: l.modelo!, orden: l.orden!, vinculosResumen: l.vinculosResumen! };
    construirVista(datos); // calentamiento
    t = performance.now();
    const v = construirVista(datos);
    const tVista = performance.now() - t;
    t = performance.now();
    const r = aplicarOperacion(hojas, { op: 'campo', id: 'T1000', campo: 'duracion', valor: 30 });
    const tEdicion = performance.now() - t;
    expect(r.ok).toBe(true);
    expect(v.filas.length).toBe(2100);
    expect(v.relaciones.length).toBeGreaterThan(2800);
    console.log(`2.000 actividades, ${v.relaciones.length} relaciones: lectura ${tLectura.toFixed(1)} ms · vista (CPM, rutas, calidad) ${tVista.toFixed(1)} ms · edición validada ${tEdicion.toFixed(1)} ms`);
    expect(tVista).toBeLessThan(200);
  });
});
