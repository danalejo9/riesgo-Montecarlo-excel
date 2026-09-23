/**
 * Lectura del libro entero: de Excel al grafo del motor.
 *
 * Es la pieza que convierte "puedo leer una celda" en "puedo leer tu modelo",
 * y la que decide si el complemento sirve para libros de verdad. El libro de
 * referencia del usuario tiene **132 hojas y 95.317 celdas con contenido**, así
 * que hacerlo ingenuamente no es una ineficiencia: es la diferencia entre dos
 * segundos y quedarse sin memoria.
 *
 * ---
 *
 * **Las tres decisiones que gobiernan este archivo.**
 *
 * 1. **Un `sync()` por lote de hojas, no por hoja.** Cada sincronización es un
 *    viaje de ida y vuelta al proceso de Excel. Con 132 hojas, uno por hoja
 *    son 132 viajes; en lotes de `HOJAS_POR_LOTE` son nueve. Pedirlo todo de
 *    una vez sería aún menos viajes, pero obligaría a tener las 132 matrices
 *    de datos vivas a la vez, y ahí es donde se agota la memoria. El lote es
 *    el punto medio, y está en una constante para poder moverlo con un dato
 *    delante en vez de con una intuición.
 *
 * 2. **Se lee el rango usado, no la hoja entera.** `getUsedRange` acota al
 *    rectángulo que Excel considera ocupado. Sigue siendo mayor que el número
 *    de celdas llenas —una hoja con datos en A1 y en Z5000 tiene un rango
 *    usado de 130.000 celdas—, pero es el único acotamiento que Excel ofrece
 *    barato. Las celdas vacías de dentro se descartan aquí y no llegan al
 *    grafo.
 *
 * 3. **Se leen `formulas` y `valueTypes`, no `values`.** Los tipos de valor de
 *    Excel (`Empty`, `String`, `Double`, `Boolean`, `Error`) son exactamente
 *    los cinco del canal de valores del motor, así que la frontera encaja sin
 *    adivinar nada: una celda vacía llega como vacía y no como cero, que es la
 *    distinción que costó rehacer medio motor.
 *
 * **Hueco conocido**: una hoja oculta o muy dispersa puede tener un rango
 * usado enorme y casi vacío. Se cuenta cuántas celdas se han recorrido para
 * poder verlo en el informe, pero no hay todavía una estrategia mejor que
 * leerlo. Si aparece un libro real donde eso duela, el siguiente paso es
 * `getSpecialCells(ExcelScript.SpecialCellType.formulas)`, que devuelve solo
 * las celdas con fórmula.
 */

import type { FormulaCelda } from '../engine/graph/index.ts';
import type { LibroLeido, OpcionesLectura, ValorEstatico } from './tiposLectura.ts';

export type { EstadisticasLectura, LibroLeido, OpcionesLectura, ValorEstatico } from './tiposLectura.ts';

/**
 * Cuántas hojas se piden antes de cada sincronización. Nueve viajes para 132
 * hojas, sin tener las 132 matrices vivas a la vez.
 */
const HOJAS_POR_LOTE = 16;

/** Traduce el tipo de valor de Excel al vocabulario del motor. */
function traducirTipo(tipo: string): ValorEstatico['tipo'] | 'vacio' {
  switch (tipo) {
    case 'Double':
    case 'Integer':
      return 'numero';
    case 'String':
      return 'texto';
    case 'Boolean':
      return 'logico';
    case 'Error':
      return 'error';
    default:
      // 'Empty' y cualquier tipo que Excel añada en el futuro: no participa.
      return 'vacio';
  }
}

export async function leerLibro(opciones: OpcionesLectura = {}): Promise<LibroLeido> {
  const arranque = performance.now();
  const formulas: FormulaCelda[] = [];
  const valores: ValorEstatico[] = [];

  let celdasRecorridas = 0;
  let celdasConContenido = 0;
  let sincronizaciones = 0;
  let hojasVisibles = 0;

  const resultado = await Excel.run(async (context) => {
    const hojas = context.workbook.worksheets;
    hojas.load('items/name,items/visibility');
    await context.sync();
    sincronizaciones++;

    const candidatas = hojas.items.filter(
      (h) => opciones.incluirOcultas === true || h.visibility === Excel.SheetVisibility.visible,
    );
    hojasVisibles = candidatas.length;

    for (let inicio = 0; inicio < candidatas.length; inicio += HOJAS_POR_LOTE) {
      const lote = candidatas.slice(inicio, inicio + HOJAS_POR_LOTE);

      // `valuesOnly: false` en getUsedRange incluye las celdas con formato
      // pero sin valor; se pide `true` para acotar a lo que de verdad tiene
      // contenido y no arrastrar columnas enteras solo por estar coloreadas.
      const rangos = lote.map((hoja) => {
        const r = hoja.getUsedRangeOrNullObject(true);
        r.load(['formulas', 'valueTypes', 'rowIndex', 'columnIndex', 'rowCount', 'columnCount']);
        return { nombre: hoja.name, rango: r };
      });

      await context.sync();
      sincronizaciones++;

      for (const { nombre, rango } of rangos) {
        if (rango.isNullObject) continue; // hoja vacía

        const celdasFormula = rango.formulas as unknown[][];
        const tipos = rango.valueTypes as unknown[][];
        const filaBase = rango.rowIndex;
        const colBase = rango.columnIndex;

        for (let f = 0; f < celdasFormula.length; f++) {
          const filaFormulas = celdasFormula[f] as unknown[];
          const filaTipos = tipos[f] as unknown[];

          for (let c = 0; c < filaFormulas.length; c++) {
            celdasRecorridas++;

            const tipoExcel = traducirTipo(String(filaTipos[c] ?? 'Empty'));
            const crudo = filaFormulas[c];
            const texto = typeof crudo === 'string' ? crudo : '';

            // Las coordenadas del motor empiezan en 1; las de Office, en 0.
            const col = colBase + c + 1;
            const fila = filaBase + f + 1;

            if (texto.startsWith('=')) {
              celdasConContenido++;
              formulas.push({ hoja: nombre, col, fila, formula: texto.slice(1) });
              continue;
            }

            if (tipoExcel === 'vacio') continue;
            celdasConContenido++;

            if (tipoExcel === 'numero') {
              valores.push({ hoja: nombre, col, fila, tipo: 'numero', numero: Number(crudo) });
            } else if (tipoExcel === 'logico') {
              valores.push({
                hoja: nombre, col, fila, tipo: 'logico',
                numero: crudo === true || crudo === 'TRUE' || crudo === 'VERDADERO' ? 1 : 0,
              });
            } else {
              valores.push({ hoja: nombre, col, fila, tipo: tipoExcel, texto: String(crudo) });
            }
          }
        }
      }

      opciones.progreso?.(Math.min(inicio + HOJAS_POR_LOTE, candidatas.length), candidatas.length);
    }

    return hojas.items.length;
  });

  return {
    formulas,
    valores,
    estadisticas: {
      hojas: resultado,
      hojasVisibles,
      celdasRecorridas,
      celdasConContenido,
      formulas: formulas.length,
      sincronizaciones,
      milisegundos: Math.round(performance.now() - arranque),
    },
  };
}
