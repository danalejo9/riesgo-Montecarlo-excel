/** Canales `worker_threads` para `crearEjecutorPlazo` (pruebas y benchmark). */
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { crearEjecutorPlazo, type CanalPlazo, type RespuestaTramo } from '../../engine/cronograma/hiloPlazo.ts';

const RUTA = fileURLToPath(new URL('./workerPlazo.ts', import.meta.url));

export function crearHilosPlazoNode(n: number): ReturnType<typeof crearEjecutorPlazo> {
  const canales: CanalPlazo[] = Array.from({ length: n }, () => {
    const w = new Worker(RUTA, { execArgv: ['--experimental-strip-types', '--no-warnings'] });
    const canal: CanalPlazo = {
      postMessage: (m) => w.postMessage(m),
      onmessage: null,
      terminate: () => void w.terminate(),
    };
    w.on('message', (data: RespuestaTramo) => canal.onmessage?.({ data }));
    return canal;
  });
  return crearEjecutorPlazo(canales);
}
