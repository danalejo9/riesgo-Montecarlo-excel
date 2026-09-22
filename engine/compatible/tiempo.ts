/**
 * Cómo se le cuenta al usuario lo que va a tardar.
 *
 * Es lógica de producto, no de presentación, y por eso está en el motor y no
 * en el panel: con Excel dentro del bucle **se dice el tiempo, siempre**, y se
 * dice a partir de una medición real sobre su libro. La auditoría midió ~3
 * horas para un millón de iteraciones; un usuario que lo descubre a los veinte
 * minutos se siente engañado, y con razón.
 */

/**
 * Duración legible a partir de un ritmo medido. Un ritmo de cero —todavía no
 * hay nada medido— da `'desconocido'`: es la respuesta honesta, y es mejor
 * enseñarla que fingir un número.
 */
export function tiempoEstimado(iteracionesPorSegundo: number, iteraciones: number): string {
  if (!(iteracionesPorSegundo > 0) || iteraciones <= 0) return 'desconocido';

  const segundos = iteraciones / iteracionesPorSegundo;
  if (segundos < 60) return `${Math.max(1, Math.round(segundos))} s`;

  const minutos = segundos / 60;
  if (minutos < 60) return `${Math.round(minutos)} min`;

  const horas = Math.floor(minutos / 60);
  const resto = Math.round(minutos % 60);
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/**
 * Si el modo compatible es una mala idea para este libro y este número de
 * iteraciones. No lo impide —es decisión del usuario— pero el panel tiene que
 * poder avisar antes, no después.
 *
 * El umbral es media hora: por debajo, esperar es razonable; por encima,
 * conviene ofrecer el modo rápido, menos iteraciones, o las dos cosas.
 */
export const UMBRAL_AVISO_MS = 30 * 60 * 1000;

export function convieneAvisar(iteracionesPorSegundo: number, iteraciones: number): boolean {
  if (!(iteracionesPorSegundo > 0)) return false;
  return (iteraciones / iteracionesPorSegundo) * 1000 >= UMBRAL_AVISO_MS;
}
