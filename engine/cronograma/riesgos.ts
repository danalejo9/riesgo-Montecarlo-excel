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
  fila?: number;
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
    nombre: ['riesgo', 'nombre', 'descripcion'],
    probabilidad: ['probabilidad'],
    min: ['impacto min'],
    mp: ['impacto mas probable', 'impacto probable'],
    max: ['impacto max'],
    actividades: ['actividades', 'afecta'],
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
    const a = fraccion(celda('min'), false);
    const b = fraccion(celda('max'), false);
    const mRaw = celda('mp');
    const m = mRaw === '' || mRaw === undefined ? undefined : fraccion(mRaw, false);
    if (a === undefined || b === undefined) { error('faltan el impacto mínimo y el máximo'); continue; }
    const mp = m ?? (a + b) / 2;
    if (!(a <= mp && mp <= b)) { error('el impacto debe cumplir mínimo ≤ más probable ≤ máximo'); continue; }
    if (a < -0.9) { error('un impacto no puede acortar más del 90 %'); continue; }

    const afectadas: string[] = [];
    const texto = String(celda('actividades') ?? '').trim();
    for (const token of texto.split(texto.includes(';') ? ';' : ',').map((t) => t.trim()).filter(Boolean)) {
      if (ids.has(token)) afectadas.push(token);
      else if (porCategoria.has(normalizar(token))) afectadas.push(...(porCategoria.get(normalizar(token)) as string[]));
      else error(`«${token}» no es el ID de una actividad ni una categoría`);
    }
    if (afectadas.length === 0) {
      if (texto === '') error('no dice a qué actividades afecta');
      continue;
    }
    const nombre = String(celda('nombre') ?? '').trim() || id;
    riesgos.push({ id, nombre, probabilidad: p, impactoMin: a, impactoMasProbable: mp, impactoMax: b, actividades: [...new Set(afectadas)], fila });
  }
  return { riesgos, problemas };
}
