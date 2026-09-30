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

/** Activa o desactiva controles del grupo Simulación (RibbonApi 1.1). Si no se puede, no pasa nada. */
async function actualizarSimulacion(controles: { id: string; enabled: boolean }[]): Promise<void> {
  try {
    const office = (globalThis as unknown as { Office?: { ribbon?: { requestUpdate(u: unknown): Promise<void> }; context?: { requirements?: { isSetSupported(s: string, v: string): boolean } } } }).Office;
    if (!office?.ribbon || !office.context?.requirements?.isSetSupported('RibbonApi', '1.1')) return;
    await office.ribbon.requestUpdate({ tabs: [{ id: 'PestanaRiesgo', groups: [{ id: 'GrupoSimulacion', controls: controles }] }] });
  } catch {
    // Sin poder actualizarla, la cinta sigue funcionando: el panel dice lo mismo.
  }
}

export async function actualizarCintaIteraciones(n: number): Promise<void> {
  await actualizarSimulacion(estadoMenuIteraciones(n));
}

/** U3.6: mientras simula, Simular se desactiva y Detener se activa (y al revés). */
export function estadoSimulando(simulando: boolean): { id: string; enabled: boolean }[] {
  return [{ id: 'btnSimular', enabled: !simulando }, { id: 'btnDetener', enabled: simulando }];
}

export async function actualizarCintaSimulando(simulando: boolean): Promise<void> {
  await actualizarSimulacion(estadoSimulando(simulando));
}
