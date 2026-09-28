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
import { sumarConteos } from './categorias.ts';
import type { Plan } from '../compiler/plan.ts';
import type { Grafo } from '../graph/graph.ts';
import { combinarTDigest, type TDigest } from '../stats/tdigest.ts';
import { combinar, crearWelford, type EstadoWelford } from '../stats/welford.ts';
import { establecerRegional, regionalActual, type ConfiguracionRegional } from '../values/regional.ts';
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
  /**
   * La configuración regional del libro: decide cómo se convierten números en
   * texto y al revés. Se fija mientras dura la simulación y se restablece al
   * terminar. **Un ejecutor que reparta bloques a otros hilos tiene que
   * mandarla con el trabajo**: cada hilo tiene su propia copia del ajuste. Ver
   * `engine/values/regional.ts`.
   */
  regional?: ConfiguracionRegional;
  /**
   * Cuántas de las primeras iteraciones se guardan valor a valor, para el
   * análisis de sensibilidad. 0 (lo predeterminado) no guarda nada. Un
   * ejecutor externo tiene que respetarlo por su cuenta; si no devuelve
   * muestras, la salida simplemente no la trae.
   */
  retenerMuestra?: number;
  /**
   * Al menos cuántos bloques hacer, si `n` lo permite (sin bajar de 1.024
   * iteraciones por bloque). Con el tamaño adaptativo solo, diez mil
   * iteraciones son **un** bloque y un pool de ocho hilos tendría siete
   * parados. Es un número fijo y no "tantos como hilos" a propósito: el troceo
   * decide cómo se combinan los t-digest, y así la misma semilla da el mismo
   * resultado en un portátil de cuatro núcleos que en uno de dieciséis.
   */
  bloquesMinimos?: number;
}

export interface SalidaSimulada {
  welford: EstadoWelford;
  digest: TDigest;
  /**
   * Iteraciones en las que la salida no dio un número utilizable, excluidas de
   * `welford` y de `digest`. Ver `ParcialSalida.noNumericas`.
   */
  noNumericas: number;
  /** Las primeras iteraciones, valor a valor, si se pidió `retenerMuestra`. */
  muestra?: Float64Array;
  /** Salidas de texto o sí/no (T2, T6): valor → iteraciones. */
  categorias?: Record<string, number>;
  /** El valor de texto de cada iteración retenida, alineado con `muestra`. */
  muestraTexto?: (string | null)[];
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
  const limiteMuestra = Math.max(0, Math.min(n, Math.floor(opciones.retenerMuestra ?? 0)));
  const entradasResueltas = resolverEntradas(definicionesEntrada, seed, n);

  // Aproximación del ancho del grafo: las entradas más las celdas del plan
  // que de verdad ocupan un buffer de `n` (las constantes son de tamaño 1,
  // ver engine/compiler/plan.ts). No es exacta —no todas están vivas a la
  // vez— pero sobreestimar el número de buffers vivos solo hace el bloque
  // más chico de lo estrictamente necesario, nunca al revés.
  const buffersVivosEstimado = entradasResueltas.length + plan.orden.length - plan.esConstante.size;
  const adaptativo = tamanoBloqueAdaptativo(buffersVivosEstimado, opciones.presupuestoBytesPorWorker);
  const tamano = opciones.bloquesMinimos
    ? Math.min(adaptativo, Math.max(1024, Math.ceil(n / opciones.bloquesMinimos)))
    : adaptativo;
  const bloques = particionarEnBloques(n, tamano);

  const ejecutor =
    opciones.ejecutor ??
    crearEjecutorSecuencial(grafo, plan, entradasResueltas, seed, compresionTDigest, limiteMuestra);
  const bloquesPorRonda = Math.max(1, opciones.bloquesPorRonda ?? bloques.length);

  const acumuladoWelford = new Map<string, EstadoWelford>();
  const digestsPorSalida = new Map<string, TDigest[]>();
  const noNumericasPorSalida = new Map<string, number>();
  const muestrasPorSalida = new Map<string, Float64Array>();
  const categoriasPorSalida = new Map<string, Record<string, number>>();
  const muestrasTextoPorSalida = new Map<string, (string | null)[]>();
  let hayMuestra = false;
  for (const clave of plan.salidas) {
    if (limiteMuestra > 0) muestrasPorSalida.set(clave, new Float64Array(limiteMuestra).fill(NaN));
    acumuladoWelford.set(clave, crearWelford());
    digestsPorSalida.set(clave, []);
    noNumericasPorSalida.set(clave, 0);
  }

  let completadas = 0;
  let cancelada = false;

  const regionalPrevia = regionalActual();
  if (opciones.regional) establecerRegional(opciones.regional);

  try {
    for (let i = 0; i < bloques.length; i += bloquesPorRonda) {
      if (opciones.debeCancelar?.()) {
        cancelada = true;
        break;
      }

      const ronda = bloques.slice(i, i + bloquesPorRonda);
      const resultados = await ejecutor.ejecutar(ronda);

      resultados.forEach((parcial, k) => {
        const inicio = (ronda[k] as { inicio: number }).inicio;
        for (const clave of plan.salidas) {
          const p = parcial.get(clave);
          if (!p) continue;
          const destino = muestrasPorSalida.get(clave);
          if (destino && p.muestra) {
            destino.set(p.muestra.subarray(0, Math.max(0, limiteMuestra - inicio)), inicio);
            hayMuestra = true;
          }
          acumuladoWelford.set(clave, combinar(acumuladoWelford.get(clave) as EstadoWelford, p.welford));
          (digestsPorSalida.get(clave) as TDigest[]).push(p.digest);
          noNumericasPorSalida.set(clave, (noNumericasPorSalida.get(clave) as number) + (p.noNumericas ?? 0));
          if (p.categorias) {
            categoriasPorSalida.set(clave, sumarConteos(categoriasPorSalida.get(clave) ?? {}, p.categorias));
          }
          if (p.muestraTexto && limiteMuestra > 0) {
            let texto = muestrasTextoPorSalida.get(clave);
            if (!texto) {
              texto = new Array<string | null>(limiteMuestra).fill(null);
              muestrasTextoPorSalida.set(clave, texto);
            }
            for (let j = 0; j < p.muestraTexto.length && inicio + j < limiteMuestra; j++) texto[inicio + j] = p.muestraTexto[j] ?? null;
          }
        }
      });

      completadas += ronda.reduce((acc, b) => acc + b.largo, 0);
      opciones.progreso?.(completadas, n);
    }
  } catch (e) {
    if (e instanceof ErrorCalculoBloque) return { ok: false, error: { clave: e.clave, motivo: e.motivo } };
    throw e;
  } finally {
    establecerRegional(regionalPrevia);
  }

  // Si se canceló, solo vale el tramo que de verdad se calculó: los bloques
  // se despachan en orden, así que lo completado es un prefijo.
  const largoMuestra = Math.min(limiteMuestra, completadas);
  const porSalida = new Map<string, SalidaSimulada>();
  for (const clave of plan.salidas) {
    const muestra = hayMuestra ? muestrasPorSalida.get(clave)?.subarray(0, largoMuestra) : undefined;
    porSalida.set(clave, {
      welford: acumuladoWelford.get(clave) as EstadoWelford,
      digest: combinarTDigest(digestsPorSalida.get(clave) as TDigest[], compresionTDigest),
      noNumericas: noNumericasPorSalida.get(clave) as number,
      ...(muestra ? { muestra } : {}),
      ...(categoriasPorSalida.has(clave) ? { categorias: categoriasPorSalida.get(clave) as Record<string, number> } : {}),
      ...(muestrasTextoPorSalida.has(clave) ? { muestraTexto: (muestrasTextoPorSalida.get(clave) as (string | null)[]).slice(0, largoMuestra) } : {}),
    });
  }

  return { ok: true, porSalida, iteracionesCompletadas: completadas, cancelada };
}
