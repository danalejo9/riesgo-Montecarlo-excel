/**
 * Calendario laboral del motor de cronograma (QRSA, Q0.3). Sin Office.js.
 *
 * El eje del tiempo son los **números de serie de Excel** (un día = 1). Un
 * *instante* es la medianoche al empezar el día `x`: el día `x` va del
 * instante `x` al `x + 1`. Sobre ese eje, cada calendario numera sus días
 * laborables (el *índice laborable*), y el motor CPM hace las cuentas en
 * índices, que es donde una duración de 5 días son 5 unidades:
 *
 * - una actividad que **empieza** en el índice `k` empieza al comienzo del
 *   día laborable `k` (instante `dia[k]`);
 * - la que **termina** en el índice `j` acaba al final del día laborable
 *   `j − 1` (instante `dia[j − 1] + 1`). Así, una de `d` días que empieza en
 *   `k` termina en `k + d`, y un hito (`d = 0`) empieza y termina en el mismo
 *   índice: el final del día anterior, que es como lo fecha MS Project;
 * - `cuenta(x)`: cuántos días laborables hay antes del instante `x`; para un
 *   instante entero, el índice del primer día laborable desde `x`.
 *
 * Con duraciones decimales (la opción «sin redondear») los índices y los
 * instantes son reales: medio día laborable es medio día del eje. Con
 * enteros, todo lo de aquí es exacto.
 *
 * Los arreglos crecen solos cuando una simulación se va más allá del
 * horizonte calculado al principio.
 */

import { diaSemana } from './festivos.ts';

export interface DefinicionCalendario {
  id: string;
  nombre?: string;
  /** Días laborables de la semana, de lunes (0) a domingo (6). */
  laborables: readonly boolean[];
  /** Días no laborables (festivos, paros), como números de serie. */
  festivos?: readonly number[];
  /** Días laborables de excepción (un sábado que se trabaja). */
  trabajados?: readonly number[];
}

export const LUNES_A_VIERNES: readonly boolean[] = [true, true, true, true, true, false, false];
export const LUNES_A_SABADO: readonly boolean[] = [true, true, true, true, true, true, false];

export class CalendarioLaboral {
  readonly id: string;
  readonly nombre: string;
  /** Primer día del eje: los instantes del calendario son relativos a él. */
  readonly base: number;
  private readonly laborables: readonly boolean[];
  private readonly festivos: ReadonlySet<number>;
  private readonly trabajados: ReadonlySet<number>;
  /** `cuentaDias[i]`: días laborables en [base, base + i). */
  private cuentaDias: Int32Array;
  /** `diaLaborable[k]`: el día (relativo a `base`) del k-ésimo laborable. */
  private diaLaborable: Int32Array;
  private nDias = 0;
  private nLaborables = 0;

  constructor(def: DefinicionCalendario, base: number, dias = 4000) {
    if (!def.laborables.some(Boolean)) throw new Error(`El calendario «${def.nombre ?? def.id}» no tiene ningún día laborable en la semana`);
    this.id = def.id;
    this.nombre = def.nombre ?? def.id;
    this.base = Math.floor(base);
    this.laborables = def.laborables;
    this.festivos = new Set(def.festivos ?? []);
    this.trabajados = new Set(def.trabajados ?? []);
    this.cuentaDias = new Int32Array(1);
    this.diaLaborable = new Int32Array(0);
    this.extender(dias);
  }

  /** ¿Se trabaja el día de serie `serie`? */
  esLaborable(serie: number): boolean {
    const s = Math.floor(serie);
    if (this.trabajados.has(s)) return true;
    if (this.festivos.has(s)) return false;
    return this.laborables[diaSemana(s)] === true;
  }

  private extender(dias: number): void {
    const n = Math.max(dias, this.nDias * 2);
    const cuenta = new Int32Array(n + 1);
    cuenta.set(this.cuentaDias.subarray(0, this.nDias + 1));
    const laborables: number[] = Array.from(this.diaLaborable.subarray(0, this.nLaborables));
    let c = this.nLaborables;
    for (let i = this.nDias; i < n; i++) {
      if (this.esLaborable(this.base + i)) {
        laborables.push(i);
        c++;
      }
      cuenta[i + 1] = c;
    }
    this.cuentaDias = cuenta;
    this.diaLaborable = Int32Array.from(laborables);
    this.nDias = n;
    this.nLaborables = c;
  }

  private asegurarDia(i: number): void {
    if (i < 0) throw new Error('El cronograma se sale del calendario por el principio (un desfase negativo de más de un año)');
    while (i >= this.nDias) this.extender(i + 366);
  }

  private asegurarIndice(k: number): void {
    if (k < 0) throw new Error('El cronograma se sale del calendario por el principio (un desfase negativo de más de un año)');
    while (k >= this.nLaborables) this.extender(this.nDias + 366 + (k - this.nLaborables) * 2);
  }

  /** Días laborables antes del instante `x` (relativo a la base). */
  cuenta(x: number): number {
    const i = Math.floor(x);
    this.asegurarDia(i + 1);
    const c = this.cuentaDias[i] as number;
    const f = x - i;
    if (f > 0 && (this.cuentaDias[i + 1] as number) > c) return c + f;
    return c;
  }

  /** Instante de comienzo del índice laborable `k`. */
  inicio(k: number): number {
    const i = Math.floor(k);
    this.asegurarIndice(i);
    return (this.diaLaborable[i] as number) + (k - i);
  }

  /** Instante de final del índice laborable `j` (el final del día `j − 1`). */
  fin(j: number): number {
    const i = Math.floor(j);
    if (i === j) {
      this.asegurarIndice(i - 1);
      return (this.diaLaborable[i - 1] as number) + 1;
    }
    this.asegurarIndice(i);
    return (this.diaLaborable[i] as number) + (j - i);
  }

  /** El mayor índice de comienzo cuyo instante no pasa de `y`. */
  maxInicio(y: number): number {
    const i = Math.floor(y);
    this.asegurarDia(i + 1);
    const c = this.cuentaDias[i] as number;
    if ((this.cuentaDias[i + 1] as number) > c) return c + (y - i);
    return c - 1;
  }

  /** El mayor índice de final cuyo instante no pasa de `x`. */
  maxFin(x: number): number {
    return this.cuenta(x);
  }

  /** Instante (relativo) de un número de serie. */
  instante(serie: number): number {
    return serie - this.base;
  }

  /** Número de serie del día laborable en que empieza el índice `k`. */
  serieInicio(k: number): number {
    return this.base + Math.floor(this.inicio(k));
  }

  /** Número de serie del último día laborable de una actividad que termina en `j` (si es un hito, el de su inicio). */
  serieFin(j: number, duracion: number): number {
    if (duracion <= 0) return this.serieInicio(j);
    return this.base + Math.ceil(this.fin(j)) - 1;
  }
}
