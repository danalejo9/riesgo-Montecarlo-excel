/**
 * Motor de ruta crítica (QRSA, Q1.3): ida y vuelta con las cuatro relaciones,
 * desfases (también negativos, en días laborables o calendario), varios
 * calendarios y restricciones de fecha. Sin Office.js.
 *
 * Trabaja en los **índices laborables** de `calendario.ts`: el inicio
 * temprano `es`, el fin temprano `ef = es + d`, y los tardíos `ls` y `lf`,
 * cada uno en el calendario de su actividad. Entre actividades del mismo
 * calendario, con desfase en días laborables, las cuentas son sumas de
 * índices; si cambian de calendario o el desfase es en días calendario, se
 * pasa por el instante (el número de serie).
 *
 * Reglas (las de MS Project, `docs/QRSA_PLAN.md`):
 * - FC: `ES_suc ≥ EF_pred + desfase`; CC: `ES_suc ≥ ES_pred + desfase`;
 *   FF: `EF_suc ≥ EF_pred + desfase`; CF: `EF_suc ≥ ES_pred + desfase`.
 * - El desfase en días laborables cuenta con el calendario de la sucesora;
 *   el de días calendario, desde el instante de la predecesora.
 * - Nadie empieza antes del inicio del proyecto.
 * - SNET y FNET mueven las fechas tempranas; SNLT y FNLT solo las tardías
 *   (la holgura puede quedar negativa); MSO y MFO fijan las dos, salvo que
 *   se pida ignorarlas (la simulación lo permite).
 * - Holgura total `ls − es`; crítica si es ≤ 0. Holgura libre: lo que la
 *   actividad se puede retrasar sin mover a ninguna sucesora (ni el fin del
 *   proyecto), nunca más que la total.
 *
 * Una sola función, `calcularCpm`, sirve al cálculo determinístico y a cada
 * iteración de la simulación: escribe en arreglos ya reservados.
 */

import type { CalendarioLaboral } from './calendario.ts';
import type { RedCompilada } from './red.ts';

export interface EspacioCpm {
  es: Float64Array;
  ef: Float64Array;
  ls: Float64Array;
  lf: Float64Array;
  holgura: Float64Array;
  holguraLibre: Float64Array;
  /**
   * Duración efectiva de cada actividad en este cálculo (`ef − es`): la dada,
   * salvo con avance (G3): la real si está terminada; lo hecho más lo
   * restante si está en curso.
   */
  dur: Float64Array;
  /** Instante (relativo a la base) en que termina el proyecto. */
  fin: number;
}

export interface OpcionesCpm {
  /** Tratar MSO y MFO como si no existieran (opción de la simulación). */
  ignorarDuras?: boolean;
  /** Calcular la holgura libre (el determinístico sí; la simulación no la necesita). */
  holguraLibre?: boolean;
  /** Solo la ida: fechas tempranas y fin (las corridas del tornado no necesitan holguras). */
  soloIda?: boolean;
}

export const TOLERANCIA_CRITICA = 1e-9;

export function crearEspacio(n: number): EspacioCpm {
  return {
    es: new Float64Array(n), ef: new Float64Array(n), ls: new Float64Array(n), lf: new Float64Array(n),
    holgura: new Float64Array(n), holguraLibre: new Float64Array(n), dur: new Float64Array(n), fin: 0,
  };
}

/**
 * El inicio mínimo que impone la relación `r` a su sucesora `s` (en índices
 * de la sucesora), con las fechas tempranas de la predecesora ya calculadas.
 */
export function limiteRelacion(red: RedCompilada, r: number, s: number, ds: number, es: Float64Array, ef: Float64Array): number {
  const p = red.relPred[r] as number;
  const tipo = red.relTipo[r] as number;
  const L = red.relDesfase[r] as number;
  const cp = red.cal[p] as number;
  const cs = red.cal[s] as number;
  if (red.relTranscurrido[r] === 0) {
    if (cp === cs) {
      switch (tipo) {
        case 0: return (ef[p] as number) + L;
        case 1: return (es[p] as number) + L;
        case 2: return (ef[p] as number) + L - ds;
        default: return (es[p] as number) + L - ds;
      }
    }
    const calP = red.calendarios[cp] as CalendarioLaboral;
    const calS = red.calendarios[cs] as CalendarioLaboral;
    switch (tipo) {
      case 0: return calS.cuenta(calP.fin(ef[p] as number)) + L;
      case 1: return calS.cuenta(calP.inicio(es[p] as number)) + L;
      case 2: return calS.cuenta(calP.fin(ef[p] as number)) + L - ds;
      default: return calS.cuenta(calP.inicio(es[p] as number)) + L - ds;
    }
  }
  const calP = red.calendarios[cp] as CalendarioLaboral;
  const calS = red.calendarios[cs] as CalendarioLaboral;
  switch (tipo) {
    case 0: return calS.cuenta(calP.fin(ef[p] as number) + L);
    case 1: return calS.cuenta(calP.inicio(es[p] as number) + L);
    case 2: return calS.cuenta(calP.fin(ef[p] as number) + L - 1) + 1 - ds;
    default: return calS.cuenta(calP.inicio(es[p] as number) + L - 1) + 1 - ds;
  }
}

/**
 * Ida y vuelta sobre la red con las duraciones dadas (en días laborables).
 * Escribe en `esp`; no crea objetos.
 */
export function calcularCpm(red: RedCompilada, duracion: Float64Array, esp: EspacioCpm, opciones: OpcionesCpm = {}): void {
  const { es, ef, ls, lf, holgura } = esp;
  const { orden, cal, calendarios, entradaInicio, relEntrada, salidaInicio, relSalida, resTipo, resFecha } = red;
  const n = red.n;
  const ignorarDuras = opciones.ignorarDuras === true;

  // Ida.
  const dur = esp.dur;
  // Sin avance en ninguna actividad, ninguna está terminada ni en curso (la fecha de corte sí cuenta).
  const estado = red.conAvance ? red.estado : undefined;
  const { realInicio, realFin, restante } = red;
  const corte = red.corte;
  const hayCorte = corte === corte;
  let fin = -Infinity;
  for (let o = 0; o < n; o++) {
    const a = orden[o] as number;
    const d = duracion[a] as number;
    const c = calendarios[cal[a] as number] as CalendarioLaboral;
    const st = estado ? estado[a] as number : 0;
    if (st === 2) {
      // Terminada (G3): sus fechas reales, diga lo que diga la lógica.
      const e1 = c.cuenta(realFin[a] as number);
      const ri = realInicio[a] as number;
      const e0 = ri === ri ? c.cuenta(ri) : e1 - (red.duracion[a] as number);
      es[a] = e0;
      ef[a] = Math.max(e0, e1);
      dur[a] = (ef[a] as number) - e0;
      const t = c.fin(ef[a] as number);
      if (t > fin) fin = t;
      continue;
    }
    if (st === 1) {
      // En curso: empezó en su fecha real; lo que falta (escalado como la
      // duración en la simulación) va desde la fecha de corte y, con lógica
      // retenida, no antes de lo que permitan sus predecesoras.
      const e0 = c.cuenta(realInicio[a] as number);
      const base = red.duracion[a] as number;
      let rest = restante[a] as number;
      if (!(rest === rest)) rest = Math.max(0, base - (hayCorte ? c.cuenta(corte) - e0 : 0));
      rest = base > 0 ? rest * (d / base) : rest;
      let desde = hayCorte ? Math.max(c.cuenta(corte), e0) : e0 + Math.max(0, base - rest);
      if (red.retenida) {
        for (let k = entradaInicio[a] as number; k < (entradaInicio[a + 1] as number); k++) {
          const v = limiteRelacion(red, relEntrada[k] as number, a, rest, es, ef);
          if (v > desde) desde = v;
        }
      }
      es[a] = e0;
      ef[a] = desde + rest;
      dur[a] = desde + rest - e0;
      const t = c.fin(ef[a] as number);
      if (t > fin) fin = t;
      continue;
    }
    let lb = c.cuenta(red.inicio);
    if (hayCorte) lb = Math.max(lb, c.cuenta(corte));
    for (let k = entradaInicio[a] as number; k < (entradaInicio[a + 1] as number); k++) {
      const v = limiteRelacion(red, relEntrada[k] as number, a, d, es, ef);
      if (v > lb) lb = v;
    }
    const rt = resTipo[a] as number;
    if (rt !== 0) {
      const f = resFecha[a] as number;
      if (rt === 1) lb = Math.max(lb, c.cuenta(f));
      else if (rt === 2) lb = Math.max(lb, c.cuenta(f) + 1 - d);
      else if (rt === 5 && !ignorarDuras) lb = c.cuenta(f);
      else if (rt === 6 && !ignorarDuras) lb = c.cuenta(f) + 1 - d;
    }
    es[a] = lb;
    ef[a] = lb + d;
    dur[a] = d;
    const t = c.fin(lb + d);
    if (t > fin) fin = t;
  }
  esp.fin = fin;
  if (opciones.soloIda) return;

  // Vuelta.
  for (let o = n - 1; o >= 0; o--) {
    const a = orden[o] as number;
    const d = dur[a] as number;
    const ca = cal[a] as number;
    const c = calendarios[ca] as CalendarioLaboral;
    let lfB = c.maxFin(fin);
    let lsB = Infinity;
    for (let k = salidaInicio[a] as number; k < (salidaInicio[a + 1] as number); k++) {
      const r = relSalida[k] as number;
      const s = red.relSuc[r] as number;
      const tipo = red.relTipo[r] as number;
      const L = red.relDesfase[r] as number;
      const cs = cal[s] as number;
      if (red.relTranscurrido[r] === 0 && cs === ca) {
        switch (tipo) {
          case 0: lfB = Math.min(lfB, (ls[s] as number) - L); break;
          case 1: lsB = Math.min(lsB, (ls[s] as number) - L); break;
          case 2: lfB = Math.min(lfB, (lf[s] as number) - L); break;
          default: lsB = Math.min(lsB, (lf[s] as number) - L);
        }
        continue;
      }
      const calS = calendarios[cs] as CalendarioLaboral;
      if (red.relTranscurrido[r] === 0) {
        switch (tipo) {
          case 0: lfB = Math.min(lfB, c.maxFin(calS.inicio((ls[s] as number) - L))); break;
          case 1: lsB = Math.min(lsB, c.maxInicio(calS.inicio((ls[s] as number) - L))); break;
          case 2: lfB = Math.min(lfB, c.maxFin(calS.inicio((lf[s] as number) - L))); break;
          default: lsB = Math.min(lsB, c.maxInicio(calS.inicio((lf[s] as number) - L)));
        }
      } else {
        switch (tipo) {
          case 0: lfB = Math.min(lfB, c.maxFin(calS.inicio(ls[s] as number) - L)); break;
          case 1: lsB = Math.min(lsB, c.maxInicio(calS.inicio(ls[s] as number) - L)); break;
          case 2: lfB = Math.min(lfB, c.maxFin(calS.fin(lf[s] as number) - L)); break;
          default: lsB = Math.min(lsB, c.maxInicio(calS.fin(lf[s] as number) - L));
        }
      }
    }
    const rt = resTipo[a] as number;
    if (rt !== 0) {
      const f = resFecha[a] as number;
      if (rt === 3) lsB = Math.min(lsB, c.maxInicio(f));
      else if (rt === 4) lfB = Math.min(lfB, c.maxFin(f + 1));
      else if (rt === 5 && !ignorarDuras) lsB = Math.min(lsB, c.cuenta(f));
      else if (rt === 6 && !ignorarDuras) lfB = Math.min(lfB, c.cuenta(f) + 1);
    }
    const lim = red.limite[a] as number;
    if (lim === lim) lfB = Math.min(lfB, c.maxFin(lim + 1));
    const st = estado ? estado[a] as number : 0;
    if (st === 2) {
      // Terminada: no tiene holgura que perder (no puede ser crítica).
      ls[a] = es[a] as number;
      lf[a] = ef[a] as number;
      holgura[a] = Infinity;
      continue;
    }
    // En curso: la holgura se mide por el fin (el comienzo ya pasó).
    const l = st === 1 ? lfB - d : Math.min(lfB - d, lsB);
    ls[a] = l;
    lf[a] = l + d;
    holgura[a] = l - (es[a] as number);
  }

  if (opciones.holguraLibre) calcularHolguraLibre(red, dur, esp);
}

function calcularHolguraLibre(red: RedCompilada, duracion: Float64Array, esp: EspacioCpm): void {
  const { es, ef, holgura, holguraLibre } = esp;
  for (let a = 0; a < red.n; a++) {
    const c = red.calendarios[red.cal[a] as number] as CalendarioLaboral;
    let libre = c.maxFin(esp.fin) - (ef[a] as number);
    for (let k = red.salidaInicio[a] as number; k < (red.salidaInicio[a + 1] as number); k++) {
      const r = red.relSalida[k] as number;
      const s = red.relSuc[r] as number;
      const margen = (es[s] as number) - limiteRelacion(red, r, s, duracion[s] as number, es, ef);
      if (margen < libre) libre = margen;
    }
    holguraLibre[a] = red.estado?.[a] === 2 ? Infinity : Math.min(libre, holgura[a] as number);
  }
}

export interface FilaCpm {
  id: string;
  nombre: string;
  duracion: number;
  /** Números de serie: primer y último día laborable (un hito: el mismo día). */
  inicio: number;
  fin: number;
  inicioTardio: number;
  finTardio: number;
  holguraTotal: number;
  holguraLibre: number;
  critica: boolean;
}

export interface ResultadoCpm {
  filas: FilaCpm[];
  /** Último día laborable del proyecto (número de serie). */
  fin: number;
  /** Días laborables del proyecto en el calendario del proyecto. */
  duracion: number;
}

/** El cálculo determinístico con las duraciones base, en fechas. */
export function cpmDeterministico(red: RedCompilada, opciones: OpcionesCpm = {}, duracion: Float64Array = red.duracion): ResultadoCpm {
  const esp = crearEspacio(red.n);
  calcularCpm(red, duracion, esp, { ...opciones, holguraLibre: true });
  const filas: FilaCpm[] = [];
  for (let a = 0; a < red.n; a++) {
    const c = red.calendarios[red.cal[a] as number] as CalendarioLaboral;
    const d = esp.dur[a] as number;
    filas.push({
      id: red.ids[a] as string,
      nombre: red.nombres[a] as string,
      duracion: d,
      inicio: c.serieInicio(esp.es[a] as number),
      fin: c.serieFin(esp.ef[a] as number, d),
      inicioTardio: c.serieInicio(esp.ls[a] as number),
      finTardio: c.serieFin(esp.lf[a] as number, d),
      holguraTotal: esp.holgura[a] as number,
      holguraLibre: esp.holguraLibre[a] as number,
      critica: (esp.holgura[a] as number) <= TOLERANCIA_CRITICA,
    });
  }
  return { filas, fin: finDelProyecto(red, esp), duracion: duracionDelProyecto(red, esp) };
}

/** Último día laborable del proyecto (número de serie). */
export function finDelProyecto(red: RedCompilada, esp: EspacioCpm): number {
  return calendarioProyecto(red).base + Math.ceil(esp.fin) - 1;
}

/** Duración del proyecto en días laborables del calendario del proyecto, desde su inicio. */
export function duracionDelProyecto(red: RedCompilada, esp: EspacioCpm): number {
  const c = calendarioProyecto(red);
  return c.cuenta(esp.fin) - c.cuenta(red.inicio);
}

export function calendarioProyecto(red: RedCompilada): CalendarioLaboral {
  return red.calendarios[red.calProyecto] as CalendarioLaboral;
}
