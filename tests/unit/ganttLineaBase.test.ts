/** Gantt G3: líneas base (guardar, variación, BEI y CPLI). */
import { describe, expect, it } from 'vitest';
import { ETIQUETAS_CONFIG, hojasNuevasCronograma, HOJAS_CRONOGRAMA as H, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { aplicarCambios, aplicarOperacion, type OperacionGantt } from '../../excel/edicionGantt.ts';
import { construirVista, datosGanttDe } from '../../excel/gantt.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INI = serieDeFecha(2027, 1, 4);
type Libro = Record<string, unknown[][]>;
const libro = (): Libro => Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
const editar = (h: Libro, op: OperacionGantt) => {
  const r = aplicarOperacion(h, op);
  if (!r.ok) throw new Error(r.error);
  return r;
};
const vista = (h: Libro, lineaBase?: number) => {
  const l = leerCronograma(h);
  expect(l.errores).toEqual([]);
  return construirVista(datosGanttDe(l)!, lineaBase !== undefined ? { lineaBase } : {});
};

describe('líneas base (G3)', () => {
  it('guarda la línea base y mide la variación al cambiar el cronograma', () => {
    const r1 = editar(libro(), { op: 'lineaBase', numero: 1 });
    expect(r1.descripcion).toBe('Guardar la línea base 1');
    let h = r1.hojas as Libro;
    const v0 = vista(h);
    expect(v0.lineaBase).toBe(1);
    expect(v0.lineasBaseGuardadas).toEqual([1]);
    const E0 = v0.filas.find((f) => f.id === 'E')!;
    expect(E0.lineaBase).toEqual({ inicio: E0.inicio, fin: E0.fin });
    expect(E0.variacion).toBe(0);
    // E pasa de 50 a 60 días (lunes a sábado): termina 10 días laborables más tarde.
    h = editar(h, { op: 'campo', id: 'E', campo: 'duracion', valor: 60 }).hojas as Libro;
    const v1 = vista(h);
    expect(v1.filas.find((f) => f.id === 'E')!.variacion).toBe(10);
    expect(v1.filas.find((f) => f.id === 'L')!.variacion).toBeGreaterThan(0);
    // El resumen toma de la primera a la última de sus hijas.
    expect(v1.filas.find((f) => f.id === 'S2')!.lineaBase).not.toBeNull();
    // CPLI por debajo de 1 porque el fin se escapó 7 días (calendario del proyecto) de la línea base (sigue sobre 0,95).
    const cpli = v1.calidad.find((c) => c.id === 'cpli')!;
    expect(cpli.detalle).toMatch(/7 días después del de la línea base: CPLI 0,97/);
    expect(cpli.estado).toBe('verde');
    const v2 = vista(editar(h, { op: 'campo', id: 'E', campo: 'duracion', valor: 80 }).hojas as Libro);
    expect(v2.calidad.find((c) => c.id === 'cpli')!.estado).toBe('amarillo');
    // Sin línea base elegida, nada.
    const sin = vista(h, 0);
    expect(sin.filas.every((f) => f.lineaBase === null)).toBe(true);
    expect(sin.calidad.some((c) => c.id === 'cpli')).toBe(false);
  });

  it('BEI con fecha de corte; un libro sin la hoja Lineas_Base la crea; deshacer la quita', () => {
    const h = libro();
    delete h[H.lineasBase];
    const r = editar(h, { op: 'lineaBase', numero: 2 });
    expect((r.hojas[H.lineasBase] as unknown[][])[0]).toEqual(['ID', 'LB1 comienzo', 'LB1 fin', 'LB2 comienzo', 'LB2 fin', 'LB3 comienzo', 'LB3 fin']);
    let h2 = r.hojas as Libro;
    const cfg = h2[H.config]!;
    cfg[cfg.findIndex((f) => f[0] === ETIQUETAS_CONFIG.corte)]![1] = serieDeFecha(2027, 3, 1);
    h2 = editar(h2, { op: 'campo', id: 'INI', campo: 'finReal', valor: INI }).hojas as Libro;
    h2 = editar(h2, { op: 'campo', id: 'A', campo: 'inicioReal', valor: INI }).hojas as Libro;
    h2 = editar(h2, { op: 'campo', id: 'A', campo: 'finReal', valor: serieDeFecha(2027, 2, 8) }).hojas as Libro;
    const v = vista(h2, 2);
    const bei = v.calidad.find((c) => c.id === 'bei')!;
    // La LB2 daba por terminadas al 01/03 a INI y A (y C, que no ha empezado).
    expect(bei.detalle).toMatch(/2 de 3/);
    expect(bei.actividades).toEqual(['C']);
    expect(bei.estado).toBe('amarillo');
    expect(aplicarOperacion(libro(), { op: 'lineaBase', numero: 4 }).ok).toBe(false);
    // Deshacer devuelve la hoja vacía.
    const vuelta = aplicarCambios(r.hojas, (r.cambios as Parameters<typeof aplicarCambios>[1]).slice().reverse().map((c) => (c.op === 'celda' ? { ...c, valor: c.antes, antes: c.valor } : c)));
    expect((vuelta[H.lineasBase] ?? []).every((f) => (f as unknown[]).every((x) => x === null || x === undefined))).toBe(true);
  });
});
