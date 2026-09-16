/**
 * Árbol sintáctico de una fórmula de Excel.
 *
 * Nota sobre las referencias absolutas: `$A$1` y `A1` producen el mismo nodo.
 * El motor no rellena ni desplaza fórmulas — cada celda llega ya resuelta desde
 * Excel —, así que la absolutez no cambia nada de lo que se evalúa. El parser
 * la acepta y la descarta; guardarla sería complicar el AST sin usarlo.
 */

export type ErrorExcel =
  | '#DIV/0!' | '#N/A' | '#NAME?' | '#NULL!' | '#NUM!' | '#REF!' | '#VALUE!'
  | '#SPILL!' | '#CALC!' | '#GETTING_DATA';

export type OpBinario =
  | '+' | '-' | '*' | '/' | '^' | '&'
  | '=' | '<>' | '<' | '<=' | '>' | '>=';

/** Referencia a una celda concreta. `col` y `fila` empiezan en 1. */
export interface RefCelda {
  hoja?: string;
  col: number;
  fila: number;
}

/**
 * Rango. Un extremo a `null` significa abierto: `A:A` es una columna entera
 * (filas nulas) y `1:1` una fila entera (columnas nulas).
 */
export interface RefRango {
  hoja?: string;
  col1: number | null;
  fila1: number | null;
  col2: number | null;
  fila2: number | null;
}

export type Nodo =
  | { tipo: 'numero'; valor: number; pos: number }
  | { tipo: 'texto'; valor: string; pos: number }
  | { tipo: 'logico'; valor: boolean; pos: number }
  | { tipo: 'error'; valor: ErrorExcel; pos: number }
  | { tipo: 'celda'; ref: RefCelda; pos: number }
  | { tipo: 'rango'; ref: RefRango; pos: number }
  | { tipo: 'nombre'; nombre: string; hoja?: string; pos: number }
  | { tipo: 'funcion'; nombre: string; args: Nodo[]; pos: number }
  | { tipo: 'unaria'; op: '-' | '+'; arg: Nodo; pos: number }
  | { tipo: 'porcentaje'; arg: Nodo; pos: number }
  | { tipo: 'binaria'; op: OpBinario; izq: Nodo; der: Nodo; pos: number }
  | { tipo: 'matriz'; filas: Nodo[][]; pos: number }
  /** Argumento omitido: el hueco de `SUM(A1,,B1)`. */
  | { tipo: 'vacio'; pos: number }
  /** Construcción reconocida pero fuera del alcance del motor. */
  | { tipo: 'no-soportado'; motivo: string; texto: string; pos: number };

/** Recorre el árbol en preorden. */
export function recorrer(nodo: Nodo, visita: (n: Nodo) => void): void {
  visita(nodo);
  switch (nodo.tipo) {
    case 'funcion':
      for (const a of nodo.args) recorrer(a, visita);
      break;
    case 'unaria':
    case 'porcentaje':
      recorrer(nodo.arg, visita);
      break;
    case 'binaria':
      recorrer(nodo.izq, visita);
      recorrer(nodo.der, visita);
      break;
    case 'matriz':
      for (const fila of nodo.filas) for (const c of fila) recorrer(c, visita);
      break;
    default:
      break;
  }
}

/** Convierte un índice de columna en letras: 1 -> A, 27 -> AA. */
export function letrasDeColumna(indice: number): string {
  let n = indice;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s || 'A';
}

/** Índice de columna a partir de sus letras: A -> 1, AA -> 27. */
export function columnaDeLetras(letras: string): number {
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Clave canónica de una celda, para usarla como identidad en el grafo. */
export function claveCelda(hoja: string, col: number, fila: number): string {
  return `${hoja}!${letrasDeColumna(col)}${fila}`;
}
