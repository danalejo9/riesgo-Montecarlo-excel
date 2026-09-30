/**
 * Días laborables. El CPM trabaja en **índices de día laborable** contados
 * desde el primer día laborable del proyecto (índice 0); aquí se convierten
 * en fechas y al revés. Las fechas se generan una vez, en orden, y se buscan
 * por índice en O(1): el Monte Carlo (P3) hará millones de conversiones.
 *
 * Convención (la de MS Project): una actividad que empieza en el índice `i`
 * y dura `d` días ocupa los días `i … i+d−1`; su fin «temprano» vale `i+d`
 * (el comienzo del día siguiente), y la fecha de fin que se enseña es la del
 * último día trabajado, `i+d−1`.
 */

import { fechaDeSerie } from '../modelo/fechas.ts';
import type { Calendario } from './tipos.ts';

const DIA_MS = 86_400_000;
const EPOCA = Date.UTC(1899, 11, 30);

/** Día de la semana de un número de serie (0 = domingo). Válido desde el 01/03/1900. */
export function diaSemana(serie: number): number {
  const { anio, mes, dia } = fechaDeSerie(serie);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

export function esLaborable(cal: Calendario, serie: number): boolean {
  return (cal.laborables[diaSemana(serie)] ?? false) && !cal.festivos.has(Math.floor(serie));
}

/** Lunes a viernes, sin festivos. */
export const CALENDARIO_ESTANDAR: Calendario = {
  laborables: [false, true, true, true, true, true, false],
  festivos: new Set(),
};

export class IndiceLaborable {
  private readonly fechas: number[] = [];
  private readonly cal: Calendario;

  constructor(cal: Calendario, inicio: number) {
    if (!cal.laborables.some(Boolean)) throw new Error('El calendario no tiene ningún día laborable');
    this.cal = cal;
    let s = Math.floor(inicio);
    while (!esLaborable(cal, s)) s++;
    this.fechas.push(s);
  }

  /** Fecha (serie) del día laborable `i` (entero ≥ 0; los negativos, hacia atrás no se admiten). */
  fechaDeIndice(i: number): number {
    const k = Math.max(0, Math.floor(i));
    while (this.fechas.length <= k) {
      let s = (this.fechas[this.fechas.length - 1] as number) + 1;
      while (!esLaborable(this.cal, s)) s++;
      this.fechas.push(s);
    }
    return this.fechas[k] as number;
  }

  /** El índice del primer día laborable en o después de `serie`. */
  indiceDesde(serie: number): number {
    const objetivo = Math.floor(serie);
    if (objetivo <= (this.fechas[0] as number)) return 0;
    while ((this.fechas[this.fechas.length - 1] as number) < objetivo) this.fechaDeIndice(this.fechas.length);
    // Búsqueda binaria: las fechas están ordenadas.
    let lo = 0;
    let hi = this.fechas.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.fechas[mid] as number) < objetivo) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** El índice del último día laborable en o antes de `serie` (−1 si es antes del inicio). */
  indiceHasta(serie: number): number {
    return this.indiceDesde(Math.floor(serie) + 1) - 1;
  }

  /**
   * Fecha de inicio que se enseña para un inicio en el índice `i`. Un hito
   * se enseña en la misma fecha que su fin (ver `fechaFin`).
   */
  fechaInicio(i: number, duracion: number): number {
    if (duracion === 0) return this.fechaFin(i, 0);
    return this.fechaDeIndice(i);
  }

  /**
   * Fecha de fin que se enseña para un fin temprano `f` (comienzo del día
   * siguiente al último trabajado). Un hito (duración 0) termina el día en que
   * empieza, pero se enseña como el último día de su predecesora, igual que
   * MS Project: `f − 1`, salvo en el índice 0.
   */
  fechaFin(f: number, duracion: number): number {
    if (duracion === 0) return this.fechaDeIndice(f > 0 ? Math.ceil(f) - 1 : 0);
    return this.fechaDeIndice(Math.ceil(f) - 1);
  }
}

/** Convierte una fecha de JavaScript (UTC) en número de serie de Excel. */
export function serieDeDate(d: Date): number {
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - EPOCA) / DIA_MS);
}
