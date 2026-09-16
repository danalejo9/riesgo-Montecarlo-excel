/**
 * Cómo obtener el tramo `[inicio, inicio+largo)` de una variable de entrada
 * dentro del ejecutor por bloques, sin materializar nunca el buffer completo
 * de `n` muestras cuando se puede evitar.
 *
 * Dos formas, porque no todos los métodos de muestreo pueden generarse por
 * tramos todavía:
 *
 * - `distribucion` (Monte Carlo): perezosa de verdad. `generarTramo` llama a
 *   `muestrearMonteCarloBloque`, que genera exactamente ese tramo sin tocar
 *   el resto — el ahorro de memoria real de D11.
 * - `buffer`: ya materializado por completo de antemano (una entrada LHS, o
 *   cualquier variable con un valor fijo). `generarTramo` solo toma una
 *   vista (`subarray`, sin copiar) de ese tramo. LHS necesita conocer `n`
 *   para estratificar (ver `engine/sampling/lhs.ts`), así que no puede
 *   generarse por tramos todavía — se resuelve entera una vez, con
 *   `resolverEntradas`, antes de que empiece el troceo en bloques.
 */
import { construirDesdeDescriptor, type DescriptorDistribucion } from '../distributions/index.ts';
import type { Buffer } from '../functions/types.ts';
import { muestrearLHS, muestrearMonteCarloBloque } from '../sampling/index.ts';
import type { MetodoMuestreo } from '../sampling/types.ts';

export interface EntradaDistribucion {
  tipo: 'distribucion';
  clave: string;
  id: string;
  distribucion: DescriptorDistribucion;
  metodo: MetodoMuestreo;
}

export interface EntradaBuffer {
  tipo: 'buffer';
  clave: string;
  buffer: Buffer;
}

/** Definición de una variable de entrada, en la forma serializable que puede viajar a un worker. */
export type DefinicionEntrada = EntradaDistribucion | EntradaBuffer;

/**
 * Resuelve por adelantado lo que no puede esperar a los bloques: hoy, solo
 * las entradas LHS (necesitan `n` completo para estratificar). Las Monte
 * Carlo se dejan tal cual, perezosas.
 */
export function resolverEntradas(defs: readonly DefinicionEntrada[], seed: number, n: number): DefinicionEntrada[] {
  return defs.map((d) => {
    if (d.tipo === 'buffer' || d.metodo === 'monte-carlo') return d;
    const dist = construirDesdeDescriptor(d.distribucion);
    return { tipo: 'buffer', clave: d.clave, buffer: muestrearLHS(dist, d.id, seed, n) };
  });
}

/** Genera (o recorta) el tramo `[inicio, inicio+largo)` de una entrada ya resuelta. */
export function generarTramoDeEntrada(def: DefinicionEntrada, seed: number, inicio: number, largo: number): Buffer {
  if (def.tipo === 'buffer') return def.buffer.subarray(inicio, inicio + largo);
  const dist = construirDesdeDescriptor(def.distribucion);
  return muestrearMonteCarloBloque(dist, def.id, seed, inicio, largo);
}
