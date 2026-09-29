/**
 * Las formas de un resultado de simulación, y el informe que se escribe a
 * partir de ellas. **Sin Office.js**: son datos y su transformación en filas.
 *
 * Separado de `ejecutarSimulacion.ts` y de `volcarResultados.ts` por la regla
 * de siempre en esta capa: en cuanto un archivo nombra un tipo del espacio
 * `Excel`, deja de poder compilarse con el proyecto del motor y ningún test
 * puede importar nada que dependa de él, ni de lejos. Aquí está todo lo que sí
 * se puede probar en Node, que es justamente el contenido del informe —lo
 * único que de verdad hay que garantizar— y no el color de sus títulos.
 */

import { resumirDistribucion, type ModeloRiesgo } from '../engine/modelo/index.ts';
import type { EleccionMotor } from '../engine/modelo/index.ts';
import {
  analizarSensibilidad,
  aranaDeSensibilidad,
  histogramaDeMuestra,
  medidasDeRiesgo,
  type MedidasRiesgo,
  r2Sensibilidad,
  ordenarUtiles,
  precisionDeSimulacion,
  type Precision,
  probabilidadUmbral,
  type BinHistograma,
  type PuntoCDF,
  type ResumenEstadistico,
} from '../engine/stats/index.ts';
import { analisisPorCola, type AnalisisCola } from './analisisCola.ts';
import type { Decisivas, FilaCategoria, PorCategoria } from './analisisTexto.ts';
import type { EntradaMuestreada } from './entradasMuestreadas.ts';
import { esSalidaDeTexto } from './analisisTexto.ts';
import { lecturaDeSalida, lecturaDeTexto } from './lectura.ts';
import type { EstadisticasLectura } from './tiposLectura.ts';

export interface AvanceSimulacion {
  fase: 'resolviendo' | 'leyendo' | 'analizando' | 'simulando';
  /** Lo que se le enseña al usuario en esa fase. */
  mensaje: string;
  /** Solo en la fase de simulación. */
  completadas?: number;
  totales?: number;
  /** Ritmo medido; solo lo tiene el modo compatible, donde hace falta decirlo. */
  iteracionesPorSegundo?: number;
}

export interface ResultadoSalida {
  id: string;
  nombre: string;
  ref: string;
  /** La celda tiene formato de fecha (T7): sus valores se enseñan como fechas y la dispersión en días. */
  fecha?: boolean;
  /** La celda de verdad (`Modelo!C32`), también si `ref` es un nombre definido. */
  clave?: string;
  resumen: ResumenEstadistico;
  cdf: PuntoCDF[];
  /**
   * Iteraciones en las que esta salida no dio un número: una `TIR` sin raíz,
   * una división por cero. Excluidas de las estadísticas y contadas aparte,
   * en los dos motores.
   */
  noNumericas: number;
  /**
   * Qué entrada mueve más esta salida, ordenado de mayor a menor |ρ|. Falta si
   * la simulación no retuvo muestra (por ejemplo, cancelada antes de empezar).
   */
  sensibilidad?: FilaSensibilidadPanel[];
  /**
   * Los valores numéricos de la muestra retenida, ordenados. Es lo que permite
   * contestar al instante "¿qué probabilidad hay de quedar por debajo de X?"
   * mientras el usuario escribe X. Vive solo en memoria: no se guarda.
   */
  muestraOrdenada?: Float64Array;
  /** Histograma de la muestra retenida. */
  histograma?: BinHistograma[];
  /** VaR y CVaR de las dos colas, asimetría, curtosis y semidesviación (H2). */
  riesgo?: MedidasRiesgo;
  /** Qué tiene que pasar para caer en el 10 % más bajo o más alto (D1). */
  colas?: AnalisisCola[];
  /** Salidas de texto o sí/no (T2, T6): cada valor con su frecuencia, de más a menos. */
  categorias?: FilaCategoria[];
  /** El texto de cada iteración retenida. Solo en memoria, como `muestraOrdenada`. */
  muestraTexto?: (string | null)[];
  /** Qué entradas deciden cada valor de una salida de texto (T3). */
  decisivas?: Decisivas[];
  /** La salida en cada categoría de cada entrada de texto (T3). */
  porCategoria?: PorCategoria[];
  /**
   * `true` si `muestraOrdenada` no es la muestra sino sus cuantiles guardados
   * en el libro (resultados restaurados): las probabilidades son aproximadas y
   * no se pueden contar iteraciones.
   */
  muestraReducida?: boolean;
  /** Gráfico de araña: media de la salida por décimo de cada entrada, de mayor a menor efecto. */
  arana?: CurvaAranaPanel[];
  /** Qué parte de la variación explican las entradas juntas (regresión sobre rangos, 0..1). */
  r2?: number;
  /** ¿Bastan las iteraciones? Margen de la media y de p5/p95 al 95 %. */
  precision?: Precision;
}

/** Una barra del tornado: una entrada del modelo y cuánto mueve una salida. */
export interface FilaSensibilidadPanel {
  id: string;
  nombre: string;
  ref: string;
  /** Correlación de rangos de Spearman, −1..1. */
  spearman: number;
  /** ρ² normalizado entre todas las entradas, 0..1. */
  peso: number;
  /** Contribución a la varianza explicada (regresión, medida de Pratt), si se pudo calcular. */
  contribucion?: number;
  /**
   * Entrada de texto: su peso se mide con la media de la salida en cada
   * categoría, así que no tiene sentido (subir o bajar) y su ρ es ≥ 0.
   */
  categorica?: true;
}

/** Una línea del gráfico de araña, con los nombres del modelo. */
export interface CurvaAranaPanel {
  id: string;
  nombre: string;
  ref: string;
  /** Media de la salida en cada décimo de la entrada, de menor a mayor. */
  medias: number[];
  /** Mayor menos menor de esas medias, en unidades de la salida. */
  rango: number;
}

/**
 * La sensibilidad de una salida, ya con los nombres y celdas del modelo.
 *
 * `muestrasPorClave` va indexado por la clave de celda de cada entrada
 * (`clavesEntrada[i]` es la de `modelo.inputs[i]`): es lo que tienen a mano
 * los dos motores, que conocen celdas y no ids.
 */
export function sensibilidadDeSalida(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
  muestraSalida: ArrayLike<number>,
): FilaSensibilidadPanel[] {
  const entradas = entradasDeSensibilidad(modelo, clavesEntrada, muestrasPorClave, muestraSalida);
  const porId = new Map(modelo.inputs.map((e) => [e.id, e] as const));
  return analizarSensibilidad(entradas, muestraSalida).map((f) => {
    const e = porId.get(f.id);
    return { ...f, nombre: e?.name ?? f.id, ref: e?.ref ?? '', ...(e?.dist.type === 'categorical' ? { categorica: true as const } : {}) };
  });
}

/**
 * Todo lo que sale de la muestra retenida de una salida: la sensibilidad, la
 * muestra ordenada (para los umbrales) y el histograma. Se calcula una vez al
 * terminar la simulación, fuera de la interfaz.
 */
/** La precisión de una salida: con todas sus iteraciones para la media, y la muestra para los percentiles. */
export function precisionDeSalida(
  resumen: ResumenEstadistico,
  muestraOrdenada?: Float64Array,
  objetivo?: number,
): Precision | undefined {
  // Los intervalos de percentil con la muestra retenida valen para esa
  // muestra; si hay más iteraciones, son algo conservadores. Mejor eso que
  // prometer una precisión que no se ha medido.
  return precisionDeSimulacion(resumen.n, resumen.media, resumen.desviacion, muestraOrdenada, objetivo) ?? undefined;
}

/** Añade la precisión a una salida, medida contra el margen objetivo del modelo. */
export function conPrecision(objetivo?: number): (s: ResultadoSalida) => ResultadoSalida {
  return (s) => {
    const precision = precisionDeSalida(s.resumen, s.muestraOrdenada, objetivo);
    return precision ? { ...s, precision } : s;
  };
}

export function analisisDeMuestra(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
  muestraSalida: ArrayLike<number> | undefined,
): Pick<ResultadoSalida, 'sensibilidad' | 'muestraOrdenada' | 'histograma' | 'arana' | 'r2' | 'riesgo' | 'colas'> {
  if (!muestraSalida || muestraSalida.length === 0) return {};
  const muestraOrdenada = ordenarUtiles(muestraSalida);
  // La araña es por décimos de cada entrada: una de texto no tiene décimos.
  const entradas = entradasDeSensibilidad(modelo, clavesEntrada, muestrasPorClave, muestraSalida);
  const porId = new Map(modelo.inputs.map((e) => [e.id, e] as const));
  const numericas = entradas.filter((e) => porId.get(e.id)?.dist.type !== 'categorical');
  const arana = aranaDeSensibilidad(numericas, muestraSalida).map((c) => ({
    ...c, nombre: porId.get(c.id)?.name ?? c.id, ref: porId.get(c.id)?.ref ?? '',
  }));
  const r2 = r2Sensibilidad(entradas, muestraSalida);
  const riesgo = medidasDeRiesgo(muestraOrdenada);
  const colas = analisisPorCola(modelo, clavesEntrada, muestrasPorClave, muestraSalida);
  return {
    ...(riesgo ? { riesgo } : {}),
    ...(colas.length > 0 ? { colas } : {}),
    sensibilidad: sensibilidadDeSalida(modelo, clavesEntrada, muestrasPorClave, muestraSalida),
    muestraOrdenada,
    histograma: histogramaDeMuestra(muestraOrdenada),
    ...(arana.length > 0 ? { arana } : {}),
    ...(r2 !== null ? { r2 } : {}),
  };
}

function entradasDeSensibilidad(
  modelo: ModeloRiesgo,
  clavesEntrada: readonly string[],
  muestrasPorClave: ReadonlyMap<string, ArrayLike<number>>,
  muestraSalida: ArrayLike<number>,
) {
  return modelo.inputs.flatMap((e, i) => {
    const muestras = muestrasPorClave.get(clavesEntrada[i] as string);
    if (!muestras) return [];
    // Una entrada de texto no tiene orden (Norte no es «más» que Sur), así
    // que su índice no sirve para correlacionar. Se sustituye cada categoría
    // por la media de la salida en ella: así la regresión mide cuánto de la
    // variación explica (es la razón de correlación, η²), en la misma escala
    // que las demás. Hasta el 29/09 se dejaban fuera, y el tornado de la hoja
    // «Zonas» decía que la zona no pesaba nada cuando era lo que más pesaba.
    if (e.dist.type === 'categorical') return [{ id: e.id, muestras: mediaPorCategoria(muestras, muestraSalida) }];
    return [{ id: e.id, muestras }];
  });
}

/** Cada iteración, con la media de la salida en su categoría. */
export function mediaPorCategoria(indices: ArrayLike<number>, salida: ArrayLike<number>): Float64Array {
  const n = Math.min(indices.length, salida.length);
  const suma = new Map<number, number>();
  const cuenta = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const y = salida[i] as number;
    if (!Number.isFinite(y)) continue;
    const c = Math.round(indices[i] as number);
    suma.set(c, (suma.get(c) ?? 0) + y);
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.round(indices[i] as number);
    const k = cuenta.get(c);
    out[i] = k ? (suma.get(c) as number) / k : NaN;
  }
  return out;
}

/** Texto de un umbral: "P(VAN < 0)". */
export function describirUmbral(nombre: string, valor: number, sentido: 'below' | 'above'): string {
  return `P(${nombre} ${sentido === 'below' ? '<' : '>'} ${valor})`;
}

export interface SimulacionCompletada {
  ok: true;
  motor: 'fast' | 'compatible';
  /**
   * Ritmo medido, solo en el modo compatible. Es el dato que permite decirle
   * al usuario **la próxima vez** cuánto va a tardar antes de que se
   * comprometa, así que sube hasta aquí para poder guardarlo.
   */
  iteracionesPorSegundo?: number;
  eleccion: EleccionMotor;
  salidas: ResultadoSalida[];
  iteracionesCompletadas: number;
  cancelada: boolean;
  milisegundos: number;
  lectura: EstadisticasLectura;
  /** Identifica la simulación (su marca de tiempo), para no compararla consigo misma. */
  idSimulacion?: string;
  /** Si vienen del libro y no de una simulación de esta sesión. */
  restaurado?: { guardadoEn: string };
  /**
   * Huella del modelo que se simuló (`resultadosGuardados.ts`). Si el modelo
   * actual tiene otra, estos resultados ya no le corresponden.
   */
  huellaModelo?: string;
  /** Entradas declaradas en el libro con funciones RIESGO.*, además de las del panel. */
  entradasDeFunciones?: { ref: string; distribucion: string; nombre?: string }[];
  /** Cómo se muestreó cada entrada (C9), con los valores generados. */
  entradas?: EntradaMuestreada[];
  /** Celdas con RIESGO.* que también están en el panel: se usó lo del panel. */
  funcionesIgnoradas?: string[];
  /** Celdas con funciones de resultados (`RIESGO.MEDIA`…, B6): se recalculan al terminar. */
  celdasConResultados?: string[];
  /** Cada opción de las decisiones (`RIESGO.DECISION`, T9), con sus salidas. */
  decisiones?: import('./decisiones.ts').ResultadoDecisiones;
  /** Los `RIESGO.EVENTO` del libro con su valor esperado (T8). */
  registroRiesgos?: import('./registroRiesgos.ts').FilaRiesgo[];
  /** Cuántos hilos calcularon (motor rápido). 1 = en el hilo del panel. */
  hilos?: number;
  /**
   * Si se simuló "hasta alcanzar la precisión": las iteraciones de cada tanda
   * (la última es la que cuenta), si se alcanzó y con qué tope.
   */
  convergencia?: { objetivo: number; tandas: number[]; alcanzada: boolean; tope: number; noDisponible?: boolean };
  /** Cuántas iteraciones entraron en el análisis de sensibilidad. */
  muestraSensibilidad?: number;
}

export type FalloSimulacion =
  | { ok: false; tipo: 'modelo'; mensaje: string; detalles: string[] }
  | { ok: false; tipo: 'referencias'; mensaje: string; detalles: string[] }
  | { ok: false; tipo: 'celdas'; mensaje: string; detalles: string[] }
  | { ok: false; tipo: 'compilacion'; mensaje: string; detalles: string[] }
  | { ok: false; tipo: 'calculo'; mensaje: string; detalles: string[] };

export type ResultadoSimulacionPanel = SimulacionCompletada | FalloSimulacion;

/** Una fila de la hoja, como la escribe Office.js: valores sueltos. */
type Fila = (string | number | boolean)[];

/** Un rectángulo de la hoja, en índices desde 0. */
export interface Zona {
  fila: number;
  col: number;
  filas: number;
  cols: number;
}

export interface GraficoInforme {
  /** `barras`: horizontales (tornado). `lineas-filas`: una serie por fila (araña). */
  tipo: 'linea' | 'columnas' | 'barras' | 'lineas-filas';
  titulo: string;
  /** Los datos: la primera fila son las cabeceras. */
  datos: Zona;
  /** Dónde se coloca: de la esquina superior izquierda a la inferior derecha. */
  desde: { fila: number; col: number };
  hasta: { fila: number; col: number };
}

export interface Informe {
  filas: Fila[];
  /** Índices (base 0) de las filas que son títulos de sección. */
  titulos: number[];
  /** Índices de las filas de texto secundario. */
  tenues: number[];
  /** Bandas de color de cada salida: la fila entera del bloque. */
  bandas: number[];
  /** Filas de cabecera de tabla (negrita con borde inferior). */
  cabeceras: Zona[];
  /** Formatos numéricos de Excel por zona (`#,##0`, `0.0%`…). */
  formatos: Array<Zona & { formato: string }>;
  graficos: GraficoInforme[];
  curvas: { nombre: string; filaInicio: number; puntos: number }[];
  histogramas: { nombre: string; filaInicio: number; barras: number }[];
  /** Anchos de columna sugeridos, en caracteres. */
  anchos: number[];
}

/**
 * Columnas del cuerpo (A..F), de los gráficos de la distribución (H..O), de
 * los de sensibilidad (Q..X) y de los datos de todos ellos (Z en adelante).
 */
const COL_GRAFICOS = 7;
const COL_GRAFICOS_2 = 16;
const COL_DATOS = 25;
const ALTO_GRAFICO = 15;

export const FORMATO_ENTERO = '#,##0';
export const FORMATO_PORCENTAJE = '0.0%';
const FORMATO_RHO = '0.00';

/** Cuatro cifras significativas, para las etiquetas de los tramos. */
function redondear(x: number): string {
  return Number(x.toPrecision(4)).toLocaleString('es-ES');
}

/**
 * El formato con el que se escribe una salida si no se sabe el de su celda:
 * enteros con miles si son grandes, dos decimales si no, y porcentaje si
 * todo cae entre −1 y 1 y se llama como una tasa (TIR, margen…).
 */
export function formatoPorDefecto(s: Pick<ResultadoSalida, 'nombre' | 'resumen'>): string {
  const { min, max, media } = s.resumen;
  const pareceTasa = /\b(tir|irr|tasa|margen|%|rentabilidad|porcentaje)\b/i.test(s.nombre) || /%/.test(s.nombre);
  if (pareceTasa && Number.isFinite(min) && Number.isFinite(max) && min >= -1.5 && max <= 1.5) return FORMATO_PORCENTAJE;
  return Math.abs(media) >= 100 ? FORMATO_ENTERO : '#,##0.00';
}

/** Un formato «General» no dice nada: se trata como si no hubiera. */
function formatoUtil(f: string | undefined): string | undefined {
  return f && f.trim() !== '' && f.trim().toLowerCase() !== 'general' && f.trim() !== '@' ? f : undefined;
}

export interface OpcionesInforme {
  /** El formato numérico de la celda de origen (leído de Excel), si se conoce. */
  formatoDe?: (ref: string) => string | undefined;
  ahora?: Date;
}

/**
 * Arma la hoja del informe como datos puros, sin tocar Excel (C8). Un bloque
 * por salida: banda con el nombre, la lectura en palabras, estadísticos y
 * percentiles lado a lado, sensibilidad debajo y los dos gráficos a la
 * derecha. Los datos de los gráficos van aparte, en columnas propias, para que
 * el cuerpo se lea sin ellos. Los números llevan el formato de su celda de
 * origen (o uno razonable), no quince decimales.
 */
export function construirInforme(modelo: ModeloRiesgo, resultado: SimulacionCompletada, opciones: OpcionesInforme = {}): Informe {
  const filas: Fila[] = [];
  const titulos: number[] = [];
  const tenues: number[] = [];
  const bandas: number[] = [];
  const cabeceras: Zona[] = [];
  const formatos: Informe['formatos'] = [];
  const graficos: GraficoInforme[] = [];
  const curvas: Informe['curvas'] = [];
  const histogramas: Informe['histogramas'] = [];

  const poner = (fila: number, col: number, valores: Fila) => {
    while (filas.length <= fila) filas.push([]);
    const f = filas[fila] as Fila;
    while (f.length < col) f.push('');
    for (let k = 0; k < valores.length; k++) f[col + k] = valores[k] as string | number | boolean;
  };
  let fila = 0;
  const linea = (valores: Fila) => poner(fila++, 0, valores);
  const titulo = (texto: string) => { titulos.push(fila); linea([texto]); };
  const tenue = (texto: string) => { tenues.push(fila); linea([texto]); };
  const cabecera = (valores: Fila, col = 0) => { cabeceras.push({ fila, col, filas: 1, cols: valores.length }); poner(fila++, col, valores); };
  const formato = (z: Zona, f: string) => formatos.push({ ...z, formato: f });

  // Los datos de los gráficos, en su propia zona a la derecha.
  let filaDatos = 0;
  poner(filaDatos, COL_DATOS, ['DATOS DE LOS GRÁFICOS']);
  titulos.push(filaDatos);
  filaDatos += 2;

  titulo(modelo.project?.title.trim() || 'Análisis de riesgo — simulación Monte Carlo');
  if (modelo.project?.description?.trim()) linea([modelo.project.description.trim()]);
  tenue((opciones.ahora ?? new Date()).toLocaleString('es-ES'));
  fila++;

  titulo('CÓMO SE CALCULÓ');
  const inicioAjustes = fila;
  linea(['Motor', resultado.motor === 'fast' ? 'Rápido (en memoria)' : 'Compatible (Excel en el bucle)']);
  linea(['Iteraciones', resultado.iteracionesCompletadas]);
  if (resultado.hilos) linea(['Hilos de cálculo', resultado.hilos]);
  linea(['Tiempo', `${(resultado.milisegundos / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`]);
  linea(['Semilla', modelo.settings.seed]);
  linea(['Muestreo', modelo.settings.sampling === 'lhs' ? 'Hipercubo latino' : 'Monte Carlo']);
  linea(['Celdas del modelo', resultado.eleccion.celdasNecesarias]);
  formato({ fila: inicioAjustes, col: 1, filas: fila - inicioAjustes, cols: 1 }, FORMATO_ENTERO);
  if (resultado.cancelada) tenue('La simulación se canceló antes de completar las iteraciones pedidas.');
  if (resultado.eleccion.motivos.length > 0) tenue('El motor rápido no pudo con este modelo; se usó el compatible.');
  fila++;

  // C1: el resumen de las entradas, con lo que de verdad se muestreó y su
  // puesto en el tornado (el mayor |ρ| con cualquier salida).
  titulo('RESUMEN DE LAS ENTRADAS');
  cabecera(['Nombre', 'Celda', 'Distribución', 'Media', 'Desviación', 'p5', 'p50', 'p95', 'Puesto en el tornado', 'Correlaciones']);
  const nombrePorId = new Map(modelo.inputs.map((e) => [e.id, e.name] as const));
  const muestreadas = new Map((resultado.entradas ?? []).map((e) => [e.id, e] as const));
  const influencia = new Map<string, number>();
  for (const s of resultado.salidas) {
    for (const x of s.sensibilidad ?? []) influencia.set(x.id, Math.max(influencia.get(x.id) ?? 0, Math.abs(x.spearman)));
  }
  const puestos = new Map([...influencia.entries()].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1] as const));
  for (const e of modelo.inputs) {
    const correlaciones = e.correlations.map((c) => `${nombrePorId.get(c.with) ?? c.with}: ${c.coefficient}`).join('; ');
    const m = muestreadas.get(e.id);
    const numerica = m && !m.frecuencias;
    if (numerica) formato({ fila, col: 3, filas: 1, cols: 5 }, Math.abs(m.media) >= 100 ? FORMATO_ENTERO : '#,##0.00');
    linea([
      e.name, e.ref, resumirDistribucion(e.dist),
      numerica ? m.media : '', numerica ? m.desviacion : '', numerica ? m.percentiles.p5 : '', numerica ? m.percentiles.p50 : '', numerica ? m.percentiles.p95 : '',
      puestos.get(e.id) ?? '', correlaciones,
    ]);
  }
  for (const e of resultado.entradasDeFunciones ?? []) {
    linea([`${e.nombre && e.nombre !== e.ref ? e.nombre : e.ref} (función RIESGO)`, e.ref, e.distribucion, '']);
  }
  fila++;

  const formatoSalida = (s: ResultadoSalida) => formatoUtil(opciones.formatoDe?.(s.ref)) ?? formatoPorDefecto(s);
  const constantes = new Set(resultado.eleccion.salidasConstantes);
  const esConstante = (s: ResultadoSalida) => constantes.has(s.ref) || (s.resumen.n > 0 && s.resumen.desviacion === 0);

  titulo('RESUMEN DE LAS SALIDAS');
  cabecera(['Nombre', 'Media', 'p5', 'p50', 'p95', 'Sin valor']);
  for (const s of resultado.salidas) {
    if (esSalidaDeTexto(s)) {
      const moda = s.categorias?.[0];
      linea([s.nombre, moda ? `«${moda.valor}» ${(moda.proporcion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : '', '', '', '', '']);
      continue;
    }
    const p = s.resumen.percentiles;
    formato({ fila, col: 1, filas: 1, cols: 4 }, formatoSalida(s));
    linea([s.nombre, s.resumen.media, p.p5 ?? '', p.p50 ?? '', p.p95 ?? '', s.noNumericas]);
  }
  tenue('«Sin valor» son las iteraciones en que la salida no dio un número (por ejemplo, una TIR que no existe).');
  fila++;

  /** La salida en cada categoría de cada entrada de texto (T3). */
  const escribirPorCategoria = (s: ResultadoSalida, fmt?: string) => {
    for (const b of s.porCategoria ?? []) {
      const numerica = b.filas.some((x) => x.media !== undefined);
      cabecera(numerica ? [`Según ${b.nombre}`, 'Veces', 'Media', 'p5', 'p95'] : [`Según ${b.nombre}`, 'Veces', 'Sale más', 'Probabilidad']);
      const i0 = fila;
      for (const x of b.filas) {
        linea(numerica ? [x.categoria, x.proporcion, x.media ?? '', x.p5 ?? '', x.p95 ?? ''] : [x.categoria, x.proporcion, x.masFrecuente ?? '', x.probabilidad ?? '']);
      }
      formato({ fila: i0, col: 1, filas: b.filas.length, cols: 1 }, FORMATO_PORCENTAJE);
      if (numerica && fmt) formato({ fila: i0, col: 2, filas: b.filas.length, cols: 3 }, fmt);
      if (!numerica) formato({ fila: i0, col: 3, filas: b.filas.length, cols: 1 }, FORMATO_PORCENTAJE);
      fila++;
    }
  };

  for (const s of resultado.salidas) {
    const f = formatoSalida(s);
    bandas.push(fila);
    titulos.push(fila);
    linea([`SALIDA: ${s.nombre} (${s.ref})`]);

    if (esSalidaDeTexto(s)) {
      const categorias = s.categorias ?? [];
      const valorDeInteres = modelo.outputs.find((o) => o.id === s.id)?.valueOfInterest;
      const frases = lecturaDeTexto({ nombre: s.nombre, categorias, ...(valorDeInteres ? { valorDeInteres } : {}), ...(s.decisivas ? { decisivas: s.decisivas } : {}) });
      if (frases.length > 0) tenue(frases.join(' '));
      fila++;
      const inicio = fila;
      cabecera(['Valor', 'Iteraciones', 'Probabilidad']);
      const ini = fila;
      for (const c of categorias) linea([c.valor, c.conteo, c.proporcion]);
      formato({ fila: ini, col: 1, filas: categorias.length, cols: 1 }, FORMATO_ENTERO);
      formato({ fila: ini, col: 2, filas: categorias.length, cols: 1 }, FORMATO_PORCENTAJE);
      graficos.push({
        tipo: 'columnas', titulo: `${s.nombre} — frecuencia de cada valor`,
        datos: { fila: inicio, col: 0, filas: categorias.length + 1, cols: 1 }, // se completa abajo con la columna de probabilidades
        desde: { fila: inicio, col: COL_GRAFICOS }, hasta: { fila: inicio + ALTO_GRAFICO, col: COL_GRAFICOS + 7 },
      });
      // Datos del gráfico: nombre y probabilidad en columnas contiguas, en la zona de datos.
      poner(filaDatos++, COL_DATOS, [`${s.nombre}: frecuencias`]);
      const filaCab = filaDatos;
      cabeceras.push({ fila: filaCab, col: COL_DATOS, filas: 1, cols: 2 });
      poner(filaDatos++, COL_DATOS, ['Valor', 'Probabilidad']);
      for (const c of categorias) poner(filaDatos++, COL_DATOS, [c.valor, c.proporcion]);
      formato({ fila: filaCab + 1, col: COL_DATOS + 1, filas: categorias.length, cols: 1 }, FORMATO_PORCENTAJE);
      (graficos[graficos.length - 1] as GraficoInforme).datos = { fila: filaCab, col: COL_DATOS, filas: categorias.length + 1, cols: 2 };
      filaDatos++;
      fila++;
      const d = s.decisivas?.find((x) => x.valor === (valorDeInteres ?? categorias[0]?.valor))?.filas.filter((f) => f.rango > 0) ?? [];
      if (d.length > 0) {
        cabecera([`Qué decide que salga «${valorDeInteres ?? categorias[0]?.valor}»`, '10 % más bajo', '10 % más alto']);
        const i0 = fila;
        for (const f of d) linea([f.nombre, f.bajo, f.alto]);
        formato({ fila: i0, col: 1, filas: d.length, cols: 2 }, FORMATO_PORCENTAJE);
        fila++;
      }
      escribirPorCategoria(s);
      fila = Math.max(fila, inicio + ALTO_GRAFICO) + 2;
      continue;
    }

    if (s.resumen.n === 0) {
      tenue('Ninguna iteración dio un número en esta celda (devuelve un texto o un error de Excel): no hay estadísticas.');
      fila++;
      continue;
    }
    if (esConstante(s)) {
      formato({ fila, col: 1, filas: 1, cols: 1 }, f);
      linea(['Valor (no depende de ninguna entrada)', s.resumen.media]);
      fila++;
      continue;
    }

    const umbral = modelo.outputs.find((o) => o.id === s.id)?.threshold;
    const probUmbral = umbral && s.muestraOrdenada && s.muestraOrdenada.length > 0
      ? probabilidadUmbral(s.muestraOrdenada, umbral.value, umbral.direction === 'below' ? 'debajo' : 'encima')
      : undefined;
    const lectura = lecturaDeSalida({
      ...s,
      ...(umbral && probUmbral !== undefined ? { umbral: { valor: umbral.value, sentido: umbral.direction, probabilidad: probUmbral } } : {}),
    });
    if (lectura.length > 0) tenue(lectura.join(' '));
    fila++;

    // Estadísticos (A:B) y percentiles (D:E), lado a lado.
    const inicio = fila;
    // Una fecha (T7): los valores con el formato de la celda; la dispersión, en días.
    const fd = s.fecha ? '#,##0.0 "días"' : f;
    const estad: Array<[string, number, string]> = [
      ['Iteraciones con valor', s.resumen.n, FORMATO_ENTERO],
      ['Media', s.resumen.media, f],
      ['Desviación típica', s.resumen.desviacion, fd],
      ['Mínimo', s.resumen.min, f],
      ['Máximo', s.resumen.max, f],
    ];
    if (s.noNumericas > 0) estad.push(['Iteraciones sin valor numérico', s.noNumericas, FORMATO_ENTERO]);
    if (umbral && probUmbral !== undefined) estad.push([describirUmbral(s.nombre, umbral.value, umbral.direction), probUmbral, FORMATO_PORCENTAJE]);
    if (s.riesgo) {
      estad.push(['VaR 5 % cola baja (p5)', s.riesgo.varInferior, f]);
      estad.push(['CVaR 5 % cola baja (media del peor 5 %)', s.riesgo.cvarInferior, f]);
      estad.push(['VaR 5 % cola alta (p95)', s.riesgo.varSuperior, f]);
      estad.push(['CVaR 5 % cola alta (media del mayor 5 %)', s.riesgo.cvarSuperior, f]);
      estad.push(['Semidesviación', s.riesgo.semidesviacion, fd]);
      estad.push(['Asimetría', s.riesgo.asimetria, '0.00']);
      estad.push(['Curtosis (en exceso)', s.riesgo.curtosis, '0.00']);
    }
    if (s.precision) {
      estad.push(['Margen de la media (95 %)', s.precision.margenMedia, fd]);
      estad.push([`Iteraciones para un margen del ${(s.precision.objetivo * 100).toLocaleString('es-ES')} %`, s.precision.iteracionesParaObjetivo, FORMATO_ENTERO]);
    }
    cabecera(['Estadístico', 'Valor']);
    estad.forEach(([etq, v, fmt], k) => {
      poner(inicio + 1 + k, 0, [etq, v]);
      formato({ fila: inicio + 1 + k, col: 1, filas: 1, cols: 1 }, fmt);
    });
    const percentiles = Object.entries(s.resumen.percentiles);
    cabeceras.push({ fila: inicio, col: 3, filas: 1, cols: 2 });
    poner(inicio, 3, ['Percentil', 'Valor']);
    percentiles.forEach(([clave, valor], k) => poner(inicio + 1 + k, 3, [clave, valor]));
    formato({ fila: inicio + 1, col: 4, filas: percentiles.length, cols: 1 }, f);
    const intervalos = s.precision?.percentiles ?? [];
    intervalos.forEach((iv, k) => {
      poner(inicio + 2 + percentiles.length + k, 3, [`p${Math.round(iv.p * 100)} (intervalo 95 %)`, iv.inferior, iv.superior]);
      formato({ fila: inicio + 2 + percentiles.length + k, col: 4, filas: 1, cols: 2 }, f);
    });
    const altoTablas = 1 + Math.max(estad.length, percentiles.length + (intervalos.length > 0 ? 1 + intervalos.length : 0));
    fila = inicio + altoTablas + 1;

    if (s.sensibilidad && s.sensibilidad.length > 0) {
      cabecera(['Qué la mueve: entrada', 'Celda', 'Spearman (ρ)', 'Peso (ρ²)', 'Contribución a la varianza']);
      const ini = fila;
      for (const x of s.sensibilidad) linea([x.nombre, x.ref, x.spearman, x.peso, x.contribucion ?? '']);
      formato({ fila: ini, col: 2, filas: s.sensibilidad.length, cols: 1 }, FORMATO_RHO);
      formato({ fila: ini, col: 3, filas: s.sensibilidad.length, cols: 2 }, FORMATO_PORCENTAJE);
      if (s.r2 !== undefined) {
        formato({ fila, col: 1, filas: 1, cols: 1 }, FORMATO_PORCENTAJE);
        linea(['Varianza explicada por las entradas (R²)', s.r2]);
      }
      tenue(
        `Correlación de rangos sobre ${resultado.muestraSensibilidad ?? resultado.iteracionesCompletadas} ` +
          'iteraciones. ρ > 0: la salida sube con la entrada; ρ < 0: baja. El peso es aproximado si las entradas están correlacionadas.',
      );
    }
    tenue('Percentiles aproximados: se calculan con un t-digest, no ordenando todos los valores.');
    fila++;
    for (const c of s.colas ?? []) {
      cabecera([`Para quedar en su 10 % ${c.cola === 'baja' ? 'más bajo' : 'más alto'}`, 'En esos casos', 'Normalmente', 'Desplazamiento (σ)']);
      for (const x of c.filas.slice(0, 5)) {
        if (x.categoria !== undefined) {
          formato({ fila, col: 1, filas: 1, cols: 2 }, FORMATO_PORCENTAJE);
          linea([`${x.nombre}: «${x.categoria}»`, x.proporcionCola ?? '', x.proporcion ?? '', '']);
        } else {
          formato({ fila, col: 3, filas: 1, cols: 1 }, FORMATO_RHO);
          linea([x.nombre, x.medianaCola ?? '', x.mediana ?? '', x.desplazamiento ?? '']);
        }
      }
      fila++;
    }
    escribirPorCategoria(s, f);

    // Los datos de los gráficos, a la derecha, y los gráficos junto al bloque.
    const altoGraficos = s.histograma && s.histograma.length > 0 ? 2 * ALTO_GRAFICO + 1 : ALTO_GRAFICO;
    let filaGrafico = inicio;
    if (s.histograma && s.histograma.length > 0) {
      poner(filaDatos++, COL_DATOS, [`${s.nombre}: histograma`]);
      cabeceras.push({ fila: filaDatos, col: COL_DATOS, filas: 1, cols: 4 });
      poner(filaDatos++, COL_DATOS, ['Histograma: desde', 'Hasta', 'Tramo', 'Iteraciones']);
      const filaCab = filaDatos - 1;
      for (const b of s.histograma) poner(filaDatos++, COL_DATOS, [b.x0, b.x1, `${redondear(b.x0)} a ${redondear(b.x1)}`, b.count]);
      formato({ fila: filaCab + 1, col: COL_DATOS, filas: s.histograma.length, cols: 2 }, f);
      histogramas.push({ nombre: s.nombre, filaInicio: filaCab, barras: s.histograma.length + 1 });
      graficos.push({
        tipo: 'columnas', titulo: `${s.nombre} — histograma`,
        datos: { fila: filaCab, col: COL_DATOS + 2, filas: s.histograma.length + 1, cols: 2 },
        desde: { fila: filaGrafico, col: COL_GRAFICOS }, hasta: { fila: filaGrafico + ALTO_GRAFICO, col: COL_GRAFICOS + 7 },
      });
      filaGrafico += ALTO_GRAFICO + 1;
      filaDatos++;
    }
    poner(filaDatos++, COL_DATOS, [`${s.nombre}: probabilidad acumulada`]);
    cabeceras.push({ fila: filaDatos, col: COL_DATOS, filas: 1, cols: 2 });
    poner(filaDatos++, COL_DATOS, ['Valor', 'Probabilidad acumulada']);
    const filaCabCurva = filaDatos - 1;
    for (const p of s.cdf) poner(filaDatos++, COL_DATOS, [p.x, p.p]);
    formato({ fila: filaCabCurva + 1, col: COL_DATOS, filas: s.cdf.length, cols: 1 }, f);
    formato({ fila: filaCabCurva + 1, col: COL_DATOS + 1, filas: s.cdf.length, cols: 1 }, FORMATO_PORCENTAJE);
    curvas.push({ nombre: s.nombre, filaInicio: filaCabCurva, puntos: s.cdf.length + 1 });
    graficos.push({
      tipo: 'linea', titulo: `${s.nombre} — probabilidad acumulada`,
      datos: { fila: filaCabCurva, col: COL_DATOS, filas: s.cdf.length + 1, cols: 2 },
      desde: { fila: filaGrafico, col: COL_GRAFICOS }, hasta: { fila: filaGrafico + ALTO_GRAFICO, col: COL_GRAFICOS + 7 },
    });
    filaDatos++;

    // C2: el tornado y la araña como gráficos de Excel, a la derecha de los otros.
    if (s.sensibilidad && s.sensibilidad.length > 0) {
      poner(filaDatos++, COL_DATOS, [`${s.nombre}: tornado (correlación de rangos)`]);
      const filaCab = filaDatos;
      cabeceras.push({ fila: filaCab, col: COL_DATOS, filas: 1, cols: 2 });
      poner(filaDatos++, COL_DATOS, ['Entrada', 'Spearman (ρ)']);
      // Excel dibuja la primera categoría abajo: de menor a mayor para que la
      // que más pesa quede arriba, como en el panel.
      const orden = [...s.sensibilidad].sort((a, b) => Math.abs(a.spearman) - Math.abs(b.spearman));
      for (const x of orden) poner(filaDatos++, COL_DATOS, [x.nombre, x.spearman]);
      formato({ fila: filaCab + 1, col: COL_DATOS + 1, filas: orden.length, cols: 1 }, FORMATO_RHO);
      graficos.push({
        tipo: 'barras', titulo: `${s.nombre} — qué la mueve más`,
        datos: { fila: filaCab, col: COL_DATOS, filas: orden.length + 1, cols: 2 },
        desde: { fila: inicio, col: COL_GRAFICOS_2 }, hasta: { fila: inicio + ALTO_GRAFICO, col: COL_GRAFICOS_2 + 7 },
      });
      filaDatos++;
    }
    if (s.arana && s.arana.length > 0) {
      poner(filaDatos++, COL_DATOS, [`${s.nombre}: araña (media de la salida por decil de la entrada)`]);
      const filaCab = filaDatos;
      cabeceras.push({ fila: filaCab, col: COL_DATOS, filas: 1, cols: 12 });
      poner(filaDatos++, COL_DATOS, ['Entrada', ...Array.from({ length: 10 }, (_, i) => `D${i + 1}`), 'Rango']);
      const ini = filaDatos;
      for (const c of s.arana) poner(filaDatos++, COL_DATOS, [c.nombre, ...c.medias, c.rango]);
      formato({ fila: ini, col: COL_DATOS + 1, filas: s.arana.length, cols: 11 }, f);
      graficos.push({
        tipo: 'lineas-filas', titulo: `${s.nombre} — qué pasa si cada entrada se mueve`,
        datos: { fila: filaCab, col: COL_DATOS, filas: s.arana.length + 1, cols: 11 },
        desde: { fila: inicio + ALTO_GRAFICO + 1, col: COL_GRAFICOS_2 }, hasta: { fila: inicio + 2 * ALTO_GRAFICO + 1, col: COL_GRAFICOS_2 + 7 },
      });
      filaDatos++;
    }

    // El bloque siguiente empieza por debajo del cuerpo y de los gráficos.
    fila = Math.max(fila, inicio + altoGraficos) + 2;
  }

  // Todas las filas con el mismo ancho, para escribirlas de una vez.
  const ancho = Math.max(1, ...filas.map((f) => f.length));
  for (const f of filas) while (f.length < ancho) f.push('');

  const anchos = Array.from({ length: ancho }, (_, c) =>
    c === 0 ? 34 : c < COL_GRAFICOS ? 16 : c < COL_DATOS ? 10 : c === COL_DATOS ? 28 : 14,
  );
  return { filas, titulos, tenues, bandas, cabeceras, formatos, graficos, curvas, histogramas, anchos };
}
