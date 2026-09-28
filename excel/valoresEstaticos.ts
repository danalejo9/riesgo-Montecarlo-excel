/**
 * De lo que lee Excel a lo que entiende el grafo.
 *
 * `leerLibro` separa las celdas con fórmula de las que solo tienen un valor, y
 * hasta ahora las segundas **no llegaban al motor**: `construirGrafo` solo
 * recibía fórmulas, y una celda sin fórmula se evaluaba como vacía. En un
 * libro de juguete daba igual —las constantes están dentro de las fórmulas—
 * pero en un modelo real los datos están en celdas y las fórmulas los
 * referencian, así que la mitad del modelo valía cero sin decirlo.
 *
 * Esta función es el puente. Traduce los cuatro tipos que distingue el lector
 * a los del canal de valores, que son los cinco de Excel. El quinto, vacío, no
 * aparece: una celda vacía no genera ningún `ValorEstatico`, y en el grafo
 * queda como lo que es.
 */

import type { ValorCelda } from '../engine/graph/index.ts';
import { ERROR, LOGICO, NUMERO, TEXTO, type ValorEscalar } from '../engine/values/index.ts';
import type { ErrorExcel } from '../engine/parser/index.ts';
import type { ValorEstatico } from './tiposLectura.ts';

/**
 * Los errores de Excel, tal como los devuelve Office.js en `values`. La
 * comparación es con el texto en inglés porque Office.js devuelve la cadena
 * localizada en `values`... y por eso **no se compara con una lista**: lo que
 * no se reconozca se queda como `#VALUE!`, que es el error genérico, en vez de
 * fingir un tipo concreto. Un libro es-ES devuelve `#¡DIV/0!`, y acertar con
 * todos los idiomas de Office no es algo que se pueda hacer a ciegas.
 *
 * **Hueco conocido y deliberado**: la distinción entre errores solo importa
 * para `ESERR`/`ESERROR` y para propagar el código exacto. Una celda de datos
 * con un error suele ser un problema del libro, no algo que el modelo quiera
 * distinguir. Cuando haya un Excel delante se puede leer `valueTypes` y el
 * texto real y cerrar esto con datos en vez de con suposiciones.
 */
const ERRORES: Record<string, ErrorExcel> = {
  '#NULL!': '#NULL!',
  '#DIV/0!': '#DIV/0!',
  '#VALUE!': '#VALUE!',
  '#REF!': '#REF!',
  '#NAME?': '#NAME?',
  '#NUM!': '#NUM!',
  '#N/A': '#N/A',
};

export function aValorCelda(v: ValorEstatico): ValorCelda {
  return { hoja: v.hoja, col: v.col, fila: v.fila, valor: aValorEscalar(v) };
}

export function aValorEscalar(v: ValorEstatico): ValorEscalar {
  switch (v.tipo) {
    case 'numero':
      return { tipo: NUMERO, numero: v.numero ?? NaN };
    case 'logico':
      return { tipo: LOGICO, numero: v.numero ?? 0 };
    case 'texto':
      return { tipo: TEXTO, texto: v.texto ?? '' };
    case 'error':
      return { tipo: ERROR, error: ERRORES[(v.texto ?? '').toUpperCase()] ?? '#VALUE!' };
  }
}
