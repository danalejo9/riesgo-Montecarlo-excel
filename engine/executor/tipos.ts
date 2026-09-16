import type { TDigest } from '../stats/tdigest.ts';
import type { EstadoWelford } from '../stats/welford.ts';
import type { Bloque } from './bloques.ts';

/** Estadísticas parciales de una salida, calculadas sobre un único bloque. */
export interface ParcialSalida {
  welford: EstadoWelford;
  digest: TDigest;
}

/** clave de celda de salida -> su parcial en un bloque concreto. */
export type ResultadoBloque = Map<string, ParcialSalida>;

/**
 * Unidad de trabajo que se le puede pedir a un ejecutor: solo el rango de
 * iteraciones. Todo lo demás (grafo, plan, entradas) ya lo tiene el ejecutor
 * de antemano — es lo que permite que un pool de Web Workers reciba miles de
 * estos mensajes sin repetir el modelo completo en cada uno.
 */
export type Trabajo = Bloque;

/**
 * Contrato que cumple tanto el ejecutor secuencial en este mismo hilo
 * (`ejecutorSecuencial.ts`, el que usan los tests y el que corre si no hay
 * pool disponible) como un pool real de Web Workers / `worker_threads`: dado
 * un lote de trabajos, calcula el resultado parcial de cada uno. `engine/`
 * solo conoce esta interfaz — quién reparte los bloques y cómo (un hilo, un
 * pool en el navegador) es una decisión de la capa que lo usa, no del motor.
 */
export interface EjecutorDeBloques {
  ejecutar(trabajos: readonly Trabajo[]): Promise<ResultadoBloque[]> | ResultadoBloque[];
}

/**
 * Un ejecutor lanza esto (en vez de devolver un resultado de error) cuando
 * un bloque no se pudo calcular — función no soportada, referencia rota, lo
 * que sea que reporte `ejecutarPlan`. Es una excepción, no un valor de
 * retorno, porque una vez que el plan compiló, fallar calculando un bloque es
 * excepcional: si el primer bloque falla, van a fallar todos por la misma
 * razón, y `simularPorBloques` corta ahí en vez de seguir troceando.
 */
export class ErrorCalculoBloque extends Error {
  readonly clave: string;
  readonly motivo: string;

  constructor(clave: string, motivo: string) {
    super(`${clave}: ${motivo}`);
    this.name = 'ErrorCalculoBloque';
    this.clave = clave;
    this.motivo = motivo;
  }
}
