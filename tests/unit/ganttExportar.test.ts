/** Gantt G3: exportar a MS Project XML (ida y vuelta con el importador) y CSV. */
import { describe, expect, it } from 'vitest';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { construirVista, datosGanttDe } from '../../excel/gantt.ts';
import { csvGantt, exportarMspdi } from '../../excel/exportarGantt.ts';
import { hojasImportadas, importarMsProject } from '../../excel/importarCronograma.ts';
import { compilarRed, cpmDeterministico } from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INI = serieDeFecha(2027, 1, 4);

describe('exportar el Gantt', () => {
  const l = leerCronograma(Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, h.valores.map((f) => [...f])])));
  const datos = datosGanttDe(l)!;
  const v = construirVista(datos);

  it('MS Project XML: el importador lo vuelve a leer igual (actividades, vínculos, calendarios y fechas)', () => {
    const xml = exportarMspdi(datos, v, 'Obra de ejemplo');
    const imp = importarMsProject(xml);
    expect(imp.nombre).toBe('Obra de ejemplo');
    expect(imp.inicio).toBe(INI);
    expect(imp.calendarios.map((c) => c.nombre)).toEqual(['Lunes a viernes', 'Lunes a sábado']);
    expect(imp.calendarios[0]!.festivos.length).toBe(datos.modelo.red.calendarios[0]!.festivos!.length);
    // Mismas actividades (con resúmenes) en el mismo orden, con su tipo y duración.
    expect(imp.actividades.map((a) => [a.nombre, a.tipo, a.duracion])).toEqual(v.filas.map((f) => [f.nombre, f.tipo === 'resumen' ? 'Resumen' : f.tipo === 'hito' ? 'Hito' : 'Tarea', f.tipo === 'resumen' ? f.duracion : f.duracion]));
    expect(imp.relaciones).toHaveLength(16);
    const ef = imp.relaciones.find((r) => r.tipo === 'FC' && r.calendario);
    expect(ef).toMatchObject({ desfase: 7, calendario: true });
    expect(imp.relaciones.some((r) => r.tipo === 'CC' && r.desfase === 5)).toBe(true);
    // Volver a calcular lo importado da el mismo fin.
    const hojas = Object.fromEntries(hojasImportadas(imp).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
    const l2 = leerCronograma({ ...Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, [h.valores[0]!]])), ...hojas,
      Config: hojasNuevasCronograma(INI).find((h) => h.nombre === 'Config')!.valores.map((f) => [...f]) });
    expect(l2.errores).toEqual([]);
    expect(cpmDeterministico(compilarRed(l2.modelo!.red)).fin).toBe(v.fin);
  });

  it('CSV con punto y coma, BOM y una fila por actividad', () => {
    const csv = csvGantt(v);
    expect(csv.startsWith('﻿ID;WBS;Nombre')).toBe(true);
    const lineas = csv.trim().split(/\r?\n/);
    expect(lineas).toHaveLength(v.filas.length + 1);
    expect(lineas.find((x) => x.startsWith('E;'))).toMatch(/^E;2\.3;Estructura;tarea;50;22\/05\/2027;23\/07\/2027/);
    expect(lineas.find((x) => x.startsWith('F;'))).toContain('E FC+7dc');
  });

  it('el avance y las fechas límite van y vuelven por MS Project XML', async () => {
    const { serieDeFecha: s } = await import('../../engine/modelo/fechas.ts');
    const red = datos.modelo.red;
    const conAvance = { ...datos, modelo: { ...datos.modelo, red: { ...red, fechaCorte: s(2027, 3, 1), actividades: red.actividades.map((a) =>
      a.id === 'A' ? { ...a, avance: { inicioReal: INI, finReal: s(2027, 2, 12) } }
        : a.id === 'B' ? { ...a, avance: { inicioReal: s(2027, 2, 15), porcentaje: 0.4 } }
          : a.id === 'L' ? { ...a, fechaLimite: s(2028, 1, 31) } : a) } } };
    const imp = importarMsProject(exportarMspdi(conAvance, construirVista(conAvance)));
    expect(imp.fechaCorte).toBe(s(2027, 3, 1));
    const por = (n: string) => imp.actividades.find((a) => a.nombre === n)!;
    expect(por('Diseño y estudios')).toMatchObject({ inicioReal: INI, finReal: s(2027, 2, 12) });
    expect(por('Licencia de construcción')).toMatchObject({ inicioReal: s(2027, 2, 15), porcentaje: 0.4 });
    expect(por('Entrega').fechaLimite).toBe(s(2028, 1, 31));
    const act = hojasImportadas(imp).find((h) => h.nombre === 'Actividades')!;
    expect(act.valores.find((f) => f[1] === 'Licencia de construcción')!.slice(10, 14)).toEqual([null, s(2027, 2, 15), null, 0.4]);
  });
});
