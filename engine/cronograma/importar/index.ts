export * from './comun.ts';
export * from './mspdi.ts';
export * from './xer.ts';

import { textoDeArchivo, type CronogramaImportado } from './comun.ts';
import { leerMspdi } from './mspdi.ts';
import { leerXer } from './xer.ts';

/** Elige el lector por el nombre y el contenido del archivo. */
export function importarCronograma(nombre: string, bytes: Uint8Array): CronogramaImportado {
  const ext = nombre.toLowerCase().split('.').pop() ?? '';
  if (ext === 'mpp') {
    throw new Error('Los archivos .mpp no se pueden leer desde un complemento de Excel. En MS Project: Archivo → Guardar como → «Formato XML (*.xml)», e importa ese archivo.');
  }
  if (ext === 'xer') return leerXer(textoDeArchivo(bytes));
  const texto = textoDeArchivo(bytes);
  if (texto.startsWith('ERMHDR')) return leerXer(texto);
  if (/<Project[\s>]/.test(texto)) return leerMspdi(texto);
  throw new Error('No se reconoce el archivo: importa un XML de MS Project o un XER de Primavera P6.');
}
