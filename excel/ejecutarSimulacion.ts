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

import { simularPorBloques, type ContextoHilo, type Pool } from '../engine/executor/index.ts';
import { generarTramoDeEntrada, resolverEntradas, type DefinicionEntrada } from '../engine/executor/entradas.ts';
import { compilarPlan } from '../engine/compiler/plan.ts';
import { construirGrafo } from '../engine/graph/index.ts';
import {
  describirMotivo,
  elegirMotor,
  prepararEntradas,
  resumirDistribucion,
  OBJETIVO_PRECISION_POR_DEFECTO,
  type EleccionMotor,
  type ModeloRiesgo,
} from '../engine/modelo/index.ts';
import { curvaCDF, resumenEstadistico, siguienteTanda, LIMITE_MUESTRA_SENSIBILIDAD } from '../engine/stats/index.ts';
import {
  analisisDeMuestra,
  conPrecision,
  type AvanceSimulacion,
  type FalloSimulacion,
  type ResultadoSimulacionPanel,
} from './informe.ts';
import { leerLibro } from './lectorLibro.ts';
import type { EstadisticasLectura } from './tiposLectura.ts';

export type {
  AvanceSimulacion,
  FalloSimulacion,
  ResultadoSalida,
  ResultadoSimulacionPanel,
  SimulacionCompletada,
} from './informe.ts';
import { entradasDeFunciones, resolverConFunciones } from './entradasRiesgo.ts';
import { indiceDeTextos } from './nombreSugerido.ts';
import { desdeLocaleDelModelo } from './regional.ts';
import { cargarResolverRef } from './resolverRef.ts';
import { simularEnExcel } from './simulacionCompatible.ts';
import { aValorCelda } from './valoresEstaticos.ts';

export interface PeticionSimulacion {
  modelo: ModeloRiesgo;
  progreso?: (avance: AvanceSimulacion) => void;
  debeCancelar?: () => boolean;
  /**
   * Crea un pool de hilos para el motor rápido, o devuelve `null` si no se
   * puede. Lo pone quien sabe crear hilos (el panel, con Web Workers); esta
   * capa no sabe nada de cómo se empaquetan. Sin él, se calcula en el hilo
   * del panel, que es correcto pero lo congela mientras dura.
   */
  crearPool?: (contexto: ContextoHilo) => Pool | null;
}

/**
 * Bloques mínimos de una simulación rápida: los suficientes para repartir
 * entre los hilos de cualquier equipo corriente, y fijos para que el resultado
 * no dependa de cuántos núcleos tenga (ver `OpcionesSimulacion.bloquesMinimos`).
 */
const BLOQUES_MINIMOS = 16;
const COMPRESION_TDIGEST = 100;

export async function ejecutarSimulacion(peticion: PeticionSimulacion): Promise<ResultadoSimulacionPanel> {
  const { progreso, debeCancelar, crearPool } = peticion;
  // `let`: se amplía con las entradas que el libro declara con RIESGO.*.
  let modelo = peticion.modelo;
  const arranque = performance.now();

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

  // Las celdas con funciones RIESGO.* son entradas aunque no estén en el panel.
  const textos = indiceDeTextos(libro.valores);
  const deFunciones = entradasDeFunciones(libro.formulas, grafo, clavesEntrada, clavesSalida, textos.nombre);
  if (deFunciones.errores.length > 0) {
    return fallo('modelo', 'Hay funciones RIESGO que no se pueden usar tal como están.', deFunciones.errores);
  }
  if (deFunciones.entradas.length > 0) {
    modelo = { ...modelo, inputs: [...modelo.inputs, ...deFunciones.entradas] };
    clavesEntrada.push(...deFunciones.claves);
  }
  // Las entradas de funciones se descubrieron después de resolver: su `ref`
  // ya es la clave de la celda.
  const resolver = resolverConFunciones(resolucion.resolver, deFunciones);
  if (modelo.inputs.length === 0) {
    return fallo('modelo', 'El modelo no tiene ninguna entrada.', [
      'Marca al menos una celda como entrada incierta y dale una distribución,',
      'o escribe en ella una función como =RIESGO.NORMAL(100; 15).',
    ]);
  }

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
  const conv = modelo.settings.convergence;
  const objetivo = conv?.target ?? OBJETIVO_PRECISION_POR_DEFECTO;

  // 4. Simular.
  const comun = { modelo, eleccion, lectura: libro.estadisticas, arranque, objetivo };

  if (eleccion.motor === 'compatible') {
    const preparadas = prepararEntradas(modelo, resolver, semilla);
    if (!preparadas.ok) return fallo('modelo', 'El modelo no se pudo preparar.', preparadas.errores);
    const r = await porElCompatible({
      ...comun, definiciones: preparadas.entradas, clavesEntrada, clavesSalida, n, semilla, progreso, debeCancelar,
    });
    // Con Excel en el bucle, repetir tandas costaría minutos cada una: se
    // simulan las iteraciones fijadas y se dice que el modo automático no se
    // aplicó.
    if (r.ok && conv?.untilConverged) {
      r.convergencia = { objetivo, tandas: [n], alcanzada: r.salidas.every((s) => s.precision?.suficiente !== false), tope: conv.maxIterations, noDisponible: true };
    }
    return conEntradasDeFunciones(r, deFunciones);
  }

  // Motor rápido: iteraciones fijas, o por tandas hasta la precisión pedida.
  // Cada tanda es una simulación completa con la misma semilla, así que el
  // resultado final es idéntico al de haber pedido de entrada esas
  // iteraciones: las tandas previas solo sirven para saber cuántas hacen falta.
  const tandas: number[] = [];
  let nTanda = conv?.untilConverged ? Math.min(n, conv.maxIterations) : n;
  let r: ResultadoSimulacionPanel | null = null;
  for (let ronda = 0; ronda < MAX_TANDAS; ronda++) {
    const deTanda = nTanda === n ? modelo : { ...modelo, settings: { ...modelo.settings, iterations: nTanda } };
    const preparadas = prepararEntradas(deTanda, resolver, semilla);
    if (!preparadas.ok) return fallo('modelo', 'El modelo no se pudo preparar.', preparadas.errores);
    tandas.push(nTanda);
    r = await porElRapido({
      ...comun, grafo, definiciones: preparadas.entradas, clavesEntrada, clavesSalida, n: nTanda, semilla, debeCancelar,
      crearPool,
      progreso: conv?.untilConverged && progreso
        ? (a) => progreso({ ...a, mensaje: `Tanda ${ronda + 1}: ${miles(nTanda)} iteraciones…` })
        : progreso,
    });
    if (!r.ok || !conv?.untilConverged || r.cancelada) break;
    const siguiente = siguienteTanda(nTanda, r.salidas.map((s) => s.precision?.iteracionesParaObjetivo ?? 0), conv.maxIterations);
    if (siguiente === null) break;
    nTanda = siguiente;
  }
  const final = r as ResultadoSimulacionPanel;
  if (final.ok && conv?.untilConverged) {
    final.convergencia = {
      objetivo, tandas, tope: conv.maxIterations,
      alcanzada: final.salidas.every((s) => s.precision?.suficiente !== false),
    };
  }
  return conEntradasDeFunciones(final, deFunciones);
}

/** Anota en el resultado qué entradas vinieron de funciones RIESGO.* del libro. */
function conEntradasDeFunciones(
  r: ResultadoSimulacionPanel,
  d: ReturnType<typeof entradasDeFunciones>,
): ResultadoSimulacionPanel {
  if (!r.ok || (d.entradas.length === 0 && d.duplicadas.length === 0)) return r;
  return {
    ...r,
    entradasDeFunciones: d.entradas.map((e) => ({ ref: e.ref, nombre: e.name, distribucion: resumirDistribucion(e.dist) })),
    ...(d.duplicadas.length > 0 ? { funcionesIgnoradas: d.duplicadas } : {}),
  };
}

/** Tandas como máximo en "simular hasta alcanzar la precisión". */
const MAX_TANDAS = 5;

/** Un contador con puntos de miles, para los mensajes de progreso. */
const miles = (x: number) => x.toLocaleString('es-ES');

interface Comun {
  modelo: ModeloRiesgo;
  eleccion: EleccionMotor;
  lectura: EstadisticasLectura;
  arranque: number;
  /** Margen objetivo de la precisión (fracción). */
  objetivo: number;
  definiciones: DefinicionEntrada[];
  clavesEntrada: string[];
  clavesSalida: string[];
  n: number;
  semilla: number;
  progreso?: (avance: AvanceSimulacion) => void;
  debeCancelar?: () => boolean;
}

function porElRapido(
  args: Comun & {
    grafo: ReturnType<typeof construirGrafo>['grafo'];
    crearPool?: PeticionSimulacion['crearPool'];
  },
): Promise<ResultadoSimulacionPanel> {
  const { grafo, clavesEntrada, clavesSalida, n, semilla, progreso, debeCancelar } = args;

  const compilado = compilarPlan(grafo, new Set(clavesEntrada), clavesSalida);
  if (!compilado.ok) {
    return Promise.resolve(
      fallo('compilacion', 'El modelo no se pudo compilar.', [`${compilado.error.clave}: ${compilado.error.motivo}`]),
    );
  }

  // La configuración regional del libro, si el modelo la trae. Sin ella se
  // calcula con la neutra, que es como calculaba el motor antes de existir.
  const locale = args.modelo.settings.locale;

  const regional = locale ? desdeLocaleDelModelo(locale) : undefined;
  const opciones = {
    regional,
    retenerMuestra: LIMITE_MUESTRA_SENSIBILIDAD,
    compresionTDigest: COMPRESION_TDIGEST,
    bloquesMinimos: BLOQUES_MINIMOS,
    // Con hilos, una ronda por cada par de bloques por hilo: el progreso
    // avanza y cancelar responde. Sin hilos da igual, el panel está ocupado.
    bloquesPorRonda: 4,
    debeCancelar,
    progreso: (completadas: number, totales: number) =>
      progreso?.({ fase: 'simulando', mensaje: 'Simulando…', completadas, totales }),
  };

  // Las entradas LHS se resuelven aquí para poder dárselas ya hechas a los
  // hilos; `simularPorBloques` las deja tal cual al verlas resueltas.
  const resueltas = resolverEntradas(args.definiciones, semilla, n);
  let pool: Pool | null = null;
  try {
    pool = args.crearPool?.({
      grafo, plan: compilado.plan, entradas: resueltas, seed: semilla,
      compresionTDigest: COMPRESION_TDIGEST, limiteMuestra: LIMITE_MUESTRA_SENSIBILIDAD, regional,
    }) ?? null;
  } catch {
    pool = null; // sin hilos (navegador antiguo, política de seguridad): en este hilo
  }

  const enEsteHilo = () => simularPorBloques(grafo, compilado.plan, resueltas, semilla, n, opciones);
  const simulacion = pool
    ? simularPorBloques(grafo, compilado.plan, resueltas, semilla, n, { ...opciones, ejecutor: pool.ejecutor, bloquesPorRonda: pool.hilos * 2 })
        .catch(() => {
          // Un hilo que no arranca (no un error del modelo, que llega como
          // resultado) no debe dejar al usuario sin simulación: se repite aquí.
          pool?.cerrar();
          pool = null;
          return enEsteHilo();
        })
    : enEsteHilo();
  const hilos = () => pool?.hilos ?? 1;

  return simulacion.finally(() => pool?.cerrar()).then((r) => {
    if (!r.ok) return fallo('calculo', 'El motor rápido no pudo calcular el modelo.', [`${r.error.clave}: ${r.error.motivo}`]);

    // Las entradas no se guardaron durante la simulación: se regeneran. El
    // generador es de contador, así que la iteración i vuelve a dar
    // exactamente la misma muestra que entró en el cálculo.
    const largo = Math.min(LIMITE_MUESTRA_SENSIBILIDAD, r.iteracionesCompletadas);
    const muestrasEntrada = new Map(
      resueltas.map((def) => [def.clave, generarTramoDeEntrada(def, semilla, 0, largo)] as const),
    );

    return {
      ok: true as const,
      motor: 'fast' as const,
      eleccion: args.eleccion,
      lectura: args.lectura,
      iteracionesCompletadas: r.iteracionesCompletadas,
      cancelada: r.cancelada,
      milisegundos: performance.now() - args.arranque,
      muestraSensibilidad: largo,
      hilos: hilos(),
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
          ...analisisDeMuestra(args.modelo, clavesEntrada, muestrasEntrada, s?.muestra),
        };
      }).map(conPrecision(args.objetivo)),
    };
  });
}

async function porElCompatible(args: Comun): Promise<ResultadoSimulacionPanel> {
  const { clavesEntrada, clavesSalida, n, semilla, progreso, debeCancelar } = args;

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
    retenerMuestra: LIMITE_MUESTRA_SENSIBILIDAD,
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

  const largo = Math.min(LIMITE_MUESTRA_SENSIBILIDAD, r.iteracionesCompletadas);
  const muestrasEntrada = new Map(entradas.map((e) => [e.direccion, e.muestras.subarray(0, largo)] as const));

  return {
    ok: true,
    motor: 'compatible',
    eleccion: args.eleccion,
    lectura: args.lectura,
    iteracionesCompletadas: r.iteracionesCompletadas,
    cancelada: r.cancelada,
    iteracionesPorSegundo: r.iteracionesPorSegundo,
    milisegundos: performance.now() - args.arranque,
    muestraSensibilidad: largo,
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
        ...analisisDeMuestra(args.modelo, clavesEntrada, muestrasEntrada, s?.muestra),
      };
    }).map(conPrecision(args.objetivo)),
  };
}

/** Los motivos por los que el rápido no sirve, ya en palabras del usuario. */
export function motivosLegibles(eleccion: EleccionMotor): string[] {
  return eleccion.motivos.map(describirMotivo);
}

function fallo(tipo: FalloSimulacion['tipo'], mensaje: string, detalles: string[]): FalloSimulacion {
  return { ok: false, tipo, mensaje, detalles } as FalloSimulacion;
}
