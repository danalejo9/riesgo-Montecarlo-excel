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

/**
 * V1: el número que enseña ahora cada celda (o `null` si no enseña un
 * número), en un solo viaje. Se lee antes de simular: es el valor base, lo
 * que da la hoja sin incertidumbre.
 */
export async function leerNumeros(direcciones: readonly string[]): Promise<(number | null)[]> {
  if (direcciones.length === 0) return [];
  return Excel.run(async (context) => {
    const rangos = direcciones.map((d) => {
      const r = rangoDesdeDireccion(context, d);
      r.load('values');
      return r;
    });
    await context.sync();
    return rangos.map((r) => {
      const v = (r.values as unknown[][])[0]?.[0];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
  });
}
