/**
 * Clima probabilístico (V8). La hoja «Clima» dice cuántos días laborables se
 * pierden cada mes del año por el clima (mínimo, más probable y máximo) y a
 * qué actividades afecta (la obra a la intemperie). Sin Office.js.
 *
 * En cada iteración se sortean los días perdidos de **cada mes del
 * horizonte** (enero de 2027 y enero de 2028 son sorteos distintos; todas las
 * actividades de esa iteración ven el mismo mes). Una actividad expuesta
 * avanza en ese mes al ritmo `1 − perdidos / laborables del mes` (los días
 * perdidos, repartidos por el mes): una que dura 10 días en un mes que pierde
 * el 20 % tarda 12,5. Así una actividad corta en temporada de lluvias sufre
 * más que la misma en temporada seca, que es lo que un colchón fijo no ve.
 *
 * El cronograma determinístico no cambia: el clima es incertidumbre, como la
 * de las duraciones. Cada mes tiene su propio flujo de números aleatorios
 * (`clima:AAAA-MM`), así que las corridas del tornado, la de «sin riesgos» y
 * los escenarios ven el mismo clima.
 */

import { pert } from '../distributions/index.ts';
import { generarEntrada, type MetodoMuestreo } from '../sampling/index.ts';
import type { CalendarioLaboral } from './calendario.ts';

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as const;

/** Tope del ritmo perdido: aunque se pierdan todos los días, algo se avanza (evita esperas sin fin). */
export const PERDIDA_MAXIMA = 0.9;

export interface MesClima {
  min: number;
  masProbable: number;
  max: number;
}

export interface Clima {
  /** Días laborables perdidos en cada mes del año (0 = enero). */
  meses: readonly MesClima[];
  /** Ids de las actividades expuestas, ya resueltos. */
  afecta: readonly string[];
}

/** ¿El clima cambia algo? (alguna actividad expuesta y algún mes con pérdida). */
export function climaActivo(c: Clima | undefined): c is Clima {
  return !!c && c.afecta.length > 0 && c.meses.some((m) => m.max > 0);
}

/** Año y mes (0–11) de un número de serie de Excel. */
function anioMes(serie: number): [number, number] {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serie) * 86_400_000);
  return [d.getUTCFullYear(), d.getUTCMonth()];
}

/** Número de serie del día 1 del mes (`mes` puede pasar de 11: sigue en el año siguiente). */
function serieDe(anio: number, mes: number): number {
  return Math.round((Date.UTC(anio, mes, 1) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/**
 * El clima listo para una simulación de `n` iteraciones: sabe en qué mes cae
 * cada día y cuánto se pierde en él en cada iteración.
 */
export class ClimaSimulado {
  /** Por actividad: 1 si está expuesta. */
  readonly expuesta: Uint8Array;
  private readonly meses: readonly MesClima[];
  private readonly n: number;
  private readonly semilla: number;
  private readonly metodo: MetodoMuestreo;
  /** Días perdidos sorteados por mes absoluto (año × 12 + mes). */
  private readonly perdidos = new Map<number, Float64Array | number>();
  /** Días laborables de cada mes absoluto en cada calendario. */
  private readonly laborables = new Map<string, number>();
  /** Mes absoluto de cada día, desde `base`. */
  private mesDeDia: Int32Array;
  private readonly base: number;

  constructor(clima: Clima, indice: ReadonlyMap<string, number>, nActividades: number, n: number, semilla: number, metodo: MetodoMuestreo, inicio: number) {
    this.expuesta = new Uint8Array(nActividades);
    for (const id of clima.afecta) {
      const a = indice.get(id);
      if (a !== undefined) this.expuesta[a] = 1;
    }
    this.meses = clima.meses;
    this.n = n;
    this.semilla = semilla;
    this.metodo = metodo;
    this.base = Math.floor(inicio) - 400;
    this.mesDeDia = new Int32Array(0);
    this.extender(12 * 366);
  }

  private extender(dias: number): void {
    const m = new Int32Array(dias);
    m.set(this.mesDeDia);
    let i = this.mesDeDia.length;
    while (i < dias) {
      const [anio, mes] = anioMes(this.base + i);
      const finMes = serieDe(anio, mes + 1) - this.base;
      const k = anio * 12 + mes;
      for (; i < Math.min(dias, finMes); i++) m[i] = k;
    }
    this.mesDeDia = m;
  }

  /** Mes absoluto (año × 12 + mes) del día `serie`. */
  mesDe(serie: number): number {
    const i = Math.floor(serie) - this.base;
    if (i < 0) {
      const [a, m] = anioMes(serie);
      return a * 12 + m;
    }
    while (i >= this.mesDeDia.length) this.extender(this.mesDeDia.length * 2);
    return this.mesDeDia[i] as number;
  }

  /** Días perdidos del mes absoluto `k` en la iteración `i`. */
  private perdidosEn(k: number, i: number): number {
    let v = this.perdidos.get(k);
    if (v === undefined) {
      const m = this.meses[k % 12] as MesClima;
      if (m.max <= m.min) v = m.min;
      else {
        const anio = Math.floor(k / 12);
        const etiqueta = `clima:${anio}-${String((k % 12) + 1).padStart(2, '0')}`;
        v = generarEntrada(pert(m.min, Math.min(m.max, Math.max(m.min, m.masProbable)), m.max), etiqueta, this.semilla, this.n, this.metodo);
      }
      this.perdidos.set(k, v);
    }
    return typeof v === 'number' ? v : (v[i] as number);
  }

  private laborablesDe(c: CalendarioLaboral, k: number): number {
    const clave = `${c.id}\u0000${k}`;
    let v = this.laborables.get(clave);
    if (v === undefined) {
      const anio = Math.floor(k / 12);
      const mes = k % 12;
      const desde = serieDe(anio, mes);
      const hasta = serieDe(anio, mes + 1);
      v = 0;
      for (let s = desde; s < hasta; s++) if (c.esLaborable(s)) v++;
      this.laborables.set(clave, v);
    }
    return v;
  }

  /** Fracción de ritmo perdido en el mes absoluto `k` (calendario `c`), iteración `i`. */
  perdida(c: CalendarioLaboral, k: number, i: number): number {
    const lab = this.laborablesDe(c, k);
    if (lab <= 0) return 0;
    return Math.min(PERDIDA_MAXIMA, Math.max(0, this.perdidosEn(k, i) / lab));
  }

  /**
   * Cuántos índices laborables de su calendario tarda una actividad que
   * empieza en el índice `inicio` con `d` días de trabajo, en la iteración `i`.
   */
  duracion(c: CalendarioLaboral, inicio: number, d: number, i: number): number {
    let resta = d;
    let k = inicio;
    for (let vuelta = 0; resta > 1e-12 && vuelta < 100_000; vuelta++) {
      const piso = Math.floor(k);
      const parte = piso + 1 - k;
      const ritmo = 1 - this.perdida(c, this.mesDe(c.serieInicio(piso)), i);
      const trabajo = parte * ritmo;
      if (trabajo >= resta) return k + resta / ritmo - inicio;
      resta -= trabajo;
      k = piso + 1;
    }
    return k - inicio;
  }
}
