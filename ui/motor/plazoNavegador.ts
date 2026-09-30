/**
 * Los hilos de la simulación del plazo (P3b): tantos Web Workers como diga
 * la configuración de hilos del panel (`preferencias.ts`). Si el entorno no
 * deja crearlos, `null`, y la simulación va en el hilo del panel, como antes.
 */
import { crearEjecutorPlazo, type CanalPlazo } from '../../engine/cronograma/hiloPlazo.ts';

export function crearHilosPlazo(hilos: number): ReturnType<typeof crearEjecutorPlazo> | null {
  if (typeof Worker === 'undefined') return null;
  const canales: CanalPlazo[] = [];
  try {
    for (let i = 0; i < Math.max(1, Math.floor(hilos)); i++) {
      canales.push(new Worker(new URL('./workerPlazo.ts', import.meta.url), { type: 'module', name: `plazo-${i + 1}` }) as unknown as CanalPlazo);
    }
  } catch {
    for (const c of canales) c.terminate();
    return null;
  }
  return crearEjecutorPlazo(canales);
}
