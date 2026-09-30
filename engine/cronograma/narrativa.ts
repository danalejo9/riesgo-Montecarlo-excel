/**
 * El resultado de la simulación del plazo en palabras, generado con reglas
 * locales (sin IA externa: nada del libro sale del equipo). Es lo que se lee
 * en una reunión; las cifras están en la hoja.
 */

import { textoFecha } from '../modelo/fechas.ts';
import { MONEDA_POR_DEFECTO, textoMoneda } from '../modelo/moneda.ts';
import type { InformeSalud } from './salud.ts';
import type { ImpactoRiesgo, ResultadoSimulacionPlazo } from './simulacion.ts';
import type { ComparacionMitigacion } from './mitigacion.ts';

const pct = (x: number) => `${Math.round(x * 100)} %`;
const dias = (n: number) => `${Math.round(n)} ${Math.round(n) === 1 ? 'día laborable' : 'días laborables'}`;

export function narrativaPlazo(
  r: ResultadoSimulacionPlazo,
  impacto?: { porRiesgo: ImpactoRiesgo[] },
  salud?: InformeSalud,
  codigoMoneda = MONEDA_POR_DEFECTO,
): string[] {
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

  const c = r.costos;
  if (c) {
    const dinero = (x: number) => textoMoneda(x, codigoMoneda);
    let frase = `El costo tiene un 80 % de probabilidad de no pasar de ${dinero(c.p80)} (el cronograma lo estima en ${dinero(c.determinista)})`;
    frase += `; pero cumplir a la vez el P80 de plazo y el P80 de costo solo ocurre en el ${pct(c.jclP80)} de los casos`;
    if (c.conjunto80 && c.jclP80 < 0.8) frase += `: para un 80 % conjunto hacen falta el ${textoFecha(c.conjunto80.fecha)} y ${dinero(c.conjunto80.costo)}`;
    out.push(`${frase}.`);
  }
  return out;
}

/** V1: la comparación antes/después en palabras. */
export function narrativaMitigacion(cmp: ComparacionMitigacion, codigoMoneda = MONEDA_POR_DEFECTO): string[] {
  const { antes: a, despues: d } = cmp;
  const dinero = (x: number) => textoMoneda(x, codigoMoneda);
  const n = cmp.porRespuesta.length;
  const out: string[] = [];
  let frase = `Aplicar ${n === 1 ? 'la respuesta' : `las ${n} respuestas`}${cmp.costoRespuestas > 0 ? ` (${dinero(cmp.costoRespuestas)})` : ''} `;
  const dias = a.dias.p80 - d.dias.p80;
  frase += dias > 0
    ? `adelanta el P80 del ${textoFecha(a.fechas.p80)} al ${textoFecha(d.fechas.p80)} (${dias} ${dias === 1 ? 'día laborable' : 'días laborables'})`
    : `no adelanta el P80 del plazo (${textoFecha(a.fechas.p80)})`;
  if (a.costos && d.costos) {
    const ahorro = a.costos.p80 - d.costos.p80;
    frase += ahorro >= 0
      ? ` y baja el P80 del costo de ${dinero(a.costos.p80)} a ${dinero(d.costos.p80)}, ya pagadas las respuestas`
      : ` pero sube el P80 del costo de ${dinero(a.costos.p80)} a ${dinero(d.costos.p80)}: las respuestas cuestan más de lo que ahorran`;
  }
  out.push(`${frase}.`);
  const mejor = cmp.porRespuesta.find((x) => x.retorno !== undefined);
  if (mejor && mejor.retorno !== undefined) {
    out.push(`La que más rinde es «${mejor.respuesta || mejor.nombre}»: cada ${dinero(1)} invertido ahorra ${textoMoneda(mejor.retorno, codigoMoneda, 2)} del P80 del costo${mejor.diasP80 > 0 ? ` y adelanta ${mejor.diasP80} días el P80` : ''}.`);
  }
  const malas = cmp.porRespuesta.filter((x) => x.retorno !== undefined && x.retorno < 1 && x.diasP80 <= 0);
  if (malas.length > 0) out.push(`No se pagan solas: ${malas.map((x) => `«${x.respuesta || x.nombre}»`).join(', ')} (ahorran menos de lo que cuestan y no adelantan el P80).`);
  return out;
}
