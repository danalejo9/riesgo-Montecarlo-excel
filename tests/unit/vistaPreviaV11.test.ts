/**
 * V11: la vista previa mientras se edita. El programador espera a que el
 * usuario deje de editar, nunca corre dos a la vez y repite si hubo cambios
 * durante una; las preferencias se leen con valores sanos.
 */
import { describe, expect, it, vi } from 'vitest';

import { Programador, VISTA_PREVIA_POR_DEFECTO, guardarVistaPrevia, leerVistaPrevia } from '../../ui/vistaPrevia.ts';

describe('programador de la vista previa (V11)', () => {
  it('espera la calma: tres cambios seguidos, una sola vista previa', async () => {
    vi.useFakeTimers();
    try {
      const tarea = vi.fn(async () => {});
      const p = new Programador(3000, tarea);
      p.avisar();
      await vi.advanceTimersByTimeAsync(2000);
      p.avisar();
      await vi.advanceTimersByTimeAsync(2000);
      p.avisar();
      expect(tarea).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3000);
      expect(tarea).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nunca dos a la vez: un cambio durante una vista previa la repite al terminar', async () => {
    vi.useFakeTimers();
    try {
      let enCurso = 0;
      let maximo = 0;
      let terminar: () => void = () => {};
      const tarea = vi.fn(() => new Promise<void>((ok) => {
        enCurso++;
        maximo = Math.max(maximo, enCurso);
        terminar = () => { enCurso--; ok(); };
      }));
      const p = new Programador(1000, tarea);
      void p.ahora();
      expect(tarea).toHaveBeenCalledTimes(1);
      p.avisar();
      await vi.advanceTimersByTimeAsync(1000);
      void p.ahora();
      expect(tarea).toHaveBeenCalledTimes(1); // la primera sigue corriendo
      terminar();
      await vi.advanceTimersByTimeAsync(0);
      expect(tarea).toHaveBeenCalledTimes(2); // una sola repetición por los dos avisos
      terminar();
      await vi.advanceTimersByTimeAsync(5000);
      expect(tarea).toHaveBeenCalledTimes(2);
      expect(maximo).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancelar: nada pendiente se lanza', async () => {
    vi.useFakeTimers();
    try {
      const tarea = vi.fn(async () => {});
      const p = new Programador(1000, tarea);
      p.avisar();
      p.cancelar();
      await vi.advanceTimersByTimeAsync(5000);
      expect(tarea).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('preferencias de la vista previa (V11)', () => {
  it('sin almacenamiento, las de por defecto (apagada, 1.000 iteraciones, 3 s)', () => {
    expect(leerVistaPrevia()).toEqual(VISTA_PREVIA_POR_DEFECTO);
    expect(VISTA_PREVIA_POR_DEFECTO).toEqual({ activa: false, iteraciones: 1000, espera: 3 });
  });

  it('con almacenamiento: se guardan y los valores raros se corrigen', () => {
    const datos = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => datos.set(k, v) });
    try {
      guardarVistaPrevia({ activa: true, iteraciones: 2000, espera: 10 });
      expect(leerVistaPrevia()).toEqual({ activa: true, iteraciones: 2000, espera: 10 });
      datos.set('riesgoMontecarlo.vistaPreviaPlazo', JSON.stringify({ activa: 'sí', iteraciones: 1e9, espera: -1 }));
      expect(leerVistaPrevia()).toEqual(VISTA_PREVIA_POR_DEFECTO);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
