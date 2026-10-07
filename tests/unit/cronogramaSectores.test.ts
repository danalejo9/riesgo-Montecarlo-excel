/** W6: ejemplos por sector, listos para simular. */
import { describe, expect, it } from 'vitest';
import { chequearCalidad, EJEMPLOS_SECTOR, resumirHitosContractuales, simularCronograma } from '../../engine/cronograma/index.ts';
import { HOJAS_CRONOGRAMA as H, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { leerEscenarios } from '../../excel/escenariosCronograma.ts';
import { EJEMPLOS_LIBRO, hojasDeEjemplo, hojasDeSector } from '../../excel/sectoresCronograma.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INICIO = serieDeFecha(2027, 2, 1);

describe('ejemplos por sector', () => {
  it('se ofrecen la obra y los cuatro sectores', () => {
    expect(EJEMPLOS_LIBRO.map((e) => e.id)).toEqual(['obra', 'vivienda', 'via', 'edificio', 'software']);
    expect(hojasDeEjemplo('obra', INICIO).find((h) => h.nombre === H.actividades)?.valores).toHaveLength(19);
  });

  for (const e of EJEMPLOS_SECTOR) {
    it(`${e.nombre}: se lee sin errores, pasa la calidad y se simula con su hito contractual`, async () => {
      const hojas = hojasDeSector(e.id, INICIO);
      // Las mismas hojas que el libro de siempre.
      expect(hojas.map((h) => h.nombre).sort()).toEqual(Object.values(H).sort());
      const libro = Object.fromEntries(hojas.map((h) => [h.nombre, h.valores]));
      const l = leerCronograma(libro);
      expect(l.errores).toEqual([]);
      const m = l.modelo!;
      expect(m.red.actividades).toHaveLength(e.actividades.length);
      expect(m.riesgos).toHaveLength(e.riesgos.length);
      expect(m.hitosContractuales?.[0]?.actividad).toBe(e.hito.id);
      expect(m.configuracion.fechaMeta).toBe(m.hitosContractuales?.[0]?.fecha);
      expect(chequearCalidad(m).bloquea).toBe(false);
      const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 500 } });
      expect(sim.costo).not.toBeNull();
      // El plan cumple el contrato (hay margen); la simulación no siempre.
      const [h] = resumirHitosContractuales(sim);
      expect(h!.serieDeterministica).toBeLessThanOrEqual(h!.fecha);
      expect(h!.probabilidadCumplir).toBeGreaterThan(0.05);
      expect(h!.probabilidadCumplir).toBeLessThan(1);
      // Los riesgos pesan y las oportunidades restan.
      expect(sim.eliminacion.some((x) => x.reduccionP80 > 0)).toBe(true);
      // Y los escenarios de la hoja se leen.
      expect(leerEscenarios(libro[H.escenarios], m).errores).toEqual([]);
    });
  }

  it('el impacto de un riesgo se reparte en días por actividad afectada (también por grupo)', () => {
    const libro = Object.fromEntries(hojasDeSector('vivienda', INICIO).map((h) => [h.nombre, h.valores]));
    const m = leerCronograma(libro).modelo!;
    // R1: lluvias en «Movimiento de tierras y cimentación» y «Obra gris y estructura»: 6 actividades.
    const r1 = m.riesgos.find((r) => r.id === 'R1')!;
    expect(r1.impactos.map((i) => i.actividad)).toEqual(['6', '5', '7', '8', '9', '15']);
    // Estructura (40 días): 5 %, 10 % y 25 % → 2, 4 y 10 días.
    expect(r1.impactos.find((i) => i.actividad === '7')?.dias).toEqual({ tipo: 'triangular', min: 2, moda: 4, max: 10 });
    expect(r1.probabilidadPost).toBe(0.45);
    expect(r1.factorImpactoPost).toBe(0.6);
    expect(r1.costoMitigacion).toBe(2000);
  });
});
