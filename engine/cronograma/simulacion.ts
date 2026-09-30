/**
 * Monte Carlo del plazo — P3.
 *
 * En cada iteración: se sortea la duración de cada actividad (PERT o
 * triangular sobre su mínimo, más probable y máximo), se aplican los riesgos
 * de plazo que ocurran (`riesgos.ts`: multiplican a la vez todas sus
 * actividades) y se recalcula la red con el CPM. De ahí salen la fecha de fin
 * del proyecto, las fechas de cada actividad y cuántas veces cada una fue
 * crítica.
 *
 * **Vectorizado por bloques**, como el motor de costos (Fase 2 §3): el CPM no
 * recorre la red una vez por iteración, sino una vez por bloque de B
 * iteraciones, con bucles planos sobre `Float64Array`. Nada pasa por la
 * cuadrícula de Excel, que es lo que hace lentos a los complementos que
 * construyen el CPM con fórmulas.
 *
 * **Reproducible**: los números salen de Philox con un flujo por actividad y
 * por riesgo (`streamOf`), así que la misma semilla da el mismo resultado, y
 * quitar un riesgo no cambia los números que reciben los demás (números
 * aleatorios comunes). Eso es lo que hace fiable «quitar un riesgo y volver a
 * simular» (`impactoDeRiesgos`, la priorización de la guía GAO).
 *
 * Las fechas se tratan por **días**: el percentil 80 es el primer día en el
 * que al menos el 80 % de las iteraciones ya había terminado.
 */

import { streamOf, uniformAt } from '../random/philox.ts';
import { IndiceLaborable } from './calendario.ts';
import { ordenTopologico, resolverRed } from './cpm.ts';
import { extremosDePercentiles, muestreadorDuracion, type Muestreador } from './muestreo.ts';
import { ejeNatural, finPorRelacion, inicioPorRelacion } from './cpmCalendarios.ts';
import { parametrosRed, parametrosRedEje, type ParametrosRed } from './red.ts';
import { relojesDe, type Reloj } from './relojes.ts';
import { idRama, type RiesgoPlazo } from './riesgos.ts';
import type { Actividad, Cronograma } from './tipos.ts';

export type FormaDuracion = 'pert' | 'triangular';

export interface OpcionesSimulacionPlazo {
  iteraciones: number;
  semilla: number;
  forma: FormaDuracion;
  /** Se consulta entre bloques; `true` para parar. */
  debeCancelar?: () => boolean;
  alAvanzar?: (hechas: number, total: number) => void;
  /** Se espera entre bloques, para no congelar el panel. */
  ceder?: () => Promise<void>;
}

export const OPCIONES_PLAZO_POR_DEFECTO: Pick<OpcionesSimulacionPlazo, 'iteraciones' | 'semilla' | 'forma'> = {
  iteraciones: 10_000,
  semilla: 20_270_201,
  forma: 'pert',
};

/** Percentiles que se informan, en tanto por uno. */
export const PERCENTILES_PLAZO = [0.1, 0.5, 0.8, 0.9] as const;

export interface FechasPercentil {
  p10: number;
  p50: number;
  p80: number;
  p90: number;
}

export interface ActividadSimulada {
  id: string;
  nombre: string;
  /** Fracción de iteraciones en las que estuvo en la ruta crítica. */
  criticidad: number;
  /** Correlación (Pearson) de su duración con el fin del proyecto; NaN si su duración no varía. */
  correlacion: number;
  /** Fechas (serie de Excel). */
  inicio: FechasPercentil;
  fin: FechasPercentil;
}

export interface ResultadoSimulacionPlazo {
  iteraciones: number;
  semilla: number;
  forma: FormaDuracion;
  cancelada: boolean;
  /** Fin del proyecto en cada iteración, en días laborables desde el inicio (continuo). */
  finProyecto: Float64Array;
  /** Fechas de fin del proyecto por percentil. */
  fechas: FechasPercentil;
  /** Lo mismo en días laborables (duración del proyecto). */
  dias: FechasPercentil;
  mediaDias: number;
  determinista: { dias: number; fecha: number };
  /** P(terminar no más tarde que la fecha determinista). */
  probDeterminista: number;
  /** Curva S: fecha para cada percentil de 5 % en 5 %. */
  curvaS: Array<{ p: number; fecha: number }>;
  /** Iteraciones que terminan cada día (día laborable desde el inicio). */
  histograma: Array<{ dia: number; fecha: number; cuenta: number }>;
  actividades: ActividadSimulada[];
  riesgos: Array<{ id: string; nombre: string; probabilidad: number; ocurrio: number }>;
  /** Solo si el cronograma tiene costos (P5). */
  costos?: ResultadoCostos;
  /** Fecha (serie) que se enseña para un valor de `finProyecto`. */
  cal: (fin: number) => number;
  /** En qué se cuentan `dias`, `mediaDias` y `determinista.dias` (V7: naturales con calendarios por actividad). */
  unidad: 'laborables' | 'naturales';
}

/**
 * Costo y plazo juntos (P5). El costo de cada iteración es: costos fijos +
 * costo por día × duración simulada de cada actividad + costo indirecto por
 * día × duración del proyecto + costo de los riesgos que ocurren. Como sale
 * de la misma iteración que el plazo, se puede medir la **probabilidad
 * conjunta** (JCL, *Joint Confidence Level* de la NASA): terminar a tiempo
 * **y** dentro del presupuesto a la vez, que es menor que cada una por
 * separado.
 */
export interface ResultadoCostos {
  determinista: number;
  media: number;
  p10: number;
  p50: number;
  p80: number;
  p90: number;
  /** Costo de cada iteración, alineado con `finProyecto`. */
  porIteracion: Float64Array;
  /** P(plazo ≤ P80 y costo ≤ P80). */
  jclP80: number;
  /** P(plazo ≤ el del cronograma y costo ≤ el determinista). */
  jclPlan: number;
  /** El menor percentil q (igual para los dos) con el que el conjunto llega al 80 %. */
  conjunto80: { q: number; fecha: number; dias: number; costo: number } | null;
  /**
   * V4, si hay costos con mínimo y máximo: cuántos, el P80 del costo con los
   * más probables (en las mismas iteraciones) y lo que su incertidumbre
   * añade al P80.
   */
  rangos?: { n: number; p80SinRangos: number; aporteP80: number };
}

/**
 * Cuántas veces cae cada día (entero ≥ 0). Guarda solo una **ventana** de
 * días (`base` … `base + cuentas.length − 1`): las fechas de una actividad
 * se mueven unas decenas de días, no miles, y así sumar los contadores de
 * varios hilos cuesta lo que mide la ventana. Datos planos —no una clase—
 * para poder mandarlos entre hilos.
 */
export interface ContadorDias {
  base: number;
  cuentas: Uint32Array;
  total: number;
}

const nuevoContador = (): ContadorDias => ({ base: 0, cuentas: new Uint32Array(0), total: 0 });

/** Amplía la ventana para que quepan los días [d0, d1]. */
function abarcar(c: ContadorDias, d0: number, d1: number): void {
  const fin = c.base + c.cuentas.length - 1;
  if (c.cuentas.length > 0 && d0 >= c.base && d1 <= fin) return;
  const nb = c.cuentas.length === 0 ? Math.max(0, d0 - 16) : Math.max(0, Math.min(c.base, d0 - 16));
  const nf = c.cuentas.length === 0 ? d1 + 16 : Math.max(fin, d1 + 16);
  // Al crecer, el doble: pocas copias aunque las fechas se vayan alejando.
  const largo = Math.max(nf - nb + 1, c.cuentas.length * 2);
  const nuevo = new Uint32Array(largo);
  if (c.cuentas.length > 0) nuevo.set(c.cuentas, c.base - nb);
  c.base = nb;
  c.cuentas = nuevo;
}

function contar(c: ContadorDias, dia: number): void {
  const d = dia < 0 ? 0 : dia;
  const i = d - c.base;
  if (i < 0 || i >= c.cuentas.length) abarcar(c, d, d);
  c.cuentas[d - c.base] = (c.cuentas[d - c.base] as number) + 1;
  c.total++;
}

function sumarContador(a: ContadorDias, b: ContadorDias): void {
  if (b.total === 0) return;
  abarcar(a, b.base, b.base + b.cuentas.length - 1);
  const off = b.base - a.base;
  for (let i = 0; i < b.cuentas.length; i++) a.cuentas[off + i] = (a.cuentas[off + i] as number) + (b.cuentas[i] as number);
  a.total += b.total;
}

/** El primer día con acumulado ≥ p. */
function cuantilDias(c: ContadorDias, p: number): number {
  const objetivo = Math.max(1, Math.ceil(p * c.total - 1e-9));
  let acum = 0;
  for (let i = 0; i < c.cuentas.length; i++) {
    acum += c.cuentas[i] as number;
    if (acum >= objetivo) return c.base + i;
  }
  return c.base + Math.max(0, c.cuentas.length - 1);
}

function fraccionHasta(c: ContadorDias, dia: number): number {
  let acum = 0;
  for (let i = 0; i < c.cuentas.length && c.base + i <= dia; i++) acum += c.cuentas[i] as number;
  return c.total === 0 ? NaN : acum / c.total;
}

/** Día (índice laborable) en que se enseña un fin temprano `f`; ver `IndiceLaborable.fechaFin`. */
const diaFin = (f: number) => Math.max(0, Math.ceil(f - 1e-9) - 1);
/** Día en que se enseña un inicio temprano `s`; los hitos, como su fin. */
const diaInicio = (s: number, d: number) => (d === 0 ? diaFin(s) : Math.floor(s + 1e-9));

const TIPO = { FS: 0, SS: 1, FF: 2, SF: 3 } as const;

type Rel = { p: number; t: number; r: number };
type RelSal = { s: number; t: number; r: number };

/** Lo que no cambia entre iteraciones: la red en arreglos planos, los muestreadores y los flujos. */
export interface PlazoPreparado {
  n: number;
  orden: number[];
  entrantes: Rel[][];
  salientes: RelSal[][];
  minInicio: number[];
  /** Avance y restricciones (`red.ts`). */
  red: ParametrosRed;
  /** Hay avance o restricciones que tocar en el bucle (si no, se salta ese trabajo). */
  conAvance: boolean;
  dists: Array<Muestreador | null>;
  fijas: number[];
  duraciones: number[];
  flujos: number[];
  riesgos: Array<{ r: RiesgoPlazo; ocurre: number; impacto: number; dist: Muestreador | null; afectadas: number[] }>;
  semilla: number;
  cal: IndiceLaborable;
  actividades: Array<{ id: string; nombre: string }>;
  forma: FormaDuracion;
  /** V2: para cada actividad, el índice del riesgo cuya rama es (−1 si es una actividad normal). */
  condicional: number[];
  /** Costos (P5): por día de cada actividad, fijos en total e indirecto por día del proyecto. */
  costoDia: number[];
  costoFijo: number;
  costoIndirectoDia: number;
  /**
   * V4: los costos con mínimo y máximo. `costoFijo` y `costoDia` llevan el
   * más probable; en cada iteración se suma la diferencia con lo sorteado
   * (por día, multiplicada por la duración de esa iteración).
   */
  costosInciertos: Array<{ a: number; porDia: boolean; mp: number; dist: Muestreador; flujo: number }>;
  hayCostos: boolean;
  /**
   * V7: con calendarios por actividad, el reloj de cada actividad (las
   * ramas, el del proyecto) y el del proyecto; el eje (`cal`) es entonces el
   * de días naturales. Sin ellos, todo en días laborables del proyecto.
   */
  relojes?: Reloj[];
  relojProyecto?: Reloj;
  /** Memoria de trabajo de un bloque, reservada una vez y reutilizada (`ef` y `ls`, solo con relojes). */
  trabajo?: { dur: Float64Array; es: Float64Array; lf: Float64Array; fin: Float64Array; costo: Float64Array; ocurre: Uint8Array[]; ef?: Float64Array; ls?: Float64Array };
}

export function prepararPlazo(c: Cronograma, riesgos: readonly RiesgoPlazo[], op: { semilla: number; forma: FormaDuracion }): PlazoPreparado {
  const acts = c.actividades;
  const n0 = acts.length;
  const resuelta = resolverRed(acts);
  if (!resuelta.ok) throw new Error(resuelta.problemas.map((x) => x.mensaje).join('; '));
  // V7: con varios calendarios, eje de días naturales y un reloj por actividad.
  const conRelojes = relojesDe(c);
  const cal = conRelojes ? ejeNatural(c) : new IndiceLaborable(c.calendario, c.inicio);
  const red = conRelojes ? parametrosRedEje(c, cal, conRelojes.relojes) : parametrosRed(c, cal);
  const indice = new Map(acts.map((a, i) => [a.id, i]));
  const entrantes: Rel[][] = acts.map((a) => a.predecesoras.map((r) => ({ p: indice.get(r.predecesora) as number, t: TIPO[r.tipo], r: r.retardo })));

  // V2: cada riesgo con rama añade una actividad condicional al final.
  const ramas = riesgos.map((r, j) => ({ r, j })).filter((x) => x.r.rama);
  const condicional = new Array<number>(n0).fill(-1);
  const nombres = acts.map((a) => ({ id: a.id, nombre: a.nombre }));
  const extra = { dists: [] as Array<Muestreador | null>, fijas: [] as number[], flujos: [] as number[] };
  for (const { r, j } of ramas) {
    const rama = r.rama as NonNullable<RiesgoPlazo['rama']>;
    const idx = entrantes.length;
    entrantes.push(rama.despuesDe.map((id) => ({ p: indice.get(id) as number, t: 0, r: 0 })));
    for (const id of rama.antesDe) (entrantes[indice.get(id) as number] as Rel[]).push({ p: idx, t: 0, r: 0 });
    condicional.push(j);
    nombres.push({ id: idRama(r), nombre: `${rama.nombre} (si ocurre ${r.id})` });
    extra.dists.push(muestreadorDuracion(rama.min, rama.masProbable, rama.max, op.forma));
    extra.fijas.push(rama.masProbable);
    extra.flujos.push(streamOf(`rama:${r.id}`));
    red.estado.push('pendiente');
    red.minInicio.push(red.corte);
    red.minFin.push(-Infinity);
    red.maxFin.push(Infinity);
    red.maxInicio.push(Infinity);
    red.sinLogica.push(false);
    red.transcurrido.push(0);
    red.escala.push(1);
  }
  const n = entrantes.length;
  const { orden, enCiclo } = ordenTopologico(n, entrantes.map((l) => l.map((x) => x.p)));
  if (enCiclo.length > 0) {
    throw new Error(n > n0 ? 'Una actividad nueva de «Riesgos de plazo» crea una dependencia circular (revisa «Después de» y «Antes de»)' : 'El cronograma tiene una dependencia circular');
  }
  const salientes: RelSal[][] = Array.from({ length: n }, () => []);
  entrantes.forEach((lista, s2) => lista.forEach(({ p, t, r }) => (salientes[p] as RelSal[]).push({ s: s2, t, r })));
  return {
    n,
    orden,
    entrantes,
    salientes,
    minInicio: red.minInicio,
    red,
    conAvance: red.sinLogica.some(Boolean) || red.minFin.some(Number.isFinite) || red.maxFin.some(Number.isFinite) || red.maxInicio.some(Number.isFinite),
    dists: [...acts.map((a) => distribucionDe(a, op.forma)), ...extra.dists],
    fijas: [...acts.map((a) => (a.tresPuntos && !(a.tresPuntos.max > a.tresPuntos.min) ? a.tresPuntos.masProbable : a.duracion)), ...extra.fijas],
    // Sin incertidumbre, las ramas no ocurren: duran 0 en el cronograma determinista.
    duraciones: [...acts.map((a) => a.duracion), ...ramas.map(() => 0)],
    flujos: [...acts.map((a) => streamOf(`plazo:${a.id}`)), ...extra.flujos],
    condicional,
    riesgos: riesgos.map((r) => ({
      r,
      ocurre: streamOf(`riesgo-plazo:${r.id}#ocurre`),
      impacto: streamOf(`riesgo-plazo:${r.id}#impacto`),
      dist: muestreadorDuracion(r.impactoMin, r.impactoMasProbable, r.impactoMax, 'pert'),
      afectadas: r.actividades.map((id) => indice.get(id)).filter((i): i is number => i !== undefined),
    })),
    costoDia: [...acts.map((a) => a.costoPorDia ?? 0), ...ramas.map(() => 0)],
    costoFijo: acts.reduce((s2, a) => s2 + (a.costoFijo ?? 0), 0) + (c.costoAdicional ?? 0),
    costoIndirectoDia: c.costoIndirectoDia ?? 0,
    costosInciertos: costosInciertos(acts, op.forma),
    hayCostos: acts.some((a) => a.costoPorDia || a.costoFijo || a.costoFijoRango || a.costoPorDiaRango) || !!c.costoIndirectoDia || !!c.costoAdicional || riesgos.some((r) => r.costo),
    semilla: op.semilla,
    cal,
    actividades: nombres,
    forma: op.forma,
    ...(conRelojes ? { relojes: [...conRelojes.relojes, ...ramas.map(() => conRelojes.proyecto)], relojProyecto: conRelojes.proyecto } : {}),
  };
}

/** La duración de una actividad; con P10/P90 (V6) y forma triangular, los extremos de la triangular equivalente. */
function distribucionDe(a: Actividad, forma: FormaDuracion): Muestreador | null {
  const t = a.tresPuntos;
  if (!t) return null;
  if (a.percentiles && forma === 'triangular') {
    const e = extremosDePercentiles(a.percentiles.p10, t.masProbable, a.percentiles.p90, 'triangular');
    return muestreadorDuracion(Math.max(0, e.min), t.masProbable, e.max, forma);
  }
  return muestreadorDuracion(t.min, t.masProbable, t.max, forma);
}

/**
 * V4: un muestreador por costo con rango, con su propio flujo de números
 * aleatorios (`costo-fijo:ID`, `costo-dia:ID`): las duraciones y los riesgos
 * sortean exactamente lo mismo que sin rangos.
 */
function costosInciertos(acts: readonly Actividad[], forma: FormaDuracion): PlazoPreparado['costosInciertos'] {
  const out: PlazoPreparado['costosInciertos'] = [];
  acts.forEach((a, i) => {
    for (const [porDia, mp, rango] of [[false, a.costoFijo, a.costoFijoRango], [true, a.costoPorDia, a.costoPorDiaRango]] as const) {
      if (!rango || mp === undefined) continue;
      const dist = muestreadorDuracion(rango.min, mp, rango.max, forma);
      if (dist) out.push({ a: i, porDia, mp, dist, flujo: streamOf(`${porDia ? 'costo-dia' : 'costo-fijo'}:${a.id}`) });
    }
  });
  return out;
}

/**
 * Lo que acumula un tramo de iteraciones. Datos planos (arreglos tipados)
 * para mandarlo entre hilos; varios se suman con `combinarAcumuladores`.
 */
export interface AcumuladorPlazo {
  hechas: number;
  /** Fin del proyecto por iteración, con la iteración en la que empieza cada tramo. */
  tramos: Array<{ desde: number; fin: Float64Array; costo?: Float64Array; costoBase?: Float64Array }>;
  cuentaFin: ContadorDias;
  inicios: ContadorDias[];
  fines: ContadorDias[];
  critica: Float64Array;
  sx: Float64Array;
  sxx: Float64Array;
  sxy: Float64Array;
  sy: number;
  syy: number;
  veces: number[];
}

export function nuevoAcumulador(p: PlazoPreparado): AcumuladorPlazo {
  return {
    hechas: 0,
    tramos: [],
    cuentaFin: nuevoContador(),
    inicios: Array.from({ length: p.n }, nuevoContador),
    fines: Array.from({ length: p.n }, nuevoContador),
    critica: new Float64Array(p.n),
    sx: new Float64Array(p.n),
    sxx: new Float64Array(p.n),
    sxy: new Float64Array(p.n),
    sy: 0,
    syy: 0,
    veces: p.riesgos.map(() => 0),
  };
}

/** Tamaño de bloque: cabe en ~48 MB de memoria de trabajo por hilo. */
export const bloquePlazo = (n: number) => Math.max(16, Math.min(2048, Math.floor(2_000_000 / Math.max(1, n))));

/**
 * Simula las iteraciones `[desde, hasta)` y las suma a `acc`. Las
 * iteraciones se numeran globalmente: el tramo 5.000–7.500 da lo mismo lo
 * calcule quien lo calcule, y el resultado no depende del reparto.
 */
export function simularTramo(p: PlazoPreparado, acc: AcumuladorPlazo, desde: number, hasta: number): void {
  const { n, orden, entrantes, salientes, minInicio, dists, fijas, flujos, semilla } = p;
  const B = bloquePlazo(n);
  p.trabajo ??= {
    dur: new Float64Array(n * B), es: new Float64Array(n * B), lf: new Float64Array(n * B), fin: new Float64Array(B), costo: new Float64Array(B),
    ocurre: p.riesgos.map(() => new Uint8Array(B)),
    ...(p.relojes ? { ef: new Float64Array(n * B), ls: new Float64Array(n * B) } : {}),
  };
  const { dur, es, lf, fin, costo, ocurre, ef, ls } = p.trabajo;
  const R = p.relojes;
  /** La máscara «ocurrió» de la rama que es la actividad `a`, o null si `a` es normal. */
  const mascara = (a: number) => {
    const j = p.condicional[a] as number;
    return j < 0 ? null : (ocurre[j] as Uint8Array);
  };
  const finTramo = new Float64Array(Math.max(0, hasta - desde));
  const costoTramo = p.hayCostos ? new Float64Array(Math.max(0, hasta - desde)) : undefined;
  // V4: el costo con los más probables (sin el sorteo de los rangos), para saber cuánto añaden.
  const costoBaseTramo = costoTramo && p.costosInciertos.length > 0 ? new Float64Array(costoTramo.length) : undefined;

  for (let i0 = desde; i0 < hasta; i0 += B) {
    const b = Math.min(B, hasta - i0);

    // 1. Duraciones.
    for (let a = 0; a < n; a++) {
      const base = a * B;
      const dist = dists[a];
      if (dist) {
        const flujo = flujos[a] as number;
        for (let k = 0; k < b; k++) dur[base + k] = dist.muestra(semilla, flujo, i0 + k);
      } else {
        const v = fijas[a] as number;
        for (let k = 0; k < b; k++) dur[base + k] = v;
      }
    }
    // 2. Riesgos de plazo: un sorteo por riesgo e iteración, el mismo para todas sus actividades.
    if (costoTramo) costo.fill(p.costoFijo);
    p.riesgos.forEach((x, j) => {
      const costoRiesgo = x.r.costo ?? 0;
      const m = ocurre[j] as Uint8Array;
      m.fill(0);
      for (let k = 0; k < b; k++) {
        if (uniformAt(semilla, x.ocurre, i0 + k) >= x.r.probabilidad) continue;
        m[k] = 1;
        acc.veces[j] = (acc.veces[j] as number) + 1;
        if (costoTramo) costo[k] = (costo[k] as number) + costoRiesgo;
        const f = 1 + (x.dist ? x.dist.muestra(semilla, x.impacto, i0 + k) : x.r.impactoMasProbable);
        for (const a of x.afectadas) dur[a * B + k] = (dur[a * B + k] as number) * f;
      }
    });
    // 2a. V2: las ramas solo duran en las iteraciones en que su riesgo ocurre.
    for (let a = 0; a < n; a++) {
      const m = mascara(a);
      if (!m) continue;
      const base = a * B;
      for (let k = 0; k < b; k++) if (!m[k]) dur[base + k] = 0;
    }
    // 2b. Avance: solo lo que queda tiene incertidumbre y sufre los riesgos.
    if (p.conAvance) {
      for (let a = 0; a < n; a++) {
        const t0 = p.red.transcurrido[a] as number;
        const e = p.red.escala[a] as number;
        if (t0 === 0 && e === 1) continue;
        const base = a * B;
        for (let k = 0; k < b; k++) dur[base + k] = t0 + (dur[base + k] as number) * e;
      }
    }
    // 3. Adelante (V7: con relojes, `adelanteConRelojes`).
    if (R) adelanteConRelojes(p, R, b);
    else {
      // 3. Adelante. El tipo de relación, fuera del bucle interno: cuatro bucles planos.
      fin.fill(0);
      for (const s2 of orden) {
        const bs = s2 * B;
        const m0 = minInicio[s2] as number;
        for (let k = 0; k < b; k++) es[bs + k] = m0;
        const entra = p.red.sinLogica[s2] ? [] : (entrantes[s2] as Rel[]);
        for (const { p: pr, t, r } of entra) {
          const bp = pr * B;
          const mp = mascara(pr);
          if (mp) {
            // De una rama (siempre fin‑comienzo): solo cuenta si la rama ocurrió.
            for (let k = 0; k < b; k++) {
              if (!mp[k]) continue;
              const v = (es[bp + k] as number) + (dur[bp + k] as number) + r;
              if (v > (es[bs + k] as number)) es[bs + k] = v;
            }
          } else if (t === 0) {
            for (let k = 0; k < b; k++) {
              const v = (es[bp + k] as number) + (dur[bp + k] as number) + r;
              if (v > (es[bs + k] as number)) es[bs + k] = v;
            }
          } else if (t === 1) {
            for (let k = 0; k < b; k++) {
              const v = (es[bp + k] as number) + r;
              if (v > (es[bs + k] as number)) es[bs + k] = v;
            }
          } else if (t === 2) {
            for (let k = 0; k < b; k++) {
              const v = (es[bp + k] as number) + (dur[bp + k] as number) + r - (dur[bs + k] as number);
              if (v > (es[bs + k] as number)) es[bs + k] = v;
            }
          } else {
            for (let k = 0; k < b; k++) {
              const v = (es[bp + k] as number) + r - (dur[bs + k] as number);
              if (v > (es[bs + k] as number)) es[bs + k] = v;
            }
          }
        }
        const minFin = p.red.minFin[s2] as number;
        if (minFin > -Infinity && !p.red.sinLogica[s2]) {
          for (let k = 0; k < b; k++) {
            const v = minFin - (dur[bs + k] as number);
            if (v > (es[bs + k] as number)) es[bs + k] = v;
          }
        }
        for (let k = 0; k < b; k++) {
          const ef = (es[bs + k] as number) + (dur[bs + k] as number);
          if (ef > (fin[k] as number)) fin[k] = ef;
        }
      }
    }
    // 3b. Costo de la iteración (P5): por día de cada actividad y por día del proyecto.
    if (costoTramo) {
      for (let a = 0; a < n; a++) {
        const cd = p.costoDia[a] as number;
        if (cd === 0) continue;
        const ba = a * B;
        for (let k = 0; k < b; k++) costo[k] = (costo[k] as number) + cd * (dur[ba + k] as number);
      }
      const ind = p.costoIndirectoDia;
      // V7: con relojes el fin está en días naturales; el indirecto es por día laborable del proyecto.
      const diasProyecto = (f: number) => (p.relojProyecto ? p.relojProyecto.W(f) : f);
      if (costoBaseTramo) for (let k = 0; k < b; k++) costoBaseTramo[i0 - desde + k] = (costo[k] as number) + ind * diasProyecto(fin[k] as number);
      // V4: lo sorteado de cada costo con rango, menos el más probable que ya se contó.
      for (const x of p.costosInciertos) {
        const ba = x.a * B;
        for (let k = 0; k < b; k++) {
          const d = x.dist.muestra(semilla, x.flujo, i0 + k) - x.mp;
          costo[k] = (costo[k] as number) + (x.porDia ? d * (dur[ba + k] as number) : d);
        }
      }
      for (let k = 0; k < b; k++) costoTramo[i0 - desde + k] = (costo[k] as number) + ind * diasProyecto(fin[k] as number);
    }
    // 4. Atrás (V7: con relojes, `atrasConRelojes`).
    if (R) atrasConRelojes(p, R, b);
    else {
      // 4. Atrás.
      for (let o = orden.length - 1; o >= 0; o--) {
        const pr = orden[o] as number;
        const bp = pr * B;
        for (let k = 0; k < b; k++) lf[bp + k] = fin[k] as number;
        for (const { s: s2, t, r } of salientes[pr] as RelSal[]) {
          const bs = s2 * B;
          const ms = mascara(s2);
          if (ms) {
            for (let k = 0; k < b; k++) {
              if (!ms[k]) continue;
              const v = (lf[bs + k] as number) - (dur[bs + k] as number) - r;
              if (v < (lf[bp + k] as number)) lf[bp + k] = v;
            }
          } else if (t === 0) {
            for (let k = 0; k < b; k++) {
              const v = (lf[bs + k] as number) - (dur[bs + k] as number) - r;
              if (v < (lf[bp + k] as number)) lf[bp + k] = v;
            }
          } else if (t === 1) {
            for (let k = 0; k < b; k++) {
              const v = (lf[bs + k] as number) - (dur[bs + k] as number) - r + (dur[bp + k] as number);
              if (v < (lf[bp + k] as number)) lf[bp + k] = v;
            }
          } else if (t === 2) {
            for (let k = 0; k < b; k++) {
              const v = (lf[bs + k] as number) - r;
              if (v < (lf[bp + k] as number)) lf[bp + k] = v;
            }
          } else {
            for (let k = 0; k < b; k++) {
              const v = (lf[bs + k] as number) - r + (dur[bp + k] as number);
              if (v < (lf[bp + k] as number)) lf[bp + k] = v;
            }
          }
        }
        // 4b. Restricciones que limitan las fechas tardías, dentro de la pasada: se propagan a las predecesoras.
        if (p.conAvance) {
          const mf = p.red.maxFin[pr] as number;
          const mi = p.red.maxInicio[pr] as number;
          if (mf !== Infinity || mi !== Infinity) {
            for (let k = 0; k < b; k++) {
              const tope = Math.min(mf, mi + (dur[bp + k] as number));
              if (tope < (lf[bp + k] as number)) lf[bp + k] = tope;
            }
          }
        }
      }
    }
    // 5. Estadísticas.
    let sy = 0;
    let syy = 0;
    const cuentaFin = acc.cuentaFin;
    for (let k = 0; k < b; k++) {
      const y = fin[k] as number;
      finTramo[i0 - desde + k] = y;
      contar(cuentaFin, diaFin(y));
      sy += y;
      syy += y * y;
    }
    acc.sy += sy;
    acc.syy += syy;
    for (let a = 0; a < n; a++) {
      const ba = a * B;
      const ini = acc.inicios[a] as ContadorDias;
      const fi = acc.fines[a] as ContadorDias;
      const terminada = p.red.estado[a] === 'terminada';
      const mr = mascara(a);
      let crit = 0;
      let x1 = 0;
      let x2 = 0;
      let xy = 0;
      for (let k = 0; k < b; k++) {
        const d = dur[ba + k] as number;
        const e = es[ba + k] as number;
        // Una rama solo cuenta en las iteraciones en que existe.
        if (mr && !mr[k]) continue;
        if (ef) {
          // V7: holgura en días laborables del calendario de la actividad.
          const r = (R as Reloj[])[a] as Reloj;
          if (!terminada && r.W(ls![ba + k] as number) - r.W(e) < 1e-9) crit++;
          contar(ini, diaInicio(e, d));
          contar(fi, diaFin(ef[ba + k] as number));
        } else {
          if (!terminada && (lf[ba + k] as number) - d - e < 1e-9) crit++;
          contar(ini, diaInicio(e, d));
          contar(fi, diaFin(e + d));
        }
        x1 += d;
        x2 += d * d;
        xy += d * (fin[k] as number);
      }
      acc.critica[a] = (acc.critica[a] as number) + crit;
      acc.sx[a] = (acc.sx[a] as number) + x1;
      acc.sxx[a] = (acc.sxx[a] as number) + x2;
      acc.sxy[a] = (acc.sxy[a] as number) + xy;
    }
    acc.hechas += b;
  }
  acc.tramos.push({ desde, fin: finTramo, ...(costoTramo ? { costo: costoTramo } : {}), ...(costoBaseTramo ? { costoBase: costoBaseTramo } : {}) });
}

const TIPO_TEXTO = ['FS', 'SS', 'FF', 'SF'] as const;

/**
 * V7: la pasada adelante con el reloj de cada actividad (las mismas reglas
 * que `cpmConRelojes`), para las `b` iteraciones del bloque. Deja el inicio
 * en `es`, el fin en `ef` y el fin del proyecto en `fin`.
 */
function adelanteConRelojes(p: PlazoPreparado, R: readonly Reloj[], b: number): void {
  const B = bloquePlazo(p.n);
  const { dur, es, fin, ocurre } = p.trabajo!;
  const ef = p.trabajo!.ef!;
  fin.fill(0);
  for (const s2 of p.orden) {
    const bs = s2 * B;
    const rs = R[s2] as Reloj;
    const m0 = p.minInicio[s2] as number;
    for (let k = 0; k < b; k++) es[bs + k] = m0;
    const entra = p.red.sinLogica[s2] ? [] : (p.entrantes[s2] as Rel[]);
    for (const { p: pr, t, r } of entra) {
      const bp = pr * B;
      const rp = R[pr] as Reloj;
      const j = p.condicional[pr] as number;
      const mp = j < 0 ? null : (ocurre[j] as Uint8Array);
      const tipo = TIPO_TEXTO[t] as (typeof TIPO_TEXTO)[number];
      for (let k = 0; k < b; k++) {
        if (mp && !mp[k]) continue;
        const v = inicioPorRelacion(tipo, r, es[bp + k] as number, ef[bp + k] as number, rp, rs, dur[bs + k] as number);
        if (v > (es[bs + k] as number)) es[bs + k] = v;
      }
    }
    const minFin = p.red.minFin[s2] as number;
    const conMinFin = minFin > -Infinity && !p.red.sinLogica[s2];
    for (let k = 0; k < b; k++) {
      const d = dur[bs + k] as number;
      let e = es[bs + k] as number;
      if (conMinFin) e = Math.max(e, rs.inicioParaFin(minFin, d));
      if (d > 0) e = rs.alinearInicio(e);
      es[bs + k] = e;
      const f = rs.avanzar(e, d);
      ef[bs + k] = f;
      if (f > (fin[k] as number)) fin[k] = f;
    }
  }
}

/** V7: la pasada atrás con relojes: el fin tardío en `lf` y el inicio tardío en `ls`. */
function atrasConRelojes(p: PlazoPreparado, R: readonly Reloj[], b: number): void {
  const B = bloquePlazo(p.n);
  const { dur, lf, fin, ocurre } = p.trabajo!;
  const ls = p.trabajo!.ls!;
  for (let o = p.orden.length - 1; o >= 0; o--) {
    const pr = p.orden[o] as number;
    const bp = pr * B;
    const rp = R[pr] as Reloj;
    for (let k = 0; k < b; k++) lf[bp + k] = fin[k] as number;
    for (const { s: s2, t, r } of p.salientes[pr] as RelSal[]) {
      const bs = s2 * B;
      const j = p.condicional[s2] as number;
      const ms = j < 0 ? null : (ocurre[j] as Uint8Array);
      const tipo = TIPO_TEXTO[t] as (typeof TIPO_TEXTO)[number];
      for (let k = 0; k < b; k++) {
        if (ms && !ms[k]) continue;
        const v = finPorRelacion(tipo, r, ls[bs + k] as number, lf[bs + k] as number, rp, dur[bp + k] as number);
        if (v < (lf[bp + k] as number)) lf[bp + k] = v;
      }
    }
    const mf = p.red.maxFin[pr] as number;
    const mi = p.red.maxInicio[pr] as number;
    for (let k = 0; k < b; k++) {
      const d = dur[bp + k] as number;
      let f = lf[bp + k] as number;
      if (mf !== Infinity || mi !== Infinity) f = Math.min(f, mf, rp.avanzar(mi, d));
      if (d > 0) f = rp.alinearFin(f);
      lf[bp + k] = f;
      ls[bp + k] = rp.inicioParaFin(f, d);
    }
  }
}

/** Suma varios acumuladores (de tramos distintos) en uno. */
export function combinarAcumuladores(p: PlazoPreparado, partes: readonly AcumuladorPlazo[]): AcumuladorPlazo {
  const t = nuevoAcumulador(p);
  for (const x of partes) {
    t.hechas += x.hechas;
    t.tramos.push(...x.tramos);
    sumarContador(t.cuentaFin, x.cuentaFin);
    for (let a = 0; a < p.n; a++) {
      sumarContador(t.inicios[a] as ContadorDias, x.inicios[a] as ContadorDias);
      sumarContador(t.fines[a] as ContadorDias, x.fines[a] as ContadorDias);
      t.critica[a] = (t.critica[a] as number) + (x.critica[a] as number);
      t.sx[a] = (t.sx[a] as number) + (x.sx[a] as number);
      t.sxx[a] = (t.sxx[a] as number) + (x.sxx[a] as number);
      t.sxy[a] = (t.sxy[a] as number) + (x.sxy[a] as number);
    }
    t.sy += x.sy;
    t.syy += x.syy;
    x.veces.forEach((v, j) => (t.veces[j] = (t.veces[j] as number) + v));
  }
  return t;
}

/** Los arreglos de un acumulador, para transferirlos entre hilos sin copiar. */
export function transferiblesDe(acc: AcumuladorPlazo): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const agregar = (x: { buffer: ArrayBufferLike }) => {
    if (x.buffer instanceof ArrayBuffer && !out.includes(x.buffer)) out.push(x.buffer);
  };
  acc.tramos.forEach((t) => {
    agregar(t.fin);
    if (t.costo) agregar(t.costo);
    if (t.costoBase) agregar(t.costoBase);
  });
  agregar(acc.cuentaFin.cuentas);
  acc.inicios.forEach((c) => agregar(c.cuentas));
  acc.fines.forEach((c) => agregar(c.cuentas));
  [acc.critica, acc.sx, acc.sxx, acc.sxy].forEach(agregar);
  return out;
}

export function resultadoPlazo(p: PlazoPreparado, acc: AcumuladorPlazo, cancelada: boolean): ResultadoSimulacionPlazo {
  const M = Math.max(1, acc.hechas);
  const fechaDia = (d: number) => p.cal.fechaDeIndice(d);
  const cuantiles = (c: ContadorDias): FechasPercentil => ({
    p10: fechaDia(cuantilDias(c, 0.1)), p50: fechaDia(cuantilDias(c, 0.5)), p80: fechaDia(cuantilDias(c, 0.8)), p90: fechaDia(cuantilDias(c, 0.9)),
  });
  const det = cpmDeterminista(p.duraciones.map((d, i) => (p.red.transcurrido[i] as number) + d * (p.red.escala[i] as number)), p.orden, p.entrantes, p.red, p.condicional, p.relojes);

  const finProyecto = new Float64Array(acc.hechas);
  const costoIter = p.hayCostos ? new Float64Array(acc.hechas) : null;
  const costoBase = p.hayCostos && p.costosInciertos.length > 0 ? new Float64Array(acc.hechas) : null;
  let k = 0;
  for (const t of [...acc.tramos].sort((a, b) => a.desde - b.desde)) {
    finProyecto.set(t.fin, k);
    if (costoIter && t.costo) costoIter.set(t.costo, k);
    if (costoBase && t.costoBase) costoBase.set(t.costoBase, k);
    k += t.fin.length;
  }

  const histograma: ResultadoSimulacionPlazo['histograma'] = [];
  acc.cuentaFin.cuentas.forEach((cuenta, i) => {
    const dia = acc.cuentaFin.base + i;
    if (cuenta > 0) histograma.push({ dia, fecha: fechaDia(dia), cuenta });
  });

  const media = acc.sy / M;
  const varY = acc.syy / M - media * media;
  const actividades: ActividadSimulada[] = p.actividades.map((a, i) => {
    const mx = (acc.sx[i] as number) / M;
    const vx = (acc.sxx[i] as number) / M - mx * mx;
    const cov = (acc.sxy[i] as number) / M - mx * media;
    const correlacion = vx > 1e-12 && varY > 1e-12 ? cov / Math.sqrt(vx * varY) : NaN;
    return {
      id: a.id,
      nombre: a.nombre,
      criticidad: (acc.critica[i] as number) / M,
      correlacion,
      inicio: cuantiles(acc.inicios[i] as ContadorDias),
      fin: cuantiles(acc.fines[i] as ContadorDias),
    };
  });

  const dia = (q: number) => cuantilDias(acc.cuentaFin, q);
  return {
    iteraciones: acc.hechas,
    semilla: p.semilla,
    forma: p.forma,
    cancelada,
    finProyecto,
    fechas: cuantiles(acc.cuentaFin),
    dias: { p10: dia(0.1) + 1, p50: dia(0.5) + 1, p80: dia(0.8) + 1, p90: dia(0.9) + 1 },
    mediaDias: media,
    determinista: { dias: det, fecha: fechaDia(diaFin(det)) },
    probDeterminista: fraccionHasta(acc.cuentaFin, diaFin(det)),
    curvaS: Array.from({ length: 20 }, (_, j) => {
      const q = (j + 1) / 20;
      return { p: q, fecha: fechaDia(cuantilDias(acc.cuentaFin, q)) };
    }),
    histograma,
    actividades,
    riesgos: p.riesgos.map((x, j) => ({ id: x.r.id, nombre: x.r.nombre, probabilidad: x.r.probabilidad, ocurrio: (acc.veces[j] as number) / M })),
    cal: (f: number) => fechaDia(diaFin(f)),
    unidad: p.relojes ? 'naturales' : 'laborables',
    ...(costoIter && acc.hechas > 0
      ? { costos: conRangos(analizarCostos(finProyecto, costoIter, costoDeterminista(p), det, (q) => fechaDia(q)), costoBase, p.costosInciertos.length) }
      : {}),
  };
}

/** V4: lo que añaden al P80 del costo los rangos de los costos. */
function conRangos(c: ResultadoCostos, base: Float64Array | null, n: number): ResultadoCostos {
  if (!base || n === 0) return c;
  const p80SinRangos = cuantilOrdenado(Float64Array.from(base).sort(), 0.8);
  return { ...c, rangos: { n, p80SinRangos, aporteP80: c.p80 - p80SinRangos } };
}

/** El costo con las duraciones de la hoja y sin riesgos. */
function costoDeterminista(p: PlazoPreparado): number {
  let c = p.costoFijo;
  p.duraciones.forEach((d, i) => {
    c += (p.costoDia[i] as number) * ((p.red.transcurrido[i] as number) + d * (p.red.escala[i] as number));
  });
  const fin = cpmDeterminista(p.duraciones.map((d, i) => (p.red.transcurrido[i] as number) + d * (p.red.escala[i] as number)), p.orden, p.entrantes, p.red, p.condicional, p.relojes);
  return c + p.costoIndirectoDia * (p.relojProyecto ? p.relojProyecto.W(fin) : fin);
}

/** Percentil «el primero con acumulado ≥ q» sobre un arreglo ordenado. */
const cuantilOrdenado = (o: Float64Array, q: number) => o[Math.min(o.length - 1, Math.max(0, Math.ceil(q * o.length - 1e-9) - 1))] as number;

export function analizarCostos(
  fin: Float64Array,
  costo: Float64Array,
  determinista: number,
  finDeterminista: number,
  fechaDeDia: (dia: number) => number,
): ResultadoCostos {
  const n = costo.length;
  const dias = Float64Array.from(fin, diaFin);
  const diasOrd = Float64Array.from(dias).sort();
  const costoOrd = Float64Array.from(costo).sort();
  const conjunta = (diaMax: number, costoMax: number) => {
    let c = 0;
    for (let i = 0; i < n; i++) if ((dias[i] as number) <= diaMax && (costo[i] as number) <= costoMax + 1e-9) c++;
    return c / n;
  };
  const p80Dia = cuantilOrdenado(diasOrd, 0.8);
  const p80Costo = cuantilOrdenado(costoOrd, 0.8);
  let conjunto80: ResultadoCostos['conjunto80'] = null;
  for (let q = 0.8; q <= 0.995; q += 0.005) {
    const d = cuantilOrdenado(diasOrd, q);
    const c = cuantilOrdenado(costoOrd, q);
    if (conjunta(d, c) >= 0.8) {
      conjunto80 = { q: Math.round(q * 1000) / 1000, fecha: fechaDeDia(d), dias: d + 1, costo: c };
      break;
    }
  }
  let suma = 0;
  for (let i = 0; i < n; i++) suma += costo[i] as number;
  return {
    determinista,
    media: suma / n,
    p10: cuantilOrdenado(costoOrd, 0.1),
    p50: cuantilOrdenado(costoOrd, 0.5),
    p80: p80Costo,
    p90: cuantilOrdenado(costoOrd, 0.9),
    porIteracion: costo,
    jclP80: conjunta(p80Dia, p80Costo),
    jclPlan: conjunta(diaFin(finDeterminista), determinista),
    conjunto80,
  };
}

/** En un solo hilo, por bloques, cediendo entre bloques para no congelar el panel. */
export async function simularPlazo(
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
  op: OpcionesSimulacionPlazo,
): Promise<ResultadoSimulacionPlazo> {
  const p = prepararPlazo(c, riesgos, op);
  const acc = nuevoAcumulador(p);
  const N = Math.max(1, Math.floor(op.iteraciones));
  const B = bloquePlazo(p.n);
  let cancelada = false;
  for (let i0 = 0; i0 < N; i0 += B) {
    if (op.debeCancelar?.()) {
      cancelada = true;
      break;
    }
    simularTramo(p, acc, i0, Math.min(N, i0 + B));
    op.alAvanzar?.(acc.hechas, N);
    if (op.ceder) await op.ceder();
  }
  return resultadoPlazo(p, combinarAcumuladores(p, [acc]), cancelada);
}

/**
 * Lo mismo, repartido: `ejecutar` calcula un tramo en otro hilo (en el
 * navegador, un Web Worker) y devuelve su acumulador. Se lanzan hasta
 * `hilos` tramos a la vez; al cancelar, no se lanzan más y se combina lo
 * terminado. El resultado es **idéntico** al de `simularPlazo` con la misma
 * semilla (las iteraciones se numeran globalmente).
 */
export async function simularPlazoEnParalelo(
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
  op: OpcionesSimulacionPlazo,
  ejecutar: (tramo: { desde: number; hasta: number }) => Promise<AcumuladorPlazo>,
  hilos: number,
): Promise<ResultadoSimulacionPlazo> {
  const p = prepararPlazo(c, riesgos, op);
  const N = Math.max(1, Math.floor(op.iteraciones));
  const h = Math.max(1, Math.floor(hilos));
  // Tramos de unas cuatro rondas por hilo: reparto parejo y progreso visible.
  const tam = Math.max(bloquePlazo(p.n), Math.ceil(N / (h * 4)));
  const pendientes: Array<{ desde: number; hasta: number }> = [];
  for (let d = 0; d < N; d += tam) pendientes.push({ desde: d, hasta: Math.min(N, d + tam) });
  const hechos: AcumuladorPlazo[] = [];
  let hechas = 0;
  let cancelada = false;
  const trabajador = async () => {
    for (;;) {
      if (op.debeCancelar?.()) {
        cancelada = true;
        return;
      }
      const t = pendientes.shift();
      if (!t) return;
      const acc = await ejecutar(t);
      hechos.push(acc);
      hechas += acc.hechas;
      op.alAvanzar?.(hechas, N);
    }
  };
  await Promise.all(Array.from({ length: Math.min(h, pendientes.length) }, trabajador));
  // En el orden de las iteraciones, no en el que terminaron los hilos: así las
  // sumas (y sus redondeos) salen siempre iguales.
  hechos.sort((a, b) => (a.tramos[0]?.desde ?? 0) - (b.tramos[0]?.desde ?? 0));
  return resultadoPlazo(p, combinarAcumuladores(p, hechos), cancelada || hechas < N);
}

function cpmDeterminista(
  dur: readonly number[],
  orden: readonly number[],
  entrantes: ReadonlyArray<ReadonlyArray<{ p: number; t: number; r: number }>>,
  red: ParametrosRed,
  condicional: readonly number[],
  relojes?: readonly Reloj[],
): number {
  const es = new Float64Array(dur.length);
  let fin = 0;
  if (relojes) {
    // V7: con el reloj de cada actividad (las mismas reglas que `cpmConRelojes`).
    const ef = new Float64Array(dur.length);
    for (const s of orden) {
      const d = dur[s] as number;
      const rs = relojes[s] as Reloj;
      let v0 = red.minInicio[s] as number;
      if (!red.sinLogica[s]) {
        for (const { p, t, r } of entrantes[s] as Array<{ p: number; t: number; r: number }>) {
          if ((condicional[p] as number) >= 0) continue;
          const v = inicioPorRelacion(TIPO_TEXTO[t] as (typeof TIPO_TEXTO)[number], r, es[p] as number, ef[p] as number, relojes[p] as Reloj, rs, d);
          if (v > v0) v0 = v;
        }
        if ((red.minFin[s] as number) > -Infinity) v0 = Math.max(v0, rs.inicioParaFin(red.minFin[s] as number, d));
      }
      if (d > 0) v0 = rs.alinearInicio(v0);
      es[s] = v0;
      ef[s] = rs.avanzar(v0, d);
      if ((ef[s] as number) > fin) fin = ef[s] as number;
    }
    return fin;
  }
  for (const s of orden) {
    let v0 = red.minInicio[s] as number;
    const d = dur[s] as number;
    if (!red.sinLogica[s]) {
      for (const { p, t, r } of entrantes[s] as Array<{ p: number; t: number; r: number }>) {
        if ((condicional[p] as number) >= 0) continue; // las ramas no existen sin incertidumbre
        const dp = dur[p] as number;
        const v = t === 0 ? (es[p] as number) + dp + r : t === 1 ? (es[p] as number) + r : t === 2 ? (es[p] as number) + dp + r - d : (es[p] as number) + r - d;
        if (v > v0) v0 = v;
      }
      v0 = Math.max(v0, (red.minFin[s] as number) - d);
    }
    es[s] = v0;
    if (v0 + d > fin) fin = v0 + d;
  }
  return fin;
}

export interface ImpactoRiesgo {
  id: string;
  nombre: string;
  probabilidad: number;
  /** Días laborables que el P80 (y el P50) adelantan si este riesgo desapareciera. */
  diasP80: number;
  diasP50: number;
  /** Lo que el riesgo aporta al P80 del costo (si hay costos). */
  costoP80?: number;
}

/**
 * «Quitar un riesgo y volver a simular» (guía GAO‑16‑89G): para cada riesgo,
 * la misma simulación sin él. La diferencia en el P80 es lo que ese riesgo
 * aporta al plazo, **en días**, que es como se entiende en una reunión (un
 * tornado de coeficientes de correlación no lo entiende nadie). Con números
 * aleatorios comunes, la diferencia es estable aunque sea pequeña.
 *
 * También devuelve la simulación sin ningún riesgo: cuánto del plazo es
 * incertidumbre de las duraciones y cuánto son los riesgos.
 */
export async function impactoDeRiesgos(
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
  base: ResultadoSimulacionPlazo,
  op: OpcionesSimulacionPlazo,
  /** Cómo simular cada variante: por defecto en este hilo; el panel pasa la versión en paralelo. */
  simular: (c: Cronograma, r: readonly RiesgoPlazo[], o: OpcionesSimulacionPlazo) => Promise<ResultadoSimulacionPlazo> = simularPlazo,
): Promise<{ porRiesgo: ImpactoRiesgo[]; sinRiesgos: FechasPercentil & { diasP80: number; costoP80?: number } }> {
  const opciones = { ...op, iteraciones: base.iteraciones, alAvanzar: undefined };
  const porRiesgo: ImpactoRiesgo[] = [];
  for (const r of riesgos) {
    if (op.debeCancelar?.()) break;
    const sin = await simular(c, riesgos.filter((x) => x !== r), opciones);
    porRiesgo.push({
      id: r.id, nombre: r.nombre, probabilidad: r.probabilidad,
      diasP80: base.dias.p80 - sin.dias.p80,
      diasP50: base.dias.p50 - sin.dias.p50,
      ...(base.costos && sin.costos ? { costoP80: base.costos.p80 - sin.costos.p80 } : {}),
    });
    op.alAvanzar?.(porRiesgo.length, riesgos.length + 1);
  }
  const ninguno = await simular(c, [], opciones);
  porRiesgo.sort((a, b) => b.diasP80 - a.diasP80 || b.diasP50 - a.diasP50);
  return {
    porRiesgo,
    sinRiesgos: { ...ninguno.fechas, diasP80: ninguno.dias.p80, ...(ninguno.costos ? { costoP80: ninguno.costos.p80 } : {}) },
  };
}
