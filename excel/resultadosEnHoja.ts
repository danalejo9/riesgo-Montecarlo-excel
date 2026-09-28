/**
 * Traer a la hoja los resultados de la última simulación con funciones (B6):
 * `=RIESGO.MEDIA(C32)`, `=RIESGO.PERCENTIL(C32; 0,05)`, `=RIESGO.PROB(C32;
 * 0)`… La parte pura, sin Office.js.
 *
 * **Cómo llegan los resultados a las funciones.** Las funciones de Excel viven
 * en un proceso aparte del panel (`funciones.html`, sin runtime compartido: no
 * se toca el manifiesto). No ven ni la memoria del panel ni lo guardado en el
 * libro, pero las dos partes comparten `OfficeRuntime.storage`: al terminar
 * de simular, el panel deja ahí un resumen de cada salida (este «almacén») y
 * las funciones lo leen. Con el runtime compartido (etapa 2, B1) las
 * funciones podrán leer los resultados guardados en el libro; lo de aquí se
 * reutiliza entero.
 *
 * **Límites de esta versión**: el almacén es del equipo, no del libro. En
 * otro equipo las funciones dicen «simula primero» hasta que el panel se abre
 * (que vuelve a publicar los resultados guardados en el libro) o se simula.
 * Y dos libros abiertos con la misma hoja y celda comparten entrada: manda el
 * último que simuló.
 *
 * **Qué se guarda de cada salida**: media, desviación, mínimo, máximo y
 * 1.001 cuantiles (con ellos, cualquier percentil y la probabilidad de un
 * umbral con una resolución del 0,1 %); en las de texto, la frecuencia de
 * cada valor.
 */

// Solo tipos: este archivo va también en el paquete de las funciones de Excel
// (`ui/funciones.ts`), que tiene que quedar pequeño y sin el resto del panel.
import type { SimulacionCompletada } from './informe.ts';

export const CLAVE_ALMACEN_RESULTADOS = 'riesgoMontecarlo.resultadosHoja.v1';

export interface EstadisticasHoja {
  nombre: string;
  n: number;
  media: number;
  desv: number;
  min: number;
  max: number;
  cuantiles?: number[];
  categorias?: { valor: string; proporcion: number }[];
}

export interface AlmacenResultadosHoja {
  version: 1;
  guardadoEn: string;
  /** Por dirección normalizada (`MODELO!C32`). */
  salidas: Record<string, EstadisticasHoja>;
}

/**
 * Una dirección de Excel en la forma con la que se compara: sin libro
 * (`[Libro1]`), sin comillas, sin `$` y en mayúsculas. `'Mi hoja'!$C$5` y
 * `[Libro1]Mi hoja!C5` dan `MI HOJA!C5`.
 */
export function normalizarDireccion(direccion: string): string {
  let d = direccion.trim().replace(/^=/, '');
  d = d.replace(/^'?\[[^\]]*\]/, (m) => (m.startsWith("'") ? "'" : ''));
  const i = d.lastIndexOf('!');
  const hoja = i >= 0 ? d.slice(0, i).replace(/^'(.*)'$/, '$1').replace(/''/g, "'") : '';
  const celda = (i >= 0 ? d.slice(i + 1) : d).replace(/\$/g, '');
  return (hoja ? `${hoja}!${celda}` : celda).toUpperCase();
}

const recortar = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(10)) : x);
const CUANTILES = 1001;

/** Cuantiles equiespaciados a partir de la curva acumulada (puntos x, p con p creciente). */
function deCurva(cdf: readonly { x: number; p: number }[]): number[] {
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < CUANTILES; i++) {
    const p = i / (CUANTILES - 1);
    while (j < cdf.length - 2 && (cdf[j + 1] as { p: number }).p < p) j++;
    const a = cdf[j] as { x: number; p: number };
    const b = cdf[j + 1] as { x: number; p: number };
    const f = b.p > a.p ? Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))) : 0;
    out.push(a.x + (b.x - a.x) * f);
  }
  return out;
}

/** Cuantiles equiespaciados de una muestra ordenada (como `reducirACuantiles` de los resultados guardados). */
function reducir(ordenada: ArrayLike<number>): number[] {
  if (ordenada.length <= CUANTILES) return Array.from(ordenada);
  const out = new Array<number>(CUANTILES);
  for (let i = 0; i < CUANTILES; i++) out[i] = ordenada[Math.round((i / (CUANTILES - 1)) * (ordenada.length - 1))] as number;
  return out;
}

/** El almacén a partir de una simulación (recién hecha o restaurada del libro). */
export function construirAlmacen(resultado: SimulacionCompletada, ahora: Date = new Date()): AlmacenResultadosHoja {
  const salidas: Record<string, EstadisticasHoja> = {};
  for (const s of resultado.salidas) {
    const e: EstadisticasHoja = {
      nombre: s.nombre,
      n: s.resumen.n,
      media: s.resumen.media,
      desv: s.resumen.desviacion,
      min: s.resumen.min,
      max: s.resumen.max,
    };
    if (s.muestraOrdenada && s.muestraOrdenada.length > 0) {
      e.cuantiles = reducir(s.muestraOrdenada).map(recortar);
    } else if (s.cdf.length > 1) {
      e.cuantiles = deCurva(s.cdf).map(recortar);
    }
    if (s.categorias && s.categorias.length > 0) {
      e.categorias = s.categorias.map((c) => ({ valor: c.valor, proporcion: c.proporcion }));
    }
    for (const d of new Set([s.clave, s.ref].filter((x): x is string => Boolean(x)))) {
      salidas[normalizarDireccion(d)] = e;
    }
  }
  return { version: 1, guardadoEn: (resultado.restaurado?.guardadoEn ?? ahora.toISOString()), salidas };
}

export function leerAlmacen(texto: string | null | undefined): AlmacenResultadosHoja | null {
  if (!texto) return null;
  try {
    const j = JSON.parse(texto) as Partial<AlmacenResultadosHoja>;
    return j.version === 1 && j.salidas && typeof j.salidas === 'object' ? (j as AlmacenResultadosHoja) : null;
  } catch {
    return null;
  }
}

export type ValorFuncionResultado =
  | { ok: true; valor: number }
  | { ok: false; error: 'na' | 'valor' | 'num'; mensaje: string };

/** Las estadísticas de una salida, por su dirección o, si no, por su nombre. */
export function buscarSalida(almacen: AlmacenResultadosHoja | null, direccion: string | undefined, nombre?: unknown): EstadisticasHoja | null {
  if (!almacen) return null;
  if (direccion) {
    const d = normalizarDireccion(direccion);
    const exacta = almacen.salidas[d];
    if (exacta) return exacta;
    // Sin hoja (la función no siempre la da): la única salida con esa celda.
    if (!d.includes('!')) {
      const candidatas = Object.entries(almacen.salidas).filter(([k]) => k.endsWith(`!${d}`));
      if (candidatas.length === 1) return candidatas[0]?.[1] ?? null;
    }
  }
  if (typeof nombre === 'string' && nombre.trim() !== '') {
    const n = nombre.trim().toLowerCase();
    return Object.values(almacen.salidas).find((e) => e.nombre.toLowerCase() === n) ?? null;
  }
  return null;
}

/** El valor de `RIESGO.<id>` para una salida. `args` son los argumentos después de la celda. */
export function valorFuncionResultado(id: string, e: EstadisticasHoja | null, args: readonly unknown[]): ValorFuncionResultado {
  if (!e) {
    return { ok: false, error: 'na', mensaje: 'Sin resultados de esta celda: márcala como salida y simula' };
  }
  // En JSON, NaN e Infinity llegan como null: una salida sin ningún número.
  const sinNumeros = typeof e.media !== 'number' || !Number.isFinite(e.media);
  const numero = (): ValorFuncionResultado | null => {
    if (!sinNumeros) return null;
    return e.categorias
      ? { ok: false, error: 'valor', mensaje: `${e.nombre} es una salida de texto: usa RIESGO.PROB(celda; "valor")` }
      : { ok: false, error: 'na', mensaje: `${e.nombre}: ninguna iteración dio un número` };
  };
  const estadistico = (x: number): ValorFuncionResultado =>
    numero() ?? (Number.isFinite(x) ? { ok: true, valor: x } : { ok: false, error: 'na', mensaje: 'Sin dato' });

  switch (id) {
    case 'MEDIA':
      return estadistico(e.media);
    case 'DESV':
      return estadistico(e.desv);
    case 'MIN':
      return estadistico(e.min);
    case 'MAX':
      return estadistico(e.max);
    case 'PERCENTIL': {
      const falla = numero();
      if (falla) return falla;
      let p = aNumero(args[0]);
      if (p === null) return { ok: false, error: 'valor', mensaje: 'RIESGO.PERCENTIL necesita p, entre 0 y 1 (0,05 = p5)' };
      if (p > 1 && p <= 100) p /= 100; // «5» por «0,05»: se entiende igual
      if (p < 0 || p > 1) return { ok: false, error: 'num', mensaje: 'p tiene que estar entre 0 y 1' };
      if (!e.cuantiles || e.cuantiles.length < 2) return { ok: false, error: 'na', mensaje: 'Sin percentiles guardados: vuelve a simular' };
      return { ok: true, valor: cuantil(e.cuantiles, p) };
    }
    case 'PROB': {
      const umbral = args[0];
      const encima = args[1] === true || args[1] === 1 || (typeof args[1] === 'string' && /^(verdadero|true|encima|por encima)$/i.test(args[1].trim()));
      if (e.categorias && (typeof umbral === 'string' || typeof umbral === 'boolean')) {
        const buscado = String(umbral).trim().toLowerCase();
        const c = e.categorias.find((x) => x.valor.toLowerCase() === buscado);
        const p = c?.proporcion ?? 0;
        return { ok: true, valor: encima ? 1 - p : p };
      }
      const falla = numero();
      if (falla) return falla;
      const x = aNumero(umbral);
      if (x === null) return { ok: false, error: 'valor', mensaje: 'RIESGO.PROB necesita un umbral numérico' };
      if (!e.cuantiles || e.cuantiles.length < 2) return { ok: false, error: 'na', mensaje: 'Sin percentiles guardados: vuelve a simular' };
      const p = probabilidadHasta(e.cuantiles, x);
      return { ok: true, valor: encima ? 1 - p : p };
    }
    default:
      return { ok: false, error: 'valor', mensaje: `RIESGO.${id} no es una función de resultados` };
  }
}

function aNumero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Interpolación lineal entre los cuantiles guardados (equiespaciados de 0 a 1). */
export function cuantil(cuantiles: readonly number[], p: number): number {
  const pos = p * (cuantiles.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = cuantiles[i] as number;
  const b = cuantiles[Math.min(i + 1, cuantiles.length - 1)] as number;
  return a + (b - a) * f;
}

/** P(X ≤ x) a partir de los cuantiles: la inversa de `cuantil`. */
export function probabilidadHasta(cuantiles: readonly number[], x: number): number {
  const n = cuantiles.length;
  if (x < (cuantiles[0] as number)) return 0;
  if (x >= (cuantiles[n - 1] as number)) return 1;
  // El último cuantil ≤ x (con empates, el más alto: P(X ≤ x) incluye x).
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((cuantiles[mid] as number) <= x) lo = mid;
    else hi = mid - 1;
  }
  const a = cuantiles[lo] as number;
  const b = cuantiles[lo + 1] as number;
  const f = b > a ? (x - a) / (b - a) : 0;
  return (lo + f) / (n - 1);
}
