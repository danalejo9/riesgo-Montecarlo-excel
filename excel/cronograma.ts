/**
 * El cronograma en el libro (bloque P, P0–P1), con Office.js: lee las hojas
 * «Actividades» y «Calendario» y escribe la plantilla y el resultado. Todo lo
 * que decide qué se lee o qué se escribe está en `engine/cronograma/`, sin
 * Office.js; aquí solo se mueve entre el libro y esas funciones.
 */

import {
  HOJA_ACTIVIDADES, HOJA_CALENDARIO, HOJA_RIESGOS, FORMATO_FECHA, hojaResultadoCPM, plantillaActividades, plantillaCalendario,
  plantillaRiesgos, type HojaAEscribir, type ResultadoCPM,
} from '../engine/cronograma/index.ts';
import { serieDeDate } from '../engine/cronograma/calendario.ts';

async function valoresDeHoja(context: Excel.RequestContext, nombre: string): Promise<unknown[][] | undefined> {
  const hoja = context.workbook.worksheets.getItemOrNullObject(nombre);
  await context.sync();
  if (hoja.isNullObject) return undefined;
  // Desde A1, para que el número de fila de los mensajes sea el de Excel.
  const usado = hoja.getUsedRangeOrNullObject(true);
  usado.load('rowCount,columnCount,rowIndex,columnIndex');
  await context.sync();
  if (usado.isNullObject) return [];
  const rango = hoja.getRangeByIndexes(0, 0, usado.rowIndex + usado.rowCount, usado.columnIndex + usado.columnCount);
  rango.load('values');
  await context.sync();
  return rango.values as unknown[][];
}

export async function leerHojasCronograma(): Promise<{ actividades?: unknown[][]; calendario?: unknown[][]; riesgos?: unknown[][] }> {
  return Excel.run(async (context) => ({
    actividades: await valoresDeHoja(context, HOJA_ACTIVIDADES),
    calendario: await valoresDeHoja(context, HOJA_CALENDARIO),
    riesgos: await valoresDeHoja(context, HOJA_RIESGOS),
  }));
}

/** Escribe una hoja entera. `reemplazar`: si existe, se vacía; si no, no se toca y se devuelve `false`. */
async function escribirHoja(context: Excel.RequestContext, h: HojaAEscribir, reemplazar: boolean): Promise<boolean> {
  let hoja = context.workbook.worksheets.getItemOrNullObject(h.nombre);
  await context.sync();
  if (!hoja.isNullObject && !reemplazar) return false;
  if (hoja.isNullObject) hoja = context.workbook.worksheets.add(h.nombre);
  else {
    hoja.getRange().clear();
    hoja.charts.load('items');
    await context.sync();
    hoja.charts.items.forEach((c) => c.delete());
  }

  const ancho = Math.max(...h.valores.map((f) => f.length));
  const valores = h.valores.map((f) => [...f, ...new Array<string>(ancho - f.length).fill('')]);
  const datos = valores.length - h.primeraFilaDatos;
  // Los formatos antes que los valores: con «@» (texto) un ID «1» se queda
  // en texto; escrito primero, Excel lo convertiría en el número 1.
  for (const [col, formato] of Object.entries(h.formatos)) {
    if (datos > 0) hoja.getRangeByIndexes(h.primeraFilaDatos, Number(col), datos, 1).numberFormat = new Array(datos).fill([formato]);
  }
  hoja.getRangeByIndexes(0, 0, valores.length, ancho).values = valores;
  for (const z of h.formatosRango ?? []) {
    hoja.getRangeByIndexes(z.fila, z.col, z.filas, z.cols).numberFormat =
      Array.from({ length: z.filas }, () => new Array<string>(z.cols).fill(z.formato));
  }
  const encabezados = [h.filaEncabezado, ...(h.otrosEncabezados ?? [])].filter((f) => f >= 0);
  for (const f of encabezados) {
    const enc = hoja.getRangeByIndexes(f, 0, 1, ancho);
    enc.format.font.bold = true;
    enc.format.font.color = '#FFFFFF';
    enc.format.fill.color = '#1F4E79';
  }
  if (h.filaEncabezado >= 0 && !h.otrosEncabezados?.length) hoja.freezePanes.freezeRows(h.filaEncabezado + 1);
  for (const f of h.resaltar ?? []) hoja.getRangeByIndexes(f, 0, 1, ancho).format.fill.color = '#FFF2CC';
  if (h.grafico) {
    const g = h.grafico;
    const grafico = hoja.charts.add(Excel.ChartType.xyscatterLinesNoMarkers, hoja.getRangeByIndexes(g.fila, g.col, g.filas, 2), Excel.ChartSeriesBy.columns);
    grafico.title.text = g.titulo;
    grafico.legend.visible = false;
    grafico.setPosition(hoja.getRangeByIndexes(g.anclaFila, g.anclaCol, 1, 1), hoja.getRangeByIndexes(g.anclaFila + 16, g.anclaCol + 5, 1, 1));
  }
  hoja.getRange('A1').format.font.bold = true;
  h.anchos.forEach((w, i) => (hoja.getRangeByIndexes(0, i, 1, 1).format.columnWidth = w * 7));
  hoja.activate();
  await context.sync();
  return true;
}

/** Crea «Actividades» y «Calendario» si no existen. Devuelve las que creó. */
export async function escribirPlantillaCronograma(codigoMoneda?: string): Promise<string[]> {
  return Excel.run(async (context) => {
    const creadas: string[] = [];
    if (await escribirHoja(context, plantillaCalendario(serieDeDate(new Date())), false)) creadas.push(HOJA_CALENDARIO);
    if (await escribirHoja(context, plantillaRiesgos(), false)) creadas.push(HOJA_RIESGOS);
    if (await escribirHoja(context, plantillaActividades(codigoMoneda), false)) creadas.push(HOJA_ACTIVIDADES);
    await context.sync();
    return creadas;
  });
}

export async function escribirResultadoCPM(r: Extract<ResultadoCPM, { ok: true }>): Promise<string> {
  const h = hojaResultadoCPM(r);
  return Excel.run(async (context) => {
    await escribirHoja(context, h, true);
    const hoja = context.workbook.worksheets.getItem(h.nombre);
    hoja.getRange('B2').numberFormat = [[FORMATO_FECHA]];
    // Las críticas, en amarillo, como en «Esperado».
    r.filas.forEach((f, i) => {
      if (f.critica) hoja.getRangeByIndexes(h.primeraFilaDatos + i, 0, 1, 9).format.fill.color = '#FFF2CC';
    });
    await context.sync();
    return h.nombre;
  });
}

/** Escribe la hoja de la simulación del plazo (se rehace entera). */
export async function escribirHojaSimulacion(h: HojaAEscribir): Promise<string> {
  return Excel.run(async (context) => {
    await escribirHoja(context, h, true);
    return h.nombre;
  });
}
