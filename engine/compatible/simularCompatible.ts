/**
 * El bucle del modo compatible: una iteración, un viaje a Excel.
 *
 * Lógica pura — no importa nada de Office.js. Todo lo que sabe de Excel lo
 * sabe a través de `LibroCalculable` (ver `tipos.ts`), así que este bucle se
 * prueba entero en Node con un libro de mentira, y el adaptador real queda
 * como una capa fina encima.
 *
 * Tres cosas que el modo rápido no necesita y aquí son el producto:
 *
 * 1. **Ritmo medido.** Con Excel dentro del bucle el coste por iteración
 *    depende del libro del usuario, no de nosotros: un modelo de 200 celdas
 *    y uno de 200.000 no se parecen en nada. Estimar el tiempo restante a
 *    ojo sería mentir, así que se mide sobre las iteraciones ya hechas
 *    (`iteracionesPorSegundo`) y de ahí sale lo que falta.
 * 2. **Cancelación frecuente.** Una iteración cuesta milisegundos, no
 *    nanosegundos: consultar `debeCancelar` cada pocas iteraciones no se
 *    nota en el ritmo y hace que el botón de cancelar responda de verdad.
 *    Lo cancelado no se tira: se devuelve lo acumulado, con `cancelada`.
 * 3. **Iteraciones no numéricas contadas, no propagadas.** Si una salida da
 *    `#¡DIV/0!` en 12 de 5.000 iteraciones, meter ese `NaN` en Welford deja
 *    las estadísticas en `NaN` sin decir por qué (el hueco que documenta
 *    `aBufferNumerico`). Aquí se excluyen de las estadísticas y se cuentan
 *    en `noNumericas`, para que el informe pueda decirlo con un número.
 *
 * Los t-digest se construyen por tramos y se combinan al final, igual que
 * hace `simularPorBloques` con los bloques: acumular un millón de valores
 * sueltos por salida para digerirlos de golpe gastaría la memoria que el
 * t-digest existe para no gastar.
 */
import { combinarTDigest, tdigestDeBuffer, type TDigest } from '../stats/tdigest.ts';
import { acumular, crearWelford, type EstadoWelford } from '../stats/welford.ts';
import type { AvanceCompatible, OpcionesCompatible } from './tipos.ts';

/** Cuántos valores de una salida se acumulan antes de digerirlos en un t-digest parcial. */
const TRAMO_DIGEST = 4096;

export interface SalidaCompatible {
  welford: EstadoWelford;
  digest: TDigest;
  /**
   * Iteraciones en las que esta salida no dio un número utilizable (un error
   * de Excel, un texto, un infinito). Excluidas de `welford` y de `digest`.
   */
  noNumericas: number;
  /** Las primeras iteraciones, valor a valor, si se pidió `retenerMuestra`. */
  muestra?: Float64Array;
}

export type ResultadoCompatible =
  | {
      ok: true;
      /** Una entrada por dirección de salida, en el orden en que se declararon. */
      porSalida: Map<string, SalidaCompatible>;
      iteracionesCompletadas: number;
      /** `true` si `debeCancelar` cortó antes de llegar a `iteraciones`. */
      cancelada: boolean;
      /** Ritmo medido sobre la ejecución completa. */
      iteracionesPorSegundo: number;
    }
  | { ok: false; error: { iteracion: number; motivo: string } };

/** Acumulador de una salida mientras corre el bucle. */
interface Acumulador {
  welford: EstadoWelford;
  digestsParciales: TDigest[];
  tramo: Float64Array;
  enTramo: number;
  noNumericas: number;
}

function nuevoAcumulador(): Acumulador {
  return {
    welford: crearWelford(),
    digestsParciales: [],
    tramo: new Float64Array(TRAMO_DIGEST),
    enTramo: 0,
    noNumericas: 0,
  };
}

function cerrarTramo(acc: Acumulador, compresion: number): void {
  if (acc.enTramo === 0) return;
  const usado = acc.tramo.subarray(0, acc.enTramo);
  acc.welford = acumular(acc.welford, usado);
  acc.digestsParciales.push(tdigestDeBuffer(usado, compresion));
  acc.enTramo = 0;
}

function anotar(acc: Acumulador, valor: number, compresion: number): void {
  if (!Number.isFinite(valor)) {
    acc.noNumericas += 1;
    return;
  }
  acc.tramo[acc.enTramo++] = valor;
  if (acc.enTramo === TRAMO_DIGEST) cerrarTramo(acc, compresion);
}

/**
 * Corre `iteraciones` pasadas completas por Excel y devuelve las mismas
 * estadísticas que el modo rápido (Welford + t-digest por salida), para que
 * el informe de resultados no tenga que distinguir de dónde vinieron.
 *
 * Nunca lanza por un fallo del libro: si `calcularIteracion` rechaza, se
 * devuelve `ok: false` con la iteración y el motivo. Un fallo así no es una
 * iteración mala, es Excel diciendo que no puede — reintentar un millón de
 * veces lo mismo no lo arregla.
 */
export async function simularCompatible(opciones: OpcionesCompatible): Promise<ResultadoCompatible> {
  const { libro, entradas, salidas, iteraciones } = opciones;
  const compresion = opciones.compresionTDigest ?? 100;
  const cadaCuantas = Math.max(1, opciones.cadaCuantas ?? 25);

  const acumuladores = salidas.map(() => nuevoAcumulador());
  const limiteMuestra = Math.max(0, Math.min(iteraciones, Math.floor(opciones.retenerMuestra ?? 0)));
  const muestras = salidas.map(() => new Float64Array(limiteMuestra).fill(NaN));
  const valoresDeEntrada = new Array<number>(entradas.length);

  const arranque = ahora();
  let completadas = 0;
  let cancelada = false;

  for (let i = 0; i < iteraciones; i++) {
    if (i % cadaCuantas === 0) {
      if (opciones.debeCancelar?.()) {
        cancelada = true;
        break;
      }
      informar(opciones.progreso, completadas, iteraciones, arranque);
    }

    for (let e = 0; e < entradas.length; e++) {
      valoresDeEntrada[e] = (entradas[e] as { muestras: Float64Array }).muestras[i] as number;
    }

    let leidas: readonly number[];
    try {
      leidas = await libro.calcularIteracion(valoresDeEntrada);
    } catch (e) {
      return { ok: false, error: { iteracion: i, motivo: e instanceof Error ? e.message : String(e) } };
    }

    if (leidas.length !== salidas.length) {
      return {
        ok: false,
        error: {
          iteracion: i,
          motivo: `el libro devolvió ${leidas.length} valores y se esperaban ${salidas.length}`,
        },
      };
    }

    for (let s = 0; s < salidas.length; s++) {
      anotar(acumuladores[s] as Acumulador, leidas[s] as number, compresion);
      if (i < limiteMuestra) (muestras[s] as Float64Array)[i] = Number(leidas[s]);
    }
    completadas += 1;
  }

  const transcurrido = ahora() - arranque;
  informar(opciones.progreso, completadas, iteraciones, arranque);

  const porSalida = new Map<string, SalidaCompatible>();
  for (let s = 0; s < salidas.length; s++) {
    const acc = acumuladores[s] as Acumulador;
    cerrarTramo(acc, compresion);
    porSalida.set(salidas[s] as string, {
      welford: acc.welford,
      digest: combinarTDigest(acc.digestsParciales, compresion),
      noNumericas: acc.noNumericas,
      ...(limiteMuestra > 0
        ? { muestra: (muestras[s] as Float64Array).subarray(0, Math.min(limiteMuestra, completadas)) }
        : {}),
    });
  }

  return {
    ok: true,
    porSalida,
    iteracionesCompletadas: completadas,
    cancelada,
    iteracionesPorSegundo: ritmo(completadas, transcurrido),
  };
}

/**
 * Mide el ritmo real corriendo unas pocas iteraciones de verdad, para poder
 * decirle al usuario cuánto va a tardar **antes** de que se comprometa.
 *
 * Se corre sobre el libro real y con muestras reales: no hay forma honesta de
 * estimar esto sin hacerlo, porque el coste lo pone su modelo. Las
 * iteraciones de la medición se calculan y se tiran — sus resultados no
 * entran en las estadísticas, así que la simulación posterior sigue siendo
 * exactamente las `n` iteraciones que el usuario pidió.
 */
export async function medirRitmo(
  libro: OpcionesCompatible['libro'],
  entradas: OpcionesCompatible['entradas'],
  iteracionesDePrueba = 5,
): Promise<{ iteracionesPorSegundo: number; msPorIteracion: number }> {
  const valores = new Array<number>(entradas.length);
  const arranque = ahora();
  let hechas = 0;

  for (let i = 0; i < iteracionesDePrueba; i++) {
    for (let e = 0; e < entradas.length; e++) {
      const muestras = (entradas[e] as { muestras: Float64Array }).muestras;
      valores[e] = muestras[i % muestras.length] as number;
    }
    await libro.calcularIteracion(valores);
    hechas += 1;
  }

  const transcurrido = ahora() - arranque;
  const porSegundo = ritmo(hechas, transcurrido);
  return { iteracionesPorSegundo: porSegundo, msPorIteracion: hechas > 0 ? transcurrido / hechas : 0 };
}

function informar(
  progreso: ((avance: AvanceCompatible) => void) | undefined,
  completadas: number,
  totales: number,
  arranque: number,
): void {
  if (!progreso) return;
  const transcurrido = ahora() - arranque;
  const porSegundo = ritmo(completadas, transcurrido);
  progreso({
    completadas,
    totales,
    iteracionesPorSegundo: porSegundo,
    msRestantesEstimados: porSegundo > 0 ? ((totales - completadas) / porSegundo) * 1000 : Infinity,
  });
}

/**
 * Cero iteraciones, o un reloj que no ha avanzado todavía, no dan un ritmo:
 * devolver `Infinity` ahí haría prometer "0 ms restantes" en cuanto empieza.
 */
function ritmo(completadas: number, transcurridoMs: number): number {
  return completadas > 0 && transcurridoMs > 0 ? (completadas / transcurridoMs) * 1000 : 0;
}

function ahora(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
