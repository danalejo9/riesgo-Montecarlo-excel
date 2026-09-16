/**
 * Correlación entre entradas por Iman–Conover (Fase 2 §8): reordena los
 * valores ya muestreados de cada variable para inducir una correlación de
 * rangos objetivo, sin tocar sus marginales — cada buffer conserva
 * exactamente el mismo multiconjunto de valores, solo cambia el orden en que
 * aparecen a lo largo de las iteraciones. Es lo que permite aplicar
 * correlación **después** de muestrear con cualquier distribución, sin que
 * el método (Monte Carlo o LHS) ni la distribución de cada variable tengan
 * que saber nada de las demás.
 *
 * Ajuste de D11: se aplica **por bloque, solo a los grupos de variables
 * efectivamente correlacionadas** que el usuario declare — normalmente unas
 * pocas, nunca la matriz completa de cientos de variables. Aplicarlo a todo
 * sería inviable en memoria y, para las variables sin correlación declarada,
 * innecesario: son independientes por definición.
 *
 * Referencia: Iman, R. L. and Conover, W. J. (1982), "A distribution-free
 * approach to inducing rank correlation among input variables".
 */
import { invNormalCDF } from '../distributions/mathfn.ts';
import { nuevoBuffer, type Buffer } from '../functions/types.ts';
import { uniformAt, streamOf } from '../random/index.ts';

/**
 * Reordena `buffers` (uno por variable del grupo, todos de la misma
 * longitud) para que su matriz de correlación de rangos se aproxime a
 * `correlacion` (simétrica, diagonal 1, definida positiva). Devuelve buffers
 * nuevos; no modifica los originales.
 *
 * `seed` y `salGrupo` fijan los flujos internos del algoritmo (los puntajes
 * de referencia), para que el resultado sea reproducible.
 */
export function correlacionarImanConover(
  buffers: readonly Buffer[],
  correlacion: readonly (readonly number[])[],
  seed: number,
  salGrupo: string,
): Buffer[] {
  const k = buffers.length;
  if (k === 0) return [];
  const n = (buffers[0] as Buffer).length;
  for (const b of buffers) {
    if (b.length !== n) throw new Error('IMAN-CONOVER: todos los buffers del grupo deben tener la misma longitud');
  }
  validarMatrizCorrelacion(correlacion, k);

  const cholesky = choleskyInferior(correlacion);

  // Matriz de referencia (n x k): puntajes normales de una permutación
  // aleatoria e independiente por columna. Es el "molde" sin correlación al
  // que luego se le aplica la estructura deseada.
  const referencia: Float64Array[] = [];
  for (let j = 0; j < k; j++) {
    referencia.push(puntuacionesVanDerWaerden(n, seed, streamOf(`${salGrupo}#iman-conover-${j}`)));
  }

  // T = R * C^T: aplica la correlación objetivo a los puntajes de referencia.
  const transformada: Float64Array[] = Array.from({ length: k }, () => nuevoBuffer(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      let acc = 0;
      for (let m = 0; m <= j; m++) acc += (cholesky[j]![m] as number) * (referencia[m] as Float64Array)[i]!;
      (transformada[j] as Float64Array)[i] = acc;
    }
  }

  // Cada columna de X se reordena para que su rango en la salida coincida
  // con el rango de su columna transformada: mismo multiconjunto de valores,
  // orden nuevo.
  return buffers.map((b, j) => reordenarPorRango(b, transformada[j] as Float64Array));
}

function validarMatrizCorrelacion(m: readonly (readonly number[])[], k: number): void {
  if (m.length !== k || m.some((fila) => fila.length !== k)) {
    throw new Error('IMAN-CONOVER: la matriz de correlación debe ser k x k, k = número de variables del grupo');
  }
  for (let i = 0; i < k; i++) {
    if (Math.abs((m[i]![i] as number) - 1) > 1e-9) {
      throw new Error('IMAN-CONOVER: la diagonal de la matriz de correlación debe ser 1');
    }
    for (let j = 0; j < k; j++) {
      if (Math.abs((m[i]![j] as number) - (m[j]![i] as number)) > 1e-9) {
        throw new Error('IMAN-CONOVER: la matriz de correlación debe ser simétrica');
      }
    }
  }
}

/** Puntajes normales de van der Waerden sobre una permutación aleatoria de 1..n. */
function puntuacionesVanDerWaerden(n: number, seed: number, stream: number): Float64Array {
  const orden = new Uint32Array(n);
  for (let i = 0; i < n; i++) orden[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(uniformAt(seed, stream, n - 1 - i) * (i + 1));
    const tmp = orden[i] as number;
    orden[i] = orden[j] as number;
    orden[j] = tmp;
  }

  const puntuaciones = nuevoBuffer(n);
  for (let i = 0; i < n; i++) {
    const rango = (orden[i] as number) + 1; // 1..n
    puntuaciones[i] = invNormalCDF((rango - 0.5) / n);
  }
  return puntuaciones;
}

/**
 * Factorización de Cholesky `L` (triangular inferior) tal que `L·Lᵀ = m`.
 * `m` debe ser simétrica definida positiva; si no lo es, el algoritmo lo
 * delata con una raíz de negativo, reportada como error explícito en vez de
 * un `NaN` silencioso.
 */
function choleskyInferior(m: readonly (readonly number[])[]): number[][] {
  const k = m.length;
  const L: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));

  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let suma = (m[i]![j] as number);
      for (let p = 0; p < j; p++) suma -= (L[i]![p] as number) * (L[j]![p] as number);

      if (i === j) {
        if (suma <= 0) {
          throw new Error('IMAN-CONOVER: la matriz de correlación no es definida positiva');
        }
        L[i]![j] = Math.sqrt(suma);
      } else {
        L[i]![j] = suma / (L[j]![j] as number);
      }
    }
  }
  return L;
}

/** Reordena `valores` para que su orden coincida con el rango de `guia`. */
function reordenarPorRango(valores: Buffer, guia: Float64Array): Buffer {
  const n = valores.length;
  const ordenValores = Float64Array.from(valores).sort();

  const indicesGuia = Array.from({ length: n }, (_, i) => i);
  indicesGuia.sort((a, b) => (guia[a] as number) - (guia[b] as number));

  const out = nuevoBuffer(n);
  for (let rango = 0; rango < n; rango++) {
    out[indicesGuia[rango] as number] = ordenValores[rango] as number;
  }
  return out;
}
