/**
 * Enterarse de cuándo el usuario selecciona otra celda en la hoja (E6: saltar
 * en Resultados a la salida que se ha seleccionado).
 *
 * `workbook.onSelectionChanged` existe desde ExcelApi 1.2. Si no está (o
 * falla, como en el banco de pruebas), el panel sigue funcionando: saltar a la
 * salida es una comodidad.
 */

import { claveDesdeDireccion } from './direcciones.ts';

/** La clave canónica de una dirección, para comparar «Modelo!$C$32» con «Modelo!C32». */
export function claveComparable(direccion: string): string | undefined {
  return claveDesdeDireccion(direccion.replace(/\$/g, ''));
}

/**
 * Llama a `alCambiar` con la dirección de la nueva selección cada vez que
 * cambia. Devuelve la función que deja de escuchar.
 */
export async function escucharSeleccion(alCambiar: (direccion: string) => void): Promise<() => Promise<void>> {
  let manejador: OfficeExtension.EventHandlerResult<Excel.SelectionChangedEventArgs> | undefined;
  await Excel.run(async (context) => {
    manejador = context.workbook.onSelectionChanged.add(async () => {
      await Excel.run(async (ctx) => {
        const rango = ctx.workbook.getSelectedRange();
        rango.load('address');
        await ctx.sync();
        alCambiar(rango.address);
      });
    });
    await context.sync();
  });
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
