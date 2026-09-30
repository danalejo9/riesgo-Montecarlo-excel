/**
 * CPM con calendarios por actividad (V7). Las mismas reglas que `cpm.ts`,
 * pero en el eje de días naturales y con el reloj de cada actividad
 * (`relojes.ts`):
 *
 * - Una actividad avanza en los días laborables **de su calendario**: su fin
 *   es `avanzar(inicio, duración)`, y no empieza en un día que no trabaja.
 * - Un retardo se cuenta en el calendario **de la predecesora** (lo que hace
 *   Primavera P6 por defecto).
 * - La holgura se da en días laborables del calendario de la actividad.
 * - La duración del proyecto, en días naturales (no hay un calendario común).
 */

import { IndiceLaborable } from './calendario.ts';
import type { FilaCPM, ResultadoCPM } from './cpm.ts';
import { duracionEfectiva, parametrosRedEje, type EstadoAvance, type ParametrosRed } from './red.ts';
import { CALENDARIO_CONTINUO, type Reloj } from './relojes.ts';
import type { Actividad, Cronograma, ProblemaCronograma, TipoRelacion } from './tipos.ts';

const EPS = 1e-9;

/** El eje de días naturales como índice: la fecha del día `k` es `inicio + k`. */
export const ejeNatural = (c: Cronograma) => new IndiceLaborable(CALENDARIO_CONTINUO, c.inicio);

/** Adelante, para la relación de `p` a `s`: el inicio mínimo de `s`. */
export function inicioPorRelacion(tipo: TipoRelacion, retardo: number, itP: number, ftP: number, rp: Reloj, rs: Reloj, dS: number): number {
  switch (tipo) {
    case 'FS': return rp.avanzar(ftP, retardo);
    case 'SS': return rp.avanzar(itP, retardo);
    case 'FF': return rs.inicioParaFin(rp.avanzar(ftP, retardo), dS);
    case 'SF': return rs.inicioParaFin(rp.avanzar(itP, retardo), dS);
  }
}

/** Atrás, para la relación de `p` a `s`: el fin máximo de `p`. */
export function finPorRelacion(tipo: TipoRelacion, retardo: number, itS: number, ftS: number, rp: Reloj, dP: number): number {
  switch (tipo) {
    case 'FS': return rp.retroFin(itS, retardo);
    case 'SS': return rp.avanzar(rp.retroInicio(itS, retardo), dP);
    case 'FF': return rp.retroFin(ftS, retardo);
    case 'SF': return rp.avanzar(rp.retroInicio(ftS, retardo), dP);
  }
}

export function cpmConRelojes(c: Cronograma, orden: readonly number[], relojes: readonly Reloj[]): Extract<ResultadoCPM, { ok: true }> & { red: ParametrosRed } {
  const acts = c.actividades;
  const n = acts.length;
  const eje = ejeNatural(c);
  const indice = new Map(acts.map((a, i) => [a.id, i]));
  const red = parametrosRedEje(c, eje, relojes);
  const dur = acts.map((a, i) => duracionEfectiva(red, i, a.duracion));
  const it = new Float64Array(n);
  const ft = new Float64Array(n);

  for (const s of orden) {
    const a = acts[s] as Actividad;
    const d = dur[s] as number;
    const rs = relojes[s] as Reloj;
    let inicio = red.minInicio[s] as number;
    if (!red.sinLogica[s]) {
      for (const r of a.predecesoras) {
        const p = indice.get(r.predecesora) as number;
        const v = inicioPorRelacion(r.tipo, r.retardo, it[p] as number, ft[p] as number, relojes[p] as Reloj, rs, d);
        if (v > inicio) inicio = v;
      }
      const minFin = red.minFin[s] as number;
      if (minFin > -Infinity) inicio = Math.max(inicio, rs.inicioParaFin(minFin, d));
    }
    if (d > 0) inicio = rs.alinearInicio(inicio);
    it[s] = inicio;
    ft[s] = rs.avanzar(inicio, d);
  }

  let finProyecto = 0;
  for (let i = 0; i < n; i++) if ((ft[i] as number) > finProyecto) finProyecto = ft[i] as number;

  const sucs: Array<Array<{ s: number; tipo: TipoRelacion; retardo: number }>> = Array.from({ length: n }, () => []);
  acts.forEach((a, s) => {
    for (const r of a.predecesoras) (sucs[indice.get(r.predecesora) as number] as Array<{ s: number; tipo: TipoRelacion; retardo: number }>).push({ s, tipo: r.tipo, retardo: r.retardo });
  });
  const itT = new Float64Array(n);
  const ftT = new Float64Array(n);
  for (let k = orden.length - 1; k >= 0; k--) {
    const p = orden[k] as number;
    const d = dur[p] as number;
    const rp = relojes[p] as Reloj;
    let fin = finProyecto;
    for (const { s, tipo, retardo } of sucs[p] as Array<{ s: number; tipo: TipoRelacion; retardo: number }>) {
      const v = finPorRelacion(tipo, retardo, itT[s] as number, ftT[s] as number, rp, d);
      if (v < fin) fin = v;
    }
    fin = Math.min(fin, red.maxFin[p] as number, rp.avanzar(red.maxInicio[p] as number, d));
    if (d > 0) fin = rp.alinearFin(fin);
    ftT[p] = fin;
    itT[p] = rp.inicioParaFin(fin, d);
  }

  const avisos: ProblemaCronograma[] = [];
  const filas: FilaCPM[] = acts.map((a, i) => {
    const d = dur[i] as number;
    const r = relojes[i] as Reloj;
    const estado = red.estado[i] as EstadoAvance;
    const holgura = r.W(itT[i] as number) - r.W(it[i] as number);
    if (holgura < -EPS && estado !== 'terminada') {
      avisos.push({ gravedad: 'aviso', actividad: a.id, fila: a.fila, mensaje: `«${a.id}» tiene holgura negativa (${Math.round(holgura * 100) / 100} días)` });
    }
    const hecha = estado === 'terminada';
    const itI = hecha ? (it[i] as number) : (itT[i] as number);
    const ftI = hecha ? (ft[i] as number) : (ftT[i] as number);
    return {
      id: a.id,
      nombre: a.nombre,
      duracion: a.duracion,
      inicioTemprano: it[i] as number,
      finTemprano: ft[i] as number,
      inicioTardio: itI,
      finTardio: ftI,
      holguraTotal: hecha || Math.abs(holgura) < EPS ? 0 : holgura,
      critica: !hecha && holgura < EPS,
      fechaInicio: eje.fechaInicio(it[i] as number, d),
      fechaFin: eje.fechaFin(ft[i] as number, d),
      fechaInicioTardio: eje.fechaInicio(Math.max(0, itI), d),
      fechaFinTardio: eje.fechaFin(ftI, d),
      estado,
    };
  });

  return {
    ok: true,
    filas,
    duracionProyecto: finProyecto,
    fechaInicioProyecto: eje.fechaDeIndice(Math.min(...Array.from(it))),
    fechaFinProyecto: eje.fechaFin(finProyecto, finProyecto === 0 ? 0 : 1),
    orden: orden.map((i) => (acts[i] as Actividad).id),
    avisos,
    unidad: 'naturales',
    red,
  };
}
