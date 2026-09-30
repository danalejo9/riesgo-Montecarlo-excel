/**
 * Hitos contractuales y multas por retraso (W1). La hoja «Hitos» dice, para
 * las actividades que el contrato fija (entregas, actas, puestas en
 * servicio), la fecha contractual y la multa por cada día de retraso, con su
 * tope (la cláusula penal de los contratos, típica de la obra pública).
 *
 * En cada iteración, si el hito termina después de su fecha contractual, la
 * multa es `min(tope, multa por día × días naturales de retraso)` y se suma
 * al costo de esa iteración: entra en el P80 del costo y en la probabilidad
 * conjunta (JCL). Por hito se da la probabilidad de cumplir la fecha, su P80
 * y la multa esperada. La fecha contractual no es una restricción del
 * cronograma (para eso está «Terminar no después de»): es contra lo que se
 * mide.
 */

import { leerHojaGenerica, normalizar, numeroDe } from './lectorTabla.ts';
import type { HojaAEscribir } from './hojas.ts';
import { FORMATO_FECHA } from './hojas.ts';
import type { Actividad, ProblemaCronograma } from './tipos.ts';

export const HOJA_HITOS = 'Hitos';

export interface HitoContractual {
  /** ID de la actividad (un hito o cualquier actividad cuyo fin fija el contrato). */
  id: string;
  /** Fecha contractual (serie): el hito debe terminar ese día o antes. */
  fecha: number;
  /** Multa por día natural de retraso. */
  multaDia?: number;
  /** Tope de la multa (total). */
  tope?: number;
}

export function plantillaHitos(): HojaAEscribir {
  return {
    nombre: HOJA_HITOS,
    valores: [
      ['Hitos contractuales — el ID de la actividad (de «Actividades»), la fecha que fija el contrato y, si hay, la multa por día natural de retraso y su tope'],
      [''],
      ['Hito (ID)', 'Fecha contractual', 'Multa por día de retraso', 'Tope de la multa', 'Nota'],
    ],
    formatos: { 0: '@', 1: FORMATO_FECHA },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [12, 18, 24, 18, 40],
  };
}

export function leerHitos(valores: readonly (readonly unknown[])[] | undefined, actividades: readonly Actividad[]): { hitos: HitoContractual[]; problemas: ProblemaCronograma[] } {
  const hoja = HOJA_HITOS;
  if (!valores || valores.length === 0) return { hitos: [], problemas: [] };
  const t = leerHojaGenerica(valores, {
    id: ['hito', 'id', 'actividad'],
    fecha: ['fecha contractual', 'fecha limite', 'fecha'],
    multa: ['multa por dia', 'multa diaria', 'multa'],
    tope: ['tope'],
  }, ['id', 'fecha']);
  if (!t.ok) return { hitos: [], problemas: [{ gravedad: 'error', hoja, mensaje: `«${hoja}»: ${t.error}` }] };
  const ids = new Map(actividades.map((a) => [normalizar(a.id), a.id]));
  const hitos: HitoContractual[] = [];
  const problemas: ProblemaCronograma[] = [];
  for (const f of t.filas) {
    const crudo = String(f.celda('id')).trim();
    const error = (m: string) => problemas.push({ gravedad: 'error', hoja, fila: f.fila, mensaje: `«${hoja}», fila ${f.fila} («${crudo}»): ${m}` });
    const id = ids.get(normalizar(crudo));
    if (!id) { error('no es el ID de una actividad de «Actividades»'); continue; }
    if (hitos.some((h) => h.id === id)) { error('el hito está repetido'); continue; }
    const fecha = f.celda('fecha');
    if (typeof fecha !== 'number') { error('la fecha contractual debe ser una fecha'); continue; }
    const vacio = (x: unknown) => x === '' || x === undefined || x === null;
    const multa = vacio(f.celda('multa')) ? undefined : numeroDe(f.celda('multa'));
    const tope = vacio(f.celda('tope')) ? undefined : numeroDe(f.celda('tope'));
    if ((!vacio(f.celda('multa')) && (multa === undefined || multa < 0)) || (!vacio(f.celda('tope')) && (tope === undefined || tope < 0))) {
      error('la multa y el tope deben ser números (dinero) no negativos');
      continue;
    }
    hitos.push({ id, fecha: Math.floor(fecha), ...(multa !== undefined && multa > 0 ? { multaDia: multa } : {}), ...(tope !== undefined ? { tope } : {}) });
  }
  return { hitos, problemas };
}

/** La multa de un hito que termina el día `fin` (serie): días naturales de retraso × multa, con tope. */
export function multaDe(h: HitoContractual, fin: number): number {
  if (!h.multaDia) return 0;
  const dias = Math.floor(fin) - h.fecha;
  if (dias <= 0) return 0;
  return Math.min(h.tope ?? Infinity, dias * h.multaDia);
}
