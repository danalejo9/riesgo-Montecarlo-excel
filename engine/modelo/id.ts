/**
 * Identificadores cortos y aleatorios para entradas/salidas del modelo
 * (decisión D6, Fase 2 §7.2): el heredado generaba nombres a partir de marcas
 * de tiempo, que colisionaban y eran inconsistentes entre sesiones. Esto no
 * necesita ser criptográficamente seguro —solo distinguir variables dentro
 * de un mismo libro—, así que `Math.random()` basta; no hace falta traer
 * `node:crypto` (prohibido en `engine/`, y tampoco existe en el runtime de
 * las funciones personalizadas de Excel).
 *
 * **Diez caracteres, no seis.** Con seis (36⁶ ≈ 2·10⁹) la probabilidad de
 * repetir uno en un lote de 5.000 es de un 0,6 %, y la prueba que lo comprueba
 * falló así una vez de cada ~170 ejecuciones. Con diez (36¹⁰ ≈ 4·10¹⁵) es del
 * orden de 3·10⁻⁹. Los ids ya guardados en libros no cambian: el id solo se
 * genera al crear una variable.
 */
const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz';

export function generarId(prefijo: 'in' | 'out'): string {
  let sufijo = '';
  for (let i = 0; i < 10; i++) sufijo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return `${prefijo}_${sufijo}`;
}
