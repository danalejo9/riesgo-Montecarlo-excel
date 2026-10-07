/**
 * W7: escenarios «¿qué pasa si?». Cada escenario es una lista de cambios al
 * cronograma, a los riesgos o a los costos (acelerar una actividad, hacer dos
 * en paralelo, trabajar los sábados, quitar un riesgo, aplicar su
 * mitigación, mover el inicio…). Sin Office.js.
 *
 * Cada escenario se simula con **los mismos números aleatorios** que la base:
 * los flujos van ligados al id de cada actividad, riesgo, partida y mes del
 * clima, así que lo que no cambia sortea exactamente lo mismo. La diferencia
 * entre escenario y base en cada iteración es, entonces, solo la del cambio,
 * y se mide con mucha menos incertidumbre que comparando dos simulaciones
 * independientes (se enseñan los dos márgenes).
 *
 * Todo se compara en **fechas** (días naturales): trabajar los sábados o
 * mover el inicio cambia el calendario, y los días laborables de dos
 * calendarios distintos no se pueden restar.
 */

import { leerPredecesoras } from './sintaxis.ts';
import { compilarRed } from './red.ts';
import type { DistribucionDuracion, ModeloCronograma, RiesgoCronograma } from './modelo.ts';
import { percentilOrdenado, simularCronograma, type OpcionesSimulacion, type SimulacionCronograma } from './simulacion.ts';

export type TipoCambio =
  | 'duracion%' | 'duracionDias' | 'predecesoras' | 'valorPartida'
  | 'probabilidad' | 'impacto%' | 'quitarRiesgo' | 'respuesta'
  | 'sabados' | 'domingos' | 'inicio';

/** Cómo se escribe cada cambio en la columna «Cambio», a qué se aplica y qué valor lleva. */
export const CAMBIOS: readonly { tipo: TipoCambio; texto: string; sobre: 'actividad' | 'riesgo' | 'partida' | 'proyecto'; valor: string }[] = [
  { tipo: 'duracion%', texto: 'Duración en %', sobre: 'actividad', valor: '−20 % acorta una quinta parte (la duración base y su rango)' },
  { tipo: 'duracionDias', texto: 'Duración en días', sobre: 'actividad', valor: '−5 quita cinco días laborables (a la base y a su rango)' },
  { tipo: 'predecesoras', texto: 'Predecesoras', sobre: 'actividad', valor: 'las nuevas, como en el Gantt: «C CC+5» para empezar en paralelo' },
  { tipo: 'valorPartida', texto: 'Valor de la partida', sobre: 'partida', valor: 'el monto o la tarifa nuevos (más cuadrillas cuestan más); su rango se escala igual' },
  { tipo: 'probabilidad', texto: 'Probabilidad', sobre: 'riesgo', valor: 'la nueva, p. ej. 10 %' },
  { tipo: 'impacto%', texto: 'Impacto en %', sobre: 'riesgo', valor: '−50 % reduce a la mitad el impacto en días' },
  { tipo: 'quitarRiesgo', texto: 'Quitar riesgo', sobre: 'riesgo', valor: '(vacío)' },
  { tipo: 'respuesta', texto: 'Aplicar mitigación', sobre: 'riesgo', valor: '(vacío): usa la probabilidad y el % del impacto post, y paga la mitigación' },
  { tipo: 'sabados', texto: 'Trabajar sábados', sobre: 'proyecto', valor: 'Sí o No (en «Sobre», un calendario; vacío: todos)' },
  { tipo: 'domingos', texto: 'Trabajar domingos', sobre: 'proyecto', valor: 'Sí o No (en «Sobre», un calendario; vacío: todos)' },
  { tipo: 'inicio', texto: 'Inicio del proyecto', sobre: 'proyecto', valor: 'la fecha nueva' },
];

export interface Cambio {
  tipo: TipoCambio;
  /** Ids de actividades, riesgos o partidas, o el calendario (ya resueltos); vacío: todo el proyecto. */
  ids: string[];
  /** Número (porcentajes como proporción), texto (predecesoras) o 1/0 (sábados, domingos). */
  valor: number | string;
  /** Como lo enseña el panel: «Duración en % · −20 % · E». */
  texto: string;
}

export interface Escenario {
  nombre: string;
  cambios: Cambio[];
}

function escalarDist(d: DistribucionDuracion, f: (x: number) => number): DistribucionDuracion {
  switch (d.tipo) {
    case 'triangular': case 'pert': return { ...d, min: f(d.min), moda: f(d.moda), max: f(d.max) };
    case 'trigen': return { ...d, bajo: f(d.bajo), moda: f(d.moda), alto: f(d.alto) };
    case 'uniforme': return { ...d, min: f(d.min), max: f(d.max) };
    case 'lognormal': return { ...d, media: f(d.media) };
    case 'discreta': return { ...d, valores: d.valores.map(f) };
    case 'fija': return { ...d, valor: f(d.valor) };
  }
}

/** El modelo con los cambios del escenario. No toca el original. Lanza un error legible si un cambio no se puede aplicar. */
export function aplicarEscenario(modelo: ModeloCronograma, e: Escenario): ModeloCronograma {
  let actividades = modelo.red.actividades.map((a) => ({ ...a }));
  let calendarios = modelo.red.calendarios.map((c) => ({ ...c }));
  let inicio = modelo.red.inicio;
  let incertidumbre = modelo.incertidumbre.map((i) => ({ ...i }));
  let riesgos: RiesgoCronograma[] = modelo.riesgos.map((r) => ({ ...r }));
  let costos = (modelo.costos ?? []).map((c) => ({ ...c }));
  for (const x of e.cambios) {
    const v = typeof x.valor === 'number' ? x.valor : NaN;
    const enActividades = (f: (d: number) => number, soloConDuracion: boolean) => {
      actividades = actividades.map((a) => (x.ids.includes(a.id) && (!soloConDuracion || a.duracion > 0) ? { ...a, duracion: Math.max(0, f(a.duracion)) } : a));
      // El rango propio en días se mueve igual; el relativo (% de la base) ya sigue a la base.
      incertidumbre = incertidumbre.map((i) => (!i.selector && x.ids.includes(i.actividad) && !i.relativa ? { ...i, distribucion: escalarDist(i.distribucion, (d) => Math.max(0, f(d))) } : i));
    };
    const enRiesgos = (f: (r: RiesgoCronograma) => RiesgoCronograma | null) => {
      riesgos = riesgos.flatMap((r) => (x.ids.includes(r.id) ? (f(r) ?? []) : [r]));
    };
    switch (x.tipo) {
      case 'duracion%': enActividades((d) => d * (1 + v), false); break;
      case 'duracionDias': enActividades((d) => d + v, true); break;
      case 'predecesoras': {
        const p = leerPredecesoras(String(x.valor));
        if (!p.ok) throw new Error(`«${e.nombre}»: ${p.error}`);
        actividades = actividades.map((a) => (x.ids.includes(a.id) ? { ...a, predecesoras: p.predecesoras } : a));
        break;
      }
      case 'valorPartida':
        costos = costos.map((c) => {
          if (!x.ids.includes(c.id)) return c;
          const k = c.valor !== 0 ? v / c.valor : 1;
          return { ...c, valor: v, ...(c.distribucion ? { distribucion: escalarDist(c.distribucion, (y) => y * k) } : {}) };
        });
        break;
      case 'probabilidad': enRiesgos((r) => ({ ...r, probabilidad: v })); break;
      case 'impacto%': enRiesgos((r) => ({ ...r, impactos: r.impactos.map((i) => (i.dias ? { ...i, dias: escalarDist(i.dias, (d) => d * (1 + v)) } : i)) })); break;
      // Quitar un riesgo no mueve los números de los demás: cada uno sortea con su propio flujo.
      case 'quitarRiesgo': enRiesgos(() => null); break;
      case 'respuesta':
        enRiesgos((r) => {
          const f = r.factorImpactoPost ?? 1;
          if (r.costoMitigacion) costos = [...costos, { id: `mitigación ${r.id}`, nombre: `Mitigación de ${r.id}`, tipo: 'fijo', valor: r.costoMitigacion }];
          // Ya mitigado: sin datos post (no se mitiga dos veces).
          const resto: RiesgoCronograma = { ...r };
          delete resto.probabilidadPost;
          delete resto.factorImpactoPost;
          delete resto.costoMitigacion;
          return {
            ...resto,
            probabilidad: r.probabilidadPost ?? r.probabilidad,
            impactos: r.impactos.map((i) => ({
              ...i,
              ...(i.dias ? { dias: escalarDist(i.dias, (d) => d * f) } : {}),
              ...(i.costo ? { costo: escalarDist(i.costo, (c) => c * f) } : {}),
            })),
          };
        });
        break;
      case 'sabados':
      case 'domingos':
        calendarios = calendarios.map((c) => {
          if (x.ids.length && !x.ids.includes(c.id)) return c;
          const lab = [...c.laborables];
          lab[x.tipo === 'sabados' ? 5 : 6] = v === 1;
          return { ...c, laborables: lab };
        });
        break;
      case 'inicio': inicio = v; break;
    }
  }
  return {
    ...modelo,
    red: { ...modelo.red, inicio, calendarios, actividades },
    incertidumbre,
    riesgos,
    ...(costos.length ? { costos } : {}),
  };
}

export interface ResultadoEscenario {
  nombre: string;
  cambios: string[];
  /** P50 y P80 del fin (números de serie). */
  p50: number;
  p80: number;
  /** Días naturales que adelanta el P50 y el P80 (negativo: los retrasa). */
  adelantoP50: number;
  adelantoP80: number;
  /** Adelanto medio del fin, iteración a iteración (días naturales), y la mitad de su intervalo al 95 %. */
  adelantoMedio: number;
  ic95: number;
  /** El mismo intervalo si las dos simulaciones usaran números independientes (para comparar). */
  ic95Independientes: number;
  /** Proporción de iteraciones en que el escenario termina antes, igual o después que la base. */
  probAntes: number;
  probIgual: number;
  probDespues: number;
  /** P(cumplir la fecha meta), si la hay. */
  probMeta: number | null;
  /** Costo P80 y cuánto baja frente a la base (negativo: sube), si hay costos. */
  costoP80: number | null;
  ahorroCostoP80: number | null;
  /** Probabilidad de cumplir cada hito contractual. */
  hitos: { id: string; probabilidad: number }[];
}

export interface ComparacionEscenarios {
  iteraciones: number;
  semilla: number;
  base: Omit<ResultadoEscenario, 'nombre' | 'cambios' | 'adelantoP50' | 'adelantoP80' | 'adelantoMedio' | 'ic95' | 'ic95Independientes' | 'probAntes' | 'probIgual' | 'probDespues' | 'ahorroCostoP80'>;
  escenarios: ResultadoEscenario[];
  /** Escenarios que no se pudieron calcular (un ciclo al cambiar predecesoras…), con la causa. */
  problemas: string[];
}

function fechaConConfianza(o: Float64Array, p: number): number {
  return Math.floor(o[Math.min(o.length - 1, Math.max(0, Math.ceil(p * o.length) - 1))] as number);
}

function mediaVar(x: ArrayLike<number>): [number, number] {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] as number;
  const m = s / Math.max(1, x.length);
  let q = 0;
  for (let i = 0; i < x.length; i++) q += ((x[i] as number) - m) ** 2;
  return [m, q / Math.max(1, x.length - 1)];
}

function resumen(sim: SimulacionCronograma, fechaMeta: number | undefined) {
  const o = Float64Array.from(sim.fin.serie).sort();
  const c = sim.costo ? Float64Array.from(sim.costo).sort() : null;
  let meta = 0;
  if (fechaMeta !== undefined) for (let i = 0; i < o.length; i++) if ((o[i] as number) <= fechaMeta) meta++;
  return {
    p50: fechaConConfianza(o, 0.5),
    p80: fechaConConfianza(o, 0.8),
    probMeta: fechaMeta === undefined ? null : meta / o.length,
    costoP80: c ? percentilOrdenado(c, 0.8) : null,
    hitos: sim.contractuales.map((h) => ({ id: h.id, probabilidad: [...h.serie].filter((f) => f <= h.hito.fecha).length / h.serie.length })),
  };
}

/** Compara un escenario con la base; los dos con la misma semilla e iteraciones. */
export function compararConBase(nombre: string, cambios: string[], base: SimulacionCronograma, sim: SimulacionCronograma, fechaMeta?: number): ResultadoEscenario {
  const n = Math.min(base.fin.serie.length, sim.fin.serie.length);
  const d = new Float64Array(n);
  let antes = 0;
  let igual = 0;
  for (let i = 0; i < n; i++) {
    d[i] = (base.fin.serie[i] as number) - (sim.fin.serie[i] as number);
    if ((d[i] as number) > 0) antes++;
    else if (d[i] === 0) igual++;
  }
  const [m, v] = mediaVar(d);
  const [, vb] = mediaVar(base.fin.serie);
  const [, ve] = mediaVar(sim.fin.serie);
  const ic = (x: number) => 1.96 * Math.sqrt(x / Math.max(1, n));
  const rb = resumen(base, fechaMeta);
  const re = resumen(sim, fechaMeta);
  return {
    nombre, cambios, ...re,
    adelantoP50: rb.p50 - re.p50,
    adelantoP80: rb.p80 - re.p80,
    adelantoMedio: m,
    ic95: ic(v),
    ic95Independientes: ic(vb + ve),
    probAntes: antes / Math.max(1, n),
    probIgual: igual / Math.max(1, n),
    probDespues: (n - antes - igual) / Math.max(1, n),
    ahorroCostoP80: rb.costoP80 !== null && re.costoP80 !== null ? rb.costoP80 - re.costoP80 : null,
  };
}

/**
 * Simula la base y cada escenario con la misma semilla y las mismas
 * iteraciones (las automáticas se fijan en las de la base). Solo la corrida
 * principal de cada uno: el tornado no hace falta para comparar.
 */
export async function compararEscenarios(modelo: ModeloCronograma, escenarios: readonly Escenario[], opciones: OpcionesSimulacion = {}): Promise<ComparacionEscenarios> {
  const total = escenarios.length + 1;
  let hechas = 0;
  const progreso = (h: number, t: number) => opciones.progreso?.(hechas * t + h, total * t, t);
  const base = await simularCronograma(modelo, { ...opciones, soloPrincipal: true, progreso });
  hechas++;
  const fijo: ModeloCronograma = { ...modelo, configuracion: { ...modelo.configuracion, iteraciones: base.iteraciones, iteracionesAutomaticas: false } };
  const meta = modelo.configuracion.fechaMeta;
  const out: ResultadoEscenario[] = [];
  const problemas: string[] = [];
  for (const e of escenarios) {
    let m: ModeloCronograma;
    try {
      m = aplicarEscenario(fijo, e);
      compilarRed(m.red);
    } catch (err) {
      problemas.push(`«${e.nombre}» no se puede calcular: ${(err as Error).message}`);
      hechas++;
      continue;
    }
    const sim = await simularCronograma(m, { ...opciones, soloPrincipal: true, progreso });
    hechas++;
    out.push(compararConBase(e.nombre, e.cambios.map((c) => c.texto), base, sim, meta));
  }
  return { iteraciones: base.iteraciones, semilla: modelo.configuracion.semilla, base: resumen(base, meta), escenarios: out, problemas };
}

/** Una frase por escenario, para el panel, la hoja y el informe. */
export function narrativaEscenarios(c: ComparacionEscenarios, fecha: (serie: number) => string): string[] {
  const pct = (x: number) => `${Math.round(x * 100)} %`;
  return c.escenarios.map((e) => {
    const dias = Math.round(e.adelantoP80);
    const efecto = dias > 0 ? `adelanta el P80 ${dias} días (del ${fecha(c.base.p80)} al ${fecha(e.p80)})`
      : dias < 0 ? `retrasa el P80 ${-dias} días (del ${fecha(c.base.p80)} al ${fecha(e.p80)})`
        : `no mueve el P80 (${fecha(e.p80)})`;
    const cuando = e.probAntes >= 0.005 || e.probDespues >= 0.005
      ? `; termina antes que la base en el ${pct(e.probAntes)} de las iteraciones${e.probDespues >= 0.005 ? ` y después en el ${pct(e.probDespues)}` : ''}`
      : '';
    const costo = e.ahorroCostoP80 !== null && Math.abs(e.ahorroCostoP80) >= 1
      ? `; el costo P80 ${e.ahorroCostoP80 > 0 ? 'baja' : 'sube'} ${Math.round(Math.abs(e.ahorroCostoP80)).toLocaleString('es-CO')}` : '';
    return `«${e.nombre}» ${efecto}${cuando}${costo}.`;
  });
}
