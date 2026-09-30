/**
 * Búsqueda de objetivo con riesgo (H4): «¿qué valor de esta celda hace que
 * P(VAN < 0) quede en el 10 %?». Bisección sobre simulaciones completas, cada
 * una con la misma semilla (números aleatorios comunes): así la probabilidad
 * cambia con el valor de la celda y no con el azar, y la bisección converge.
 * Aquí la parte pura; la simulación de cada punto la pone quien llama.
 */

export interface PeticionBusqueda {
  /** La celda que se ajusta: `Modelo!C5`. */
  ref: string;
  desde: number;
  hasta: number;
  /** La salida cuyo umbral se vigila. */
  idSalida: string;
  umbral: { valor: number; sentido: 'below' | 'above' };
  /** La probabilidad que se quiere (0..1). */
  objetivo: number;
}

export interface ResultadoBusqueda {
  /** Cada simulación hecha: el valor de la celda y la probabilidad que dio. */
  puntos: { valor: number; prob: number }[];
  /** El valor que da la probabilidad objetivo (si está en el rango). */
  solucion?: number;
  /** La probabilidad en la solución. */
  probSolucion?: number;
  motivo?: string;
}

/** Cuántas simulaciones, como mucho, además de los dos extremos. */
export const PASOS_BUSQUEDA = 14;

export async function biseccion(
  evaluar: (x: number) => Promise<number>,
  desde: number,
  hasta: number,
  objetivo: number,
  pasos = PASOS_BUSQUEDA,
): Promise<ResultadoBusqueda> {
  const puntos: { valor: number; prob: number }[] = [];
  const medir = async (x: number) => {
    const p = await evaluar(x);
    puntos.push({ valor: x, prob: p });
    return p;
  };
  let a = Math.min(desde, hasta);
  let b = Math.max(desde, hasta);
  let pa = await medir(a);
  const pb = await medir(b);
  if (!Number.isFinite(pa) || !Number.isFinite(pb)) return { puntos, motivo: 'La salida no dio un número en alguno de los extremos.' };
  if ((pa - objetivo) * (pb - objetivo) > 0) {
    return {
      puntos,
      motivo: `En ese rango la probabilidad va del ${pct(pa)} al ${pct(pb)}: no pasa por el ${pct(objetivo)}. Amplía el rango.`,
    };
  }
  if (pa === objetivo) return { puntos, solucion: a, probSolucion: pa };
  if (pb === objetivo) return { puntos, solucion: b, probSolucion: pb };
  const tolerancia = (b - a) * 1e-4;
  for (let i = 0; i < pasos && b - a > tolerancia; i++) {
    const m = (a + b) / 2;
    const pm = await medir(m);
    if (!Number.isFinite(pm)) return { puntos, motivo: `La salida no dio un número con ${m}.` };
    // A menos de 0,1 puntos del objetivo: más simulaciones no cambian la respuesta.
    if (Math.abs(pm - objetivo) < 0.001) break;
    if ((pm - objetivo) * (pa - objetivo) <= 0) b = m;
    else {
      a = m;
      pa = pm;
    }
  }
  // La mejor estimación: el punto medido más cercano al objetivo.
  const mejor = puntos.reduce((x, y) => (Math.abs(y.prob - objetivo) < Math.abs(x.prob - objetivo) ? y : x));
  return { puntos, solucion: mejor.valor, probSolucion: mejor.prob };
}

function pct(p: number): string {
  return `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}
