/**
 * El libro de cronograma en Excel (QRSA, Q1.1–Q1.2): crear sus hojas con el
 * ejemplo y las listas desplegables, leerlas en un solo viaje y escribir la
 * hoja de resultados. Lo que no toca Excel está en `cronogramaHojas.ts` y
 * `cronogramaResultados.ts`.
 */

import { HOJA_RESULTADOS, HOJAS_CRONOGRAMA, hojasNuevasCronograma, type MatrizHoja } from './cronogramaHojas.ts';
import type { HojaResultados } from './cronogramaResultados.ts';

export const VERSION_COMPLEMENTO = '0.7.0';

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

/** Crea las hojas del libro de cronograma con el ejemplo. Falla si alguna ya existe. */
export async function crearLibroCronograma(inicio = proximoLunes()): Promise<string[]> {
  const existentes = await hojasCronogramaExistentes();
  if (existentes.length) throw new Error(`El libro ya tiene ${existentes.length === 1 ? 'la hoja' : 'las hojas'} ${existentes.join(', ')}. Bórrelas o use otro libro para crear uno nuevo.`);
  const nuevas = hojasNuevasCronograma(inicio);
  return Excel.run(async (context) => {
    for (const h of nuevas) {
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
      for (const [c, f] of Object.entries(h.formatos ?? {})) {
        hoja.getRangeByIndexes(1, Number(c), FILAS_VALIDACION, 1).numberFormat = Array.from({ length: FILAS_VALIDACION }, () => [f]);
      }
      for (const [c, lista] of Object.entries(h.listas ?? {})) {
        const r = hoja.getRangeByIndexes(1, Number(c), FILAS_VALIDACION, 1);
        r.dataValidation.clear();
        r.dataValidation.rule = { list: { inCellDropDown: true, source: typeof lista === 'string' ? lista : lista.join(',') } };
      }
      for (const [c, nota] of Object.entries(h.notas ?? {})) {
        // La ayuda de la columna aparece al elegir una de sus celdas.
        const r = hoja.getRangeByIndexes(1, Number(c), FILAS_VALIDACION, 1);
        r.dataValidation.prompt = { showPrompt: true, title: String(h.valores[0]?.[Number(c)] ?? '').slice(0, 32), message: nota.slice(0, 255) };
      }
      (h.anchos ?? []).forEach((caracteres, c) => {
        hoja.getRangeByIndexes(0, c, 1, 1).format.columnWidth = caracteres * 6.5;
      });
      if (h.nombre === HOJAS_CRONOGRAMA.config) {
        hoja.getRange('B2').numberFormat = [['dd/mm/yyyy']];
        hoja.getRange('B9').numberFormat = [['dd/mm/yyyy']];
        hoja.getRange('B6').dataValidation.rule = { list: { inCellDropDown: true, source: 'Hipercubo latino,Monte Carlo' } };
        hoja.getRange('B7').dataValidation.rule = { list: { inCellDropDown: true, source: 'Al día,Con decimales' } };
        hoja.getRange('B8').dataValidation.rule = { list: { inCellDropDown: true, source: 'Respetar,Ignorar' } };
        hoja.getRange('B3').dataValidation.rule = { list: { inCellDropDown: true, source: `=${HOJAS_CRONOGRAMA.calendario}!$A$2:$A$20` } };
        hoja.getRange('C:C').format.wrapText = true;
      }
      hoja.freezePanes.freezeRows(1);
    }
    context.workbook.worksheets.getItem(HOJAS_CRONOGRAMA.actividades).activate();
    await context.sync();
    return nuevas.map((h) => h.nombre);
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
    if (r.rangoCurva) {
      const g = hoja.charts.add(Excel.ChartType.xyscatterLinesNoMarkers, hoja.getRange(r.rangoCurva), Excel.ChartSeriesBy.columns);
      g.title.text = 'Curva S: probabilidad de terminar a más tardar en cada fecha';
      g.legend.visible = false;
      g.setPosition('N3', 'V22');
    }
    hoja.activate();
    await context.sync();
  });
}
