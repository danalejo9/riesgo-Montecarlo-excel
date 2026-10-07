/** W2: reserva de contingencia y su reparto entre incertidumbre y riesgos. */
import { describe, expect, it } from 'vitest';
import { NIVELES_RESERVA, reservaContingencia, simularCronograma, type ActividadRed, type RiesgoCronograma } from '../../engine/cronograma/index.ts';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { modelo } from '../helpers/cronogramas.ts';

const fc = (id: string) => ({ id, tipo: 'FC' as const, desfase: 0 });
const tri = (min: number, moda: number, max: number) => ({ tipo: 'triangular' as const, min, moda, max });
const red: ActividadRed[] = [
  { id: 'A', nombre: 'A', duracion: 20, predecesoras: [] },
  { id: 'B', nombre: 'B', duracion: 15, predecesoras: [fc('A')] },
  { id: 'C', nombre: 'C', duracion: 5, predecesoras: [fc('A')] },
];
const riesgos: RiesgoCronograma[] = [
  { id: 'R1', nombre: 'Lluvia', probabilidad: 0.5, impactos: [{ actividad: 'A', dias: tri(3, 5, 10), costo: tri(100, 200, 400) }] },
  { id: 'R2', nombre: 'Proveedor', probabilidad: 0.3, impactos: [{ actividad: 'B', dias: tri(5, 8, 15) }] },
  { id: 'O1', nombre: 'Prefabricado', probabilidad: 0.6, impactos: [{ actividad: 'B', dias: { tipo: 'fija', valor: -3 } }] },
  // En una ruta con mucha holgura: no mueve el fin.
  { id: 'R3', nombre: 'Holgura', probabilidad: 0.5, impactos: [{ actividad: 'C', dias: { tipo: 'fija', valor: 2 } }] },
];

describe('reserva de contingencia', () => {
  it('las partes suman exactamente la reserva, en días y en dinero, en los tres niveles', async () => {
    const m = modelo(red, [{ actividad: 'A', distribucion: tri(18, 20, 28) }, { actividad: 'B', distribucion: tri(14, 15, 20) }], riesgos, { iteraciones: 3000, redondeo: 'decimal' });
    const sim = await simularCronograma({ ...m, costos: [{ id: 'ADM', nombre: 'Administración', tipo: 'tiempo', valor: 100 }] });
    for (const p of NIVELES_RESERVA) {
      const r = reservaContingencia(sim, p);
      expect(r.plan.dias).toBe(35);
      expect(r.dias).toBeCloseTo(r.objetivo.dias - r.plan.dias, 9);
      expect(r.partes.reduce((s, x) => s + x.dias, 0)).toBeCloseTo(r.dias, 9);
      expect(r.partes.reduce((s, x) => s + (x.costo ?? 0), 0)).toBeCloseTo(r.costo as number, 6);
      expect(r.partes.find((x) => x.id === 'O1')?.tipo).toBe('oportunidad');
      expect(r.partes.find((x) => x.id === 'O1')!.dias).toBeLessThanOrEqual(0);
      expect(r.partes.find((x) => x.id === 'R3')?.dias).toBe(0);
    }
    // Más confianza, más reserva.
    const [p50, p80, p90] = NIVELES_RESERVA.map((p) => reservaContingencia(sim, p));
    expect(p80!.dias).toBeGreaterThan(p50!.dias);
    expect(p90!.dias).toBeGreaterThanOrEqual(p80!.dias);
    expect(p80!.objetivo.fecha).toBeGreaterThan(p80!.plan.fecha);
  });

  it('sin riesgos, toda la reserva es incertidumbre', async () => {
    const sim = await simularCronograma(modelo(red, [{ actividad: 'A', distribucion: tri(18, 20, 30) }], [], { iteraciones: 1000 }));
    const r = reservaContingencia(sim);
    expect(r.partes).toHaveLength(1);
    expect(r.partes[0]?.tipo).toBe('incertidumbre');
    expect(r.partes[0]?.dias).toBe(r.dias);
    expect(r.costo).toBeNull();
  });

  it('el ejemplo del libro: reserva positiva y bien repartida', async () => {
    const m = leerCronograma(Object.fromEntries(hojasNuevasCronograma(serieDeFecha(2027, 1, 4)).map((h) => [h.nombre, h.valores.map((f) => [...f])]))).modelo!;
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 1000 } });
    const r = reservaContingencia(sim, 0.8);
    expect(r.dias).toBeGreaterThan(0);
    expect(r.costo).toBeGreaterThan(0);
    expect(r.partes.reduce((s, x) => s + x.dias, 0)).toBeCloseTo(r.dias, 9);
    expect(r.partes.reduce((s, x) => s + (x.costo ?? 0), 0)).toBeCloseTo(r.costo as number, 3);
  });
});
