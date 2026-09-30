/**
 * El resultado de la simulación del plazo en palabras, generado con reglas
 * locales (sin IA externa: nada del libro sale del equipo). Es lo que se lee
 * en una reunión; las cifras están en la hoja.
 */

import { textoFecha } from '../modelo/fechas.ts';
import type { InformeSalud } from './salud.ts';
import type { ImpactoRiesgo, ResultadoSimulacionPlazo } from './simulacion.ts';

const pct = (x: number) => `${Math.round(x * 100)} %`;
const dias = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? 'día laborable' : 'días laborables'}`;

export function narrativaPlazo(r: ResultadoSimulacionPlazo, impacto?: { porRiesgo: ImpactoRiesgo[] }, salud?: InformeSalud): string[] {
  const out: string[] = [];
  const det = r.determinista.dias;
  const reserva = r.dias.p80 - Math.ceil(det - 1e-9);
  out.push(`Hay un 80 % de probabilidad de terminar el ${textoFecha(r.fechas.p80)} o antes (${dias(r.dias.p80)}); la mitad de los casos termina hacia el ${textoFecha(r.fechas.p50)}.`);

  if (r.probDeterminista < 0.5) {
    let frase = r.probDeterminista < 0.01
      ? `La fecha del cronograma (${textoFecha(r.determinista.fecha)}) casi nunca se cumple (menos del 1 % de los casos)`
      : `La fecha del cronograma (${textoFecha(r.determinista.fecha)}) solo se cumple en el ${pct(r.probDeterminista)} de los casos`;
    const conv = salud?.comprobaciones.find((c) => c.codigo === 'convergencias');
    if (conv && conv.actividades.length > 0) {
      frase += ': parte de la diferencia viene de las convergencias, donde varias rutas se juntan y basta con que una se retrase';
    }
    out.push(`${frase}.`);
  } else {
    out.push(`La fecha del cronograma (${textoFecha(r.determinista.fecha)}) se cumple en el ${pct(r.probDeterminista)} de los casos.`);
  }
  if (reserva > 0) out.push(`Para comprometer una fecha con un 80 % de confianza hace falta una reserva de ${dias(reserva)} sobre el cronograma.`);

  const principal = impacto?.porRiesgo.find((x) => x.diasP80 > 0);
  if (principal) out.push(`El riesgo que más pesa es «${principal.nombre}»: sin él, el P80 se adelantaría ${dias(principal.diasP80)}.`);

  const clave = [...r.actividades]
    .filter((a) => a.criticidad > 0.2 && !Number.isNaN(a.correlacion))
    .sort((a, b) => b.criticidad * b.correlacion - a.criticidad * a.correlacion)[0];
  if (clave) out.push(`La actividad que más mueve la fecha de fin es «${clave.nombre}» (crítica en el ${pct(clave.criticidad)} de los casos).`);
  return out;
}
