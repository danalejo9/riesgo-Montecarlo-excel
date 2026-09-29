/**
 * Pintar en la hoja las celdas que forman parte del modelo.
 *
 * Sin esto, el modelo solo existe en el panel: el usuario marca `C5` como
 * entrada, cierra el panel, y la hoja no tiene ni idea. Volver dos días
 * después y no saber qué celdas estaban marcadas es la forma más rápida de
 * dejar de fiarse de una herramienta.
 *
 * ---
 *
 * **Se pinta el relleno, y se guarda el que había.** Cambiar el formato del
 * libro de alguien no es gratis (R5: nunca corromper el libro del usuario), y
 * un resaltado que no se puede quitar es peor que no tenerlo. Antes de pintar
 * una celda se guarda su color de relleno anterior en `workbook.settings`, con
 * el propio libro, de modo que se puede restaurar aunque el panel se cierre,
 * la sesión muera o el archivo se abra en otro ordenador. Quitar el resaltado
 * deja la celda **exactamente** como estaba, incluido "sin relleno", que no es
 * lo mismo que blanco.
 *
 * **No se tocan los bordes ni la fuente.** Son la parte del formato donde más
 * trabajo tiene puesto el usuario —cuadros, subrayados de totales— y
 * restaurarlos fielmente exige guardar ocho propiedades por celda. El relleno
 * se ve igual de bien y es una sola.
 *
 * **Los colores son los del oficio.** En modelización financiera hay un
 * convenio de décadas: los datos de entrada se marcan en amarillo y los
 * resultados en verde. Quien haya hecho un modelo antes lo reconoce sin que se
 * lo expliquen.
 */

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { direccionPintable } from './direcciones.ts';
import { rangoDesdeDireccion } from './rangos.ts';

/** Amarillo suave: el color de siempre de una celda de supuestos. */
export const COLOR_ENTRADA = '#FFF2CC';
/** Verde suave, el de un resultado calculado. */
export const COLOR_SALIDA = '#E2EFDA';
/**
 * Melocotón suave: una celda con una función `RIESGO.*` (E8). Es una entrada,
 * pero declarada en la fórmula y no en el panel; el usuario pidió distinguirla.
 */
export const COLOR_RIESGO = '#FCE4D6';

/**
 * Las celdas con funciones `RIESGO.*` que afectan al modelo. Solo se conocen al
 * simular (hay que leer el libro), así que el panel las apunta aquí tras cada
 * simulación y cada resaltado posterior las incluye.
 */
let celdasRiesgo: readonly string[] = [];

export function recordarCeldasRiesgo(refs: readonly string[]): void {
  celdasRiesgo = [...refs];
}

/**
 * Dónde se guarda el formato anterior de cada celda pintada, dentro del libro.
 * Con prefijo, como todo lo nuestro: los ajustes son un espacio de nombres
 * compartido con cualquier otro complemento que haya tocado el archivo.
 */
export const CLAVE_RELLENOS = 'riesgoMontecarlo.fills';

/**
 * Referencia → color que tenía antes. La cadena vacía significa **sin
 * relleno**, que no es lo mismo que blanco: una celda sin relleno deja ver el
 * color de la fila alterna de una tabla, y una blanca no.
 */
type RellenosPrevios = Record<string, string>;

/**
 * Lo guardado y, en el mismo viaje, las hojas que existen hoy: una dirección
 * de una hoja borrada o renombrada no se toca (Excel daría `ItemNotFound` y
 * no se pintaría nada), y se olvida.
 */
async function leerPrevios(context: Excel.RequestContext): Promise<{ previos: RellenosPrevios; pintable: (ref: string) => boolean }> {
  const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_RELLENOS);
  ajuste.load(['value', 'isNullObject']);
  const hojas = context.workbook.worksheets;
  hojas.load('items/name');
  await context.sync();

  const nombres = hojas.items.map((h) => h.name);
  const pintable = (ref: string) => direccionPintable(ref, nombres);
  if (ajuste.isNullObject) return { previos: {}, pintable };
  try {
    const dato: unknown = JSON.parse(typeof ajuste.value === 'string' ? ajuste.value : '{}');
    const previos = typeof dato === 'object' && dato !== null ? (dato as RellenosPrevios) : {};
    for (const ref of Object.keys(previos)) if (!pintable(ref)) delete previos[ref];
    return { previos, pintable };
  } catch {
    // Un ajuste corrupto no puede dejar sin complemento a nadie: se pierde la
    // memoria del formato anterior, que es un mal menor frente a no arrancar.
    return { previos: {}, pintable };
  }
}

function guardarPrevios(context: Excel.RequestContext, previos: RellenosPrevios): void {
  context.workbook.settings.add(CLAVE_RELLENOS, JSON.stringify(previos));
}

/**
 * Deja la hoja reflejando el modelo: las entradas en amarillo, las salidas en
 * verde, y sin rastro en las celdas que ya no están en el modelo.
 *
 * Es idempotente: se puede llamar después de cada cambio del modelo, que es
 * justo como la usa el panel. Las celdas que siguen marcadas no se vuelven a
 * guardar —si no, la segunda llamada guardaría el amarillo como "el color que
 * había antes" y el resaltado se volvería permanente—.
 */
export async function aplicarResaltado(modelo: ModeloRiesgo): Promise<void> {
  const deseado = new Map<string, string>();
  // Primero las RIESGO: si una celda está también en el panel, manda el panel.
  for (const ref of celdasRiesgo) deseado.set(ref, COLOR_RIESGO);
  for (const e of modelo.inputs) deseado.set(e.ref, COLOR_ENTRADA);
  for (const s of modelo.outputs) deseado.set(s.ref, COLOR_SALIDA);

  await Excel.run(async (context) => {
    const { previos, pintable } = await leerPrevios(context);
    for (const ref of [...deseado.keys()]) if (!pintable(ref)) deseado.delete(ref);

    // 1. Quitar el resaltado de lo que ya no está en el modelo.
    for (const ref of Object.keys(previos)) {
      if (deseado.has(ref)) continue;
      restaurar(context, ref, previos[ref] as string);
      delete previos[ref];
    }

    // 2. Leer el relleno actual de las celdas nuevas, en un solo viaje.
    const nuevas = [...deseado.keys()].filter((ref) => !(ref in previos));
    const rangos = nuevas.map((ref) => {
      const rango = rangoDesdeDireccion(context, ref);
      rango.format.fill.load('color');
      return { ref, rango };
    });
    await context.sync();

    for (const { ref, rango } of rangos) {
      // Office.js devuelve `#FFFFFF` tanto para el blanco explícito como para
      // "sin relleno" en algunas versiones, así que el blanco se guarda como
      // "sin relleno": restaurar de más un blanco es invisible, y restaurar de
      // menos deja una celda pintada para siempre.
      const color = rango.format.fill.color;
      previos[ref] = !color || color.toUpperCase() === '#FFFFFF' ? '' : color;
    }

    // 3. Pintar todo lo deseado (también lo que ya estaba: cuesta lo mismo y
    //    repara un resaltado que alguien haya borrado a mano).
    for (const [ref, color] of deseado) {
      rangoDesdeDireccion(context, ref).format.fill.color = color;
    }

    guardarPrevios(context, previos);
    await context.sync();
  });
}

/**
 * Quita todo el resaltado y deja las celdas como estaban.
 *
 * Es lo que corre al desinstalar el modelo, y lo que el usuario puede pulsar
 * cuando quiera su hoja limpia para imprimir o enseñar.
 */
export async function quitarResaltado(): Promise<void> {
  await Excel.run(async (context) => {
    const { previos } = await leerPrevios(context);
    for (const [ref, color] of Object.entries(previos)) restaurar(context, ref, color);

    context.workbook.settings.add(CLAVE_RELLENOS, JSON.stringify({}));
    await context.sync();
  });
}

/** Devuelve una celda a su relleno anterior; cadena vacía = sin relleno. */
function restaurar(context: Excel.RequestContext, ref: string, color: string): void {
  const relleno = rangoDesdeDireccion(context, ref).format.fill;
  if (color === '') relleno.clear();
  else relleno.color = color;
}
