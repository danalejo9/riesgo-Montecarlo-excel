/**
 * Análisis de las variables de texto (T2, T3, T6). Sin Office.js.
 *
 * - **Frecuencias** de una salida de texto o de sí/no: cada valor con sus
 *   iteraciones y su proporción.
 * - **Qué entradas deciden** cada valor: con qué probabilidad sale cuando una
 *   entrada numérica está en su 10 % más bajo frente a su 10 % más alto (la
 *   misma idea que la araña, en probabilidades).
 * - **Cruce por categoría**: para cada entrada de texto, la salida en cada una
 *   de sus categorías — media y rango si es numérica, el valor más frecuente
 *   si es de texto.
 *
 * Todo sale de las muestras retenidas (las primeras 100.000 iteraciones), que
 * están alineadas iteración a iteración entre entradas y salidas.
 */

import { categoriasDe, type ModeloRiesgo } from '../engine/modelo/index.ts';

export interface FilaCategoria {
  valor: string;
  conteo: number;
  proporcion: number;
}

export interface FilaDecisiva {
  id: string;
  nombre: string;
  ref: string;
  /** Probabilidad del valor cuando la entrada está en su 10 % más bajo. */
  bajo: number;
  /** … y en su 10 % más alto. */
  alto: number;
  /** |alto − bajo|: cuánto mueve esa entrada la probabilidad del valor. */
  rango: number;
}

export interface Decisivas {
  valor: string;
  filas: FilaDecisiva[];
}

export interface FilaPorCategoria {
  categoria: string;
  /** Proporción de iteraciones en que la entrada valió esta categoría. */
  proporcion: number;
  n: number;
  media?: number;
  p5?: number;
  p50?: number;
  p95?: number;
  /** Para salidas de texto: el valor que más sale con esta categoría, y con qué probabilidad. */
  masFrecuente?: string;
  probabilidad?: number;
}

export interface PorCategoria {
  id: string;
  nombre: string;
  ref: string;
  filas: FilaPorCategoria[];
}

/** Los valores de más a menos frecuente. */
export function frecuenciasDe(conteos: Readonly<Record<string, number>>): FilaCategoria[] {
  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return Object.entries(conteos)
    .map(([valor, conteo]) => ({ valor, conteo, proporcion: conteo / total }))
    .sort((a, b) => b.conteo - a.conteo || a.valor.localeCompare(b.valor));
}

/** Cuántos valores de la salida se analizan (los más frecuentes). */
const VALORES_ANALIZADOS = 4;
const FRACCION_COLA = 0.1;

export function entradasQueDeciden(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
  muestraTexto: readonly (string | null)[],
  frecuencias: readonly FilaCategoria[],
): Decisivas[] {
  const n = muestraTexto.length;
  if (n < 20) return [];
  const valores = frecuencias.slice(0, VALORES_ANALIZADOS).map((f) => f.valor);
  if (valores.length === 0) return [];

  // Para cada entrada numérica, las iteraciones de su cola baja y alta.
  const colas = modelo.inputs.flatMap((e, i) => {
    if (e.dist.type === 'categorical') return [];
    const m = muestrasPorClave.get(clavesEntrada[i] as string);
    if (!m || m.length < n) return [];
    const orden = Array.from({ length: n }, (_, k) => k).sort((a, b) => (m[a] as number) - (m[b] as number));
    const corte = Math.max(1, Math.floor(n * FRACCION_COLA));
    return [{ e, bajas: orden.slice(0, corte), altas: orden.slice(n - corte) }];
  });

  const prob = (iteraciones: readonly number[], valor: string) =>
    iteraciones.filter((k) => muestraTexto[k] === valor).length / iteraciones.length;

  return valores.map((valor) => ({
    valor,
    filas: colas
      .map(({ e, bajas, altas }) => {
        const bajo = prob(bajas, valor);
        const alto = prob(altas, valor);
        return { id: e.id, nombre: e.name, ref: e.ref, bajo, alto, rango: Math.abs(alto - bajo) };
      })
      .sort((a, b) => b.rango - a.rango),
  }));
}

function percentilOrdenado(ordenada: readonly number[], p: number): number {
  const i = Math.min(ordenada.length - 1, Math.max(0, Math.round(p * (ordenada.length - 1))));
  return ordenada[i] as number;
}

/**
 * La salida en cada categoría de cada entrada de texto. `muestraNumerica` para
 * las salidas numéricas, `muestraTexto` para las de texto; se usa la que haya.
 */
export function salidaPorCategoria(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
  muestraNumerica: ArrayLike<number> | undefined,
  muestraTexto: readonly (string | null)[] | undefined,
): PorCategoria[] {
  const out: PorCategoria[] = [];
  modelo.inputs.forEach((e, i) => {
    const nombres = categoriasDe(e.dist);
    const indices = muestrasPorClave.get(clavesEntrada[i] as string);
    if (!nombres || !indices) return;
    const n = Math.min(indices.length, muestraNumerica?.length ?? muestraTexto?.length ?? 0);
    if (n === 0) return;

    const grupos = nombres.map(() => ({ numeros: [] as number[], textos: new Map<string, number>(), n: 0 }));
    for (let k = 0; k < n; k++) {
      const g = grupos[Math.round(indices[k] as number)];
      if (!g) continue;
      g.n++;
      const x = muestraNumerica?.[k];
      if (x !== undefined && Number.isFinite(x)) g.numeros.push(x);
      const t = muestraTexto?.[k];
      if (t !== undefined && t !== null) g.textos.set(t, (g.textos.get(t) ?? 0) + 1);
    }

    const filas: FilaPorCategoria[] = nombres.map((categoria, c) => {
      const g = grupos[c] as (typeof grupos)[number];
      const fila: FilaPorCategoria = { categoria, proporcion: g.n / n, n: g.n };
      if (g.numeros.length > 0) {
        const ordenada = g.numeros.sort((a, b) => a - b);
        fila.media = ordenada.reduce((a, b) => a + b, 0) / ordenada.length;
        fila.p5 = percentilOrdenado(ordenada, 0.05);
        fila.p50 = percentilOrdenado(ordenada, 0.5);
        fila.p95 = percentilOrdenado(ordenada, 0.95);
      }
      if (g.textos.size > 0) {
        const [valor, veces] = [...g.textos.entries()].sort((a, b) => b[1] - a[1])[0] as [string, number];
        fila.masFrecuente = valor;
        fila.probabilidad = veces / g.n;
      }
      return fila;
    });
    out.push({ id: e.id, nombre: e.name, ref: e.ref, filas });
  });
  return out;
}

/**
 * Todo el análisis de texto de una salida, listo para añadirlo a su
 * resultado: frecuencias, qué entradas lo deciden y el cruce por categoría.
 */
export function analisisDeTexto(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
  salida: { categorias?: Readonly<Record<string, number>>; muestraTexto?: readonly (string | null)[]; muestra?: ArrayLike<number> },
): { categorias?: FilaCategoria[]; muestraTexto?: (string | null)[]; decisivas?: Decisivas[]; porCategoria?: PorCategoria[] } {
  const out: ReturnType<typeof analisisDeTexto> = {};
  const frecuencias = salida.categorias ? frecuenciasDe(salida.categorias) : [];
  if (frecuencias.length > 0) out.categorias = frecuencias;
  if (salida.muestraTexto && salida.muestraTexto.some((t) => t !== null)) {
    out.muestraTexto = [...salida.muestraTexto];
    const d = entradasQueDeciden(modelo, clavesEntrada, muestrasPorClave, salida.muestraTexto, frecuencias);
    if (d.some((x) => x.filas.length > 0)) out.decisivas = d;
  }
  // Si es de texto de verdad (no un sí/no), la parte numérica no cuenta.
  const numerica = salida.muestraTexto && !salida.muestra ? undefined : salida.muestra;
  const pc = salidaPorCategoria(modelo, clavesEntrada, muestrasPorClave, numerica, salida.muestraTexto);
  if (pc.length > 0) out.porCategoria = pc;
  return out;
}

/**
 * ¿Es una salida de texto o de sí/no (se enseña por frecuencias) y no una
 * numérica con algún texto suelto? Lo es si todo lo que dio fue texto o
 * lógico: los lógicos cuentan también como 1/0, así que basta con que las
 * categorías cubran todas las iteraciones con número.
 */
export function esSalidaDeTexto(s: { categorias?: readonly FilaCategoria[]; resumen: { n: number } }): boolean {
  if (!s.categorias || s.categorias.length === 0) return false;
  const total = s.categorias.reduce((a, c) => a + c.conteo, 0);
  return total >= s.resumen.n;
}

/** Probabilidad de que la salida valga `valor` (exacta: sale de los recuentos de todas las iteraciones). */
export function probabilidadDeValor(categorias: readonly FilaCategoria[] | undefined, valor: string): number | undefined {
  if (!categorias || categorias.length === 0) return undefined;
  const total = categorias.reduce((a, c) => a + c.conteo, 0);
  return total > 0 ? (categorias.find((c) => c.valor === valor)?.conteo ?? 0) / total : undefined;
}
