/**
 * W7: escenarios «¿qué pasa si?» con los mismos números aleatorios. Casos
 * exactos (un cambio fijo se ve igual en todas las iteraciones), la
 * equivalencia con simular a mano el cronograma cambiado, la lectura de la
 * hoja y sus errores, y la plantilla hecha con el propio cronograma.
 */
import { describe, expect, it } from 'vitest';

import {
  aplicarEscenario, calcularCPM, compararEscenarios, hojaEscenarios, leerCronograma, leerEscenarios, leerRiesgosPlazo, narrativaEscenarios, plantillaEscenarios,
  riesgosActivos, simularPlazo, OPCIONES_PLAZO_POR_DEFECTO, type Cronograma, type Escenario,
} from '../../engine/cronograma/index.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';
import { datosInformeCronograma } from '../../excel/informeCronograma.ts';
import { normalizarPlantilla, plantillaPorDefecto, SECCIONES_CRONOGRAMA } from '../../excel/plantillaInforme.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];
const cron = leerCronograma(hoja('Actividades'), hoja('Calendario'), undefined, undefined, hoja('Hitos (prueba)')).cronograma as Cronograma;
const riesgos = riesgosActivos(leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos);
const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 3000 };
const fecha = (f: number) => String(f);

const ENCABEZADO = ['Escenario', 'Cambio', 'Actividad o riesgo (ID)', 'Valor'];
const leer = (filas: unknown[][], c = cron, r = riesgos) => leerEscenarios([ENCABEZADO, ...filas], c, r);

// Todos los días laborables: los días de trabajo son días naturales y las cuentas salen exactas.
const SIEMPRE: Cronograma = {
  inicio: 46_419,
  calendario: { laborables: [true, true, true, true, true, true, true], festivos: new Set() },
  actividades: [
    { id: 'A', nombre: 'A', duracion: 5, predecesoras: [] },
    { id: 'B', nombre: 'B', duracion: 20, predecesoras: [{ predecesora: 'A', tipo: 'FS', retardo: 0 }], tresPuntos: { min: 10, masProbable: 20, max: 40 } },
    { id: 'C', nombre: 'C', duracion: 5, predecesoras: [{ predecesora: 'B', tipo: 'FS', retardo: 0 }] },
  ],
};

describe('escenarios con los mismos números (W7)', () => {
  it('quitar 2 días a una actividad fija de la ruta adelanta 2 días en todas las iteraciones', async () => {
    const e: Escenario[] = [
      { nombre: 'A −2', cambios: [{ tipo: 'duracionDias', ids: ['A'], valor: -2, texto: '' }] },
      { nombre: 'Nada', cambios: [{ tipo: 'duracion%', ids: ['A'], valor: 0, texto: '' }] },
    ];
    const c = await compararEscenarios(SIEMPRE, [], e, op);
    const [menos2, nada] = c.escenarios;
    expect(menos2).toMatchObject({ adelantoMedio: 2, ic95: 0, probAntes: 1, probDespues: 0, adelantoP80: 2, adelantoP50: 2 });
    expect(menos2!.ic95Independientes).toBeGreaterThan(0.2);
    expect(nada).toMatchObject({ adelantoMedio: 0, probIgual: 1 });
  });

  it('es lo mismo que simular a mano el cronograma cambiado', async () => {
    const e = leer([['Sin R3', 'Quitar riesgo', 'R3', ''], ['Sin R3', 'Duración en %', '8', -0.25]]).escenarios;
    const c = await compararEscenarios(cron, riesgos, e, op);
    const x = aplicarEscenario(cron, riesgos, e[0]!);
    expect(x.riesgos.map((r) => r.id)).not.toContain('R3');
    expect(x.cronograma.actividades.find((a) => a.id === '8')!.tresPuntos!.masProbable).toBeCloseTo(0.75 * cron.actividades.find((a) => a.id === '8')!.tresPuntos!.masProbable, 9);
    const aMano = await simularPlazo(x.cronograma, x.riesgos, op);
    expect(Array.from(c.escenarios[0]!.r.finProyecto)).toEqual(Array.from(aMano.finProyecto));
    // Y la base no se tocó.
    expect(cron.actividades.find((a) => a.id === '8')!.tresPuntos!.masProbable).toBe(x.cronograma.actividades.find((a) => a.id === '8')!.tresPuntos!.masProbable / 0.75);
  });

  it('trabajar los sábados nunca termina después, y el margen pareado es menor', async () => {
    const e = leer([['Sábados', 'Trabajar sábados', '', 'Sí']]).escenarios;
    const c = await compararEscenarios(cron, riesgos, e, op);
    const s = c.escenarios[0]!;
    expect(s.probDespues).toBe(0);
    expect(s.adelantoP80).toBeGreaterThan(15);
    expect(s.ic95).toBeLessThan(s.ic95Independientes);
    expect(c.base.hitos).toBeDefined();
    expect(s.hitos.find((h) => h.id === '19')!.escenario).toBeGreaterThan(s.hitos.find((h) => h.id === '19')!.base);
    expect(narrativaEscenarios(c, fecha)[0]).toMatch(/^«Sábados» adelanta el P80 \d+ días .*termina antes que la base en el \d+ % de los casos\.$/);
  });

  it('aplicar la respuesta de un riesgo usa sus valores «después» y paga la respuesta', () => {
    const e = leer([['R1 mitigado', 'Aplicar respuesta', 'R1', '']]).escenarios;
    const x = aplicarEscenario(cron, riesgos, e[0]!);
    const r1 = riesgos.find((r) => r.id === 'R1')!;
    expect(x.riesgos.find((r) => r.id === 'R1')).toMatchObject({ probabilidad: r1.despues!.probabilidad, impactoMasProbable: r1.despues!.impactoMasProbable });
    expect(x.cronograma.costoAdicional).toBe((cron.costoAdicional ?? 0) + (r1.costoRespuesta ?? 0));
  });

  it('un escenario con un ciclo se informa y los demás se simulan', async () => {
    const e = leer([['Ciclo', 'Predecesoras', '1', '20'], ['Inicio', 'Inicio del proyecto', '', cron.inicio + 7]]).escenarios;
    const c = await compararEscenarios(cron, riesgos, e, { ...op, iteraciones: 500 });
    expect(c.problemas).toEqual([expect.objectContaining({ mensaje: expect.stringContaining('«Ciclo» no se puede calcular') })]);
    expect(c.escenarios.map((x) => x.nombre)).toEqual(['Inicio']);
    expect(c.escenarios[0]!.adelantoP80).toBeLessThan(0);
  });
});

describe('la hoja «Escenarios» (W7)', () => {
  it('agrupa por nombre, resuelve categorías y acepta porcentajes de las dos formas', () => {
    const r = leer([
      ['Rápido', 'Duración en %', 'Obra gris', -20],
      ['rápido', 'Probabilidad', 'R2', 0.1],
      ['Otro', 'Impacto en %', 'R1', '-50%'],
    ]);
    expect(r.problemas).toEqual([]);
    expect(r.escenarios.map((e) => e.nombre)).toEqual(['Rápido', 'Otro']);
    const [dur, prob] = r.escenarios[0]!.cambios;
    expect(dur!.valor).toBe(-0.2);
    expect(dur!.ids).toEqual(cron.actividades.filter((a) => a.categoria === 'Obra gris').map((a) => a.id));
    expect(prob).toMatchObject({ tipo: 'probabilidad', ids: ['R2'], valor: 0.1 });
    expect(r.escenarios[1]!.cambios[0]!.valor).toBe(-0.5);
  });

  it('errores claros, con la fila', () => {
    const r = leer([
      ['X', 'Contratar magos', '1', ''],
      ['X', 'Duración en %', '99', -0.1],
      ['X', 'Probabilidad', 'R1', 150],
      ['X', 'Quitar riesgo', 'R99', ''],
      ['X', 'Trabajar sábados', '', 'quizá'],
      ['X', 'Predecesoras', '5', '77'],
      ['X', 'Duración en %', '', -0.1],
    ]);
    expect(r.escenarios).toEqual([]);
    expect(r.problemas.map((p) => p.mensaje)).toEqual([
      expect.stringContaining('no es un cambio conocido'),
      expect.stringContaining('«99» no es el ID ni la categoría'),
      expect.stringContaining('entre 0 y 100 %'),
      expect.stringContaining('«R99» no es un riesgo activo'),
      expect.stringContaining('Sí o No'),
      expect.stringContaining('«77» no es una actividad'),
      expect.stringContaining('falta la actividad'),
    ]);
    expect(r.problemas[0]!.fila).toBe(2);
  });

  it('la plantilla trae ejemplos del propio cronograma que se leen sin errores', () => {
    const p = plantillaEscenarios(cron, riesgos);
    const r = leerEscenarios(p.valores, cron, riesgos);
    expect(r.problemas).toEqual([]);
    expect(r.escenarios.map((e) => e.nombre)).toEqual(expect.arrayContaining(['Trabajar los sábados', 'Todas las respuestas']));
    expect(r.escenarios.some((e) => e.nombre.startsWith('Acelerar'))).toBe(true);
    expect(r.escenarios.some((e) => e.nombre.startsWith('Sin '))).toBe(true);
    // Sin cronograma, solo el encabezado y la lista de cambios posibles.
    expect(leerEscenarios(plantillaEscenarios().valores, cron, riesgos)).toEqual({ escenarios: [], problemas: [] });
  });

  it('la hoja de resultados: la base y una fila por escenario', async () => {
    const e = leer([['Sábados', 'Trabajar sábados', '', 'Sí']]).escenarios;
    const c = await compararEscenarios(cron, riesgos, e, { ...op, iteraciones: 500 });
    const h = hojaEscenarios(c, fecha);
    expect(h.valores[2]).toContain('Adelanto del P80 (días)');
    expect(h.valores[3]![0]).toBe('Base (sin cambios)');
    expect(h.valores[4]![0]).toBe('Sábados');
    expect(h.valores.some((f) => String(f[0]).startsWith('«Sábados» adelanta'))).toBe(true);
  });
});

describe('los escenarios en el informe PDF (W7)', () => {
  it('una sección más, que también aparece en las plantillas guardadas antes', async () => {
    expect(SECCIONES_CRONOGRAMA.map((x) => x.id)).toContain('escenarios');
    const vieja = { ...plantillaPorDefecto(), seccionesCronograma: plantillaPorDefecto().seccionesCronograma.filter((x) => x.id !== 'escenarios') };
    expect(normalizarPlantilla(vieja).seccionesCronograma.some((x) => x.id === 'escenarios' && x.visible)).toBe(true);

    const e = leer([['Sábados', 'Trabajar sábados', '', 'Sí']]).escenarios;
    const cmp = await compararEscenarios(cron, riesgos, e, { ...op, iteraciones: 500 });
    const cpm = calcularCPM(cron);
    if (!cpm.ok) throw new Error('cpm');
    const d = datosInformeCronograma({
      cronograma: cron, filas: cpm.filas, fechaFinProyecto: cpm.fechaFinProyecto, duracionProyecto: cpm.duracionProyecto,
      plantilla: plantillaPorDefecto(), escenarios: { cmp, narrativa: narrativaEscenarios(cmp, fecha) },
    });
    expect(d.escenarios!.base.p80).toBe(cmp.base.fechas.p80);
    expect(d.escenarios!.filas).toEqual([expect.objectContaining({ nombre: 'Sábados', p80: cmp.escenarios[0]!.r.fechas.p80, cambios: ['Trabajar sábados · Sí'] })]);
  });
});

