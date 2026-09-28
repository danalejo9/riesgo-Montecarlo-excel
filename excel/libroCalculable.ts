/**
 * El adaptador de Office.js del modo compatible: la implementación real de
 * `LibroCalculable`.
 *
 * Todo el bucle, la cancelación, el ritmo medido y las estadísticas viven en
 * `engine/compatible/`, probados sin Excel. Aquí solo queda lo que de verdad
 * necesita a Excel, y está escrito alrededor de una única regla:
 *
 * > **Una iteración = un `context.sync()`.**
 *
 * Escribir las entradas, recalcular y leer las salidas son tres cosas que
 * Office.js sabe encolar y resolver en un solo viaje. Hacer un `sync()` por
 * cada una triplicaría el coste de la simulación entera — y en modo
 * compatible el coste *es* el viaje, no el cálculo. Por eso `calcularIteracion`
 * es un único método en la interfaz y por eso los rangos se resuelven **una
 * vez**, antes del bucle, en vez de en cada iteración.
 *
 * Dos detalles que no son opcionales:
 *
 * - **Cálculo manual durante la simulación.** En automático, Excel recalcula
 *   al escribir cada celda de entrada: con cinco entradas serían cinco
 *   recálculos completos del libro por iteración en vez de uno. Lo pone el
 *   guardián (`engine/modelo/guardian.ts`), que también lo deja como estaba
 *   al terminar; aquí se asume ya puesto.
 * - **`recalculate`, no `full`.** Recalcular en profundidad el libro entero
 *   en cada iteración tira a la basura la cadena de dependencias que Excel
 *   mantiene. `recalculate` recalcula lo que depende de lo que cambió, que es
 *   exactamente el trabajo necesario.
 *
 * **Lo que no es un número.** Una salida puede dar `#¡DIV/0!`, un texto o un
 * vacío en algunas iteraciones. Aquí se traduce a `NaN` y el bucle del motor
 * las cuenta aparte (`noNumericas`) en vez de envenenar las estadísticas.
 */

import type { LibroCalculable } from '../engine/compatible/index.ts';
import { rangoDesdeDireccion } from './rangos.ts';

/**
 * Un `LibroCalculable` atado a un contexto de Excel vivo y a unas celdas
 * concretas.
 *
 * El contexto se recibe en vez de crearse: el que llama decide el alcance
 * (normalmente un único `Excel.run` que envuelve la simulación entera), y así
 * el adaptador no puede quedarse con un contexto muerto.
 */
export function crearLibroCalculable(
  context: Excel.RequestContext,
  direccionesEntrada: readonly string[],
  direccionesSalida: readonly string[],
  opciones: { congelarPantalla?: boolean } = {},
): LibroCalculable {
  // F5: como `ScreenUpdating = False` en VBA. Existe desde ExcelApi 1.9; la
  // documentación avisa de que llamarlo en bucle puede hacer parpadear la
  // ventana en algunas versiones, por eso es una opción que se puede quitar.
  const congelar = Boolean(opciones.congelarPantalla) &&
    typeof Office !== 'undefined' && Office.context?.requirements?.isSetSupported?.('ExcelApi', '1.9') === true;
  // Resueltos una sola vez: dentro del bucle, volver a pedirlos añadiría
  // trabajo por iteración sin cambiar nada.
  const entradas = direccionesEntrada.map((d) => rangoDesdeDireccion(context, d));
  const salidas = direccionesSalida.map((d) => rangoDesdeDireccion(context, d));
  const nSalidas = salidas.length;

  return {
    async calcularIteracion(valoresDeEntrada) {
      for (let i = 0; i < entradas.length; i++) {
        (entradas[i] as Excel.Range).values = [[valoresDeEntrada[i] as number]];
      }

      const app = context.workbook.application;
      if (congelar && typeof app.suspendScreenUpdatingUntilNextSync === 'function') app.suspendScreenUpdatingUntilNextSync();
      app.calculate(Excel.CalculationType.recalculate);

      for (const salida of salidas) salida.load(['values', 'valueTypes']);

      await context.sync();

      const leidas = new Array<number>(nSalidas);
      for (let i = 0; i < nSalidas; i++) leidas[i] = aNumero(salidas[i] as Excel.Range);
      return leidas;
    },
  };
}

/**
 * La primera celda de un rango de salida como número, o `NaN` si no lo es.
 *
 * Se mira `valueTypes` y no solo `values` porque Excel devuelve el error como
 * la cadena `"#¡DIV/0!"` —localizada, además—, y compararla con una lista de
 * textos sería frágil en cuanto cambie el idioma del usuario. El tipo no
 * depende del idioma.
 *
 * Un lógico sí se convierte (1 y 0), como haría Excel en cualquier operación
 * aritmética. Un texto numérico **no**: el motor rápido tampoco lo hace al
 * leer una celda, y que los dos modos difieran ahí sería peor que perder una
 * iteración rara.
 */
function aNumero(rango: Excel.Range): number {
  const tipo = (rango.valueTypes as unknown[][])?.[0]?.[0];
  const valor = (rango.values as unknown[][])?.[0]?.[0];

  if (tipo === Excel.RangeValueType.double || tipo === Excel.RangeValueType.integer) {
    return typeof valor === 'number' ? valor : NaN;
  }
  if (tipo === Excel.RangeValueType.boolean) return valor === true ? 1 : 0;
  return NaN;
}
