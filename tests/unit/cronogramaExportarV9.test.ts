/** V9: exportar a Primavera P6 (XER) y los resultados de la simulación en MS Project y P6. */
import { describe, expect, it } from 'vitest';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { construirVista, datosGanttDe, qrsaDeSimulacion } from '../../excel/gantt.ts';
import { aWindows1252, CAMPOS_MSP, exportarMspdi, exportarXer } from '../../excel/exportarGantt.ts';
import { importarMsProject, importarXer, leerXer } from '../../excel/importarCronograma.ts';
import { simularCronograma } from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INI = serieDeFecha(2027, 1, 4);
const l = leerCronograma(Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, h.valores.map((f) => [...f])])));
const datos = datosGanttDe(l)!;
const vista = construirVista(datos);

describe('Primavera P6 (XER)', () => {
  it('el importador lo vuelve a leer: actividades, duraciones, vínculos, calendarios y WBS', () => {
    const { texto, avisos } = exportarXer(datos, vista, 'Obra de ejemplo');
    const imp = importarXer(texto);
    expect(imp.inicio).toBe(INI);
    expect(imp.nombre).toBe('Obra de ejemplo');
    expect(imp.calendarioProyecto).toBe('Lunes a viernes');
    expect(imp.calendarios.map((c) => [c.nombre, c.laborables])).toEqual(datos.modelo.red.calendarios.map((c) => [c.id, [...c.laborables]]));
    expect(imp.calendarios[0]!.festivos).toEqual([...(datos.modelo.red.calendarios[0]!.festivos ?? [])].sort((a, b) => a - b));
    // Las tareas y los hitos (los resúmenes son la WBS de P6), con su duración y la WBS de su resumen.
    const tareas = vista.filas.filter((f) => f.tipo !== 'resumen');
    expect(imp.actividades.map((a) => [a.id, a.tipo, a.duracion])).toEqual(tareas.map((f) => [f.id, f.tipo === 'hito' ? 'Hito' : 'Tarea', f.tipo === 'hito' ? 0 : f.duracion]));
    expect(imp.actividades.find((a) => a.id === 'E')?.wbs).toBe('2');
    expect(imp.actividades.find((a) => a.id === 'E')?.calendario).toBe('Lunes a sábado');
    expect(imp.relaciones).toHaveLength(16);
    expect(imp.relaciones.some((r) => r.predecesora === 'F' && r.sucesora === 'H' && r.tipo === 'CC' && r.desfase === 5)).toBe(true);
    // El desfase en días calendario (curado) no tiene equivalente en P6: se avisa.
    expect(avisos[0]).toMatch(/1 desfase va en días calendario/);
  });

  it('con simulación, el P50, el P80 y la criticidad van en campos de usuario', async () => {
    const sim = await simularCronograma({ ...l.modelo!, configuracion: { ...l.modelo!.configuracion, iteraciones: 300 } });
    const conQrsa = { ...datos, qrsa: qrsaDeSimulacion(sim) };
    const v = construirVista(conQrsa);
    const tablas = leerXer(exportarXer(conQrsa, v).texto);
    expect(tablas.get('UDFTYPE')?.map((u) => u.udf_type_label)).toEqual(['Fin P50 (QRSA)', 'Fin P80 (QRSA)', 'Criticidad % (QRSA)']);
    const tareaE = tablas.get('TASK')!.find((t) => t.task_code === 'E')!;
    const valores = tablas.get('UDFVALUE')!.filter((u) => u.fk_id === tareaE.task_id);
    const e = v.filas.find((f) => f.id === 'E')!;
    expect(valores.find((u) => u.udf_type_id === '9002')?.udf_date).toBe(`${new Date(Date.UTC(1899, 11, 30) + e.qrsa!.p80 * 86_400_000).toISOString().slice(0, 10)} 17:00`);
    expect(Number(valores.find((u) => u.udf_type_id === '9003')?.udf_number)).toBeCloseTo(e.qrsa!.criticidad * 100, 1);
    // Y en MS Project: Fecha1, Fecha2 y Número1.
    const xml = exportarMspdi(conQrsa, v, 'x');
    expect(xml).toContain(`<FieldID>${CAMPOS_MSP.Date2}</FieldID><FieldName>Date2</FieldName><Alias>Fin P80 (QRSA)</Alias>`);
    expect(xml.match(new RegExp(`<FieldID>${CAMPOS_MSP.Number1}</FieldID><Value>`, 'g'))?.length).toBe(v.filas.filter((f) => f.qrsa && f.tipo !== 'resumen').length);
    // El XML sigue importándose igual.
    expect(importarMsProject(xml).actividades).toHaveLength(v.filas.length);
  });

  it('se codifica en Windows-1252 (las tildes en un byte)', () => {
    expect([...aWindows1252('Diseño €')]).toEqual([0x44, 0x69, 0x73, 0x65, 0xf1, 0x6f, 0x20, 0x80]);
  });
});
