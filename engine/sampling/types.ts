/**
 * Métodos de muestreo seleccionables (D10): ambos disponibles, ninguno oculto.
 * El resultado de una simulación debe indicar siempre con cuál se generó —
 * un histograma de LHS y uno de Monte Carlo no son comparables sin saberlo
 * (Fase 2 §8) — así que este tipo viaja junto a los resultados, no se pierde
 * después de muestrear.
 */
export type MetodoMuestreo = 'monte-carlo' | 'lhs';
