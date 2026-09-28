/**
 * Las trece distribuciones, descritas para que una interfaz pueda pintarlas
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
