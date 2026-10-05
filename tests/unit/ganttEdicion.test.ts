/** Gantt, edición (G2): cambios sobre las hojas, validación, deshacer y rehacer (pruebas 5 y 6). */
import { describe, expect, it } from 'vitest';
import { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA, type MatrizHoja } from '../../excel/cronogramaHojas.ts';
import { aplicarCambios, aplicarOperacion, HistorialGantt, invertirCambios, type OperacionGantt } from '../../excel/edicionGantt.ts';
import { construirVista } from '../../excel/gantt.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INICIO = serieDeFecha(2027, 1, 4);
const H = HOJAS_CRONOGRAMA;
type Hojas = Record<string, MatrizHoja | undefined>;

function ejemplo(): Hojas {
  return Object.fromEntries(hojasNuevasCronograma(INICIO).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
}
function vista(h: Hojas) {
  const l = leerCronograma(h);
  expect(l.errores).toEqual([]);
  return construirVista({ version: 1, modelo: l.modelo!, orden: l.orden!, vinculosResumen: l.vinculosResumen! });
}
function hacer(h: Hojas, op: OperacionGantt) {
  const r = aplicarOperacion(h, op);
  if (!r.ok) throw new Error(r.error);
  // Lo que escribe Excel (los cambios) da las mismas hojas que el editor.
  expect(aplicarCambios(h, r.cambios)[H.actividades]).toEqual(r.hojas[H.actividades]);
  return r;
}
const fila = (h: Hojas, id: string) => vista(h).filas.find((f) => f.id === id)!;

describe('edición desde el Gantt', () => {
  it('duración: recalcula y la duración 0 la vuelve hito', () => {
    const h0 = ejemplo();
    const r = hacer(h0, { op: 'campo', id: 'E', campo: 'duracion', valor: 60 });
    expect(r.cambios).toHaveLength(1);
    expect(fila(r.hojas, 'E').duracion).toBe(60);
    expect(vista(r.hojas).fin).toBeGreaterThan(vista(h0).fin);
    const h = hacer(h0, { op: 'campo', id: 'K', campo: 'duracion', valor: 0 }).hojas;
    expect(fila(h, 'K').tipo).toBe('hito');
  });

  it('predecesoras en texto: reescribe Relaciones', () => {
    const r = hacer(ejemplo(), { op: 'predecesoras', id: 'J', texto: 'G; M FC+3d; I CC' });
    expect(fila(r.hojas, 'J').predecesoras).toBe('G; M FC+3d; I CC');
    const r2 = hacer(r.hojas, { op: 'predecesoras', id: 'J', texto: 'M' });
    expect(fila(r2.hojas, 'J').predecesoras).toBe('M');
    expect(aplicarOperacion(ejemplo(), { op: 'predecesoras', id: 'J', texto: 'G;;X?!' }).ok).toBe(false);
  });

  it('un vínculo que cierra un ciclo se rechaza con el ciclo (prueba 5)', () => {
    const r = aplicarOperacion(ejemplo(), { op: 'vinculo', accion: 'crear', pred: 'K', suc: 'D', tipo: 'FC', desfase: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ciclo/);
    const dup = aplicarOperacion(ejemplo(), { op: 'vinculo', accion: 'crear', pred: 'A', suc: 'B', tipo: 'FC', desfase: 0 });
    expect(dup.ok).toBe(false);
    const inexistente = aplicarOperacion(ejemplo(), { op: 'predecesoras', id: 'J', texto: 'ZZ' });
    expect(inexistente.ok).toBe(false);
    if (!inexistente.ok) expect(inexistente.error).toMatch(/ZZ/);
  });

  it('crear, editar y borrar un vínculo', () => {
    let h = hacer(ejemplo(), { op: 'vinculo', accion: 'crear', pred: 'C', suc: 'G', tipo: 'CC', desfase: 2 }).hojas;
    expect(fila(h, 'G').predecesoras).toContain('C CC+2d');
    h = hacer(h, { op: 'vinculo', accion: 'editar', pred: 'C', suc: 'G', tipo: 'FF', desfase: -1 }).hojas;
    expect(fila(h, 'G').predecesoras).toContain('C FF-1d');
    h = hacer(h, { op: 'vinculo', accion: 'borrar', pred: 'C', suc: 'G' }).hojas;
    expect(fila(h, 'G').predecesoras).toBe('F');
  });

  it('restricción y fecha límite', () => {
    const f = serieDeFecha(2027, 9, 1);
    let h = hacer(ejemplo(), { op: 'restriccion', id: 'G', tipo: 'SNET', fecha: f }).hojas;
    expect(fila(h, 'G').inicio).toBeGreaterThanOrEqual(f);
    expect(fila(h, 'G').restriccion).toBe('No comenzar antes de');
    h = hacer(h, { op: 'campo', id: 'L', campo: 'fechaLimite', valor: serieDeFecha(2027, 10, 1) }).hojas;
    expect(fila(h, 'L').holguraTotal).toBeLessThan(0);
    expect(aplicarOperacion(h, { op: 'restriccion', id: 'G', tipo: 'MSO', fecha: null }).ok).toBe(false);
  });

  it('insertar, borrar y mover filas renumeran la WBS', () => {
    const r = hacer(ejemplo(), { op: 'insertar', despuesDe: 'D', tipo: 'tarea' });
    expect(r.seleccion).toBe('N1');
    const v = vista(r.hojas);
    const ids = v.filas.map((f) => f.id);
    expect(ids.slice(ids.indexOf('D'), ids.indexOf('D') + 3)).toEqual(['D', 'N1', 'E']);
    expect(v.filas.find((f) => f.id === 'N1')!.wbs).toBe('2.3');
    expect(v.filas.find((f) => f.id === 'E')!.wbs).toBe('2.4');
    expect(v.filas.find((f) => f.id === 'INI')!.wbs).toBe('0');
    // Borrar E quita sus relaciones y su incertidumbre.
    const b = hacer(ejemplo(), { op: 'borrar', id: 'E' });
    const l = leerCronograma(b.hojas);
    expect(l.errores).toEqual([]);
    expect(l.modelo!.red.actividades.some((a) => a.predecesoras.some((p) => p.id === 'E'))).toBe(false);
    expect(l.modelo!.incertidumbre.some((i) => i.actividad === 'E')).toBe(false);
    expect(b.descripcion).toMatch(/2 partidas de costo pasan a todo el proyecto/);
    expect(l.modelo!.costos!.find((c) => c.id === 'EST')!.actividad).toBeUndefined();
    const m = hacer(ejemplo(), { op: 'mover', id: 'B', delta: -1 });
    const vm = vista(m.hojas);
    expect(vm.filas.find((f) => f.id === 'B')!.wbs).toBe('1.1');
    expect(vm.filas.find((f) => f.id === 'A')!.wbs).toBe('1.2');
  });

  it('sangría: la de arriba pasa a resumen y vuelve a tarea al quitarla', () => {
    let h = hacer(ejemplo(), { op: 'nivel', id: 'B', delta: 1 }).hojas;
    let v = vista(h);
    expect(v.filas.find((f) => f.id === 'B')!.wbs).toBe('1.1.1');
    expect(v.filas.find((f) => f.id === 'A')!.tipo).toBe('resumen');
    // El vínculo A → B (y A → C) ahora toca un resumen: el diagnóstico lo dice.
    expect(v.calidad.find((c) => c.id === 'resumen')!.estado).toBe('rojo');
    h = hacer(h, { op: 'nivel', id: 'B', delta: -1 }).hojas;
    v = vista(h);
    expect(v.filas.find((f) => f.id === 'A')!.tipo).toBe('tarea');
    expect(aplicarOperacion(ejemplo(), { op: 'nivel', id: 'S1', delta: -1 }).ok).toBe(false);
  });

  it('deshacer y rehacer 10 ediciones mixtas devuelve exactamente el estado (prueba 6)', () => {
    const h0 = ejemplo();
    const hist = new HistorialGantt();
    const ops: OperacionGantt[] = [
      { op: 'campo', id: 'E', campo: 'duracion', valor: 55 },
      { op: 'insertar', despuesDe: 'C', tipo: 'hito' },
      { op: 'vinculo', accion: 'crear', pred: 'C', suc: 'N1', tipo: 'FC', desfase: 0 },
      { op: 'nivel', id: 'B', delta: 1 },
      { op: 'campo', id: 'G', campo: 'nombre', valor: 'Redes' },
      { op: 'restriccion', id: 'H', tipo: 'SNET', fecha: serieDeFecha(2027, 8, 20) },
      { op: 'predecesoras', id: 'K', texto: 'J FF+2d' },
      { op: 'borrar', id: 'I' },
      { op: 'mover', id: 'G', delta: 1 },
      { op: 'hito', id: 'F' },
    ];
    const estados: Hojas[] = [h0];
    let h = h0;
    for (const op of ops) {
      const r = hacer(h, op);
      hist.registrar(r.descripcion, r.cambios);
      h = aplicarCambios(h, r.cambios);
      estados.push(h);
    }
    for (let k = ops.length; k > 0; k--) {
      h = aplicarCambios(h, hist.deshacer()!.cambios);
      for (const n of [H.actividades, H.relaciones, H.incertidumbre]) expect(norm(h[n])).toEqual(norm(estados[k - 1]![n]));
    }
    expect(hist.deshacer()).toBeNull();
    for (let k = 1; k <= ops.length; k++) h = aplicarCambios(h, hist.rehacer()!.cambios);
    for (const n of [H.actividades, H.relaciones]) expect(norm(h[n])).toEqual(norm(estados[ops.length]![n]));
    expect(invertirCambios(invertirCambios([{ hoja: 'x', op: 'borrar', fila: 1, antes: [1] }]))).toEqual([{ hoja: 'x', op: 'borrar', fila: 1, antes: [1] }]);
  });
});

/** Las celdas y las filas vacías del final no cuentan (en Excel son lo mismo). */
function norm(m: MatrizHoja | undefined): unknown[][] {
  return (m ?? []).map((f) => {
    const r = f.map((v) => (v === undefined || v === '' ? null : v));
    while (r.length && r[r.length - 1] === null) r.pop();
    return r;
  }).filter((f, i, todas) => f.length > 0 || todas.slice(i).some((g) => g.some((v) => v !== null && v !== undefined && v !== '')));
}
