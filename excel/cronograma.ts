/**
 * El cronograma en el libro (bloque P, P0–P1), con Office.js: lee las hojas
 * «Actividades» y «Calendario» y escribe la plantilla y el resultado. Todo lo
 * que decide qué se lee o qué se escribe está en `engine/cronograma/`, sin
 * Office.js; aquí solo se mueve entre el libro y esas funciones.
 */

import {
  HOJA_ACTIVIDADES, HOJA_CALENDARIO, HOJA_RIESGOS, FORMATO_FECHA, hojaResultadoCPM, plantillaActividades, plantillaCalendario,
  plantillaRiesgos, HOJA_GANTT, hojaActividadesDe, hojaCalendarioDe, HOJA_SEGUIMIENTO, HOJA_RANGOS_TIPO, plantillaRangosTipo,
  HOJA_CALENDARIOS, hojaCalendarios, HOJA_CLIMA, plantillaClima,
  type CronogramaImportado, type HojaAEscribir, type HojaGantt, type ResultadoCPM,
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

export async function leerHojasCronograma(): Promise<{
  actividades?: unknown[][]; calendario?: unknown[][]; riesgos?: unknown[][]; seguimiento?: unknown[][]; rangosTipo?: unknown[][]; calendarios?: unknown[][]; clima?: unknown[][];
}> {
  return Excel.run(async (context) => ({
    actividades: await valoresDeHoja(context, HOJA_ACTIVIDADES),
    calendario: await valoresDeHoja(context, HOJA_CALENDARIO),
    riesgos: await valoresDeHoja(context, HOJA_RIESGOS),
    seguimiento: await valoresDeHoja(context, HOJA_SEGUIMIENTO),
    rangosTipo: await valoresDeHoja(context, HOJA_RANGOS_TIPO),
    calendarios: await valoresDeHoja(context, HOJA_CALENDARIOS),
    clima: await valoresDeHoja(context, HOJA_CLIMA),
  }));
}

/** V6: crea la hoja «Rangos por tipo» con la biblioteca de partida. `false` si ya existía (no se toca). */
export async function escribirPlantillaRangosTipo(): Promise<boolean> {
  return Excel.run(async (context) => escribirHoja(context, plantillaRangosTipo(), false));
}

/** V5: la hoja «Cronograma (seguimiento)» tal como está (para añadirle una instantánea). */
export async function leerHojaSeguimiento(): Promise<unknown[][] | undefined> {
  return Excel.run((context) => valoresDeHoja(context, HOJA_SEGUIMIENTO));
}

/** V5: reescribe «Cronograma (seguimiento)» entera (las instantáneas y el gráfico de tendencia). */
export async function escribirHojaSeguimiento(h: HojaAEscribir): Promise<string> {
  return Excel.run(async (context) => {
    await escribirHoja(context, h, true);
    return h.nombre;
  });
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
  for (const g of h.graficos ?? []) {
    const tipo = g.tipo === 'puntos' ? Excel.ChartType.xyscatter : Excel.ChartType.xyscatterLinesNoMarkers;
    const series = g.series ?? 1;
    const grafico = hoja.charts.add(tipo, hoja.getRangeByIndexes(g.fila, g.col, g.filas, 1 + series), Excel.ChartSeriesBy.columns);
    grafico.title.text = g.titulo;
    grafico.legend.visible = series > 1 && g.encabezado === true;
    // V5: fechas en los ejes (ExcelApi 1.8); sin ella, el eje enseña números de serie, que es lo de antes.
    if ((g.formatoX || g.formatoY) && typeof Office !== 'undefined' && Office.context?.requirements?.isSetSupported('ExcelApi', '1.8')) {
      // `axes` falta en el banco de pruebas (su Excel falso no tiene ejes).
      const ejes = grafico.axes as Excel.ChartAxes | undefined;
      if (ejes && g.formatoX) ejes.categoryAxis.numberFormat = g.formatoX;
      if (ejes && g.formatoY) ejes.valueAxis.numberFormat = g.formatoY;
    }
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
    if (await escribirHoja(context, hojaCalendarios(), false)) creadas.push(HOJA_CALENDARIOS);
    if (await escribirHoja(context, plantillaClima(), false)) creadas.push(HOJA_CLIMA);
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
      if (f.critica) hoja.getRangeByIndexes(h.primeraFilaDatos + i, 0, 1, 10).format.fill.color = '#FFF2CC';
    });
    await context.sync();
    return h.nombre;
  });
}

/** Escribe la hoja de la simulación del plazo (se rehace entera) y, si se da, la de «Plazo simulado». */
export async function escribirHojaSimulacion(h: HojaAEscribir, plazo?: HojaAEscribir): Promise<string> {
  return Excel.run(async (context) => {
    if (plazo) await escribirHoja(context, plazo, true);
    await escribirHoja(context, h, true);
    return h.nombre;
  });
}

/**
 * La hoja «Cronograma (Gantt)» (P3c): las columnas fijas, la línea de tiempo
 * con una columna por día, semana o mes, y cada barra como un tramo de
 * celdas coloreadas. Un tramo por barra y otro por franja: pocas llamadas
 * aunque el cronograma sea grande.
 */
export async function escribirHojaGantt(h: HojaGantt): Promise<string> {
  return Excel.run(async (context) => {
    let hoja = context.workbook.worksheets.getItemOrNullObject(HOJA_GANTT);
    await context.sync();
    if (hoja.isNullObject) hoja = context.workbook.worksheets.add(HOJA_GANTT);
    else hoja.getRange().clear();

    const ancho = Math.max(...h.valores.map((f) => f.length));
    const valores = h.valores.map((f) => [...f, ...new Array<string>(ancho - f.length).fill('')]);
    const nDatos = valores.length - h.filaEncabezado - 1;
    const nTiempo = ancho - h.primeraColTiempo;
    // Formatos antes que valores: el ID como texto (ver `escribirHoja`).
    if (nDatos > 0) {
      hoja.getRangeByIndexes(h.filaEncabezado + 1, 0, nDatos, 1).numberFormat = new Array(nDatos).fill(['@']);
      hoja.getRangeByIndexes(h.filaEncabezado + 1, 3, nDatos, 2).numberFormat = new Array(nDatos).fill([FORMATO_FECHA, FORMATO_FECHA]);
      if (h.valores[h.filaEncabezado]?.[6] === 'Crítica en') hoja.getRangeByIndexes(h.filaEncabezado + 1, 6, nDatos, 1).numberFormat = new Array(nDatos).fill(['0%']);
    }
    const formatoEje = h.escala === 'dia' ? 'd' : h.escala === 'semana' ? 'dd/mm' : 'mmm yy';
    if (nTiempo > 0) hoja.getRangeByIndexes(h.filaEncabezado, h.primeraColTiempo, 1, nTiempo).numberFormat = [new Array<string>(nTiempo).fill(formatoEje)];
    hoja.getRangeByIndexes(0, 0, valores.length, ancho).values = valores;

    const enc = hoja.getRangeByIndexes(h.filaEncabezado, 0, 1, ancho);
    enc.format.font.bold = true;
    enc.format.font.color = '#FFFFFF';
    enc.format.fill.color = '#1F4E79';
    hoja.getRange('A1').format.font.bold = true;
    for (const t of h.tramos) hoja.getRangeByIndexes(t.fila, t.col, 1, t.cols).format.fill.color = t.color;
    if (nTiempo > 0 && nDatos > 0) {
      const tiempo = hoja.getRangeByIndexes(h.filaEncabezado + 1, h.primeraColTiempo, nDatos, nTiempo);
      tiempo.format.horizontalAlignment = 'Center';
    }
    for (const m of h.marcas) {
      const col = hoja.getRangeByIndexes(h.filaEncabezado, m.col, nDatos + 1, 1);
      const borde = col.format.borders.getItem('EdgeRight');
      borde.style = 'Continuous';
      borde.color = m.color;
      borde.weight = 'Thick';
      hoja.getRangeByIndexes(h.filaEncabezado - 1, m.col, 1, 1).values = [[m.texto]];
    }
    const anchos = [6, 30, 16, 11, 11, 8, 10];
    anchos.forEach((w, i) => (hoja.getRangeByIndexes(0, i, 1, 1).format.columnWidth = w * 7));
    const anchoTiempo = h.escala === 'dia' ? 3 : h.escala === 'semana' ? 5.5 : 6.5;
    if (nTiempo > 0) hoja.getRangeByIndexes(0, h.primeraColTiempo, 1, nTiempo).format.columnWidth = anchoTiempo * 7;
    hoja.freezePanes.freezeAt(hoja.getRangeByIndexes(0, 0, h.filaEncabezado + 1, 2));
    hoja.activate();
    await context.sync();
    return HOJA_GANTT;
  });
}

/**
 * P4: escribe un cronograma importado en «Actividades» y «Calendario»,
 * reemplazándolas. «Riesgos de plazo» no se toca.
 */
export async function escribirCronogramaImportado(imp: CronogramaImportado, codigoMoneda?: string): Promise<void> {
  await Excel.run(async (context) => {
    await escribirHoja(context, hojaCalendarioDe(imp.cronograma), true);
    // V7: los calendarios de las tareas que no usan el del proyecto.
    if (imp.cronograma.calendarios && Object.keys(imp.cronograma.calendarios).length > 0) {
      await escribirHoja(context, hojaCalendarios(imp.cronograma.calendarios, imp.cronograma.calendario), true);
    }
    await escribirHoja(context, hojaActividadesDe(imp.cronograma, `Cronograma importado de ${imp.fuente}: ${imp.proyecto}. Añade mínimo, más probable y máximo para simular.`, codigoMoneda), true);
  });
}

/** Escribe celdas sueltas de «Actividades» (rellenar rangos vacíos). */
export async function escribirCeldasActividades(cambios: ReadonlyArray<{ fila: number; col: number; valor: number }>): Promise<void> {
  await Excel.run(async (context) => {
    const hoja = context.workbook.worksheets.getItem(HOJA_ACTIVIDADES);
    for (const c of cambios) hoja.getRangeByIndexes(c.fila, c.col, 1, 1).values = [[c.valor]];
    await context.sync();
  });
}
