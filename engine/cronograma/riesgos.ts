/**
 * Riesgos de plazo como *risk drivers* (AACE RP 57R‑09, Hulett) — P3.
 *
 * Un riesgo tiene una probabilidad de ocurrir y un impacto en **porcentaje de
 * la duración** (mínimo, más probable, máximo), y afecta a una lista de
 * actividades. En cada iteración se decide si ocurre; si ocurre, se sortea
 * **un** impacto y alarga **a la vez** todas sus actividades en ese
 * porcentaje. Ese «a la vez» es la correlación: las actividades que
 * comparten causa se retrasan juntas, sin pedir a nadie un coeficiente de
 * correlación que no sabría estimar. Y evita la falsa seguridad de partir una
 * tarea en muchas pequeñas independientes (ley de los grandes números).
 *
 * Hoja «Riesgos de plazo»: ID, Riesgo, Probabilidad, Impacto mínimo, Impacto
 * más probable, Impacto máximo, Actividades afectadas. Las actividades se
 * escriben por ID (`5;6;7`) o por **categoría** de la hoja «Actividades»
 * (`Obra gris`), para no enumerar cientos. Un impacto negativo es una
 * oportunidad (acorta), hasta −90 %.
 */

import { leerHojaGenerica, normalizar, numeroDe } from './lectorTabla.ts';
import type { Actividad, ProblemaCronograma } from './tipos.ts';

export const HOJA_RIESGOS = 'Riesgos de plazo';

export interface RiesgoPlazo {
  id: string;
  nombre: string;
  probabilidad: number;
  /** Impactos como fracción de la duración: 0,1 = +10 %. */
  impactoMin: number;
  impactoMasProbable: number;
  impactoMax: number;
  /** IDs de las actividades afectadas, ya resueltas (sin categorías). */
  actividades: string[];
  /** Costo directo si ocurre (multas, reparaciones), además del que causa el retraso (P5). */
  costo?: number;
  fila?: number;
  /**
   * Mitigación (V1): la respuesta prevista y cómo queda el riesgo después
   * de aplicarla. Lo que no se diga «después» queda como antes.
   */
  respuesta?: string;
  responsable?: string;
  /** Lo que cuesta aplicar la respuesta (seguro: se paga aunque el riesgo no ocurra). */
  costoRespuesta?: number;
  despues?: { probabilidad: number; impactoMin: number; impactoMasProbable: number; impactoMax: number; costo?: number };
  /**
   * Ramificación probabilística (V2): si el riesgo ocurre, aparece una
   * actividad nueva (reproceso, trámite extra) que va después de `despuesDe`
   * y antes de `antesDe` (fin‑comienzo). Si no ocurre, no existe: ni dura ni
   * crea dependencias.
   */
  rama?: { nombre: string; min: number; masProbable: number; max: number; despuesDe: string[]; antesDe: string[] };
  /**
   * Registro (V10). `cerrado` no se simula; `materializado` (ya ocurrió) se
   * simula con probabilidad 100 %. Sin estado, abierto.
   */
  estado?: 'abierto' | 'seguimiento' | 'cerrado' | 'materializado';
  /** Próxima revisión (fecha de serie). */
  revision?: number;
  categoriaRiesgo?: string;
  /** Nivel de impacto 1–5 para la matriz, si el usuario lo da (si no, sale de la simulación). */
  impactoCualitativo?: number;
  /** Solo para el registro y la matriz: sin impacto que simular. */
  cualitativo?: boolean;
}

/** Los riesgos que entran en la simulación (V10): sin los cerrados ni los cualitativos; los materializados, seguros. */
export function riesgosActivos(riesgos: readonly RiesgoPlazo[]): RiesgoPlazo[] {
  return riesgos.filter((r) => r.estado !== 'cerrado' && !r.cualitativo).map((r) => (r.estado === 'materializado' ? { ...r, probabilidad: 1 } : r));
}

/** El ID de la actividad que añade un riesgo: `R6+`. */
export const idRama = (r: RiesgoPlazo) => `${r.id}+`;

/** ¿Tiene este riesgo una respuesta que cambie algo? */
export const tieneMitigacion = (r: RiesgoPlazo) => r.despues !== undefined || (r.costoRespuesta ?? 0) > 0 || !!r.respuesta;

/**
 * Los riesgos después de mitigar (V1): cada uno con sus valores «después».
 * `solo`: mitigar únicamente ese riesgo (para medir cada respuesta aparte).
 */
export function riesgosDespues(riesgos: readonly RiesgoPlazo[], solo?: string): RiesgoPlazo[] {
  return riesgos.map((r) => {
    if (!r.despues || (solo !== undefined && r.id !== solo)) return r;
    const { costo, ...d } = r.despues;
    return { ...r, ...d, ...(costo !== undefined ? { costo } : {}) };
  });
}

/** Lo que cuestan las respuestas (todas, o solo la de `solo`). */
export function costoRespuestas(riesgos: readonly RiesgoPlazo[], solo?: string): number {
  return riesgos.filter((r) => solo === undefined || r.id === solo).reduce((s, r) => s + (r.costoRespuesta ?? 0), 0);
}

/** Un porcentaje: 0,1 o «10 %» o 10 (se entiende como 10 %, si es > 1). */
function fraccion(v: unknown, esProbabilidad: boolean): number | undefined {
  if (typeof v === 'string') {
    const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*%\s*$/.exec(v);
    if (m) return Number((m[1] as string).replace(',', '.')) / 100;
  }
  const n = numeroDe(v);
  if (n === undefined) return undefined;
  // «30» es 30 %, no 3000 %. Con formato de porcentaje, Excel ya da 0,3 (y 1 = 100 %).
  if (esProbabilidad ? n > 1 : Math.abs(n) > 1) return n / 100;
  return n;
}

export function leerRiesgosPlazo(
  valores: readonly (readonly unknown[])[] | undefined,
  actividades: readonly Actividad[],
): { riesgos: RiesgoPlazo[]; problemas: ProblemaCronograma[] } {
  if (!valores) return { riesgos: [], problemas: [] };
  const hoja = HOJA_RIESGOS;
  const tabla = leerHojaGenerica(valores, {
    id: ['id'],
    // V10: el registro (estado, revisión, categoría e impacto cualitativo).
    estado: ['estado'],
    revision: ['fecha de revision', 'revision', 'proxima revision'],
    categoriaRiesgo: ['categoria del riesgo', 'tipo de riesgo', 'categoria'],
    impactoCual: ['impacto cualitativo', 'nivel de impacto', 'impacto (1'],
    // Lo específico antes que lo general: «Probabilidad después» empieza como «Probabilidad».
    pDesp: ['probabilidad despues'],
    ramaNombre: ['actividad nueva', 'actividad que anade'],
    ramaMin: ['duracion nueva min', 'duracion nueva, min'],
    ramaMp: ['duracion nueva mas probable', 'duracion nueva probable'],
    ramaMax: ['duracion nueva max'],
    ramaDespues: ['despues de'],
    ramaAntes: ['antes de'],
    minDesp: ['impacto minimo despues', 'impacto min despues'],
    mpDesp: ['impacto mas probable despues', 'impacto probable despues'],
    maxDesp: ['impacto maximo despues', 'impacto max despues'],
    costoDesp: ['costo si ocurre despues', 'coste si ocurre despues'],
    costoRespuesta: ['costo de la respuesta', 'costo respuesta', 'coste de la respuesta', 'costo de la mitigacion'],
    respuesta: ['respuesta', 'mitigacion', 'accion'],
    responsable: ['responsable', 'dueno'],
    nombre: ['riesgo', 'nombre', 'descripcion'],
    probabilidad: ['probabilidad'],
    min: ['impacto min'],
    mp: ['impacto mas probable', 'impacto probable'],
    max: ['impacto max'],
    actividades: ['actividades', 'afecta'],
    costo: ['costo si ocurre', 'coste si ocurre', 'costo'],
  }, ['id', 'probabilidad']);
  if (!tabla.ok) return { riesgos: [], problemas: [{ gravedad: 'error', hoja, mensaje: tabla.error }] };

  const ids = new Set(actividades.map((a) => a.id));
  const porCategoria = new Map<string, string[]>();
  for (const a of actividades) {
    if (!a.categoria) continue;
    const k = normalizar(a.categoria);
    porCategoria.set(k, [...(porCategoria.get(k) ?? []), a.id]);
  }

  const riesgos: RiesgoPlazo[] = [];
  const problemas: ProblemaCronograma[] = [];
  for (const { fila, celda } of tabla.filas) {
    const id = String(celda('id')).trim();
    const error = (m: string) => problemas.push({ gravedad: 'error', hoja, fila, mensaje: `Fila ${fila} (riesgo «${id}»): ${m}` });
    const p = fraccion(celda('probabilidad'), true);
    if (p === undefined || p < 0 || p > 1) { error('la probabilidad debe estar entre 0 % y 100 %'); continue; }
    const vacioC = (x: unknown) => x === '' || x === undefined || x === null;
    const listaIds = (x: unknown) => {
      const t = String(x ?? '').trim();
      return t.split(t.includes(';') ? ';' : ',').map((s) => s.trim()).filter(Boolean);
    };

    // V2: la actividad que añade, si la hay.
    let rama: RiesgoPlazo['rama'];
    const ramaNombre = String(celda('ramaNombre') ?? '').trim();
    if (ramaNombre) {
      const rMin = numeroDe(celda('ramaMin'));
      const rMax = numeroDe(celda('ramaMax'));
      const rMp = vacioC(celda('ramaMp')) ? undefined : numeroDe(celda('ramaMp'));
      if (rMin === undefined || rMax === undefined) { error('la actividad nueva necesita «Duración nueva mínima» y «máxima»'); continue; }
      const rmp = rMp ?? (rMin + rMax) / 2;
      if (!(0 <= rMin && rMin <= rmp && rmp <= rMax)) { error('la duración nueva debe cumplir 0 ≤ mínima ≤ más probable ≤ máxima'); continue; }
      const despuesDe = listaIds(celda('ramaDespues'));
      const antesDe = listaIds(celda('ramaAntes'));
      const malos = [...despuesDe, ...antesDe].filter((x) => !ids.has(x));
      if (malos.length > 0) { error(`«${malos.join('», «')}» no es el ID de una actividad (en «Después de» / «Antes de»)`); continue; }
      if (despuesDe.length === 0 && antesDe.length === 0) { error('la actividad nueva necesita «Después de» o «Antes de» (IDs)'); continue; }
      rama = { nombre: ramaNombre, min: rMin, masProbable: rmp, max: rMax, despuesDe, antesDe };
    }

    const texto = String(celda('actividades') ?? '').trim();
    const sinImpacto = texto === '' && vacioC(celda('min')) && vacioC(celda('max'));
    // V10: sin impacto en plazo ni actividad nueva, un riesgo puede ser solo de costo o cualitativo.
    const costoPrevio = vacioC(celda('costo')) ? undefined : numeroDe(celda('costo'));
    const cual = vacioC(celda('impactoCual')) ? undefined : numeroDe(celda('impactoCual'));
    if (cual !== undefined && !(Number.isInteger(cual) && cual >= 1 && cual <= 5)) { error('el impacto cualitativo es un nivel de 1 a 5'); continue; }
    const soloCosto = sinImpacto && !rama && costoPrevio !== undefined;
    const cualitativo = sinImpacto && !rama && costoPrevio === undefined && cual !== undefined;
    let a = 0;
    let b = 0;
    let mp = 0;
    const afectadas: string[] = [];
    if (!(rama && sinImpacto) && !soloCosto && !cualitativo) {
      const a0 = fraccion(celda('min'), false);
      const b0 = fraccion(celda('max'), false);
      const mRaw = celda('mp');
      const m = vacioC(mRaw) ? undefined : fraccion(mRaw, false);
      if (a0 === undefined || b0 === undefined) { error('faltan el impacto mínimo y el máximo (si no afecta al plazo: un «Costo si ocurre» o un «Impacto cualitativo» de 1 a 5)'); continue; }
      a = a0;
      b = b0;
      mp = m ?? (a + b) / 2;
      if (!(a <= mp && mp <= b)) { error('el impacto debe cumplir mínimo ≤ más probable ≤ máximo'); continue; }
      if (a < -0.9) { error('un impacto no puede acortar más del 90 %'); continue; }
      for (const token of listaIds(texto)) {
        if (ids.has(token)) afectadas.push(token);
        else if (porCategoria.has(normalizar(token))) afectadas.push(...(porCategoria.get(normalizar(token)) as string[]));
        else error(`«${token}» no es el ID de una actividad ni una categoría`);
      }
      if (afectadas.length === 0) {
        if (texto === '') error('no dice a qué actividades afecta (o qué actividad nueva añade)');
        continue;
      }
    }
    const nombre = String(celda('nombre') ?? '').trim() || id;
    const costoCrudo = celda('costo');
    const costo = costoCrudo === '' || costoCrudo === undefined ? undefined : numeroDe(costoCrudo);
    if (costoCrudo !== '' && costoCrudo !== undefined && costo === undefined) { error('«Costo si ocurre» debe ser un número'); continue; }
    const riesgo: RiesgoPlazo = {
      id, nombre, probabilidad: p, impactoMin: a, impactoMasProbable: mp, impactoMax: b, actividades: [...new Set(afectadas)], fila,
      ...(costo !== undefined ? { costo } : {}),
      ...(rama ? { rama } : {}),
      ...(cual !== undefined ? { impactoCualitativo: cual } : {}),
      ...(cualitativo ? { cualitativo: true } : {}),
    };
    // V10: estado, fecha de revisión y categoría.
    const est = normalizar(celda('estado')).replace(/^en /, ''); // «En seguimiento»
    if (est) {
      const e = est.startsWith('abiert') || est.startsWith('activ') ? 'abierto'
        : est.startsWith('seguim') || est.startsWith('monitor') || est.startsWith('vigil') ? 'seguimiento'
          : est.startsWith('cerr') ? 'cerrado'
            : est.startsWith('materializ') || est.startsWith('ocurri') ? 'materializado' : undefined;
      if (!e) { error(`estado «${String(celda('estado'))}»: usa Abierto, En seguimiento, Cerrado o Materializado`); continue; }
      riesgo.estado = e;
    }
    const rev = celda('revision');
    if (!vacioC(rev)) {
      if (typeof rev !== 'number') { error('«Fecha de revisión» debe ser una fecha'); continue; }
      riesgo.revision = rev;
    }
    const catR = String(celda('categoriaRiesgo') ?? '').trim();
    if (catR) riesgo.categoriaRiesgo = catR;

    // V1: la mitigación.
    const texto2 = (c: 'respuesta' | 'responsable') => String(celda(c) ?? '').trim();
    if (texto2('respuesta')) riesgo.respuesta = texto2('respuesta');
    if (texto2('responsable')) riesgo.responsable = texto2('responsable');
    const cr = celda('costoRespuesta');
    if (cr !== '' && cr !== undefined) {
      const v = numeroDe(cr);
      if (v === undefined || v < 0) { error('«Costo de la respuesta» debe ser un número'); continue; }
      riesgo.costoRespuesta = v;
    }
    const hay = (c: 'pDesp' | 'minDesp' | 'mpDesp' | 'maxDesp' | 'costoDesp') => celda(c) !== '' && celda(c) !== undefined;
    if (hay('pDesp') || hay('minDesp') || hay('mpDesp') || hay('maxDesp') || hay('costoDesp')) {
      const pd = hay('pDesp') ? fraccion(celda('pDesp'), true) : p;
      if (pd === undefined || pd < 0 || pd > 1) { error('la probabilidad después debe estar entre 0 % y 100 %'); continue; }
      const ad = hay('minDesp') ? fraccion(celda('minDesp'), false) : a;
      const bd = hay('maxDesp') ? fraccion(celda('maxDesp'), false) : b;
      if (ad === undefined || bd === undefined) { error('el impacto después debe ser un porcentaje'); continue; }
      const md = hay('mpDesp') ? fraccion(celda('mpDesp'), false) : hay('minDesp') || hay('maxDesp') ? (ad + bd) / 2 : mp;
      if (md === undefined || !(ad <= md && md <= bd) || ad < -0.9) { error('el impacto después debe cumplir mínimo ≤ más probable ≤ máximo'); continue; }
      const cd = hay('costoDesp') ? numeroDe(celda('costoDesp')) : undefined;
      if (hay('costoDesp') && cd === undefined) { error('«Costo si ocurre después» debe ser un número'); continue; }
      riesgo.despues = { probabilidad: pd, impactoMin: ad, impactoMasProbable: md, impactoMax: bd, ...(cd !== undefined ? { costo: cd } : {}) };
    }
    riesgos.push(riesgo);
  }
  return { riesgos, problemas };
}
