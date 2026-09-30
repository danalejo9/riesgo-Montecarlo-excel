/**
 * Leer las categorías de una entrada de texto de un rango de la hoja (T1).
 * Sin Office.js.
 *
 * Se aceptan dos formas, las que tendría cualquiera en su libro:
 * - **dos columnas**: nombre y probabilidad (o peso) por fila;
 * - **una columna** de nombres: todos con el mismo peso.
 * Las filas sin nombre se saltan; un nombre repetido suma sus pesos.
 */

export type LecturaCategorias =
  | { ok: true; categories: string[]; weights: number[] }
  | { ok: false; motivo: string };

export function categoriasDeRango(valores: readonly (readonly unknown[])[]): LecturaCategorias {
  const pesos = new Map<string, number>();
  for (const fila of valores) {
    const nombre = fila[0];
    if (nombre === null || nombre === undefined || String(nombre).trim() === '') continue;
    const texto = String(nombre).trim();
    let peso = 1;
    if (fila.length > 1) {
      const p = fila[1];
      peso = typeof p === 'number' ? p : Number(String(p ?? '').replace(',', '.'));
      if (!Number.isFinite(peso) || peso < 0) return { ok: false, motivo: `El peso de «${texto}» no es un número válido.` };
    }
    pesos.set(texto, (pesos.get(texto) ?? 0) + peso);
  }
  if (pesos.size === 0) return { ok: false, motivo: 'La selección no tiene ningún nombre en su primera columna.' };
  if ([...pesos.values()].every((p) => p === 0)) return { ok: false, motivo: 'Todas las probabilidades son cero.' };
  return { ok: true, categories: [...pesos.keys()], weights: [...pesos.values()] };
}
