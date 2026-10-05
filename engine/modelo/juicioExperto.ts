/**
 * Asistente de juicio experto (V4): de cuatro preguntas en palabras a una
 * distribución, sin saber estadística. Sin Office.js.
 *
 * - «¿Lo mínimo razonable?», «¿lo máximo?», «¿lo más probable?» (que se puede
 *   no saber);
 * - «¿qué tan seguro está de esos extremos?»: si de verdad no se pasan nunca
 *   (PERT entre ellos), si podrían salirse 1 de cada 20 veces (Trigen con P5
 *   y P95) o 1 de cada 10 (Trigen con P10 y P90). Los expertos se quedan
 *   cortos en los extremos: lo honesto es tratarlos como percentiles, y la
 *   Trigen calcula el mínimo y el máximo reales.
 */

import { limitesTrigen } from '../distributions/trigen.ts';
import type { DistributionSpec } from './distributionSchema.ts';

export type ConfianzaExtremos = 'nunca' | 'uno-de-20' | 'uno-de-10';

export interface RespuestasExperto {
  minimo: number;
  maximo: number;
  /** `undefined`: no se sabe cuál es el más probable. */
  masProbable?: number;
  confianza: ConfianzaExtremos;
}

export interface PropuestaExperto {
  spec: DistributionSpec;
  /** Por qué esa distribución, en una o dos frases. */
  explicacion: string;
  /** Mínimo y máximo reales de la distribución propuesta (con Trigen, más anchos que los dichos). */
  minimoReal: number;
  maximoReal: number;
  avisos: string[];
}

export const TEXTO_CONFIANZA: Record<ConfianzaExtremos, string> = {
  'nunca': 'Nunca bajaría del mínimo ni pasaría del máximo',
  'uno-de-20': 'Podría salirse de ese rango 1 de cada 20 veces',
  'uno-de-10': 'Podría salirse de ese rango 1 de cada 10 veces',
};

function cifra(x: number): string {
  return x.toLocaleString('es-CO', { maximumSignificantDigits: 4 });
}

/** La distribución que corresponde a las respuestas, o el motivo por el que aún no se puede. */
export function proponerDistribucion(r: RespuestasExperto): PropuestaExperto | string {
  const { minimo, maximo, masProbable, confianza } = r;
  if (![minimo, maximo].every(Number.isFinite)) return 'Falta el mínimo o el máximo';
  if (!(minimo < maximo)) return 'El mínimo tiene que ser menor que el máximo';
  if (masProbable !== undefined && !(minimo <= masProbable && masProbable <= maximo)) {
    return 'El más probable tiene que estar entre el mínimo y el máximo';
  }
  const avisos: string[] = [];

  if (masProbable === undefined) {
    if (confianza === 'nunca') {
      return {
        spec: { type: 'uniform', min: minimo, max: maximo },
        explicacion: `Sin un valor más probable y con extremos firmes, cualquier valor entre ${cifra(minimo)} y ${cifra(maximo)} es igual de posible: una uniforme.`,
        minimoReal: minimo, maximoReal: maximo, avisos,
      };
    }
    avisos.push('Sin un valor más probable se toma el punto medio. Si lo sabe, la estimación mejora.');
  }
  const moda = masProbable ?? (minimo + maximo) / 2;

  // Un extremo que coincide con el más probable no puede tratarse como
  // percentil (la Trigen no tendría cola de ese lado): se toma como firme.
  const enUnExtremo = moda === minimo || moda === maximo;
  if (confianza === 'nunca' || enUnExtremo) {
    if (confianza !== 'nunca') avisos.push('El más probable coincide con un extremo: ese extremo se toma como firme y se usa la PERT.');
    const asimetria = Math.abs((moda - minimo) - (maximo - moda)) / (maximo - minimo);
    return {
      spec: { type: 'pert', min: minimo, mode: moda, max: maximo },
      explicacion: `Con extremos firmes, una PERT entre ${cifra(minimo)} y ${cifra(maximo)} con el más probable en ${cifra(moda)}: concentra el peso cerca de él${asimetria > 0.3 ? ' y alarga la cola del lado más lejano' : ''}.`,
      minimoReal: minimo, maximoReal: maximo, avisos,
    };
  }

  const [pLow, pHigh] = confianza === 'uno-de-20' ? [0.05, 0.95] : [0.1, 0.9];
  const { min, max } = limitesTrigen(minimo, moda, maximo, pLow, pHigh);
  const pct = Math.round(pLow * 100);
  return {
    spec: { type: 'trigen', low: minimo, mode: moda, high: maximo, pLow, pHigh },
    explicacion: `Como el rango puede quedarse corto ${confianza === 'uno-de-20' ? '1 de cada 20' : '1 de cada 10'} veces, ${cifra(minimo)} y ${cifra(maximo)} se toman como el P${pct} y el P${100 - pct}: una Trigen que en realidad va de ${cifra(min)} a ${cifra(max)}.`,
    minimoReal: min, maximoReal: max, avisos,
  };
}
