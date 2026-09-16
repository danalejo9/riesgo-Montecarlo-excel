/**
 * Punto de entrada de un worker real (`node:worker_threads`), usado solo
 * para probar que la abstracción `EjecutorDeBloques` de `engine/executor/`
 * de verdad sirve para repartir bloques en paralelo — no solo en teoría.
 *
 * Vive en `tests/`, no en `engine/`: `engine/` no puede depender de
 * `worker_threads` (es una API de Node, prohibida por la regla de oro de la
 * arquitectura). El equivalente para el navegador es un `Worker` normal con
 * este mismo cuerpo; aquí basta con probar que el diseño soporta paralelismo
 * real, no construir el adaptador de producción, que le corresponde a la
 * integración con Excel (Fase 3, E3 en adelante).
 *
 * Se ejecuta con `--experimental-strip-types`: Node 22 puede cargar los
 * `.ts` del motor directamente, sin paso de compilación ni una dependencia
 * nueva del proyecto solo para este arnés de pruebas.
 */
import { parentPort } from 'node:worker_threads';

import { calcularBloque } from '../../engine/executor/calcularBloque.ts';
import type { DefinicionEntrada } from '../../engine/executor/entradas.ts';
import type { Bloque } from '../../engine/executor/bloques.ts';
import type { Plan } from '../../engine/compiler/plan.ts';
import type { Grafo } from '../../engine/graph/graph.ts';

interface MensajeEntrante {
  grafo: Grafo;
  plan: Plan;
  entradas: DefinicionEntrada[];
  seed: number;
  bloque: Bloque;
  compresion: number;
}

if (!parentPort) throw new Error('workerCalcularBloque.ts debe ejecutarse como worker_thread');

parentPort.on('message', (msg: MensajeEntrante) => {
  const resultado = calcularBloque(msg.grafo, msg.plan, msg.entradas, msg.seed, msg.bloque, msg.compresion);
  parentPort!.postMessage(resultado);
});
