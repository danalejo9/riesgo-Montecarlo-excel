/**
 * Simulación del cronograma (QRSA, Q1.4, Q2 y Q3): en cada iteración se
 * muestrean las duraciones, se sortean los riesgos y las ramas, se
 * recalcula la red **entera** (ida y vuelta), se calcula el costo y se
 * guardan el fin del proyecto, los hitos, las fechas de cada actividad y qué
 * actividades quedaron en la ruta crítica. Sin Office.js.
 *
 * Recalcular la red, en vez de sumar duraciones, es lo que recoge el sesgo de
 * convergencia: donde dos ramas se juntan manda la más larga de esa
 * iteración, y la media del máximo es mayor que el máximo de las medias.
 *
 * Los números aleatorios se generan una vez, por variable y con la semilla
 * (`engine/sampling`: Monte Carlo o hipercubo latino), se correlacionan
 * (Iman–Conover, con la corrección de Higham si la matriz es imposible) y se
 * reutilizan en todas las corridas: el tornado por eliminación, la corrida
 * sin riesgos y el escenario post mitigación. Así cada diferencia es solo la
 * de lo que cambió, no la del azar.
 *
 * El costo (Q2.1) se calcula en cada iteración con las duraciones y fechas de
 * esa iteración: un retraso alarga lo que se paga por tiempo y mueve lo que
 * escala con la fecha. Esa es la integración costo–plazo.
 */

import { correlacionarImanConover, correlacionMasCercana, generarEntrada } from '../sampling/index.ts';
import { uniform } from '../distributions/index.ts';
import { spearman } from '../stats/index.ts';
import { cpmDeterministico, calcularCpm, calendarioProyecto, crearEspacio, TOLERANCIA_CRITICA, type ResultadoCpm } from './cpm.ts';
import { construirDistribucion, incertidumbreDe, multaDe, tieneCostos, tienePostMitigacion, type HitoContractual, type ModeloCronograma, type PartidaCosto } from './modelo.ts';
import { compilarRed, type ActividadRed, type DefinicionRed, type RedCompilada } from './red.ts';
import type { CalendarioLaboral } from './calendario.ts';
import { convergenciaP80 } from './analisis.ts';
import { ClimaSimulado, climaActivo } from './clima.ts';

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
  /** Lo mismo en el costo (si hay costos): media y percentil de contingencia sin el riesgo, y cuánto bajan. */
  mediaCosto: number | null;
  p80Costo: number | null;
  reduccionMediaCosto: number | null;
  reduccionP80Costo: number | null;
  /** W2: P50, P80 y P90 del fin (días) y del costo sin este riesgo, en el orden de `NIVELES_RESERVA`. */
  nivelesDias: number[];
  nivelesCosto: number[] | null;
}

export interface CorrelacionLograda {
  a: string;
  b: string;
  objetivo: number;
  /** Tras la corrección de Higham, si hizo falta. */
  aplicada: number;
  lograda: number;
}

export interface RutaFrecuente {
  /** Las actividades críticas de esa iteración, en orden de la red. */
  actividades: string[];
  proporcion: number;
}

export interface EscenarioPost {
  fin: SerieTiempo;
  costo: Float64Array | null;
  media: number;
  p80: number;
}

/** Un hito contractual (W1) en la simulación principal: su fecha de fin y su multa en cada iteración. */
export interface HitoContractualSimulado {
  id: string;
  nombre: string;
  hito: HitoContractual;
  /** Número de serie del día en que termina, por iteración. */
  serie: Float64Array;
  /** Multa de cada iteración (0 si cumple o si no tiene multa). */
  multa: Float64Array;
  /** Fin en el cronograma determinístico. */
  serieDeterministica: number;
}

export interface SimulacionCronograma {
  red: RedCompilada;
  iteraciones: number;
  /** El cronograma con las duraciones base, sin riesgos (y la opción más probable de cada rama). */
  deterministico: ResultadoCpm;
  fin: SerieTiempo;
  hitos: SerieTiempo[];
  /** Índice de criticidad: proporción de iteraciones en la ruta crítica, por actividad. */
  criticidad: Float64Array;
  /** Duración simulada de cada actividad en cada iteración (para la sensibilidad). */
  duraciones: Float32Array[];
  /** Fechas simuladas de cada actividad (números de serie): para el cronograma ajustado por riesgo. */
  fechas: { inicio: Float32Array[]; fin: Float32Array[] };
  /** Tornado por eliminación, de mayor a menor reducción del P80. */
  eliminacion: EliminacionRiesgo[];
  /** V8: sin el clima (con todo lo demás), si hay clima; para medir cuánto pesa. */
  sinClima: { media: number; p80: number } | null;
  /** Sin ningún riesgo (solo la incertidumbre de las duraciones). */
  sinRiesgos: { media: number; p80: number; mediaCosto: number | null; p80Costo: number | null; nivelesDias: number[]; nivelesCosto: number[] | null } | null;
  /** Media y P80 del fin con todo. */
  media: number;
  p80: number;
  /** Costo total por iteración, y el costo base (determinístico, sin riesgos); `null` sin costos. */
  costo: Float64Array | null;
  costoBase: number | null;
  /** Escenario post mitigación (mismos números aleatorios), si algún riesgo trae datos post. */
  post: EscenarioPost | null;
  /** Rutas críticas más frecuentes (hasta 5). */
  rutas: RutaFrecuente[];
  /** Actividades que son riesgos insertados en la red (Q3.4). */
  riesgoInsertado: boolean[];
  correlacionLograda: CorrelacionLograda[];
  /** Hitos contractuales (W1), con su fin y su multa por iteración. */
  contractuales: HitoContractualSimulado[];
  avisos: string[];
  milisegundos: number;
}

export interface OpcionesSimulacion {
  /** `iteraciones`: las de la simulación principal; el resto de `total` son las vueltas del tornado y de «después de mitigar». */
  progreso?: (hecho: number, total: number, iteraciones: number) => void;
  senal?: AbortSignal;
}

const BLOQUE = 500;

/** W2: los niveles de confianza de la reserva de contingencia. */
export const NIVELES_RESERVA = [0.5, 0.8, 0.9] as const;

/** P50, P80 y P90 de una muestra (PERCENTIL.INC). */
export function nivelesDe(v: Float64Array): number[] {
  const o = Float64Array.from(v).sort();
  return NIVELES_RESERVA.map((p) => percentilOrdenado(o, p));
}
const ITERACIONES_AUTOMATICAS = [1000, 2000, 5000, 10000, 20000];

function pausa(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** P80 y media de una muestra (P80 como PERCENTIL.INC); con `p`, otro percentil. */
export function mediaYP80(v: Float64Array, p = 0.8): { media: number; p80: number } {
  const o = Float64Array.from(v).sort();
  let s = 0;
  for (let i = 0; i < o.length; i++) s += o[i] as number;
  return { media: s / o.length, p80: percentilOrdenado(o, p) };
}

export function percentilOrdenado(o: Float64Array, p: number): number {
  if (o.length === 0) return NaN;
  const pos = p * (o.length - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.ceil(pos);
  return i0 === i1 ? (o[i0] as number) : (o[i0] as number) * (i1 - pos) + (o[i1] as number) * (pos - i0);
}

// ------------------------------------------------------------- preparación

interface ImpactoDias { riesgo: number; dias: Float64Array }
interface ImpactoCosto { riesgo: number; actividad: number; costo: Float64Array }
interface CostoPreparado { p: PartidaCosto; actividad: number; muestra: Float64Array | null }

interface Preparado {
  red: RedCompilada;
  n: number;
  /** Duración base muestreada por actividad (o `null`: la base fija). */
  dur: (Float64Array | null)[];
  /** Uniforme por riesgo: ocurre si es menor que la probabilidad del escenario. */
  u: Float64Array[];
  impactosDias: ImpactoDias[][];
  impactosCosto: ImpactoCosto[];
  costos: CostoPreparado[];
  /** Por actividad: [rama, opción] o null. */
  ramaDe: ([number, number] | null)[];
  /** Por rama: la opción elegida en cada iteración. */
  eleccion: Int32Array[];
  /** La opción más probable de cada rama (la del determinístico). */
  opcionBase: number[];
  riesgoInsertado: boolean[];
  correlacionLograda: CorrelacionLograda[];
  /** Hitos contractuales con el índice de su actividad. */
  contractuales: { h: HitoContractual; a: number }[];
  /** V8: el clima, si hay. */
  clima: ClimaSimulado | null;
  avisos: string[];
}

/** La red con los riesgos «como actividad» insertados (Q3.4). */
function redExtendida(modelo: ModeloCronograma): DefinicionRed {
  const insertados = modelo.riesgos.filter((r) => r.modo === 'actividad');
  if (insertados.length === 0) return modelo.red;
  const acts: (ActividadRed & { predecesoras: ActividadRed['predecesoras'][number][] })[] = modelo.red.actividades.map((a) => ({ ...a, predecesoras: [...a.predecesoras] }));
  const porId = new Map(acts.map((a) => [a.id, a]));
  for (const r of insertados) {
    for (const imp of r.impactos) {
      const x = porId.get(imp.actividad);
      if (!x) throw new ErrorModeloCronograma('Impactos', `${r.id} → ${imp.actividad}`, `la actividad «${imp.actividad}» no existe`);
      const id = idInsertado(r.id, x.id);
      // Las sucesoras fin–comienzo de X pasan también a esperar al riesgo.
      for (const s of acts) {
        for (const p of [...s.predecesoras]) {
          if (p.id === x.id && p.tipo === 'FC') s.predecesoras.push({ ...p, id });
        }
      }
      const nueva = { id, nombre: `Riesgo ${r.id}: ${r.nombre} (tras ${x.id})`, duracion: 0, calendario: x.calendario, predecesoras: [{ id: x.id, tipo: 'FC' as const, desfase: 0 }] };
      acts.push(nueva);
      porId.set(id, nueva);
    }
  }
  return { ...modelo.red, actividades: acts };
}

export function idInsertado(riesgo: string, actividad: string): string {
  return `${riesgo}@${actividad}`;
}

function distribucionPara(red: RedCompilada, modelo: ModeloCronograma, a: number): { inc: ModeloCronograma['incertidumbre'][number]; escala: number } | null {
  const base = red.duracion[a] as number;
  const inc = incertidumbreDe(modelo, red.ids[a] as string);
  if (!inc || (inc.selector && base === 0)) return null;
  return { inc, escala: inc.relativa ? base : 1 };
}

function preparar(modelo: ModeloCronograma, red: RedCompilada, n: number): Preparado {
  const { semilla, metodo } = modelo.configuracion;
  const avisos: string[] = [];
  const riesgoInsertado = red.ids.map((id) => modelo.riesgos.some((r) => r.modo === 'actividad' && id.startsWith(`${r.id}@`)) && !modelo.red.actividades.some((x) => x.id === id));

  // Duraciones (propias o por grupo).
  const propias = new Set<string>();
  for (const inc of modelo.incertidumbre) {
    if (inc.selector) continue;
    if (!red.indice.has(inc.actividad)) throw new ErrorModeloCronograma('Incertidumbre', inc.actividad, `la actividad «${inc.actividad}» no existe`);
    if (propias.has(inc.actividad)) throw new ErrorModeloCronograma('Incertidumbre', inc.actividad, `la actividad «${inc.actividad}» tiene dos distribuciones`);
    propias.add(inc.actividad);
  }
  const dur: (Float64Array | null)[] = Array.from({ length: red.n }, () => null);
  for (let a = 0; a < red.n; a++) {
    const d = distribucionPara(red, modelo, a);
    if (!d) continue;
    let dist;
    try {
      dist = construirDistribucion(d.inc.distribucion, d.escala);
    } catch (e) {
      throw new ErrorModeloCronograma('Incertidumbre', d.inc.actividad, (e as Error).message);
    }
    dur[a] = generarEntrada(dist, `dur:${red.ids[a]}`, semilla, n, metodo);
  }

  // Riesgos.
  const u: Float64Array[] = [];
  const impactosDias: ImpactoDias[][] = Array.from({ length: red.n }, () => []);
  const impactosCosto: ImpactoCosto[] = [];
  modelo.riesgos.forEach((r, ri) => {
    for (const [p, nombre] of [[r.probabilidad, 'probabilidad'], [r.probabilidadPost, 'probabilidad post']] as const) {
      if (p !== undefined && !(p >= 0 && p <= 1)) throw new ErrorModeloCronograma('Riesgos', r.id, `la ${nombre} tiene que estar entre 0 y 1 (${p})`);
    }
    u.push(generarEntrada(uniform(0, 1), `riesgo:${r.id}`, semilla, n, metodo));
    for (const imp of r.impactos) {
      const destino = r.modo === 'actividad' ? idInsertado(r.id, imp.actividad) : imp.actividad;
      const a = red.indice.get(destino);
      if (a === undefined) throw new ErrorModeloCronograma('Impactos', `${r.id} → ${imp.actividad}`, `la actividad «${imp.actividad}» no existe`);
      const muestra = (d: NonNullable<typeof imp.dias>, sufijo: string) => {
        try {
          return generarEntrada(construirDistribucion(d), `impacto${sufijo}:${r.id}:${imp.actividad}`, semilla, n, metodo);
        } catch (e) {
          throw new ErrorModeloCronograma('Impactos', `${r.id} → ${imp.actividad}`, (e as Error).message);
        }
      };
      if (imp.dias) (impactosDias[a] as ImpactoDias[]).push({ riesgo: ri, dias: muestra(imp.dias, '') });
      if (imp.costo) impactosCosto.push({ riesgo: ri, actividad: red.indice.get(imp.actividad) ?? -1, costo: muestra(imp.costo, '-costo') });
    }
  });

  // Costos.
  const costos: CostoPreparado[] = (modelo.costos ?? []).map((p) => {
    const actividad = p.actividad ? red.indice.get(p.actividad) : -1;
    if (actividad === undefined) throw new ErrorModeloCronograma('Costos', p.id, `la actividad «${p.actividad}» no existe`);
    let muestra: Float64Array | null = null;
    if (p.distribucion) {
      try {
        muestra = generarEntrada(construirDistribucion(p.distribucion), `costo:${p.id}`, semilla, n, metodo);
      } catch (e) {
        throw new ErrorModeloCronograma('Costos', p.id, (e as Error).message);
      }
    }
    return { p, actividad, muestra };
  });

  // Ramas.
  const ramaDe: ([number, number] | null)[] = Array.from({ length: red.n }, () => null);
  const eleccion: Int32Array[] = [];
  const opcionBase: number[] = [];
  (modelo.ramas ?? []).forEach((rama, k) => {
    const total = rama.opciones.reduce((s, o) => s + o.probabilidad, 0);
    if (!(total > 0) || Math.abs(total - 1) > 1e-6) throw new ErrorModeloCronograma('Ramas', rama.rama, `las probabilidades de las opciones tienen que sumar 100 % (suman ${Math.round(total * 1000) / 10} %)`);
    rama.opciones.forEach((o, j) => {
      for (const id of o.actividades) {
        const a = red.indice.get(id);
        if (a === undefined) throw new ErrorModeloCronograma('Ramas', `${rama.rama} · ${o.opcion}`, `la actividad «${id}» no existe`);
        if (ramaDe[a]) throw new ErrorModeloCronograma('Ramas', `${rama.rama} · ${o.opcion}`, `la actividad «${id}» ya está en otra rama u opción`);
        ramaDe[a] = [k, j];
      }
    });
    const uu = generarEntrada(uniform(0, 1), `rama:${rama.rama}`, semilla, n, metodo);
    const e = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      let acum = 0;
      let j = 0;
      for (; j < rama.opciones.length - 1; j++) {
        acum += (rama.opciones[j]?.probabilidad ?? 0) / total;
        if ((uu[i] as number) < acum) break;
      }
      e[i] = j;
    }
    eleccion.push(e);
    let mejor = 0;
    rama.opciones.forEach((o, j) => { if (o.probabilidad > (rama.opciones[mejor]?.probabilidad ?? 0)) mejor = j; });
    opcionBase.push(mejor);
  });

  // Hitos contractuales (W1).
  const contractuales = (modelo.hitosContractuales ?? []).map((h) => {
    const a = red.indice.get(h.actividad);
    if (a === undefined) throw new ErrorModeloCronograma('Hitos', h.actividad, `la actividad «${h.actividad}» no existe`);
    return { h, a };
  });

  // V8: clima.
  const clima = climaActivo(modelo.clima) ? new ClimaSimulado(modelo.clima, red.indice, red.n, n, semilla, metodo, modelo.red.inicio) : null;

  // Correlación (Q2.2).
  const correlacionLograda = correlacionar(modelo, red, dur, costos, semilla, avisos);
  return { red, n, dur, u, impactosDias, impactosCosto, costos, ramaDe, eleccion, opcionBase, riesgoInsertado, correlacionLograda, contractuales, clima, avisos };
}

/** Aplica las correlaciones declaradas (pares y grupos) a las muestras, en su sitio. */
function correlacionar(
  modelo: ModeloCronograma, red: RedCompilada, dur: (Float64Array | null)[], costos: CostoPreparado[], semilla: number, avisos: string[],
): CorrelacionLograda[] {
  const pares = new Map<string, { a: string; b: string; rho: number }>();
  const clave = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const poner = (a: string, b: string, rho: number, origen: string) => {
    if (a === b) return;
    if (!(rho >= -1 && rho <= 1)) throw new ErrorModeloCronograma('Correlaciones', origen, `el coeficiente tiene que estar entre −1 y 1 (${rho})`);
    const k = clave(a, b);
    const previo = pares.get(k);
    if (previo && previo.rho !== rho) avisos.push(`La correlación entre ${a} y ${b} está dos veces (${coma(previo.rho)} y ${coma(rho)}); se usa ${coma(rho)}.`);
    pares.set(k, { a, b, rho });
  };
  for (const g of modelo.gruposCorrelacion ?? []) {
    for (let i = 0; i < g.miembros.length; i++) for (let j = i + 1; j < g.miembros.length; j++) poner(g.miembros[i] as string, g.miembros[j] as string, g.rho, g.nombre);
  }
  for (const c of modelo.correlaciones ?? []) poner(c.a, c.b, c.rho, `${c.a} – ${c.b}`);
  if (pares.size === 0) return [];

  // Las muestras de cada id: duración de una actividad o tarifa de una partida.
  const muestraDe = new Map<string, Float64Array>();
  const asignar = new Map<string, (b: Float64Array) => void>();
  for (let a = 0; a < red.n; a++) {
    const m = dur[a];
    if (m) {
      muestraDe.set(red.ids[a] as string, m);
      asignar.set(red.ids[a] as string, (b) => { dur[a] = b; });
    }
  }
  for (const c of costos) {
    if (c.muestra) {
      muestraDe.set(c.p.id, c.muestra);
      asignar.set(c.p.id, (b) => { c.muestra = b; });
    }
  }
  const validos = [...pares.values()].filter((p) => {
    for (const id of [p.a, p.b]) {
      if (!muestraDe.has(id)) {
        const existe = red.indice.has(id) || costos.some((c) => c.p.id === id);
        if (!existe) throw new ErrorModeloCronograma('Correlaciones', `${p.a} – ${p.b}`, `«${id}» no es una actividad ni una partida de costo`);
        avisos.push(`«${id}» no tiene incertidumbre: su correlación con ${id === p.a ? p.b : p.a} no se aplica.`);
        return false;
      }
    }
    return true;
  });

  // Componentes conexas.
  const padre = new Map<string, string>();
  const raiz = (x: string): string => {
    let r = x;
    while (padre.get(r) !== r) r = padre.get(r) as string;
    padre.set(x, r);
    return r;
  };
  for (const p of validos) for (const id of [p.a, p.b]) if (!padre.has(id)) padre.set(id, id);
  for (const p of validos) padre.set(raiz(p.a), raiz(p.b));
  const grupos = new Map<string, string[]>();
  for (const id of padre.keys()) {
    const r = raiz(id);
    if (!grupos.has(r)) grupos.set(r, []);
    (grupos.get(r) as string[]).push(id);
  }

  const logradas: CorrelacionLograda[] = [];
  for (const ids of grupos.values()) {
    const idx = new Map(ids.map((id, i) => [id, i]));
    const objetivo = ids.map((_, i) => ids.map((_, j) => (i === j ? 1 : 0)));
    const delGrupo = validos.filter((p) => idx.has(p.a));
    for (const p of delGrupo) {
      const i = idx.get(p.a) as number;
      const j = idx.get(p.b) as number;
      (objetivo[i] as number[])[j] = p.rho;
      (objetivo[j] as number[])[i] = p.rho;
    }
    const corr = correlacionMasCercana(objetivo);
    if (corr.cambioMaximo > 0) {
      avisos.push(`Las correlaciones entre ${ids.join(', ')} no pueden darse a la vez; se usó la matriz posible más cercana (Higham): el coeficiente que más cambió, ${coma(Math.round(corr.cambioMaximo * 100) / 100)}.`);
    }
    const nuevos = correlacionarImanConover(ids.map((id) => muestraDe.get(id) as Float64Array), corr.matriz, semilla, `cronograma|${ids.join('|')}`);
    ids.forEach((id, i) => (asignar.get(id) as (b: Float64Array) => void)(nuevos[i] as Float64Array));
    for (const p of delGrupo) {
      const i = idx.get(p.a) as number;
      const j = idx.get(p.b) as number;
      logradas.push({ a: p.a, b: p.b, objetivo: p.rho, aplicada: corr.matriz[i]![j] as number, lograda: spearman(nuevos[i] as Float64Array, nuevos[j] as Float64Array) });
    }
  }
  const fuera = logradas.filter((l) => Math.abs(l.lograda - l.aplicada) > 0.05);
  if (fuera.length) avisos.push(`La correlación lograda se aleja más de 0,05 de la pedida en ${fuera.map((l) => `${l.a}–${l.b}`).join(', ')}: suba las iteraciones.`);
  return logradas;
}

// ------------------------------------------------------------- corridas

interface Escenario {
  /** −1 con todos los riesgos; el índice de un riesgo para quitar solo ese; −2 sin ninguno. */
  quitar: number;
  post: boolean;
  completa: boolean;
  /** V8: sin el clima (para medir cuánto pesa). */
  sinClima?: boolean;
}

interface Corrida {
  finDias: Float64Array;
  finSerie: Float64Array;
  costo: Float64Array | null;
  hitosSerie: Float64Array[];
  hitosDias: Float64Array[];
  criticas: Int32Array;
  duraciones: Float32Array[] | null;
  inicio: Float32Array[] | null;
  fin: Float32Array[] | null;
  rutas: Map<string, { veces: number; actividades: number[] }>;
  /** Por hito contractual: fin y multa de cada iteración (solo en la corrida completa). */
  contratoSerie: Float64Array[];
  contratoMulta: Float64Array[];
}

function probabilidadDe(modelo: ModeloCronograma, ri: number, post: boolean): number {
  const r = modelo.riesgos[ri] as ModeloCronograma['riesgos'][number];
  return post && r.probabilidadPost !== undefined ? r.probabilidadPost : r.probabilidad;
}

function factorDe(modelo: ModeloCronograma, ri: number, post: boolean): number {
  return post ? (modelo.riesgos[ri]?.factorImpactoPost ?? 1) : 1;
}

/** El costo de una iteración (o del determinístico) con sus duraciones y fechas. */
function costoDe(
  pre: Preparado, i: number, dur: Float64Array, inicioAct: (a: number) => number, finAct: (a: number) => number,
  inicioProyecto: number, finProyecto: number, finDias: number, conMuestra: boolean,
): number {
  let total = 0;
  for (const c of pre.costos) {
    const v = conMuestra && c.muestra ? (c.muestra[i] as number) : c.p.valor;
    const d = c.actividad >= 0 ? (dur[c.actividad] as number) : finDias;
    let x = c.p.tipo === 'fijo' ? v : c.p.tipo === 'tiempo' ? v * d : (c.p.unidades ?? 1) * v * d;
    if (c.p.escalamiento) {
      const medio = c.actividad >= 0 ? (inicioAct(c.actividad) + finAct(c.actividad)) / 2 : (inicioProyecto + finProyecto) / 2;
      x *= (1 + c.p.escalamiento) ** ((medio - inicioProyecto) / 365.25);
    }
    total += x;
  }
  return total;
}

async function correr(
  modelo: ModeloCronograma, pre: Preparado, esc: Escenario, hitos: readonly number[], avanzar: (k: number) => void, senal?: AbortSignal,
): Promise<Corrida> {
  const { red, n } = pre;
  const { redondeo, ignorarRestriccionesDuras } = modelo.configuracion;
  const entero = redondeo === 'entero';
  const completa = esc.completa;
  const conCostos = tieneCostos(modelo);
  const esp = crearEspacio(red.n);
  const dur = new Float64Array(red.n);
  const cp = calendarioProyecto(red);
  const cuentaInicio = cp.cuenta(red.inicio);
  const inicioSerie = cp.base + Math.floor(red.inicio);
  const finDias = new Float64Array(n);
  const finSerie = new Float64Array(n);
  const costo = conCostos ? new Float64Array(n) : null;
  const hitosSerie = completa ? hitos.map(() => new Float64Array(n)) : [];
  const hitosDias = completa ? hitos.map(() => new Float64Array(n)) : [];
  const criticas = new Int32Array(red.n);
  const duraciones = completa ? Array.from({ length: red.n }, () => new Float32Array(n)) : null;
  const inicio = completa ? Array.from({ length: red.n }, () => new Float32Array(n)) : null;
  const fin = completa ? Array.from({ length: red.n }, () => new Float32Array(n)) : null;
  const rutas = new Map<string, { veces: number; actividades: number[] }>();
  const contratoSerie = completa ? pre.contractuales.map(() => new Float64Array(n)) : [];
  const contratoMulta = completa ? pre.contractuales.map(() => new Float64Array(n)) : [];
  // Con costos que escalan o por actividad hacen falta las fechas: la ida basta.
  let iteracion = 0;
  const clima = esc.sinClima ? null : pre.clima;
  const opciones = {
    ignorarDuras: ignorarRestriccionesDuras, soloIda: !completa,
    ...(clima ? {
      duracionEn: (a: number, inicioA: number, d: number) => (clima.expuesta[a] ? clima.duracion(red.calendarios[red.cal[a] as number] as CalendarioLaboral, inicioA, d, iteracion) : d),
    } : {}),
  };
  const prob = modelo.riesgos.map((_, ri) => probabilidadDe(modelo, ri, esc.post));
  const factor = modelo.riesgos.map((_, ri) => factorDe(modelo, ri, esc.post));
  const mitigacion = esc.post ? modelo.riesgos.reduce((s, r) => s + (r.costoMitigacion ?? 0), 0) : 0;
  const calDe = (a: number) => red.calendarios[red.cal[a] as number] as CalendarioLaboral;
  const serieIni = (a: number) => calDe(a).serieInicio(esp.es[a] as number);
  // Con avance (G3), la duración efectiva de este cálculo (la real de las terminadas).
  const serieFin = (a: number) => calDe(a).serieFin(esp.ef[a] as number, esp.dur[a] as number);

  for (let i = 0; i < n; i++) {
    if (i > 0 && i % BLOQUE === 0) {
      avanzar(BLOQUE);
      await pausa();
      if (senal?.aborted) throw new SimulacionCancelada();
    }
    iteracion = i;
    const ocurre = (ri: number) => esc.quitar !== -2 && ri !== esc.quitar && (pre.u[ri] as Float64Array)[i] as number < (prob[ri] as number);
    for (let a = 0; a < red.n; a++) {
      const rama = pre.ramaDe[a];
      if (rama && (pre.eleccion[rama[0]] as Int32Array)[i] !== rama[1]) {
        dur[a] = 0;
        if (duraciones) (duraciones[a] as Float32Array)[i] = 0;
        continue;
      }
      const muestra = pre.dur[a];
      let d = muestra ? (muestra[i] as number) : (red.duracion[a] as number);
      const lista = pre.impactosDias[a] as ImpactoDias[];
      for (let k = 0; k < lista.length; k++) {
        const imp = lista[k] as ImpactoDias;
        if (ocurre(imp.riesgo)) d += (imp.dias[i] as number) * (factor[imp.riesgo] as number);
      }
      if (d < 0) d = 0;
      if (entero) d = Math.round(d);
      dur[a] = d;
      if (duraciones) (duraciones[a] as Float32Array)[i] = d;
    }
    calcularCpm(red, dur, esp, opciones);
    const fd = cp.cuenta(esp.fin) - cuentaInicio;
    const fs = cp.base + Math.ceil(esp.fin) - 1;
    finDias[i] = fd;
    finSerie[i] = fs;
    if (costo) {
      let c = costoDe(pre, i, red.conAvance || clima ? esp.dur : dur, serieIni, serieFin, inicioSerie, fs, fd, true) + mitigacion;
      for (const imp of pre.impactosCosto) {
        if (imp.actividad >= 0) {
          const rama = pre.ramaDe[imp.actividad];
          if (rama && (pre.eleccion[rama[0]] as Int32Array)[i] !== rama[1]) continue;
        }
        if (ocurre(imp.riesgo)) c += (imp.costo[i] as number) * (factor[imp.riesgo] as number);
      }
      for (let h = 0; h < pre.contractuales.length; h++) {
        const x = pre.contractuales[h] as { h: HitoContractual; a: number };
        c += multaDe(x.h, serieFin(x.a));
      }
      costo[i] = c;
    }
    if (completa) {
      for (let h = 0; h < pre.contractuales.length; h++) {
        const x = pre.contractuales[h] as { h: HitoContractual; a: number };
        const f = serieFin(x.a);
        (contratoSerie[h] as Float64Array)[i] = f;
        (contratoMulta[h] as Float64Array)[i] = multaDe(x.h, f);
      }
    }
    if (completa) {
      let h1 = 0x811c9dc5;
      let h2 = 0x01000193;
      let cuantas = 0;
      for (let o = 0; o < red.n; o++) {
        const a = red.orden[o] as number;
        (inicio as Float32Array[])[a]![i] = serieIni(a);
        (fin as Float32Array[])[a]![i] = serieFin(a);
        if ((esp.holgura[a] as number) <= TOLERANCIA_CRITICA) {
          criticas[a] = (criticas[a] as number) + 1;
          h1 = Math.imul(h1 ^ a, 16777619);
          h2 = Math.imul(h2 ^ (a + 0x9e37), 2246822519);
          cuantas++;
        }
      }
      const k = `${h1 >>> 0}:${h2 >>> 0}:${cuantas}`;
      const r = rutas.get(k);
      if (r) r.veces++;
      else {
        const acts: number[] = [];
        for (let o = 0; o < red.n; o++) {
          const a = red.orden[o] as number;
          if ((esp.holgura[a] as number) <= TOLERANCIA_CRITICA) acts.push(a);
        }
        rutas.set(k, { veces: 1, actividades: acts });
      }
      for (let h = 0; h < hitos.length; h++) {
        const a = hitos[h] as number;
        (hitosSerie[h] as Float64Array)[i] = serieFin(a);
        (hitosDias[h] as Float64Array)[i] = cp.cuenta(calDe(a).fin(esp.ef[a] as number)) - cuentaInicio;
      }
    }
  }
  avanzar(n % BLOQUE === 0 ? BLOQUE : n % BLOQUE);
  return { finDias, finSerie, costo, hitosSerie, hitosDias, criticas, duraciones, inicio, fin, rutas, contratoSerie, contratoMulta };
}

/**
 * Los hitos que se siguen: los pedidos o, si no, los intermedios (duración 0
 * con predecesora y sucesora). El de inicio no cambia nunca y el final es el
 * fin del proyecto, que ya se sigue aparte.
 */
function hitosASeguir(modelo: ModeloCronograma, red: RedCompilada, insertado: readonly boolean[]): number[] {
  if (modelo.configuracion.hitos) {
    return modelo.configuracion.hitos.map((id) => {
      const a = red.indice.get(id);
      if (a === undefined) throw new ErrorModeloCronograma('Config', 'Hitos', `el hito «${id}» no existe`);
      return a;
    });
  }
  const r: number[] = [];
  for (let a = 0; a < red.n; a++) {
    if (insertado[a]) continue;
    const conPredecesora = (red.entradaInicio[a + 1] as number) > (red.entradaInicio[a] as number);
    const conSucesora = (red.salidaInicio[a + 1] as number) > (red.salidaInicio[a] as number);
    if (red.duracion[a] === 0 && conPredecesora && conSucesora && !modelo.ramas?.some((x) => x.opciones.some((o) => o.actividades.includes(red.ids[a] as string)))) r.push(a);
  }
  return r;
}

/** Duraciones del determinístico: las base, con la opción más probable de cada rama. */
function duracionesBase(pre: Preparado): Float64Array {
  const d = Float64Array.from(pre.red.duracion);
  for (let a = 0; a < pre.red.n; a++) {
    const rama = pre.ramaDe[a];
    if (rama && pre.opcionBase[rama[0]] !== rama[1]) d[a] = 0;
  }
  return d;
}

/** Un número para un aviso, con coma decimal. */
const coma = (x: number) => x.toLocaleString('es-CO', { maximumFractionDigits: 4 });

export async function simularCronograma(modelo: ModeloCronograma, opciones: OpcionesSimulacion = {}): Promise<SimulacionCronograma> {
  const t0 = performance.now();
  const cfg = modelo.configuracion;
  if (!cfg.iteracionesAutomaticas && !(Number.isInteger(cfg.iteraciones) && cfg.iteraciones >= 2)) {
    throw new ErrorModeloCronograma('Config', 'Iteraciones', 'hacen falta al menos 2 iteraciones');
  }
  const red = compilarRed(redExtendida(modelo));
  const conCostos = tieneCostos(modelo);
  const conPost = tienePostMitigacion(modelo);
  const R = modelo.riesgos.length;
  const pContingencia = cfg.percentilContingencia ?? 0.8;
  const conClima = climaActivo(modelo.clima);
  const extra = (R > 0 ? R + 1 : 0) + (conPost ? 1 : 0) + (conClima ? 1 : 0);

  let hecho = 0;
  let total = 0;
  let iteraciones = 0;
  const avanzar = (k: number) => {
    hecho += k;
    opciones.progreso?.(Math.min(hecho, total), total, iteraciones);
  };

  // Iteraciones automáticas: se sube hasta que el P80 se estabiliza.
  const tandas = cfg.iteracionesAutomaticas ? ITERACIONES_AUTOMATICAS : [cfg.iteraciones];
  let pre: Preparado | null = null;
  let principal: Corrida | null = null;
  let hitos: number[] = [];
  const avisos: string[] = [];
  for (const n of tandas) {
    pre = preparar(modelo, red, n);
    hitos = hitosASeguir(modelo, red, pre.riesgoInsertado);
    hecho = 0;
    total = n * (1 + extra);
    iteraciones = n;
    principal = await correr(modelo, pre, { quitar: -1, post: false, completa: true }, hitos, avanzar, opciones.senal);
    if (!cfg.iteracionesAutomaticas) break;
    const conv = convergenciaP80(principal.finDias);
    if (conv.convergio) {
      avisos.push(`Iteraciones automáticas: el P80 se estabilizó con ${n.toLocaleString('es-CO')} iteraciones (cambió ${(100 * (conv.ultimoCambio ?? 0)).toFixed(2)} % en el último bloque).`);
      break;
    }
    if (n === tandas[tandas.length - 1]) avisos.push(`Iteraciones automáticas: con ${n.toLocaleString('es-CO')} iteraciones el P80 aún cambia ${(100 * (conv.ultimoCambio ?? 0)).toFixed(2)} % por bloque; se queda ahí.`);
  }
  if (!pre || !principal) throw new Error('Sin iteraciones');
  const n = pre.n;
  avisos.push(...pre.avisos);

  const durBase = duracionesBase(pre);
  const deterministico = cpmDeterministico(red, { ignorarDuras: cfg.ignorarRestriccionesDuras }, durBase);
  const todo = mediaYP80(principal.finDias);
  const todoCosto = principal.costo ? mediaYP80(principal.costo, pContingencia) : null;

  // Costo base: valores base, duraciones y fechas determinísticas, sin riesgos.
  let costoBase: number | null = null;
  if (conCostos) {
    const filas = deterministico.filas;
    costoBase = costoDe(pre, 0, durBase, (a) => filas[a]?.inicio ?? 0, (a) => filas[a]?.fin ?? 0,
      calendarioProyecto(red).base + Math.floor(red.inicio), deterministico.fin, deterministico.duracion, false)
      + pre.contractuales.reduce((s, x) => s + multaDe(x.h, filas[x.a]?.fin ?? 0), 0);
  }

  const eliminacion: EliminacionRiesgo[] = [];
  let sinRiesgos: SimulacionCronograma['sinRiesgos'] = null;
  if (R > 0) {
    for (let ri = 0; ri < R; ri++) {
      const c = await correr(modelo, pre, { quitar: ri, post: false, completa: false }, hitos, avanzar, opciones.senal);
      const s = mediaYP80(c.finDias);
      const sc = c.costo ? mediaYP80(c.costo, pContingencia) : null;
      const r = modelo.riesgos[ri] as ModeloCronograma['riesgos'][number];
      const uu = pre.u[ri] as Float64Array;
      let veces = 0;
      for (let i = 0; i < n; i++) if ((uu[i] as number) < r.probabilidad) veces++;
      eliminacion.push({
        id: r.id, nombre: r.nombre, media: s.media, p80: s.p80,
        reduccionMedia: todo.media - s.media, reduccionP80: todo.p80 - s.p80, ocurrencia: veces / n,
        mediaCosto: sc?.media ?? null, p80Costo: sc?.p80 ?? null,
        reduccionMediaCosto: sc && todoCosto ? todoCosto.media - sc.media : null,
        reduccionP80Costo: sc && todoCosto ? todoCosto.p80 - sc.p80 : null,
        nivelesDias: nivelesDe(c.finDias), nivelesCosto: c.costo ? nivelesDe(c.costo) : null,
      });
    }
    eliminacion.sort((a, b) => b.reduccionP80 - a.reduccionP80 || b.reduccionMedia - a.reduccionMedia || (b.reduccionP80Costo ?? 0) - (a.reduccionP80Costo ?? 0));
    const sr = await correr(modelo, pre, { quitar: -2, post: false, completa: false }, hitos, avanzar, opciones.senal);
    const s = mediaYP80(sr.finDias);
    const sc = sr.costo ? mediaYP80(sr.costo, pContingencia) : null;
    sinRiesgos = { media: s.media, p80: s.p80, mediaCosto: sc?.media ?? null, p80Costo: sc?.p80 ?? null, nivelesDias: nivelesDe(sr.finDias), nivelesCosto: sr.costo ? nivelesDe(sr.costo) : null };
  }

  let sinClima: SimulacionCronograma['sinClima'] = null;
  if (pre.clima) {
    const c = await correr(modelo, pre, { quitar: -1, post: false, completa: false, sinClima: true }, hitos, avanzar, opciones.senal);
    const s = mediaYP80(c.finDias);
    sinClima = { media: s.media, p80: s.p80 };
  }

  let post: EscenarioPost | null = null;
  if (conPost) {
    const c = await correr(modelo, pre, { quitar: -1, post: true, completa: false }, hitos, avanzar, opciones.senal);
    const s = mediaYP80(c.finDias);
    post = { fin: { id: 'FIN', nombre: 'Fin del proyecto (post mitigación)', serie: c.finSerie, dias: c.finDias }, costo: c.costo, media: s.media, p80: s.p80 };
  }

  const criticidad = new Float64Array(red.n);
  for (let a = 0; a < red.n; a++) criticidad[a] = (principal.criticas[a] as number) / n;
  const rutas = [...principal.rutas.values()].sort((a, b) => b.veces - a.veces).slice(0, 5)
    .map((r) => ({ actividades: r.actividades.map((a) => red.ids[a] as string), proporcion: r.veces / n }));
  return {
    red, iteraciones: n, deterministico,
    fin: { id: 'FIN', nombre: 'Fin del proyecto', serie: principal.finSerie, dias: principal.finDias },
    hitos: hitos.map((a, h) => ({ id: red.ids[a] as string, nombre: red.nombres[a] as string, serie: principal.hitosSerie[h] as Float64Array, dias: principal.hitosDias[h] as Float64Array })),
    criticidad, duraciones: principal.duraciones as Float32Array[],
    fechas: { inicio: principal.inicio as Float32Array[], fin: principal.fin as Float32Array[] },
    eliminacion, sinRiesgos, sinClima, media: todo.media, p80: todo.p80,
    costo: principal.costo, costoBase, post, rutas, riesgoInsertado: pre.riesgoInsertado,
    correlacionLograda: pre.correlacionLograda,
    contractuales: pre.contractuales.map((x, h) => ({
      id: red.ids[x.a] as string, nombre: red.nombres[x.a] as string, hito: x.h,
      serie: principal.contratoSerie[h] as Float64Array, multa: principal.contratoMulta[h] as Float64Array,
      serieDeterministica: deterministico.filas[x.a]?.fin ?? NaN,
    })),
    avisos, milisegundos: performance.now() - t0,
  };
}
