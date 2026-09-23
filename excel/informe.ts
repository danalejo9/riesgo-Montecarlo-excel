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
import type { PuntoCDF, ResumenEstadistico } from '../engine/stats/index.ts';
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

    // La curva, como datos: dos columnas que el gráfico de Excel usa y que el
    // usuario puede reutilizar para hacer el suyo.
    añadir(['Valor', 'Probabilidad acumulada']);
    const filaInicio = filas.length - 1; // la cabecera entra en la serie como nombre
    for (const p of s.cdf) añadir([p.x, p.p]);
    curvas.push({ nombre: s.nombre, filaInicio, puntos: s.cdf.length + 1 });
    añadir([]);
  }

  return { filas, titulos, tenues, curvas };
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
