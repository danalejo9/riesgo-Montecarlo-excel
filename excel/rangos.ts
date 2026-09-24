/**
 * El puente de una dirección de texto al rango de Office.js.
 *
 * Está separado de `direcciones.ts` a propósito: partir y componer
 * `Hoja!Rango` es lógica de texto pura, que se prueba en Node con los
 * nombres de hoja raros que traen los libros reales. En cuanto un archivo
 * nombra el tipo `Excel.Range` deja de poder compilarse con el proyecto del
 * motor, y arrastrar los globales de Office a los tests solo para probar un
 * parser sería pagar mucho por poco.
 */

import { partirDireccion } from './direcciones.ts';

/**
 * El rango que corresponde a una dirección. No sincroniza: el rango devuelto
 * es una promesa de Excel que solo se materializa en el siguiente
 * `context.sync()`, y esa es justamente la propiedad que permite resolver
 * decenas de direcciones y pagar un único viaje.
 *
 * Una dirección sin hoja se resuelve contra la hoja activa, que es lo que
 * hace Excel cuando el usuario escribe `B7` en un cuadro de diálogo.
 */
export function rangoDesdeDireccion(context: Excel.RequestContext, direccion: string): Excel.Range {
  const { hoja, rango } = partirDireccion(direccion);
  const hojas = context.workbook.worksheets;
  const destino = hoja === undefined ? hojas.getActiveWorksheet() : hojas.getItem(hoja);
  return destino.getRange(rango);
}
