/**
 * Reserva de contingencia y su reparto (W2): cuánto tiempo y cuánto dinero
 * hay que reservar sobre el plan para llegar al nivel de confianza elegido
 * (P50, P80 o P90), y de dónde sale.
 *
 * - **Reserva** = el percentil elegido − el plan (el cronograma y su costo
 *   sin incertidumbre ni riesgos).
 * - **Incertidumbre** (duraciones, costos inciertos, multas de esa
 *   incertidumbre…): lo que haría falta aunque no ocurriera ningún riesgo;
 *   sale de la simulación sin riesgos.
 * - **Riesgos**: el resto (percentil con riesgos − percentil sin riesgos).
 *   Se reparte así: cada oportunidad resta lo que mide «quitarla y volver a
 *   simular»; lo que queda se reparte entre las amenazas en proporción a lo
 *   que aporta cada una. Así las partes **suman exactamente** la reserva,
 *   aunque los efectos de los riesgos no se sumen (el de dos juntos no es la
 *   suma de cada uno).
 */

import type { ImpactoRiesgo, ResultadoSimulacionPlazo, SinRiesgos } from './simulacion.ts';

export type NivelReserva = 'p50' | 'p80' | 'p90';
export const NIVELES_RESERVA: readonly NivelReserva[] = ['p50', 'p80', 'p90'];

export interface ParteReserva {
  id: string;
  nombre: string;
  tipo: 'incertidumbre' | 'amenaza' | 'oportunidad' | 'interacción';
  dias: number;
  costo?: number;
}

export interface Reserva {
  nivel: NivelReserva;
  plan: { dias: number; fecha: number; costo?: number };
  objetivo: { dias: number; fecha: number; costo?: number };
  /** Días (en la unidad de la simulación) y dinero que hay que reservar. */
  dias: number;
  costo?: number;
  /** Suman `dias` (y `costo`) exactamente. */
  partes: ParteReserva[];
}

const deltaDias = (x: ImpactoRiesgo, n: NivelReserva) => (n === 'p50' ? x.diasP50 : n === 'p80' ? x.diasP80 : (x.diasP90 ?? x.diasP80));
const deltaCosto = (x: ImpactoRiesgo, n: NivelReserva) => (n === 'p50' ? x.costoP50 : n === 'p80' ? x.costoP80 : x.costoP90);
const sinDias = (s: SinRiesgos, n: NivelReserva) => (n === 'p50' ? s.diasP50 : n === 'p80' ? s.diasP80 : s.diasP90);
const sinCosto = (s: SinRiesgos, n: NivelReserva) => (n === 'p50' ? s.costoP50 : n === 'p80' ? s.costoP80 : s.costoP90);

/** Reparte `total` entre los efectos medidos: las oportunidades (negativas) tal cual; el resto, entre las amenazas en proporción. */
function repartir(total: number, deltas: readonly number[]): { partes: number[]; interaccion: number } {
  const negativas = deltas.reduce((s, d) => s + Math.min(0, d), 0);
  const positivas = deltas.reduce((s, d) => s + Math.max(0, d), 0);
  const resto = total - negativas;
  if (positivas <= 0) return { partes: deltas.map((d) => Math.min(0, d)), interaccion: resto };
  return { partes: deltas.map((d) => (d < 0 ? d : (resto * d) / positivas)), interaccion: 0 };
}

export function reservaContingencia(
  r: ResultadoSimulacionPlazo,
  impacto: { porRiesgo: readonly ImpactoRiesgo[]; sinRiesgos: SinRiesgos } | undefined,
  nivel: NivelReserva = 'p80',
): Reserva {
  const planDias = Math.ceil(r.determinista.dias - 1e-9);
  const objetivoDias = r.dias[nivel];
  const c = r.costos;
  const objetivoCosto = c ? c[nivel] : undefined;
  const dias = objetivoDias - planDias;
  const costo = c && objetivoCosto !== undefined ? objetivoCosto - c.determinista : undefined;
  const base = {
    nivel,
    plan: { dias: planDias, fecha: r.determinista.fecha, ...(c ? { costo: c.determinista } : {}) },
    objetivo: { dias: objetivoDias, fecha: r.fechas[nivel], ...(objetivoCosto !== undefined ? { costo: objetivoCosto } : {}) },
    dias,
    ...(costo !== undefined ? { costo } : {}),
  };
  const incertidumbre = (d: number, k?: number): ParteReserva => ({
    id: 'incertidumbre', nombre: 'Incertidumbre de duraciones y costos (sin riesgos)', tipo: 'incertidumbre', dias: d, ...(k !== undefined ? { costo: k } : {}),
  });
  if (!impacto) return { ...base, partes: [incertidumbre(dias, costo)] };

  const sinD = sinDias(impacto.sinRiesgos, nivel);
  const sinC = sinCosto(impacto.sinRiesgos, nivel);
  const baseDias = sinD - planDias;
  const baseCosto = costo !== undefined && sinC !== undefined && c ? sinC - c.determinista : undefined;
  const riesgosDias = dias - baseDias;
  const riesgosCosto = costo !== undefined && baseCosto !== undefined ? costo - baseCosto : undefined;
  const rd = repartir(riesgosDias, impacto.porRiesgo.map((x) => deltaDias(x, nivel)));
  const rc = riesgosCosto !== undefined ? repartir(riesgosCosto, impacto.porRiesgo.map((x) => deltaCosto(x, nivel) ?? 0)) : undefined;
  const partes: ParteReserva[] = [incertidumbre(baseDias, baseCosto)];
  impacto.porRiesgo.forEach((x, i) => {
    const d = rd.partes[i] as number;
    const k = rc?.partes[i];
    const oportunidad = deltaDias(x, nivel) < 0 || (k !== undefined && (deltaCosto(x, nivel) ?? 0) < 0 && deltaDias(x, nivel) <= 0);
    partes.push({ id: x.id, nombre: x.nombre, tipo: oportunidad ? 'oportunidad' : 'amenaza', dias: d, ...(k !== undefined ? { costo: k } : {}) });
  });
  if (Math.abs(rd.interaccion) > 1e-9 || (rc && Math.abs(rc.interaccion) > 1e-9)) {
    partes.push({ id: 'interaccion', nombre: 'Efecto conjunto de los riesgos', tipo: 'interacción', dias: rd.interaccion, ...(rc ? { costo: rc.interaccion } : {}) });
  }
  return { ...base, partes };
}
