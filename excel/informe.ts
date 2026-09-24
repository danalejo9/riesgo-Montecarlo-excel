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
  histogramaDeMuestra,
  ordenarUtiles,
  precisionDeSimulacion,
  type Precision,
  probabilidadUmbral,
  type BinHistograma,
  type PuntoCDF,
  type ResumenEstadistico,
} from '../engine/stats/index.ts';
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
  /**
   * `true` si `muestraOrdenada` no es la muestra sino sus cuantiles guardados
   * en el libro (resultados restaurados): las probabilidades son aproximadas y
   * no se pueden contar iteraciones.
   */
  muestraReducida?: boolean;
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
  const entradas = modelo.inputs.flatMap((e, i) => {
    const muestras = muestrasPorClave.get(clavesEntrada[i] as string);
    return muestras ? [{ id: e.id, muestras }] : [];
  });
  const porId = new Map(modelo.inputs.map((e) => [e.id, e] as const));
  return analizarSensibilidad(entradas, muestraSalida).map((f) => {
    const e = porId.get(f.id);
    return { ...f, nombre: e?.name ?? f.id, ref: e?.ref ?? '' };
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
): Pick<ResultadoSalida, 'sensibilidad' | 'muestraOrdenada' | 'histograma'> {
  if (!muestraSalida || muestraSalida.length === 0) return {};
  const muestraOrdenada = ordenarUtiles(muestraSalida);
  return {
    sensibilidad: sensibilidadDeSalida(modelo, clavesEntrada, muestrasPorClave, muestraSalida),
    muestraOrdenada,
    histograma: histogramaDeMuestra(muestraOrdenada),
  };
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

interface Informe {
  filas: Fila[];
  /** Índices (base 0) de las filas que son títulos de sección. */
  titulos: number[];
  /** Índices de las filas de texto secundario. */
  tenues: number[];
  curvas: { nombre: string; filaInicio: number; puntos: number }[];
  /** Tablas de histograma: la cabecera está en `filaInicio`; columnas 2 y 3. */
  histogramas: { nombre: string; filaInicio: number; barras: number }[];
}

/** Cuatro cifras significativas, para las etiquetas de los tramos. */
function redondear(x: number): string {
  return Number(x.toPrecision(4)).toLocaleString('es-ES');
}

/**
 * Arma el informe como datos puros, sin tocar Excel. Separado para poder
 * razonar sobre el contenido —y probarlo— sin un libro abierto.
 */
export function construirInforme(modelo: ModeloRiesgo, resultado: SimulacionCompletada): Informe {
  const filas: Fila[] = [];
  const titulos: number[] = [];
  const tenues: number[] = [];
  const curvas: Informe['curvas'] = [];
  const histogramas: Informe['histogramas'] = [];

  const añadir = (...f: Fila[]) => filas.push(...f);
  const titulo = (texto: string) => {
    titulos.push(filas.length);
    filas.push([texto]);
  };
  const tenue = (texto: string) => {
    tenues.push(filas.length);
    filas.push([texto]);
  };

  titulo('Análisis de riesgo — simulación Monte Carlo');
  tenue(new Date().toLocaleString('es-ES'));
  añadir([]);

  titulo('CÓMO SE CALCULÓ');
  añadir(
    ['Motor', resultado.motor === 'fast' ? 'Rápido (en memoria)' : 'Compatible (Excel en el bucle)'],
    ['Iteraciones', resultado.iteracionesCompletadas],
    ...(resultado.hilos ? [['Hilos de cálculo', resultado.hilos] as Fila] : []),
    ['Tiempo', `${(resultado.milisegundos / 1000).toFixed(1)} s`],
    ['Semilla', modelo.settings.seed],
    ['Muestreo', modelo.settings.sampling === 'lhs' ? 'Hipercubo latino' : 'Monte Carlo'],
    ['Celdas del modelo', resultado.eleccion.celdasNecesarias],
  );
  if (resultado.cancelada) {
    tenue('La simulación se canceló antes de completar las iteraciones pedidas.');
  }
  if (resultado.eleccion.motivos.length > 0) {
    tenue('El motor rápido no pudo con este modelo; se usó el compatible.');
  }
  añadir([]);

  titulo('ENTRADAS INCIERTAS');
  añadir(['Nombre', 'Celda', 'Distribución', 'Correlaciones']);
  const nombrePorId = new Map(modelo.inputs.map((e) => [e.id, e.name] as const));
  for (const e of modelo.inputs) {
    const correlaciones = e.correlations
      .map((c) => `${nombrePorId.get(c.with) ?? c.with}: ${c.coefficient}`)
      .join('; ');
    añadir([e.name, e.ref, resumirDistribucion(e.dist), correlaciones]);
  }
  añadir([]);

  titulo('RESUMEN DE LAS SALIDAS');
  añadir(['Nombre', 'Celda', 'Media', 'Desviación', 'Mínimo', 'Máximo', 'p5', 'p50', 'p95', 'Sin valor']);
  for (const s of resultado.salidas) {
    añadir([
      s.nombre,
      s.ref,
      s.resumen.media,
      s.resumen.desviacion,
      s.resumen.min,
      s.resumen.max,
      s.resumen.percentiles.p5 ?? '',
      s.resumen.percentiles.p50 ?? '',
      s.resumen.percentiles.p95 ?? '',
      s.noNumericas,
    ]);
  }
  tenue('«Sin valor» son las iteraciones en que la salida no dio un número (por ejemplo, una TIR que no existe).');
  añadir([]);

  for (const s of resultado.salidas) {
    detallarSalida(s, { añadir, titulo, tenue });
    const umbral = modelo.outputs.find((o) => o.id === s.id)?.threshold;
    if (umbral && s.muestraOrdenada && s.muestraOrdenada.length > 0) {
      const p = probabilidadUmbral(s.muestraOrdenada, umbral.value, umbral.direction === 'below' ? 'debajo' : 'encima');
      añadir([describirUmbral(s.nombre, umbral.value, umbral.direction), p]);
      añadir([]);
    }
    if (s.precision) {
      añadir(
        ['Margen de la media (95 %)', s.precision.margenMedia],
        [`Iteraciones para un margen del ${s.precision.objetivo * 100} %`, s.precision.iteracionesParaObjetivo],
      );
      for (const iv of s.precision.percentiles) {
        añadir([`p${Math.round(iv.p * 100)} (intervalo 95 %)`, iv.inferior, iv.superior]);
      }
      añadir([]);
    }
    if (s.sensibilidad && s.sensibilidad.length > 0) {
      añadir(['Sensibilidad: entrada', 'Celda', 'Spearman (ρ)', 'Peso (ρ² normalizado)']);
      for (const f of s.sensibilidad) añadir([f.nombre, f.ref, f.spearman, f.peso]);
      tenue(
        `Correlación de rangos sobre ${resultado.muestraSensibilidad ?? resultado.iteracionesCompletadas} ` +
          'iteraciones. ρ > 0: la salida sube con la entrada; ρ < 0: baja. El peso es aproximado si las entradas están correlacionadas.',
      );
      añadir([]);
    }

    // La curva, como datos: dos columnas que el gráfico de Excel usa y que el
    // usuario puede reutilizar para hacer el suyo.
    añadir(['Valor', 'Probabilidad acumulada']);
    const filaInicio = filas.length - 1; // la cabecera entra en la serie como nombre
    for (const p of s.cdf) añadir([p.x, p.p]);
    curvas.push({ nombre: s.nombre, filaInicio, puntos: s.cdf.length + 1 });
    añadir([]);

    if (s.histograma && s.histograma.length > 0) {
      // El tramo como texto va justo antes del conteo para que el gráfico de
      // columnas tome las dos columnas contiguas: etiqueta y altura.
      añadir(['Histograma: desde', 'Hasta', 'Tramo', 'Iteraciones']);
      const filaInicio = filas.length - 1;
      for (const b of s.histograma) {
        añadir([b.x0, b.x1, `${redondear(b.x0)} a ${redondear(b.x1)}`, b.count]);
      }
      histogramas.push({ nombre: s.nombre, filaInicio, barras: s.histograma.length + 1 });
      añadir([]);
    }
  }

  return { filas, titulos, tenues, curvas, histogramas };
}

function detallarSalida(
  s: ResultadoSalida,
  io: { añadir: (...f: Fila[]) => void; titulo: (t: string) => void; tenue: (t: string) => void },
): void {
  io.titulo(`SALIDA: ${s.nombre} (${s.ref})`);
  io.añadir(
    ['Iteraciones con valor', s.resumen.n],
    ['Media', s.resumen.media],
    ['Desviación típica', s.resumen.desviacion],
    ['Mínimo', s.resumen.min],
    ['Máximo', s.resumen.max],
  );
  if (s.noNumericas > 0) {
    io.añadir(['Iteraciones sin valor numérico', s.noNumericas]);
  }
  io.añadir([]);

  io.añadir(['Percentil', 'Valor']);
  for (const [clave, valor] of Object.entries(s.resumen.percentiles)) {
    io.añadir([clave, valor]);
  }
  io.tenue('Percentiles aproximados: se calculan con un t-digest, no ordenando todos los valores.');
  io.añadir([]);
}
