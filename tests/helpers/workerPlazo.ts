/**
 * Un hilo real (`node:worker_threads`) de la simulación del plazo (P3b): el
 * mismo `crearAtendedorPlazo` que usa el Web Worker del panel. Para las
 * pruebas y el benchmark con varios hilos.
 */
import { parentPort } from 'node:worker_threads';

import { crearAtendedorPlazo, type PedidoTramo } from '../../engine/cronograma/hiloPlazo.ts';

const atender = crearAtendedorPlazo();
parentPort?.on('message', (p: PedidoTramo) => {
  const r = atender(p);
  parentPort?.postMessage(r.respuesta, r.transferibles);
});
