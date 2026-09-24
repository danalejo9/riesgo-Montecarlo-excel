/**
 * Los hilos del panel: un pool de Web Workers para el motor rápido.
 *
 * Por qué importa: sin hilos, el motor corre en el mismo hilo que dibuja el
 * panel, así que el panel se congela mientras simula —ni la barra de progreso
 * ni el botón de cancelar responden— y solo se usa un núcleo del equipo. Con
 * hilos, el panel sigue vivo y el cálculo se reparte.
 *
 * Se deja **un núcleo libre** para Excel y el propio panel, y se limita a
 * ocho: más allá, en un portátil, el calor frena más de lo que suma.
 *
 * Si el entorno no deja crear workers (un Excel muy antiguo, una política de
 * seguridad), se devuelve `null` y el motor calcula en el hilo del panel,
 * como antes. Nunca se queda nadie sin simulación por esto.
 */
import { crearPool, type CanalHilo, type ContextoHilo, type Pool } from '../../engine/executor/pool.ts';

export function hilosDisponibles(): number {
  const nucleos = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(8, nucleos - 1));
}

export function crearPoolNavegador(contexto: ContextoHilo): Pool | null {
  if (typeof Worker === 'undefined') return null;
  const n = hilosDisponibles();
  const canales: CanalHilo[] = [];
  try {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./workerBloques.ts', import.meta.url), { type: 'module', name: `calculo-${i + 1}` });
      canales.push(w as unknown as CanalHilo);
    }
  } catch {
    for (const c of canales) c.terminate();
    return null;
  }
  return crearPool(canales, contexto);
}
