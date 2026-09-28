/**
 * Leer un rango de la hoja con el libro ya leído, sin volver a Excel: lo
 * necesita `RIESGO.CATEGORIA(E13:E17; F13:F17)` (T4) al simular y al preparar
 * el libro para compartir. Solo valores escritos: si el rango tiene fórmulas,
 * sus celdas no están aquí y la lectura falla con un motivo claro.
 */

import type { LectorDeRango } from '../engine/modelo/index.ts';
import type { ValorEstatico } from './tiposLectura.ts';

const LIMITE_CELDAS = 1_000;

export function lectorDeLibro(valores: readonly ValorEstatico[], hojaPorDefecto: string): LectorDeRango {
  const porCelda = new Map<string, unknown>();
  for (const v of valores) porCelda.set(`${v.hoja}\u0000${v.col}\u0000${v.fila}`, v.tipo === 'texto' ? v.texto : v.numero);
  return (nodo) => {
    const hoja = nodo.ref.hoja ?? hojaPorDefecto;
    const [c1, f1, c2, f2] = nodo.tipo === 'celda'
      ? [nodo.ref.col, nodo.ref.fila, nodo.ref.col, nodo.ref.fila]
      : [nodo.ref.col1, nodo.ref.fila1, nodo.ref.col2, nodo.ref.fila2];
    if (c1 === null || f1 === null || c2 === null || f2 === null) return null; // columnas o filas enteras
    const filas = Math.abs(f2 - f1) + 1;
    const cols = Math.abs(c2 - c1) + 1;
    if (filas * cols > LIMITE_CELDAS) return null;
    const out: unknown[] = [];
    for (let f = Math.min(f1, f2); f <= Math.max(f1, f2); f++) {
      for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(porCelda.get(`${hoja}\u0000${c}\u0000${f}`) ?? null);
    }
    return out;
  };
}
