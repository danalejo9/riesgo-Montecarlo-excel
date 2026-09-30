/**
 * Lee el cronograma de las hojas «Actividades» y «Calendario» (P0), a partir
 * de sus valores tal como los devuelve Excel (`range.values`): números,
 * textos, booleanos y `''` para las vacías. Sin Office.js, para probarlo en
 * Node con el libro de pruebas del cronograma.
 *
 * Las columnas se reconocen por su encabezado, no por su posición, sin
 * distinguir mayúsculas ni tildes: el usuario puede reordenarlas, añadir las
 * suyas o borrar las opcionales. Lo que no se entiende se dice con la fila.
 */

import { leerPredecesoras } from './predecesoras.ts';
import { CALENDARIO_ESTANDAR } from './calendario.ts';
import type { Actividad, Calendario, Cronograma, ProblemaCronograma } from './tipos.ts';

export const HOJA_ACTIVIDADES = 'Actividades';
export const HOJA_CALENDARIO = 'Calendario';

type Celda = unknown;

/** Minúsculas, sin tildes ni espacios sobrantes. */
export function normalizar(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

type Campo = 'id' | 'nombre' | 'duracion' | 'predecesoras' | 'min' | 'masProbable' | 'max' | 'categoria' | 'costoPorDia' | 'costoFijo' | 'inicioNoAntesDe'
  | 'costoFijoMin' | 'costoFijoMax' | 'costoPorDiaMin' | 'costoPorDiaMax'
  | 'inicioNoDespuesDe' | 'terminarNoAntesDe' | 'terminarNoDespuesDe' | 'inicioReal' | 'finReal' | 'completado' | 'restante';

/** Cada campo con los encabezados que lo identifican (normalizados, por prefijo). */
const ENCABEZADOS: Array<[Campo, string[]]> = [
  ['id', ['id']],
  ['nombre', ['actividad', 'nombre', 'tarea']],
  // Antes que «duracion»: «Duración restante» empieza igual.
  ['restante', ['duracion restante', 'restante']],
  ['duracion', ['duracion']],
  ['predecesoras', ['predecesora']],
  ['masProbable', ['mas probable', 'probable']],
  ['min', ['minim', 'min ', 'min', 'optimista']],
  ['max', ['maxim', 'max ', 'max', 'pesimista']],
  ['categoria', ['categoria', 'frente']],
  // V4: antes que los costos: «Costo fijo mínimo» empieza como «Costo fijo».
  ['costoFijoMin', ['costo fijo min', 'coste fijo min']],
  ['costoFijoMax', ['costo fijo max', 'coste fijo max']],
  ['costoPorDiaMin', ['costo por dia min', 'coste por dia min', 'costo diario min', 'coste diario min']],
  ['costoPorDiaMax', ['costo por dia max', 'coste por dia max', 'costo diario max', 'coste diario max']],
  ['costoPorDia', ['costo por dia', 'coste por dia', 'costo diario', 'coste diario']],
  ['costoFijo', ['costo fijo', 'coste fijo']],
  ['inicioNoAntesDe', ['inicio no antes']],
  ['inicioNoDespuesDe', ['inicio no despues']],
  ['terminarNoAntesDe', ['terminar no antes', 'fin no antes']],
  ['terminarNoDespuesDe', ['terminar no despues', 'fin no despues', 'fecha limite']],
  ['inicioReal', ['inicio real', 'comienzo real']],
  ['finReal', ['fin real']],
  ['completado', ['% completado', 'completado', '% avance', 'avance']],
];

function campoDe(encabezado: unknown): Campo | undefined {
  const t = normalizar(encabezado);
  if (t === '') return undefined;
  for (const [campo, prefijos] of ENCABEZADOS) {
    if (prefijos.some((p) => (p === 'id' ? t === 'id' : t.startsWith(p)))) return campo;
  }
  return undefined;
}

/** Un número de una celda: número, o texto como `5`, `5,5`, `5d`, `5 días`. */
export function numeroDe(v: Celda): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(d|dia|día|dias|días)?\s*$/i.exec(v);
  return m ? Number((m[1] as string).replace(',', '.')) : undefined;
}

/**
 * Una tabla cualquiera con encabezado: busca en las 15 primeras filas la que
 * tenga las columnas `obligatorias` (por prefijo normalizado) y devuelve sus
 * filas con datos. La usan las hojas que no son «Actividades».
 */
export function leerHojaGenerica<C extends string>(
  valores: readonly (readonly Celda[])[],
  campos: Record<C, string[]>,
  obligatorias: NoInfer<C>[],
  primeraFila = 1,
): { ok: true; filas: Array<{ fila: number; celda: (c: C) => Celda }> } | { ok: false; error: string } {
  for (let f = 0; f < Math.min(15, valores.length); f++) {
    const cols = new Map<C, number>();
    (valores[f] ?? []).forEach((v, c) => {
      const t = normalizar(v);
      if (t === '') return;
      for (const [campo, prefijos] of Object.entries(campos) as Array<[C, string[]]>) {
        if (!cols.has(campo) && prefijos.some((p) => (p === 'id' ? t === 'id' : t.startsWith(p)))) {
          cols.set(campo, c);
          break;
        }
      }
    });
    if (!obligatorias.every((c) => cols.has(c))) continue;
    const filas: Array<{ fila: number; celda: (c: C) => Celda }> = [];
    const idCol = cols.get(obligatorias[0] as C) as number;
    for (let g = f + 1; g < valores.length; g++) {
      const fila = valores[g] ?? [];
      if (vacia(fila[idCol])) continue;
      filas.push({ fila: primeraFila + g, celda: (c) => (cols.has(c) ? fila[cols.get(c) as number] : undefined) });
    }
    return { ok: true, filas };
  }
  return { ok: false, error: `No se encuentra el encabezado: hacen falta las columnas ${obligatorias.map((c) => `«${c}»`).join(' y ')}` };
}

const vacia = (v: Celda) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export interface LecturaActividades {
  actividades: Actividad[];
  problemas: ProblemaCronograma[];
}

export function leerActividades(valores: readonly (readonly Celda[])[], primeraFila = 1): LecturaActividades {
  const problemas: ProblemaCronograma[] = [];
  const hoja = HOJA_ACTIVIDADES;

  // El encabezado: la primera de las 15 primeras filas con «ID» y «Duración».
  let filaEnc = -1;
  let columnas = new Map<Campo, number>();
  for (let f = 0; f < Math.min(15, valores.length); f++) {
    const m = new Map<Campo, number>();
    (valores[f] ?? []).forEach((v, c) => {
      const campo = campoDe(v);
      if (campo && !m.has(campo)) m.set(campo, c);
    });
    if (m.has('id') && m.has('duracion')) {
      filaEnc = f;
      columnas = m;
      break;
    }
  }
  if (filaEnc < 0) {
    return {
      actividades: [],
      problemas: [{ gravedad: 'error', hoja, mensaje: 'No se encuentra el encabezado: hacen falta al menos las columnas «ID» y «Duración»' }],
    };
  }

  const col = (fila: readonly Celda[], campo: Campo): Celda => {
    const c = columnas.get(campo);
    return c === undefined ? undefined : fila[c];
  };

  const actividades: Actividad[] = [];
  for (let f = filaEnc + 1; f < valores.length; f++) {
    const fila = valores[f] ?? [];
    const numFila = primeraFila + f;
    const idCrudo = col(fila, 'id');
    if (vacia(idCrudo)) {
      // Una fila sin ID pero con algo escrito es un olvido, no un separador.
      if (!vacia(col(fila, 'nombre')) || !vacia(col(fila, 'duracion'))) {
        problemas.push({ gravedad: 'aviso', hoja, fila: numFila, mensaje: `Fila ${numFila}: tiene datos pero no tiene ID; se ignora` });
      }
      continue;
    }
    const id = String(idCrudo).trim();
    const nombre = vacia(col(fila, 'nombre')) ? id : String(col(fila, 'nombre')).trim();
    const error = (mensaje: string) => problemas.push({ gravedad: 'error', hoja, fila: numFila, actividad: id, mensaje: `Fila ${numFila} («${id}»): ${mensaje}` });

    const duracion = numeroDe(col(fila, 'duracion'));
    if (duracion === undefined || duracion < 0) {
      error(`la duración «${String(col(fila, 'duracion') ?? '')}» no es un número de días válido`);
      continue;
    }

    const preds = leerPredecesoras(col(fila, 'predecesoras'));
    if (!preds.ok) {
      error(`predecesoras: ${preds.error}`);
      continue;
    }

    const act: Actividad = { id, nombre, duracion, predecesoras: preds.relaciones, fila: numFila };

    const min = col(fila, 'min');
    const mp = col(fila, 'masProbable');
    const max = col(fila, 'max');
    if (!vacia(min) || !vacia(max) || !vacia(mp)) {
      const a = numeroDe(min);
      const m = vacia(mp) ? duracion : numeroDe(mp);
      const b = numeroDe(max);
      if (a === undefined || b === undefined || m === undefined) {
        error('para la incertidumbre hacen falta mínimo y máximo (y más probable, o se usa la duración)');
        continue;
      }
      if (!(a <= m && m <= b) || a < 0) {
        error(`la incertidumbre debe cumplir 0 ≤ mínimo ≤ más probable ≤ máximo (${a}; ${m}; ${b})`);
        continue;
      }
      act.tresPuntos = { min: a, masProbable: m, max: b };
    }

    if (!vacia(col(fila, 'categoria'))) act.categoria = String(col(fila, 'categoria')).trim();
    let costoMal = false;
    for (const [campo, texto] of [['costoPorDia', 'el costo por día'], ['costoFijo', 'el costo fijo']] as const) {
      const costo = col(fila, campo);
      if (vacia(costo)) continue;
      const v = numeroDe(costo);
      if (v === undefined) {
        error(`${texto} «${String(costo)}» no es un número`);
        costoMal = true;
        break;
      }
      act[campo] = v;
    }
    if (costoMal) continue;
    // V4: mínimo y máximo de cada costo; el más probable es el costo de su columna.
    for (const [campo, rango, cmin, cmax, texto] of [
      ['costoFijo', 'costoFijoRango', 'costoFijoMin', 'costoFijoMax', 'costo fijo'],
      ['costoPorDia', 'costoPorDiaRango', 'costoPorDiaMin', 'costoPorDiaMax', 'costo por día'],
    ] as const) {
      const crudoMin = col(fila, cmin);
      const crudoMax = col(fila, cmax);
      if (vacia(crudoMin) && vacia(crudoMax)) continue;
      const a = numeroDe(crudoMin);
      const b = numeroDe(crudoMax);
      const m = act[campo];
      if (a === undefined || b === undefined) {
        error(`para la incertidumbre del ${texto} hacen falta su mínimo y su máximo, como números`);
        costoMal = true;
        break;
      }
      if (m === undefined) {
        error(`hay mínimo y máximo del ${texto}, pero falta el ${texto} (el valor más probable)`);
        costoMal = true;
        break;
      }
      if (!(a <= m && m <= b)) {
        error(`el ${texto} debe cumplir mínimo ≤ ${texto} ≤ máximo (${a}; ${m}; ${b})`);
        costoMal = true;
        break;
      }
      if (b > a) act[rango] = { min: a, max: b };
    }
    if (costoMal) continue;
    let fallo = false;
    for (const campo of ['inicioNoAntesDe', 'inicioNoDespuesDe', 'terminarNoAntesDe', 'terminarNoDespuesDe', 'inicioReal', 'finReal'] as const) {
      const v = col(fila, campo);
      if (vacia(v)) continue;
      if (typeof v !== 'number') {
        error(`«${NOMBRE_CAMPO[campo]}» debe ser una fecha`);
        fallo = true;
        break;
      }
      act[campo] = v;
    }
    if (fallo) continue;
    const comp = col(fila, 'completado');
    if (!vacia(comp)) {
      const v = typeof comp === 'string' && /%\s*$/.test(comp) ? (numeroDe(comp.replace('%', '')) ?? NaN) / 100 : numeroDe(comp);
      const f = v !== undefined && v > 1 ? v / 100 : v;
      if (f === undefined || Number.isNaN(f) || f < 0 || f > 1) {
        error('«% completado» debe estar entre 0 % y 100 %');
        continue;
      }
      act.completado = f;
    }
    const rest = col(fila, 'restante');
    if (!vacia(rest)) {
      const v = numeroDe(rest);
      if (v === undefined || v < 0) {
        error('«Duración restante» debe ser un número de días');
        continue;
      }
      act.restante = v;
    }
    if (act.finReal !== undefined && act.inicioReal !== undefined && act.finReal < act.inicioReal) {
      error('el fin real es anterior al inicio real');
      continue;
    }
    if ((act.completado !== undefined || act.restante !== undefined) && act.inicioReal === undefined && act.finReal === undefined) {
      error('tiene avance pero no tiene inicio real');
      continue;
    }
    actividades.push(act);
  }
  if (actividades.length === 0 && problemas.every((p) => p.gravedad !== 'error')) {
    problemas.push({ gravedad: 'error', hoja, mensaje: 'La hoja no tiene ninguna actividad debajo del encabezado' });
  }
  return { actividades, problemas };
}

const NOMBRE_CAMPO = {
  inicioNoAntesDe: 'Inicio no antes de',
  inicioNoDespuesDe: 'Inicio no después de',
  terminarNoAntesDe: 'Terminar no antes de',
  terminarNoDespuesDe: 'Terminar no después de',
  inicioReal: 'Inicio real',
  finReal: 'Fin real',
} as const;

const DIAS: Array<[string, number]> = [
  ['domingo', 0], ['lunes', 1], ['martes', 2], ['miercoles', 3], ['jueves', 4], ['viernes', 5], ['sabado', 6],
];

function siNo(v: Celda): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const t = normalizar(v);
  if (['si', 's', 'x', 'yes', 'true', 'verdadero', 'laborable'].includes(t)) return true;
  if (['no', 'n', '', 'false', 'falso'].includes(t)) return false;
  return undefined;
}

export interface LecturaCalendario {
  inicio?: number;
  fechaCorte?: number;
  costoIndirectoDia?: number;
  calendario: Calendario;
  problemas: ProblemaCronograma[];
}

/**
 * La hoja «Calendario»: etiquetas en la columna A y valores en la B.
 * «Inicio del proyecto» (fecha), una fila por día de la semana («Lunes»:
 * Sí/No) y «Festivos», con las fechas debajo, en la columna A, hasta la
 * primera vacía. Lo que falte toma el valor estándar (lunes a viernes, sin
 * festivos); la fecha de inicio es obligatoria.
 */
export function leerCalendario(valores: readonly (readonly Celda[])[] | undefined, primeraFila = 1): LecturaCalendario {
  const hoja = HOJA_CALENDARIO;
  const problemas: ProblemaCronograma[] = [];
  if (!valores) {
    return {
      calendario: CALENDARIO_ESTANDAR,
      problemas: [{ gravedad: 'error', hoja, mensaje: 'Falta la hoja «Calendario» con la fecha de inicio del proyecto' }],
    };
  }
  let inicio: number | undefined;
  let fechaCorte: number | undefined;
  let costoIndirectoDia: number | undefined;
  const laborables = [...CALENDARIO_ESTANDAR.laborables];
  const festivos = new Set<number>();
  for (let f = 0; f < valores.length; f++) {
    const fila = valores[f] ?? [];
    const etiqueta = normalizar(fila[0]);
    if (etiqueta.startsWith('inicio del proyecto') || etiqueta === 'inicio') {
      if (typeof fila[1] === 'number') inicio = fila[1];
      else problemas.push({ gravedad: 'error', hoja, fila: primeraFila + f, mensaje: `Fila ${primeraFila + f}: el inicio del proyecto debe ser una fecha` });
      continue;
    }
    if (etiqueta.startsWith('fecha de corte') || etiqueta.startsWith('fecha de estado') || etiqueta.startsWith('fecha de datos')) {
      if (typeof fila[1] === 'number') fechaCorte = fila[1];
      else if (!vacia(fila[1])) problemas.push({ gravedad: 'error', hoja, fila: primeraFila + f, mensaje: `Fila ${primeraFila + f}: la fecha de corte debe ser una fecha` });
      continue;
    }
    if (etiqueta.startsWith('costo indirecto') || etiqueta.startsWith('coste indirecto')) {
      if (vacia(fila[1])) continue;
      const v = numeroDe(fila[1]);
      if (v === undefined || v < 0) problemas.push({ gravedad: 'error', hoja, fila: primeraFila + f, mensaje: `Fila ${primeraFila + f}: el costo indirecto por día debe ser un número` });
      else costoIndirectoDia = v;
      continue;
    }
    const dia = DIAS.find(([n]) => etiqueta === n);
    if (dia) {
      const v = siNo(fila[1]);
      if (v === undefined) problemas.push({ gravedad: 'error', hoja, fila: primeraFila + f, mensaje: `Fila ${primeraFila + f}: «${String(fila[1])}» — escribe Sí o No` });
      else laborables[dia[1]] = v;
      continue;
    }
    if (etiqueta.startsWith('festivo')) {
      for (let g = f + 1; g < valores.length; g++) {
        const v = (valores[g] ?? [])[0];
        if (vacia(v)) break;
        if (typeof v === 'number') festivos.add(Math.floor(v));
        else problemas.push({ gravedad: 'aviso', hoja, fila: primeraFila + g, mensaje: `Fila ${primeraFila + g}: «${String(v)}» no es una fecha; se ignora` });
      }
      break;
    }
  }
  if (inicio === undefined && problemas.every((p) => !p.mensaje.includes('inicio'))) {
    problemas.push({ gravedad: 'error', hoja, mensaje: 'Falta «Inicio del proyecto» (columna A) con su fecha (columna B)' });
  }
  if (!laborables.some(Boolean)) problemas.push({ gravedad: 'error', hoja, mensaje: 'Ningún día de la semana es laborable' });
  return {
    inicio,
    ...(fechaCorte !== undefined ? { fechaCorte } : {}),
    ...(costoIndirectoDia !== undefined ? { costoIndirectoDia } : {}),
    calendario: { laborables, festivos },
    problemas,
  };
}

/** Las dos hojas juntas. `cronograma` solo si no hay errores. */
export function leerCronograma(
  actividades: readonly (readonly Celda[])[] | undefined,
  calendario: readonly (readonly Celda[])[] | undefined,
): { cronograma?: Cronograma; problemas: ProblemaCronograma[] } {
  if (!actividades) {
    return { problemas: [{ gravedad: 'error', hoja: HOJA_ACTIVIDADES, mensaje: 'Falta la hoja «Actividades». Crea una con «Plantilla de cronograma»' }] };
  }
  const a = leerActividades(actividades);
  const c = leerCalendario(calendario);
  const problemas = [...c.problemas, ...a.problemas];
  const conAvance = a.actividades.filter((x) => x.inicioReal !== undefined || x.finReal !== undefined);
  if (conAvance.length > 0 && c.fechaCorte === undefined) {
    problemas.push({ gravedad: 'error', hoja: HOJA_CALENDARIO, mensaje: 'Hay fechas reales en «Actividades» pero falta la «Fecha de corte» en «Calendario» (el día desde el que se cuenta lo que queda)' });
  }
  if (c.fechaCorte !== undefined) {
    for (const x of conAvance) {
      if (x.inicioReal !== undefined && x.inicioReal > c.fechaCorte) {
        problemas.push({ gravedad: 'error', hoja: HOJA_ACTIVIDADES, fila: x.fila, actividad: x.id, mensaje: `Fila ${x.fila} («${x.id}»): el inicio real es posterior a la fecha de corte` });
      }
      if (x.finReal !== undefined && x.finReal >= c.fechaCorte) {
        problemas.push({ gravedad: 'error', hoja: HOJA_ACTIVIDADES, fila: x.fila, actividad: x.id, mensaje: `Fila ${x.fila} («${x.id}»): el fin real debe ser anterior a la fecha de corte` });
      }
    }
  }
  if (problemas.some((p) => p.gravedad === 'error') || c.inicio === undefined) return { problemas };
  return {
    cronograma: {
      inicio: c.inicio,
      calendario: c.calendario,
      actividades: a.actividades,
      ...(c.fechaCorte !== undefined ? { fechaCorte: c.fechaCorte } : {}),
      ...(c.costoIndirectoDia !== undefined ? { costoIndirectoDia: c.costoIndirectoDia } : {}),
    },
    problemas,
  };
}
