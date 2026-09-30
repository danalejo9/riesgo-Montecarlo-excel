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
import { muestreadorDuracion } from './muestreo.ts';
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

/** Cuenta cuántas veces cae cada día (entero ≥ 0). Crece solo. */
class ContadorDias {
  cuentas = new Uint32Array(64);
  total = 0;
  add(dia: number): void {
    const d = dia < 0 ? 0 : dia;
    if (d >= this.cuentas.length) {
      let n = this.cuentas.length;
      while (n <= d) n *= 2;
      const nuevo = new Uint32Array(n);
      nuevo.set(this.cuentas);
      this.cuentas = nuevo;
    }
    this.cuentas[d] = (this.cuentas[d] as number) + 1;
    this.total++;
  }
  /** El primer día con acumulado ≥ p. */
  cuantil(p: number): number {
    const objetivo = Math.max(1, Math.ceil(p * this.total - 1e-9));
    let acum = 0;
    for (let d = 0; d < this.cuentas.length; d++) {
      acum += this.cuentas[d] as number;
      if (acum >= objetivo) return d;
    }
    return this.cuentas.length - 1;
  }
  hasta(dia: number): number {
    let acum = 0;
    for (let d = 0; d <= dia && d < this.cuentas.length; d++) acum += this.cuentas[d] as number;
    return this.total === 0 ? NaN : acum / this.total;
  }
}

/** Día (índice laborable) en que se enseña un fin temprano `f`; ver `IndiceLaborable.fechaFin`. */
const diaFin = (f: number) => Math.max(0, Math.ceil(f - 1e-9) - 1);
/** Día en que se enseña un inicio temprano `s`; los hitos, como su fin. */
const diaInicio = (s: number, d: number) => (d === 0 ? diaFin(s) : Math.floor(s + 1e-9));

const TIPO = { FS: 0, SS: 1, FF: 2, SF: 3 } as const;

export async function simularPlazo(
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
  op: OpcionesSimulacionPlazo,
): Promise<ResultadoSimulacionPlazo> {
  const acts = c.actividades;
  const n = acts.length;
  const red = resolverRed(acts);
  if (!red.ok) throw new Error(red.problemas.map((p) => p.mensaje).join('; '));
  const { orden, enCiclo } = ordenTopologico(n, red.preds);
  if (enCiclo.length > 0) throw new Error('El cronograma tiene una dependencia circular');

  const cal = new IndiceLaborable(c.calendario, c.inicio);
  const indice = new Map(acts.map((a, i) => [a.id, i]));
  const N = Math.max(1, Math.floor(op.iteraciones));
  const B = Math.max(16, Math.min(2048, Math.floor(2_000_000 / Math.max(1, n))));

  // La red en arreglos planos: relaciones entrantes y salientes de cada actividad.
  const entrantes = acts.map((a) => a.predecesoras.map((r) => ({ p: indice.get(r.predecesora) as number, t: TIPO[r.tipo], r: r.retardo })));
  const salientes: Array<Array<{ s: number; t: number; r: number }>> = acts.map(() => []);
  entrantes.forEach((lista, s) => lista.forEach(({ p, t, r }) => (salientes[p] as Array<{ s: number; t: number; r: number }>).push({ s, t, r })));
  const minInicio = acts.map((a) => (a.inicioNoAntesDe === undefined ? 0 : cal.indiceDesde(a.inicioNoAntesDe)));

  const dists = acts.map((a) => (a.tresPuntos ? muestreadorDuracion(a.tresPuntos.min, a.tresPuntos.masProbable, a.tresPuntos.max, op.forma) : null));
  const fijas = acts.map((a) => (a.tresPuntos && !(a.tresPuntos.max > a.tresPuntos.min) ? a.tresPuntos.masProbable : a.duracion));
  const flujos = acts.map((a) => streamOf(`plazo:${a.id}`));

  const rs = riesgos.map((r) => ({
    r,
    ocurre: streamOf(`riesgo-plazo:${r.id}#ocurre`),
    impacto: streamOf(`riesgo-plazo:${r.id}#impacto`),
    dist: muestreadorDuracion(r.impactoMin, r.impactoMasProbable, r.impactoMax, 'pert'),
    afectadas: r.actividades.map((id) => indice.get(id)).filter((i): i is number => i !== undefined),
    veces: 0,
  }));

  const dur = new Float64Array(n * B);
  const es = new Float64Array(n * B);
  const lf = new Float64Array(n * B);
  const fin = new Float64Array(B);
  const finProyecto = new Float64Array(N);

  const critica = new Float64Array(n);
  const sx = new Float64Array(n);
  const sxx = new Float64Array(n);
  const sxy = new Float64Array(n);
  let sy = 0;
  let syy = 0;
  const cuentaFin = new ContadorDias();
  const iniciosAct = acts.map(() => new ContadorDias());
  const finesAct = acts.map(() => new ContadorDias());
  let hechas = 0;
  let cancelada = false;

  for (let i0 = 0; i0 < N; i0 += B) {
    if (op.debeCancelar?.()) {
      cancelada = true;
      break;
    }
    const b = Math.min(B, N - i0);

    // 1. Duraciones.
    for (let a = 0; a < n; a++) {
      const base = a * B;
      const dist = dists[a];
      if (dist) {
        const flujo = flujos[a] as number;
        for (let k = 0; k < b; k++) dur[base + k] = dist.muestra(op.semilla, flujo, i0 + k);
      } else {
        const v = fijas[a] as number;
        for (let k = 0; k < b; k++) dur[base + k] = v;
      }
    }
    // 2. Riesgos de plazo: un sorteo por riesgo e iteración, el mismo para todas sus actividades.
    for (const x of rs) {
      for (let k = 0; k < b; k++) {
        if (uniformAt(op.semilla, x.ocurre, i0 + k) >= x.r.probabilidad) continue;
        x.veces++;
        const f = 1 + (x.dist ? x.dist.muestra(op.semilla, x.impacto, i0 + k) : x.r.impactoMasProbable);
        for (const a of x.afectadas) dur[a * B + k] = (dur[a * B + k] as number) * f;
      }
    }
    // 3. Adelante.
    fin.fill(0);
    for (const s of orden) {
      const bs = s * B;
      const m0 = minInicio[s] as number;
      for (let k = 0; k < b; k++) es[bs + k] = m0;
      // El tipo de relación, fuera del bucle interno: cuatro bucles planos.
      for (const { p, t, r } of entrantes[s] as Array<{ p: number; t: number; r: number }>) {
        const bp = p * B;
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
      const p = orden[o] as number;
      const bp = p * B;
      for (let k = 0; k < b; k++) lf[bp + k] = fin[k] as number;
      for (const { s, t, r } of salientes[p] as Array<{ s: number; t: number; r: number }>) {
        const bs = s * B;
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
    for (let k = 0; k < b; k++) {
      const y = fin[k] as number;
      finProyecto[i0 + k] = y;
      cuentaFin.add(diaFin(y));
      sy += y;
      syy += y * y;
    }
    for (let a = 0; a < n; a++) {
      const ba = a * B;
      const ini = iniciosAct[a] as ContadorDias;
      const fi = finesAct[a] as ContadorDias;
      let crit = 0;
      let x1 = 0;
      let x2 = 0;
      let xy = 0;
      for (let k = 0; k < b; k++) {
        const d = dur[ba + k] as number;
        const e = es[ba + k] as number;
        if ((lf[ba + k] as number) - d - e < 1e-9) crit++;
        ini.add(diaInicio(e, d));
        fi.add(diaFin(e + d));
        x1 += d;
        x2 += d * d;
        xy += d * (fin[k] as number);
      }
      critica[a] = (critica[a] as number) + crit;
      sx[a] = (sx[a] as number) + x1;
      sxx[a] = (sxx[a] as number) + x2;
      sxy[a] = (sxy[a] as number) + xy;
    }
    hechas += b;
    op.alAvanzar?.(hechas, N);
    if (op.ceder) await op.ceder();
  }

  const M = Math.max(1, hechas);
  const fechaDia = (d: number) => cal.fechaDeIndice(d);
  const cuantiles = (cont: ContadorDias): FechasPercentil => ({
    p10: fechaDia(cont.cuantil(0.1)), p50: fechaDia(cont.cuantil(0.5)), p80: fechaDia(cont.cuantil(0.8)), p90: fechaDia(cont.cuantil(0.9)),
  });

  // Determinista, con las duraciones tal como están en la hoja.
  const det = cpmDeterminista(acts.map((a) => a.duracion), orden, entrantes, minInicio);

  const histograma: ResultadoSimulacionPlazo['histograma'] = [];
  cuentaFin.cuentas.forEach((cuenta, dia) => {
    if (cuenta > 0) histograma.push({ dia, fecha: fechaDia(dia), cuenta });
  });

  const media = sy / M;
  const varY = syy / M - media * media;
  const actividades: ActividadSimulada[] = acts.map((a, i) => {
    const mx = (sx[i] as number) / M;
    const vx = (sxx[i] as number) / M - mx * mx;
    const cov = (sxy[i] as number) / M - mx * media;
    const correlacion = vx > 1e-12 && varY > 1e-12 ? cov / Math.sqrt(vx * varY) : NaN;
    return {
      id: a.id,
      nombre: a.nombre,
      criticidad: (critica[i] as number) / M,
      correlacion,
      inicio: cuantiles(iniciosAct[i] as ContadorDias),
      fin: cuantiles(finesAct[i] as ContadorDias),
    };
  });

  return {
    iteraciones: hechas,
    semilla: op.semilla,
    forma: op.forma,
    cancelada,
    finProyecto: hechas < N ? finProyecto.slice(0, hechas) : finProyecto,
    fechas: cuantiles(cuentaFin),
    dias: {
      p10: cuentaFin.cuantil(0.1) + 1, p50: cuentaFin.cuantil(0.5) + 1, p80: cuentaFin.cuantil(0.8) + 1, p90: cuentaFin.cuantil(0.9) + 1,
    },
    mediaDias: media,
    determinista: { dias: det, fecha: fechaDia(diaFin(det)) },
    probDeterminista: cuentaFin.hasta(diaFin(det)),
    curvaS: Array.from({ length: 20 }, (_, j) => {
      const p = (j + 1) / 20;
      return { p, fecha: fechaDia(cuentaFin.cuantil(p)) };
    }),
    histograma,
    actividades,
    riesgos: rs.map((x) => ({ id: x.r.id, nombre: x.r.nombre, probabilidad: x.r.probabilidad, ocurrio: x.veces / M })),
  };
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
): Promise<{ porRiesgo: ImpactoRiesgo[]; sinRiesgos: FechasPercentil & { diasP80: number } }> {
  const opciones = { ...op, iteraciones: base.iteraciones, alAvanzar: undefined };
  const porRiesgo: ImpactoRiesgo[] = [];
  for (const r of riesgos) {
    if (op.debeCancelar?.()) break;
    const sin = await simularPlazo(c, riesgos.filter((x) => x !== r), opciones);
    porRiesgo.push({
      id: r.id, nombre: r.nombre, probabilidad: r.probabilidad,
      diasP80: base.dias.p80 - sin.dias.p80,
      diasP50: base.dias.p50 - sin.dias.p50,
    });
    op.alAvanzar?.(porRiesgo.length, riesgos.length + 1);
  }
  const ninguno = await simularPlazo(c, [], opciones);
  porRiesgo.sort((a, b) => b.diasP80 - a.diasP80 || b.diasP50 - a.diasP50);
  return { porRiesgo, sinRiesgos: { ...ninguno.fechas, diasP80: ninguno.dias.p80 } };
}
