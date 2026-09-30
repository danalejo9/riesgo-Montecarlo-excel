/**
 * Enterarse de que el usuario edita las hojas del cronograma (V11: la vista
 * previa). `worksheets.onChanged` existe desde ExcelApi 1.9; si no está, la
 * vista previa se actualiza solo con «Calcular cronograma».
 */

import { HOJA_ACTIVIDADES, HOJA_CALENDARIO, HOJA_CALENDARIOS, HOJA_CLIMA, HOJA_HITOS, HOJA_RIESGOS } from '../engine/cronograma/index.ts';

export const HOJAS_ENTRADA_CRONOGRAMA = new Set([HOJA_ACTIVIDADES, HOJA_CALENDARIO, HOJA_CALENDARIOS, HOJA_RIESGOS, HOJA_CLIMA, HOJA_HITOS]);

/** Llama a `alCambiar` cuando cambia alguna hoja de entrada. Devuelve cómo dejar de escuchar, o `null` si Excel no avisa. */
export async function escucharCambiosCronograma(alCambiar: (hoja: string) => void): Promise<(() => Promise<void>) | null> {
  let manejador: OfficeExtension.EventHandlerResult<Excel.WorksheetChangedEventArgs> | undefined;
  try {
    await Excel.run(async (context) => {
      const hojas = context.workbook.worksheets as Excel.WorksheetCollection & { onChanged?: Excel.WorksheetCollection['onChanged'] };
      if (!hojas.onChanged) return;
      manejador = hojas.onChanged.add(async (e) => {
        await Excel.run(async (ctx) => {
          const h = ctx.workbook.worksheets.getItem(e.worksheetId);
          h.load('name');
          await ctx.sync();
          if (HOJAS_ENTRADA_CRONOGRAMA.has(h.name)) alCambiar(h.name);
        });
      });
      await context.sync();
    });
  } catch {
    return null;
  }
  if (!manejador) return null;
  return async () => {
    if (!manejador) return;
    const m = manejador;
    manejador = undefined;
    await Excel.run(m.context, async (ctx) => {
      m.remove();
      await ctx.sync();
    });
  };
}
