/**
 * La hoja `Resultados_Cronograma` (QRSA, Q1.5): supuestos, advertencias de
 * calidad, fin del proyecto e hitos con sus percentiles, tornado por
 * eliminación de riesgos, índices por actividad y convergencia. Sin
 * Office.js: arma la matriz de valores y formatos que `cronogramaLibro.ts`
 * escribe de una vez. Se regenera entera en cada simulación (nunca se edita
 * a mano).
 */

import {
  convergenciaP80, indicesActividades, resumirTiempo,
  type ChequeoCalidad, type ModeloCronograma, type ResumenTiempo, type SimulacionCronograma,
} from '../engine/cronograma/index.ts';
import { FORMATO_FECHA, type Celda } from './cronogramaHojas.ts';

export interface HojaResultados {
  valores: Celda[][];
  formatos: (string | null)[][];
  /** Filas (0-based) en negrita: títulos de sección y encabezados de tabla. */
  negritas: number[];
  /** Filas de título de sección (0-based), para destacarlas. */
  titulos: number[];
  /** Celdas con el semáforo de calidad: [fila, columna, estado]. */
  semaforos: [number, number, 'verde' | 'amarillo' | 'rojo'][];
  /** Rango de la curva S del fin (para el gráfico), en notación A1. */
  rangoCurva: string | null;
}

const ANCHO = 9;
const PCT = '0.0%';
const DIAS = '0.0';

export interface DatosResultados {
  sim: SimulacionCronograma;
  modelo: ModeloCronograma;
  calidad: ChequeoCalidad;
  /** Número de serie de la fecha y hora de la corrida. */
  ahora: number;
  version: string;
}

export function resumenesDe(sim: SimulacionCronograma, modelo: ModeloCronograma): { fin: ResumenTiempo; hitos: ResumenTiempo[] } {
  const meta = modelo.configuracion.fechaMeta;
  const fin = resumirTiempo(sim.fin, sim.deterministico.fin, meta);
  const hitos = sim.hitos.map((h) => {
    const det = sim.deterministico.filas.find((f) => f.id === h.id)?.fin ?? NaN;
    return resumirTiempo(h, det);
  });
  return { fin, hitos };
}

export function hojaResultados(d: DatosResultados): HojaResultados {
  const { sim, modelo, calidad } = d;
  const cfg = modelo.configuracion;
  const valores: Celda[][] = [];
  const formatos: (string | null)[][] = [];
  const negritas: number[] = [];
  const titulos: number[] = [];
  const semaforos: HojaResultados['semaforos'] = [];
  const fila = (vals: Celda[], fmts: (string | null)[] = [], negrita = false) => {
    const v = [...vals];
    while (v.length < ANCHO) v.push(null);
    const f = [...fmts];
    while (f.length < ANCHO) f.push(null);
    if (negrita) negritas.push(valores.length);
    valores.push(v);
    formatos.push(f);
    return valores.length - 1;
  };
  const titulo = (t: string) => {
    fila([]);
    const i = fila([t], [], true);
    titulos.push(i);
  };

  const i0 = fila(['Resultados del cronograma'], [], true);
  titulos.push(i0);
  fila(['Hoja generada por el complemento en cada simulación: no la edite a mano.']);

  titulo('Supuestos de la corrida');
  fila(['Fecha de la corrida', d.ahora], [null, 'dd/mm/yyyy hh:mm']);
  fila(['Versión del complemento', d.version]);
  fila(['Fecha de inicio', modelo.red.inicio], [null, FORMATO_FECHA]);
  fila(['Calendario del proyecto', modelo.red.calendarioProyecto ?? modelo.red.calendarios[0]?.id ?? '']);
  fila(['Iteraciones', sim.iteraciones], [null, '#,##0']);
  fila(['Semilla', cfg.semilla]);
  fila(['Muestreo', cfg.metodo === 'lhs' ? 'Hipercubo latino' : 'Monte Carlo']);
  fila(['Duraciones simuladas', cfg.redondeo === 'entero' ? 'Redondeadas al día' : 'Con decimales']);
  fila(['Restricciones duras', cfg.ignorarRestriccionesDuras ? 'Ignoradas en la simulación' : 'Respetadas']);
  fila(['Actividades / relaciones / riesgos', `${sim.red.n} / ${sim.red.relPred.length} / ${modelo.riesgos.length}`]);
  fila(['Tiempo de cálculo (s)', sim.milisegundos / 1000], [null, '0.00']);

  titulo('Advertencias de calidad del cronograma');
  const avisos = calidad.criterios.filter((c) => c.estado !== 'verde');
  if (avisos.length === 0) fila(['Todos los criterios en verde.']);
  else {
    fila(['Estado', 'Criterio', 'Detalle'], [], true);
    for (const c of avisos) {
      const i = fila([c.estado === 'rojo' ? 'Rojo' : 'Amarillo', c.criterio, c.detalle]);
      semaforos.push([i, 0, c.estado]);
    }
  }

  const { fin, hitos } = resumenesDe(sim, modelo);
  const bloqueTiempo = (r: ResumenTiempo, t: string) => {
    titulo(t);
    fila(['Fecha determinística (sin riesgos)', r.serieDeterministica], [null, FORMATO_FECHA]);
    fila(['Probabilidad de cumplirla', r.probabilidadDeterministica], [null, PCT]);
    if (r.probabilidadMeta !== null) {
      fila(['Fecha meta', cfg.fechaMeta ?? null], [null, FORMATO_FECHA]);
      fila(['Probabilidad de cumplir la meta', r.probabilidadMeta], [null, PCT]);
    }
    fila(['Media (días laborables)', r.media], [null, DIAS]);
    fila(['Desviación estándar (días)', r.desviacion], [null, DIAS]);
    fila(['Mínimo simulado', r.serieMinima, r.minimo], [null, FORMATO_FECHA, DIAS]);
    fila(['Máximo simulado', r.serieMaxima, r.maximo], [null, FORMATO_FECHA, DIAS]);
    fila(['Percentil', 'Fecha', 'Días laborables'], [], true);
    for (const p of r.percentiles) fila([`P${Math.round(p.p * 100)}`, p.serie, p.dias], [null, FORMATO_FECHA, DIAS]);
  };
  bloqueTiempo(fin, 'Fin del proyecto');
  for (const h of hitos) bloqueTiempo(h, `Hito: ${h.id} · ${h.nombre}`);

  titulo('Tornado por eliminación de riesgos');
  if (sim.eliminacion.length === 0) fila(['El cronograma no tiene riesgos activos.']);
  else {
    fila(['Riesgo', 'Descripción', 'Ocurrió', 'Media sin él (días)', 'Baja la media', 'P80 sin él (días)', 'Baja el P80'], [], true);
    for (const e of sim.eliminacion) {
      fila([e.id, e.nombre, e.ocurrencia, e.media, e.reduccionMedia, e.p80, e.reduccionP80], [null, null, PCT, DIAS, DIAS, DIAS, DIAS]);
    }
    if (sim.sinRiesgos) {
      fila(['Todos', 'Sin ningún riesgo (solo la incertidumbre de las duraciones)', null, sim.sinRiesgos.media, sim.media - sim.sinRiesgos.media, sim.sinRiesgos.p80, sim.p80 - sim.sinRiesgos.p80],
        [null, null, null, DIAS, DIAS, DIAS, DIAS]);
    }
  }

  titulo('Índices por actividad');
  fila(['ID', 'Actividad', 'Criticidad', 'Cruciality', 'SSI', 'Duración media', 'Holgura (det.)', 'Inicio (det.)', 'Fin (det.)'], [], true);
  const det = new Map(sim.deterministico.filas.map((f) => [f.id, f]));
  for (const x of indicesActividades(sim)) {
    const f = det.get(x.id);
    fila([x.id, x.nombre, x.criticidad, x.cruciality, x.ssi, x.duracionMedia, x.holgura, f?.inicio ?? null, f?.fin ?? null],
      [null, null, PCT, '0.00', '0.00', DIAS, '0.##', FORMATO_FECHA, FORMATO_FECHA]);
  }

  titulo('Convergencia del P80 del fin (bloques de 500)');
  const conv = convergenciaP80(sim.fin.dias);
  if (conv.puntos.length < 2) fila(['Hacen falta al menos 1.000 iteraciones para ver la convergencia.']);
  else {
    fila([conv.convergio
      ? `Convergió: el P80 cambió ${(100 * (conv.ultimoCambio ?? 0)).toFixed(2)} % en el último bloque (criterio: menos de 0,5 %).`
      : `Aún no converge: el P80 cambió ${(100 * (conv.ultimoCambio ?? 0)).toFixed(2)} % en el último bloque; suba las iteraciones.`]);
    fila(['Iteraciones', 'P80 (días)'], [], true);
    for (const p of conv.puntos) fila([p.iteraciones, p.p80], ['#,##0', DIAS]);
  }

  // La curva S del fin, a la derecha (columnas K y L), para el gráfico.
  const col = ANCHO + 1;
  let rangoCurva: string | null = null;
  if (fin.curvaS.length > 1) {
    const filas = [['Curva S del fin', null], ['Fecha', 'Probabilidad acumulada'], ...fin.curvaS.map(([s, p]) => [s, p])] as Celda[][];
    filas.forEach((par, k) => {
      while (valores.length <= k + 2) fila([]);
      const v = valores[k + 2] as Celda[];
      const f = formatos[k + 2] as (string | null)[];
      while (v.length < col + 2) {
        v.push(null);
        f.push(null);
      }
      v[col] = par[0] as Celda;
      v[col + 1] = par[1] as Celda;
      if (k >= 2) { f[col] = FORMATO_FECHA; f[col + 1] = PCT; }
    });
    // Toda fila tiene que tener el mismo ancho.
    const ancho = col + 2;
    for (let r = 0; r < valores.length; r++) {
      while ((valores[r] as Celda[]).length < ancho) {
        (valores[r] as Celda[]).push(null);
        (formatos[r] as (string | null)[]).push(null);
      }
    }
    const letra = (c: number) => String.fromCharCode(65 + c);
    rangoCurva = `${letra(col)}4:${letra(col + 1)}${fin.curvaS.length + 4}`;
  }
  return { valores, formatos, negritas, titulos, semaforos, rangoCurva };
}
