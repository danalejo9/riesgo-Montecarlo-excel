/**
 * El modo del libro (B2): «Valores fijos» o «Aleatorio», guardado en el
 * libro, aplicado a las funciones `RIESGO.*` y reflejado en la cinta.
 *
 * Aplicarlo es: dejarlo en memoria (las funciones lo leen de ahí, runtime
 * compartido), guardarlo en `workbook.settings` y pedir un recálculo; como
 * las funciones son volátiles, todas vuelven a calcularse con el modo nuevo.
 * En la cinta, el botón del modo activo queda desactivado: así se ve en qué
 * modo está el libro sin abrir el panel.
 */

import { leerModoLibro, MODO_POR_DEFECTO, type ModoLibro } from '../engine/modelo/index.ts';
import { modoLibroEnMemoria, ponerModoLibroEnMemoria } from './modoLibroCompartido.ts';

export const CLAVE_MODO_LIBRO = 'riesgoMontecarlo.modoLibro';

export async function leerModoGuardado(): Promise<ModoLibro> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_MODO_LIBRO);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();
    return ajuste.isNullObject ? MODO_POR_DEFECTO : leerModoLibro(typeof ajuste.value === 'string' ? ajuste.value : JSON.stringify(ajuste.value));
  });
}

function iguales(a: ModoLibro, b: ModoLibro): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Aplica un modo. `guardar: false` al abrir el libro (ya estaba guardado);
 * el recálculo se salta si el modo no cambia lo que enseñan las funciones.
 */
export async function aplicarModo(m: ModoLibro, opciones: { guardar?: boolean } = {}): Promise<void> {
  const antes = modoLibroEnMemoria();
  ponerModoLibroEnMemoria(m);
  avisarCambio(m);
  void actualizarCinta(m);
  const recalcular = !iguales(antes, m) || m.modo === 'aleatorio';
  if (!recalcular && opciones.guardar === false) return;
  await Excel.run(async (context) => {
    if (opciones.guardar !== false) context.workbook.settings.add(CLAVE_MODO_LIBRO, JSON.stringify(m));
    if (recalcular) context.workbook.application.calculate(Excel.CalculationType.recalculate);
    await context.sync();
  });
}

/** El panel escucha este evento para enseñar el modo aunque cambie desde la cinta. */
function avisarCambio(m: ModoLibro): void {
  const g = globalThis as unknown as { dispatchEvent?: (e: unknown) => boolean };
  if (typeof g.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    g.dispatchEvent(new CustomEvent('riesgo:modo', { detail: m }));
  }
}

/** Desactiva en la cinta el botón del modo activo (RibbonApi 1.1). Si no se puede, no pasa nada. */
async function actualizarCinta(m: ModoLibro): Promise<void> {
  try {
    const ribbon = (Office as unknown as { ribbon?: { requestUpdate(u: unknown): Promise<void> } }).ribbon;
    if (!ribbon || !Office.context.requirements.isSetSupported('RibbonApi', '1.1')) return;
    await ribbon.requestUpdate({
      tabs: [{
        id: 'PestanaRiesgo',
        groups: [{
          id: 'GrupoModo',
          controls: [
            { id: 'btnFijo', enabled: m.modo !== 'fijo' },
            { id: 'btnAleatorio', enabled: m.modo !== 'aleatorio' },
          ],
        }],
      }],
    });
  } catch {
    // Una cinta que no se actualiza no estropea nada: el panel dice el modo.
  }
}
