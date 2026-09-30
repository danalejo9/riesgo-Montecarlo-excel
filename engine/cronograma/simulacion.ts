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
import { muestreadorDuracion, type Muestreador } from './muestreo.ts';
import type { RiesgoPlazo } from './riesgos.ts';
import type { Cronograma } from './tipos.ts';

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
  dists: Array<Muestreador | null>;
  fijas: number[];
  duraciones: number[];
  flujos: number[];
  riesgos: Array<{ r: RiesgoPlazo; ocurre: number; impacto: number; dist: Muestreador | null; afectadas: number[] }>;
  semilla: number;
  cal: IndiceLaborable;
  actividades: Array<{ id: string; nombre: string }>;
  forma: FormaDuracion;
  /** Memoria de trabajo de un bloque, reservada una vez y reutilizada. */
  trabajo?: { dur: Float64Array; es: Float64Array; lf: Float64Array; fin: Float64Array };
}

export function prepararPlazo(c: Cronograma, riesgos: readonly RiesgoPlazo[], op: { semilla: number; forma: FormaDuracion }): PlazoPreparado {
  const acts = c.actividades;
  const n = acts.length;
  const red = resolverRed(acts);
  if (!red.ok) throw new Error(red.problemas.map((p) => p.mensaje).join('; '));
  const { orden, enCiclo } = ordenTopologico(n, red.preds);
  if (enCiclo.length > 0) throw new Error('El cronograma tiene una dependencia circular');
  const cal = new IndiceLaborable(c.calendario, c.inicio);
  const indice = new Map(acts.map((a, i) => [a.id, i]));
  const entrantes = acts.map((a) => a.predecesoras.map((r) => ({ p: indice.get(r.predecesora) as number, t: TIPO[r.tipo], r: r.retardo })));
  const salientes: RelSal[][] = acts.map(() => []);
  entrantes.forEach((lista, s2) => lista.forEach(({ p, t, r }) => (salientes[p] as RelSal[]).push({ s: s2, t, r })));
  return {
    n,
    orden,
    entrantes,
    salientes,
    minInicio: acts.map((a) => (a.inicioNoAntesDe === undefined ? 0 : cal.indiceDesde(a.inicioNoAntesDe))),
    dists: acts.map((a) => (a.tresPuntos ? muestreadorDuracion(a.tresPuntos.min, a.tresPuntos.masProbable, a.tresPuntos.max, op.forma) : null)),
    fijas: acts.map((a) => (a.tresPuntos && !(a.tresPuntos.max > a.tresPuntos.min) ? a.tresPuntos.masProbable : a.duracion)),
    duraciones: acts.map((a) => a.duracion),
    flujos: acts.map((a) => streamOf(`plazo:${a.id}`)),
    riesgos: riesgos.map((r) => ({
      r,
      ocurre: streamOf(`riesgo-plazo:${r.id}#ocurre`),
      impacto: streamOf(`riesgo-plazo:${r.id}#impacto`),
      dist: muestreadorDuracion(r.impactoMin, r.impactoMasProbable, r.impactoMax, 'pert'),
      afectadas: r.actividades.map((id) => indice.get(id)).filter((i): i is number => i !== undefined),
    })),
    semilla: op.semilla,
    cal,
    actividades: acts.map((a) => ({ id: a.id, nombre: a.nombre })),
    forma: op.forma,
  };
}

/**
 * Lo que acumula un tramo de iteraciones. Datos planos (arreglos tipados)
 * para mandarlo entre hilos; varios se suman con `combinarAcumuladores`.
 */
export interface AcumuladorPlazo {
  hechas: number;
  /** Fin del proyecto por iteración, con la iteración en la que empieza cada tramo. */
  tramos: Array<{ desde: number; fin: Float64Array }>;
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
  p.trabajo ??= { dur: new Float64Array(n * B), es: new Float64Array(n * B), lf: new Float64Array(n * B), fin: new Float64Array(B) };
  const { dur, es, lf, fin } = p.trabajo;
  const finTramo = new Float64Array(Math.max(0, hasta - desde));

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
    p.riesgos.forEach((x, j) => {
      for (let k = 0; k < b; k++) {
        if (uniformAt(semilla, x.ocurre, i0 + k) >= x.r.probabilidad) continue;
        acc.veces[j] = (acc.veces[j] as number) + 1;
        const f = 1 + (x.dist ? x.dist.muestra(semilla, x.impacto, i0 + k) : x.r.impactoMasProbable);
        for (const a of x.afectadas) dur[a * B + k] = (dur[a * B + k] as number) * f;
      }
    });
    // 3. Adelante. El tipo de relación, fuera del bucle interno: cuatro bucles planos.
    fin.fill(0);
    for (const s2 of orden) {
      const bs = s2 * B;
      const m0 = minInicio[s2] as number;
      for (let k = 0; k < b; k++) es[bs + k] = m0;
      for (const { p: pr, t, r } of entrantes[s2] as Rel[]) {
        const bp = pr * B;
        if (t === 0) {
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
      for (let k = 0; k < b; k++) {
        const ef = (es[bs + k] as number) + (dur[bs + k] as number);
        if (ef > (fin[k] as number)) fin[k] = ef;
      }
    }
    // 4. Atrás.
    for (let o = orden.length - 1; o >= 0; o--) {
      const pr = orden[o] as number;
      const bp = pr * B;
      for (let k = 0; k < b; k++) lf[bp + k] = fin[k] as number;
      for (const { s: s2, t, r } of salientes[pr] as RelSal[]) {
        const bs = s2 * B;
        if (t === 0) {
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
      let crit = 0;
      let x1 = 0;
      let x2 = 0;
      let xy = 0;
      for (let k = 0; k < b; k++) {
        const d = dur[ba + k] as number;
        const e = es[ba + k] as number;
        if ((lf[ba + k] as number) - d - e < 1e-9) crit++;
        contar(ini, diaInicio(e, d));
        contar(fi, diaFin(e + d));
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
  acc.tramos.push({ desde, fin: finTramo });
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
  acc.tramos.forEach((t) => agregar(t.fin));
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
  const det = cpmDeterminista(p.duraciones, p.orden, p.entrantes, p.minInicio);

  const finProyecto = new Float64Array(acc.hechas);
  let k = 0;
  for (const t of [...acc.tramos].sort((a, b) => a.desde - b.desde)) {
    finProyecto.set(t.fin, k);
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
  return resultadoPlazo(p, combinarAcumuladores(p, hechos), cancelada || hechas < N);
}

function cpmDeterminista(
  dur: readonly number[],
  orden: readonly number[],
  entrantes: ReadonlyArray<ReadonlyArray<{ p: number; t: number; r: number }>>,
  minInicio: readonly number[],
): number {
  const es = new Float64Array(dur.length);
  let fin = 0;
  for (const s of orden) {
    let v0 = minInicio[s] as number;
    const d = dur[s] as number;
    for (const { p, t, r } of entrantes[s] as Array<{ p: number; t: number; r: number }>) {
      const dp = dur[p] as number;
      const v = t === 0 ? (es[p] as number) + dp + r : t === 1 ? (es[p] as number) + r : t === 2 ? (es[p] as number) + dp + r - d : (es[p] as number) + r - d;
      if (v > v0) v0 = v;
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
): Promise<{ porRiesgo: ImpactoRiesgo[]; sinRiesgos: FechasPercentil & { diasP80: number } }> {
  const opciones = { ...op, iteraciones: base.iteraciones, alAvanzar: undefined };
  const porRiesgo: ImpactoRiesgo[] = [];
  for (const r of riesgos) {
    if (op.debeCancelar?.()) break;
    const sin = await simular(c, riesgos.filter((x) => x !== r), opciones);
    porRiesgo.push({
      id: r.id, nombre: r.nombre, probabilidad: r.probabilidad,
      diasP80: base.dias.p80 - sin.dias.p80,
      diasP50: base.dias.p50 - sin.dias.p50,
    });
    op.alAvanzar?.(porRiesgo.length, riesgos.length + 1);
  }
  const ninguno = await simular(c, [], opciones);
  porRiesgo.sort((a, b) => b.diasP80 - a.diasP80 || b.diasP50 - a.diasP50);
  return { porRiesgo, sinRiesgos: { ...ninguno.fechas, diasP80: ninguno.dias.p80 } };
}
