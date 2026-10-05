/**
 * La jerarquía del cronograma por la WBS (Gantt, decisión 3): `2` es el
 * padre de `2.1` y `2.2`. Las actividades «Resumen» no entran en el cálculo
 * y sus fechas salen de sus hijas. Sin Office.js.
 */

export function nivelDeWbs(wbs: string): number {
  const t = wbs.trim();
  return t ? t.split('.').length : 1;
}

export interface FilaJerarquia {
  id: string;
  wbs: string;
  resumen: boolean;
}

/** Para cada fila, el índice de su padre (la fila cuya WBS es la suya sin el último tramo) o −1. */
export function padres(filas: readonly FilaJerarquia[]): number[] {
  const porWbs = new Map<string, number>();
  filas.forEach((f, i) => { if (f.wbs.trim()) porWbs.set(f.wbs.trim(), i); });
  return filas.map((f) => {
    const w = f.wbs.trim();
    const k = w.lastIndexOf('.');
    return k > 0 ? (porWbs.get(w.slice(0, k)) ?? -1) : -1;
  });
}

/** Las descendientes de cada fila resumen (por prefijo de WBS). */
export function descendientes(filas: readonly FilaJerarquia[], i: number): number[] {
  const w = filas[i]?.wbs.trim();
  if (!w) return [];
  const pref = `${w}.`;
  const r: number[] = [];
  filas.forEach((f, j) => { if (j !== i && f.wbs.trim().startsWith(pref)) r.push(j); });
  return r;
}

/**
 * Numera la WBS por esquema a partir del nivel de cada fila, en orden:
 * niveles [1, 2, 2, 1, 2] → 1, 1.1, 1.2, 2, 2.1. Un nivel que salta más de
 * uno se acerca al anterior + 1.
 */
export function renumerarWbs(niveles: readonly number[]): string[] {
  const contador: number[] = [];
  let previo = 0;
  return niveles.map((n0) => {
    const n = Math.max(1, Math.min(n0, previo + 1));
    contador.length = n;
    contador[n - 1] = (contador[n - 1] ?? 0) + 1;
    for (let k = 0; k < n - 1; k++) if (contador[k] === undefined) contador[k] = 1;
    previo = n;
    return contador.slice(0, n).join('.');
  });
}
