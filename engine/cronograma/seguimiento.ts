/**
 * Seguimiento en el tiempo (V5): cada simulación que el usuario decide
 * guardar queda como una **instantánea** en la hoja «Cronograma
 * (seguimiento)», con su fecha de corte. La hoja es el almacén (viaja con el
 * libro y se lee sin el complemento) y, a la vez, el informe mensual: la
 * tendencia del P50/P80, de la probabilidad de cumplir y del costo.
 *
 * Una instantánea por fecha de corte: volver a guardar con el mismo corte
 * la reemplaza (se re-simuló el mismo mes). Sin fecha de corte, se añade
 * con la fecha del día.
 */

import { textoFecha } from '../modelo/fechas.ts';
import { formatoMoneda, MONEDA_POR_DEFECTO, textoMoneda } from '../modelo/moneda.ts';
import { FORMATO_FECHA, type HojaAEscribir } from './hojas.ts';
import { leerHojaGenerica, normalizar, numeroDe } from './lectorTabla.ts';
import type { ResultadoSimulacionPlazo } from './simulacion.ts';

export const HOJA_SEGUIMIENTO = 'Cronograma (seguimiento)';

export interface Instantanea {
  /** Fecha del eje de la tendencia: la de corte o, sin ella, el día en que se guardó. */
  referencia: number;
  fechaCorte?: number;
  /** Fecha y hora (número de serie de Excel) en que se guardó. */
  guardada: number;
  escenario: 'antes' | 'despues';
  iteraciones: number;
  finCronograma: number;
  p50: number;
  p80: number;
  p90: number;
  /** P(terminar no más tarde que el cronograma). */
  probCumplir: number;
  /** Días laborables del P80 sobre el cronograma. */
  reservaDias: number;
  costoP50?: number;
  costoP80?: number;
  jcl?: number;
  /** Texto libre del usuario (se conserva al reescribir la hoja). */
  nota?: string;
}

/** Fecha y hora locales como número de serie de Excel (con decimales: la hora). */
export function serieLocal(d: Date): number {
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export function instantaneaDe(
  r: ResultadoSimulacionPlazo,
  e: { fechaCorte?: number; escenario: 'antes' | 'despues'; ahora: number },
): Instantanea {
  return {
    referencia: e.fechaCorte ?? Math.floor(e.ahora),
    ...(e.fechaCorte !== undefined ? { fechaCorte: e.fechaCorte } : {}),
    guardada: e.ahora,
    escenario: e.escenario,
    iteraciones: r.iteraciones,
    finCronograma: r.determinista.fecha,
    p50: r.fechas.p50,
    p80: r.fechas.p80,
    p90: r.fechas.p90,
    probCumplir: r.probDeterminista,
    reservaDias: r.dias.p80 - Math.ceil(r.determinista.dias - 1e-9),
    ...(r.costos ? { costoP50: r.costos.p50, costoP80: r.costos.p80, jcl: r.costos.jclP80 } : {}),
  };
}

const ESCENARIO = { antes: 'Antes de mitigar', despues: 'Después de mitigar' } as const;

export const ENCABEZADO_SEGUIMIENTO = [
  'Fecha de referencia', 'Fin del cronograma', 'P50', 'P80', 'P90', 'Prob. de cumplir', 'Reserva al P80 (días lab.)',
  'Costo P50', 'Costo P80', 'JCL', 'Escenario', 'Iteraciones', 'Fecha de corte', 'Guardada el', 'Nota',
];

/** Las instantáneas de la hoja (vacía o sin hoja: ninguna), ordenadas por fecha de referencia. */
export function leerSeguimiento(valores?: readonly (readonly unknown[])[]): Instantanea[] {
  if (!valores || valores.length === 0) return [];
  const t = leerHojaGenerica(valores, {
    referencia: ['fecha de referencia'],
    finCronograma: ['fin del cronograma'],
    p50: ['p50'],
    p80: ['p80'],
    p90: ['p90'],
    prob: ['prob'],
    reserva: ['reserva'],
    costoP50: ['costo p50', 'coste p50'],
    costoP80: ['costo p80', 'coste p80'],
    jcl: ['jcl'],
    escenario: ['escenario'],
    iteraciones: ['iteraciones'],
    corte: ['fecha de corte'],
    guardada: ['guardada'],
    nota: ['nota'],
  }, ['referencia', 'p80']);
  if (!t.ok) return [];
  const out: Instantanea[] = [];
  for (const f of t.filas) {
    const n = (c: Parameters<typeof f.celda>[0]) => numeroDe(f.celda(c));
    const referencia = n('referencia');
    const p80 = n('p80');
    if (referencia === undefined || p80 === undefined) continue;
    const corte = n('corte');
    const nota = f.celda('nota');
    const costoP50 = n('costoP50');
    const costoP80 = n('costoP80');
    const jcl = n('jcl');
    out.push({
      referencia,
      ...(corte !== undefined ? { fechaCorte: corte } : {}),
      guardada: n('guardada') ?? referencia,
      escenario: normalizar(f.celda('escenario')).startsWith('despues') ? 'despues' : 'antes',
      iteraciones: n('iteraciones') ?? 0,
      finCronograma: n('finCronograma') ?? NaN,
      p50: n('p50') ?? NaN,
      p80,
      p90: n('p90') ?? NaN,
      probCumplir: n('prob') ?? NaN,
      reservaDias: n('reserva') ?? NaN,
      ...(costoP50 !== undefined ? { costoP50 } : {}),
      ...(costoP80 !== undefined ? { costoP80 } : {}),
      ...(jcl !== undefined ? { jcl } : {}),
      ...(typeof nota === 'string' && nota.trim() ? { nota: nota.trim() } : {}),
    });
  }
  return ordenar(out);
}

const ordenar = (l: Instantanea[]) => [...l].sort((a, b) => a.referencia - b.referencia || a.guardada - b.guardada);

/**
 * Añade una instantánea. Si ya hay una con la misma fecha de corte y el
 * mismo escenario, la reemplaza (conservando su nota).
 */
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

const vacio = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : v);

export function hojaSeguimiento(lista: readonly Instantanea[], codigoMoneda = MONEDA_POR_DEFECTO): HojaAEscribir {
  const dinero = formatoMoneda(codigoMoneda);
  const filas = lista.map((x) => [
    x.referencia, vacio(x.finCronograma), vacio(x.p50), x.p80, vacio(x.p90), vacio(x.probCumplir), vacio(x.reservaDias),
    vacio(x.costoP50), vacio(x.costoP80), vacio(x.jcl), ESCENARIO[x.escenario], x.iteraciones || '', vacio(x.fechaCorte), x.guardada, x.nota ?? '',
  ]);
  return {
    nombre: HOJA_SEGUIMIENTO,
    valores: [
      ['Seguimiento del riesgo del cronograma — una fila por instantánea («Guardar instantánea» en el panel). La columna «Nota» es tuya: se conserva.'],
      [''],
      ENCABEZADO_SEGUIMIENTO,
      ...filas,
    ],
    formatos: {
      0: FORMATO_FECHA, 1: FORMATO_FECHA, 2: FORMATO_FECHA, 3: FORMATO_FECHA, 4: FORMATO_FECHA, 5: '0%', 7: dinero, 8: dinero, 9: '0%',
      12: FORMATO_FECHA, 13: 'dd/mm/yyyy hh:mm',
    },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [18, 18, 12, 12, 12, 15, 22, 15, 15, 8, 18, 11, 14, 17, 40],
    ...(lista.length >= 2
      ? {
          graficos: [{
            titulo: 'Tendencia: fin del cronograma, P50 y P80', fila: 2, col: 0, filas: lista.length + 1, series: 3, encabezado: true,
            anclaFila: 4 + lista.length, anclaCol: 0, tipo: 'lineas' as const, formatoX: FORMATO_FECHA, formatoY: FORMATO_FECHA,
          }],
        }
      : {}),
  };
}

const dif = (a: number, b: number) => Math.round(b - a);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** La tendencia en palabras: la última instantánea contra la anterior y, si hay más, la racha. */
export function tendencia(lista: readonly Instantanea[], codigoMoneda = MONEDA_POR_DEFECTO): string[] {
  if (lista.length < 2) return [];
  const u = lista[lista.length - 1] as Instantanea;
  const a = lista[lista.length - 2] as Instantanea;
  const out: string[] = [];
  const desde = a.fechaCorte !== undefined ? `el corte del ${textoFecha(a.fechaCorte)}` : `la instantánea del ${textoFecha(a.referencia)}`;
  const d = dif(a.p80, u.p80);
  out.push(d === 0
    ? `Desde ${desde}, el P80 no se ha movido (${textoFecha(u.p80)}).`
    : `Desde ${desde}, el P80 se ha ${d > 0 ? 'retrasado' : 'adelantado'} ${plural(Math.abs(d), 'día', 'días')} de calendario: del ${textoFecha(a.p80)} al ${textoFecha(u.p80)}.`);
  if (Number.isFinite(a.probCumplir) && Number.isFinite(u.probCumplir) && Math.round(a.probCumplir * 100) !== Math.round(u.probCumplir * 100)) {
    out.push(`La probabilidad de cumplir el cronograma ${u.probCumplir > a.probCumplir ? 'subió' : 'bajó'} del ${Math.round(a.probCumplir * 100)} % al ${Math.round(u.probCumplir * 100)} %.`);
  }
  if (a.costoP80 !== undefined && u.costoP80 !== undefined && Math.round(u.costoP80) !== Math.round(a.costoP80)) {
    const c = u.costoP80 - a.costoP80;
    out.push(`El P80 del costo ${c > 0 ? 'subió' : 'bajó'} ${textoMoneda(Math.abs(c), codigoMoneda)}, a ${textoMoneda(u.costoP80, codigoMoneda)}.`);
  }
  // La racha: cuántas instantáneas seguidas el P80 se ha movido en el mismo sentido.
  let racha = 1;
  const sentido = Math.sign(d);
  for (let i = lista.length - 2; i > 0 && sentido !== 0; i--) {
    if (Math.sign(dif((lista[i - 1] as Instantanea).p80, (lista[i] as Instantanea).p80)) !== sentido) break;
    racha++;
  }
  if (racha >= 3) {
    const primera = lista[lista.length - 1 - racha] as Instantanea;
    out.push(`Es la ${racha}.ª instantánea seguida en que el P80 se ${sentido > 0 ? 'retrasa' : 'adelanta'}: ${plural(Math.abs(dif(primera.p80, u.p80)), 'día', 'días')} en total desde el ${textoFecha(primera.referencia)}.`);
  }
  return out;
}
