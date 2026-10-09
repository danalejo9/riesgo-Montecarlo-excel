/** Escribe en «Pruebas» y «Zonas» las fórmulas de la guía (ver `hojasPrueba.ts`). */

import { FORMULAS_DE_PRUEBA, yaEscritas, type FormulaDePrueba } from './hojasPrueba.ts';

export interface ResultadoRelleno {
  escritas: number;
  /** Las que ya tenían algo: no se tocan. */
  respetadas: string[];
  /** Hojas que no están en este libro. */
  faltan: string[];
  /** Las que este Excel no aceptó (p. ej. FILTER sin matrices dinámicas), con el motivo. */
  rechazadas: { celda: string; formula: string; motivo: string }[];
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
    const pendientes = rangos.filter(({ f }) => !respetar.has(`${f.hoja}!${f.celda}`)).map(({ f }) => f);

    // Una a una: si este Excel rechaza una fórmula (una función que no tiene),
    // las demás se escriben igual y se dice cuál faltó y por qué.
    let escritas = 0;
    const rechazadas: ResultadoRelleno['rechazadas'] = [];
    for (const f of pendientes) {
      try {
        hojas.getItem(f.hoja).getRange(f.celda).formulas = [[f.formula]];
        await context.sync();
        escritas++;
      } catch (e) {
        rechazadas.push({ celda: `${f.hoja}!${f.celda}`, formula: f.formula, motivo: motivoDe(e, f) });
      }
    }
    return { escritas, respetadas: [...respetar], faltan, rechazadas };
  });
}

function motivoDe(e: unknown, f: FormulaDePrueba): string {
  const texto = e instanceof Error ? e.message : String(e);
  if (/\b(FILTER|SORT|UNIQUE|SEQUENCE|LET|LAMBDA)\(/.test(f.formula)) {
    return 'este Excel no acepta la fórmula; usa una función de matrices dinámicas (FILTRAR, ORDENAR…) que solo tiene Excel de Microsoft 365 o 2021 en adelante';
  }
  return `Excel no la aceptó (${texto})`;
}
