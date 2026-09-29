/**
 * El modo compatible de punta a punta, dentro de Excel: proteger el libro,
 * simular con Excel en el bucle y devolverlo exactamente como estaba.
 *
 * Es el único sitio donde se juntan las tres piezas —el guardián
 * (`engine/modelo/guardian.ts`), el bucle (`engine/compatible/`) y el
 * adaptador (`libroCalculable.ts`)— y su trabajo es la coreografía, no la
 * lógica: aquí no se decide nada que no se pueda leer en veinte líneas.
 *
 * ---
 *
 * **Un único `Excel.run` para toda la simulación.** El contexto se abre una
 * vez y lo comparten el almacén y el libro calculable. Abrir uno por iteración
 * costaría un viaje extra por iteración, que es precisamente lo que el modo
 * compatible no se puede permitir.
 *
 * **Al terminar se restauran los valores, no solo el modo de cálculo.** El
 * guardián ofrece dos finales: `finalizarProteccion` (devuelve el modo de
 * cálculo y olvida el registro) y `restaurarDesdeRecuperacion` (además
 * devuelve cada entrada a su valor original). Aquí se usa el segundo siempre,
 * también cuando la simulación va bien. Motivo: en modo compatible las
 * entradas se escriben **en el libro del usuario**, y la última iteración deja
 * en esas celdas un número aleatorio cualquiera. Terminar "con éxito" y dejar
 * el modelo con datos inventados es corromper el libro despacio (R5).
 *
 * **La restauración corre pase lo que pase.** Un fallo a mitad, una
 * cancelación o una excepción inesperada salen todos por el mismo `finally`.
 * Lo que un `finally` no cubre —que el proceso muera— lo cubre el registro de
 * recuperación, que vive en el archivo y sigue ahí al reabrir.
 */

import {
  medirRitmo,
  simularCompatible,
  type AvanceCompatible,
  type EntradaCompatible,
  type ResultadoCompatible,
} from '../engine/compatible/index.ts';
import { hayRecuperacionPendiente, iniciarProteccion, restaurarDesdeRecuperacion } from '../engine/modelo/guardian.ts';
import { cargarAlmacenGuardian } from './almacenGuardian.ts';
import { crearLibroCalculable } from './libroCalculable.ts';

/**
 * Iteraciones por viaje a Excel (F5b). Con 20, la hoja se repinta 20 veces
 * menos y se ahorran 19 de cada 20 viajes; más no compensa, porque el lote
 * entero se pierde si Excel falla a mitad y el progreso avanzaría a saltos.
 */
export const LOTE_COMPATIBLE = 20;

/** Modo de cálculo durante la simulación; ver `libroCalculable.ts`. */
const MODO_DURANTE = 'Manual';

export interface PeticionCompatible {
  entradas: readonly EntradaCompatible[];
  salidas: readonly string[];
  iteraciones: number;
  compresionTDigest?: number;
  cadaCuantas?: number;
  retenerMuestra?: number;
  nombresLogicos?: { verdadero: string; falso: string };
  /** No repintar la hoja en cada iteración (F5). */
  congelarPantalla?: boolean;
  progreso?: (avance: AvanceCompatible) => void;
  debeCancelar?: () => boolean;
}

export type RespuestaCompatible =
  | ResultadoCompatible
  | { ok: false; error: { iteracion: number; motivo: string }; recuperacionPendiente: true };

/**
 * Corre la simulación en modo compatible sobre el libro abierto.
 *
 * Si hay un registro de recuperación de una sesión anterior sin cerrar, **no
 * simula**: el panel tiene que resolverlo antes (ofrecer restaurar o
 * descartar), porque empezar encima perdería los valores originales de aquella
 * simulación interrumpida.
 */
export async function simularEnExcel(peticion: PeticionCompatible): Promise<RespuestaCompatible> {
  const refs = peticion.entradas.map((e) => e.direccion);

  return Excel.run(async (context) => {
    const almacen = await cargarAlmacenGuardian(context, refs);

    if (hayRecuperacionPendiente(almacen)) {
      return {
        ok: false as const,
        error: {
          iteracion: 0,
          motivo: 'Hay una simulación anterior sin cerrar. Restaura o descarta el libro antes de volver a simular.',
        },
        recuperacionPendiente: true as const,
      };
    }

    const proteccion = iniciarProteccion(almacen, refs, MODO_DURANTE);
    if (!proteccion.ok) return { ok: false as const, error: { iteracion: 0, motivo: proteccion.error } };
    await almacen.aplicar();

    try {
      const libro = crearLibroCalculable(context, refs, peticion.salidas, {
        congelarPantalla: peticion.congelarPantalla ?? false,
        categorias: peticion.entradas.map((e) => e.categorias),
      });
      return await simularCompatible({ libro, lote: LOTE_COMPATIBLE, ...peticion });
    } finally {
      restaurarDesdeRecuperacion(almacen);
      await almacen.aplicar();
    }
  });
}

/**
 * Cuánto va a tardar, medido sobre el libro real antes de comprometer al
 * usuario a una espera larga.
 *
 * Usa las mismas garantías que la simulación —cálculo manual, restauración al
 * salir— porque una medición también escribe en el libro. Que sean solo cinco
 * iteraciones no la hace menos peligrosa si el panel se cierra a mitad.
 */
export async function medirRitmoEnExcel(
  entradas: readonly EntradaCompatible[],
  salidas: readonly string[],
  iteracionesDePrueba = 5,
): Promise<{ ok: true; iteracionesPorSegundo: number; msPorIteracion: number } | { ok: false; motivo: string }> {
  const refs = entradas.map((e) => e.direccion);

  return Excel.run(async (context) => {
    const almacen = await cargarAlmacenGuardian(context, refs);
    if (hayRecuperacionPendiente(almacen)) {
      return { ok: false as const, motivo: 'Hay una simulación anterior sin cerrar.' };
    }

    const proteccion = iniciarProteccion(almacen, refs, MODO_DURANTE);
    if (!proteccion.ok) return { ok: false as const, motivo: proteccion.error };
    await almacen.aplicar();

    try {
      const libro = crearLibroCalculable(context, refs, salidas, { categorias: entradas.map((e) => e.categorias) });
      const medida = await medirRitmo(libro, entradas, iteracionesDePrueba, LOTE_COMPATIBLE);
      return { ok: true as const, ...medida };
    } finally {
      restaurarDesdeRecuperacion(almacen);
      await almacen.aplicar();
    }
  });
}
