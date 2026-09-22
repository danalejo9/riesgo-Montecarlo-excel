/**
 * Orquesta una simulación completa: trocea `n` iteraciones en bloques de
 * tamaño adaptativo (`bloques.ts`), les pide su resultado a un
 * `EjecutorDeBloques` —secuencial por defecto (`ejecutorSecuencial.ts`), o un
 * pool real de Web Workers si se provee uno—, y combina las estadísticas
 * parciales de cada bloque en el resultado final (Welford + t-digest, Fase 2
 * §3.1: "las estadísticas se acumulan bloque a bloque").
 *
 * Nunca retiene más de un puñado de bloques en memoria a la vez, y consulta
 * cancelación entre lotes de bloques (R5): es lo que permite que cerrar el
 * panel a mitad de una simulación de un millón de iteraciones no deje nada a
 * medias más que estadísticas parciales, descartables sin más.
 */
import type { Plan } from '../compiler/plan.ts';
import type { Grafo } from '../graph/graph.ts';
import { combinarTDigest, type TDigest } from '../stats/tdigest.ts';
import { combinar, crearWelford, type EstadoWelford } from '../stats/welford.ts';
import { particionarEnBloques, tamanoBloqueAdaptativo } from './bloques.ts';
import { crearEjecutorSecuencial } from './ejecutorSecuencial.ts';
import { resolverEntradas, type DefinicionEntrada } from './entradas.ts';
import { ErrorCalculoBloque, type EjecutorDeBloques } from './tipos.ts';

export interface OpcionesSimulacion {
  /** Compresión del t-digest de cada salida (más alto = más preciso y más memoria). */
  compresionTDigest?: number;
  /** Presupuesto de memoria que gobierna el tamaño de bloque, ver `bloques.ts`. */
  presupuestoBytesPorWorker?: number;
  /** Cuántos bloques se despachan por ronda antes de volver a consultar cancelación/progreso. */
  bloquesPorRonda?: number;
  /** Reparte los bloques como se prefiera (Web Workers, `worker_threads`...). Por defecto, secuencial en este hilo. */
  ejecutor?: EjecutorDeBloques;
  /** Se consulta entre rondas; si devuelve `true`, la simulación se detiene con lo acumulado hasta ese punto. */
  debeCancelar?: () => boolean;
  /** Se llama tras cada ronda con el progreso acumulado. */
  progreso?: (iteracionesCompletadas: number, iteracionesTotales: number) => void;
}

export interface SalidaSimulada {
  welford: EstadoWelford;
  digest: TDigest;
  /**
   * Iteraciones en las que la salida no dio un número utilizable, excluidas de
   * `welford` y de `digest`. Ver `ParcialSalida.noNumericas`.
   */
  noNumericas: number;
}

export type ResultadoSimulacion =
  | {
      ok: true;
      porSalida: Map<string, SalidaSimulada>;
      iteracionesCompletadas: number;
      /** `true` si `debeCancelar` cortó la simulación antes de completar `n`. */
      cancelada: boolean;
    }
  | { ok: false; error: { clave: string; motivo: string } };

export async function simularPorBloques(
  grafo: Grafo,
  plan: Plan,
  definicionesEntrada: readonly DefinicionEntrada[],
  seed: number,
  n: number,
  opciones: OpcionesSimulacion = {},
): Promise<ResultadoSimulacion> {
  const compresionTDigest = opciones.compresionTDigest ?? 100;
  const entradasResueltas = resolverEntradas(definicionesEntrada, seed, n);

  // Aproximación del ancho del grafo: las entradas más las celdas del plan
  // que de verdad ocupan un buffer de `n` (las constantes son de tamaño 1,
  // ver engine/compiler/plan.ts). No es exacta —no todas están vivas a la
  // vez— pero sobreestimar el número de buffers vivos solo hace el bloque
  // más chico de lo estrictamente necesario, nunca al revés.
  const buffersVivosEstimado = entradasResueltas.length + plan.orden.length - plan.esConstante.size;
  const tamano = tamanoBloqueAdaptativo(buffersVivosEstimado, opciones.presupuestoBytesPorWorker);
  const bloques = particionarEnBloques(n, tamano);

  const ejecutor =
    opciones.ejecutor ?? crearEjecutorSecuencial(grafo, plan, entradasResueltas, seed, compresionTDigest);
  const bloquesPorRonda = Math.max(1, opciones.bloquesPorRonda ?? bloques.length);

  const acumuladoWelford = new Map<string, EstadoWelford>();
  const digestsPorSalida = new Map<string, TDigest[]>();
  const noNumericasPorSalida = new Map<string, number>();
  for (const clave of plan.salidas) {
    acumuladoWelford.set(clave, crearWelford());
    digestsPorSalida.set(clave, []);
    noNumericasPorSalida.set(clave, 0);
  }

  let completadas = 0;
  let cancelada = false;

  try {
    for (let i = 0; i < bloques.length; i += bloquesPorRonda) {
      if (opciones.debeCancelar?.()) {
        cancelada = true;
        break;
      }

      const ronda = bloques.slice(i, i + bloquesPorRonda);
      const resultados = await ejecutor.ejecutar(ronda);

      for (const parcial of resultados) {
        for (const clave of plan.salidas) {
          const p = parcial.get(clave);
          if (!p) continue;
          acumuladoWelford.set(clave, combinar(acumuladoWelford.get(clave) as EstadoWelford, p.welford));
          (digestsPorSalida.get(clave) as TDigest[]).push(p.digest);
          noNumericasPorSalida.set(clave, (noNumericasPorSalida.get(clave) as number) + (p.noNumericas ?? 0));
        }
      }

      completadas += ronda.reduce((acc, b) => acc + b.largo, 0);
      opciones.progreso?.(completadas, n);
    }
  } catch (e) {
    if (e instanceof ErrorCalculoBloque) return { ok: false, error: { clave: e.clave, motivo: e.motivo } };
    throw e;
  }

  const porSalida = new Map<string, SalidaSimulada>();
  for (const clave of plan.salidas) {
    porSalida.set(clave, {
      welford: acumuladoWelford.get(clave) as EstadoWelford,
      digest: combinarTDigest(digestsPorSalida.get(clave) as TDigest[], compresionTDigest),
      noNumericas: noNumericasPorSalida.get(clave) as number,
    });
  }

  return { ok: true, porSalida, iteracionesCompletadas: completadas, cancelada };
}
