/**
 * Percentiles exactos: interpolación lineal sobre el array ordenado, igual
 * que `PERCENTILE.INC` de Excel (rango de la posición `p·(n-1)`, 0-index).
 * Es la referencia "exacta" que Fase 2 §3.3 exige poder distinguir del
 * t-digest aproximado — la UI debe indicar cuál de los dos se está usando.
 *
 * "Exacto" cuesta un `sort()` del buffer completo: aceptable hasta el umbral
 * de memoria que fije el ejecutor (Fase 2 §3.3); por encima de ese umbral se
 * usa `engine/stats/tdigest.ts`, no esta función.
 */
export function percentilesExactos(buffer: Float64Array, ps: readonly number[]): number[] {
  if (buffer.length === 0) throw new Error('PERCENTILES: el buffer no puede estar vacío');
  const ordenado = Float64Array.from(buffer).sort();
  return ps.map((p) => percentilDeOrdenado(ordenado, p));
}

export function percentilExacto(buffer: Float64Array, p: number): number {
  return percentilesExactos(buffer, [p])[0] as number;
}

function percentilDeOrdenado(ordenado: Float64Array, p: number): number {
  if (!(p >= 0 && p <= 1)) throw new Error(`PERCENTILES: p debe estar en [0,1] (recibido ${p})`);
  const n = ordenado.length;
  if (n === 1) return ordenado[0] as number;

  const posicion = p * (n - 1);
  const i0 = Math.floor(posicion);
  const i1 = Math.ceil(posicion);
  if (i0 === i1) return ordenado[i0] as number;

  const frac = posicion - i0;
  return (ordenado[i0] as number) * (1 - frac) + (ordenado[i1] as number) * frac;
}
