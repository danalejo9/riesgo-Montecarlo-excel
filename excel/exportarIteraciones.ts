/**
 * Escribe las iteraciones de la simulación en la hoja «Iteraciones» (C3). La
 * hoja se rehace en cada exportación. Se escribe por tramos: 100.000 filas de
 * una vez no caben en una llamada a Excel.
 */

import { tablaIteraciones, type IteracionesSimuladas } from './iteraciones.ts';

export const HOJA_ITERACIONES = 'Iteraciones';
const FILAS_POR_TRAMO = 5_000;

export async function exportarIteraciones(it: IteracionesSimuladas, limite: number): Promise<{ hoja: string; filas: number }> {
  const t = tablaIteraciones(it, limite);
  const ancho = t.cabecera.length;
  return Excel.run(async (context) => {
    const previa = context.workbook.worksheets.getItemOrNullObject(HOJA_ITERACIONES);
    previa.load('isNullObject');
    await context.sync();
    if (!previa.isNullObject) {
      previa.delete();
      await context.sync();
    }
    const hoja = context.workbook.worksheets.add(HOJA_ITERACIONES);
    const cabecera = hoja.getRangeByIndexes(0, 0, 2, ancho);
    cabecera.values = [t.cabecera, t.refs];
    cabecera.format.font.bold = true;
    hoja.getRangeByIndexes(1, 0, 1, ancho).format.font.bold = false;
    hoja.getRangeByIndexes(1, 0, 1, ancho).format.font.color = '#666666';
    for (let desde = 0; desde < t.filas.length; desde += FILAS_POR_TRAMO) {
      const tramo = t.filas.slice(desde, desde + FILAS_POR_TRAMO);
      hoja.getRangeByIndexes(2 + desde, 0, tramo.length, ancho).values = tramo;
      await context.sync();
    }
    t.fechas.forEach((f, c) => {
      if (f && t.filas.length > 0) {
        hoja.getRangeByIndexes(2, c, t.filas.length, 1).numberFormat = Array.from({ length: t.filas.length }, () => ['dd/mm/yyyy']);
      }
    });
    hoja.freezePanes.freezeRows(2);
    hoja.getRangeByIndexes(0, 0, 2, ancho).format.autofitColumns();
    hoja.activate();
    await context.sync();
    return { hoja: HOJA_ITERACIONES, filas: t.filas.length };
  });
}
