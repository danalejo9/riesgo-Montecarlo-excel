/**
 * W7: escenarios «¿qué pasa si?». La hoja «Escenarios» describe cambios al
 * cronograma o a los riesgos (acelerar una actividad, hacer dos en paralelo,
 * trabajar los sábados, quitar un riesgo, aplicar una respuesta, mover el
 * inicio…), agrupados por escenario. Cada escenario se simula con **los
 * mismos números aleatorios** que la base: los flujos van ligados al ID de
 * cada actividad y riesgo, así que lo que no cambia sortea exactamente lo
 * mismo. La diferencia entre escenario y base en cada iteración es, entonces,
 * solo la del cambio, y se mide con mucha menos incertidumbre que comparando
 * dos simulaciones independientes (se enseñan los dos márgenes).
 *
 * Todo se compara en **fechas** (días naturales): trabajar los sábados o
 * mover el inicio cambia el calendario, y los días laborables de dos
 * calendarios distintos no se pueden restar. Sin Office.js.
 */

import { calcularCPM } from './cpm.ts';
import { FORMATO_FECHA, type HojaAEscribir } from './hojas.ts';
import { leerHojaGenerica, normalizar, numeroDe } from './lectorTabla.ts';
import { leerPredecesoras } from './predecesoras.ts';
import { riesgosDespues, type RiesgoPlazo } from './riesgos.ts';
import { simularPlazo, type OpcionesSimulacionPlazo, type ResultadoSimulacionPlazo } from './simulacion.ts';
import type { Actividad, Cronograma, ProblemaCronograma } from './tipos.ts';

export const HOJA_ESCENARIOS = 'Escenarios';
export const HOJA_RESULTADO_ESCENARIOS = 'Cronograma (escenarios)';

export type TipoCambio =
  | 'duracion%' | 'duracionDias' | 'predecesoras' | 'costoDia'
  | 'probabilidad' | 'impacto%' | 'quitarRiesgo' | 'respuesta'
  | 'sabados' | 'domingos' | 'inicio';

/** Cómo se escribe cada cambio en la columna «Cambio» y a qué se aplica. */
export const CAMBIOS: ReadonlyArray<{ tipo: TipoCambio; texto: string; sobre: 'actividad' | 'riesgo' | 'proyecto'; valor: string }> = [
  { tipo: 'duracion%', texto: 'Duración en %', sobre: 'actividad', valor: '−20 % acorta una quinta parte (mínimo, más probable y máximo)' },
  { tipo: 'duracionDias', texto: 'Duración en días', sobre: 'actividad', valor: '−5 quita cinco días laborables (a los tres puntos)' },
  { tipo: 'predecesoras', texto: 'Predecesoras', sobre: 'actividad', valor: 'las nuevas, p. ej. «8CC+5» para empezar en paralelo' },
  { tipo: 'costoDia', texto: 'Costo por día', sobre: 'actividad', valor: 'el costo por día nuevo (más cuadrillas cuestan más)' },
  { tipo: 'probabilidad', texto: 'Probabilidad', sobre: 'riesgo', valor: 'la nueva, p. ej. 10 %' },
  { tipo: 'impacto%', texto: 'Impacto en %', sobre: 'riesgo', valor: '−50 % reduce a la mitad el impacto' },
  { tipo: 'quitarRiesgo', texto: 'Quitar riesgo', sobre: 'riesgo', valor: '(vacío)' },
  { tipo: 'respuesta', texto: 'Aplicar respuesta', sobre: 'riesgo', valor: '(vacío): usa los valores «después» y paga la respuesta' },
  { tipo: 'sabados', texto: 'Trabajar sábados', sobre: 'proyecto', valor: 'Sí o No' },
  { tipo: 'domingos', texto: 'Trabajar domingos', sobre: 'proyecto', valor: 'Sí o No' },
  { tipo: 'inicio', texto: 'Inicio del proyecto', sobre: 'proyecto', valor: 'la fecha nueva' },
];

export interface Cambio {
  tipo: TipoCambio;
  /** IDs de actividades o riesgos (ya resueltos); vacío en los del proyecto. */
  ids: string[];
  valor: number | string;
  /** Como lo enseña el panel: «Duración en % −20 % · 7». */
  texto: string;
}

export interface Escenario {
  nombre: string;
  cambios: Cambio[];
}

const tipoDe = (t: string): TipoCambio | undefined => {
  const n = normalizar(t);
  return CAMBIOS.find((c) => n.startsWith(normalizar(c.texto)))?.tipo;
};

/** 0,2, 20 o «20 %» → 0,2: los porcentajes se escriben de las tres formas. */
function porcentaje(v: unknown): number | undefined {
  if (typeof v === 'string') {
    const m = /^\s*([-−]?\d+(?:[.,]\d+)?)\s*%\s*$/.exec(v);
    if (m) return Number((m[1] as string).replace('−', '-').replace(',', '.')) / 100;
  }
  const n = numeroDe(typeof v === 'string' ? v.replace('−', '-') : (v as number));
  return n === undefined ? undefined : Math.abs(n) > 1 ? n / 100 : n;
}

const siNo = (v: unknown): boolean | undefined => {
  const t = normalizar(v);
  return ['si', 'sí', 'yes', 'true', '1', 'verdadero'].includes(t) ? true : ['no', 'false', '0', 'falso'].includes(t) ? false : undefined;
};

export function leerEscenarios(
  valores: readonly (readonly unknown[])[] | undefined,
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
): { escenarios: Escenario[]; problemas: ProblemaCronograma[] } {
  const hoja = HOJA_ESCENARIOS;
  if (!valores || valores.length === 0) return { escenarios: [], problemas: [] };
  const t = leerHojaGenerica(valores, {
    escenario: ['escenario'],
    cambio: ['cambio'],
    ids: ['actividad', 'riesgo', 'id'],
    valor: ['valor'],
  }, ['escenario', 'cambio']);
  if (!t.ok) return { escenarios: [], problemas: [{ gravedad: 'error', hoja, mensaje: `«${hoja}»: ${t.error}` }] };

  const actividades = new Map(c.actividades.map((a) => [normalizar(a.id), a.id]));
  const porRiesgo = new Map(riesgos.map((r) => [normalizar(r.id), r]));
  const escenarios: Escenario[] = [];
  const problemas: ProblemaCronograma[] = [];
  for (const f of t.filas) {
    const nombre = String(f.celda('escenario') ?? '').trim();
    const error = (m: string) => problemas.push({ gravedad: 'error', hoja, fila: f.fila, mensaje: `«${hoja}», fila ${f.fila} («${nombre}»): ${m}` });
    const textoCambio = String(f.celda('cambio') ?? '').trim();
    const tipo = tipoDe(textoCambio);
    if (!tipo) {
      error(`«${textoCambio}» no es un cambio conocido; usa: ${CAMBIOS.map((x) => x.texto).join(', ')}`);
      continue;
    }
    const def = CAMBIOS.find((x) => x.tipo === tipo)!;
    const crudoIds = String(f.celda('ids') ?? '').trim();
    const valor = f.celda('valor');
    // Los IDs: de actividades (también por categoría) o de riesgos.
    const ids: string[] = [];
    if (def.sobre !== 'proyecto') {
      const partes = crudoIds.split(';').map((x) => x.trim()).filter(Boolean);
      if (partes.length === 0) {
        error(`falta ${def.sobre === 'actividad' ? 'la actividad (ID o categoría)' : 'el riesgo (ID)'}`);
        continue;
      }
      let mal = '';
      for (const p of partes) {
        if (def.sobre === 'riesgo') {
          const r = porRiesgo.get(normalizar(p));
          if (r) ids.push(r.id);
          else mal = p;
        } else {
          const id = actividades.get(normalizar(p));
          const deCategoria = c.actividades.filter((a) => a.categoria && normalizar(a.categoria) === normalizar(p)).map((a) => a.id);
          if (id) ids.push(id);
          else if (deCategoria.length > 0) ids.push(...deCategoria);
          else mal = p;
        }
      }
      if (mal) {
        error(def.sobre === 'riesgo' ? `«${mal}» no es un riesgo activo de «Riesgos de plazo»` : `«${mal}» no es el ID ni la categoría de una actividad`);
        continue;
      }
    }
    let v: number | string = '';
    const numero = numeroDe(typeof valor === 'string' ? valor.replace('−', '-') : (valor as number));
    const tanto = porcentaje(valor);
    switch (tipo) {
      case 'duracion%':
      case 'impacto%':
        if (tanto === undefined || tanto <= -1) { error('el valor tiene que ser un porcentaje mayor que −100 %'); continue; }
        v = tanto;
        break;
      case 'duracionDias':
        if (numero === undefined) { error('el valor tiene que ser un número de días'); continue; }
        v = numero;
        break;
      case 'costoDia':
        if (numero === undefined || numero < 0) { error('el costo por día tiene que ser un número no negativo'); continue; }
        v = numero;
        break;
      case 'probabilidad':
        if (tanto === undefined || tanto < 0 || tanto > 1) { error('la probabilidad tiene que estar entre 0 y 100 %'); continue; }
        v = tanto;
        break;
      case 'predecesoras': {
        const texto = typeof valor === 'number' ? String(valor) : String(valor ?? '').trim();
        const p = leerPredecesoras(texto);
        if (!p.ok) { error(`predecesoras: ${p.error}`); continue; }
        const desconocida = p.relaciones.find((r) => !actividades.has(normalizar(r.predecesora)));
        if (desconocida) { error(`la predecesora «${desconocida.predecesora}» no es una actividad`); continue; }
        v = texto;
        break;
      }
      case 'sabados':
      case 'domingos': {
        const b = siNo(valor);
        if (b === undefined) { error('escribe Sí o No'); continue; }
        v = b ? 1 : 0;
        break;
      }
      case 'inicio':
        if (typeof valor !== 'number') { error('el inicio tiene que ser una fecha'); continue; }
        v = Math.floor(valor);
        break;
      case 'respuesta':
        if (ids.some((id) => !porRiesgo.get(normalizar(id))?.despues)) { error('el riesgo no tiene valores «después» (columnas de la respuesta)'); continue; }
        break;
      default:
        break;
    }
    const valorTexto = typeof v === 'number' && (tipo === 'duracion%' || tipo === 'impacto%' || tipo === 'probabilidad')
      ? `${Math.round(v * 1000) / 10} %` : tipo === 'sabados' || tipo === 'domingos' ? (v ? 'Sí' : 'No') : String(v);
    const cambio: Cambio = { tipo, ids, valor: v, texto: [def.texto, valorTexto, crudoIds].filter((x) => x !== '').join(' · ') };
    let e = escenarios.find((x) => normalizar(x.nombre) === normalizar(nombre));
    if (!e) escenarios.push((e = { nombre, cambios: [] }));
    e.cambios.push(cambio);
  }
  return { escenarios, problemas };
}

/** El cronograma y los riesgos con los cambios del escenario. No toca los originales. */
export function aplicarEscenario(c: Cronograma, riesgos: readonly RiesgoPlazo[], e: Escenario): { cronograma: Cronograma; riesgos: RiesgoPlazo[] } {
  const acts: Actividad[] = c.actividades.map((a) => ({ ...a }));
  let rs: RiesgoPlazo[] = riesgos.map((r) => ({ ...r }));
  let cal = c.calendario;
  let inicio = c.inicio;
  let costoAdicional = c.costoAdicional ?? 0;
  const escalar = (a: Actividad, f: (d: number) => number) => {
    a.duracion = f(a.duracion);
    if (a.tresPuntos) a.tresPuntos = { min: f(a.tresPuntos.min), masProbable: f(a.tresPuntos.masProbable), max: f(a.tresPuntos.max) };
    if (a.percentiles) a.percentiles = { p10: f(a.percentiles.p10), p90: f(a.percentiles.p90) };
  };
  for (const x of e.cambios) {
    const enActs = (f: (a: Actividad) => void) => acts.forEach((a) => { if (x.ids.includes(a.id)) f(a); });
    const enRiesgos = (f: (r: RiesgoPlazo) => RiesgoPlazo | null) => {
      rs = rs.flatMap((r) => (x.ids.includes(r.id) ? (f(r) ?? []) : [r]));
    };
    const v = x.valor as number;
    switch (x.tipo) {
      case 'duracion%': enActs((a) => escalar(a, (d) => d * (1 + v))); break;
      case 'duracionDias': enActs((a) => { if (a.duracion > 0) escalar(a, (d) => Math.max(0, d + v)); }); break;
      case 'predecesoras': {
        const p = leerPredecesoras(x.valor);
        if (p.ok) enActs((a) => { a.predecesoras = p.relaciones; });
        break;
      }
      case 'costoDia': enActs((a) => { a.costoPorDia = v; delete a.costoPorDiaRango; }); break;
      case 'probabilidad': enRiesgos((r) => ({ ...r, probabilidad: v })); break;
      case 'impacto%': enRiesgos((r) => ({ ...r, impactoMin: r.impactoMin * (1 + v), impactoMasProbable: r.impactoMasProbable * (1 + v), impactoMax: r.impactoMax * (1 + v) })); break;
      // Quitar un riesgo no mueve los números de los demás: cada uno sortea con su propio flujo.
      case 'quitarRiesgo': enRiesgos(() => null); break;
      case 'respuesta':
        for (const id of x.ids) {
          const r = rs.find((y) => y.id === id);
          costoAdicional += r?.costoRespuesta ?? 0;
          rs = rs.map((y) => (y.id === id ? (riesgosDespues([y])[0] as RiesgoPlazo) : y));
        }
        break;
      case 'sabados':
      case 'domingos': {
        const lab = [...cal.laborables];
        lab[x.tipo === 'sabados' ? 6 : 0] = v === 1;
        cal = { ...cal, laborables: lab };
        break;
      }
      case 'inicio': inicio = v; break;
    }
  }
  return {
    cronograma: { ...c, actividades: acts, calendario: cal, inicio, ...(costoAdicional > 0 ? { costoAdicional } : {}) },
    riesgos: rs,
  };
}

export interface ResultadoEscenario {
  nombre: string;
  cambios: string[];
  r: ResultadoSimulacionPlazo;
  /** Días naturales que adelanta el P50 y el P80 (negativo: los retrasa). */
  adelantoP50: number;
  adelantoP80: number;
  /** Adelanto medio del fin, iteración a iteración (días naturales), y la mitad de su intervalo al 95 %. */
  adelantoMedio: number;
  ic95: number;
  /** El mismo intervalo si las dos simulaciones usaran números independientes (para comparar). */
  ic95Independientes: number;
  /** Fracción de iteraciones en que el escenario termina antes, igual o después que la base. */
  probAntes: number;
  probIgual: number;
  probDespues: number;
  /** Cuánto baja el P80 del costo (negativo: sube), si hay costos. */
  ahorroCostoP80?: number;
  /** Probabilidad de cumplir cada hito contractual, en la base y en el escenario. */
  hitos: Array<{ id: string; nombre: string; base: number; escenario: number }>;
}

export interface ComparacionEscenarios {
  base: ResultadoSimulacionPlazo;
  escenarios: ResultadoEscenario[];
  /** Escenarios que no se pudieron calcular (un ciclo al cambiar predecesoras…). */
  problemas: ProblemaCronograma[];
}

type Simular = (c: Cronograma, r: readonly RiesgoPlazo[], o: OpcionesSimulacionPlazo) => Promise<ResultadoSimulacionPlazo>;

/** Las fechas de fin de cada iteración (serie), para comparar calendarios distintos. */
const fechasDe = (r: ResultadoSimulacionPlazo) => Float64Array.from(r.finProyecto, (f) => r.cal(f));

function media(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] as number;
  return s / Math.max(1, x.length);
}

function varianza(x: ArrayLike<number>, m = media(x)): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += ((x[i] as number) - m) ** 2;
  return s / Math.max(1, x.length - 1);
}

/** Compara `escenario` con `base`, que tienen que venir de la misma semilla e iteraciones. */
export function compararConBase(nombre: string, cambios: string[], base: ResultadoSimulacionPlazo, r: ResultadoSimulacionPlazo): ResultadoEscenario {
  const fb = fechasDe(base);
  const fe = fechasDe(r);
  const n = Math.min(fb.length, fe.length);
  const d = new Float64Array(n);
  let antes = 0;
  let igual = 0;
  for (let i = 0; i < n; i++) {
    d[i] = (fb[i] as number) - (fe[i] as number);
    if ((d[i] as number) > 0) antes++;
    else if (d[i] === 0) igual++;
  }
  const ic = (v: number) => 1.96 * Math.sqrt(v / Math.max(1, n));
  const hitosBase = new Map((base.hitos ?? []).map((h) => [h.id, h]));
  return {
    nombre, cambios, r,
    adelantoP50: base.fechas.p50 - r.fechas.p50,
    adelantoP80: base.fechas.p80 - r.fechas.p80,
    adelantoMedio: media(d),
    ic95: ic(varianza(d)),
    ic95Independientes: ic(varianza(fb) + varianza(fe)),
    probAntes: antes / Math.max(1, n),
    probIgual: igual / Math.max(1, n),
    probDespues: (n - antes - igual) / Math.max(1, n),
    ...(base.costos && r.costos ? { ahorroCostoP80: base.costos.p80 - r.costos.p80 } : {}),
    hitos: (r.hitos ?? []).map((h) => ({ id: h.id, nombre: h.nombre, base: hitosBase.get(h.id)?.probCumplir ?? NaN, escenario: h.probCumplir })),
  };
}

/**
 * Simula la base y cada escenario con las mismas opciones (semilla,
 * iteraciones, forma). `base`, si ya está simulada con esas opciones, se
 * reutiliza.
 */
export async function compararEscenarios(
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
  escenarios: readonly Escenario[],
  op: OpcionesSimulacionPlazo,
  simular: Simular = simularPlazo,
  baseYa?: ResultadoSimulacionPlazo,
): Promise<ComparacionEscenarios> {
  const total = escenarios.length + (baseYa ? 0 : 1);
  let hechas = 0;
  const avance = (h: number, t: number) => op.alAvanzar?.(hechas * t + h, total * t);
  const o = { ...op, alAvanzar: avance };
  const base = baseYa ?? (await simular(c, riesgos, o));
  if (!baseYa) hechas++;
  const out: ResultadoEscenario[] = [];
  const problemas: ProblemaCronograma[] = [];
  for (const e of escenarios) {
    if (op.debeCancelar?.()) break;
    const x = aplicarEscenario(c, riesgos, e);
    const cpm = calcularCPM(x.cronograma);
    if (!cpm.ok) {
      problemas.push({ gravedad: 'error', hoja: HOJA_ESCENARIOS, mensaje: `«${e.nombre}» no se puede calcular: ${cpm.problemas.map((p) => p.mensaje).join('; ')}` });
      hechas++;
      continue;
    }
    const r = await simular(x.cronograma, x.riesgos, o);
    hechas++;
    if (r.cancelada) break;
    out.push(compararConBase(e.nombre, e.cambios.map((y) => y.texto), base, r));
  }
  return { base, escenarios: out, problemas };
}

const redondo = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Una frase por escenario, para el panel, la hoja y el informe. */
export function narrativaEscenarios(comp: ComparacionEscenarios, fecha: (f: number) => string): string[] {
  return comp.escenarios.map((e) => {
    const dias = Math.round(e.adelantoP80);
    const efecto = dias > 0 ? `adelanta el P80 ${dias} días (del ${fecha(comp.base.fechas.p80)} al ${fecha(e.r.fechas.p80)})`
      : dias < 0 ? `retrasa el P80 ${-dias} días (del ${fecha(comp.base.fechas.p80)} al ${fecha(e.r.fechas.p80)})`
        : `no mueve el P80 (${fecha(e.r.fechas.p80)})`;
    const cuando = e.probAntes >= 0.005 || e.probDespues >= 0.005
      ? `; termina antes que la base en el ${pct(e.probAntes)} de los casos${e.probDespues >= 0.005 ? ` y después en el ${pct(e.probDespues)}` : ''}`
      : '';
    return `«${e.nombre}» ${efecto}${cuando}.`;
  });
}

/** La hoja «Escenarios» con ejemplos tomados del propio cronograma, para editarlos. */
export function plantillaEscenarios(c?: Cronograma, riesgos: readonly RiesgoPlazo[] = []): HojaAEscribir {
  const filas: (string | number)[][] = [];
  if (c) {
    if (!c.calendario.laborables[6]) filas.push(['Trabajar los sábados', 'Trabajar sábados', '', 'Sí', 'Un turno más por semana en toda la obra']);
    const cpm = calcularCPM(c);
    const larga = cpm.ok
      ? cpm.filas.filter((f) => f.critica && f.duracion > 0).sort((a, b) => b.duracion - a.duracion)[0]
      : undefined;
    if (larga) filas.push([`Acelerar: ${larga.nombre}`, 'Duración en %', larga.id, -0.2, 'Más cuadrillas: 20 % menos de duración']);
    const mayor = [...riesgos].filter((r) => r.impactoMasProbable > 0).sort((a, b) => b.probabilidad * b.impactoMasProbable - a.probabilidad * a.impactoMasProbable)[0];
    if (mayor) filas.push([`Sin el riesgo: ${mayor.nombre}`, 'Quitar riesgo', mayor.id, '', '¿Cuánto vale eliminarlo del todo?']);
    const conRespuesta = riesgos.filter((r) => r.despues);
    for (const r of conRespuesta) filas.push(['Todas las respuestas', 'Aplicar respuesta', r.id, '', r.respuesta ?? '']);
  }
  const leyenda = CAMBIOS.map((x) => [`${x.texto} (${x.sobre === 'actividad' ? 'actividad o categoría' : x.sobre})`, x.valor]);
  const valores: (string | number)[][] = [
    ['Escenarios «¿qué pasa si?» — cada fila es un cambio; las filas con el mismo nombre de escenario van juntas. Se comparan con la base con los mismos números aleatorios'],
    [''],
    ['Escenario', 'Cambio', 'Actividad o riesgo (ID)', 'Valor', 'Nota', '', 'Cambios posibles', 'Valor'],
  ];
  const n = Math.max(filas.length, leyenda.length);
  for (let i = 0; i < n; i++) {
    const f = filas[i] ?? ['', '', '', '', ''];
    valores.push([...f, '', ...(leyenda[i] ?? ['', ''])]);
  }
  return {
    nombre: HOJA_ESCENARIOS,
    valores,
    formatos: { 2: '@' },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [30, 22, 22, 12, 40, 2, 44, 56],
  };
}

/** La hoja de resultados: una fila por escenario, más la base. */
export function hojaEscenarios(comp: ComparacionEscenarios, fecha: (f: number) => string): HojaAEscribir {
  const conCosto = comp.base.costos !== undefined;
  const hitos = (comp.base.hitos ?? []).map((h) => h.id);
  const encabezado = [
    'Escenario', 'Cambios', 'P50', 'P80', 'Adelanto del P80 (días)', 'Adelanto medio (días)', '± al 95 %', '± con números independientes',
    'Termina antes', 'Termina después', ...(conCosto ? ['Costo P80', 'Ahorro en el costo P80'] : []), ...hitos.map((h) => `Hito ${h}: prob. de cumplir`),
  ];
  const fila = (e: ResultadoEscenario | null) => {
    const r = e ? e.r : comp.base;
    return [
      e ? e.nombre : 'Base (sin cambios)', e ? e.cambios.join('; ') : '', r.fechas.p50, r.fechas.p80,
      e ? redondo(e.adelantoP80) : '', e ? redondo(e.adelantoMedio) : '', e ? redondo(e.ic95, 2) : '', e ? redondo(e.ic95Independientes, 2) : '',
      e ? e.probAntes : '', e ? e.probDespues : '',
      ...(conCosto ? [r.costos?.p80 ?? '', e?.ahorroCostoP80 ?? ''] : []),
      ...hitos.map((id) => r.hitos?.find((h) => h.id === id)?.probCumplir ?? ''),
    ];
  };
  const formatos: Record<number, string> = { 2: FORMATO_FECHA, 3: FORMATO_FECHA, 8: '0%', 9: '0%' };
  if (conCosto) {
    formatos[10] = '#,##0';
    formatos[11] = '#,##0';
  }
  hitos.forEach((_, j) => (formatos[(conCosto ? 12 : 10) + j] = '0%'));
  return {
    nombre: HOJA_RESULTADO_ESCENARIOS,
    valores: [
      [`Escenarios «¿qué pasa si?»: ${comp.base.iteraciones} iteraciones con los mismos números aleatorios que la base (semilla ${comp.base.semilla})`],
      [''],
      encabezado,
      fila(null),
      ...comp.escenarios.map(fila),
      [''],
      ...narrativaEscenarios(comp, fecha).map((t) => [t]),
      ...comp.problemas.map((p) => [p.mensaje]),
    ],
    formatos,
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [30, 50, 12, 12, 14, 14, 10, 14, 12, 12, 14, 14, 16, 16, 16],
  };
}
