import { describe, expect, it, vi } from 'vitest';

import { escribirFragmento, type VentanaConHistoria } from '../ui/fragmento.ts';

describe('escribirFragmento', () => {
  it('no lanza cuando Office.js ha anulado replaceState (lo que dejaba el panel en blanco)', () => {
    const ventana = { history: { replaceState: null } };
    expect(() => escribirFragmento('modelo', ventana)).not.toThrow();
    expect(escribirFragmento('modelo', ventana)).toBe(false);
  });

  it('usa el replaceState guardado antes de cargar Office.js', () => {
    const original = vi.fn();
    const ventana = { history: { replaceState: null }, __replaceStateOriginal: original };
    expect(escribirFragmento('resultados', ventana)).toBe(true);
    expect(original).toHaveBeenCalledWith(null, '', '#resultados');
  });

  it('usa el del navegador si sigue existiendo', () => {
    const replaceState = vi.fn();
    const ventana = { history: { replaceState } };
    expect(escribirFragmento('configuracion', ventana)).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(null, '', '#configuracion');
  });

  it('se traga el error si replaceState lanza', () => {
    const ventana: VentanaConHistoria = { history: { replaceState: () => { throw new Error('x'); } } };
    expect(escribirFragmento('modelo', ventana)).toBe(false);
  });
});
