/**
 * Contrato común de toda distribución del motor.
 *
 * El muestreo (Fase 3, E2) se hace por **transformada inversa**: se genera un
 * uniforme en (0,1) con el PRNG de `engine/random/` y se pasa por `quantile`.
 * Es la vía que permite que Monte Carlo y Latin Hypercube compartan el mismo
 * código de distribución (LHS solo cambia cómo se generan los uniformes, no
 * cómo se convierten en muestras) y que el resultado sea reproducible por
 * bloques, igual que el PRNG subyacente.
 *
 * `cdf` hace falta para el truncamiento genérico (Fase 2 §8) y para las
 * pruebas de Kolmogorov–Smirnov (Fase 2 §11.2); `mean`/`variance` para las
 * pruebas de momentos de la misma sección — son los que habrían detectado el
 * error de varianza del PERT heredado.
 */
export interface Distribution {
  /** Cuantil (inversa de la CDF) para `u` en (0,1). */
  quantile(u: number): number;
  /** Función de distribución acumulada. */
  cdf(x: number): number;
  mean(): number;
  variance(): number;
}

/** Envuelve un generador de uniformes `(0,1)` en una muestra de la distribución. */
export function muestrear(dist: Distribution, u: number): number {
  return dist.quantile(u);
}
