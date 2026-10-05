/**
 * Simulación del cronograma (QRSA, Q1.4): en cada iteración se muestrean las
 * duraciones, se sortean los riesgos, se recalcula la red **entera** (ida y
 * vuelta) y se guardan el fin del proyecto, los hitos y qué actividades
 * quedaron en la ruta crítica. Sin Office.js.
 *
 * Recalcular la red, en vez de sumar duraciones, es lo que recoge el sesgo de
 * convergencia: donde dos ramas se juntan manda la más larga de esa
 * iteración, y la media del máximo es mayor que el máximo de las medias.
 *
 * Los números aleatorios se generan una vez, por variable y con la semilla
 * (`engine/sampling`: Monte Carlo o hipercubo latino), y se reutilizan en
 * las corridas del tornado por eliminación: sin un riesgo, todo lo demás
 * cae igual, así que la diferencia es solo la de ese riesgo.
 */

import { generarEntrada } from '../sampling/index.ts';
import { uniform } from '../distributions/index.ts';
import { cpmDeterministico, calcularCpm, calendarioProyecto, crearEspacio, TOLERANCIA_CRITICA, type ResultadoCpm } from './cpm.ts';
import { construirDistribucion, type ModeloCronograma } from './modelo.ts';
import { compilarRed, type RedCompilada } from './red.ts';
import type { CalendarioLaboral } from './calendario.ts';

export class SimulacionCancelada extends Error {
  constructor() {
    super('Simulación cancelada');
    this.name = 'SimulacionCancelada';
  }
}

/** Error de un dato del modelo, con dónde está (para señalarlo en la hoja). */
export class ErrorModeloCronograma extends Error {
  readonly hoja: string;
  readonly referencia: string;
  constructor(hoja: string, referencia: string, mensaje: string) {
    super(`${hoja}, ${referencia}: ${mensaje}`);
    this.name = 'ErrorModeloCronograma';
    this.hoja = hoja;
    this.referencia = referencia;
  }
}

interface Muestras {
  /** Duración muestreada de cada actividad, o `null` si no tiene incertidumbre. */
  duracion: (Float64Array | null)[];
  /** 1 si el riesgo ocurre en la iteración. */
  ocurre: Uint8Array[];
  /** Por actividad: los impactos que la tocan (riesgo y días por iteración). */
  impactos: { riesgo: number; dias: Float64Array }[][];
}

export interface SerieTiempo {
  id: string;
  nombre: string;
  /** Número de serie del día (el último laborable; en un hito, su día). */
  serie: Float64Array;
  /** Días laborables desde el inicio del proyecto, en el calendario del proyecto. */
  dias: Float64Array;
}

export interface EliminacionRiesgo {
  id: string;
  nombre: string;
  /** Media y P80 del fin del proyecto (días) sin este riesgo. */
  media: number;
  p80: number;
  /** Cuánto bajan la media y el P80 al quitarlo. */
  reduccionMedia: number;
  reduccionP80: number;
  /** Proporción de iteraciones en que ocurrió. */
  ocurrencia: number;
}

export interface SimulacionCronograma {
  red: RedCompilada;
  iteraciones: number;
  /** El cronograma con las duraciones base, sin riesgos. */
  deterministico: ResultadoCpm;
  fin: SerieTiempo;
  hitos: SerieTiempo[];
  /** Índice de criticidad: proporción de iteraciones en la ruta crítica, por actividad. */
  criticidad: Float64Array;
  /** Duración simulada de cada actividad en cada iteración (para la sensibilidad). */
  duraciones: Float32Array[];
  /** Tornado por eliminación, de mayor a menor reducción del P80. */
  eliminacion: EliminacionRiesgo[];
  /** El fin sin ningún riesgo (solo la incertidumbre de las duraciones): media y P80 en días. */
  sinRiesgos: { media: number; p80: number } | null;
  /** Media y P80 del fin con todo. */
  media: number;
  p80: number;
  milisegundos: number;
}

export interface OpcionesSimulacion {
  progreso?: (hecho: number, total: number) => void;
  senal?: AbortSignal;
}

const BLOQUE = 500;

function pausa(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** P80 y media de una muestra (P80 como PERCENTIL.INC). */
export function mediaYP80(v: Float64Array): { media: number; p80: number } {
  const o = Float64Array.from(v).sort();
  let s = 0;
  for (let i = 0; i < o.length; i++) s += o[i] as number;
  return { media: s / o.length, p80: percentilOrdenado(o, 0.8) };
}

export function percentilOrdenado(o: Float64Array, p: number): number {
  if (o.length === 0) return NaN;
  const pos = p * (o.length - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.ceil(pos);
  return i0 === i1 ? (o[i0] as number) : (o[i0] as number) * (i1 - pos) + (o[i1] as number) * (pos - i0);
}

function generarMuestras(modelo: ModeloCronograma, red: RedCompilada): Muestras {
  const { iteraciones: n, semilla, metodo } = modelo.configuracion;
  const duracion: (Float64Array | null)[] = Array.from({ length: red.n }, () => null);
  for (const inc of modelo.incertidumbre) {
    const a = red.indice.get(inc.actividad);
    if (a === undefined) throw new ErrorModeloCronograma('Incertidumbre', inc.actividad, `la actividad «${inc.actividad}» no existe`);
    if (duracion[a]) throw new ErrorModeloCronograma('Incertidumbre', inc.actividad, `la actividad «${inc.actividad}» tiene dos distribuciones`);
    let dist;
    try {
      dist = construirDistribucion(inc.distribucion, inc.relativa ? (red.duracion[a] as number) : 1);
    } catch (e) {
      throw new ErrorModeloCronograma('Incertidumbre', inc.actividad, (e as Error).message);
    }
    duracion[a] = generarEntrada(dist, `dur:${inc.actividad}`, semilla, n, metodo);
  }
  const ocurre: Uint8Array[] = [];
  const impactos: { riesgo: number; dias: Float64Array }[][] = Array.from({ length: red.n }, () => []);
  modelo.riesgos.forEach((r, ri) => {
    if (!(r.probabilidad >= 0 && r.probabilidad <= 1)) throw new ErrorModeloCronograma('Riesgos', r.id, `la probabilidad tiene que estar entre 0 y 1 (${r.probabilidad})`);
    const u = generarEntrada(uniform(0, 1), `riesgo:${r.id}`, semilla, n, metodo);
    const o = new Uint8Array(n);
    for (let i = 0; i < n; i++) o[i] = (u[i] as number) < r.probabilidad ? 1 : 0;
    ocurre.push(o);
    for (const imp of r.impactos) {
      const a = red.indice.get(imp.actividad);
      if (a === undefined) throw new ErrorModeloCronograma('Impactos', `${r.id} → ${imp.actividad}`, `la actividad «${imp.actividad}» no existe`);
      let dist;
      try {
        dist = construirDistribucion(imp.dias);
      } catch (e) {
        throw new ErrorModeloCronograma('Impactos', `${r.id} → ${imp.actividad}`, (e as Error).message);
      }
      (impactos[a] as { riesgo: number; dias: Float64Array }[]).push({ riesgo: ri, dias: generarEntrada(dist, `impacto:${r.id}:${imp.actividad}`, semilla, n, metodo) });
    }
  });
  return { duracion, ocurre, impactos };
}

interface Corrida {
  finDias: Float64Array;
  finSerie: Float64Array;
  hitosSerie: Float64Array[];
  hitosDias: Float64Array[];
  criticas: Int32Array;
  duraciones: Float32Array[] | null;
}

/**
 * Una corrida completa. `quitar`: −1 con todos los riesgos, el índice de un
 * riesgo para quitar solo ese, o −2 para quitarlos todos.
 */
async function correr(
  modelo: ModeloCronograma, red: RedCompilada, m: Muestras, quitar: number, hitos: readonly number[],
  completa: boolean, avanzar: (k: number) => void, senal?: AbortSignal,
): Promise<Corrida> {
  const { iteraciones: n, redondeo, ignorarRestriccionesDuras } = modelo.configuracion;
  const entero = redondeo === 'entero';
  const esp = crearEspacio(red.n);
  const dur = new Float64Array(red.n);
  const cp = calendarioProyecto(red);
  const cuentaInicio = cp.cuenta(red.inicio);
  const finDias = new Float64Array(n);
  const finSerie = new Float64Array(n);
  const hitosSerie = completa ? hitos.map(() => new Float64Array(n)) : [];
  const hitosDias = completa ? hitos.map(() => new Float64Array(n)) : [];
  const criticas = new Int32Array(red.n);
  const duraciones = completa ? Array.from({ length: red.n }, () => new Float32Array(n)) : null;
  const opciones = { ignorarDuras: ignorarRestriccionesDuras, soloIda: !completa };

  for (let i = 0; i < n; i++) {
    if (i > 0 && i % BLOQUE === 0) {
      avanzar(BLOQUE);
      await pausa();
      if (senal?.aborted) throw new SimulacionCancelada();
    }
    for (let a = 0; a < red.n; a++) {
      const muestra = m.duracion[a];
      let d = muestra ? (muestra[i] as number) : (red.duracion[a] as number);
      if (quitar !== -2) {
        const lista = m.impactos[a] as { riesgo: number; dias: Float64Array }[];
        for (let k = 0; k < lista.length; k++) {
          const imp = lista[k] as { riesgo: number; dias: Float64Array };
          if (imp.riesgo !== quitar && (m.ocurre[imp.riesgo] as Uint8Array)[i] === 1) d += imp.dias[i] as number;
        }
      }
      if (d < 0) d = 0;
      if (entero) d = Math.round(d);
      dur[a] = d;
      if (duraciones) (duraciones[a] as Float32Array)[i] = d;
    }
    calcularCpm(red, dur, esp, opciones);
    finDias[i] = cp.cuenta(esp.fin) - cuentaInicio;
    finSerie[i] = cp.base + Math.ceil(esp.fin) - 1;
    if (completa) {
      for (let a = 0; a < red.n; a++) if ((esp.holgura[a] as number) <= TOLERANCIA_CRITICA) criticas[a] = (criticas[a] as number) + 1;
      for (let h = 0; h < hitos.length; h++) {
        const a = hitos[h] as number;
        const c = red.calendarios[red.cal[a] as number] as CalendarioLaboral;
        const d = dur[a] as number;
        (hitosSerie[h] as Float64Array)[i] = c.serieFin(esp.ef[a] as number, d);
        (hitosDias[h] as Float64Array)[i] = cp.cuenta(c.fin(esp.ef[a] as number)) - cuentaInicio;
      }
    }
  }
  avanzar(n % BLOQUE === 0 ? BLOQUE : n % BLOQUE);
  return { finDias, finSerie, hitosSerie, hitosDias, criticas, duraciones };
}

/**
 * Los hitos que se siguen: los pedidos o, si no, los intermedios (duración 0
 * con predecesora y sucesora). El de inicio no cambia nunca y el final es el
 * fin del proyecto, que ya se sigue aparte.
 */
function hitosASeguir(modelo: ModeloCronograma, red: RedCompilada): number[] {
  if (modelo.configuracion.hitos) {
    return modelo.configuracion.hitos.map((id) => {
      const a = red.indice.get(id);
      if (a === undefined) throw new ErrorModeloCronograma('Config', 'Hitos', `el hito «${id}» no existe`);
      return a;
    });
  }
  const r: number[] = [];
  for (let a = 0; a < red.n; a++) {
    const conPredecesora = (red.entradaInicio[a + 1] as number) > (red.entradaInicio[a] as number);
    const conSucesora = (red.salidaInicio[a + 1] as number) > (red.salidaInicio[a] as number);
    if (red.duracion[a] === 0 && conPredecesora && conSucesora) r.push(a);
  }
  return r;
}

export async function simularCronograma(modelo: ModeloCronograma, opciones: OpcionesSimulacion = {}): Promise<SimulacionCronograma> {
  const t0 = performance.now();
  const { iteraciones } = modelo.configuracion;
  if (!(Number.isInteger(iteraciones) && iteraciones >= 2)) throw new ErrorModeloCronograma('Config', 'Iteraciones', 'hacen falta al menos 2 iteraciones');
  const red = compilarRed(modelo.red);
  const deterministico = cpmDeterministico(red, { ignorarDuras: modelo.configuracion.ignorarRestriccionesDuras });
  const muestras = generarMuestras(modelo, red);
  const hitos = hitosASeguir(modelo, red);
  const R = modelo.riesgos.length;
  const total = iteraciones * (1 + (R > 0 ? R + 1 : 0));
  let hecho = 0;
  const avanzar = (k: number) => {
    hecho += k;
    opciones.progreso?.(hecho, total);
  };

  const principal = await correr(modelo, red, muestras, -1, hitos, true, avanzar, opciones.senal);
  const todo = mediaYP80(principal.finDias);

  const eliminacion: EliminacionRiesgo[] = [];
  let sinRiesgos: { media: number; p80: number } | null = null;
  if (R > 0) {
    for (let ri = 0; ri < R; ri++) {
      const c = await correr(modelo, red, muestras, ri, hitos, false, avanzar, opciones.senal);
      const s = mediaYP80(c.finDias);
      const r = modelo.riesgos[ri] as ModeloCronograma['riesgos'][number];
      const o = muestras.ocurre[ri] as Uint8Array;
      let veces = 0;
      for (let i = 0; i < iteraciones; i++) veces += o[i] as number;
      eliminacion.push({
        id: r.id, nombre: r.nombre, media: s.media, p80: s.p80,
        reduccionMedia: todo.media - s.media, reduccionP80: todo.p80 - s.p80, ocurrencia: veces / iteraciones,
      });
    }
    eliminacion.sort((a, b) => b.reduccionP80 - a.reduccionP80 || b.reduccionMedia - a.reduccionMedia);
    sinRiesgos = mediaYP80((await correr(modelo, red, muestras, -2, hitos, false, avanzar, opciones.senal)).finDias);
  }

  const criticidad = new Float64Array(red.n);
  for (let a = 0; a < red.n; a++) criticidad[a] = (principal.criticas[a] as number) / iteraciones;
  return {
    red, iteraciones, deterministico,
    fin: { id: 'FIN', nombre: 'Fin del proyecto', serie: principal.finSerie, dias: principal.finDias },
    hitos: hitos.map((a, h) => ({ id: red.ids[a] as string, nombre: red.nombres[a] as string, serie: principal.hitosSerie[h] as Float64Array, dias: principal.hitosDias[h] as Float64Array })),
    criticidad, duraciones: principal.duraciones as Float32Array[], eliminacion, sinRiesgos,
    media: todo.media, p80: todo.p80, milisegundos: performance.now() - t0,
  };
}
