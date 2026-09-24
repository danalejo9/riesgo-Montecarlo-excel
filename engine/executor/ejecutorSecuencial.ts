/**
 * Ejecutor por defecto: calcula todos los bloques en este mismo hilo, uno
 * detrás de otro. Es lo que usan los tests (determinista, sin dependencias
 * de entorno) y lo que corre cuando no hay un pool de Web Workers disponible
 * — el resultado es idéntico al de cualquier pool paralelo, porque cada
 * bloque es una función pura de sus propios argumentos (`calcularBloque.ts`);
 * repartirlos en más o menos hilos no cambia ni un solo número.
 */
import type { Plan } from '../compiler/plan.ts';
import type { Grafo } from '../graph/graph.ts';
import { calcularBloque } from './calcularBloque.ts';
import type { DefinicionEntrada } from './entradas.ts';
import { ErrorCalculoBloque, type EjecutorDeBloques, type ResultadoBloque, type Trabajo } from './tipos.ts';

export function crearEjecutorSecuencial(
  grafo: Grafo,
  plan: Plan,
  entradasResueltas: readonly DefinicionEntrada[],
  seed: number,
  compresionTDigest: number,
  limiteMuestra = 0,
): EjecutorDeBloques {
  return {
    ejecutar(trabajos: readonly Trabajo[]): ResultadoBloque[] {
      return trabajos.map((trabajo) => {
        const r = calcularBloque(grafo, plan, entradasResueltas, seed, trabajo, compresionTDigest, limiteMuestra);
        if (!r.ok) throw new ErrorCalculoBloque(r.error.clave, r.error.motivo);
        return r.parcial;
      });
    },
  };
}
