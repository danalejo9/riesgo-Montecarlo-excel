/**
 * Reserva de contingencia y su reparto (W2): cuánto tiempo y cuánto dinero
 * hay que reservar sobre el plan para llegar al nivel de confianza elegido
 * (P50, P80 o P90), y de dónde sale. Sin Office.js.
 *
 * - **Reserva** = el percentil elegido − el plan (el cronograma determinístico
 *   y su costo base, sin incertidumbre ni riesgos).
 * - **Incertidumbre**: lo que haría falta aunque no ocurriera ningún riesgo;
 *   sale de la corrida sin riesgos (los mismos números aleatorios).
 * - **Riesgos**: el resto (percentil con riesgos − percentil sin riesgos). Se
 *   reparte así: cada oportunidad resta lo que mide «quitarla y volver a
 *   simular» (la eliminación); lo que queda se reparte entre las amenazas en
 *   proporción a lo que aporta cada una. Así las partes **suman exactamente**
 *   la reserva, aunque los efectos de los riesgos no se sumen (el de dos
 *   juntos no es la suma de cada uno). Si ninguna amenaza mide nada (todas en
 *   rutas con holgura) y aun así queda algo, va a «Efecto conjunto».
 */

import { nivelesDe, NIVELES_RESERVA, type SimulacionCronograma } from './simulacion.ts';

export type NivelReserva = (typeof NIVELES_RESERVA)[number];

export interface ParteReserva {
  id: string;
  nombre: string;
  tipo: 'incertidumbre' | 'amenaza' | 'oportunidad' | 'conjunto';
  /** Días laborables del proyecto. */
  dias: number;
  costo: number | null;
}

export interface Reserva {
  nivel: NivelReserva;
  /** El plan: días laborables, fecha de fin y costo base. */
  plan: { dias: number; fecha: number; costo: number | null };
  /** El percentil elegido: días, fecha (el día con esa confianza) y costo. */
  objetivo: { dias: number; fecha: number; costo: number | null };
  /** Lo que hay que reservar (objetivo − plan). */
  dias: number;
  costo: number | null;
  /** Suman `dias` (y `costo`) exactamente. */
  partes: ParteReserva[];
}

/** Reparte `total` entre los efectos medidos: las oportunidades (negativas) tal cual; el resto, entre las amenazas en proporción. */
function repartir(total: number, deltas: readonly number[]): { partes: number[]; conjunto: number } {
  const negativas = deltas.reduce((s, d) => s + Math.min(0, d), 0);
  const positivas = deltas.reduce((s, d) => s + Math.max(0, d), 0);
  const resto = total - negativas;
  if (positivas <= 0) return { partes: deltas.map((d) => Math.min(0, d)), conjunto: resto };
  return { partes: deltas.map((d) => (d < 0 ? d : (resto * d) / positivas)), conjunto: 0 };
}

/** El día (número de serie) con al menos esa probabilidad de no pasarse. */
function fechaConConfianza(serie: Float64Array, p: number): number {
  const o = Float64Array.from(serie).sort();
  return Math.floor(o[Math.min(o.length - 1, Math.max(0, Math.ceil(p * o.length) - 1))] as number);
}

export function reservaContingencia(sim: SimulacionCronograma, nivel: NivelReserva = 0.8): Reserva {
  const k = NIVELES_RESERVA.indexOf(nivel);
  if (k < 0) throw new Error(`Nivel de reserva desconocido: ${nivel}`);
  const planDias = sim.deterministico.duracion;
  const objetivoDias = nivelesDe(sim.fin.dias)[k] as number;
  const conCosto = sim.costo !== null && sim.costoBase !== null;
  const objetivoCosto = conCosto ? (nivelesDe(sim.costo as Float64Array)[k] as number) : null;
  const dias = objetivoDias - planDias;
  const costo = conCosto ? (objetivoCosto as number) - (sim.costoBase as number) : null;
  const base: Omit<Reserva, 'partes'> = {
    nivel,
    plan: { dias: planDias, fecha: sim.deterministico.fin, costo: sim.costoBase },
    objetivo: { dias: objetivoDias, fecha: fechaConConfianza(sim.fin.serie, nivel), costo: objetivoCosto },
    dias,
    costo,
  };
  const incertidumbre = (d: number, c: number | null): ParteReserva => ({
    id: 'incertidumbre', nombre: 'Incertidumbre de duraciones y costos (sin riesgos)', tipo: 'incertidumbre', dias: d, costo: c,
  });
  const sr = sim.sinRiesgos;
  if (!sr || sim.eliminacion.length === 0) return { ...base, partes: [incertidumbre(dias, costo)] };

  const baseDias = (sr.nivelesDias[k] as number) - planDias;
  const baseCosto = costo !== null && sr.nivelesCosto ? (sr.nivelesCosto[k] as number) - (sim.costoBase as number) : null;
  // Lo que aporta cada riesgo: el percentil con todo menos el percentil sin él.
  const deltaDias = sim.eliminacion.map((e) => objetivoDias - (e.nivelesDias[k] as number));
  const deltaCosto = sim.eliminacion.map((e) => (objetivoCosto !== null && e.nivelesCosto ? objetivoCosto - (e.nivelesCosto[k] as number) : 0));
  const rd = repartir(dias - baseDias, deltaDias);
  const rc = costo !== null && baseCosto !== null ? repartir(costo - baseCosto, deltaCosto) : null;
  const partes: ParteReserva[] = [incertidumbre(baseDias, baseCosto)];
  sim.eliminacion.forEach((e, i) => {
    const dd = deltaDias[i] as number;
    const dc = deltaCosto[i] as number;
    const oportunidad = dd < 0 || (dd <= 0 && dc < 0);
    partes.push({ id: e.id, nombre: e.nombre, tipo: oportunidad ? 'oportunidad' : 'amenaza', dias: rd.partes[i] as number, costo: rc ? (rc.partes[i] as number) : null });
  });
  if (Math.abs(rd.conjunto) > 1e-9 || (rc && Math.abs(rc.conjunto) > 1e-9)) {
    partes.push({ id: 'conjunto', nombre: 'Efecto conjunto de los riesgos', tipo: 'conjunto', dias: rd.conjunto, costo: rc ? rc.conjunto : null });
  }
  return { ...base, partes };
}
