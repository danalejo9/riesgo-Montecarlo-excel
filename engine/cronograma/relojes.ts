/**
 * Calendarios por actividad (V7): el «reloj» de cada calendario sobre un eje
 * común de **días naturales** (0 = día de inicio del proyecto, 1 = el día
 * siguiente…; los decimales, fracciones de día).
 *
 * Con un solo calendario el CPM cuenta en días laborables del proyecto y no
 * necesita nada de esto. Con varios, cada actividad trabaja solo en sus días
 * laborables, así que su fin se calcula con su reloj:
 *
 * - `W(t)`: días laborables del calendario transcurridos desde el inicio
 *   hasta el instante `t` (un día no laborable no suma).
 * - `avanzar(t, x)`: el instante en que se cumplen `x` días laborables
 *   contando desde `t` (hacia atrás si `x < 0`).
 * - `alinearInicio(t)`: el primer instante laborable en o después de `t`
 *   (una actividad no empieza en domingo si su calendario no lo trabaja).
 * - `alinearFin(t)`: el último instante laborable en o antes de `t`.
 *
 * Mismas convenciones que `calendario.ts`: un día laborable `k` va de `k` a
 * `k+1`; terminar «al final del viernes» es `viernes + 1`, y se enseña como
 * el viernes.
 */

import { esLaborable } from './calendario.ts';
import type { Calendario, Cronograma } from './tipos.ts';

export class Reloj {
  /** `acum[k]`: días laborables en [0, k). */
  private acum = new Float64Array(1024);
  /** `lab[k]`: 1 si el día `k` es laborable. */
  private lab = new Uint8Array(1024);
  /** `pos[j]`: día del eje del laborable número `j` (desde 0). */
  private pos = new Float64Array(1024);
  private dias = 0;
  private laborables = 0;

  readonly calendario: Calendario;
  readonly origen: number;

  constructor(calendario: Calendario, origen: number) {
    this.calendario = calendario;
    this.origen = origen;
    if (!calendario.laborables.some(Boolean)) throw new Error('Un calendario no tiene ningún día laborable');
    this.extenderDias(1);
  }

  /** Asegura los días [0, n) del eje. */
  private extenderDias(n: number): void {
    while (this.dias < n) {
      const k = this.dias;
      if (k + 1 >= this.acum.length) {
        const a = new Float64Array(this.acum.length * 2);
        a.set(this.acum);
        this.acum = a;
        const l = new Uint8Array(this.lab.length * 2);
        l.set(this.lab);
        this.lab = l;
      }
      const es = esLaborable(this.calendario, this.origen + k);
      this.lab[k] = es ? 1 : 0;
      this.acum[k + 1] = (this.acum[k] as number) + (es ? 1 : 0);
      if (es) {
        if (this.laborables >= this.pos.length) {
          const p = new Float64Array(this.pos.length * 2);
          p.set(this.pos);
          this.pos = p;
        }
        this.pos[this.laborables++] = k;
      }
      this.dias++;
    }
  }

  /** Asegura los laborables [0, n). */
  private extenderLaborables(n: number): void {
    while (this.laborables < n) this.extenderDias(this.dias + Math.max(64, (n - this.laborables) * 2));
  }

  /** Días laborables en [0, t). */
  W(t: number): number {
    if (!(t > 0)) return 0;
    if (t === Infinity) return Infinity;
    const k = Math.floor(t);
    this.extenderDias(k + 2);
    return (this.acum[k] as number) + ((this.lab[k] as number) ? t - k : 0);
  }

  /** El instante en que se completa el trabajo `w` (> 0): al final de su último día. */
  private fin(w: number): number {
    if (!(w > 0)) return 0;
    if (w === Infinity) return Infinity;
    const j = Math.ceil(w - 1e-12) - 1;
    this.extenderLaborables(j + 1);
    return (this.pos[j] as number) + (w - j);
  }

  /** El instante en que empieza el trabajo `w` (≥ 0): al principio de su día. */
  private comienzo(w: number): number {
    if (w === Infinity) return Infinity;
    const x = Math.max(0, w);
    const j = Math.floor(x + 1e-12);
    this.extenderLaborables(j + 1);
    return (this.pos[j] as number) + Math.max(0, x - j);
  }

  alinearInicio(t: number): number {
    return this.comienzo(this.W(t));
  }

  alinearFin(t: number): number {
    const w = this.W(t);
    return w > 0 ? this.fin(w) : 0;
  }

  avanzar(t: number, x: number): number {
    if (x > 0) return this.fin(this.W(t) + x);
    if (x < 0) return this.comienzo(this.W(t) + x);
    return t;
  }

  /** Pasada atrás: el último fin que deja `x` días laborables hasta `t` (`t` mismo si `x` = 0). */
  retroFin(t: number, x: number): number {
    if (x === 0) return t;
    const w = this.W(t) - x;
    return w > 0 ? this.fin(w) : 0;
  }

  /** Pasada atrás: el último inicio que deja `x` días laborables hasta `t` (`t` mismo si `x` = 0). */
  retroInicio(t: number, x: number): number {
    return x === 0 ? t : this.comienzo(this.W(t) - x);
  }

  /** El inicio de una actividad de duración `d` que termina en `f` (pasada atrás). */
  inicioParaFin(f: number, d: number): number {
    return d > 0 ? this.comienzo(this.W(f) - d) : f;
  }
}

/** Un calendario que trabaja todos los días: el eje de días naturales como `IndiceLaborable`. */
export const CALENDARIO_CONTINUO: Calendario = { laborables: [true, true, true, true, true, true, true], festivos: new Set() };

const mismoCalendario = (a: Calendario, b: Calendario) =>
  a.laborables.every((x, i) => x === b.laborables[i]) && a.festivos.size === b.festivos.size && [...a.festivos].every((f) => b.festivos.has(f));

/**
 * El reloj de cada actividad, o `null` si todas siguen el calendario del
 * proyecto (entonces se usa el CPM en días laborables de siempre). Un
 * calendario con otro nombre pero los mismos días cuenta como el del
 * proyecto.
 */
export function relojesDe(c: Cronograma, forzar = false): { relojes: Reloj[]; proyecto: Reloj } | null {
  const proyecto = new Reloj(c.calendario, c.inicio);
  const porNombre = new Map<string, Reloj>();
  let distinto = false;
  const relojes = c.actividades.map((a) => {
    const cal = a.calendario ? c.calendarios?.[a.calendario] : undefined;
    if (!cal || !a.calendario || mismoCalendario(cal, c.calendario)) return proyecto;
    distinto = true;
    let r = porNombre.get(a.calendario);
    if (!r) porNombre.set(a.calendario, (r = new Reloj(cal, c.inicio)));
    return r;
  });
  return distinto || forzar ? { relojes, proyecto } : null;
}
