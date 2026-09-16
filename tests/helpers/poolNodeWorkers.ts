/**
 * Pool de `worker_threads` que implementa `EjecutorDeBloques`
 * (`engine/executor/tipos.ts`) — la prueba de que ese contrato sirve de
 * verdad para repartir bloques en hilos reales, no solo en teoría. Vive en
 * `tests/`: `engine/` no puede importar `worker_threads` (regla de oro de la
 * arquitectura), y este pool es un arnés de prueba, no el adaptador de
 * producción para el navegador (eso es trabajo de Fase 3, E3).
 *
 * Cada worker recibe una cola de trabajos, uno a la vez: se le da el
 * siguiente en cuanto responde al anterior. Es el patrón mínimo correcto
 * para no mezclar la respuesta de un trabajo con la promesa de otro cuando
 * hay más bloques que workers.
 */
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import type { Plan } from '../../engine/compiler/plan.ts';
import type { DefinicionEntrada } from '../../engine/executor/entradas.ts';
import type { EjecutorDeBloques, ResultadoBloque, Trabajo } from '../../engine/executor/tipos.ts';
import type { Grafo } from '../../engine/graph/graph.ts';

const RUTA_WORKER = fileURLToPath(new URL('./workerCalcularBloque.ts', import.meta.url));

export interface PoolDeWorkers {
  ejecutor: EjecutorDeBloques;
  cerrar: () => Promise<void>;
}

export function crearPoolDeWorkers(
  numWorkers: number,
  grafo: Grafo,
  plan: Plan,
  entradasResueltas: readonly DefinicionEntrada[],
  seed: number,
  compresionTDigest: number,
): PoolDeWorkers {
  const workers = Array.from(
    { length: numWorkers },
    () => new Worker(RUTA_WORKER, { execArgv: ['--experimental-strip-types', '--no-warnings'] }),
  );

  const ejecutor: EjecutorDeBloques = {
    ejecutar(trabajos: readonly Trabajo[]): Promise<ResultadoBloque[]> {
      if (trabajos.length === 0) return Promise.resolve([]);

      return new Promise((resolveTodos, rejectTodos) => {
        const resultados: ResultadoBloque[] = new Array(trabajos.length);
        let siguiente = 0;
        let pendientes = trabajos.length;

        const asignarSiguiente = (worker: Worker): void => {
          if (siguiente >= trabajos.length) return;
          const miIndice = siguiente++;
          const trabajo = trabajos[miIndice] as Trabajo;

          const alTerminar = (): void => {
            worker.off('message', alRecibirMensaje);
            worker.off('error', alFallar);
          };
          const alRecibirMensaje = (msg: { ok: true; parcial: ResultadoBloque } | { ok: false; error: { clave: string; motivo: string } }): void => {
            alTerminar();
            if (!msg.ok) {
              rejectTodos(new Error(`${msg.error.clave}: ${msg.error.motivo}`));
              return;
            }
            resultados[miIndice] = msg.parcial;
            pendientes--;
            if (pendientes === 0) resolveTodos(resultados);
            else asignarSiguiente(worker);
          };
          const alFallar = (error: Error): void => {
            alTerminar();
            rejectTodos(error);
          };

          worker.on('message', alRecibirMensaje);
          worker.on('error', alFallar);
          worker.postMessage({ grafo, plan, entradas: entradasResueltas, seed, bloque: trabajo, compresion: compresionTDigest });
        };

        for (const worker of workers) asignarSiguiente(worker);
      });
    },
  };

  const cerrar = async (): Promise<void> => {
    await Promise.all(workers.map((w) => w.terminate()));
  };

  return { ejecutor, cerrar };
}
