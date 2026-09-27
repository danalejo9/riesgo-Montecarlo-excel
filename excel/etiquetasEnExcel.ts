/**
 * Leer de Excel lo que hay alrededor de unas celdas y proponerles un nombre
 * legible (E5). Toda la lógica está en `nombreSugerido.ts`; aquí solo se pide
 * a Excel, en **un solo viaje** para todas las celdas, la franja de su
 * izquierda y la de encima.
 */

import { partirDireccion, esDireccionDirecta } from './direcciones.ts';
import { nombreSugerido, VECINOS_ARRIBA, VECINOS_IZQUIERDA, type Vecino } from './nombreSugerido.ts';

function columnaANumero(letras: string): number {
  return [...letras.toUpperCase()].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
}

/**
 * El nombre sugerido para cada referencia. Las que no son una celda suelta
 * (un nombre definido ya es legible) se devuelven tal cual.
 */
export async function leerNombresSugeridos(refs: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (refs.length === 0) return out;

  return Excel.run(async (context) => {
    const activa = context.workbook.worksheets.getActiveWorksheet();
    const pedidos: Array<{ ref: string; izq?: Excel.Range; arr?: Excel.Range }> = [];

    for (const ref of refs) {
      if (!esDireccionDirecta(ref)) {
        out.set(ref, ref);
        continue;
      }
      const { hoja, rango } = partirDireccion(ref);
      const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(rango);
      if (!m) {
        out.set(ref, ref);
        continue;
      }
      const col = columnaANumero(m[1] as string) - 1; // desde 0
      const fila = Number(m[2]) - 1;
      const ws = hoja ? context.workbook.worksheets.getItem(hoja) : activa;
      const nIzq = Math.min(col, VECINOS_IZQUIERDA);
      const nArr = Math.min(fila, VECINOS_ARRIBA);
      const izq = nIzq > 0 ? ws.getRangeByIndexes(fila, col - nIzq, 1, nIzq) : undefined;
      const arr = nArr > 0 ? ws.getRangeByIndexes(fila - nArr, col, nArr, 1) : undefined;
      izq?.load('values');
      arr?.load('values');
      pedidos.push({ ref, izq, arr });
    }

    await context.sync();

    for (const { ref, izq, arr } of pedidos) {
      // Excel devuelve la franja de izquierda a derecha y de arriba abajo: se
      // invierte para que la más cercana vaya primero.
      const izquierda = ((izq?.values?.[0] ?? []) as Vecino[]).slice().reverse();
      const arriba = ((arr?.values ?? []) as Vecino[][]).map((f) => f[0]).reverse();
      out.set(ref, nombreSugerido(ref, izquierda, arriba));
    }
    return out;
  });
}
