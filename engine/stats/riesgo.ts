/**
 * Medidas de riesgo de una salida (H2), sobre su muestra ordenada.
 *
 * Una salida puede ser una ganancia (lo malo es la cola baja: el VAN) o un
 * coste (lo malo es la cola alta: el presupuesto), y el motor no sabe cuál.
 * Por eso se dan **las dos colas**:
 *
 * - **VaR al 5 %**: el valor que solo el 5 % de las iteraciones empeora — el
 *   p5 por abajo y el p95 por arriba.
 * - **CVaR (o déficit esperado)**: la media de ese 5 % peor. Dice cuánto de
 *   malo es lo malo, que el VaR no dice.
 *
 * Y la forma: **asimetría** (> 0, cola larga a la derecha), **curtosis en
 * exceso** (> 0, colas más gruesas que una normal) y **semidesviación** (la
 * desviación contando solo lo que queda por debajo de la media).
 */

export interface MedidasRiesgo {
  nivel: number;
  varInferior: number;
  cvarInferior: number;
  varSuperior: number;
  cvarSuperior: number;
  asimetria: number;
  curtosis: number;
  semidesviacion: number;
}

export function medidasDeRiesgo(ordenada: ArrayLike<number>, nivel = 0.05): MedidasRiesgo | null {
  const n = ordenada.length;
  if (n < 20) return null;
  let suma = 0;
  for (let i = 0; i < n; i++) suma += ordenada[i] as number;
  const media = suma / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  let abajo = 0;
  for (let i = 0; i < n; i++) {
    const d = (ordenada[i] as number) - media;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
    if (d < 0) abajo += d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  const k = Math.max(1, Math.floor(n * nivel));
  let colaBaja = 0;
  let colaAlta = 0;
  for (let i = 0; i < k; i++) {
    colaBaja += ordenada[i] as number;
    colaAlta += ordenada[n - 1 - i] as number;
  }
  return {
    nivel,
    varInferior: ordenada[k - 1] as number,
    cvarInferior: colaBaja / k,
    varSuperior: ordenada[n - k] as number,
    cvarSuperior: colaAlta / k,
    asimetria: m2 > 0 ? m3 / m2 ** 1.5 : 0,
    curtosis: m2 > 0 ? m4 / (m2 * m2) - 3 : 0,
    semidesviacion: Math.sqrt(abajo / n),
  };
}
