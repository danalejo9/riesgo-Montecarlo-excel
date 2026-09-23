/**
 * El ciclo completo, de un libro abierto a unos resultados: **la pieza que
 * convierte todo lo anterior en un producto**.
 *
 * Hasta aquí había un motor que simula, un modo compatible, un guardián, un
 * lector y un modelo. Esto los pone en fila:
 *
 *   1. Resolver las referencias del modelo a celdas de verdad.
 *   2. Leer el libro entero y construir el grafo (fórmulas **y datos**).
 *   3. Decidir qué motor puede con este modelo, y decirlo con nombres de
 *      celda si no puede el rápido.
 *   4. Simular: en memoria, o con Excel en el bucle.
 *   5. Devolver los resultados en la forma que pinta el panel.
 *
 * No hay nada de React aquí, y tampoco nada de estadística: es coreografía. Lo
 * que sí hay es **un sitio donde se para**. Cada paso puede fallar por algo que
 * el usuario tiene que entender y arreglar —una celda que no existe, un nombre
 * definido borrado, una función que falta— y cada uno de esos fallos tiene su
 * propio tipo de error, con las palabras que hacen falta para actuar. Un
 * `catch` genérico con "algo salió mal" convertiría todo este trabajo en una
 * caja negra.
 */

import { simularPorBloques } from '../engine/executor/index.ts';
import { generarTramoDeEntrada, resolverEntradas, type DefinicionEntrada } from '../engine/executor/entradas.ts';
import { compilarPlan } from '../engine/compiler/plan.ts';
import { construirGrafo } from '../engine/graph/index.ts';
import {
  describirMotivo,
  elegirMotor,
  prepararEntradas,
  type EleccionMotor,
  type ModeloRiesgo,
} from '../engine/modelo/index.ts';
import { curvaCDF, resumenEstadistico, type PuntoCDF, type ResumenEstadistico } from '../engine/stats/index.ts';
import { leerLibro, type EstadisticasLectura } from './lectorLibro.ts';
import { cargarResolverRef } from './resolverRef.ts';
import { simularEnExcel } from './simulacionCompatible.ts';
import { aValorCelda } from './valoresEstaticos.ts';

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

export interface PeticionSimulacion {
  modelo: ModeloRiesgo;
  progreso?: (avance: AvanceSimulacion) => void;
  debeCancelar?: () => boolean;
}

export async function ejecutarSimulacion(peticion: PeticionSimulacion): Promise<ResultadoSimulacionPanel> {
  const { modelo, progreso, debeCancelar } = peticion;
  const arranque = performance.now();

  if (modelo.inputs.length === 0) {
    return fallo('modelo', 'El modelo no tiene ninguna entrada.', [
      'Marca al menos una celda como entrada incierta y dale una distribución.',
    ]);
  }
  if (modelo.outputs.length === 0) {
    return fallo('modelo', 'El modelo no tiene ninguna salida.', [
      'Marca al menos una celda como salida: es lo que se va a medir.',
    ]);
  }

  // 1. Referencias -> claves de celda.
  progreso?.({ fase: 'resolviendo', mensaje: 'Resolviendo las celdas del modelo…' });
  const refs = [...modelo.inputs.map((e) => e.ref), ...modelo.outputs.map((s) => s.ref)];
  const resolucion = await cargarResolverRef(refs);
  if (resolucion.sinResolver.length > 0) {
    return fallo(
      'referencias',
      'Hay referencias del modelo que ya no existen en el libro.',
      resolucion.sinResolver.map((s) => `${s.ref}: ${s.motivo}`),
    );
  }

  const clavesEntrada = modelo.inputs.map((e) => resolucion.resolver(e.ref));
  const clavesSalida = modelo.outputs.map((s) => resolucion.resolver(s.ref));

  // 2. Leer el libro y construir el grafo.
  progreso?.({ fase: 'leyendo', mensaje: 'Leyendo el libro…' });
  const libro = await leerLibro({
    progreso: (hechas, total) =>
      progreso?.({ fase: 'leyendo', mensaje: `Leyendo hojas… ${hechas} de ${total}` }),
  });
  const { grafo } = construirGrafo(libro.formulas, libro.valores.map(aValorCelda));

  // 3. ¿Qué motor puede con esto?
  progreso?.({ fase: 'analizando', mensaje: 'Analizando el modelo…' });
  const eleccion = elegirMotor(grafo, clavesEntrada, clavesSalida, modelo.settings.engine);
  if (eleccion.celdasDesconocidas.length > 0) {
    return fallo('celdas', 'Hay celdas del modelo que no están en el libro leído.', [
      ...eleccion.celdasDesconocidas,
      'Puede ser una hoja oculta: el lector las omite salvo que se le pidan.',
    ]);
  }

  const n = modelo.settings.iterations;
  const semilla = modelo.settings.seed;

  const preparadas = prepararEntradas(modelo, resolucion.resolver, semilla);
  if (!preparadas.ok) return fallo('modelo', 'El modelo no se pudo preparar.', preparadas.errores);

  // 4. Simular.
  const comun = { modelo, eleccion, lectura: libro.estadisticas, arranque };
  return eleccion.motor === 'compatible'
    ? await porElCompatible({ ...comun, definiciones: preparadas.entradas, clavesSalida, n, semilla, progreso, debeCancelar })
    : porElRapido({ ...comun, grafo, definiciones: preparadas.entradas, clavesEntrada, clavesSalida, n, semilla, progreso, debeCancelar });
}

interface Comun {
  modelo: ModeloRiesgo;
  eleccion: EleccionMotor;
  lectura: EstadisticasLectura;
  arranque: number;
  definiciones: DefinicionEntrada[];
  clavesSalida: string[];
  n: number;
  semilla: number;
  progreso?: (avance: AvanceSimulacion) => void;
  debeCancelar?: () => boolean;
}

function porElRapido(
  args: Comun & { grafo: ReturnType<typeof construirGrafo>['grafo']; clavesEntrada: string[] },
): Promise<ResultadoSimulacionPanel> {
  const { grafo, clavesEntrada, clavesSalida, n, semilla, progreso, debeCancelar } = args;

  const compilado = compilarPlan(grafo, new Set(clavesEntrada), clavesSalida);
  if (!compilado.ok) {
    return Promise.resolve(
      fallo('compilacion', 'El modelo no se pudo compilar.', [`${compilado.error.clave}: ${compilado.error.motivo}`]),
    );
  }

  return simularPorBloques(grafo, compilado.plan, args.definiciones, semilla, n, {
    debeCancelar,
    progreso: (completadas, totales) =>
      progreso?.({ fase: 'simulando', mensaje: 'Simulando…', completadas, totales }),
  }).then((r) => {
    if (!r.ok) return fallo('calculo', 'El motor rápido no pudo calcular el modelo.', [`${r.error.clave}: ${r.error.motivo}`]);

    return {
      ok: true as const,
      motor: 'fast' as const,
      eleccion: args.eleccion,
      lectura: args.lectura,
      iteracionesCompletadas: r.iteracionesCompletadas,
      cancelada: r.cancelada,
      milisegundos: performance.now() - args.arranque,
      salidas: args.modelo.outputs.map((salida, i) => {
        const s = r.porSalida.get(clavesSalida[i] as string);
        return {
          id: salida.id,
          nombre: salida.name,
          ref: salida.ref,
          resumen: resumenEstadistico(
            s?.welford ?? { n: 0, media: 0, m2: 0, min: Infinity, max: -Infinity },
            s?.digest ?? { compresion: 100, centroides: [], pesoTotal: 0, min: Infinity, max: -Infinity },
          ),
          cdf: s ? curvaCDF(s.digest) : [],
          noNumericas: s?.noNumericas ?? 0,
        };
      }),
    };
  });
}

async function porElCompatible(args: Comun): Promise<ResultadoSimulacionPanel> {
  const { clavesSalida, n, semilla, progreso, debeCancelar } = args;

  // Con Excel en el bucle no hay bloques: se necesitan las N muestras de cada
  // entrada por adelantado, porque se escriben una a una. Se reutiliza el
  // mismo generador que el motor rápido, así que **las dos rutas simulan las
  // mismas muestras con la misma semilla** — si no, comparar los dos modos
  // sería comparar dos experimentos distintos.
  const resueltas = resolverEntradas(args.definiciones, semilla, n);
  const entradas = resueltas.map((def) => ({
    direccion: def.clave,
    muestras: generarTramoDeEntrada(def, semilla, 0, n),
  }));

  const r = await simularEnExcel({
    entradas,
    salidas: clavesSalida,
    iteraciones: n,
    progreso: (a) =>
      progreso?.({
        fase: 'simulando',
        mensaje: 'Simulando con Excel en el bucle…',
        completadas: a.completadas,
        totales: a.totales,
        iteracionesPorSegundo: a.iteracionesPorSegundo,
      }),
    debeCancelar,
  });

  if (!r.ok) {
    return fallo('calculo', 'La simulación con Excel en el bucle se detuvo.', [
      `Iteración ${r.error.iteracion}: ${r.error.motivo}`,
    ]);
  }

  return {
    ok: true,
    motor: 'compatible',
    eleccion: args.eleccion,
    lectura: args.lectura,
    iteracionesCompletadas: r.iteracionesCompletadas,
    cancelada: r.cancelada,
    iteracionesPorSegundo: r.iteracionesPorSegundo,
    milisegundos: performance.now() - args.arranque,
    salidas: args.modelo.outputs.map((salida, i) => {
      const s = r.porSalida.get(clavesSalida[i] as string);
      return {
        id: salida.id,
        nombre: salida.name,
        ref: salida.ref,
        resumen: resumenEstadistico(
          s?.welford ?? { n: 0, media: 0, m2: 0, min: Infinity, max: -Infinity },
          s?.digest ?? { compresion: 100, centroides: [], pesoTotal: 0, min: Infinity, max: -Infinity },
        ),
        cdf: s ? curvaCDF(s.digest) : [],
        noNumericas: s?.noNumericas ?? 0,
      };
    }),
  };
}

/** Los motivos por los que el rápido no sirve, ya en palabras del usuario. */
export function motivosLegibles(eleccion: EleccionMotor): string[] {
  return eleccion.motivos.map(describirMotivo);
}

function fallo(tipo: FalloSimulacion['tipo'], mensaje: string, detalles: string[]): FalloSimulacion {
  return { ok: false, tipo, mensaje, detalles } as FalloSimulacion;
}
