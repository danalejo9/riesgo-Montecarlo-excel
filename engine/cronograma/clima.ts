/**
 * Clima probabilístico (V8). La hoja «Clima» dice cuántos días laborables
 * se pierden cada mes del año por el clima (mínimo, más probable, máximo) y
 * a qué actividades o categorías afecta (la obra a la intemperie).
 *
 * En cada iteración se sortean los días perdidos de **cada mes del
 * horizonte** (enero de 2027 y enero de 2028 son sorteos distintos; todas
 * las actividades de esa iteración ven el mismo mes). Las actividades
 * expuestas avanzan en ese mes al ritmo `1 − perdidos / laborables` (los
 * días perdidos, repartidos por el mes): una que dura 10 días en un mes que
 * pierde el 20 % tarda 12,5. Así una actividad corta en temporada de lluvias
 * sufre más que la misma en temporada seca, que es lo que un colchón fijo
 * no ve.
 *
 * El cronograma determinista no cambia: el clima es incertidumbre, como la
 * de las duraciones.
 */

import { leerHojaGenerica, normalizar, numeroDe } from './lectorTabla.ts';
import { muestreadorDuracion, type Muestreador } from './muestreo.ts';
import type { HojaAEscribir } from './hojas.ts';
import type { Actividad, ProblemaCronograma } from './tipos.ts';

export const HOJA_CLIMA = 'Clima';
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** Tope del ritmo perdido: aunque se pierdan todos los días, algo se avanza (evita esperas infinitas). */
export const PERDIDA_MAXIMA = 0.9;

export interface Clima {
  /** Días laborables perdidos en cada mes del año (0 = enero). */
  meses: Array<{ min: number; masProbable: number; max: number }>;
  /** IDs de las actividades expuestas, ya resueltos (sin categorías). */
  afecta: string[];
}

export function plantillaClima(): HojaAEscribir {
  return {
    nombre: HOJA_CLIMA,
    valores: [
      ['Clima — días laborables que se pierden cada mes (en la simulación se sortean mes a mes). Déjalo en 0 o sin actividades afectadas para no usarlo.'],
      [''],
      ['Actividades afectadas (IDs o categorías, separadas por «;»)', ''],
      [''],
      ['Mes', 'Días perdidos mínimo', 'Días perdidos más probable', 'Días perdidos máximo'],
      ...MESES.map((m) => [m, 0, 0, 0]),
    ],
    formatos: {},
    filaEncabezado: 4,
    primeraFilaDatos: 5,
    anchos: [52, 20, 26, 22],
  };
}

/** La hoja «Clima». Sin hoja, sin actividades afectadas o todo en cero: sin clima (no es un error). */
export function leerClima(
  valores: readonly (readonly unknown[])[] | undefined,
  actividades: readonly Actividad[],
  primeraFila = 1,
): { clima?: Clima; problemas: ProblemaCronograma[] } {
  const hoja = HOJA_CLIMA;
  if (!valores || valores.length === 0) return { problemas: [] };
  const problemas: ProblemaCronograma[] = [];
  const filaAfecta = valores.findIndex((f) => normalizar(f[0]).startsWith('actividades afectadas') || normalizar(f[0]).startsWith('afecta'));
  const texto = filaAfecta < 0 ? '' : String(valores[filaAfecta]?.[1] ?? '').trim();
  const t = leerHojaGenerica(valores, {
    mes: ['mes'],
    min: ['dias perdidos min', 'minimo', 'min'],
    mp: ['dias perdidos mas probable', 'mas probable'],
    max: ['dias perdidos max', 'maximo', 'max'],
  }, ['mes', 'min', 'max'], primeraFila);
  if (!t.ok) return { problemas: [{ gravedad: 'error', hoja, mensaje: `«${hoja}»: ${t.error}` }] };
  const meses = MESES.map(() => ({ min: 0, masProbable: 0, max: 0 }));
  for (const f of t.filas) {
    const nombre = normalizar(f.celda('mes'));
    const i = MESES.findIndex((m) => normalizar(m) === nombre || normalizar(m).slice(0, 3) === nombre.slice(0, 3));
    if (i < 0) {
      problemas.push({ gravedad: 'error', hoja, fila: f.fila, mensaje: `«${hoja}», fila ${f.fila}: «${String(f.celda('mes'))}» no es un mes` });
      continue;
    }
    const a = numeroDe(f.celda('min'));
    const b = numeroDe(f.celda('max'));
    const m = f.celda('mp') === '' || f.celda('mp') === undefined ? undefined : numeroDe(f.celda('mp'));
    const mp = m ?? (a !== undefined && b !== undefined ? (a + b) / 2 : undefined);
    if (a === undefined || b === undefined || mp === undefined || !(0 <= a && a <= mp && mp <= b) || b > 31) {
      problemas.push({ gravedad: 'error', hoja, fila: f.fila, mensaje: `«${hoja}», ${MESES[i]}: los días perdidos deben cumplir 0 ≤ mínimo ≤ más probable ≤ máximo ≤ 31` });
      continue;
    }
    meses[i] = { min: a, masProbable: mp, max: b };
  }
  const ids = new Set(actividades.map((a) => a.id));
  const porCategoria = new Map<string, string[]>();
  for (const a of actividades) if (a.categoria) porCategoria.set(normalizar(a.categoria), [...(porCategoria.get(normalizar(a.categoria)) ?? []), a.id]);
  const afecta: string[] = [];
  for (const token of texto.split(texto.includes(';') ? ';' : ',').map((x) => x.trim()).filter(Boolean)) {
    if (ids.has(token)) afecta.push(token);
    else if (porCategoria.has(normalizar(token))) afecta.push(...(porCategoria.get(normalizar(token)) as string[]));
    else problemas.push({ gravedad: 'error', hoja, mensaje: `«${hoja}»: «${token}» no es el ID de una actividad ni una categoría` });
  }
  if (problemas.length > 0 || afecta.length === 0 || meses.every((m) => m.max === 0)) return { problemas };
  return { clima: { meses, afecta: [...new Set(afecta)] }, problemas };
}

/** Número de serie del día 1 del mes `k` contado desde el mes de `serie` (k = 0). */
function primeroDeMes(serie: number, k: number): number {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serie) * 86_400_000);
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/**
 * El clima preparado para la simulación, sobre el eje de la simulación
 * (índices laborables del proyecto o, con relojes, días naturales).
 * `aEje(serie)` pasa la fecha del día 1 de cada mes al eje; `laborables(a, b)`
 * cuenta los días laborables del proyecto entre dos puntos del eje.
 */
export class ClimaSimulado {
  readonly expuesta: Uint8Array;
  private readonly limites: number[] = [];
  private readonly mesDelAnio: number[] = [];
  private readonly diasMes: number[] = [];
  private readonly muestras: Array<Muestreador | null>;
  private readonly fijos: number[];
  private readonly flujos: number[] = [];
  private readonly inicio: number;
  private readonly aEje: (serie: number) => number;
  private readonly laborables: (a: number, b: number) => number;
  private readonly flujoDe: (k: number) => number;

  constructor(
    clima: Clima, indices: ReadonlyMap<string, number>, n: number, inicio: number,
    aEje: (serie: number) => number, laborables: (a: number, b: number) => number, flujoDe: (k: number) => number,
  ) {
    this.expuesta = new Uint8Array(n);
    for (const id of clima.afecta) {
      const i = indices.get(id);
      if (i !== undefined) this.expuesta[i] = 1;
    }
    this.muestras = clima.meses.map((m) => muestreadorDuracion(m.min, m.masProbable, m.max, 'pert'));
    this.fijos = clima.meses.map((m) => m.masProbable);
    this.inicio = inicio;
    this.aEje = aEje;
    this.laborables = laborables;
    this.flujoDe = flujoDe;
    this.extender(2);
  }

  private extender(n: number): void {
    while (this.limites.length < n + 1) {
      const k = this.limites.length;
      const s = primeroDeMes(this.inicio, k);
      this.limites.push(k === 0 ? Math.min(0, this.aEje(s)) : this.aEje(s));
      this.mesDelAnio.push(new Date(Date.UTC(1899, 11, 30) + s * 86_400_000).getUTCMonth());
      this.flujos.push(this.flujoDe(k));
      if (k > 0) this.diasMes[k - 1] = Math.max(1, this.laborables(this.limites[k - 1] as number, this.limites[k] as number));
    }
  }

  /** El mes (índice desde el de inicio) que contiene el punto `t` del eje. */
  private mesDe(t: number): number {
    while ((this.limites[this.limites.length - 1] as number) <= t) this.extender(this.limites.length + 12);
    let lo = 0;
    let hi = this.limites.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.limites[mid] as number) <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Fracción de días perdidos del mes `k` en la iteración `i`. */
  perdida(k: number, semilla: number, i: number): number {
    const mes = this.mesDelAnio[k] as number;
    const m = this.muestras[mes];
    const dias = m ? m.muestra(semilla, this.flujos[k] as number, i) : (this.fijos[mes] as number);
    return Math.min(PERDIDA_MAXIMA, dias / (this.diasMes[k] as number));
  }

  /**
   * El fin de `x` días de trabajo que empiezan en `t`, con el reloj dado
   * (`W` y `avanzar`), perdiendo en cada mes lo que diga el sorteo.
   */
  avanzar(t: number, x: number, W: (t: number) => number, avanzar: (t: number, x: number) => number, semilla: number, i: number): number {
    let resta = x;
    let cur = t;
    for (let vuelta = 0; resta > 1e-12 && vuelta < 10_000; vuelta++) {
      const k = this.mesDe(cur);
      const fin = this.limites[k + 1] as number;
      const q = 1 - this.perdida(k, semilla, i);
      const efectivo = (W(fin) - W(cur)) * q;
      if (efectivo >= resta) return avanzar(cur, resta / q);
      resta -= efectivo;
      cur = fin;
    }
    return cur;
  }
}
