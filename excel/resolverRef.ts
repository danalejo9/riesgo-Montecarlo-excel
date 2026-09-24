/**
 * `resolverRef`: de lo que el modelo guarda a lo que el motor entiende.
 *
 * `prepararEntradas` (`engine/modelo/`) lleva desde E3 esperando esta función
 * inyectada. El motor trabaja con claves de celda (`Hoja1!B7`); el modelo
 * guarda **referencias**, que pueden ser una dirección o un nombre definido
 * (`Tasa_descuento`). Traducir lo segundo exige preguntarle a Excel.
 *
 * ---
 *
 * **Por qué el modelo prefiere nombres definidos.** Una dirección se rompe en
 * cuanto el usuario inserta una fila: `B7` pasa a ser `B8` y el modelo
 * apuntaría a la celda equivocada **sin dar ningún error**, que es la peor
 * forma de romperse. Un nombre definido lo mueve Excel solo. El complemento
 * admite las dos cosas —obligar a nombrar celdas antes de poder simular sería
 * una barrera absurda— pero el panel debería empujar hacia el nombre, y esta
 * es la pieza que hace que dé igual cuál se use.
 *
 * Mismo patrón que `almacenGuardian.ts`: una lectura en lote al cargar y un
 * resolutor síncrono después, porque `prepararEntradas` es puro y no puede
 * esperar a un `await` por celda.
 */

import { claveDesdeDireccion, esDireccionDirecta } from './direcciones.ts';

export interface ResolucionRefs {
  /** La función que espera `prepararEntradas`. Lanza si la ref no se resolvió. */
  resolver: (ref: string) => string;
  /** Refs que no se pudieron resolver, con el motivo, para enseñarlas juntas. */
  sinResolver: Array<{ ref: string; motivo: string }>;
}

/**
 * Resuelve todas las referencias de un modelo en **un solo viaje** a Excel.
 *
 * Las que ya son direcciones se resuelven aquí sin preguntar nada; solo los
 * nombres definidos cuestan. Un nombre que apunte a un rango de varias celdas
 * no vale como entrada ni como salida: se recoge en `sinResolver` con esas
 * palabras, en vez de tomar su primera celda y simular algo que el usuario no
 * ha pedido.
 */
export async function cargarResolverRef(refs: readonly string[]): Promise<ResolucionRefs> {
  return Excel.run(async (context) => {
    const hojaActiva = context.workbook.worksheets.getActiveWorksheet();
    hojaActiva.load('name');

    const nombres = refs.filter((r) => !esDireccionDirecta(r));
    const pedidos = nombres.map((ref) => {
      const item = context.workbook.names.getItemOrNullObject(ref);
      item.load('isNullObject');
      const rango = item.getRangeOrNullObject();
      rango.load(['address', 'isNullObject', 'cellCount']);
      return { ref, rango };
    });

    await context.sync();

    const claves = new Map<string, string>();
    const sinResolver: Array<{ ref: string; motivo: string }> = [];

    for (const ref of refs) {
      if (!esDireccionDirecta(ref)) continue;
      const clave = claveDesdeDireccion(ref, hojaActiva.name);
      if (clave) claves.set(ref, clave);
      else sinResolver.push({ ref, motivo: 'no nombra una sola celda' });
    }

    for (const { ref, rango } of pedidos) {
      if (rango.isNullObject) {
        sinResolver.push({ ref, motivo: 'no existe ningún nombre definido así en este libro' });
        continue;
      }
      if (rango.cellCount !== 1) {
        sinResolver.push({ ref, motivo: `abarca ${rango.cellCount} celdas; tiene que ser una sola` });
        continue;
      }
      const clave = claveDesdeDireccion(rango.address, hojaActiva.name);
      if (clave) claves.set(ref, clave);
      else sinResolver.push({ ref, motivo: `apunta a ${rango.address}, que no es una celda suelta` });
    }

    return {
      sinResolver,
      resolver: (ref: string) => {
        const clave = claves.get(ref);
        // Esto no es un caso de usuario: quien llama debió mirar `sinResolver`
        // antes de simular. Lanzar es lo correcto — devolver una clave
        // inventada simularía sobre la celda equivocada.
        if (!clave) throw new Error(`Referencia sin resolver: ${ref}`);
        return clave;
      },
    };
  });
}
