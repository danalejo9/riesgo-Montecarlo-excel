/**
 * Lectura de la selección actual: la prueba más pequeña de que el panel y
 * Excel se están hablando de verdad.
 *
 * Es también el primer sitio donde aparece el patrón que va a gobernar todo el
 * adaptador: **pedir en lote y sincronizar una vez**. Cada `context.sync()` es
 * un viaje de ida y vuelta al proceso de Excel, y hacer uno por celda es
 * exactamente el error que cometía el motor heredado (§2.3 de la auditoría:
 * Excel dentro del bucle, cuatro órdenes de magnitud más lento). Aquí se
 * cargan todas las propiedades que hacen falta y se sincroniza al final.
 */

export interface SeleccionLeida {
  /** Dirección tal como la muestra Excel, p. ej. `Hoja1!B2:D10`. */
  direccion: string;
  hoja: string;
  filas: number;
  columnas: number;
  /** Las fórmulas de la selección, en su rejilla. Vacío donde no hay fórmula. */
  formulas: string[][];
  /** Cuántas celdas de la selección tienen de verdad una fórmula. */
  celdasConFormula: number;
}

export async function leerSeleccion(): Promise<SeleccionLeida> {
  return Excel.run(async (context) => {
    const rango = context.workbook.getSelectedRange();
    const hoja = rango.worksheet;

    // Todo lo que se necesita, pedido de una vez.
    rango.load(['address', 'rowCount', 'columnCount', 'formulas']);
    hoja.load('name');
    await context.sync();

    const formulas = rango.formulas as unknown[][];
    let celdasConFormula = 0;
    const comoTexto = formulas.map((fila) =>
      fila.map((celda) => {
        const s = typeof celda === 'string' ? celda : String(celda ?? '');
        if (s.startsWith('=')) celdasConFormula++;
        return s;
      }),
    );

    return {
      direccion: rango.address,
      hoja: hoja.name,
      filas: rango.rowCount,
      columnas: rango.columnCount,
      formulas: comoTexto,
      celdasConFormula,
    };
  });
}
