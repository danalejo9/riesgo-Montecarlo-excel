/**
 * Los datos de la simulación, iteración a iteración (C3): las entradas y las
 * salidas emparejadas de las primeras iteraciones (las que se retienen para
 * el tornado, hasta 100.000), para exportarlas a una hoja y que el usuario
 * haga sus propios análisis. Solo en memoria: no se guardan en el libro.
 * Sin Office.js.
 */

export interface ColumnaIteraciones {
  id: string;
  nombre: string;
  ref: string;
  /** Números (NaN = sin número en esa iteración). En una entrada de texto, el índice de su categoría. */
  valores: ArrayLike<number>;
  /** Entrada de texto: la categoría de cada índice. */
  categorias?: readonly string[];
  /** Salida de texto o sí/no: el valor de cada iteración. */
  texto?: readonly (string | null)[];
  fecha?: boolean;
}

export interface IteracionesSimuladas {
  /** Cuántas iteraciones hay (las primeras de la simulación). */
  n: number;
  entradas: ColumnaIteraciones[];
  salidas: ColumnaIteraciones[];
}

export interface TablaIteraciones {
  cabecera: string[];
  refs: string[];
  filas: (number | string)[][];
  /** Columnas con formato de fecha. */
  fechas: boolean[];
}

/** La tabla para la hoja: iteración, entradas y salidas, hasta `limite` filas. */
export function tablaIteraciones(it: IteracionesSimuladas, limite: number): TablaIteraciones {
  const columnas = [...it.entradas, ...it.salidas];
  const n = Math.min(it.n, limite);
  const filas: (number | string)[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const fila: (number | string)[] = [i + 1];
    for (const c of columnas) fila.push(valorEn(c, i));
    filas[i] = fila;
  }
  return {
    cabecera: ['Iteración', ...columnas.map((c) => c.nombre)],
    refs: ['', ...columnas.map((c) => c.ref)],
    filas,
    fechas: [false, ...columnas.map((c) => c.fecha === true)],
  };
}

function valorEn(c: ColumnaIteraciones, i: number): number | string {
  if (c.texto) {
    const t = c.texto[i];
    if (t !== null && t !== undefined) return t;
  }
  const v = c.valores[i];
  if (v === undefined || !Number.isFinite(v)) return '';
  if (c.categorias) return c.categorias[Math.round(v)] ?? '';
  return v;
}
