/**
 * El modelo de riesgo de un cronograma (QRSA, Q1.4): la red más la
 * incertidumbre de las duraciones, los riesgos discretos y la configuración
 * de la simulación. Sin Office.js. Es lo que la lectura de las hojas
 * (`excel/cronograma*.ts`) entrega al motor.
 */

import { discrete, lognormal, pert, triangular, trigen, uniform, type Distribution } from '../distributions/index.ts';
import type { MetodoMuestreo } from '../sampling/index.ts';
import type { DefinicionRed } from './red.ts';
import type { Clima } from './clima.ts';

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
  /** Id de la actividad. Con `selector`, la fila vale para un grupo de actividades. */
  actividad: string;
  /**
   * Factor por grupo (Q2.6): la fila se aplica a las actividades de esa WBS
   * (prefijo) o de ese grupo (columna «Grupo» de Actividades) que no tengan
   * una distribución propia. La primera fila que coincide manda.
   */
  selector?: { wbs?: string; grupo?: string };
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
  dias?: DistribucionDuracion;
  /** Costo que suma si el riesgo ocurre (negativo: un ahorro). */
  costo?: DistribucionDuracion;
}

export interface RiesgoCronograma {
  id: string;
  nombre: string;
  /** Probabilidad de ocurrir en una iteración (0 a 1). */
  probabilidad: number;
  /** Las actividades que afecta: todas a la vez en la iteración en que ocurre. */
  impactos: readonly ImpactoRiesgo[];
  /** Escenario post mitigación (Q2.5): la probabilidad después de mitigar. */
  probabilidadPost?: number;
  /** Escenario post: proporción del impacto que queda (1 = igual, 0,5 = la mitad). */
  factorImpactoPost?: number;
  /** Escenario post: lo que cuesta mitigar (se suma al costo en el escenario post). */
  costoMitigacion?: number;
  /**
   * Cómo entra en la red (Q3.4): alargando las actividades afectadas (por
   * defecto) o como una actividad nueva insertada después de cada una, con
   * sus mismas sucesoras fin–comienzo.
   */
  modo?: 'extension' | 'actividad';
}

export type TipoCosto = 'fijo' | 'tiempo' | 'recurso';

/**
 * Una partida de costo (Q2.1):
 * - `fijo`: el valor (con su incertidumbre);
 * - `tiempo`: tarifa por día laborable × duración simulada de la actividad
 *   (o del proyecto, sin actividad): administración, vigilancia, alquileres;
 * - `recurso`: unidades × tarifa × duración.
 */
export interface PartidaCosto {
  id: string;
  nombre: string;
  tipo: TipoCosto;
  /** Sin actividad: el proyecto entero. */
  actividad?: string;
  /** Monto (fijo) o tarifa diaria (tiempo, recurso). */
  valor: number;
  unidades?: number;
  /** Incertidumbre del monto o de la tarifa, en las mismas unidades; sin ella, el valor fijo. */
  distribucion?: DistribucionDuracion;
  /** Escalamiento anual (0,05 = 5 % al año), según la fecha simulada de ejecución (Q3.5). */
  escalamiento?: number;
}

/** Correlación de rangos entre dos actividades o partidas de costo (Q2.2). */
export interface CorrelacionPar {
  a: string;
  b: string;
  rho: number;
}

/** Un grupo con coeficiente común: todas las parejas de miembros con el mismo ρ. */
export interface GrupoCorrelacion {
  nombre: string;
  miembros: readonly string[];
  rho: number;
}

/** Ramificación probabilística (Q3.4): en cada iteración se sigue una opción. */
export interface Ramificacion {
  rama: string;
  opciones: readonly { opcion: string; probabilidad: number; actividades: readonly string[] }[];
}

/** Lo que el motor de la red no necesita pero el análisis sí. */
export interface InfoActividad {
  id: string;
  wbs?: string;
  grupo?: string;
}

/**
 * Hito contractual (W1): una actividad cuyo fin fija el contrato (una
 * entrega, un acta, una puesta en servicio), con la multa por cada día
 * natural de retraso y su tope (la cláusula penal). No es una restricción del
 * cronograma (para eso está la fecha límite): es contra lo que se mide. Si
 * el hito termina después de su fecha, la multa de esa iteración se suma al
 * costo y entra en la contingencia y en la probabilidad conjunta (JCL).
 */
export interface HitoContractual {
  actividad: string;
  /** Fecha contractual (número de serie): el hito tiene que terminar ese día o antes. */
  fecha: number;
  /** Multa por día natural de retraso. */
  multaDia?: number;
  /** Tope de la multa (total). */
  tope?: number;
}

/** La multa de un hito que termina el día `fin` (número de serie): días naturales de retraso × multa, con tope. */
export function multaDe(h: HitoContractual, fin: number): number {
  if (!h.multaDia) return 0;
  const dias = Math.floor(fin) - Math.floor(h.fecha);
  if (dias <= 0) return 0;
  return Math.min(h.tope ?? Infinity, dias * h.multaDia);
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
  /** Ids de los hitos que se siguen además del fin del proyecto (por defecto, los intermedios). */
  hitos?: readonly string[];
  /** Costo meta (para la probabilidad conjunta, JCL). */
  costoMeta?: number;
  moneda?: string;
  /**
   * Iteraciones automáticas (Q3.6): se simula con 1.000, 2.000, 5.000,
   * 10.000 y 20.000 hasta que el P80 del fin cambie menos del 0,5 % en el
   * último bloque de 500.
   */
  iteracionesAutomaticas?: boolean;
  /** Percentil de la contingencia de costo (por defecto 0,8). */
  percentilContingencia?: number;
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
  costos?: readonly PartidaCosto[];
  correlaciones?: readonly CorrelacionPar[];
  gruposCorrelacion?: readonly GrupoCorrelacion[];
  ramas?: readonly Ramificacion[];
  info?: readonly InfoActividad[];
  hitosContractuales?: readonly HitoContractual[];
  /** V8: clima probabilístico (hoja Clima). */
  clima?: Clima;
}

/** ¿Algún riesgo trae datos del escenario post mitigación? */
export function tienePostMitigacion(m: ModeloCronograma): boolean {
  return m.riesgos.some((r) => r.probabilidadPost !== undefined || r.factorImpactoPost !== undefined || r.costoMitigacion !== undefined);
}

/** ¿Hay costos (partidas o impactos de costo)? */
export function tieneCostos(m: ModeloCronograma): boolean {
  return (m.costos?.length ?? 0) > 0 || m.riesgos.some((r) => r.impactos.some((i) => i.costo !== undefined))
    || (m.hitosContractuales ?? []).some((h) => (h.multaDia ?? 0) > 0);
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

/**
 * La distribución que le toca a una actividad: la suya o, si no tiene, la de
 * la primera fila de grupo (WBS por prefijo, o grupo) que coincide.
 */
export function incertidumbreDe(modelo: ModeloCronograma, id: string): IncertidumbreActividad | null {
  const propia = modelo.incertidumbre.find((i) => !i.selector && i.actividad === id);
  if (propia) return propia;
  const info = modelo.info?.find((x) => x.id === id);
  if (!info) return null;
  return modelo.incertidumbre.find((i) => i.selector && (
    (i.selector.wbs !== undefined && info.wbs !== undefined && (info.wbs === i.selector.wbs || info.wbs.startsWith(`${i.selector.wbs}.`)))
    || (i.selector.grupo !== undefined && info.grupo !== undefined && info.grupo.toLowerCase() === i.selector.grupo.toLowerCase()))) ?? null;
}
