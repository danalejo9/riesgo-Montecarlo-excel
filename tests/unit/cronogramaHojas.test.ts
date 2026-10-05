/** Lectura y validación del libro de cronograma (QRSA, Q1.1–Q1.2), sin Excel. */
import { describe, expect, it } from 'vitest';
import { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA, type MatrizHoja } from '../../excel/cronogramaHojas.ts';
import { compilarRed, cpmDeterministico, simularCronograma } from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INICIO = serieDeFecha(2027, 1, 4);
const H = HOJAS_CRONOGRAMA;

function libroEjemplo(): Record<string, unknown[][]> {
  return Object.fromEntries(hojasNuevasCronograma(INICIO).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
}

describe('libro de cronograma: el ejemplo', () => {
  it('se lee sin errores y da el cronograma esperado', async () => {
    const r = leerCronograma(libroEjemplo());
    expect(r.errores).toEqual([]);
    const m = r.modelo!;
    expect(m.red.actividades).toHaveLength(14);
    expect(m.red.calendarios.map((c) => c.id)).toEqual(['Lunes a viernes', 'Lunes a sábado']);
    expect(m.red.calendarios[0]?.festivos).toHaveLength(90 - 1);
    expect(m.incertidumbre).toHaveLength(11);
    expect(m.riesgos.map((x) => [x.id, x.impactos.length])).toEqual([['R1', 2], ['R2', 1], ['R3', 1], ['R4', 1]]);
    const det = cpmDeterministico(compilarRed(m.red));
    // La estructura va en el calendario de lunes a sábado; el desencofrado espera 7 días calendario.
    expect(det.fin).toBe(serieDeFecha(2027, 11, 22));
    expect(det.duracion).toBe(218);
    const e = det.filas.find((f) => f.id === 'E');
    expect([e?.inicio, e?.fin]).toEqual([serieDeFecha(2027, 5, 22), serieDeFecha(2027, 7, 23)]);
    expect(det.filas.find((f) => f.id === 'F')?.inicio).toBe(serieDeFecha(2027, 8, 2));
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 2000 } });
    expect(sim.media).toBeGreaterThan(250);
    expect(sim.eliminacion[0]?.id).toBe('R1');
  });
});

describe('libro de cronograma: errores con hoja, fila y columna', () => {
  it('señala cada dato malo', () => {
    const libro = libroEjemplo();
    const act = libro[H.actividades] as unknown[][];
    act[3]![4] = -2; // B: duración negativa (fila 4, columna E)
    act.push(['C', 'Otra adecuación', '2.1', 'Tarea', 3, '', '', null, 'No']); // un ID repetido (fila 16)
    const rel = libro[H.relaciones] as unknown[][];
    rel[2]![1] = 'ZZ'; // fila 3: sucesora inexistente
    rel[6]![2] = 'XY'; // fila 7 (D → E): tipo desconocido
    const inc = libro[H.incertidumbre] as unknown[][];
    inc[1]![2] = 40; // A: mínimo mayor que el más probable (fila 2)
    const rie = libro[H.riesgos] as unknown[][];
    rie[1]![6] = 1.5e3; // probabilidad imposible
    const r = leerCronograma(libro);
    expect(r.modelo).toBeNull();
    expect(r.errores.map((e) => `${e.hoja}!${e.columna}${e.fila}`)).toEqual([
      'Actividades!E4', 'Actividades!A16', 'Relaciones!B3', 'Relaciones!C7', 'Incertidumbre!C2', 'Riesgos!G2',
    ]);
    expect(r.errores[0]?.mensaje).toMatch(/duración/);
    expect(r.errores[1]?.mensaje).toMatch(/ya está en la fila 5/);
  });

  it('sin la hoja Actividades, lo dice', () => {
    const r = leerCronograma({});
    expect(r.errores[0]?.mensaje).toMatch(/Falta la hoja «Actividades»/);
  });

  it('acepta columnas reordenadas, porcentajes escritos y fechas en texto', () => {
    const libro = libroEjemplo();
    libro[H.relaciones] = (libro[H.relaciones] as unknown[][]).map((f) => [f[1], f[0], ...f.slice(2)]);
    (libro[H.riesgos] as unknown[][])[1]![6] = '35 %';
    (libro[H.config] as unknown[][])[1]![1] = '04/01/2027';
    const r = leerCronograma(libro);
    expect(r.errores).toEqual([]);
    expect(r.modelo?.riesgos[0]?.probabilidad).toBeCloseTo(0.35, 12);
    expect(r.modelo?.red.inicio).toBe(INICIO);
  });

  it('una actividad resumen no entra en el cálculo y sus relaciones se avisan', () => {
    const libro = libroEjemplo();
    (libro[H.actividades] as unknown[][]).push(['RES', 'Fase de obra', '2', 'Resumen', 100, '', '', null, 'No']);
    (libro[H.relaciones] as unknown[][]).push(['RES', 'L', 'FC', 0, 'Laborables']);
    const r = leerCronograma(libro as Record<string, MatrizHoja>);
    expect(r.errores).toEqual([]);
    expect(r.modelo?.red.actividades.some((a) => a.id === 'RES')).toBe(false);
    expect(r.avisos.some((a) => a.includes('resumen'))).toBe(true);
  });
});

describe('hoja de resultados del cronograma', () => {
  it('lleva supuestos, advertencias, percentiles, tornado, índices y la curva S', async () => {
    const { hojaResultados } = await import('../../excel/cronogramaResultados.ts');
    const { chequearCalidad } = await import('../../engine/cronograma/index.ts');
    const m = leerCronograma(libroEjemplo()).modelo!;
    const modelo = { ...m, configuracion: { ...m.configuracion, iteraciones: 1000 } };
    const sim = await simularCronograma(modelo);
    const h = hojaResultados({ sim, modelo, calidad: chequearCalidad(modelo), ahora: 46400.5, version: '0.7.0' });
    const ancho = h.valores[0]!.length;
    expect(h.valores.every((f) => f.length === ancho)).toBe(true);
    expect(h.formatos.every((f) => f.length === ancho)).toBe(true);
    const textos = h.valores.map((f) => f[0]);
    for (const t of ['Supuestos de la corrida', 'Fin del proyecto', 'Hito: M · Obra gris terminada', 'Tornado por eliminación de riesgos', 'Índices por actividad', 'P80']) {
      expect(textos).toContain(t);
    }
    expect(h.rangoCurva).toMatch(/^K4:L\d+$/);
    // La correlación (fase 2) siempre sale en amarillo.
    expect(h.semaforos.some(([, , e]) => e === 'amarillo')).toBe(true);
  });
});

describe('libro de cronograma: hojas de Q2 y Q3', () => {
  it('el ejemplo trae costos, correlaciones, datos post y un factor por WBS', () => {
    const m = leerCronograma(libroEjemplo()).modelo!;
    expect(m.costos?.map((c) => [c.id, c.tipo, c.actividad ?? 'proyecto'])).toEqual([
      ['ADM', 'tiempo', 'proyecto'], ['INT', 'tiempo', 'proyecto'], ['CIM', 'fijo', 'D'], ['EST', 'fijo', 'E'],
      ['GRUA', 'recurso', 'E'], ['FACH', 'fijo', 'H'], ['ACAB', 'fijo', 'J'],
    ]);
    expect(m.costos?.find((c) => c.id === 'EST')?.escalamiento).toBeCloseTo(0.06, 12);
    expect(m.correlaciones).toEqual([{ a: 'ADM', b: 'INT', rho: 0.6 }]);
    expect(m.gruposCorrelacion?.map((g) => [g.nombre, g.miembros])).toEqual([['Obra húmeda', ['D', 'E', 'H']], ['Materiales', ['CIM', 'EST', 'FACH', 'ACAB']]]);
    const r1 = m.riesgos.find((r) => r.id === 'R1')!;
    expect([r1.probabilidadPost, r1.factorImpactoPost, r1.costoMitigacion]).toEqual([0.35, 0.5, 60_000_000]);
    expect(r1.impactos[0]?.costo).toEqual({ tipo: 'triangular', min: 20_000_000, moda: 40_000_000, max: 80_000_000 });
    expect(m.riesgos.find((r) => r.id === 'R4')!.impactos[0]?.costo).toEqual({ tipo: 'fija', valor: -30_000_000 });
    expect(m.incertidumbre.find((i) => i.selector)?.selector).toEqual({ wbs: '3' });
    expect(m.configuracion.costoMeta).toBe(5_600_000_000);
    expect(m.ramas).toEqual([]);
  });

  it('errores en Costos, Correlaciones y Ramas con su celda', () => {
    const libro = libroEjemplo();
    (libro[H.costos] as unknown[][])[1]![2] = 'Mensual';
    (libro[H.costos] as unknown[][])[3]![3] = 'ZZ';
    const fila3 = (libro[H.correlaciones] as unknown[][])[2]!;
    fila3[0] = 'EST'; fila3[1] = 'FACH'; fila3[2] = 1.5;
    (libro[H.correlaciones] as unknown[][])[2]![5] = 'EST, NADA';
    libro[H.ramas] = [['Rama', 'Opción', 'Probabilidad', 'Actividades'], ['Permiso', 'Sí', 0.6, 'B'], ['Permiso', 'No', 0.3, 'C']];
    const r = leerCronograma(libro);
    expect(r.errores.map((e) => `${e.hoja}!${e.columna}${e.fila}`)).toEqual([
      'Costos!C2', 'Costos!D4', 'Correlaciones!C3', 'Correlaciones!F3', 'Ramas!0',
    ]);
    expect(r.errores[4]?.mensaje).toMatch(/suman 90 %/);
  });

  it('la hoja de resultados lleva costo, JCL, pre/post, rutas y el cronograma ajustado', async () => {
    const { hojaResultados } = await import('../../excel/cronogramaResultados.ts');
    const { chequearCalidad } = await import('../../engine/cronograma/index.ts');
    const m = leerCronograma(libroEjemplo()).modelo!;
    const modelo = { ...m, configuracion: { ...m.configuracion, iteraciones: 1000 } };
    const sim = await simularCronograma(modelo);
    const h = hojaResultados({ sim, modelo, calidad: chequearCalidad(modelo), ahora: 46400.5, version: '0.8.0' });
    const textos = h.valores.map((f) => f[0]);
    for (const t of ['Costo del proyecto (COP)', 'Confianza conjunta costo–plazo (JCL)', 'Pre y post mitigación (mismos números aleatorios)',
      'Rutas críticas más frecuentes', 'Correlación pedida y lograda', 'Cronograma ajustado por riesgo (P50 y P80 de cada actividad)']) {
      expect(textos).toContain(t);
    }
    expect(h.graficos.map((g) => g.tipo)).toEqual(['linea', 'linea', 'dispersion']);
    const ancho = h.valores[0]!.length;
    expect(h.valores.every((f) => f.length === ancho)).toBe(true);
  });
});
