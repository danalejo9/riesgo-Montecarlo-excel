/**
 * V3: el informe PDF configurable. La plantilla (normalizar, mover
 * secciones, regla de página) y los datos del informe del cronograma, contra
 * el libro de pruebas.
 */
import { describe, expect, it } from 'vitest';

import {
  calcularCPM, compararMitigacion, impactoDeRiesgos, leerCronograma, leerRiesgosPlazo, narrativaMitigacion, narrativaPlazo, revisarSalud,
  simularPlazo, OPCIONES_PLAZO_POR_DEFECTO, type Actividad, type Cronograma,
} from '../../engine/cronograma/index.ts';
import { GANTT_MAXIMO, datosInformeCronograma } from '../../excel/informeCronograma.ts';
import { codificarInforme, decodificarInforme } from '../../excel/informeImprimible.ts';
import {
  LOGO_MAXIMO, SECCIONES_COSTOS, SECCIONES_CRONOGRAMA, moverSeccion, normalizarPlantilla, plantillaPorDefecto, reglaPagina, textoCss,
} from '../../excel/plantillaInforme.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n);
const cron = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma as Cronograma;
const cpm = calcularCPM(cron);
if (!cpm.ok) throw new Error('CPM del libro');
const riesgos = leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos;
const AHORA = new Date('2026-09-30T10:00:00Z');

describe('plantilla del informe (V3)', () => {
  it('por defecto: todas las secciones visibles, A4 vertical, con número de página', () => {
    const p = plantillaPorDefecto();
    expect(p.seccionesCostos.map((s) => s.id)).toEqual(SECCIONES_COSTOS.map((s) => s.id));
    expect(p.seccionesCronograma.map((s) => s.id)).toEqual(SECCIONES_CRONOGRAMA.map((s) => s.id));
    expect([...p.seccionesCostos, ...p.seccionesCronograma].every((s) => s.visible)).toBe(true);
    expect(p).toMatchObject({ tamano: 'A4', orientacion: 'portrait', numeroPagina: true });
    expect(normalizarPlantilla(null)).toEqual(p);
    expect(normalizarPlantilla('basura')).toEqual(p);
  });

  it('normalizar: conserva el orden guardado, quita repetidas y desconocidas, añade las que falten al final', () => {
    const p = normalizarPlantilla({
      seccionesCronograma: [{ id: 'gantt', visible: false }, { id: 'resumen' }, { id: 'gantt', visible: true }, { id: 'inventada', visible: true }],
    });
    expect(p.seccionesCronograma.slice(0, 2)).toEqual([{ id: 'gantt', visible: false }, { id: 'resumen', visible: true }]);
    expect(p.seccionesCronograma).toHaveLength(SECCIONES_CRONOGRAMA.length);
    expect(new Set(p.seccionesCronograma.map((s) => s.id)).size).toBe(SECCIONES_CRONOGRAMA.length);
  });

  it('normalizar: color, papel, orientación y logo inválidos toman el valor por defecto', () => {
    const p = normalizarPlantilla({
      color: 'rojo', tamano: 'A3', orientacion: 'diagonal', logo: 'javascript:alert(1)', titulo: 7, numeroPagina: false, pie: 'x'.repeat(500),
    });
    expect(p).toMatchObject({ color: '#1F4E79', tamano: 'A4', orientacion: 'portrait', titulo: '', numeroPagina: false });
    expect(p.logo).toBeUndefined();
    expect(p.pie).toHaveLength(200);
    const grande = `data:image/png;base64,${'A'.repeat(LOGO_MAXIMO)}`;
    expect(normalizarPlantilla({ logo: grande }).logo).toBeUndefined();
    const bueno = 'data:image/png;base64,iVBORw0KGgo=';
    expect(normalizarPlantilla({ logo: bueno, tamano: 'Letter', orientacion: 'landscape', color: '#AA0011' })).toMatchObject({
      logo: bueno, tamano: 'Letter', orientacion: 'landscape', color: '#AA0011',
    });
  });

  it('mover secciones: sube, baja y no se sale de los extremos', () => {
    const l = plantillaPorDefecto().seccionesCostos;
    expect(moverSeccion(l, 'registro', -1).map((s) => s.id)).toEqual(['ajustes', 'registro', 'entradas', 'salidas', 'comparar']);
    expect(moverSeccion(l, 'ajustes', 1).map((s) => s.id)).toEqual(['entradas', 'ajustes', 'registro', 'salidas', 'comparar']);
    expect(moverSeccion(l, 'ajustes', -1)).toEqual(l);
    expect(moverSeccion(l, 'comparar', 1)).toEqual(l);
  });

  it('regla de página: papel, orientación, pie escapado y número de página', () => {
    const p = { ...plantillaPorDefecto(), tamano: 'Letter' as const, orientacion: 'landscape' as const, pie: 'Confidencial "Aurora"\nUso interno' };
    const r = reglaPagina(p);
    expect(r).toContain('size: Letter landscape');
    expect(r).toContain('@bottom-left { content: "Confidencial \\"Aurora\\" Uso interno"');
    expect(r).toContain('counter(page)');
    expect(reglaPagina({ ...p, pie: '  ', numeroPagina: false })).not.toMatch(/bottom-(left|right)/);
    expect(textoCss('a\\b</style>')).toBe('"a\\\\b/style"');
  });
});

describe('datos del informe del cronograma (V3)', () => {
  const salud = revisarSalud(cron.actividades, cpm.filas);
  const base = { cronograma: cron, filas: cpm.filas, fechaFinProyecto: cpm.fechaFinProyecto, duracionProyecto: cpm.duracionProyecto, salud, ahora: AHORA };

  it('sin simular: el determinista, la salud y el Gantt; el título de la plantilla manda', () => {
    const d = datosInformeCronograma({ ...base, plantilla: { ...plantillaPorDefecto(), titulo: 'Puente Aurora' } });
    expect(d).toMatchObject({ tipo: 'cronograma', titulo: 'Puente Aurora', generado: AHORA.toISOString() });
    expect(d.determinista).toMatchObject({ fin: cpm.fechaFinProyecto, dias: cpm.duracionProyecto, total: cpm.filas.length });
    expect(d.determinista.rutaCritica).toEqual(cpm.filas.filter((f) => f.critica).map((f) => f.nombre));
    expect(d.simulacion).toBeUndefined();
    expect(d.gantt.barras).toHaveLength(cpm.filas.length);
    expect(d.gantt.truncado).toBe(false);
    expect(datosInformeCronograma({ ...base, plantilla: plantillaPorDefecto() }).titulo).toBe('Análisis de riesgo del cronograma');
  });

  it('con simulación y mitigación: cifras iguales a las del motor, y cabe en la dirección', async () => {
    const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 2000 };
    const r = await simularPlazo(cron, riesgos, op);
    const impacto = await impactoDeRiesgos(cron, riesgos, r, op);
    const cmp = await compararMitigacion(cron, riesgos, op, undefined, r);
    const d = datosInformeCronograma({
      ...base,
      simulado: { r, impacto, narrativa: narrativaPlazo(r, impacto, salud), hilos: 1, escenario: 'antes' },
      comparacion: { cmp, narrativa: narrativaMitigacion(cmp) },
      plantilla: plantillaPorDefecto(),
    });
    const s = d.simulacion!;
    expect(s.fechas).toEqual(r.fechas);
    expect(s.iteraciones).toBe(2000);
    expect(s.riesgos.map((x) => x.id)).toEqual(impacto.porRiesgo.map((x) => x.id));
    for (const x of s.riesgos) expect(x.ocurrio).toBe(r.riesgos.find((y) => y.id === x.id)!.ocurrio);
    expect(s.costos!.p80).toBe(r.costos!.p80);
    expect(s.costos!.nube.length).toBeLessThanOrEqual(400);
    expect(s.costos!.nubeDesde).toBeLessThanOrEqual(s.costos!.nubeHasta);
    expect(s.actividades.length).toBeLessThanOrEqual(15);
    expect(s.actividades.map((a) => a.criticidad)).toEqual([...s.actividades.map((a) => a.criticidad)].sort((a, b) => b - a));
    expect(d.mitigacion!.despues.p80).toBe(cmp.despues.fechas.p80);
    expect(d.mitigacion!.costoRespuestas).toBe(28000);
    // Las franjas P10–P90 llegan al Gantt.
    expect(d.gantt.barras.some((b) => b.franja)).toBe(true);
    expect(d.gantt.fechaP80).toBeDefined();

    const codigo = await codificarInforme(d);
    expect(codigo.length).toBeLessThan(60_000);
    const vuelta = await decodificarInforme(codigo);
    expect(vuelta).toEqual(d);
  });

  it('un cronograma grande: el Gantt se queda con las más críticas y sin enlaces colgando', () => {
    // Dos cadenas desde «1»: las impares (largas, críticas) y las pares (cortas, con holgura), y un fin común.
    const acts: Actividad[] = Array.from({ length: 150 }, (_, k) => {
      const i = k + 1;
      const pred = i === 1 ? [] : i === 150 ? ['149', '148'] : [String(i <= 3 ? 1 : i - 2)];
      return { id: String(i), nombre: `A${i}`, duracion: i % 2 === 1 ? 3 : 1, predecesoras: pred.map((p) => ({ predecesora: p, tipo: 'FS' as const, retardo: 0 })) };
    });
    const c: Cronograma = { inicio: cron.inicio, calendario: cron.calendario, actividades: acts };
    const r = calcularCPM(c);
    if (!r.ok) throw new Error('cpm grande');
    const d = datosInformeCronograma({ cronograma: c, filas: r.filas, fechaFinProyecto: r.fechaFinProyecto, duracionProyecto: r.duracionProyecto, plantilla: plantillaPorDefecto() });
    expect(d.gantt.truncado).toBe(true);
    expect(d.gantt.barras).toHaveLength(GANTT_MAXIMO);
    const criticas = r.filas.filter((f) => f.critica).length;
    expect(d.gantt.barras.filter((b) => b.critica)).toHaveLength(Math.min(criticas, GANTT_MAXIMO));
    const ids = new Set(d.gantt.barras.map((b) => b.id));
    expect(d.gantt.enlaces.every((e) => ids.has(e.de) && ids.has(e.a))).toBe(true);
  });

  it('un informe de cronograma con basura en la plantilla se lee con la plantilla corregida', async () => {
    const d = datosInformeCronograma({ ...base, plantilla: plantillaPorDefecto() });
    const codigo = await codificarInforme({ ...d, plantilla: { color: 'no' } as never });
    const vuelta = await decodificarInforme(codigo);
    expect(vuelta && 'tipo' in vuelta && vuelta.plantilla).toEqual(plantillaPorDefecto());
  });
});
