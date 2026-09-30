/**
 * Las vistas del cronograma (P3c): lo que dibujan la ventana «Ver
 * cronograma» (Gantt interactivo con flechas) y la hoja «Cronograma
 * (Gantt)» (celdas coloreadas, para compartir sin el complemento). Sin
 * Office.js ni DOM: aquí solo se decide qué va dónde.
 *
 * Las barras van en **días naturales** (fechas de Excel): una actividad que
 * empieza el lunes y termina el viernes ocupa del lunes a las 0 h al sábado a
 * las 0 h. Tras simular, cada barra lleva detrás su franja P10–P90 (del
 * inicio P10 al fin P90) y su índice de criticidad.
 */

import { diaSemana } from './calendario.ts';
import type { FilaCPM } from './cpm.ts';
import { textoRelacion } from './predecesoras.ts';
import type { ResultadoSimulacionPlazo } from './simulacion.ts';
import type { EstadoAvance } from './red.ts';
import type { Actividad, TipoRelacion } from './tipos.ts';

export const VERSION_GANTT = 1;

export interface BarraGantt {
  id: string;
  nombre: string;
  /** Primer día (serie de Excel). */
  inicio: number;
  /** Último día trabajado (serie); en un hito, igual a `inicio`. */
  fin: number;
  hito: boolean;
  critica: boolean;
  holgura: number;
  /** Las predecesoras como se escriben: `3FC+5; 7CC`. */
  predecesoras: string;
  estado: EstadoAvance;
  /** Tras simular. */
  criticidad?: number;
  franja?: { desde: number; hasta: number };
  p80Fin?: number;
}

export interface EnlaceGantt {
  de: string;
  a: string;
  tipo: TipoRelacion;
  retardo: number;
}

export interface VistaGantt {
  version: typeof VERSION_GANTT;
  titulo: string;
  /** Rango de fechas que cubre el dibujo (incluye las franjas). */
  desde: number;
  hasta: number;
  fechaCronograma: number;
  fechaP80?: number;
  /** Fecha de corte, si hay avance registrado. */
  fechaCorte?: number;
  barras: BarraGantt[];
  enlaces: EnlaceGantt[];
  simulado: boolean;
}

export function vistaGantt(
  actividades: readonly Actividad[],
  filas: readonly FilaCPM[],
  fechaFinProyecto: number,
  sim?: ResultadoSimulacionPlazo,
  fechaCorte?: number,
): VistaGantt {
  const porId = new Map(filas.map((f) => [f.id, f]));
  const simPorId = new Map(sim?.actividades.map((a) => [a.id, a]) ?? []);
  const barras: BarraGantt[] = actividades.map((a) => {
    const f = porId.get(a.id) as FilaCPM;
    const s = simPorId.get(a.id);
    const b: BarraGantt = {
      id: a.id,
      nombre: a.nombre,
      inicio: f.fechaInicio,
      fin: f.fechaFin,
      hito: a.duracion === 0,
      critica: f.critica,
      holgura: f.holguraTotal,
      predecesoras: a.predecesoras.map(textoRelacion).join('; '),
      estado: f.estado,
    };
    if (s && f.estado !== 'terminada') {
      b.criticidad = s.criticidad;
      b.franja = { desde: Math.min(s.inicio.p10, f.fechaInicio), hasta: Math.max(s.fin.p90, f.fechaFin) };
      b.p80Fin = s.fin.p80;
    }
    return b;
  });
  const enlaces = actividades.flatMap((a) => a.predecesoras.map((r) => ({ de: r.predecesora, a: a.id, tipo: r.tipo, retardo: r.retardo })));
  let desde = Infinity;
  let hasta = -Infinity;
  for (const b of barras) {
    desde = Math.min(desde, b.inicio, b.franja?.desde ?? Infinity);
    hasta = Math.max(hasta, b.fin, b.franja?.hasta ?? -Infinity);
  }
  if (sim) hasta = Math.max(hasta, sim.fechas.p90);
  return {
    version: VERSION_GANTT,
    titulo: 'Cronograma',
    desde,
    hasta,
    fechaCronograma: fechaFinProyecto,
    ...(sim ? { fechaP80: sim.fechas.p80 } : {}),
    ...(fechaCorte !== undefined ? { fechaCorte } : {}),
    barras,
    enlaces,
    simulado: sim !== undefined,
  };
}

// ---------------------------------------------------------------------------
// La hoja «Cronograma (Gantt)».
// ---------------------------------------------------------------------------

export const HOJA_GANTT = 'Cronograma (Gantt)';
export type Escala = 'dia' | 'semana' | 'mes';

/** Días (serie) a partir de los que empieza cada columna de la línea de tiempo. */
export function columnasTiempo(desde: number, hasta: number, escala?: Escala): { escala: Escala; inicios: number[] } {
  const dias = hasta - desde + 1;
  const e: Escala = escala ?? (dias <= 92 ? 'dia' : dias <= 800 ? 'semana' : 'mes');
  const inicios: number[] = [];
  if (e === 'dia') {
    for (let d = desde; d <= hasta; d++) inicios.push(d);
  } else if (e === 'semana') {
    // Desde el lunes de la semana de `desde`.
    let d = desde - ((diaSemana(desde) + 6) % 7);
    for (; d <= hasta; d += 7) inicios.push(d);
  } else {
    const fecha = (s: number) => new Date(Date.UTC(1899, 11, 30) + s * 86_400_000);
    const serie = (y: number, m: number) => Math.round((Date.UTC(y, m, 1) - Date.UTC(1899, 11, 30)) / 86_400_000);
    const f0 = fecha(desde);
    let y = f0.getUTCFullYear();
    let m = f0.getUTCMonth();
    for (let s = serie(y, m); s <= hasta; s = serie(y, m)) {
      inicios.push(s);
      m++;
      if (m === 12) { m = 0; y++; }
    }
  }
  return { escala: e, inicios };
}

export interface TramoColor {
  fila: number;
  col: number;
  cols: number;
  color: string;
}

export interface HojaGantt {
  valores: (string | number)[][];
  /** Filas y columnas desde 0. */
  filaEncabezado: number;
  primeraColTiempo: number;
  escala: Escala;
  tramos: TramoColor[];
  /** Columnas de la línea de tiempo con la fecha del cronograma y con el P80. */
  marcas: Array<{ col: number; color: string; texto: string }>;
  hitos: Array<{ fila: number; col: number }>;
}

export const COLORES_GANTT = {
  critica: '#E34948',
  normal: '#2A78D6',
  franjaCritica: '#F6C9C9',
  franjaNormal: '#C9DDF5',
  terminada: '#8A8F98',
  corte: '#6B7280',
  cronograma: '#1B1B1B',
  p80: '#D9A400',
};

/** Qué columnas de la línea de tiempo toca el intervalo de días [a, b]. */
function colsDe(inicios: readonly number[], a: number, b: number): [number, number] | null {
  let c0 = -1;
  let c1 = -1;
  for (let i = 0; i < inicios.length; i++) {
    const ini = inicios[i] as number;
    const fin = (inicios[i + 1] ?? Infinity) - 1;
    if (fin >= a && ini <= b) {
      if (c0 < 0) c0 = i;
      c1 = i;
    }
  }
  return c0 < 0 ? null : [c0, c1];
}

export function hojaGantt(v: VistaGantt, escala?: Escala): HojaGantt {
  const { escala: e, inicios } = columnasTiempo(v.desde, v.hasta, escala);
  const fijas = v.simulado
    ? ['ID', 'Actividad', 'Predecesoras', 'Inicio', 'Fin', 'Holgura', 'Crítica en']
    : ['ID', 'Actividad', 'Predecesoras', 'Inicio', 'Fin', 'Holgura', 'Crítica'];
  const primeraColTiempo = fijas.length;
  const filaEncabezado = 3;
  const valores: (string | number)[][] = [
    [`Cronograma (Gantt) — lo escribe el complemento; se rehace en cada cálculo. Escala: ${e === 'dia' ? 'días' : e === 'semana' ? 'semanas (desde el lunes)' : 'meses'}`],
    [v.simulado
      ? 'Rojo: crítica en el cronograma. Gris: terminada. Franja clara: de P10 a P90 tras la simulación. Línea negra: fin del cronograma; amarilla: P80; gris: fecha de corte.'
      : 'Rojo: crítica. Azul: con holgura. Gris: terminada. ◆: hito. Línea negra: fin del cronograma; gris: fecha de corte.'],
    [''],
    [...fijas, ...inicios],
  ];
  const tramos: TramoColor[] = [];
  const hitos: Array<{ fila: number; col: number }> = [];
  v.barras.forEach((b, i) => {
    const fila = filaEncabezado + 1 + i;
    valores.push([b.id, b.nombre, b.predecesoras, b.inicio, b.fin, Math.round(b.holgura * 100) / 100,
      v.simulado ? (b.criticidad ?? 0) : b.critica ? 'Sí' : 'No']);
    if (b.franja) {
      const f = colsDe(inicios, b.franja.desde, b.franja.hasta);
      if (f) tramos.push({ fila, col: primeraColTiempo + f[0], cols: f[1] - f[0] + 1, color: b.critica ? COLORES_GANTT.franjaCritica : COLORES_GANTT.franjaNormal });
    }
    const c = colsDe(inicios, b.inicio, b.fin);
    if (!c) return;
    if (b.hito) hitos.push({ fila, col: primeraColTiempo + c[0] });
    else {
      const color = b.estado === 'terminada' ? COLORES_GANTT.terminada : b.critica ? COLORES_GANTT.critica : COLORES_GANTT.normal;
      tramos.push({ fila, col: primeraColTiempo + c[0], cols: c[1] - c[0] + 1, color });
    }
  });
  // El rombo de los hitos, como valor de la celda (se ve aunque no haya color).
  const anchoTotal = primeraColTiempo + inicios.length;
  for (const h of hitos) {
    const f = valores[h.fila] as (string | number)[];
    while (f.length < anchoTotal) f.push('');
    f[h.col] = '◆';
  }
  const marcas: HojaGantt['marcas'] = [];
  const cCron = colsDe(inicios, v.fechaCronograma, v.fechaCronograma);
  if (cCron) marcas.push({ col: primeraColTiempo + cCron[0], color: COLORES_GANTT.cronograma, texto: 'Fin del cronograma' });
  if (v.fechaCorte !== undefined) {
    const cc = colsDe(inicios, v.fechaCorte, v.fechaCorte);
    if (cc) marcas.unshift({ col: primeraColTiempo + cc[0] - 1, color: COLORES_GANTT.corte, texto: 'Fecha de corte' });
  }
  if (v.fechaP80 !== undefined) {
    const c80 = colsDe(inicios, v.fechaP80, v.fechaP80);
    if (c80) marcas.push({ col: primeraColTiempo + c80[0], color: COLORES_GANTT.p80, texto: 'P80' });
  }
  return { valores, filaEncabezado, primeraColTiempo, escala: e, tramos, marcas, hitos };
}
