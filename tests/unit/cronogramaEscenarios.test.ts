/** W7: escenarios «¿qué pasa si?» con los mismos números aleatorios. */
import { describe, expect, it } from 'vitest';
import { aplicarEscenario, compararEscenarios, narrativaEscenarios, simularCronograma, type ActividadRed, type Escenario } from '../../engine/cronograma/index.ts';
import { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA as H } from '../../excel/cronogramaHojas.ts';
import { hojaResultadosEscenarios, leerEscenarios } from '../../excel/escenariosCronograma.ts';
import { serieDeFecha, textoFecha } from '../../engine/modelo/fechas.ts';
import { modelo } from '../helpers/cronogramas.ts';

const fc = (id: string) => ({ id, tipo: 'FC' as const, desfase: 0 });
const tri = (min: number, moda: number, max: number) => ({ tipo: 'triangular' as const, min, moda, max });
const red: ActividadRed[] = [
  { id: 'A', nombre: 'A', duracion: 20, predecesoras: [] },
  { id: 'B', nombre: 'B', duracion: 30, predecesoras: [fc('A')] },
  { id: 'C', nombre: 'C', duracion: 10, predecesoras: [fc('B')] },
];
const base = modelo(red, [
  { actividad: 'A', distribucion: tri(18, 20, 30) },
  { actividad: 'B', distribucion: tri(0.9, 1, 1.5), relativa: true },
], [
  { id: 'R1', nombre: 'Lluvia', probabilidad: 0.4, impactos: [{ actividad: 'A', dias: tri(2, 5, 10) }], probabilidadPost: 0.1, factorImpactoPost: 0.5, costoMitigacion: 1000 },
  { id: 'R2', nombre: 'Proveedor', probabilidad: 0.3, impactos: [{ actividad: 'C', dias: tri(3, 4, 8) }] },
], { iteraciones: 2000 });
const esc = (nombre: string, ...cambios: Escenario['cambios']): Escenario => ({ nombre, cambios });

describe('aplicar un escenario', () => {
  it('acelera la base y el rango en días; el relativo sigue a la base', () => {
    const m = aplicarEscenario(base, esc('x', { tipo: 'duracion%', ids: ['A', 'B'], valor: -0.2, texto: '' }));
    expect(m.red.actividades.map((a) => a.duracion)).toEqual([16, 24, 10]);
    expect(m.incertidumbre[0]?.distribucion).toEqual(tri(18 * 0.8, 16, 24));
    expect(m.incertidumbre[1]?.distribucion).toEqual(tri(0.9, 1, 1.5));
    // El original no cambia.
    expect(base.red.actividades[0]?.duracion).toBe(20);
  });

  it('aplicar la mitigación usa los datos post y paga su costo', () => {
    const m = aplicarEscenario(base, esc('x', { tipo: 'respuesta', ids: ['R1'], valor: '', texto: '' }));
    const r = m.riesgos.find((x) => x.id === 'R1');
    expect(r?.probabilidad).toBe(0.1);
    expect(r?.impactos[0]?.dias).toEqual(tri(1, 2.5, 5));
    expect(r?.probabilidadPost).toBeUndefined();
    expect(m.costos?.[0]?.valor).toBe(1000);
  });

  it('trabajar sábados cambia todos los calendarios (o el que se diga)', () => {
    const m = aplicarEscenario(base, esc('x', { tipo: 'sabados', ids: [], valor: 1, texto: '' }));
    expect(m.red.calendarios[0]?.laborables).toEqual([true, true, true, true, true, true, false]);
  });
});

describe('comparar escenarios', () => {
  it('quitar un riesgo: el escenario nunca termina después de la base (mismos números)', async () => {
    const c = await compararEscenarios(base, [esc('Sin R2', { tipo: 'quitarRiesgo', ids: ['R2'], valor: '', texto: 'Quitar riesgo · R2' })]);
    const e = c.escenarios[0]!;
    expect(e.probDespues).toBe(0);
    expect(e.probAntes).toBeGreaterThan(0.2);
    expect(e.probAntes).toBeLessThan(0.4);
    expect(e.adelantoMedio).toBeGreaterThan(0);
    // Con los mismos números, el margen es mucho menor que con simulaciones independientes.
    expect(e.ic95).toBeLessThan(e.ic95Independientes / 2);
  });

  it('el adelanto medio es exactamente la diferencia iteración a iteración', async () => {
    const e1 = esc('Acelerar B', { tipo: 'duracion%', ids: ['B'], valor: -0.1, texto: '' });
    const c = await compararEscenarios(base, [e1]);
    const b = await simularCronograma(base);
    const s = await simularCronograma(aplicarEscenario(base, e1));
    const d = [...b.fin.serie].map((x, i) => x - (s.fin.serie[i] as number));
    expect(c.escenarios[0]?.adelantoMedio).toBeCloseTo(d.reduce((a, x) => a + x, 0) / d.length, 9);
  });

  it('trabajar sábados adelanta en fechas aunque los días laborables crezcan', async () => {
    const c = await compararEscenarios(base, [esc('Sábados', { tipo: 'sabados', ids: [], valor: 1, texto: '' })]);
    expect(c.escenarios[0]!.adelantoP80).toBeGreaterThan(5);
    expect(narrativaEscenarios(c, textoFecha)[0]).toMatch(/^«Sábados» adelanta el P80 \d+ días/);
  });

  it('un escenario con un ciclo no se calcula y lo dice', async () => {
    const c = await compararEscenarios(base, [esc('Ciclo', { tipo: 'predecesoras', ids: ['A'], valor: 'C', texto: '' })]);
    expect(c.escenarios).toHaveLength(0);
    expect(c.problemas[0]).toMatch(/«Ciclo» no se puede calcular: .*ciclo/);
  });
});

describe('hoja Escenarios', () => {
  const libro = () => Object.fromEntries(hojasNuevasCronograma(serieDeFecha(2027, 1, 4)).map((h) => [h.nombre, h.valores.map((f) => [...f])]));

  it('el ejemplo se lee, se compara y da su hoja de resultados', async () => {
    const l = libro();
    const m = leerCronograma(l).modelo!;
    const le = leerEscenarios(l[H.escenarios], m);
    expect(le.errores).toEqual([]);
    expect(le.escenarios.map((e) => [e.nombre, e.cambios.length])).toEqual([
      ['Trabajar los sábados', 1], ['Acelerar la estructura', 2], ['Sin el riesgo de la licencia', 1], ['Todas las mitigaciones', 1], ['Mampostería en paralelo', 1],
    ]);
    const c = await compararEscenarios({ ...m, configuracion: { ...m.configuracion, iteraciones: 500 } }, le.escenarios);
    expect(c.escenarios).toHaveLength(5);
    expect(c.escenarios.find((e) => e.nombre === 'Sin el riesgo de la licencia')!.probDespues).toBe(0);
    const hoja = hojaResultadosEscenarios(c, textoFecha);
    expect(hoja.valores[3]?.[0]).toBe('Escenario');
    expect(hoja.valores[4]?.[0]).toBe('Base (sin cambios)');
    expect(new Set(hoja.valores.map((v) => v.length)).size).toBe(1);
  });

  it('señala un cambio desconocido, un ID que no existe y un valor malo', () => {
    const l = libro();
    const m = leerCronograma(l).modelo!;
    const h = l[H.escenarios] as unknown[][];
    h[1]![1] = 'Rezar';
    h[2]![2] = 'ZZ';
    h[3]![3] = 'mucho';
    h[4]![2] = 'R3'; // R3 no tiene datos post: no se puede mitigar
    h[4]![1] = 'Aplicar mitigación';
    const le = leerEscenarios(h, m);
    expect(le.errores.map((e) => `${e.columna}${e.fila}`)).toEqual(['B2', 'C3', 'D4', 'C5']);
  });
});
