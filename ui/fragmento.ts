/**
 * Escribir la pestaña visible en el fragmento de la URL sin disparar
 * "hashchange".
 *
 * Dentro de Excel, Office.js **anula** `history.replaceState` y
 * `history.pushState` (los deja en `null`). Llamarlos lanza un error que, al
 * ocurrir al montar el panel, lo dejaba en blanco. `taskpane.html` guarda el
 * original en `window.__replaceStateOriginal` antes de cargar Office.js; aquí
 * se usa ese, o el del navegador si sigue existiendo, y si no hay ninguno no
 * se hace nada: recordar la pestaña es una comodidad, no puede romper el panel.
 */

type ReplaceState = (data: unknown, unused: string, url?: string) => void;

/** Lo mínimo de `window` que hace falta (sin depender de los tipos del DOM, para poder probarlo en Node). */
export interface VentanaConHistoria {
  __replaceStateOriginal?: ReplaceState;
  history?: { replaceState?: ReplaceState | null };
}

export function escribirFragmento(fragmento: string, ventana: VentanaConHistoria = globalThis as VentanaConHistoria): boolean {
  const original = ventana.__replaceStateOriginal;
  const historia = ventana.history;
  const actual = historia?.replaceState;
  const reemplazar = typeof original === 'function'
    ? original
    : typeof actual === 'function' ? actual.bind(historia) : null;
  if (!reemplazar) return false;
  try {
    reemplazar(null, '', `#${fragmento}`);
    return true;
  } catch {
    return false;
  }
}
