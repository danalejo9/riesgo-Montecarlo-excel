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
import { construirInforme, type SimulacionCompletada, type Zona } from './informe.ts';
import { rangoDesdeDireccion } from './rangos.ts';

export { construirInforme } from './informe.ts';

/**
 * El nombre de la hoja. Fijo y reconocible: si el usuario lo ve en la barra de
 * pestañas sabe qué es sin abrirla.
 */
export const HOJA_RESULTADOS = 'Riesgo Monte Carlo';

const AZUL = '#1F4E79';
const GRIS = '#666666';
/** Banda de cada salida: el mismo azul de los títulos, de fondo. */
const BANDA = '#1F4E79';
const COLUMNAS_BANDA = 15;


export interface VolcadoHecho {
  /** Cuántas filas ocupa el informe, para poder decirlo. */
  filas: number;
  hoja: string;
}

export async function volcarResultados(
  modelo: ModeloRiesgo,
  resultado: SimulacionCompletada,
): Promise<VolcadoHecho> {
  // C8: cada salida con el formato numérico de su celda de origen (€, %, miles).
  const formatos = await leerFormatos(resultado.salidas.map((s) => s.ref));
  const bloques = construirInforme(modelo, resultado, { formatoDe: (ref) => formatos.get(ref) });

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
    const ancho = bloques.anchos.length;
    const zona = (z: Zona) => hoja.getRangeByIndexes(z.fila, z.col, z.filas, z.cols);

    // Todo el cuerpo en una sola asignación.
    hoja.getRangeByIndexes(0, 0, bloques.filas.length, ancho).values = bloques.filas;

    for (const f of bloques.formatos) {
      zona(f).numberFormat = Array.from({ length: f.filas }, () => Array.from({ length: f.cols }, () => f.formato));
    }
    for (const fila of bloques.titulos) {
      const r = hoja.getRangeByIndexes(fila, 0, 1, ancho);
      r.format.font.bold = true;
      r.format.font.color = AZUL;
    }
    for (const fila of bloques.bandas) {
      const r = hoja.getRangeByIndexes(fila, 0, 1, COLUMNAS_BANDA);
      r.format.fill.color = BANDA;
      r.format.font.color = '#FFFFFF';
      r.format.font.bold = true;
    }
    for (const c of bloques.cabeceras) {
      const r = zona(c);
      r.format.font.bold = true;
      r.format.borders.getItem(Excel.BorderIndex.edgeBottom).style = Excel.BorderLineStyle.continuous;
    }
    for (const fila of bloques.tenues) {
      hoja.getRangeByIndexes(fila, 0, 1, 1).format.font.color = GRIS;
    }
    hoja.getRangeByIndexes(0, 0, 1, 1).format.font.size = 14;

    // Gráficos nativos de Excel junto a cada salida, sobre sus datos.
    for (const g of bloques.graficos) {
      const tipo = g.tipo === 'linea' || g.tipo === 'lineas-filas' ? Excel.ChartType.line
        : g.tipo === 'barras' ? Excel.ChartType.barClustered
        : Excel.ChartType.columnClustered;
      const grafico = hoja.charts.add(
        tipo,
        zona(g.datos),
        g.tipo === 'lineas-filas' ? Excel.ChartSeriesBy.rows : Excel.ChartSeriesBy.columns,
      );
      grafico.title.text = g.titulo;
      // La araña necesita leyenda: una línea por entrada.
      grafico.legend.visible = g.tipo === 'lineas-filas';
      grafico.setPosition(
        hoja.getRangeByIndexes(g.desde.fila, g.desde.col, 1, 1),
        hoja.getRangeByIndexes(g.hasta.fila, g.hasta.col, 1, 1),
      );
    }

    // Anchos fijos: con «autoajustar», una nota larga ensanchaba la columna A
    // hasta media pantalla (prueba L3 del usuario).
    bloques.anchos.forEach((caracteres, c) => {
      hoja.getRangeByIndexes(0, c, 1, 1).format.columnWidth = caracteres * 6.5;
    });
    hoja.freezePanes.freezeRows(0);
    hoja.activate();
    await context.sync();

    return { filas: bloques.filas.length, hoja: HOJA_RESULTADOS };
  });
}

/** El formato numérico de cada celda de salida, en un viaje. Si falla, ninguno. */
async function leerFormatos(refs: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    await Excel.run(async (context) => {
      const rangos = refs.map((ref) => {
        const r = rangoDesdeDireccion(context, ref);
        r.load('numberFormat');
        return { ref, r };
      });
      await context.sync();
      for (const { ref, r } of rangos) {
        const f = (r.numberFormat as unknown[][])?.[0]?.[0];
        if (typeof f === 'string') out.set(ref, f);
      }
    });
  } catch {
    // Sin formatos, el informe usa los suyos: no es motivo para no volcar.
  }
  return out;
}
