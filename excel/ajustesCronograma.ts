/**
 * Los ajustes de la simulación del cronograma (iteraciones, semilla,
 * muestreo) vistos desde la pestaña Configuración del panel. Siguen
 * guardados en la hoja Config del libro de cronograma: Configuración solo los
 * enseña y los escribe ahí, para que haya un único sitio donde cambiarlos
 * (prueba Q14 del 06/10: se cambiaban en Configuración y el cronograma seguía
 * con los de la hoja). Sin Office.js: entra la hoja y salen los cambios.
 */

import { ETIQUETAS_CONFIG, normalizar, type MatrizHoja } from './cronogramaHojas.ts';
import type { CambioHoja } from './edicionGantt.ts';

export interface AjustesCronograma {
  /** Número de iteraciones, o 'auto' (sube hasta que el P80 se estabiliza). */
  iteraciones: number | 'auto';
  semilla: number;
  muestreo: 'lhs' | 'monte-carlo';
}

export const AJUSTES_CRONOGRAMA_POR_DEFECTO: AjustesCronograma = { iteraciones: 5000, semilla: 12345, muestreo: 'lhs' };

const CLAVES = ['iteraciones', 'semilla', 'muestreo'] as const;
type Clave = (typeof CLAVES)[number];

function filaDe(hoja: MatrizHoja, clave: Clave): number {
  const buscada = normalizar(ETIQUETAS_CONFIG[clave]);
  return hoja.findIndex((f) => normalizar(f[0]) === buscada);
}

function enteroDe(v: unknown): number | null {
  const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(x) && Number.isInteger(x) ? x : null;
}

/** Lo que dice la hoja Config (lo que falta o no se entiende, por defecto). */
export function leerAjustesCronograma(hoja: MatrizHoja): AjustesCronograma {
  const r = { ...AJUSTES_CRONOGRAMA_POR_DEFECTO };
  const v = (c: Clave) => {
    const i = filaDe(hoja, c);
    return i < 0 ? undefined : hoja[i]?.[1];
  };
  const it = v('iteraciones');
  if (normalizar(it).startsWith('autom')) r.iteraciones = 'auto';
  else {
    const n = enteroDe(it);
    if (n !== null && n >= 100) r.iteraciones = n;
  }
  const se = enteroDe(v('semilla'));
  if (se !== null && se >= 0) r.semilla = se;
  const mu = v('muestreo');
  if (mu !== undefined && String(mu).trim() !== '') r.muestreo = normalizar(mu).startsWith('monte') ? 'monte-carlo' : 'lhs';
  return r;
}

const TEXTO_MUESTREO = { lhs: 'Hipercubo latino', 'monte-carlo': 'Monte Carlo' } as const;

/** Las celdas de Config que hay que escribir para que diga `nuevos`. */
export function cambiosAjustesCronograma(hoja: MatrizHoja, nuevos: Partial<AjustesCronograma>): CambioHoja[] {
  const cambios: CambioHoja[] = [];
  let final = hoja.length;
  for (const c of CLAVES) {
    if (nuevos[c] === undefined) continue;
    const valor = c === 'iteraciones' ? (nuevos.iteraciones === 'auto' ? 'Automático' : nuevos.iteraciones)
      : c === 'muestreo' ? TEXTO_MUESTREO[nuevos.muestreo as AjustesCronograma['muestreo']] : nuevos[c];
    const i = filaDe(hoja, c);
    if (i >= 0) cambios.push({ hoja: 'Config', op: 'celda', fila: i, col: 1, valor, antes: hoja[i]?.[1] ?? null });
    else cambios.push({ hoja: 'Config', op: 'insertar', fila: final++, valores: [ETIQUETAS_CONFIG[c], valor] });
  }
  return cambios;
}
