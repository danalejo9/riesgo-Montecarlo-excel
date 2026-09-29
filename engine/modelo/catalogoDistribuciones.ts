/**
 * Todas las distribuciones, descritas para que una interfaz pueda pintarlas
 * sin saber nada de ninguna.
 *
 * Sin esto, el panel tendría un `switch` de trece ramas con los nombres de los
 * parámetros escritos a mano, y cada distribución nueva del motor exigiría
 * acordarse de tocarlo. Ya pasó una vez con el catálogo del escáner y el
 * registro de funciones: se separaron tres veces en silencio. Aquí la
 * separación la caza `catalogoDistribuciones.test.ts`, que exige que **cada**
 * tipo de `DistributionSpec` esté descrito y que cada ejemplo por defecto sea
 * una distribución válida de verdad.
 *
 * Los textos están en español porque son para el usuario. `DistributionSpec`
 * sigue en inglés porque es el formato que viaja en el archivo (decisión del
 * 2026-09-19): lo que se guarda y lo que se lee no tienen por qué coincidir.
 */
import type { DistributionSpec } from './distributionSchema.ts';

export type TipoDistribucion = DistributionSpec['type'];

export interface ParametroDistribucion {
  /** La clave dentro del `DistributionSpec`. */
  clave: string;
  etiqueta: string;
  /** Qué significa, en una línea, para quien no sepa estadística. */
  ayuda?: string;
  /** Solo para los parámetros que de verdad están acotados. */
  min?: number;
  max?: number;
  entero?: boolean;
}

export interface DescripcionDistribucion {
  tipo: TipoDistribucion;
  nombre: string;
  /** Cuándo usarla, en las palabras de quien hace un presupuesto. */
  cuando: string;
  parametros: ParametroDistribucion[];
  /** Un ejemplo válido, el que se pone al elegirla por primera vez. */
  porDefecto: DistributionSpec;
}

const P = (clave: string, etiqueta: string, extra: Partial<ParametroDistribucion> = {}): ParametroDistribucion => ({
  clave,
  etiqueta,
  ...extra,
});

export const CATALOGO_DISTRIBUCIONES: readonly DescripcionDistribucion[] = [
  {
    tipo: 'triangular',
    nombre: 'Triangular',
    cuando: 'Cuando sabes el mínimo, el máximo y el valor más probable. La más usada en presupuestos.',
    parametros: [P('min', 'Mínimo'), P('mode', 'Más probable'), P('max', 'Máximo')],
    porDefecto: { type: 'triangular', min: 0, mode: 1, max: 2 },
  },
  {
    tipo: 'pert',
    nombre: 'PERT',
    cuando: 'Como la triangular, pero da más peso al valor más probable y menos a los extremos.',
    parametros: [
      P('min', 'Mínimo'),
      P('mode', 'Más probable'),
      P('max', 'Máximo'),
      P('lambda', 'Lambda', { ayuda: 'Cuánto pesa el valor más probable. 4 es lo estándar.', min: 0 }),
    ],
    porDefecto: { type: 'pert', min: 0, mode: 1, max: 2 },
  },
  {
    tipo: 'uniform',
    nombre: 'Uniforme',
    cuando: 'Cuando solo sabes el rango y ningún valor dentro es más probable que otro.',
    parametros: [P('min', 'Mínimo'), P('max', 'Máximo')],
    porDefecto: { type: 'uniform', min: 0, max: 1 },
  },
  {
    tipo: 'normal',
    nombre: 'Normal',
    cuando: 'Variación simétrica alrededor de un valor central: medidas, errores, rendimientos.',
    parametros: [P('mean', 'Media'), P('stdDev', 'Desviación típica', { min: 0 })],
    porDefecto: { type: 'normal', mean: 0, stdDev: 1 },
  },
  {
    tipo: 'lognormal',
    nombre: 'Lognormal',
    cuando: 'Cantidades que no pueden ser negativas y con cola a la derecha: precios, duraciones.',
    parametros: [
      P('p1', 'Media', { ayuda: 'De la variable, no de su logaritmo, salvo que cambies la parametrización.' }),
      P('p2', 'Desviación típica', { min: 0 }),
    ],
    porDefecto: { type: 'lognormal', p1: 1, p2: 0.25 },
  },
  {
    tipo: 'beta',
    nombre: 'Beta',
    cuando: 'Proporciones y porcentajes: siempre entre 0 y 1.',
    parametros: [P('alpha', 'Alfa', { min: 0 }), P('beta', 'Beta', { min: 0 })],
    porDefecto: { type: 'beta', alpha: 2, beta: 2 },
  },
  {
    tipo: 'gamma',
    nombre: 'Gamma',
    cuando: 'Tiempos de espera y cantidades acumuladas, siempre positivas.',
    parametros: [P('shape', 'Forma', { min: 0 }), P('scale', 'Escala', { min: 0 })],
    porDefecto: { type: 'gamma', shape: 2, scale: 1 },
  },
  {
    tipo: 'exponential',
    nombre: 'Exponencial',
    cuando: 'Tiempo hasta el próximo suceso, cuando la tasa es constante.',
    parametros: [P('lambda', 'Tasa', { ayuda: 'Sucesos por unidad de tiempo.', min: 0 })],
    porDefecto: { type: 'exponential', lambda: 1 },
  },
  {
    tipo: 'weibull',
    nombre: 'Weibull',
    cuando: 'Vida útil y fallos: la tasa de fallo puede crecer o decrecer con el tiempo.',
    parametros: [P('shape', 'Forma', { min: 0 }), P('scale', 'Escala', { min: 0 })],
    porDefecto: { type: 'weibull', shape: 2, scale: 1 },
  },
  {
    tipo: 'bernoulli',
    nombre: 'Bernoulli',
    cuando: 'Pasa o no pasa: un riesgo que se materializa o no.',
    parametros: [P('p', 'Probabilidad', { ayuda: 'Entre 0 y 1.', min: 0, max: 1 })],
    porDefecto: { type: 'bernoulli', p: 0.5 },
  },
  {
    tipo: 'binomial',
    nombre: 'Binomial',
    cuando: 'Cuántos de N intentos salen bien, con la misma probabilidad cada uno.',
    parametros: [
      P('n', 'Intentos', { min: 0, entero: true }),
      P('p', 'Probabilidad', { min: 0, max: 1 }),
    ],
    porDefecto: { type: 'binomial', n: 10, p: 0.5 },
  },
  {
    tipo: 'poisson',
    nombre: 'Poisson',
    cuando: 'Cuántos sucesos ocurren en un periodo: incidencias, llegadas, averías.',
    parametros: [P('lambda', 'Media', { ayuda: 'Sucesos esperados en el periodo.', min: 0 })],
    porDefecto: { type: 'poisson', lambda: 3 },
  },
  // B5: distribuciones nuevas.
  {
    tipo: 'trigen',
    nombre: 'Trigen (triangular por percentiles)',
    cuando: 'Como la triangular, pero con dos percentiles en vez de mínimo y máximo: «el 10 % de las veces baja de 80».',
    parametros: [
      P('low', 'Valor bajo', { ayuda: 'El que solo se rebasa por abajo con la probabilidad de abajo.' }),
      P('mode', 'Más probable'),
      P('high', 'Valor alto'),
      P('pLow', 'Probabilidad por debajo del bajo', { ayuda: 'Entre 0 y 1; 0,1 = un 10 %.', min: 0, max: 1 }),
      P('pHigh', 'Probabilidad por debajo del alto', { ayuda: 'Entre 0 y 1; 0,9 = el 90 %.', min: 0, max: 1 }),
    ],
    porDefecto: { type: 'trigen', low: 80, mode: 100, high: 150, pLow: 0.1, pHigh: 0.9 },
  },
  {
    tipo: 'student',
    nombre: 't de Student',
    cuando: 'Como la normal, pero con colas más gruesas: sorpresas grandes más frecuentes. Pocos grados de libertad, colas más gruesas.',
    parametros: [
      P('df', 'Grados de libertad', { ayuda: 'Más de 2 para que tenga desviación; con 30 o más es casi una normal.', min: 0 }),
      P('loc', 'Centro'),
      P('scale', 'Escala', { min: 0 }),
    ],
    porDefecto: { type: 'student', df: 5, loc: 0, scale: 1 },
  },
  {
    tipo: 'logistic',
    nombre: 'Logística',
    cuando: 'Parecida a la normal y simétrica, con colas algo más gruesas. Crecimientos y demandas.',
    parametros: [P('mean', 'Media'), P('scale', 'Escala', { min: 0 })],
    porDefecto: { type: 'logistic', mean: 0, scale: 1 },
  },
  {
    tipo: 'loglogistic',
    nombre: 'Log-logística',
    cuando: 'Positiva y con cola a la derecha, como la lognormal: duraciones, tiempos de reparación, rentas.',
    parametros: [P('scale', 'Escala (mediana)', { min: 0 }), P('shape', 'Forma', { ayuda: 'Más de 1 para que tenga media; más alta, más concentrada.', min: 0 })],
    porDefecto: { type: 'loglogistic', scale: 1, shape: 3 },
  },
  {
    tipo: 'pareto',
    nombre: 'Pareto',
    cuando: 'Nunca por debajo de un mínimo y con una cola derecha muy larga: grandes siniestros, pérdidas extremas.',
    parametros: [P('min', 'Mínimo', { min: 0 }), P('shape', 'Forma', { ayuda: 'Más de 1 para que tenga media; más baja, cola más larga.', min: 0 })],
    porDefecto: { type: 'pareto', min: 1, shape: 3 },
  },
  {
    tipo: 'intuniform',
    nombre: 'Uniforme entera',
    cuando: 'Cualquier número entero entre dos, todos igual de probables: plazas, días, unidades.',
    parametros: [P('min', 'Mínimo', { entero: true }), P('max', 'Máximo', { entero: true })],
    porDefecto: { type: 'intuniform', min: 1, max: 6 },
  },
  {
    tipo: 'geometric',
    nombre: 'Geométrica',
    cuando: 'Cuántos intentos fallan antes del primer éxito: ofertas hasta ganar un contrato.',
    parametros: [P('p', 'Probabilidad de éxito', { ayuda: 'Entre 0 y 1, en cada intento.', min: 0, max: 1 })],
    porDefecto: { type: 'geometric', p: 0.3 },
  },
  {
    tipo: 'negbin',
    nombre: 'Binomial negativa',
    cuando: 'Cuántos intentos fallan antes de conseguir r éxitos. También, conteos más dispersos que una Poisson.',
    parametros: [P('r', 'Éxitos buscados', { min: 0 }), P('p', 'Probabilidad de éxito', { min: 0, max: 1 })],
    porDefecto: { type: 'negbin', r: 3, p: 0.4 },
  },
  {
    tipo: 'hypergeometric',
    nombre: 'Hipergeométrica',
    cuando: 'Cuántos defectuosos salen al revisar una muestra sin reponer de un lote con un número conocido de ellos.',
    parametros: [
      P('n', 'Tamaño de la muestra', { min: 0, entero: true }),
      P('successes', 'Casos en la población', { ayuda: 'Por ejemplo, las piezas defectuosas del lote.', min: 0, entero: true }),
      P('population', 'Tamaño de la población', { min: 1, entero: true }),
    ],
    porDefecto: { type: 'hypergeometric', n: 10, successes: 5, population: 50 },
  },
  {
    tipo: 'histogram',
    nombre: 'Histograma (forma libre)',
    cuando: 'Una forma dibujada a mano: entre un mínimo y un máximo, en tramos iguales, cada uno con su peso.',
    // El mínimo y el máximo son números; los pesos, una lista que el panel edita aparte.
    parametros: [P('min', 'Mínimo'), P('max', 'Máximo')],
    porDefecto: { type: 'histogram', min: 0, max: 100, weights: [1, 3, 5, 3, 1] },
  },
  {
    tipo: 'discrete',
    nombre: 'Discreta',
    cuando: 'Una lista cerrada de valores posibles, cada uno con su peso. Escenarios.',
    // Sus dos parámetros son listas y no números, así que el panel los edita
    // aparte: describirlos aquí como si fueran campos numéricos sería mentir.
    parametros: [],
    porDefecto: { type: 'discrete', values: [0, 1], weights: [1, 1] },
  },
  {
    tipo: 'categorical',
    nombre: 'Categórica (texto)',
    cuando: 'Una lista de textos posibles, cada uno con su probabilidad: zona, proveedor, escenario.',
    // Como la discreta: listas, no números; el panel la edita aparte.
    parametros: [],
    porDefecto: { type: 'categorical', categories: ['A', 'B'], weights: [1, 1] },
  },
];

/** Las distribuciones de números enteros (se pintan como barras, sin curva encima). */
const DISCRETAS_ENTERAS: ReadonlySet<TipoDistribucion> = new Set(['bernoulli', 'binomial', 'poisson', 'geometric', 'negbin', 'hypergeometric', 'intuniform']);

export function esDiscretaEntera(tipo: TipoDistribucion): boolean {
  return DISCRETAS_ENTERAS.has(tipo);
}

const POR_TIPO = new Map(CATALOGO_DISTRIBUCIONES.map((d) => [d.tipo, d] as const));

export function describirDistribucion(tipo: TipoDistribucion): DescripcionDistribucion | undefined {
  return POR_TIPO.get(tipo);
}

/**
 * Resumen de una línea para la lista de entradas: `Triangular(0; 1; 2)`.
 * Mejor que el nombre a secas — el usuario tiene que poder repasar diez
 * entradas sin abrir ninguna.
 */
export function resumirDistribucion(spec: DistributionSpec): string {
  const desc = POR_TIPO.get(spec.type);
  if (!desc) return String(spec.type);

  const acotada = spec.truncate && (spec.truncate.min !== undefined || spec.truncate.max !== undefined)
    ? ` acotada [${spec.truncate.min ?? '−∞'}; ${spec.truncate.max ?? '∞'}]`
    : '';
  if (acotada) return `${resumirDistribucion({ ...spec, truncate: undefined } as DistributionSpec)}${acotada}`;
  if (spec.type === 'discrete') return `Discreta (${spec.values.length} valores)`;
  if (spec.type === 'categorical') {
    const lista = spec.categories.slice(0, 4).join(', ');
    return `Categórica (${lista}${spec.categories.length > 4 ? '…' : ''})`;
  }

  const valores = desc.parametros
    .map((p) => (spec as unknown as Record<string, unknown>)[p.clave])
    .filter((v) => typeof v === 'number')
    .map((v) => String(v));

  return valores.length > 0 ? `${desc.nombre}(${valores.join('; ')})` : desc.nombre;
}
