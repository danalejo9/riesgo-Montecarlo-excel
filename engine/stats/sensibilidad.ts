/**
 * Análisis de sensibilidad: **qué entrada mueve más cada salida**.
 *
 * Es la pregunta que sigue a "¿cuánto puede salir mal?": "¿y por culpa de
 * qué?". La respuesta clásica es el gráfico de tornado, y detrás de él hay una
 * medida por cada par entrada–salida.
 *
 * **La medida: correlación de rangos de Spearman.** Se ordenan las muestras de
 * la entrada y las de la salida, se sustituye cada valor por su puesto en la
 * ordenación, y se calcula la correlación de Pearson entre los puestos. Mide
 * si, cuando la entrada sube, la salida tiende a subir (ρ cerca de +1) o a
 * bajar (cerca de −1), **sin suponer que la relación sea una recta**. Un
 * margen que entra en un producto, un umbral de un `SI`, un tope de un `MIN`:
 * todo eso rompe la linealidad y Spearman lo aguanta, Pearson no.
 *
 * **El peso**, ρ² de cada entrada dividido entre la suma de todos los ρ², es
 * una lectura aproximada de "qué parte del efecto explica cada una". Es exacta
 * solo si las entradas son independientes y la relación es monótona; con
 * entradas correlacionadas entre sí se reparten el mérito y el peso lo
 * sobrestima para ambas. Por eso se enseña al lado de ρ y no en su lugar.
 *
 * **Sobre una muestra, no sobre todas las iteraciones.** Ordenar exige tener
 * los valores, y un millón de iteraciones por cincuenta entradas no cabe en
 * un panel. Se usan las primeras `LIMITE_MUESTRA_SENSIBILIDAD` iteraciones:
 * las iteraciones son independientes entre sí, así que las primeras son una
 * muestra aleatoria como cualquier otra, y con cien mil el error típico de ρ
 * ronda 0,003 — muy por debajo de lo que cambia el orden de un tornado.
 */

/** Cuántas iteraciones se retienen para el análisis de sensibilidad. */
export const LIMITE_MUESTRA_SENSIBILIDAD = 100_000;

export interface EntradaSensibilidad {
  id: string;
  muestras: ArrayLike<number>;
}

export interface FilaSensibilidad {
  id: string;
  /** Correlación de rangos de Spearman, entre −1 y 1. */
  spearman: number;
  /** ρ² normalizado: fracción (0..1) del total de ρ² de todas las entradas. */
  peso: number;
}

/**
 * Los puestos de cada valor (empezando en 1), con los empates repartidos: dos
 * valores iguales en los puestos 3 y 4 reciben 3,5 los dos. Sin eso, una
 * entrada discreta —un escenario 0/1— daría una correlación que depende del
 * orden en que el algoritmo de ordenación dejó los empates.
 */
export function rangos(v: ArrayLike<number>): Float64Array {
  const n = v.length;
  const orden = new Uint32Array(n);
  for (let i = 0; i < n; i++) orden[i] = i;
  orden.sort((a, b) => (v[a] as number) - (v[b] as number));

  const r = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && v[orden[j + 1] as number] === v[orden[i] as number]) j++;
    const medio = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[orden[k] as number] = medio;
    i = j + 1;
  }
  return r;
}

function pearson(x: Float64Array, y: Float64Array): number {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i] as number;
    my += y[i] as number;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] as number) - mx;
    const dy = (y[i] as number) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  // Una variable constante no se mueve con nada: correlación nula, no NaN.
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

/** Posiciones en las que la salida dio un número utilizable. */
function posicionesUtiles(salida: ArrayLike<number>): Uint32Array {
  let cuenta = 0;
  for (let i = 0; i < salida.length; i++) if (Number.isFinite(salida[i] as number)) cuenta++;
  const out = new Uint32Array(cuenta);
  let j = 0;
  for (let i = 0; i < salida.length; i++) if (Number.isFinite(salida[i] as number)) out[j++] = i;
  return out;
}

function tomar(v: ArrayLike<number>, pos: Uint32Array): Float64Array {
  const out = new Float64Array(pos.length);
  for (let i = 0; i < pos.length; i++) out[i] = v[pos[i] as number] as number;
  return out;
}

/** ρ de Spearman entre dos series alineadas, ignorando los pares sin número. */
export function spearman(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = Math.min(x.length, y.length);
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i] as number) && Number.isFinite(y[i] as number)) pos.push(i);
  }
  if (pos.length < 3) return 0;
  const p = Uint32Array.from(pos);
  return pearson(rangos(tomar(x, p)), rangos(tomar(y, p)));
}

/**
 * La sensibilidad de una salida a cada entrada, **ordenada de mayor a menor
 * |ρ|**, que es el orden del tornado.
 *
 * Las iteraciones en que la salida no dio número (una `TIR` sin raíz) se
 * apartan antes de ordenar, las mismas para todas las entradas: comparar
 * cada entrada contra un subconjunto distinto de iteraciones haría los ρ
 * incomparables entre sí.
 */
export function analizarSensibilidad(
  entradas: readonly EntradaSensibilidad[],
  salida: ArrayLike<number>,
): FilaSensibilidad[] {
  const pos = posicionesUtiles(salida);
  if (pos.length < 3) return entradas.map((e) => ({ id: e.id, spearman: 0, peso: 0 }));

  const rSalida = rangos(tomar(salida, pos));
  const filas = entradas.map((e) => ({
    id: e.id,
    spearman: pearson(rangos(tomar(e.muestras, pos)), rSalida),
    peso: 0,
  }));

  const total = filas.reduce((acc, f) => acc + f.spearman * f.spearman, 0);
  for (const f of filas) f.peso = total > 0 ? (f.spearman * f.spearman) / total : 0;

  return filas.sort((a, b) => Math.abs(b.spearman) - Math.abs(a.spearman));
}
