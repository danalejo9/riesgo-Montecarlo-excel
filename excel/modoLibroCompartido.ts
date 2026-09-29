/**
 * El modo del libro (B2) en memoria, compartido por el panel y las funciones
 * `RIESGO.*` a través de `globalThis` (runtime compartido, B1: son la misma
 * página pero dos paquetes). Sin Office.js: va también en `funciones.js`.
 */

import { MODO_POR_DEFECTO, type ModoLibro } from '../engine/modelo/valorFijo.ts';

interface Compartido {
  __riesgoModoLibro?: ModoLibro;
}
const compartido = globalThis as unknown as Compartido;

export function modoLibroEnMemoria(): ModoLibro {
  return compartido.__riesgoModoLibro ?? MODO_POR_DEFECTO;
}

export function ponerModoLibroEnMemoria(m: ModoLibro): void {
  compartido.__riesgoModoLibro = m;
}

/**
 * B1b: una simulación con Excel en el bucle en curso. Las celdas cuya función
 * RIESGO no se puede sustituir por un número (dentro de una operación, o con
 * parámetros que cambian) conservan su fórmula, y su función devuelve en cada
 * iteración el sorteo que le toca: el mismo que usaría el motor rápido.
 *
 * - `muestra`: el valor ya sorteado (función dentro de una operación).
 * - `uniforme`: un uniforme (0,1); la función lo pasa por el cuantil de su
 *   distribución con los argumentos que Excel acaba de calcular.
 */
export interface SorteoEnCelda {
  tipo: 'muestra' | 'uniforme';
  muestras: ArrayLike<number>;
  categorias?: readonly string[];
}

export interface SimulacionEnExcel {
  iteracion: number;
  /** Por dirección normalizada (`normalizarDireccion`). */
  porCelda: Map<string, SorteoEnCelda>;
}

interface CompartidoSimulacion {
  __riesgoSimulacionEnExcel?: SimulacionEnExcel | null;
}
const enCurso = globalThis as unknown as CompartidoSimulacion;

export function simulacionEnExcel(): SimulacionEnExcel | null {
  return enCurso.__riesgoSimulacionEnExcel ?? null;
}

export function empezarSimulacionEnExcel(porCelda: Map<string, SorteoEnCelda>): SimulacionEnExcel {
  const s = { iteracion: 0, porCelda };
  enCurso.__riesgoSimulacionEnExcel = s;
  return s;
}

export function terminarSimulacionEnExcel(): void {
  enCurso.__riesgoSimulacionEnExcel = null;
}
