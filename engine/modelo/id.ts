/**
 * Identificadores cortos y aleatorios para entradas/salidas del modelo
 * (decisión D6, Fase 2 §7.2): el heredado generaba nombres a partir de marcas
 * de tiempo, que colisionaban y eran inconsistentes entre sesiones. Esto no
 * necesita ser criptográficamente seguro —solo distinguir variables dentro
 * de un mismo libro—, así que `Math.random()` basta; no hace falta traer
 * `node:crypto` (prohibido en `engine/`, y tampoco existe en el runtime de
 * las funciones personalizadas de Excel).
 */
const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz';

export function generarId(prefijo: 'in' | 'out'): string {
  let sufijo = '';
  for (let i = 0; i < 6; i++) sufijo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  return `${prefijo}_${sufijo}`;
}
