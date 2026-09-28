/**
 * Las funciones **`RIESGO.*`** que el usuario escribe en una celda para
 * declararla incierta sin pasar por el panel: `=RIESGO.NORMAL(100; 15)`.
 *
 * Es como se trabaja en @RISK y Crystal Ball, y lo primero que busca quien
 * viene de ellos. La celda queda documentada en la propia hoja —quien abra el
 * libro ve la distribución en la barra de fórmulas— y copiarla a otra celda
 * copia también la incertidumbre.
 *
 * Aquí está la parte pura: qué funciones hay, con qué parámetros, y cómo se
 * convierte una fórmula en una distribución del modelo. En Excel, fuera de la
 * simulación, cada función devuelve **la media** de su distribución (ver
 * `ui/funciones.ts`), así que el libro sigue calculando con normalidad.
 *
 * **Solo argumentos constantes**, y la función tiene que ser toda la fórmula.
 * `=RIESGO.NORMAL(B2; 15)` o `=1+RIESGO.NORMAL(…)` se rechazan con la celda y
 * el motivo: un parámetro que depende de otra celda puede cambiar durante la
 * simulación, y esa semántica (distribuciones que dependen de otras) es otra
 * cosa que no se va a fingir. Se aceptan también los nombres `RISK.*`, que es
 * el prefijo que ya reconoce el escáner.
 */

import { parsear } from '../parser/parse.ts';
import type { Nodo } from '../parser/ast.ts';
import { construirDesdeDescriptor } from '../distributions/index.ts';
import { toDescriptor, type DistributionSpec } from './distributionSchema.ts';

export interface FuncionRiesgo {
  /** Lo que va detrás de `RIESGO.`: `NORMAL`. */
  id: string;
  descripcion: string;
  parametros: { nombre: string; descripcion: string }[];
  construir: (a: number[]) => DistributionSpec;
}

export const FUNCIONES_RIESGO: readonly FuncionRiesgo[] = [
  {
    id: 'NORMAL', descripcion: 'Distribución normal: simétrica alrededor de la media.',
    parametros: [{ nombre: 'media', descripcion: 'Media' }, { nombre: 'desviacion', descripcion: 'Desviación típica (> 0)' }],
    construir: ([mean, stdDev]) => ({ type: 'normal', mean: mean as number, stdDev: stdDev as number }),
  },
  {
    id: 'LOGNORMAL', descripcion: 'Lognormal: positiva y con cola a la derecha. Parámetros de la propia variable.',
    parametros: [{ nombre: 'media', descripcion: 'Media de la variable (> 0)' }, { nombre: 'desviacion', descripcion: 'Desviación típica de la variable (> 0)' }],
    construir: ([p1, p2]) => ({ type: 'lognormal', p1: p1 as number, p2: p2 as number }),
  },
  {
    id: 'LOGNORMAL2', descripcion: 'Lognormal con los parámetros del logaritmo: mu y sigma de ln(X).',
    parametros: [{ nombre: 'mu', descripcion: 'Media del logaritmo' }, { nombre: 'sigma', descripcion: 'Desviación típica del logaritmo (> 0)' }],
    construir: ([p1, p2]) => ({ type: 'lognormal', p1: p1 as number, p2: p2 as number, parametrization: 'log' }),
  },
  {
    id: 'UNIFORME', descripcion: 'Uniforme: cualquier valor entre el mínimo y el máximo, con la misma probabilidad.',
    parametros: [{ nombre: 'minimo', descripcion: 'Mínimo' }, { nombre: 'maximo', descripcion: 'Máximo' }],
    construir: ([min, max]) => ({ type: 'uniform', min: min as number, max: max as number }),
  },
  {
    id: 'TRIANGULAR', descripcion: 'Triangular: mínimo, más probable y máximo.',
    parametros: [{ nombre: 'minimo', descripcion: 'Mínimo' }, { nombre: 'moda', descripcion: 'Valor más probable' }, { nombre: 'maximo', descripcion: 'Máximo' }],
    construir: ([min, mode, max]) => ({ type: 'triangular', min: min as number, mode: mode as number, max: max as number }),
  },
  {
    id: 'PERT', descripcion: 'PERT: como la triangular, pero con más peso en el valor más probable.',
    parametros: [{ nombre: 'minimo', descripcion: 'Mínimo' }, { nombre: 'moda', descripcion: 'Valor más probable' }, { nombre: 'maximo', descripcion: 'Máximo' }],
    construir: ([min, mode, max]) => ({ type: 'pert', min: min as number, mode: mode as number, max: max as number }),
  },
  {
    id: 'BETA', descripcion: 'Beta: proporciones entre 0 y 1.',
    parametros: [{ nombre: 'alfa', descripcion: 'Alfa (> 0)' }, { nombre: 'beta', descripcion: 'Beta (> 0)' }],
    construir: ([alpha, beta]) => ({ type: 'beta', alpha: alpha as number, beta: beta as number }),
  },
  {
    id: 'GAMMA', descripcion: 'Gamma: tiempos y cantidades positivas.',
    parametros: [{ nombre: 'forma', descripcion: 'Forma (> 0)' }, { nombre: 'escala', descripcion: 'Escala (> 0)' }],
    construir: ([shape, scale]) => ({ type: 'gamma', shape: shape as number, scale: scale as number }),
  },
  {
    id: 'EXPON', descripcion: 'Exponencial: tiempo hasta un suceso.',
    parametros: [{ nombre: 'lambda', descripcion: 'Tasa (> 0); la media es 1/lambda' }],
    construir: ([lambda]) => ({ type: 'exponential', lambda: lambda as number }),
  },
  {
    id: 'WEIBULL', descripcion: 'Weibull: vida útil y tiempos de fallo.',
    parametros: [{ nombre: 'forma', descripcion: 'Forma (> 0)' }, { nombre: 'escala', descripcion: 'Escala (> 0)' }],
    construir: ([shape, scale]) => ({ type: 'weibull', shape: shape as number, scale: scale as number }),
  },
  {
    id: 'BERNOULLI', descripcion: 'Bernoulli: 1 con probabilidad p, 0 si no. Un suceso que ocurre o no.',
    parametros: [{ nombre: 'p', descripcion: 'Probabilidad (0 a 1)' }],
    construir: ([p]) => ({ type: 'bernoulli', p: p as number }),
  },
  {
    id: 'BINOMIAL', descripcion: 'Binomial: cuántos éxitos en n intentos.',
    parametros: [{ nombre: 'n', descripcion: 'Intentos' }, { nombre: 'p', descripcion: 'Probabilidad de éxito' }],
    construir: ([n, p]) => ({ type: 'binomial', n: n as number, p: p as number }),
  },
  {
    id: 'POISSON', descripcion: 'Poisson: cuántos sucesos en un periodo.',
    parametros: [{ nombre: 'lambda', descripcion: 'Media de sucesos (> 0)' }],
    construir: ([lambda]) => ({ type: 'poisson', lambda: lambda as number }),
  },
];

const POR_ID = new Map(FUNCIONES_RIESGO.map((f) => [f.id, f] as const));

/** `RIESGO.NORMAL`, `RISK.NORMAL`, o como los guarde Excel en el XML → `NORMAL`. */
export function idDeFuncionRiesgo(nombre: string): string | null {
  const n = nombre.toUpperCase().replace(/^_XLUDF\./, '').replace(/^_XLFN\./, '');
  const m = /^(?:RIESGO|RISK)\.(.+)$/.exec(n);
  return m ? (m[1] as string) : null;
}

/** ¿Menciona la fórmula alguna función `RIESGO.*`? Barato, sin parsear. */
export function mencionaRiesgo(formula: string): boolean {
  return /\b(?:_xludf\.)?(?:RIESGO|RISK)\.[A-Z]/i.test(formula);
}

export type LecturaFuncionRiesgo =
  | { ok: true; id: string; spec: DistributionSpec; media: number | string }
  | { ok: false; motivo: string };

/**
 * `RIESGO.CATEGORIA(valores; pesos)` (T4): una entrada de texto. No va en
 * `FUNCIONES_RIESGO` porque sus argumentos son **listas** (una matriz
 * `{"Norte";"Sur"}` o un rango de la hoja), no números. Fuera de la
 * simulación enseña el valor más probable.
 */
export const FUNCION_CATEGORIA = {
  id: 'CATEGORIA',
  descripcion: 'Entrada de texto: cada valor con su probabilidad (Norte, Sur, Este…).',
  parametros: [
    { nombre: 'valores', descripcion: 'Los textos posibles: un rango o una lista {"Norte";"Sur"}' },
    { nombre: 'pesos', descripcion: 'La probabilidad o el peso de cada uno, en el mismo orden' },
  ],
} as const;

/** Lee los valores de un rango de la hoja (lo pone quien tiene el libro leído). */
export type LectorDeRango = (rango: Extract<Nodo, { tipo: 'rango' | 'celda' }>) => unknown[] | null;

function listaDe(n: Nodo, lector?: LectorDeRango): unknown[] | null {
  if (n.tipo === 'matriz') {
    return n.filas.flat().map((x) => (x.tipo === 'texto' || x.tipo === 'numero' ? x.valor : x.tipo === 'unaria' ? constante(x) : null));
  }
  if ((n.tipo === 'rango' || n.tipo === 'celda') && lector) return lector(n);
  return null;
}

/** La distribución de `RIESGO.CATEGORIA`, a partir de sus dos listas. */
export function categoriaDesdeListas(valores: readonly unknown[], pesos: readonly unknown[]): { spec: DistributionSpec; masProbable: string } | string {
  if (valores.length !== pesos.length) return 'RIESGO.CATEGORIA necesita un peso por cada valor';
  const categories: string[] = [];
  const weights: number[] = [];
  valores.forEach((v, i) => {
    if (v === null || v === undefined || String(v).trim() === '') return;
    const p = typeof pesos[i] === 'number' ? (pesos[i] as number) : Number(String(pesos[i] ?? '').replace(',', '.'));
    categories.push(String(v).trim());
    weights.push(p);
  });
  if (categories.length === 0) return 'RIESGO.CATEGORIA necesita al menos un valor';
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) return 'los pesos de RIESGO.CATEGORIA tienen que ser números no negativos';
  const spec: DistributionSpec = { type: 'categorical', categories, weights };
  try {
    construirDesdeDescriptor(toDescriptor(spec));
  } catch (e) {
    return `parámetros no válidos para RIESGO.CATEGORIA: ${e instanceof Error ? e.message : String(e)}`;
  }
  const i = weights.reduce((mejor, w, k) => (w > (weights[mejor] as number) ? k : mejor), 0);
  return { spec, masProbable: categories[i] as string };
}

function constante(n: Nodo): number | null {
  if (n.tipo === 'numero') return n.valor;
  if (n.tipo === 'unaria' && n.arg.tipo === 'numero') return n.op === '-' ? -n.arg.valor : n.arg.valor;
  return null;
}

/**
 * `RIESGO.DISCRETA(valores; pesos)` y `RIESGO.TRUNCAR(distribución; mín; máx)`
 * (B4): como `CATEGORIA`, no van en `FUNCIONES_RIESGO` porque sus argumentos
 * no son solo números.
 */
export const FUNCION_DISCRETA = {
  id: 'DISCRETA',
  descripcion: 'Discreta: una lista de valores posibles, cada uno con su peso.',
  parametros: [
    { nombre: 'valores', descripcion: 'Los valores posibles: un rango o una lista {1;2;3}' },
    { nombre: 'pesos', descripcion: 'El peso de cada uno, en el mismo orden' },
  ],
} as const;

export const FUNCION_TRUNCAR = {
  id: 'TRUNCAR',
  descripcion: 'Acota otra función RIESGO: descarta lo que cae fuera de [mínimo, máximo].',
  parametros: [
    { nombre: 'distribucion', descripcion: 'Una función RIESGO, p. ej. RIESGO.NORMAL(100;10)' },
    { nombre: 'minimo', descripcion: 'Límite inferior' },
    { nombre: 'maximo', descripcion: 'Límite superior' },
  ],
} as const;

/** `RIESGO.EMPIRICA(datos)` (I1): los datos históricos tal cual, cada valor con su frecuencia. */
export const FUNCION_EMPIRICA = {
  id: 'EMPIRICA',
  descripcion: 'Empírica: los datos históricos tal cual; cada valor observado con la frecuencia con que aparece.',
  parametros: [{ nombre: 'datos', descripcion: 'Un rango con los datos históricos (números)' }],
} as const;

export function empiricaDesdeLista(datos: readonly unknown[]): { spec: DistributionSpec; media: number } | string {
  const numeros = datos.filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
  if (numeros.length < 2) return 'RIESGO.EMPIRICA necesita al menos 2 números';
  const cuenta = new Map<number, number>();
  for (const v of numeros) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  const values = [...cuenta.keys()].sort((a, b) => a - b);
  const spec: DistributionSpec = { type: 'discrete', values, weights: values.map((v) => cuenta.get(v) as number) };
  return { spec, media: numeros.reduce((a, b) => a + b, 0) / numeros.length };
}

/** La distribución de `RIESGO.DISCRETA`, a partir de sus dos listas. */
export function discretaDesdeListas(valores: readonly unknown[], pesos: readonly unknown[]): { spec: DistributionSpec; media: number } | string {
  if (valores.length !== pesos.length) return 'RIESGO.DISCRETA necesita un peso por cada valor';
  const values: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < valores.length; i++) {
    if (valores[i] === null || valores[i] === undefined || valores[i] === '') continue;
    const v = typeof valores[i] === 'number' ? (valores[i] as number) : Number(String(valores[i]).replace(',', '.'));
    const p = typeof pesos[i] === 'number' ? (pesos[i] as number) : Number(String(pesos[i] ?? '').replace(',', '.'));
    if (!Number.isFinite(v)) return 'los valores de RIESGO.DISCRETA tienen que ser números (para textos, RIESGO.CATEGORIA)';
    if (!Number.isFinite(p) || p < 0) return 'los pesos de RIESGO.DISCRETA tienen que ser números no negativos';
    values.push(v);
    weights.push(p);
  }
  if (values.length === 0) return 'RIESGO.DISCRETA necesita al menos un valor';
  const spec: DistributionSpec = { type: 'discrete', values, weights };
  try {
    return { spec, media: construirDesdeDescriptor(toDescriptor(spec)).mean() };
  } catch (e) {
    return `parámetros no válidos para RIESGO.DISCRETA: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Convierte la fórmula de una celda en su distribución, o dice por qué no.
 * `lector` resuelve los rangos de `RIESGO.CATEGORIA` y `RIESGO.DISCRETA` con
 * el libro ya leído.
 */
export function leerFuncionRiesgo(formula: string, lector?: LectorDeRango): LecturaFuncionRiesgo {
  const r = parsear(formula.replace(/^=/, ''));
  if (!r.ok) return { ok: false, motivo: `la fórmula no se entiende: ${r.error.mensaje}` };
  const raiz = r.ast;
  if (raiz.tipo !== 'funcion' || idDeFuncionRiesgo(raiz.nombre) === null) {
    return { ok: false, motivo: 'la función RIESGO tiene que ser toda la fórmula de la celda (no parte de una operación)' };
  }
  return leerNodoRiesgo(raiz, lector);
}

function leerNodoRiesgo(raiz: Extract<Nodo, { tipo: 'funcion' }>, lector?: LectorDeRango): LecturaFuncionRiesgo {
  const id = idDeFuncionRiesgo(raiz.nombre) as string;
  if (id === FUNCION_CATEGORIA.id || id === FUNCION_DISCRETA.id) {
    if (raiz.args.length !== 2) return { ok: false, motivo: `RIESGO.${id} necesita 2 argumentos: valores; pesos` };
    const valores = listaDe(raiz.args[0] as Nodo, lector);
    const pesos = listaDe(raiz.args[1] as Nodo, lector);
    if (!valores || !pesos) {
      return { ok: false, motivo: `los argumentos de RIESGO.${id} tienen que ser rangos de la hoja con valores escritos, o listas como {1;2;3}` };
    }
    if (id === FUNCION_DISCRETA.id) {
      const d = discretaDesdeListas(valores, pesos);
      return typeof d === 'string' ? { ok: false, motivo: d } : { ok: true, id, spec: d.spec, media: d.media };
    }
    const c = categoriaDesdeListas(valores, pesos);
    if (typeof c === 'string') return { ok: false, motivo: c };
    return { ok: true, id, spec: c.spec, media: c.masProbable };
  }
  if (id === FUNCION_EMPIRICA.id) {
    const datos = raiz.args.length === 1 ? listaDe(raiz.args[0] as Nodo, lector) : null;
    if (!datos) return { ok: false, motivo: 'RIESGO.EMPIRICA necesita 1 argumento: un rango con los datos, o una lista {1;2;3}' };
    const e = empiricaDesdeLista(datos);
    return typeof e === 'string' ? { ok: false, motivo: e } : { ok: true, id, spec: e.spec, media: e.media };
  }
  if (id === FUNCION_TRUNCAR.id) {
    const [interior, a, b] = raiz.args;
    if (raiz.args.length !== 3 || !interior || interior.tipo !== 'funcion' || idDeFuncionRiesgo(interior.nombre) === null) {
      return { ok: false, motivo: 'RIESGO.TRUNCAR necesita 3 argumentos: una función RIESGO; mínimo; máximo' };
    }
    const min = constante(a as Nodo);
    const max = constante(b as Nodo);
    if (min === null || max === null) return { ok: false, motivo: 'los límites de RIESGO.TRUNCAR tienen que ser números escritos en la fórmula' };
    const dentro = leerNodoRiesgo(interior, lector);
    if (!dentro.ok) return dentro;
    const spec: DistributionSpec = { ...dentro.spec, truncate: { min, max } };
    try {
      return { ok: true, id, spec, media: construirDesdeDescriptor(toDescriptor(spec)).mean() };
    } catch (e) {
      return { ok: false, motivo: `RIESGO.TRUNCAR: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const f = POR_ID.get(id);
  if (!f) {
    return { ok: false, motivo: `RIESGO.${id} no existe. Disponibles: ${[...FUNCIONES_RIESGO.map((x) => x.id), FUNCION_CATEGORIA.id, FUNCION_DISCRETA.id, FUNCION_EMPIRICA.id, FUNCION_TRUNCAR.id].join(', ')}` };
  }
  if (raiz.args.length !== f.parametros.length) {
    return { ok: false, motivo: `RIESGO.${id} necesita ${f.parametros.length} argumento(s): ${f.parametros.map((p) => p.nombre).join('; ')}` };
  }
  const valores: number[] = [];
  for (const a of raiz.args) {
    const v = constante(a);
    if (v === null) {
      return { ok: false, motivo: `los argumentos de RIESGO.${id} tienen que ser números escritos en la fórmula, no referencias ni cálculos` };
    }
    valores.push(v);
  }
  const spec = f.construir(valores);
  try {
    const media = construirDesdeDescriptor(toDescriptor(spec)).mean();
    return { ok: true, id, spec, media };
  } catch (e) {
    return { ok: false, motivo: `parámetros no válidos para RIESGO.${id}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** La media de una distribución `RIESGO.*`, para lo que la celda enseña fuera de la simulación. */
export function mediaDeFuncionRiesgo(id: string, args: number[]): number | string {
  const f = POR_ID.get(id);
  if (!f) return '#NAME?';
  try {
    return construirDesdeDescriptor(toDescriptor(f.construir(args))).mean();
  } catch {
    return '#NUM!';
  }
}
