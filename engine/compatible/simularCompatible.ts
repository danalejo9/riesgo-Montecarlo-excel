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
import { sumarConteos } from '../executor/categorias.ts';
import { regionalActual } from '../values/regional.ts';
import { combinarTDigest, tdigestDeBuffer, type TDigest } from '../stats/tdigest.ts';
import { acumular, crearWelford, type EstadoWelford } from '../stats/welford.ts';
import type { AvanceCompatible, OpcionesCompatible, ValorLeido } from './tipos.ts';

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
  /** Salidas de texto o sí/no (T2, T6): valor → iteraciones. */
  categorias?: Record<string, number>;
  /** El texto de cada iteración retenida, alineado con `muestra`. */
  muestraTexto?: (string | null)[];
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
  categorias?: Record<string, number>;
  muestraTexto?: (string | null)[];
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
  const nombresLogicos = opciones.nombresLogicos ?? regionalActual();

  const arranque = ahora();
  let completadas = 0;
  let cancelada = false;

  const lote = libro.calcularLote ? Math.max(1, Math.floor(opciones.lote ?? 1)) : 1;
  let ultimoAviso = -Infinity;

  for (let inicio = 0; inicio < iteraciones; inicio += lote) {
    // Cancelar y avisar del progreso: cada `cadaCuantas` iteraciones, o en
    // cada lote si se va por lotes (un lote ya son muchas iteraciones).
    if (lote > 1 || inicio - ultimoAviso >= cadaCuantas) {
      ultimoAviso = inicio;
      if (opciones.debeCancelar?.()) {
        cancelada = true;
        break;
      }
      informar(opciones.progreso, completadas, iteraciones, arranque);
    }

    const fin = Math.min(iteraciones, inicio + lote);
    const valoresLote: number[][] = [];
    for (let i = inicio; i < fin; i++) {
      const fila = new Array<number>(entradas.length);
      for (let e = 0; e < entradas.length; e++) fila[e] = (entradas[e] as { muestras: Float64Array }).muestras[i] as number;
      valoresLote.push(fila);
    }

    let leidasLote: readonly (readonly ValorLeido[])[];
    try {
      leidasLote = lote > 1 && libro.calcularLote
        ? await libro.calcularLote(valoresLote)
        : [await libro.calcularIteracion(valoresLote[0] as number[])];
    } catch (e) {
      return { ok: false, error: { iteracion: inicio, motivo: e instanceof Error ? e.message : String(e) } };
    }
    if (leidasLote.length !== fin - inicio) {
      return { ok: false, error: { iteracion: inicio, motivo: `el libro devolvió ${leidasLote.length} iteraciones y se esperaban ${fin - inicio}` } };
    }

    for (let k = 0; k < leidasLote.length; k++) {
      const i = inicio + k;
      const leidas = leidasLote[k] as readonly ValorLeido[];
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
        const v = leidas[s] as ValorLeido;
        const acc = acumuladores[s] as Acumulador;
        // Un texto no es un número (cuenta como «sin valor»); un lógico cuenta
        // como 1/0 y además como categoría, igual que en el motor rápido.
        const numero = typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : NaN;
        anotar(acc, numero, compresion);
        if (i < limiteMuestra) (muestras[s] as Float64Array)[i] = numero;
        const categoria = typeof v === 'string' ? v : typeof v === 'boolean' ? (v ? nombresLogicos.verdadero : nombresLogicos.falso) : null;
        if (categoria !== null) {
          acc.categorias = sumarConteos(acc.categorias ?? {}, { [categoria]: 1 });
          if (i < limiteMuestra) {
            acc.muestraTexto ??= new Array<string | null>(limiteMuestra).fill(null);
            acc.muestraTexto[i] = categoria;
          }
        }
      }
      completadas += 1;
    }
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
      ...(acc.categorias ? { categorias: acc.categorias } : {}),
      ...(acc.muestraTexto ? { muestraTexto: acc.muestraTexto.slice(0, Math.min(limiteMuestra, completadas)) } : {}),
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
  /** Iteraciones por viaje, como en la simulación (F5b). */
  lote = 1,
): Promise<{ iteracionesPorSegundo: number; msPorIteracion: number }> {
  const fila = (i: number) => entradas.map((e) => {
    const muestras = (e as { muestras: Float64Array }).muestras;
    return muestras[i % muestras.length] as number;
  });
  const arranque = ahora();
  let hechas = 0;

  if (lote > 1 && libro.calcularLote) {
    // Como se va a simular: en lotes (F5b). Uno de `lote` iteraciones mide el
    // ritmo real, que es lo que importa para avisar de cuánto va a tardar.
    const n = Math.max(iteracionesDePrueba, lote);
    await libro.calcularLote(Array.from({ length: n }, (_, i) => fila(i)));
    hechas = n;
  } else {
    for (let i = 0; i < iteracionesDePrueba; i++) {
      await libro.calcularIteracion(fila(i));
      hechas += 1;
    }
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
