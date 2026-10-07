/** Aplica a un libro en memoria los cambios «rango» y «celda» que el complemento mandaría a Excel. */
import type { CambioHoja } from '../../excel/edicionGantt.ts';

export function aplicarCambios(libro: Record<string, unknown[][]>, cambios: readonly CambioHoja[]): void {
  for (const c of cambios) {
    const m = (libro[c.hoja] ??= []);
    if (c.op === 'rango') {
      c.valores.forEach((f, i) => {
        const fila = (m[c.fila + i] ??= []);
        f.forEach((v, j) => { fila[c.col + j] = v; });
      });
    } else if (c.op === 'celda') {
      (m[c.fila] ??= [])[c.col] = c.valor;
    }
  }
}
