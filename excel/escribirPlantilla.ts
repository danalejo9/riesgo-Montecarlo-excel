/** Escribe una plantilla (U1) en una hoja nueva y la activa. */

import type { Plantilla } from './plantillas.ts';

export async function escribirPlantilla(p: Plantilla): Promise<string> {
  return Excel.run(async (context) => {
    const hojas = context.workbook.worksheets;
    hojas.load('items/name');
    await context.sync();
    const usados = new Set(hojas.items.map((h) => h.name.toLowerCase()));
    let nombre = p.hoja;
    for (let i = 2; usados.has(nombre.toLowerCase()); i++) nombre = `${p.hoja} ${i}`;
    const hoja = hojas.add(nombre);
    for (const c of p.celdas) {
      const r = hoja.getRange(c.ref);
      if (typeof c.valor === 'string' && c.valor.startsWith('=')) r.formulas = [[c.valor]];
      else r.values = [[c.valor]];
      if (c.formato) r.numberFormat = [[c.formato]];
      if (c.negrita) r.format.font.bold = true;
    }
    if (p.anchos) {
      hoja.getRange('A:A').format.columnWidth = p.anchos[0] * 7;
      hoja.getRange('B:C').format.columnWidth = p.anchos[1] * 7;
    }
    hoja.activate();
    await context.sync();
    return nombre;
  });
}
