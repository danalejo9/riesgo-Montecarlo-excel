/**
 * Ronda del 06/10: los ajustes del cronograma desde Configuración (hoja
 * Config) y la distribución del fin bajo el Gantt.
 */
import { describe, expect, it } from 'vitest';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { aplicarCambios } from '../../excel/edicionGantt.ts';
import { cambiosAjustesCronograma, leerAjustesCronograma } from '../../excel/ajustesCronograma.ts';
import { distribucionFinDe } from '../../excel/gantt.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { simularCronograma } from '../../engine/cronograma/index.ts';

const INI = serieDeFecha(2027, 1, 4);
type Libro = Record<string, unknown[][]>;
const libro = (): Libro => Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, h.valores.map((f) => [...f])]));

describe('ajustes del cronograma desde Configuración', () => {
  it('lee lo que dice Config y lo escribe para que el cronograma lo use', () => {
    let h = libro();
    expect(leerAjustesCronograma(h.Config!)).toEqual({ iteraciones: 5000, semilla: 12345, muestreo: 'lhs' });
    h = aplicarCambios(h, cambiosAjustesCronograma(h.Config!, { iteraciones: 1000, semilla: 7, muestreo: 'monte-carlo' })) as Libro;
    expect(leerAjustesCronograma(h.Config!)).toEqual({ iteraciones: 1000, semilla: 7, muestreo: 'monte-carlo' });
    const cfg = leerCronograma(h).modelo!.configuracion;
    expect([cfg.iteraciones, cfg.semilla, cfg.metodo]).toEqual([1000, 7, 'monte-carlo']);

    h = aplicarCambios(h, cambiosAjustesCronograma(h.Config!, { iteraciones: 'auto' })) as Libro;
    expect(leerAjustesCronograma(h.Config!).iteraciones).toBe('auto');
    expect(leerCronograma(h).modelo!.configuracion.iteracionesAutomaticas).toBe(true);
  });

  it('si falta la fila, la añade al final', () => {
    const h = libro();
    const sin = h.Config!.filter((f) => f[0] !== 'Semilla');
    const cambios = cambiosAjustesCronograma(sin, { semilla: 99 });
    expect(cambios).toEqual([{ hoja: 'Config', op: 'insertar', fila: sin.length, valores: ['Semilla', 99] }]);
  });
});

describe('distribución del fin bajo el Gantt', () => {
  it('cuenta cada iteración en su semana, con el P50 y el P80 de la guía (Q9)', async () => {
    const m = leerCronograma(libro()).modelo!;
    const sim = await simularCronograma(m);
    const d = distribucionFinDe(sim)!;
    expect(d.iteraciones).toBe(5000);
    expect(d.semanas.reduce((a, b) => a + b, 0)).toBe(5000);
    expect(d.p50).toBe(serieDeFecha(2028, 1, 18));
    expect(d.p80).toBe(serieDeFecha(2028, 2, 16));
    expect(d.desde).toBeLessThanOrEqual(d.p50);
  });
});
