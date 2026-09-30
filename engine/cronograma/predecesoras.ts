/**
 * La columna «Predecesoras», con la sintaxis de MS Project en inglés o en
 * español: `3`, `3FS`, `3FC+2`, `5CC-1 días`, `7FF+2d`, separadas por `;`
 * o, si no hay ningún `;`, por `,`. Sin tipo, fin‑comienzo; sin retardo, cero.
 *
 * Equivalencias de MS Project en español: FC = FS, CC = SS, FF = FF, CF = SF.
 * Los retardos en porcentaje (`+50%`) y en días naturales (`+2ed`) no se
 * admiten todavía: se rechazan con un mensaje, nunca se leen mal en silencio.
 */

import type { Relacion, TipoRelacion } from './tipos.ts';

const TIPOS: Record<string, TipoRelacion> = {
  FS: 'FS', FC: 'FS',
  SS: 'SS', CC: 'SS',
  FF: 'FF',
  SF: 'SF', CF: 'SF',
};

const PATRON = /^(.+?)\s*(FS|FC|SS|CC|FF|SF|CF)?\s*(?:([+-])\s*(\d+(?:[.,]\d+)?)\s*(%|ed|d|dia|día|dias|días)?)?$/i;

export type ResultadoPredecesoras =
  | { ok: true; relaciones: Relacion[] }
  | { ok: false; error: string };

export function leerPredecesoras(texto: unknown): ResultadoPredecesoras {
  if (texto === null || texto === undefined) return { ok: true, relaciones: [] };
  // Un número solo (Excel convierte «3» en el número 3).
  if (typeof texto === 'number') {
    return Number.isFinite(texto) ? { ok: true, relaciones: [{ predecesora: String(texto), tipo: 'FS', retardo: 0 }] }
      : { ok: false, error: 'predecesora no válida' };
  }
  const s = String(texto).trim();
  if (s === '') return { ok: true, relaciones: [] };

  const relaciones: Relacion[] = [];
  // El separador de listas: `;` si aparece (Excel y MS Project en español;
  // entonces la coma puede ser decimal: `3CC+1,5`), si no, `,`.
  for (const parte of s.split(s.includes(';') ? ';' : ',')) {
    const p = parte.trim();
    if (p === '') continue;
    const m = PATRON.exec(p);
    if (!m) return { ok: false, error: `no se entiende «${p}»` };
    const [, id, tipo, signo, numero, unidad] = m;
    const u = (unidad ?? '').toLowerCase();
    if (u === '%') return { ok: false, error: `«${p}»: los retardos en porcentaje no se admiten todavía` };
    if (u === 'ed') return { ok: false, error: `«${p}»: los retardos en días naturales no se admiten todavía` };
    const retardo = numero === undefined ? 0 : (signo === '-' ? -1 : 1) * Number(numero.replace(',', '.'));
    relaciones.push({
      predecesora: (id as string).trim(),
      tipo: tipo ? TIPOS[tipo.toUpperCase()] as TipoRelacion : 'FS',
      retardo,
    });
  }
  return { ok: true, relaciones };
}

/** La relación escrita como en MS Project en español: `3FC+2`. */
export function textoRelacion(r: Relacion): string {
  const tipo = ({ FS: 'FC', SS: 'CC', FF: 'FF', SF: 'CF' } as const)[r.tipo];
  const retardo = r.retardo === 0 ? '' : `${r.retardo > 0 ? '+' : ''}${r.retardo}`;
  return `${r.predecesora}${r.tipo === 'FS' && retardo === '' ? '' : tipo}${retardo}`;
}
