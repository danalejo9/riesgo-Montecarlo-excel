/**
 * Seguimiento en el tiempo (V5): cada simulación que el usuario decide
 * guardar queda como una **instantánea** en la hoja «Seguimiento», con su
 * fecha de corte. La hoja es el almacén (viaja con el libro y se lee sin el
 * complemento) y, a la vez, el informe mensual: la tendencia del P50/P80, de
 * la probabilidad de cumplir y del costo.
 *
 * Una instantánea por fecha de corte y escenario: volver a guardar con el
 * mismo corte la reemplaza (se re-simuló el mismo mes), conservando la nota.
 * Sin fecha de corte, se añade con la fecha del día. Sin Office.js.
 */

import { confianzaConjunta, reservaContingencia, resumirTiempo, type ModeloCronograma, type SimulacionCronograma } from '../engine/cronograma/index.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';
import { COLUMNAS, FORMATO_FECHA, HOJAS_CRONOGRAMA as H, normalizar, numero, texto, type Celda, type MatrizHoja } from './cronogramaHojas.ts';
import type { CambioHoja } from './edicionGantt.ts';

export type EscenarioSeguimiento = 'antes' | 'despues';

export interface Instantanea {
  /** Fecha del eje de la tendencia: la de corte o, sin ella, el día en que se guardó. */
  referencia: number;
  fechaCorte?: number;
  /** Fecha y hora (número de serie) en que se guardó. */
  guardada: number;
  escenario: EscenarioSeguimiento;
  iteraciones: number;
  finCronograma: number;
  p50: number;
  p80: number;
  p90: number;
  /** P(terminar no más tarde que el cronograma). */
  probCumplir: number;
  /** P(cumplir la fecha meta), si la hay. */
  probMeta?: number;
  /** Días laborables del P80 sobre el cronograma. */
  reservaDias: number;
  costoP50?: number;
  costoP80?: number;
  /** P(cumplir a la vez el P80 del plazo y el del costo) o, con metas, las dos metas. */
  jcl?: number;
  /** Texto libre del usuario (se conserva al reescribir la hoja). */
  nota?: string;
}

const ESCENARIO: Record<EscenarioSeguimiento, string> = { antes: 'Antes de mitigar', despues: 'Después de mitigar' };

function percentil(v: Float64Array, p: number): number {
  const o = Float64Array.from(v).sort();
  return o[Math.min(o.length - 1, Math.max(0, Math.ceil(p * o.length) - 1))] as number;
}

/** Las instantáneas de una simulación: la de antes y, si hay escenario post, la de después. */
export function instantaneasDe(sim: SimulacionCronograma, modelo: ModeloCronograma, ahora: number): Instantanea[] {
  const cfg = modelo.configuracion;
  const corte = modelo.red.fechaCorte;
  const base = {
    referencia: corte ?? Math.floor(ahora),
    ...(corte !== undefined ? { fechaCorte: corte } : {}),
    guardada: ahora,
    iteraciones: sim.iteraciones,
    finCronograma: sim.deterministico.fin,
  };
  const de = (escenario: EscenarioSeguimiento, serie: Float64Array, dias: Float64Array, costo: Float64Array | null, reserva: number): Instantanea => {
    const r = resumirTiempo({ id: 'FIN', nombre: '', serie, dias }, sim.deterministico.fin, cfg.fechaMeta);
    const p = (q: number) => Math.floor(percentil(serie, q));
    const c80 = costo ? percentil(costo, 0.8) : null;
    const jcl = costo && c80 !== null
      ? confianzaConjunta(serie, costo, cfg.fechaMeta ?? p(0.8), cfg.costoMeta ?? c80, 1).jcl : undefined;
    return {
      ...base, escenario, p50: p(0.5), p80: p(0.8), p90: p(0.9), probCumplir: r.probabilidadDeterministica,
      ...(r.probabilidadMeta !== null ? { probMeta: r.probabilidadMeta } : {}),
      reservaDias: reserva,
      ...(costo && c80 !== null ? { costoP50: percentil(costo, 0.5), costoP80: c80 } : {}),
      ...(jcl !== undefined ? { jcl } : {}),
    };
  };
  const out = [de('antes', sim.fin.serie, sim.fin.dias, sim.costo, reservaContingencia(sim, 0.8).dias)];
  if (sim.post) {
    const o = Float64Array.from(sim.post.fin.dias).sort();
    const p80 = o[Math.min(o.length - 1, Math.max(0, Math.ceil(0.8 * o.length) - 1))] as number;
    out.push(de('despues', sim.post.fin.serie, sim.post.fin.dias, sim.post.costo, p80 - sim.deterministico.duracion));
  }
  return out;
}

/** Las instantáneas de la hoja (vacía o sin hoja: ninguna), ordenadas por fecha de referencia. */
export function leerSeguimiento(m: MatrizHoja | undefined): Instantanea[] {
  if (!m || m.length < 2) return [];
  const enc = (m[0] ?? []).map(normalizar);
  const col = (k: string) => enc.indexOf(normalizar(k));
  const c = Object.fromEntries(COLUMNAS.seguimiento.map((k) => [k, col(k)])) as Record<(typeof COLUMNAS.seguimiento)[number], number>;
  const out: Instantanea[] = [];
  for (let f = 1; f < m.length; f++) {
    const fila = m[f] ?? [];
    const n = (k: (typeof COLUMNAS.seguimiento)[number]) => (c[k] < 0 ? null : numero(fila[c[k]]));
    const referencia = n('Fecha de referencia');
    const p80 = n('P80');
    if (referencia === null || p80 === null) continue;
    const opc = (k: (typeof COLUMNAS.seguimiento)[number]) => n(k) ?? undefined;
    const nota = c.Nota < 0 ? '' : texto(fila[c.Nota]);
    const x: Instantanea = {
      referencia, guardada: n('Guardada el') ?? referencia,
      escenario: normalizar(fila[c.Escenario]).startsWith('despues') ? 'despues' : 'antes',
      iteraciones: n('Iteraciones') ?? 0, finCronograma: n('Fin del cronograma') ?? NaN,
      p50: n('P50') ?? NaN, p80, p90: n('P90') ?? NaN, probCumplir: n('Prob. de cumplir el cronograma') ?? NaN,
      reservaDias: n('Reserva al P80 (días lab.)') ?? NaN,
    };
    const corte = opc('Fecha de corte');
    const probMeta = opc('Prob. de cumplir la meta');
    const costoP50 = opc('Costo P50');
    const costoP80 = opc('Costo P80');
    const jcl = opc('JCL');
    out.push({
      ...x,
      ...(corte !== undefined ? { fechaCorte: corte } : {}),
      ...(probMeta !== undefined ? { probMeta } : {}),
      ...(costoP50 !== undefined ? { costoP50 } : {}),
      ...(costoP80 !== undefined ? { costoP80 } : {}),
      ...(jcl !== undefined ? { jcl } : {}),
      ...(nota ? { nota } : {}),
    });
  }
  return ordenar(out);
}

const ordenar = (l: Instantanea[]) => [...l].sort((a, b) => a.referencia - b.referencia || a.guardada - b.guardada || a.escenario.localeCompare(b.escenario));

/** Añade una instantánea. Si ya hay una con la misma fecha de corte y el mismo escenario, la reemplaza (conservando su nota). */
export function agregarInstantanea(lista: readonly Instantanea[], nueva: Instantanea): { lista: Instantanea[]; reemplazada: boolean } {
  if (nueva.fechaCorte !== undefined) {
    const i = lista.findIndex((x) => x.fechaCorte === nueva.fechaCorte && x.escenario === nueva.escenario);
    if (i >= 0) {
      const vieja = lista[i] as Instantanea;
      const copia = [...lista];
      copia[i] = { ...nueva, ...(vieja.nota && !nueva.nota ? { nota: vieja.nota } : {}) };
      return { lista: ordenar(copia), reemplazada: true };
    }
  }
  return { lista: ordenar([...lista, nueva]), reemplazada: false };
}

const o = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? null : v);

/** Los valores de la hoja Seguimiento (encabezado incluido). */
export function valoresSeguimiento(lista: readonly Instantanea[]): Celda[][] {
  return [
    [...COLUMNAS.seguimiento],
    ...lista.map((x) => [
      x.referencia, o(x.finCronograma), o(x.p50), x.p80, o(x.p90), o(x.probCumplir), o(x.probMeta), o(x.reservaDias),
      o(x.costoP50), o(x.costoP80), o(x.jcl), ESCENARIO[x.escenario], x.iteraciones || null, o(x.fechaCorte), x.guardada, x.nota ?? null,
    ] as Celda[]),
  ];
}

export const FORMATOS_SEGUIMIENTO: Record<number, string> = {
  0: FORMATO_FECHA, 1: FORMATO_FECHA, 2: FORMATO_FECHA, 3: FORMATO_FECHA, 4: FORMATO_FECHA, 5: '0%', 6: '0%', 7: '0.0',
  8: '#,##0', 9: '#,##0', 10: '0%', 12: '#,##0', 13: FORMATO_FECHA, 14: 'dd/mm/yyyy hh:mm',
};

/** Guarda las instantáneas en la hoja: los cambios (reescribe la tabla entera, conservando las notas). */
export function guardarEnSeguimiento(m: MatrizHoja | undefined, nuevas: readonly Instantanea[]): { cambios: CambioHoja[]; lista: Instantanea[]; reemplazadas: number } {
  let lista = leerSeguimiento(m);
  let reemplazadas = 0;
  for (const x of nuevas) {
    const r = agregarInstantanea(lista, x);
    lista = r.lista;
    if (r.reemplazada) reemplazadas++;
  }
  const valores = valoresSeguimiento(lista);
  const ancho = COLUMNAS.seguimiento.length;
  const alto = Math.max(valores.length, m?.length ?? 0);
  const llenas = Array.from({ length: alto }, (_, i) => Array.from({ length: ancho }, (_, j) => valores[i]?.[j] ?? null));
  const antes = Array.from({ length: alto }, (_, i) => Array.from({ length: ancho }, (_, j) => m?.[i]?.[j] ?? null));
  return { cambios: [{ hoja: H.seguimiento, op: 'rango', fila: 0, col: 0, valores: llenas, antes, formatos: FORMATOS_SEGUIMIENTO }], lista, reemplazadas };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** La tendencia en palabras (escenario «antes»): la última instantánea contra la anterior y, si hay más, la racha. */
export function tendencia(todas: readonly Instantanea[], moneda = ''): string[] {
  const lista = todas.filter((x) => x.escenario === 'antes');
  if (lista.length < 2) return [];
  const u = lista[lista.length - 1] as Instantanea;
  const a = lista[lista.length - 2] as Instantanea;
  const dinero = (x: number) => `${Math.round(x).toLocaleString('es-CO')}${moneda ? ` ${moneda}` : ''}`;
  const out: string[] = [];
  const desde = a.fechaCorte !== undefined ? `el corte del ${textoFecha(a.fechaCorte)}` : `la instantánea del ${textoFecha(a.referencia)}`;
  const d = Math.round(u.p80 - a.p80);
  out.push(d === 0
    ? `Desde ${desde}, el P80 no se ha movido (${textoFecha(u.p80)}).`
    : `Desde ${desde}, el P80 se ha ${d > 0 ? 'retrasado' : 'adelantado'} ${plural(Math.abs(d), 'día', 'días')} de calendario: del ${textoFecha(a.p80)} al ${textoFecha(u.p80)}.`);
  if (Number.isFinite(a.probCumplir) && Number.isFinite(u.probCumplir) && Math.round(a.probCumplir * 100) !== Math.round(u.probCumplir * 100)) {
    out.push(`La probabilidad de cumplir el cronograma ${u.probCumplir > a.probCumplir ? 'subió' : 'bajó'} del ${Math.round(a.probCumplir * 100)} % al ${Math.round(u.probCumplir * 100)} %.`);
  }
  if (a.costoP80 !== undefined && u.costoP80 !== undefined && Math.round(u.costoP80) !== Math.round(a.costoP80)) {
    const c = u.costoP80 - a.costoP80;
    out.push(`El P80 del costo ${c > 0 ? 'subió' : 'bajó'} ${dinero(Math.abs(c))}, a ${dinero(u.costoP80)}.`);
  }
  // La racha: cuántas instantáneas seguidas el P80 se ha movido en el mismo sentido.
  let racha = 1;
  const sentido = Math.sign(d);
  for (let i = lista.length - 2; i > 0 && sentido !== 0; i--) {
    if (Math.sign(Math.round((lista[i] as Instantanea).p80 - (lista[i - 1] as Instantanea).p80)) !== sentido) break;
    racha++;
  }
  if (racha >= 3) {
    const primera = lista[lista.length - 1 - racha] as Instantanea;
    out.push(`Es la ${racha}.ª instantánea seguida en que el P80 se ${sentido > 0 ? 'retrasa' : 'adelanta'}: ${plural(Math.abs(Math.round(u.p80 - primera.p80)), 'día', 'días')} en total desde el ${textoFecha(primera.referencia)}.`);
  }
  return out;
}
