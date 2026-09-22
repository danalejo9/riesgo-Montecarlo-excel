/**
 * Modo compatible: simular metiendo a **Excel dentro del bucle**.
 *
 * Es la red de seguridad del producto (decisión 15 del handoff). El motor
 * rápido evalúa el modelo por su cuenta y es cuatro órdenes de magnitud más
 * veloz, pero solo sabe las funciones que tiene implementadas. Con usuarios
 * desconocidos eso no basta: un libro con una función que falte se quedaría
 * sin respuesta, y "no puedo simular tu modelo" es motivo de desinstalar.
 *
 * Aquí se invierte el trato: se escriben las entradas en las celdas, se le
 * pide a Excel que recalcule y se leen las salidas, una iteración cada vez.
 * Funciona con **cualquier** libro —lo calcula Excel, no nosotros— y es
 * lentísimo. La auditoría midió ~3 horas para un millón de iteraciones.
 *
 * Por eso el modo compatible no es "el mismo producto más lento": es otro
 * trato con el usuario, y la interfaz tiene que reflejarlo. Se mide el ritmo
 * real antes de empezar, se dice cuánto va a tardar **con un número medido y
 * no estimado**, y se puede cancelar en cualquier momento.
 *
 * ---
 *
 * **Por qué Excel está detrás de una interfaz.**
 *
 * `LibroCalculable` separa "orquestar la simulación" de "hablar con Excel",
 * igual que `EjecutorDeBloques` separa "trocear en bloques" de "quién los
 * reparte". El bucle, la acumulación de estadísticas, la cancelación y la
 * estimación de tiempo son lógica pura que se prueba en Node con un libro
 * simulado; el adaptador de Office.js es una capa fina encima. Sin esta
 * separación, nada de esto se podría probar sin Excel abierto.
 */

import type { Buffer } from '../values/buffer.ts';

/**
 * Lo que el modo compatible necesita de un libro, sea Excel de verdad o un
 * doble de pruebas.
 *
 * **Una llamada a `calcularIteracion` es un viaje completo**: escribir las
 * entradas, recalcular y leer las salidas. Se expone así, y no en tres
 * métodos, porque en Office.js las tres cosas se pueden encolar y resolver en
 * **una sola** sincronización, y separarlas invitaría a hacer tres. Con un
 * millón de iteraciones, triplicar los viajes triplica el tiempo.
 */
export interface LibroCalculable {
  /**
   * Escribe un valor por entrada, recalcula y devuelve un valor por salida,
   * en el mismo orden en que se declararon.
   */
  calcularIteracion(valoresDeEntrada: readonly number[]): Promise<readonly number[]>;
}

export interface EntradaCompatible {
  /** Dirección de la celda en el libro, tal como la entiende Excel. */
  direccion: string;
  /** Las muestras ya generadas, una por iteración. */
  muestras: Buffer;
}

export interface OpcionesCompatible {
  libro: LibroCalculable;
  entradas: readonly EntradaCompatible[];
  /** Direcciones de las celdas de salida, en orden. */
  salidas: readonly string[];
  iteraciones: number;

  /** Compresión del t-digest de cada salida. */
  compresionTDigest?: number;
  /**
   * Cada cuántas iteraciones se informa del progreso y se consulta si hay que
   * cancelar. Con Excel en el bucle una iteración cuesta milisegundos, así que
   * preguntar a menudo no penaliza y hace que el botón de cancelar responda.
   */
  cadaCuantas?: number;
  progreso?: (avance: AvanceCompatible) => void;
  debeCancelar?: () => boolean;
}

export interface AvanceCompatible {
  completadas: number;
  totales: number;
  /** Ritmo medido hasta ahora, no supuesto. */
  iteracionesPorSegundo: number;
  /** Lo que queda, en milisegundos, según ese ritmo. */
  msRestantesEstimados: number;
}
