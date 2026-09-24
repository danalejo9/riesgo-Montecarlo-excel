/**
 * Escribir los resultados en una hoja del libro.
 *
 * Hasta ahora una simulación vivía solo en el panel y se perdía al cerrarlo.
 * En el modo compatible eso significa tirar cinco minutos de espera; en
 * cualquier modo significa que un análisis de riesgo terminado **no se puede
 * guardar, imprimir ni enviar a nadie**, que es exactamente lo que se hace con
 * un análisis terminado.
 *
 * ---
 *
 * **Se escriben los datos, no una imagen.** Los puntos de la curva van a la
 * hoja como dos columnas de números y el gráfico se crea como un gráfico
 * **nativo de Excel** sobre ellos. Así el usuario puede cambiarle el formato,
 * copiarlo a PowerPoint, o rehacer el gráfico a su gusto — cosas que una
 * captura del panel no permite. Es la misma razón por la que el informe
 * incluye el modelo entero: quien reciba el libro dentro de un año tiene que
 * poder saber de dónde salieron esos números.
 *
 * **La hoja se reemplaza, no se acumula.** Simular diez veces no debe dejar
 * diez hojas. La hoja lleva un nombre fijo y se rehace entera; la fecha y hora
 * de la cabecera dicen a qué ejecución corresponde. Si alguien quiere
 * conservar una, la renombra y la siguiente simulación no la toca.
 *
 * **Un `sync()` por bloque, no por celda.** Todo el informe son unas pocas
 * asignaciones de rangos completos.
 */

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { construirInforme, type SimulacionCompletada } from './informe.ts';

export { construirInforme } from './informe.ts';

/**
 * El nombre de la hoja. Fijo y reconocible: si el usuario lo ve en la barra de
 * pestañas sabe qué es sin abrirla.
 */
export const HOJA_RESULTADOS = 'Riesgo Monte Carlo';

const AZUL = '#1F4E79';
const GRIS = '#666666';


export interface VolcadoHecho {
  /** Cuántas filas ocupa el informe, para poder decirlo. */
  filas: number;
  hoja: string;
}

export async function volcarResultados(
  modelo: ModeloRiesgo,
  resultado: SimulacionCompletada,
): Promise<VolcadoHecho> {
  const bloques = construirInforme(modelo, resultado);

  return Excel.run(async (context) => {
    // Rehacer la hoja entera es más simple y más predecible que actualizar
    // celdas sueltas: el informe anterior puede tener otro número de salidas.
    const previa = context.workbook.worksheets.getItemOrNullObject(HOJA_RESULTADOS);
    previa.load('isNullObject');
    await context.sync();
    if (!previa.isNullObject) {
      previa.delete();
      await context.sync();
    }

    const hoja = context.workbook.worksheets.add(HOJA_RESULTADOS);

    // Todas las filas de una vez: una sola asignación de rango para el cuerpo
    // del informe, en vez de una por bloque.
    const ancho = bloques.filas.reduce((m, f) => Math.max(m, f.length), 1);
    const rejilla = bloques.filas.map((f) => {
      const fila: (string | number | boolean)[] = [...f];
      while (fila.length < ancho) fila.push('');
      return fila;
    });

    const cuerpo = hoja.getRangeByIndexes(0, 0, rejilla.length, ancho);
    cuerpo.values = rejilla;

    for (const fila of bloques.titulos) {
      const r = hoja.getRangeByIndexes(fila, 0, 1, ancho);
      r.format.font.bold = true;
      r.format.font.color = AZUL;
    }
    for (const fila of bloques.tenues) {
      hoja.getRangeByIndexes(fila, 0, 1, ancho).format.font.color = GRIS;
    }
    hoja.getRangeByIndexes(0, 0, 1, 1).format.font.size = 14;

    // Un gráfico nativo por salida, sobre los puntos que acaban de escribirse.
    for (const curva of bloques.curvas) {
      const datos = hoja.getRangeByIndexes(curva.filaInicio, 0, curva.puntos, 2);
      const grafico = hoja.charts.add(Excel.ChartType.line, datos, Excel.ChartSeriesBy.columns);
      grafico.title.text = `${curva.nombre} — probabilidad acumulada`;
      // `setPosition` espera celdas, no índices: se le da un rango a la
      // derecha de los datos para que el gráfico no tape la tabla.
      grafico.setPosition(
        hoja.getRangeByIndexes(curva.filaInicio, 3, 1, 1),
        hoja.getRangeByIndexes(curva.filaInicio + 15, 10, 1, 1),
      );
      grafico.legend.visible = false;
    }

    hoja.getUsedRange().format.autofitColumns();
    hoja.activate();
    await context.sync();

    return { filas: rejilla.length, hoja: HOJA_RESULTADOS };
  });
}
