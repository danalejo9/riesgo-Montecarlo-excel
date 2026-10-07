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
 * Los argumentos pueden ser números escritos o, con un `evaluar` (B7),
 * cualquier expresión que no dependa de nada aleatorio: `=RIESGO.NORMAL(B2;
 * 15)` con B2 fija. Los parámetros que cambian en cada iteración y la función
 * dentro de una operación los resuelve `riesgoEnGrafo.ts`. Se aceptan también
 * los nombres `RISK.*`, que es el prefijo que ya reconoce el escáner.
 *
 * Además de las distribuciones están las **funciones de resultados** (B6):
 * `RIESGO.MEDIA(celda)`, `RIESGO.PERCENTIL(celda; p)`… no declaran nada
 * incierto; traen a la hoja lo que dio la última simulación.
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
  // B5
  {
    id: 'TRIGEN', descripcion: 'Trigen: una triangular dada por dos percentiles («el 10 % de las veces baja de 80») y el valor más probable.',
    parametros: [
      { nombre: 'bajo', descripcion: 'Valor bajo' }, { nombre: 'moda', descripcion: 'Valor más probable' }, { nombre: 'alto', descripcion: 'Valor alto' },
      { nombre: 'p_bajo', descripcion: 'Probabilidad de quedar por debajo del valor bajo (p. ej. 0,1)' },
      { nombre: 'p_alto', descripcion: 'Probabilidad de quedar por debajo del valor alto (p. ej. 0,9)' },
    ],
    construir: ([low, mode, high, pLow, pHigh]) => ({ type: 'trigen', low: low as number, mode: mode as number, high: high as number, pLow: pLow as number, pHigh: pHigh as number }),
  },
  {
    id: 'STUDENT', descripcion: 't de Student: como la normal, con colas más gruesas.',
    parametros: [{ nombre: 'gl', descripcion: 'Grados de libertad (> 0; más de 2 para tener desviación)' }, { nombre: 'centro', descripcion: 'Centro (la media)' }, { nombre: 'escala', descripcion: 'Escala (> 0)' }],
    construir: ([df, loc, scale]) => ({ type: 'student', df: df as number, loc: loc as number, scale: scale as number }),
  },
  {
    id: 'LOGISTICA', descripcion: 'Logística: simétrica, parecida a la normal con colas algo más gruesas.',
    parametros: [{ nombre: 'media', descripcion: 'Media' }, { nombre: 'escala', descripcion: 'Escala (> 0)' }],
    construir: ([mean, scale]) => ({ type: 'logistic', mean: mean as number, scale: scale as number }),
  },
  {
    id: 'LOGLOGISTICA', descripcion: 'Log-logística: positiva y con cola a la derecha; la escala es la mediana.',
    parametros: [{ nombre: 'escala', descripcion: 'Escala (> 0): la mediana' }, { nombre: 'forma', descripcion: 'Forma (> 0; más de 1 para tener media)' }],
    construir: ([scale, shape]) => ({ type: 'loglogistic', scale: scale as number, shape: shape as number }),
  },
  {
    id: 'PARETO', descripcion: 'Pareto: nunca por debajo del mínimo, con cola derecha muy larga (grandes siniestros).',
    parametros: [{ nombre: 'minimo', descripcion: 'Mínimo (> 0)' }, { nombre: 'forma', descripcion: 'Forma (> 0; más de 1 para tener media)' }],
    construir: ([min, shape]) => ({ type: 'pareto', min: min as number, shape: shape as number }),
  },
  {
    id: 'UNIFORMEENTERA', descripcion: 'Uniforme entera: cada entero entre el mínimo y el máximo, igual de probable.',
    parametros: [{ nombre: 'minimo', descripcion: 'Mínimo (entero)' }, { nombre: 'maximo', descripcion: 'Máximo (entero)' }],
    construir: ([min, max]) => ({ type: 'intuniform', min: min as number, max: max as number }),
  },
  {
    id: 'GEOMETRICA', descripcion: 'Geométrica: cuántos intentos fallan antes del primer éxito.',
    parametros: [{ nombre: 'p', descripcion: 'Probabilidad de éxito en cada intento (0 a 1)' }],
    construir: ([p]) => ({ type: 'geometric', p: p as number }),
  },
  {
    id: 'BINOMNEG', descripcion: 'Binomial negativa: cuántos intentos fallan antes de r éxitos; conteos más dispersos que una Poisson.',
    parametros: [{ nombre: 'r', descripcion: 'Éxitos buscados (> 0)' }, { nombre: 'p', descripcion: 'Probabilidad de éxito (0 a 1)' }],
    construir: ([r, p]) => ({ type: 'negbin', r: r as number, p: p as number }),
  },
  {
    id: 'HIPERGEOM', descripcion: 'Hipergeométrica: cuántos casos salen en una muestra sin reponer (defectuosos en un lote).',
    parametros: [{ nombre: 'muestra', descripcion: 'Tamaño de la muestra' }, { nombre: 'casos', descripcion: 'Casos en la población' }, { nombre: 'poblacion', descripcion: 'Tamaño de la población' }],
    construir: ([n, successes, population]) => ({ type: 'hypergeometric', n: n as number, successes: successes as number, population: population as number }),
  },
];

/** `RIESGO.HISTOGRAMA(mínimo; máximo; pesos)` (B5): tramos iguales, cada uno con su peso. Su tercer argumento es una lista. */
export const FUNCION_HISTOGRAMA = {
  id: 'HISTOGRAMA',
  descripcion: 'Histograma: una forma libre entre el mínimo y el máximo, en tramos iguales con los pesos dados.',
  parametros: [
    { nombre: 'minimo', descripcion: 'Mínimo' },
    { nombre: 'maximo', descripcion: 'Máximo' },
    { nombre: 'pesos', descripcion: 'El peso de cada tramo, de izquierda a derecha: un rango o una lista {1;3;5;3;1}' },
  ],
} as const;

export function histogramaDesdeLista(min: number, max: number, pesos: readonly unknown[]): { spec: DistributionSpec; media: number } | string {
  const weights = pesos.filter((v) => v !== null && v !== undefined && v !== '').map((v) => (typeof v === 'number' ? v : Number(String(v).replace(',', '.'))));
  const spec: DistributionSpec = { type: 'histogram', min, max, weights };
  try {
    return { spec, media: construirDesdeDescriptor(toDescriptor(spec)).mean() };
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const POR_ID = new Map(FUNCIONES_RIESGO.map((f) => [f.id, f] as const));

/** `RIESGO.NORMAL`, `RISK.NORMAL`, o como los guarde Excel en el XML → `NORMAL`. */
export function idDeFuncionRiesgo(nombre: string): string | null {
  const n = nombre.toUpperCase().replace(/^_XLUDF\./, '').replace(/^_XLFN\./, '');
  const m = /^(?:RIESGO|RISK)\.(.+)$/.exec(n);
  return m ? (m[1] as string) : null;
}

/**
 * Las funciones de resultados (B6): traen a la hoja un estadístico de una
 * salida en la última simulación. No son distribuciones.
 */
export const FUNCIONES_RESULTADO = [
  { id: 'MEDIA', descripcion: 'La media de una salida en la última simulación.', parametros: [{ nombre: 'celda', descripcion: 'Una celda marcada como salida' }] },
  { id: 'DESV', descripcion: 'La desviación típica de una salida en la última simulación.', parametros: [{ nombre: 'celda', descripcion: 'Una celda marcada como salida' }] },
  {
    id: 'PERCENTIL', descripcion: 'El percentil p de una salida en la última simulación (p entre 0 y 1: 0,05 es el p5).',
    parametros: [{ nombre: 'celda', descripcion: 'Una celda marcada como salida' }, { nombre: 'p', descripcion: 'Entre 0 y 1 (0,05 = p5, 0,95 = p95)' }],
  },
  {
    id: 'PROB', descripcion: 'La probabilidad de que una salida quede por debajo de un umbral (o por encima, si el tercer argumento es VERDADERO). En una salida de texto, la probabilidad de un valor.',
    parametros: [
      { nombre: 'celda', descripcion: 'Una celda marcada como salida' },
      { nombre: 'umbral', descripcion: 'El valor de corte, o el texto cuya probabilidad se quiere' },
      { nombre: 'por_encima', descripcion: 'Opcional: VERDADERO para «por encima del umbral»' },
    ],
  },
  { id: 'MIN', descripcion: 'El mínimo de una salida en la última simulación.', parametros: [{ nombre: 'celda', descripcion: 'Una celda marcada como salida' }] },
  { id: 'MAX', descripcion: 'El máximo de una salida en la última simulación.', parametros: [{ nombre: 'celda', descripcion: 'Una celda marcada como salida' }] },
] as const;

const IDS_RESULTADO: ReadonlySet<string> = new Set(FUNCIONES_RESULTADO.map((f) => f.id));

/**
 * Funciones que **declaran** algo del modelo desde la fórmula (resto de B6):
 * `RIESGO.SALIDA("nombre")` marca la celda como salida (vale 0: se escribe
 * sumada a la fórmula, `=RIESGO.SALIDA("Beneficio")+C10-C11`) y
 * `RIESGO.CORRELACION(celda1; celda2; coef)` correlaciona dos entradas (vale
 * el coeficiente). Tampoco son distribuciones.
 */
export const FUNCION_SALIDA = {
  id: 'SALIDA',
  descripcion: 'Marca la celda como salida de la simulación. Vale 0: súmala a la fórmula, =RIESGO.SALIDA("Beneficio")+C10-C11.',
  parametros: [{ nombre: 'nombre', descripcion: 'Opcional: el nombre de la salida en los resultados' }],
} as const;

export const FUNCION_CORRELACION = {
  id: 'CORRELACION',
  descripcion: 'Correlaciona dos entradas inciertas (correlación de rangos entre -1 y 1). Devuelve el coeficiente.',
  parametros: [
    { nombre: 'entrada1', descripcion: 'Una celda con una función RIESGO o marcada como entrada' },
    { nombre: 'entrada2', descripcion: 'Otra celda con una función RIESGO o marcada como entrada' },
    { nombre: 'coeficiente', descripcion: 'Entre -1 y 1 (0,8: suben juntas; -0,5: una sube cuando la otra baja)' },
  ],
} as const;

/**
 * `RIESGO.EVENTO(probabilidad; impacto)` (T8, registro de riesgos): un riesgo
 * que ocurre con esa probabilidad y, si ocurre, cuesta el impacto (un número o
 * una función RIESGO). Es `RIESGO.BERNOULLI(p) × impacto`: el motor la expande
 * así antes de analizar (`expandirEventos`).
 */
export const FUNCION_EVENTO = {
  id: 'EVENTO',
  descripcion: 'Un riesgo del registro: ocurre con la probabilidad dada y, si ocurre, vale el impacto (0 si no ocurre).',
  parametros: [
    { nombre: 'probabilidad', descripcion: 'Entre 0 y 1 (0,3 = un 30 %)' },
    { nombre: 'impacto', descripcion: 'Lo que cuesta si ocurre: un número o una función RIESGO, p. ej. RIESGO.TRIANGULAR(10;20;50)' },
  ],
} as const;

/**
 * `RIESGO.DECISION(opción1; opción2; …)` o `RIESGO.DECISION(rango)` (T9): una
 * decisión, no un azar. En la hoja vale la primera opción; al simular, el
 * modelo se simula con cada una y se comparan lado a lado.
 */
export const FUNCION_DECISION = {
  id: 'DECISION',
  descripcion: 'Una decisión con varias opciones (no aleatoria): al simular se compara el resultado con cada una. En la hoja vale la primera.',
  parametros: [{ nombre: 'opciones', descripcion: 'Las opciones: números o textos, o un rango con ellas' }],
} as const;

/**
 * `RIESGO.CRONOGRAMA(hito; medida; valor_fijo)` (W5): el plazo de un hito o
 * del proyecto, tomado del módulo Cronograma **iteración a iteración** (ver
 * `engine/cronograma/enCostos.ts`). No es una distribución que se escriba:
 * sus muestras las da la simulación del cronograma del libro.
 */
export const FUNCION_CRONOGRAMA = {
  id: 'CRONOGRAMA',
  descripcion: 'El plazo simulado de un hito o del proyecto (módulo Cronograma), en la misma iteración que los costos.',
  parametros: [
    { nombre: 'hito', descripcion: 'ID o nombre de la actividad o hito; vacío o "Proyecto" para el fin del proyecto' },
    { nombre: 'medida', descripcion: '"fecha" (por defecto), "dias", "retraso", "multa" o "costo"' },
    { nombre: 'valor_fijo', descripcion: 'Opcional: lo que enseña la celda fuera de la simulación (si no, el valor del plan)' },
  ],
} as const;

/**
 * Da la distribución de un `RIESGO.CRONOGRAMA` (la pone quien tiene el
 * cronograma del libro simulado), o el motivo por el que no se puede.
 */
export type ProveedorCronograma = (hito: string, medida: string) => { spec: DistributionSpec; media: number } | string;

/** ¿Es `RIESGO.<id>` una función que declara algo (salida, correlación, decisión)? */
export function esFuncionDeDeclaracion(id: string): boolean {
  return id === FUNCION_SALIDA.id || id === FUNCION_CORRELACION.id || id === FUNCION_DECISION.id;
}

/** ¿Es `RIESGO.<id>` una función de resultados (B6) y no una distribución? */
export function esFuncionDeResultado(id: string): boolean {
  return IDS_RESULTADO.has(id);
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

/**
 * Calcula un argumento que no es un número escrito (`B2`, `10*2`), si no
 * depende de nada aleatorio (B7). `null` si no se puede.
 */
export type EvaluadorDeArgumento = (nodo: Nodo) => number | null;

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
export function leerFuncionRiesgo(formula: string, lector?: LectorDeRango, evaluar?: EvaluadorDeArgumento): LecturaFuncionRiesgo {
  const r = parsear(formula.replace(/^=/, ''));
  if (!r.ok) return { ok: false, motivo: `la fórmula no se entiende: ${r.error.mensaje}` };
  const raiz = r.ast;
  if (raiz.tipo !== 'funcion' || idDeFuncionRiesgo(raiz.nombre) === null) {
    return { ok: false, motivo: 'la función RIESGO tiene que ser toda la fórmula de la celda (no parte de una operación)' };
  }
  return leerNodoRiesgo(raiz, lector, evaluar);
}

/**
 * El hito y la medida de un `RIESGO.CRONOGRAMA`: textos o números escritos, o
 * celdas con ellos. Si alguno no se puede leer así, el motivo.
 */
export function pedidoDeCronograma(raiz: Extract<Nodo, { tipo: 'funcion' }>, lector?: LectorDeRango): { hito: string; medida: string } | string {
  if (raiz.args.length > 3) return 'RIESGO.CRONOGRAMA admite hasta 3 argumentos: hito; medida; valor_fijo';
  const texto = (n: Nodo | undefined): string | null => {
    if (n === undefined || n.tipo === 'vacio') return '';
    if (n.tipo === 'texto') return n.valor;
    if (n.tipo === 'numero') return String(n.valor);
    if (n.tipo === 'celda' && lector) {
      const v = lector(n)?.[0];
      return v === null || v === undefined ? '' : String(v);
    }
    return null;
  };
  const hito = texto(raiz.args[0]);
  const medida = texto(raiz.args[1]);
  if (hito === null || medida === null) {
    return 'el hito y la medida de RIESGO.CRONOGRAMA tienen que ser textos escritos ("H3"; "fecha") o celdas con ellos';
  }
  return { hito: hito.trim(), medida: medida.trim() };
}

export function leerNodoRiesgo(
  raiz: Extract<Nodo, { tipo: 'funcion' }>,
  lector?: LectorDeRango,
  evaluar?: EvaluadorDeArgumento,
  cronograma?: ProveedorCronograma,
): LecturaFuncionRiesgo {
  const id = idDeFuncionRiesgo(raiz.nombre) as string;
  const numero = (n: Nodo | undefined): number | null => (n === undefined ? null : constante(n) ?? evaluar?.(n) ?? null);
  if (esFuncionDeResultado(id)) {
    return { ok: false, motivo: `RIESGO.${id} trae resultados de la simulación: no es una distribución` };
  }
  if (esFuncionDeDeclaracion(id)) {
    return { ok: false, motivo: `RIESGO.${id} declara algo del modelo: no es una distribución` };
  }
  if (id === FUNCION_EVENTO.id) {
    // Solo llega aquí mal escrita: bien escrita, `expandirEventos` ya la ha convertido.
    return { ok: false, motivo: 'RIESGO.EVENTO necesita 2 argumentos: probabilidad; impacto' };
  }
  if (id === FUNCION_CRONOGRAMA.id) {
    const pedido = pedidoDeCronograma(raiz, lector);
    if (typeof pedido === 'string') return { ok: false, motivo: pedido };
    if (!cronograma) return { ok: false, motivo: 'RIESGO.CRONOGRAMA necesita el cronograma del libro (hoja «Actividades»)' };
    const r = cronograma(pedido.hito, pedido.medida);
    return typeof r === 'string' ? { ok: false, motivo: r } : { ok: true, id, spec: r.spec, media: r.media };
  }
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
  if (id === FUNCION_HISTOGRAMA.id) {
    if (raiz.args.length !== 3) return { ok: false, motivo: 'RIESGO.HISTOGRAMA necesita 3 argumentos: mínimo; máximo; pesos' };
    const min = numero(raiz.args[0]);
    const max = numero(raiz.args[1]);
    const pesos = listaDe(raiz.args[2] as Nodo, lector);
    if (min === null || max === null || !pesos) {
      return { ok: false, motivo: 'RIESGO.HISTOGRAMA: el mínimo y el máximo tienen que ser números, y los pesos un rango con valores escritos o una lista {1;3;5}' };
    }
    const h = histogramaDesdeLista(min, max, pesos);
    return typeof h === 'string' ? { ok: false, motivo: h } : { ok: true, id, spec: h.spec, media: h.media };
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
    const min = numero(a);
    const max = numero(b);
    if (min === null || max === null) {
      return { ok: false, motivo: evaluar ? 'los límites de RIESGO.TRUNCAR tienen que ser números o celdas con números' : 'los límites de RIESGO.TRUNCAR tienen que ser números escritos en la fórmula' };
    }
    const dentro = leerNodoRiesgo(interior, lector, evaluar);
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
    return { ok: false, motivo: `RIESGO.${id} no existe. Disponibles: ${[...FUNCIONES_RIESGO.map((x) => x.id), FUNCION_CATEGORIA.id, FUNCION_DISCRETA.id, FUNCION_EMPIRICA.id, FUNCION_HISTOGRAMA.id, FUNCION_TRUNCAR.id, FUNCION_CRONOGRAMA.id].join(', ')}` };
  }
  if (raiz.args.length !== f.parametros.length) {
    return { ok: false, motivo: `RIESGO.${id} necesita ${f.parametros.length} argumento(s): ${f.parametros.map((p) => p.nombre).join('; ')}` };
  }
  const valores: number[] = [];
  for (const a of raiz.args) {
    const v = numero(a);
    if (v === null) {
      return {
        ok: false,
        motivo: evaluar
          ? `los argumentos de RIESGO.${id} tienen que dar números (un número escrito, una celda con un número o un cálculo)`
          : `los argumentos de RIESGO.${id} tienen que ser números escritos en la fórmula, no referencias ni cálculos`,
      };
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

/**
 * La distribución de `RIESGO.<id>(args)` con los argumentos ya calculados, o
 * el motivo si no son válidos. La usa el motor en cada iteración cuando los
 * parámetros cambian (B7): solo las funciones de parámetros numéricos.
 */
export function construirSpecRiesgo(id: string, args: readonly number[]): DistributionSpec | string {
  const f = POR_ID.get(id);
  if (!f) return `RIESGO.${id} no admite parámetros que cambian en cada iteración`;
  if (args.length !== f.parametros.length) return `RIESGO.${id} necesita ${f.parametros.length} argumento(s)`;
  return f.construir([...args]);
}

/** ¿Tiene `RIESGO.<id>` solo parámetros numéricos (NORMAL, TRIANGULAR…)? */
export function esFuncionParametrica(id: string): boolean {
  return POR_ID.has(id);
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
