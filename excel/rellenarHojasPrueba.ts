/** Escribe en «Pruebas» y «Zonas» las fórmulas de la guía (ver `hojasPrueba.ts`). */

import { FORMULAS_DE_PRUEBA, yaEscritas } from './hojasPrueba.ts';

export interface ResultadoRelleno {
  escritas: number;
  /** Las que ya tenían algo: no se tocan. */
  respetadas: string[];
  /** Hojas que no están en este libro. */
  faltan: string[];
}

export async function rellenarHojasPrueba(): Promise<ResultadoRelleno> {
  return Excel.run(async (context) => {
    const hojas = context.workbook.worksheets;
    hojas.load('items/name');
    await context.sync();
    const existen = new Set(hojas.items.map((h) => h.name));
    const faltan = [...new Set(FORMULAS_DE_PRUEBA.map((f) => f.hoja))].filter((h) => !existen.has(h));
    const posibles = FORMULAS_DE_PRUEBA.filter((f) => existen.has(f.hoja));
    const rangos = posibles.map((f) => {
      const r = hojas.getItem(f.hoja).getRange(f.celda);
      r.load('formulas');
      return { f, r };
    });
    await context.sync();
    const contenido = new Map(rangos.map(({ f, r }) => [`${f.hoja}!${f.celda}`, String((r.formulas as unknown[][])[0]?.[0] ?? '')]));
    const respetar = new Set(yaEscritas(posibles, (h, c) => contenido.get(`${h}!${c}`) ?? '').map((f) => `${f.hoja}!${f.celda}`));
    let escritas = 0;
    for (const { f, r } of rangos) {
      if (respetar.has(`${f.hoja}!${f.celda}`)) continue;
      r.formulas = [[f.formula]];
      escritas++;
    }
    await context.sync();
    return { escritas, respetadas: [...respetar], faltan };
  });
}
