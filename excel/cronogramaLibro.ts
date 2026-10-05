/**
 * El libro de cronograma en Excel (QRSA, Q1.1–Q1.2): crear sus hojas con el
 * ejemplo y las listas desplegables, leerlas en un solo viaje y escribir la
 * hoja de resultados. Lo que no toca Excel está en `cronogramaHojas.ts` y
 * `cronogramaResultados.ts`.
 */

import { HOJA_RESULTADOS, HOJAS_CRONOGRAMA, hojasNuevasCronograma, type Celda, type HojaNueva, type MatrizHoja } from './cronogramaHojas.ts';
import { HOJAS_QUE_IMPORTA } from './importarCronograma.ts';
import type { HojaResultados } from './cronogramaResultados.ts';
import type { CambioHoja } from './edicionGantt.ts';

export const VERSION_COMPLEMENTO = '0.9.0';

const AZUL = '#1F4E79';
const ENCABEZADO = '#DDEBF7';
const SEMAFORO = { verde: '#C6EFCE', amarillo: '#FFEB9C', rojo: '#FFC7CE' } as const;
/** Filas con validación de datos por debajo del encabezado. */
const FILAS_VALIDACION = 500;

/** Qué hojas del libro de cronograma ya existen. */
export async function hojasCronogramaExistentes(): Promise<string[]> {
  return Excel.run(async (context) => {
    const hojas = context.workbook.worksheets;
    hojas.load('items/name');
    await context.sync();
    const nombres = new Set(hojas.items.map((h) => h.name.toLowerCase()));
    return Object.values(HOJAS_CRONOGRAMA).filter((n) => nombres.has(n.toLowerCase()));
  });
}

/** El próximo lunes (o hoy, si es lunes), como número de serie. */
export function proximoLunes(hoy = new Date()): number {
  const serie = Math.floor((Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - Date.UTC(1899, 11, 30)) / 86_400_000);
  const dia = (hoy.getDay() + 6) % 7; // 0 = lunes
  return serie + ((7 - dia) % 7);
}

/** Escribe una hoja nueva del libro de cronograma (valores, formatos, listas, ayuda, anchos). */
function escribirHoja(context: Excel.RequestContext, h: HojaNueva): void {
  const hoja = context.workbook.worksheets.add(h.nombre);
  const filas = h.valores.length;
  const ancho = Math.max(...h.valores.map((f) => f.length));
  const valores = h.valores.map((f) => {
    const v = [...f];
    while (v.length < ancho) v.push(null);
    return v.map((x) => (x === null ? '' : x));
  });
  hoja.getRangeByIndexes(0, 0, filas, ancho).values = valores;
  const enc = hoja.getRangeByIndexes(0, 0, 1, ancho);
  enc.format.font.bold = true;
  enc.format.font.color = AZUL;
  enc.format.fill.color = ENCABEZADO;
  const alto = Math.max(FILAS_VALIDACION, filas + 50);
  for (const [c, f] of Object.entries(h.formatos ?? {})) {
    hoja.getRangeByIndexes(1, Number(c), alto, 1).numberFormat = Array.from({ length: alto }, () => [f]);
  }
  for (const [c, lista] of Object.entries(h.listas ?? {})) {
    const r = hoja.getRangeByIndexes(1, Number(c), alto, 1);
    r.dataValidation.clear();
    r.dataValidation.rule = { list: { inCellDropDown: true, source: typeof lista === 'string' ? lista : lista.join(',') } };
  }
  for (const [c, nota] of Object.entries(h.notas ?? {})) {
    // La ayuda de la columna aparece al elegir una de sus celdas.
    const r = hoja.getRangeByIndexes(1, Number(c), alto, 1);
    r.dataValidation.prompt = { showPrompt: true, title: String(h.valores[0]?.[Number(c)] ?? '').slice(0, 32), message: nota.slice(0, 255) };
  }
  (h.anchos ?? []).forEach((caracteres, c) => {
    hoja.getRangeByIndexes(0, c, 1, 1).format.columnWidth = caracteres * 6.5;
  });
  if (h.nombre === HOJAS_CRONOGRAMA.config) {
    hoja.getRange('B2').numberFormat = [['dd/mm/yyyy']];
    hoja.getRange('B9').numberFormat = [['dd/mm/yyyy']];
    hoja.getRange('B12').numberFormat = [['#,##0']];
    hoja.getRange('B13').numberFormat = [['0%']];
    hoja.getRange('B14').numberFormat = [['dd/mm/yyyy']];
    hoja.getRange('B15').dataValidation.rule = { list: { inCellDropDown: true, source: 'Retenida,Anulación por progreso' } };
    hoja.getRange('B6').dataValidation.rule = { list: { inCellDropDown: true, source: 'Hipercubo latino,Monte Carlo' } };
    hoja.getRange('B7').dataValidation.rule = { list: { inCellDropDown: true, source: 'Al día,Con decimales' } };
    hoja.getRange('B8').dataValidation.rule = { list: { inCellDropDown: true, source: 'Respetar,Ignorar' } };
    hoja.getRange('B3').dataValidation.rule = { list: { inCellDropDown: true, source: `=${HOJAS_CRONOGRAMA.calendario}!$A$2:$A$20` } };
    hoja.getRange('C:C').format.wrapText = true;
  }
  hoja.freezePanes.freezeRows(1);
}

export interface CreacionLibro {
  creadas: string[];
  /** true si el libro ya tenía parte de las hojas (de una versión anterior) y solo se añadieron las que faltaban, vacías. */
  completado: boolean;
}

/**
 * Crea las hojas del libro de cronograma con el ejemplo. Si el libro ya
 * tiene algunas (un libro de la versión anterior, sin Costos ni
 * Correlaciones), añade solo las que faltan, vacías. Falla si están todas.
 */
export async function crearLibroCronograma(inicio = proximoLunes()): Promise<CreacionLibro> {
  const existentes = await hojasCronogramaExistentes();
  const todas = Object.values(HOJAS_CRONOGRAMA);
  if (existentes.length === todas.length) throw new Error('El libro ya tiene todas las hojas del cronograma. Bórrelas o use otro libro para crear uno nuevo.');
  const completado = existentes.length > 0;
  const tiene = new Set(existentes.map((n) => n.toLowerCase()));
  const nuevas = hojasNuevasCronograma(inicio)
    .filter((h) => !tiene.has(h.nombre.toLowerCase()))
    .map((h) => (completado ? { ...h, valores: [h.valores[0] as Celda[]] } : h));
  return Excel.run(async (context) => {
    for (const h of nuevas) escribirHoja(context, h);
    context.workbook.worksheets.getItem(completado ? (nuevas[0] as HojaNueva).nombre : HOJAS_CRONOGRAMA.actividades).activate();
    await context.sync();
    return { creadas: nuevas.map((h) => h.nombre), completado };
  });
}

/**
 * Lleva un cronograma importado al libro. Sin hojas del cronograma, las crea
 * todas; con ellas, reemplaza Actividades, Relaciones y Calendario, pone la
 * fecha de inicio y el calendario en Config y añade las que falten. Lo demás
 * (incertidumbre, riesgos, costos…) no se toca, salvo con `deCero`.
 */
export async function importarAlLibro(hojas: readonly HojaNueva[], inicio: number, calendario: string, deCero = false): Promise<string[]> {
  const existentes = new Set((await hojasCronogramaExistentes()).map((n) => n.toLowerCase()));
  // «De cero»: también se vacían incertidumbre, riesgos, costos… (remitían a las actividades de antes).
  const reemplazar = new Set<string>((deCero ? hojas.map((h) => h.nombre).filter((n) => n !== HOJAS_CRONOGRAMA.config) : HOJAS_QUE_IMPORTA).map((n) => n.toLowerCase()));
  return Excel.run(async (context) => {
    const escritas: string[] = [];
    for (const h of hojas) {
      const ya = existentes.has(h.nombre.toLowerCase());
      if (ya && !reemplazar.has(h.nombre.toLowerCase())) continue;
      if (ya) {
        context.workbook.worksheets.getItem(h.nombre).delete();
        await context.sync();
      }
      escribirHoja(context, h);
      escritas.push(h.nombre);
    }
    if (existentes.has(HOJAS_CRONOGRAMA.config.toLowerCase())) {
      const config = context.workbook.worksheets.getItem(HOJAS_CRONOGRAMA.config);
      config.getRange('B2').values = [[inicio]];
      config.getRange('B3').values = [[calendario]];
    }
    context.workbook.worksheets.getItem(HOJAS_CRONOGRAMA.actividades).activate();
    await context.sync();
    return escritas;
  });
}

/** Lee los valores de las hojas del libro de cronograma (desde A1), en un solo viaje. */
export async function leerHojasCronograma(): Promise<Record<string, MatrizHoja | undefined>> {
  return Excel.run(async (context) => {
    const nombres = Object.values(HOJAS_CRONOGRAMA);
    const usados = nombres.map((n) => {
      const hoja = context.workbook.worksheets.getItemOrNullObject(n);
      const rango = hoja.getUsedRangeOrNullObject(true);
      hoja.load('isNullObject');
      rango.load(['isNullObject', 'values', 'rowIndex', 'columnIndex']);
      return { n, hoja, rango };
    });
    await context.sync();
    const out: Record<string, MatrizHoja | undefined> = {};
    for (const { n, hoja, rango } of usados) {
      if (hoja.isNullObject) continue;
      if (rango.isNullObject) { out[n] = []; continue; }
      // Desde A1: el rango usado puede empezar más abajo o más a la derecha.
      const filas: unknown[][] = Array.from({ length: rango.rowIndex }, () => []);
      for (const f of rango.values) filas.push([...Array.from({ length: rango.columnIndex }, () => null), ...f]);
      out[n] = filas;
    }
    return out;
  });
}

/** Selecciona una celda (para llevar al usuario a un error). */
export async function irACelda(hoja: string, columna: string, fila: number): Promise<void> {
  await Excel.run(async (context) => {
    const h = context.workbook.worksheets.getItem(hoja);
    h.activate();
    h.getRange(`${columna || 'A'}${Math.max(1, fila)}`).select();
    await context.sync();
  });
}

/** Rehace la hoja `Resultados_Cronograma`. */
export async function escribirResultadosCronograma(r: HojaResultados): Promise<void> {
  await Excel.run(async (context) => {
    const previa = context.workbook.worksheets.getItemOrNullObject(HOJA_RESULTADOS);
    previa.load('isNullObject');
    await context.sync();
    if (!previa.isNullObject) {
      previa.delete();
      await context.sync();
    }
    const hoja = context.workbook.worksheets.add(HOJA_RESULTADOS);
    const filas = r.valores.length;
    const ancho = r.valores[0]?.length ?? 1;
    const todo = hoja.getRangeByIndexes(0, 0, filas, ancho);
    todo.values = r.valores.map((f) => f.map((x) => (x === null ? '' : x)));
    todo.numberFormat = r.formatos.map((f) => f.map((x) => x ?? 'General'));
    for (const i of r.negritas) hoja.getRangeByIndexes(i, 0, 1, 9).format.font.bold = true;
    for (const i of r.titulos) {
      const t = hoja.getRangeByIndexes(i, 0, 1, 9);
      t.format.font.color = AZUL;
      t.format.borders.getItem(Excel.BorderIndex.edgeBottom).style = Excel.BorderLineStyle.continuous;
    }
    hoja.getRangeByIndexes(0, 0, 1, 1).format.font.size = 14;
    for (const [f, c, estado] of r.semaforos) hoja.getRangeByIndexes(f, c, 1, 1).format.fill.color = SEMAFORO[estado];
    [36, 30, 14, 16, 14, 16, 14, 13, 13, 3, 13, 16].forEach((caracteres, c) => {
      if (c < ancho) hoja.getRangeByIndexes(0, c, 1, 1).format.columnWidth = caracteres * 6.5;
    });
    r.graficos.forEach((gr, k) => {
      const tipo = gr.tipo === 'dispersion' ? Excel.ChartType.xyscatter : Excel.ChartType.xyscatterLinesNoMarkers;
      const g = hoja.charts.add(tipo, hoja.getRange(gr.rango), Excel.ChartSeriesBy.columns);
      g.title.text = gr.titulo;
      g.legend.visible = false;
      // Uno debajo de otro, a la derecha de los datos.
      const col = 10 + 3 * r.graficos.length + 1;
      g.setPosition(hoja.getRangeByIndexes(2 + 22 * k, col, 1, 1), hoja.getRangeByIndexes(21 + 22 * k, col + 8, 1, 1));
    });
    hoja.activate();
    await context.sync();
  });
}

/**
 * G2: escribe en el libro los cambios de una edición del Gantt, en orden y en
 * un solo viaje: celdas sueltas, e insertar o borrar filas enteras (así
 * Excel conserva las fórmulas, los formatos y las listas de lo demás).
 */
export async function aplicarCambiosEnLibro(cambios: readonly CambioHoja[]): Promise<void> {
  await Excel.run(async (context) => {
    const hojas = new Map<string, Excel.Worksheet>();
    const hoja = (n: string) => {
      let h = hojas.get(n);
      if (!h) {
        h = context.workbook.worksheets.getItem(n);
        hojas.set(n, h);
      }
      return h;
    };
    for (const c of cambios) {
      const h = hoja(c.hoja);
      if (c.op === 'celda') {
        h.getRangeByIndexes(c.fila, c.col, 1, 1).values = [[(c.valor ?? '') as string | number | boolean]];
      } else if (c.op === 'insertar') {
        h.getRangeByIndexes(c.fila, 0, 1, 1).getEntireRow().insert(Excel.InsertShiftDirection.down);
        if (c.valores.length) h.getRangeByIndexes(c.fila, 0, 1, c.valores.length).values = [c.valores.map((v) => (v ?? '') as string | number | boolean)];
      } else {
        h.getRangeByIndexes(c.fila, 0, 1, 1).getEntireRow().delete(Excel.DeleteShiftDirection.up);
      }
    }
    await context.sync();
  });
}
