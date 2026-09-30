/**
 * Qué celdas del modelo tienen formato de fecha (T7): sus valores se enseñan
 * como fechas en los resultados. Se lee el `numberFormat` (código invariante)
 * de cada celda; si no se puede leer, se enseñan como números, sin más.
 */

import { esFormatoFecha } from '../engine/modelo/index.ts';
import { rangoDesdeDireccion } from './rangos.ts';

export async function celdasConFormatoFecha(direcciones: readonly string[]): Promise<Set<string>> {
  if (direcciones.length === 0) return new Set();
  return Excel.run(async (context) => {
    const rangos = direcciones.map((d) => {
      const r = rangoDesdeDireccion(context, d);
      r.load('numberFormat');
      return { d, r };
    });
    await context.sync();
    return new Set(rangos.filter(({ r }) => esFormatoFecha(String(r.numberFormat?.[0]?.[0] ?? ''))).map(({ d }) => d));
  });
}
