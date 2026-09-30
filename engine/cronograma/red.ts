/**
 * Lo que cada actividad aporta al CPM además de su duración y sus
 * relaciones: avance real y restricciones, ya convertidos a índices de día
 * laborable. Lo usan el CPM determinista (`cpm.ts`) y la simulación
 * (`simulacion.ts`), para que las dos apliquen exactamente las mismas reglas.
 *
 * **Avance** (con la fecha de corte `C`, primer día del trabajo que queda):
 * - *Terminada* (tiene fin real): ocupa de su inicio real a su fin real; ni
 *   la lógica ni la incertidumbre ni los riesgos la mueven.
 * - *En curso* (inicio real, sin fin): empezó cuando empezó; lo que queda
 *   (`restante`, o `duración × (1 − completado)`) empieza en `C`. Solo lo que
 *   queda tiene incertidumbre y sufre los riesgos, en proporción.
 * - *Pendiente*: no empieza antes de `C`.
 * Las que ya empezaron no esperan a sus predecesoras (*progress override*).
 *
 * **Restricciones**: «inicio no antes de» y «terminar no antes de» empujan
 * las fechas tempranas; «inicio no después de» y «terminar no después de»
 * limitan las tardías, así que no mueven nada pero pueden dejar holgura
 * negativa (que el chequeo de salud pone en rojo).
 *
 * La duración efectiva de una actividad es `transcurrido + duración × escala`
 * (pendiente: 0 + d × 1; en curso: días ya pasados + restante; terminada: su
 * duración real + 0).
 */

import type { IndiceLaborable } from './calendario.ts';
import type { Reloj } from './relojes.ts';
import type { Cronograma } from './tipos.ts';

export type EstadoAvance = 'pendiente' | 'en curso' | 'terminada';

export interface ParametrosRed {
  estado: EstadoAvance[];
  /** Inicio temprano mínimo (índice). */
  minInicio: number[];
  /** Fin temprano mínimo (índice; −∞ si no hay). */
  minFin: number[];
  /** Fin tardío máximo (∞ si no hay). */
  maxFin: number[];
  /** Inicio tardío máximo (∞ si no hay). */
  maxInicio: number[];
  /** Ya empezó: no espera a sus predecesoras. */
  sinLogica: boolean[];
  transcurrido: number[];
  escala: number[];
  /** Índice de la fecha de corte (0 sin fecha de corte). */
  corte: number;
}

export function parametrosRed(c: Cronograma, cal: IndiceLaborable): ParametrosRed {
  const corte = c.fechaCorte === undefined ? 0 : cal.indiceDesde(c.fechaCorte);
  const p: ParametrosRed = {
    estado: [], minInicio: [], minFin: [], maxFin: [], maxInicio: [], sinLogica: [], transcurrido: [], escala: [], corte,
  };
  for (const a of c.actividades) {
    let minFin = -Infinity;
    let maxFin = Infinity;
    let maxInicio = Infinity;
    if (a.terminarNoAntesDe !== undefined) minFin = cal.indiceDesde(a.terminarNoAntesDe) + 1;
    if (a.terminarNoDespuesDe !== undefined) maxFin = cal.indiceHasta(a.terminarNoDespuesDe) + 1;
    if (a.inicioNoDespuesDe !== undefined) maxInicio = cal.indiceHasta(a.inicioNoDespuesDe);

    if (a.finReal !== undefined) {
      const fin = cal.indiceHasta(a.finReal) + 1;
      // Un hito terminado ocupa cero días: empieza donde termina.
      const ini = a.duracion === 0 ? fin : Math.min(a.inicioReal === undefined ? fin - a.duracion : cal.indiceDesde(a.inicioReal), fin);
      p.estado.push('terminada');
      p.minInicio.push(Math.max(0, ini));
      p.sinLogica.push(true);
      p.transcurrido.push(fin - Math.max(0, ini));
      p.escala.push(0);
      p.minFin.push(-Infinity);
    } else if (a.inicioReal !== undefined) {
      const ini = cal.indiceDesde(a.inicioReal);
      const restante = a.restante ?? a.duracion * (1 - (a.completado ?? 0));
      p.estado.push('en curso');
      p.minInicio.push(ini);
      p.sinLogica.push(true);
      p.transcurrido.push(Math.max(corte, ini) - ini);
      p.escala.push(a.duracion > 0 ? restante / a.duracion : 0);
      p.minFin.push(-Infinity);
      if (a.duracion === 0 && restante > 0) p.transcurrido[p.transcurrido.length - 1] = (p.transcurrido.at(-1) as number) + restante;
    } else {
      let ini = corte;
      if (a.inicioNoAntesDe !== undefined) ini = Math.max(ini, cal.indiceDesde(a.inicioNoAntesDe));
      p.estado.push('pendiente');
      p.minInicio.push(ini);
      p.sinLogica.push(false);
      p.transcurrido.push(0);
      p.escala.push(1);
      p.minFin.push(minFin);
    }
    p.maxFin.push(maxFin);
    p.maxInicio.push(maxInicio);
  }
  return p;
}

/** La duración que usa el CPM determinista. */
export const duracionEfectiva = (p: ParametrosRed, i: number, duracion: number) =>
  (p.transcurrido[i] as number) + duracion * (p.escala[i] as number);

/**
 * V7, con calendarios por actividad: los mismos parámetros en el eje de días
 * naturales (`eje`, un `IndiceLaborable` continuo), salvo lo ya trabajado
 * (`transcurrido`), que se cuenta en días laborables del calendario de cada
 * actividad, como su duración.
 */
export function parametrosRedEje(c: Cronograma, eje: IndiceLaborable, relojes: readonly Reloj[]): ParametrosRed {
  const p = parametrosRed(c, eje);
  c.actividades.forEach((a, i) => {
    const r = relojes[i] as Reloj;
    const ini = p.minInicio[i] as number;
    if (p.estado[i] === 'terminada') {
      p.transcurrido[i] = r.W(ini + (p.transcurrido[i] as number)) - r.W(ini);
    } else if (p.estado[i] === 'en curso') {
      const restante = a.restante ?? a.duracion * (1 - (a.completado ?? 0));
      p.transcurrido[i] = r.W(Math.max(p.corte, ini)) - r.W(ini) + (a.duracion === 0 && restante > 0 ? restante : 0);
    }
  });
  return p;
}
