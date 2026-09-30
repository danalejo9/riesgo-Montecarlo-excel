/**
 * Rellenar los rangos vacíos (mínimo, más probable, máximo) de la hoja
 * «Actividades» con un porcentaje de la duración. Un cronograma importado de
 * MS Project o P6 no trae incertidumbre, y sin ella la simulación no enseña
 * nada; esto da un punto de partida para que el equipo lo afine después
 * (el chequeo de salud avisa mientras falten).
 *
 * Por defecto −10 % / +25 %: asimétrico, porque en obra y en proyectos las
 * duraciones se alargan más de lo que se acortan (sesgo optimista). Solo se
 * tocan las filas con duración > 0 y sin mínimo ni máximo, y nunca las
 * terminadas.
 */

import { leerActividades } from './lectorTabla.ts';

export interface CambioCelda {
  /** Fila y columna desde 0 en la matriz de la hoja. */
  fila: number;
  col: number;
  valor: number;
}

export function completarRangos(
  valores: readonly (readonly unknown[])[],
  menos = 0.1,
  mas = 0.25,
): { cambios: CambioCelda[]; actividades: number } | { error: string } {
  if (!(menos >= 0 && menos < 1) || !(mas >= 0)) return { error: 'Los porcentajes deben ser 0 % ≤ menos < 100 % y más ≥ 0 %' };
  // El encabezado y sus columnas, igual que el lector.
  let filaEnc = -1;
  let cols: { dur: number; min: number; mp: number; max: number; finReal: number } | null = null;
  const norm = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  for (let f = 0; f < Math.min(15, valores.length) && !cols; f++) {
    const fila = (valores[f] ?? []).map(norm);
    const buscar = (pred: (t: string) => boolean) => fila.findIndex(pred);
    const id = buscar((t) => t === 'id');
    const dur = buscar((t) => t.startsWith('duracion') && !t.startsWith('duracion restante'));
    if (id < 0 || dur < 0) continue;
    filaEnc = f;
    cols = {
      dur,
      min: buscar((t) => t.startsWith('minim') || t === 'min' || t.startsWith('optimista')),
      mp: buscar((t) => t.startsWith('mas probable') || t.startsWith('probable')),
      max: buscar((t) => t.startsWith('maxim') || t === 'max' || t.startsWith('pesimista')),
      finReal: buscar((t) => t.startsWith('fin real')),
    };
  }
  if (!cols || filaEnc < 0) return { error: 'No se encuentra el encabezado de «Actividades» (hacen falta «ID» y «Duración»)' };
  if (cols.min < 0 || cols.max < 0 || cols.mp < 0) return { error: 'Faltan las columnas «Mínimo», «Más probable» y «Máximo» en «Actividades»' };
  // Solo si la hoja se lee sin errores: no se rellena sobre datos que no se entienden.
  const lectura = leerActividades(valores);
  if (lectura.problemas.some((p) => p.gravedad === 'error')) return { error: 'Corrige primero los errores de «Actividades» (pulsa Calcular cronograma para verlos)' };

  const vacia = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const cambios: CambioCelda[] = [];
  let actividades = 0;
  const redondo = (x: number) => Math.round(x * 100) / 100;
  for (let f = filaEnc + 1; f < valores.length; f++) {
    const fila = valores[f] ?? [];
    const d = fila[cols.dur];
    if (typeof d !== 'number' || !(d > 0)) continue;
    if (cols.finReal >= 0 && !vacia(fila[cols.finReal])) continue;
    if (!vacia(fila[cols.min]) || !vacia(fila[cols.max])) continue;
    actividades++;
    cambios.push({ fila: f, col: cols.min, valor: redondo(d * (1 - menos)) });
    if (vacia(fila[cols.mp])) cambios.push({ fila: f, col: cols.mp, valor: d });
    cambios.push({ fila: f, col: cols.max, valor: redondo(d * (1 + mas)) });
  }
  return { cambios, actividades };
}
