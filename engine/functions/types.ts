/**
 * Modelo de valores del motor vectorizado — subconjunto numérico (WIP).
 *
 * Cada celda del modelo, evaluada sobre las N iteraciones de la simulación, es
 * un `Buffer`: un `Float64Array` de longitud N. `Buffer[i]` es el valor de esa
 * celda en la iteración `i`. Esto es literalmente la vectorización descrita en
 * Fase 2 §3: en vez de recorrer las N iteraciones y calcular la celda en cada
 * una, se calculan sus N valores de una vez con un bucle plano sobre memoria
 * contigua.
 *
 * Un argumento de función (`Arg`) es una lista de buffers, no uno solo, porque
 * un argumento puede ser una celda (una lista de un elemento) o un rango
 * (`A1:A9`, una lista de nueve). Esto es lo que hace que `SUM(A1:A9)` y
 * `SUM(A1,A2,...,A9)` compilen exactamente igual: al aplanar los argumentos no
 * hay diferencia entre "un rango de nueve celdas" y "nueve celdas sueltas".
 *
 * ---
 *
 * **Alcance deliberado de este archivo, y lo que falta (no descartado, aplazado):**
 *
 * Excel tiene cinco tipos de valor por celda: número, texto, booleano, error y
 * vacío. Esta primera versión del registro de funciones **solo modela
 * números**. No es un descuido: introducir el canal de texto/booleano/error/
 * vacío es una decisión de diseño con consecuencias en todo el motor (cada
 * función tiene que decidir qué hacer con un texto en un argumento numérico,
 * cómo se propaga un error, qué cuenta como "vacío" para COUNT vs COUNTA) y
 * merece su propio commit, no colarse aquí.
 *
 * Consecuencia práctica: ninguna función de este archivo debe declararse
 * "soportada" a efectos de la batería de fidelidad de Fase 2 §11.3 hasta que
 * ese canal exista y sus casos límite (texto en SUMA, argumento vacío,
 * división por cero) tengan su fila en el libro de referencia. Lo que hay
 * aquí es la base aritmética correcta; la fidelidad completa es un paso más.
 */

/** Un valor por iteración de simulación, para una única celda. */
export type Buffer = Float64Array;

/** Un argumento de función: una celda es un array de 1; un rango, de N. */
export type Arg = Buffer[];

/** Firma común de toda función de Nivel 0. `n` es el número de iteraciones. */
export type FuncionNivel0 = (args: Arg[], n: number) => Buffer;

/** Aplana los argumentos en una única lista de buffers, en orden de aparición. */
export function aplanar(args: Arg[]): Buffer[] {
  const out: Buffer[] = [];
  for (const arg of args) for (const b of arg) out.push(b);
  return out;
}

export function nuevoBuffer(n: number): Buffer {
  return new Float64Array(n);
}

/** Envuelve un único buffer como argumento (para tests y para constantes). */
export function celda(b: Buffer): Arg {
  return [b];
}
