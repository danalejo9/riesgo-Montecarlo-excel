/**
 * La columna «Predecesoras» del Gantt en texto, como en MS Project:
 * `5FC+2d; 7CC; 9FF-1d; C FC+7dc`. Sin Office.js.
 *
 * - Tipo FC, CC, FF o CF (también FS, SS, SF en inglés); sin tipo, FC.
 * - Desfase con signo, en días laborables (`d`) o calendario (`dc` o `ed`).
 * - Separadas por `;` o `,`.
 */

import type { Predecesora, TipoRelacion } from './red.ts';

const EN: Record<string, TipoRelacion> = { FC: 'FC', CC: 'CC', FF: 'FF', CF: 'CF', FS: 'FC', SS: 'CC', SF: 'CF' };
const PIEZA = /^(.+?)\s*(FC|CC|FF|CF|FS|SS|SF)?\s*(?:([+-−])\s*(\d+(?:[.,]\d+)?)\s*(dc|ed|d)?)?$/i;

export type LecturaPredecesoras = { ok: true; predecesoras: Predecesora[] } | { ok: false; error: string };

export function leerPredecesoras(texto: string): LecturaPredecesoras {
  const predecesoras: Predecesora[] = [];
  for (const crudo of texto.split(/[;,]/)) {
    const t = crudo.trim();
    if (!t) continue;
    const m = PIEZA.exec(t);
    if (!m) return { ok: false, error: `No entiendo «${t}»: escriba por ejemplo «5FC+2d» o «C CC»` };
    const id = (m[1] as string).trim();
    const tipo = EN[(m[2] ?? 'FC').toUpperCase()] as TipoRelacion;
    const signo = m[3] === '-' || m[3] === '−' ? -1 : 1;
    const desfase = m[4] ? signo * Number(m[4].replace(',', '.')) : 0;
    const transcurrido = /^(dc|ed)$/i.test(m[5] ?? '');
    if (predecesoras.some((p) => p.id === id)) return { ok: false, error: `«${id}» está dos veces` };
    predecesoras.push({ id, tipo, desfase, ...(transcurrido ? { transcurrido: true } : {}) });
  }
  return { ok: true, predecesoras };
}

/** Una relación en texto: el tipo se omite si es FC sin desfase. */
export function textoRelacion(id: string, tipo: TipoRelacion, desfase: number, transcurrido = false): string {
  if (tipo === 'FC' && desfase === 0) return id;
  const sep = /\d$/.test(id) ? '' : ' ';
  const d = desfase === 0 ? '' : `${desfase > 0 ? '+' : '-'}${Math.abs(desfase).toLocaleString('en-US', { maximumFractionDigits: 2 })}${transcurrido ? 'dc' : 'd'}`;
  return `${id}${sep}${tipo}${d}`;
}

export function textoPredecesoras(predecesoras: readonly Predecesora[]): string {
  return predecesoras.map((p) => textoRelacion(p.id, p.tipo, p.desfase, p.transcurrido)).join('; ');
}
