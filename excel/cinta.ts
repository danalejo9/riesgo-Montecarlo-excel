/**
 * La cinta reorganizada (U3.2): las cantidades del menú «Iteraciones» y cómo
 * se marca la actual. La cinta de un complemento no puede cambiar el texto de
 * un botón, así que la opción activa se **desactiva** (como el modo del libro,
 * B2). Si esta versión de Excel no deja actualizar los elementos de un menú,
 * no pasa nada: el panel dice las iteraciones.
 */

export const ITERACIONES_CINTA = [1000, 5000, 10000, 50000, 100000] as const;

/** Qué elementos del menú quedan activos con `n` iteraciones (todos menos el de `n`). */
export function estadoMenuIteraciones(n: number): { id: string; enabled: boolean }[] {
  return ITERACIONES_CINTA.map((k) => ({ id: `iter${k}`, enabled: k !== n }));
}

export async function actualizarCintaIteraciones(n: number): Promise<void> {
  try {
    const office = (globalThis as unknown as { Office?: { ribbon?: { requestUpdate(u: unknown): Promise<void> }; context?: { requirements?: { isSetSupported(s: string, v: string): boolean } } } }).Office;
    if (!office?.ribbon || !office.context?.requirements?.isSetSupported('RibbonApi', '1.1')) return;
    await office.ribbon.requestUpdate({
      tabs: [{ id: 'PestanaRiesgo', groups: [{ id: 'GrupoSimulacion', controls: estadoMenuIteraciones(n) }] }],
    });
  } catch {
    // Sin poder marcarla, la cinta sigue funcionando: cada opción pone su cantidad.
  }
}
