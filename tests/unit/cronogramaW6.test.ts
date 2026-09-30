/**
 * W6: los ejemplos por sector. Cada uno tiene que leerse sin problemas,
 * calcular, pasar la salud sin rojos, simular con sus riesgos y su hito, y
 * mejorar con las respuestas a los riesgos: es lo primero que ve quien
 * empieza, y no puede fallar.
 */
import { describe, expect, it } from 'vitest';

import {
  calcularCPM, EJEMPLOS_SECTOR, escenarioDespues, hojasDeEjemplo, leerCronograma, leerRiesgosPlazo, revisarSalud, riesgosActivos, simularPlazo,
  OPCIONES_PLAZO_POR_DEFECTO, type Cronograma,
} from '../../engine/cronograma/index.ts';

const INICIO = 46_419; // lunes 01/02/2027
const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 4000 };

describe('ejemplos por sector (W6)', () => {
  it('hay cuatro: vivienda, vía, edificio público y software', () => {
    expect(EJEMPLOS_SECTOR.map((e) => e.id)).toEqual(['vivienda', 'via', 'edificio', 'software']);
    for (const e of EJEMPLOS_SECTOR) {
      for (const [id, , dur, , min, max] of e.actividades) {
        if (min !== '') expect(min <= dur && dur <= (max as number), `${e.id} ${id}`).toBe(true);
      }
    }
  });

  for (const e of EJEMPLOS_SECTOR) {
    it(`${e.nombre}: se lee, calcula, está sano y simula con su hito y sus riesgos`, async () => {
      const h = hojasDeEjemplo(e.id, INICIO);
      const l = leerCronograma(h.actividades.valores, h.calendario.valores, undefined, undefined, h.hitos.valores);
      expect(l.problemas).toEqual([]);
      const c = l.cronograma as Cronograma;
      expect(c.costoIndirectoDia).toBe(e.costoIndirectoDia);
      expect(c.calendario.laborables[6]).toBe(e.laborables[5]); // el sábado
      const r = calcularCPM(c);
      if (!r.ok) throw new Error(JSON.stringify(r.problemas));
      const salud = revisarSalud(c.actividades, r.filas);
      expect(salud.comprobaciones.filter((x) => x.estado === 'rojo')).toEqual([]);
      expect(salud.comprobaciones.find((x) => x.codigo === 'incertidumbre')?.estado).toBe('verde');

      const rs = leerRiesgosPlazo(h.riesgos.valores, c.actividades);
      expect(rs.problemas).toEqual([]);
      expect(rs.riesgos.some((x) => x.impactoMasProbable < 0)).toBe(true); // una oportunidad
      expect(rs.riesgos.filter((x) => x.despues).length).toBeGreaterThanOrEqual(3); // con respuesta

      // El hito: la fecha del plan más el margen del contrato.
      const fila = r.filas.find((f) => f.id === e.hito.id)!;
      expect(c.hitos).toEqual([{ id: e.hito.id, fecha: fila.fechaFin + e.hito.margen, multaDia: e.hito.multaDia, tope: e.hito.tope }]);

      const activos = riesgosActivos(rs.riesgos);
      const antes = await simularPlazo(c, activos, op);
      expect(antes.dias.p80).toBeGreaterThan(r.duracionProyecto);
      expect(antes.costos?.p80).toBeGreaterThan(antes.costos!.determinista);
      const hito = antes.hitos![0]!;
      expect(hito.probCumplir).toBeGreaterThan(0.2);
      expect(hito.probCumplir).toBeLessThan(0.9);
      expect(hito.multaMedia).toBeGreaterThan(0);

      // Las respuestas a los riesgos acortan el P80.
      const d = escenarioDespues(c, activos);
      const despues = await simularPlazo(d.cronograma, d.riesgos, op);
      expect(despues.dias.p80).toBeLessThan(antes.dias.p80);
    });
  }

  it('un sector que no existe es un error', () => {
    expect(() => hojasDeEjemplo('minería' as 'via', INICIO)).toThrow('No hay ejemplo');
  });
});
