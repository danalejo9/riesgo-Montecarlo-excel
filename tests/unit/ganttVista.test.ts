/** Gantt, vista (G1/G2): filas con resúmenes, críticas por las dos definiciones, relaciones y diagnóstico. */
import { describe, expect, it } from 'vitest';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { construirVista, explicarCritica, impulsoraHacia, type DatosGantt } from '../../excel/gantt.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INICIO = serieDeFecha(2027, 1, 4);

function datosEjemplo(): DatosGantt {
  const hojas = Object.fromEntries(hojasNuevasCronograma(INICIO).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
  const r = leerCronograma(hojas);
  expect(r.errores).toEqual([]);
  return { version: 1, modelo: r.modelo!, orden: r.orden!, vinculosResumen: r.vinculosResumen! };
}

describe('vista del Gantt con el ejemplo', () => {
  const d = datosEjemplo();
  const v = construirVista(d);

  it('filas en el orden de la hoja, con resúmenes de sus hijas', () => {
    expect(v.filas.length).toBe(d.orden.length);
    expect(v.filas.filter((f) => f.tipo === 'resumen').map((f) => f.id)).toEqual(['S1', 'S2', 'S3', 'S4']);
    for (const f of v.filas.filter((x) => x.tipo === 'resumen')) {
      const hijas = v.filas.filter((x) => x.tipo !== 'resumen' && x.wbs.startsWith(`${f.wbs}.`));
      expect(hijas.length).toBeGreaterThan(0);
      expect(f.inicio).toBe(Math.min(...hijas.map((x) => x.inicio)));
      expect(f.fin).toBe(Math.max(...hijas.map((x) => x.fin)));
      expect(f.nivel).toBe(1);
    }
    expect(v.fin).toBe(serieDeFecha(2027, 11, 22));
    expect(v.inicio).toBe(INICIO);
    const e = v.filas.find((f) => f.id === 'E')!;
    expect([e.inicio, e.fin]).toEqual([serieDeFecha(2027, 5, 22), serieDeFecha(2027, 7, 23)]);
  });

  it('las críticas coinciden con holgura ≤ 0 y la ruta más larga llega al fin', () => {
    const criticas = v.filas.filter((f) => f.tipo !== 'resumen' && f.critica);
    expect(criticas.length).toBeGreaterThan(0);
    for (const f of criticas) expect(f.holguraTotal).toBeLessThanOrEqual(0);
    const larga = construirVista(d, { definicion: 'masLarga' });
    expect(larga.filas.filter((f) => f.critica && f.tipo !== 'resumen').every((f) => f.enRutaMasLarga)).toBe(true);
    const ultimo = v.filas.find((f) => f.fin === v.fin && f.tipo !== 'resumen')!;
    expect(ultimo.enRutaMasLarga).toBe(true);
    const imp = impulsoraHacia(v, ultimo.id);
    expect(imp.actividades.has('INI')).toBe(true);
    for (const k of imp.relaciones) expect(v.relaciones[k]!.impulsora).toBe(true);
  });

  it('texto de predecesoras y sucesoras, holgura de relación y «¿por qué?»', () => {
    for (const rel of v.relaciones) {
      expect(v.filas.find((f) => f.id === rel.suc)!.predecesoras).toContain(rel.pred);
      expect(v.filas.find((f) => f.id === rel.pred)!.sucesoras).toContain(rel.suc);
      expect(rel.holgura).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(explicarCritica(v, 'S1')).toBeNull();
    expect(explicarCritica(v, 'E')!.texto.length).toBeGreaterThan(10);
  });

  it('diagnóstico con los criterios del Gantt y días no laborables', () => {
    const ids = v.calidad.map((c) => c.id);
    for (const id of ['resumen', 'ruta-continua', 'proporcion', 'critica-dura', 'fc']) expect(ids).toContain(id);
    expect(ids).not.toContain('incertidumbre');
    expect(v.calidad.find((c) => c.id === 'resumen')!.estado).toBe('verde');
    expect(v.calidad.find((c) => c.id === 'ruta-continua')!.estado).toBe('verde');
    expect(v.noLaborables.has(serieDeFecha(2027, 1, 9))).toBe(true); // sábado
    expect(v.noLaborables.has(serieDeFecha(2027, 1, 11))).toBe(true); // festivo de Reyes (lunes)
    expect(v.noLaborables.has(serieDeFecha(2027, 1, 12))).toBe(false);
  });

  it('un vínculo a un resumen se señala', () => {
    const d2 = { ...d, vinculosResumen: [['S1', 'E']] as [string, string][] };
    const c = construirVista(d2).calidad.find((x) => x.id === 'resumen')!;
    expect(c.estado).toBe('rojo');
    expect(c.actividades).toEqual(['S1', 'E']);
  });
});

describe('criterios de calidad del Gantt (prueba 7)', () => {
  const datos = (acts: import('../../engine/cronograma/index.ts').ActividadRed[]): DatosGantt => ({
    version: 1,
    modelo: {
      red: { inicio: INICIO, calendarios: [{ id: 'c', laborables: [true, true, true, true, true, false, false] }], actividades: acts },
      incertidumbre: [], riesgos: [], configuracion: { iteraciones: 1000, semilla: 1, metodo: 'lhs', redondeo: 'entero', ignorarRestriccionesDuras: false },
    } as unknown as DatosGantt['modelo'],
    orden: acts.map((a, i) => ({ id: a.id, nombre: a.nombre, wbs: String(i + 1), tipo: a.duracion === 0 ? 'hito' as const : 'tarea' as const, fila: i + 2 })),
    vinculosResumen: [],
  });
  const fc = (id: string, desfase = 0) => ({ id, tipo: 'FC' as const, desfase });
  const estado = (d: DatosGantt, opciones = {}) => Object.fromEntries(construirVista(d, opciones).calidad.map((c) => [c.id, c]));

  it('limpio: los criterios del Gantt en verde, y FC al 100 %', () => {
    const e = estado(datos([
      { id: 'I', nombre: 'I', duracion: 0, predecesoras: [] },
      { id: 'A', nombre: 'A', duracion: 5, predecesoras: [fc('I')] },
      { id: 'B', nombre: 'B', duracion: 3, predecesoras: [fc('I')] },
      { id: 'F', nombre: 'F', duracion: 0, predecesoras: [fc('A'), fc('B')] },
    ]));
    for (const id of ['resumen', 'ruta-continua', 'critica-dura', 'fc', 'negativa']) expect(e[id]?.estado, id).toBe('verde');
  });

  it('ruta rota por una restricción, crítica por restricción dura, proporción y FC bajo el umbral', () => {
    const e = estado(datos([
      { id: 'I', nombre: 'I', duracion: 0, predecesoras: [] },
      { id: 'A', nombre: 'A', duracion: 5, predecesoras: [fc('I')] },
      { id: 'B', nombre: 'B', duracion: 3, restriccion: { tipo: 'MSO', fecha: INICIO + 60 }, predecesoras: [{ id: 'I', tipo: 'CC', desfase: 0 }] },
      { id: 'F', nombre: 'F', duracion: 0, predecesoras: [fc('A'), fc('B')] },
    ]));
    expect(e['ruta-continua']?.estado).toBe('rojo');
    expect(e['ruta-continua']?.actividades).toEqual(['B']);
    expect(e['critica-dura']?.actividades).toEqual(['B']);
    expect(e.fc?.estado).not.toBe('verde');
    expect(e.proporcion?.detalle).toMatch(/de 4 actividades/);
  });

  it('los umbrales se configuran', () => {
    const d = datos([
      { id: 'I', nombre: 'I', duracion: 0, predecesoras: [] },
      { id: 'A', nombre: 'A', duracion: 50, predecesoras: [fc('I')] },
      { id: 'F', nombre: 'F', duracion: 0, predecesoras: [fc('A')] },
    ]);
    expect(estado(d).largas?.estado).not.toBe('verde');
    expect(estado(d, { umbrales: { dias: 60 } }).largas?.estado).toBe('verde');
  });
});
