/**
 * El modelo de riesgo de un cronograma (QRSA, Q1.4): la red más la
 * incertidumbre de las duraciones, los riesgos discretos y la configuración
 * de la simulación. Sin Office.js. Es lo que la lectura de las hojas
 * (`excel/cronograma*.ts`) entrega al motor.
 */

import { discrete, lognormal, pert, triangular, trigen, uniform, type Distribution } from '../distributions/index.ts';
import type { MetodoMuestreo } from '../sampling/index.ts';
import type { DefinicionRed } from './red.ts';

/**
 * Distribución de una duración o de un impacto, en días laborables.
 * - `triangular`, `pert` (λ, por defecto 4): mínimo, más probable y máximo;
 * - `trigen`: dos percentiles (por defecto P10 y P90) y el más probable, la
 *   entrada recomendada porque los expertos se quedan cortos en los extremos;
 * - `uniforme`: mínimo y máximo;
 * - `lognormal`: media y desviación de la variable;
 * - `discreta`: valores y pesos;
 * - `fija`: un valor (un impacto seguro si el riesgo ocurre).
 */
export type DistribucionDuracion =
  | { tipo: 'triangular'; min: number; moda: number; max: number }
  | { tipo: 'pert'; min: number; moda: number; max: number; lambda?: number }
  | { tipo: 'trigen'; bajo: number; moda: number; alto: number; pBajo?: number; pAlto?: number }
  | { tipo: 'uniforme'; min: number; max: number }
  | { tipo: 'lognormal'; media: number; desv: number }
  | { tipo: 'discreta'; valores: readonly number[]; pesos: readonly number[] }
  | { tipo: 'fija'; valor: number };

export interface IncertidumbreActividad {
  actividad: string;
  distribucion: DistribucionDuracion;
  /**
   * Los parámetros son proporciones de la duración base (0,9 · 1 · 1,4 es
   * «del 90 % al 140 %»), en vez de días.
   */
  relativa?: boolean;
}

export interface ImpactoRiesgo {
  actividad: string;
  /** Días laborables que se suman a la duración si el riesgo ocurre (negativo: una oportunidad). */
  dias: DistribucionDuracion;
}

export interface RiesgoCronograma {
  id: string;
  nombre: string;
  /** Probabilidad de ocurrir en una iteración (0 a 1). */
  probabilidad: number;
  /** Las actividades que afecta: todas a la vez en la iteración en que ocurre. */
  impactos: readonly ImpactoRiesgo[];
}

export type Redondeo = 'entero' | 'decimal';

export interface ConfiguracionCronograma {
  iteraciones: number;
  semilla: number;
  /** Hipercubo latino por defecto en el cronograma (la especificación lo pide). */
  metodo: MetodoMuestreo;
  /** Duraciones simuladas redondeadas al día más cercano (por defecto) o con decimales. */
  redondeo: Redondeo;
  /** Ignorar «debe comenzar / terminar el» durante la simulación. */
  ignorarRestriccionesDuras: boolean;
  /** Fecha meta del proyecto (número de serie), si la hay. */
  fechaMeta?: number;
  /** Ids de los hitos que se siguen además del fin del proyecto (por defecto, todos los hitos). */
  hitos?: readonly string[];
}

export const CONFIGURACION_POR_DEFECTO: ConfiguracionCronograma = {
  iteraciones: 5000,
  semilla: 12345,
  metodo: 'lhs',
  redondeo: 'entero',
  ignorarRestriccionesDuras: false,
};

export interface ModeloCronograma {
  red: DefinicionRed;
  incertidumbre: readonly IncertidumbreActividad[];
  riesgos: readonly RiesgoCronograma[];
  configuracion: ConfiguracionCronograma;
}

/** Construye la distribución, en días; con `relativa`, escalada por la base. Lanza un error legible. */
export function construirDistribucion(d: DistribucionDuracion, escala = 1): Distribution {
  const e = (x: number) => x * escala;
  const num = (...xs: number[]) => {
    if (!xs.every(Number.isFinite)) throw new Error('Hay un parámetro que no es un número');
  };
  switch (d.tipo) {
    case 'triangular':
      num(d.min, d.moda, d.max);
      orden(d.min, d.moda, d.max);
      return d.min === d.max ? constante(e(d.min)) : triangular(e(d.min), e(d.moda), e(d.max));
    case 'pert':
      num(d.min, d.moda, d.max);
      orden(d.min, d.moda, d.max);
      return d.min === d.max ? constante(e(d.min)) : pert(e(d.min), e(d.moda), e(d.max), d.lambda ?? 4);
    case 'trigen':
      num(d.bajo, d.moda, d.alto);
      orden(d.bajo, d.moda, d.alto);
      return trigen(e(d.bajo), e(d.moda), e(d.alto), d.pBajo ?? 0.1, d.pAlto ?? 0.9);
    case 'uniforme':
      num(d.min, d.max);
      if (!(d.min <= d.max)) throw new Error(`El mínimo (${d.min}) no puede ser mayor que el máximo (${d.max})`);
      return d.min === d.max ? constante(e(d.min)) : uniform(e(d.min), e(d.max));
    case 'lognormal':
      num(d.media, d.desv);
      return lognormal(e(d.media), e(d.desv));
    case 'discreta':
      return discrete(d.valores.map(e), d.pesos);
    case 'fija':
      num(d.valor);
      return constante(e(d.valor));
  }
}

function orden(min: number, moda: number, max: number): void {
  if (!(min <= moda && moda <= max)) throw new Error(`Hace falta mínimo ≤ más probable ≤ máximo (${min}, ${moda}, ${max})`);
}

function constante(v: number): Distribution {
  return { quantile: () => v, cdf: (x) => (x < v ? 0 : 1), mean: () => v, variance: () => 0 };
}

/** El valor más probable (o representativo) de la distribución, para el cálculo determinístico de un impacto. */
export function valorTipico(d: DistribucionDuracion): number {
  switch (d.tipo) {
    case 'triangular': case 'pert': case 'trigen': return d.moda;
    case 'uniforme': return (d.min + d.max) / 2;
    case 'lognormal': return d.media;
    case 'fija': return d.valor;
    case 'discreta': {
      const total = d.pesos.reduce((s, p) => s + p, 0);
      return d.valores.reduce((s, v, i) => s + v * (d.pesos[i] ?? 0), 0) / (total || 1);
    }
  }
}
