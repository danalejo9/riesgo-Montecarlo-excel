/**
 * Análisis de escenarios por cola (D1): **qué tiene que pasar** para que la
 * salida caiga en su 10 % más bajo (o más alto). El tornado dice qué entradas
 * se mueven con la salida en general; esto dice cómo están en los casos
 * malos (o buenos) de verdad. Sin Office.js.
 *
 * Para cada entrada numérica se compara su mediana en esas iteraciones con su
 * mediana en todas, en desviaciones típicas (el «desplazamiento»), y se da en
 * qué percentil de la entrada cae. Para cada entrada de texto, qué categoría
 * abunda más en esa cola respecto a lo normal.
 */

import { categoriasDe, type ModeloRiesgo } from '../engine/modelo/index.ts';

export interface FilaCola {
  id: string;
  nombre: string;
  ref: string;
  /** Mediana de la entrada en la cola y en todas las iteraciones (numéricas). */
  medianaCola?: number;
  mediana?: number;
  /** (mediana en la cola − mediana) / desviación de la entrada. */
  desplazamiento?: number;
  /** En qué percentil de la entrada cae su mediana en la cola (0..1). */
  percentil?: number;
  /** Entradas de texto: la categoría que más aumenta en la cola, y su proporción en la cola y en total. */
  categoria?: string;
  proporcionCola?: number;
  proporcion?: number;
}

export interface AnalisisCola {
  cola: 'baja' | 'alta';
  fraccion: number;
  filas: FilaCola[];
}

const FRACCION = 0.1;

function mediana(v: number[]): number {
  const o = [...v].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? (o[m] as number) : ((o[m - 1] as number) + (o[m] as number)) / 2;
}

export function analisisPorCola(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
  muestraSalida: ArrayLike<number>,
): AnalisisCola[] {
  const utiles: number[] = [];
  for (let k = 0; k < muestraSalida.length; k++) if (Number.isFinite(muestraSalida[k] as number)) utiles.push(k);
  const n = utiles.length;
  if (n < 50) return [];
  const orden = [...utiles].sort((a, b) => (muestraSalida[a] as number) - (muestraSalida[b] as number));
  const corte = Math.max(5, Math.floor(n * FRACCION));
  const colas: Array<{ cola: 'baja' | 'alta'; iteraciones: number[] }> = [
    { cola: 'baja', iteraciones: orden.slice(0, corte) },
    { cola: 'alta', iteraciones: orden.slice(n - corte) },
  ];

  return colas.map(({ cola, iteraciones }) => {
    const filas: FilaCola[] = [];
    modelo.inputs.forEach((e, i) => {
      const m = muestrasPorClave.get(clavesEntrada[i] as string);
      if (!m) return;
      const nombres = categoriasDe(e.dist);
      if (nombres) {
        const total = nombres.map(() => 0);
        const enCola = nombres.map(() => 0);
        for (const k of utiles) total[Math.round(m[k] as number)]! += 1;
        for (const k of iteraciones) enCola[Math.round(m[k] as number)]! += 1;
        let mejor = 0;
        let subida = -Infinity;
        nombres.forEach((_, c) => {
          const d = (enCola[c] as number) / iteraciones.length - (total[c] as number) / n;
          if (d > subida) { subida = d; mejor = c; }
        });
        filas.push({
          id: e.id, nombre: e.name, ref: e.ref, categoria: nombres[mejor] as string,
          proporcionCola: (enCola[mejor] as number) / iteraciones.length, proporcion: (total[mejor] as number) / n,
        });
        return;
      }
      const todos = utiles.map((k) => m[k] as number);
      const media = todos.reduce((a, b) => a + b, 0) / todos.length;
      const desv = Math.sqrt(todos.reduce((a, b) => a + (b - media) ** 2, 0) / Math.max(1, todos.length - 1));
      const med = mediana(todos);
      const medCola = mediana(iteraciones.map((k) => m[k] as number));
      const percentil = todos.filter((x) => x <= medCola).length / todos.length;
      filas.push({
        id: e.id, nombre: e.name, ref: e.ref, medianaCola: medCola, mediana: med,
        desplazamiento: desv > 0 ? (medCola - med) / desv : 0, percentil,
      });
    });
    const peso = (f: FilaCola) => (f.desplazamiento !== undefined ? Math.abs(f.desplazamiento) : 2 * ((f.proporcionCola ?? 0) - (f.proporcion ?? 0)));
    filas.sort((a, b) => peso(b) - peso(a));
    return { cola, fraccion: FRACCION, filas };
  });
}
