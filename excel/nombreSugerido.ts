/**
 * Nombres legibles para las celdas del modelo (E5).
 *
 * Hasta el 27/09, una entrada se llamaba como su celda —«Modelo!C5»—, y así
 * salía en el tornado, la araña, el informe y el volcado: había que tener la
 * hoja delante para saber qué era cada cosa. Los modelos financieros casi
 * siempre ponen la etiqueta a la izquierda del número («Precio unitario» en
 * B5, el valor en C5), así que ese texto es el mejor nombre por defecto. El
 * usuario lo puede cambiar después.
 *
 * Sin Office.js: quien llama le pasa lo que hay alrededor de la celda, leído
 * de Excel (`etiquetasEnExcel.ts`) o del libro ya leído (`indiceDeTextos`).
 */

import type { ValorEstatico } from './tiposLectura.ts';

/** El contenido de una celda vecina tal como llega de Excel. */
export type Vecino = string | number | boolean | null | undefined;

/** Cuántas celdas se miran hacia la izquierda y hacia arriba. */
export const VECINOS_IZQUIERDA = 12;
export const VECINOS_ARRIBA = 6;
const LARGO_MAXIMO = 60;

function limpiar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().replace(/[:：]\s*$/, '').trim();
}

/** Un texto que sirve de etiqueta: no vacío y que no sea un número escrito como texto. */
function comoEtiqueta(v: Vecino): string | null {
  if (typeof v !== 'string') return null;
  const t = limpiar(v);
  if (t === '' || /^[-+]?[\d.,\s%€$]+$/.test(t)) return null;
  // Un error de Excel (#N/A, #¿NOMBRE?, #DIV/0!…) no es una etiqueta.
  if (/^#\S{1,14}$/.test(t)) return null;
  return t.length > LARGO_MAXIMO ? `${t.slice(0, LARGO_MAXIMO - 1)}…` : t;
}

const vacio = (v: Vecino) => v === null || v === undefined || v === '';

/** La celda sin la hoja: «Modelo!C5» → «C5». */
function soloCelda(ref: string): string {
  const i = ref.lastIndexOf('!');
  return (i >= 0 ? ref.slice(i + 1) : ref).replace(/\$/g, '');
}

/**
 * El nombre que se propone para `ref`, a partir de sus vecinas.
 *
 * - `izquierda`: las celdas de la misma fila, **de la más cercana a la más
 *   lejana**.
 * - `arriba`: las de la misma columna, también de la más cercana hacia arriba.
 *
 * Gana el primer texto a la izquierda. Si entre él y la celda hay números (una
 * tabla por años: «Flujo de caja libre» en B28 y el año 5 en H28), el texto
 * solo no distingue la celda de sus vecinas, y se le añade la celda:
 * «Flujo de caja libre (H28)». Sin texto a la izquierda, el primero de
 * arriba, con la misma regla. Sin ninguno, la referencia.
 */
export function nombreSugerido(ref: string, izquierda: readonly Vecino[], arriba: readonly Vecino[] = []): string {
  for (const lado of [izquierda, arriba]) {
    let saltados = 0;
    for (const v of lado) {
      const etiqueta = comoEtiqueta(v);
      if (etiqueta) return saltados > 0 ? `${etiqueta} (${soloCelda(ref)})` : etiqueta;
      if (!vacio(v)) saltados++;
    }
  }
  return ref;
}

/** Si el nombre ya lo usa otra celda del modelo, se le añade la suya para distinguirlas. */
/** La etiqueta de texto más cercana de una franja (la primera que lo sea), o `null`. */
export function primeraEtiqueta(vecinos: readonly Vecino[]): string | null {
  for (const v of vecinos) {
    const e = comoEtiqueta(v);
    if (e) return e;
  }
  return null;
}

/**
 * Nombres para una serie de salidas (D3): una fila de celdas (los años de un
 * flujo de caja) o una columna. La etiqueta común sale del lado de la serie
 * (la izquierda de la primera celda de una fila) y el periodo de cada una, del
 * otro lado (la cabecera de encima): «Flujo de caja libre · Año 3».
 */
export function nombresDeSerie(
  refs: readonly string[],
  vecinos: ReadonlyMap<string, { izquierda: Vecino[]; arriba: Vecino[] }>,
  orientacion: 'fila' | 'columna',
): string[] {
  const primera = vecinos.get(refs[0] as string);
  const base = primera ? primeraEtiqueta(orientacion === 'fila' ? primera.izquierda : primera.arriba) : null;
  return refs.map((ref) => {
    const v = vecinos.get(ref);
    const periodo = v ? primeraEtiqueta(orientacion === 'fila' ? v.arriba : v.izquierda) : null;
    if (base && periodo) return `${base} · ${periodo}`;
    return base ? `${base} (${soloCelda(ref)})` : v ? nombreSugerido(ref, v.izquierda, v.arriba) : ref;
  });
}

export function nombreUnico(nombre: string, ref: string, usados: Iterable<string>): string {
  const ocupados = new Set(usados);
  if (nombre === ref || !ocupados.has(nombre)) return nombre;
  return `${nombre} (${soloCelda(ref)})`;
}

/**
 * Un índice de los valores escritos del libro, para nombrar celdas sin volver
 * a Excel (las entradas de funciones `RIESGO.*` se descubren al simular, con
 * el libro ya leído).
 */
export function indiceDeTextos(valores: readonly ValorEstatico[]) {
  const porCelda = new Map<string, Vecino>();
  for (const v of valores) {
    porCelda.set(`${v.hoja}\u0000${v.col}\u0000${v.fila}`, v.tipo === 'texto' ? v.texto : v.numero ?? true);
  }
  const en = (hoja: string, col: number, fila: number) => porCelda.get(`${hoja}\u0000${col}\u0000${fila}`);
  return {
    /** El nombre sugerido para la celda (`col` y `fila` desde 1). */
    nombre(ref: string, hoja: string, col: number, fila: number): string {
      const izquierda: Vecino[] = [];
      for (let c = col - 1; c >= Math.max(1, col - VECINOS_IZQUIERDA); c--) izquierda.push(en(hoja, c, fila));
      const arriba: Vecino[] = [];
      for (let f = fila - 1; f >= Math.max(1, fila - VECINOS_ARRIBA); f--) arriba.push(en(hoja, col, f));
      return nombreSugerido(ref, izquierda, arriba);
    },
  };
}
