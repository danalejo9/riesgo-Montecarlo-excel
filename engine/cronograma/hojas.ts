/**
 * Lo que el complemento escribe en el libro para el cronograma, como
 * matrices de valores y formatos (sin Office.js, para probarlo): la
 * plantilla vacía (P0) y el resultado del CPM (P1).
 *
 * Las columnas del resultado son las mismas, y en el mismo orden, que las de
 * la hoja «Esperado» del libro de pruebas: así se comparan a simple vista.
 */

import { formatoMoneda, MONEDA_POR_DEFECTO } from '../modelo/moneda.ts';
import type { ResultadoCPM } from './cpm.ts';
import { textoRelacion } from './predecesoras.ts';
import type { Cronograma } from './tipos.ts';
import { HOJA_RIESGOS } from './riesgos.ts';
import type { ImpactoRiesgo, ResultadoSimulacionPlazo, SinRiesgos } from './simulacion.ts';
import { reservaContingencia } from './reserva.ts';
import type { ComparacionMitigacion } from './mitigacion.ts';
import { HOJA_ACTIVIDADES, HOJA_CALENDARIO, HOJA_CALENDARIOS } from './lectorTabla.ts';
import type { Calendario } from './tipos.ts';

export const HOJA_RESULTADO = 'Cronograma (resultado)';
export const FORMATO_FECHA = 'dd/mm/yyyy';

export interface HojaAEscribir {
  nombre: string;
  /** Primera celda (A1) de `valores`. */
  valores: (string | number)[][];
  /** Formato por columna (índice desde 0), aplicado a las filas de datos. */
  formatos: Record<number, string>;
  /** Fila (desde 0) del encabezado, que va en negrita con fondo. */
  filaEncabezado: number;
  /** Primera fila de datos y cuántas hay, para los formatos. */
  primeraFilaDatos: number;
  /** Ancho aproximado de cada columna, en caracteres. */
  anchos: number[];
  /** Encabezados de tablas adicionales (filas desde 0), con el mismo estilo. */
  otrosEncabezados?: number[];
  /** Formatos de zonas concretas, para hojas con varias tablas. */
  formatosRango?: Array<{ fila: number; col: number; filas: number; cols: number; formato: string }>;
  /** Filas (desde 0) que se resaltan en amarillo. */
  resaltar?: number[];
  /** Celdas con color de fondo propio (V10: la matriz de riesgos). */
  colores?: Array<{ fila: number; col: number; color: string }>;
  /**
   * Gráficos de dispersión sobre columnas contiguas: x y `series` columnas y
   * (1 si no se dice), con líneas (curva S, tendencia) o solo puntos
   * (costo–plazo). Con `encabezado`, la primera fila del rango son los
   * nombres de las series (y hay leyenda).
   */
  graficos?: Array<{
    titulo: string; fila: number; col: number; filas: number; anclaFila: number; anclaCol: number; tipo: 'lineas' | 'puntos';
    series?: number; encabezado?: boolean; formatoX?: string; formatoY?: string;
  }>;
}

export const ENCABEZADO_ACTIVIDADES = [
  'ID', 'Actividad', 'Duración (días)', 'Predecesoras', 'Mínimo', 'Más probable', 'Máximo',
  'Categoría', 'Costo por día', 'Inicio no antes de',
  // Avance y más restricciones: opcionales, se dejan vacías si no se usan.
  'Inicio real', 'Fin real', '% completado', 'Duración restante', 'Inicio no después de', 'Terminar no antes de', 'Terminar no después de',
  // Costo fijo (P5) y la incertidumbre de los costos (V4): el valor de «Costo fijo» / «Costo por día» es el más probable.
  'Costo fijo', 'Costo fijo mínimo', 'Costo fijo máximo', 'Costo por día mínimo', 'Costo por día máximo',
  // V7: el calendario de la actividad (de la hoja «Calendarios»); vacío, el del proyecto.
  'Calendario',
];

/** La plantilla: tres actividades de ejemplo que el usuario sobrescribe. */
export function plantillaActividades(codigoMoneda = MONEDA_POR_DEFECTO): HojaAEscribir {
  return {
    nombre: HOJA_ACTIVIDADES,
    valores: [
      ['Cronograma — escribe tus actividades debajo del encabezado (una por fila)'],
      [''],
      ENCABEZADO_ACTIVIDADES,
      ['1', 'Diseño', 10, '', 8, 10, 15, 'Diseño', 500, ''],
      ['2', 'Construcción', 30, '1', 25, 30, 45, 'Obra', 2000, ''],
      ['3', 'Entrega', 0, '2', '', '', '', 'Hitos', '', ''],
    ],
    formatos: {
      0: '@', 8: formatoMoneda(codigoMoneda), 9: FORMATO_FECHA,
      10: FORMATO_FECHA, 11: FORMATO_FECHA, 12: '0%', 14: FORMATO_FECHA, 15: FORMATO_FECHA, 16: FORMATO_FECHA,
      17: formatoMoneda(codigoMoneda), 18: formatoMoneda(codigoMoneda), 19: formatoMoneda(codigoMoneda),
      20: formatoMoneda(codigoMoneda), 21: formatoMoneda(codigoMoneda),
    },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [6, 32, 15, 16, 10, 13, 10, 15, 14, 18, 12, 12, 13, 17, 19, 19, 21, 13, 17, 17, 19, 19, 16],
  };
}

/** El calendario: la fecha de inicio es `hoy` (número de serie). */
export function plantillaCalendario(hoy: number): HojaAEscribir {
  return {
    nombre: HOJA_CALENDARIO,
    valores: [
      ['Inicio del proyecto', hoy],
      ['Fecha de corte', '', 'Solo si registras avance (inicio o fin real): el día desde el que se cuenta lo que queda'],
      ['Días laborables', ''],
      ['Lunes', 'Sí'], ['Martes', 'Sí'], ['Miércoles', 'Sí'], ['Jueves', 'Sí'], ['Viernes', 'Sí'],
      ['Sábado', 'No'], ['Domingo', 'No'],
      [''],
      ['Festivos', 'Escribe las fechas debajo, una por fila'],
    ],
    // Solo B1 es fecha; el resto de la columna B es texto, al que no le afecta.
    formatos: { 1: FORMATO_FECHA },
    filaEncabezado: -1,
    primeraFilaDatos: 0,
    anchos: [20, 40],
  };
}

export const ENCABEZADO_RESULTADO = [
  'ID', 'Actividad', 'Duración', 'Inicio', 'Fin', 'Inicio tardío', 'Fin tardío', 'Holgura total', 'Crítica', 'Estado',
];

const ESTADO_TEXTO = { pendiente: 'Pendiente', 'en curso': 'En curso', terminada: 'Terminada' } as const;

export function hojaResultadoCPM(r: Extract<ResultadoCPM, { ok: true }>): HojaAEscribir {
  const criticas = r.filas.filter((f) => f.critica).length;
  return {
    nombre: HOJA_RESULTADO,
    valores: [
      ['Cronograma determinista (sin incertidumbre) — lo escribe el complemento; se rehace en cada cálculo'],
      ['Fin del proyecto', r.fechaFinProyecto],
      [r.unidad === 'naturales' ? 'Duración (días naturales; hay calendarios por actividad)' : 'Duración (días laborables)', r.duracionProyecto],
      ['Actividades críticas', criticas],
      ENCABEZADO_RESULTADO,
      ...r.filas.map((f) => [
        f.id, f.nombre, f.duracion, f.fechaInicio, f.fechaFin, f.fechaInicioTardio, f.fechaFinTardio,
        redondear(f.holguraTotal), f.critica ? 'Sí' : 'No', ESTADO_TEXTO[f.estado],
      ]),
    ],
    // El ID como texto (igual que en «Actividades» y en «Esperado»).
    formatos: { 0: '@', 3: FORMATO_FECHA, 4: FORMATO_FECHA, 5: FORMATO_FECHA, 6: FORMATO_FECHA },
    filaEncabezado: 4,
    primeraFilaDatos: 5,
    anchos: [6, 32, 10, 12, 12, 13, 12, 13, 8, 11],
  };
}

function redondear(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** La plantilla de riesgos de plazo: un ejemplo por categoría y otro por ID. */
export function plantillaRiesgos(): HojaAEscribir {
  return {
    nombre: HOJA_RIESGOS,
    valores: [
      ['Riesgos de plazo — cada uno alarga a la vez todas sus actividades. Actividades: IDs (1;2) o categorías'],
      [''],
      [
        'ID', 'Riesgo', 'Probabilidad', 'Impacto mínimo', 'Impacto más probable', 'Impacto máximo', 'Actividades afectadas', 'Costo si ocurre',
        // V10: el registro. Sin impacto en plazo, un riesgo puede ser solo de costo o solo cualitativo (nivel 1–5).
        'Categoría del riesgo', 'Estado', 'Responsable', 'Fecha de revisión', 'Impacto cualitativo (1–5)',
      ],
      ['R1', 'Lluvias durante la obra', 0.3, 0.05, 0.1, 0.25, 'Obra', '', 'Clima', 'Abierto', '', '', ''],
      ['R2', 'Retraso en la aprobación del diseño', 0.2, 0.1, 0.2, 0.5, '1', '', 'Externo', 'Abierto', '', '', ''],
    ],
    formatos: { 2: '0%', 3: '0%', 4: '0%', 5: '0%', 11: FORMATO_FECHA },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [6, 40, 12, 15, 20, 15, 22, 15, 20, 16, 20, 17, 24],
  };
}

export const HOJA_SIMULACION = 'Cronograma (simulación)';

/**
 * La hoja de la simulación del plazo: resumen, curva S (con su gráfico),
 * cada actividad con su criticidad y sus fechas P10–P90 (el Gantt
 * probabilístico en forma de tabla) y lo que aporta cada riesgo.
 */
export function hojaSimulacionPlazo(
  r: ResultadoSimulacionPlazo,
  impacto?: { porRiesgo: ImpactoRiesgo[]; sinRiesgos: SinRiesgos },
  narrativa: string[] = [],
  codigoMoneda = MONEDA_POR_DEFECTO,
): HojaAEscribir {
  const v: (string | number)[][] = [];
  const encabezados: number[] = [];
  const fechas: Array<{ fila: number; col: number; filas: number; cols: number; formato: string }> = [];
  const fechaEn = (fila: number, col: number, filas = 1, cols = 1) => fechas.push({ fila, col, filas, cols, formato: FORMATO_FECHA });
  const pctEn = (fila: number, col: number, filas = 1, cols = 1) => fechas.push({ fila, col, filas, cols, formato: '0%' });

  v.push(['Simulación del plazo (Monte Carlo) — lo escribe el complemento; se rehace en cada simulación']);
  v.push([`${r.iteraciones} iteraciones · semilla ${r.semilla} · duraciones ${r.forma === 'pert' ? 'PERT' : 'triangulares'}${r.cancelada ? ' · CANCELADA: resultado parcial' : ''}`]);
  for (const linea of narrativa) v.push([linea]);
  v.push(['']);

  encabezados.push(v.length);
  v.push(['', 'Fecha de fin', r.unidad === 'naturales' ? 'Días naturales' : 'Días laborables']);
  const f0 = v.length;
  v.push(['Fecha del cronograma (sin incertidumbre)', r.determinista.fecha, r.determinista.dias]);
  v.push(['P10', r.fechas.p10, r.dias.p10]);
  v.push(['P50', r.fechas.p50, r.dias.p50]);
  v.push(['P80', r.fechas.p80, r.dias.p80]);
  v.push(['P90', r.fechas.p90, r.dias.p90]);
  fechaEn(f0, 1, 5);
  v.push(['Probabilidad de cumplir la fecha del cronograma', r.probDeterminista]);
  pctEn(v.length - 1, 1);
  if (impacto) {
    v.push(['P80 si no ocurriera ningún riesgo (solo la incertidumbre de las duraciones)', impacto.sinRiesgos.p80, impacto.sinRiesgos.diasP80]);
    fechaEn(v.length - 1, 1);
  }
  v.push(['']);

  // Curva S: fecha → probabilidad de haber terminado.
  encabezados.push(v.length);
  v.push(['Curva S', 'Fecha', 'Probabilidad de haber terminado']);
  const fc = v.length;
  for (const { p, fecha } of r.curvaS) v.push(['', fecha, p]);
  fechaEn(fc, 1, r.curvaS.length);
  pctEn(fc, 2, r.curvaS.length);
  const graficos: NonNullable<HojaAEscribir['graficos']> = [
    { titulo: 'Curva S del fin del proyecto', fila: fc, col: 1, filas: r.curvaS.length, anclaFila: fc, anclaCol: 4, tipo: 'lineas' },
  ];
  v.push(['']);

  // W1: los hitos contractuales.
  if (r.hitos && r.hitos.length > 0) {
    encabezados.push(v.length);
    v.push(['Hito contractual', 'Fecha contractual', 'Probabilidad de cumplir', 'P50', 'P80', 'Margen al P80 (días)', 'Multa por día', 'Multa media']);
    const h0 = v.length;
    for (const h of r.hitos) v.push([`${h.id} · ${h.nombre}`, h.fecha, h.probCumplir, h.p50, h.p80, h.margenP80, h.multaDia ?? '', h.multaDia ? h.multaMedia : '']);
    fechaEn(h0, 1, r.hitos.length);
    pctEn(h0, 2, r.hitos.length);
    fechaEn(h0, 3, r.hitos.length, 2);
    fechas.push({ fila: h0, col: 6, filas: r.hitos.length, cols: 2, formato: formatoMoneda(codigoMoneda) });
    if (r.multas) {
      v.push(['Multas por retraso: probabilidad de alguna', r.multas.probAlguna]);
      pctEn(v.length - 1, 1);
      v.push(['Multas: media', r.multas.media]);
      v.push(['Multas: P80', r.multas.p80]);
      fechas.push({ fila: v.length - 2, col: 1, filas: 2, cols: 1, formato: formatoMoneda(codigoMoneda) });
    }
    v.push(['']);
  }

  // W2: la reserva de contingencia al P80 y su reparto; los totales al P50 y al P90.
  if (!r.cancelada) {
    const res = reservaContingencia(r, impacto, 'p80');
    const hayCosto = res.costo !== undefined;
    encabezados.push(v.length);
    v.push([`Reserva de contingencia al P80 (sobre el cronograma)`, `Días ${r.unidad}`, ...(hayCosto ? ['Costo'] : [])]);
    const r0 = v.length;
    for (const x of res.partes) v.push([x.nombre, Math.round(x.dias * 100) / 100, ...(hayCosto ? [x.costo ?? 0] : [])]);
    v.push(['Reserva total al P80', Math.round(res.dias * 100) / 100, ...(hayCosto ? [res.costo as number] : [])]);
    for (const n of ['p50', 'p90'] as const) {
      const o = reservaContingencia(r, impacto, n);
      v.push([`Reserva total al ${n.toUpperCase()}`, Math.round(o.dias * 100) / 100, ...(hayCosto ? [o.costo as number] : [])]);
    }
    if (hayCosto) fechas.push({ fila: r0, col: 2, filas: v.length - r0, cols: 1, formato: formatoMoneda(codigoMoneda) });
    v.push(['']);
  }

  // P5: costo y plazo juntos.
  const c = r.costos;
  if (c) {
    const dinero = formatoMoneda(codigoMoneda);
    const enDinero = (fila: number, col: number, filas = 1) => fechas.push({ fila, col, filas, cols: 1, formato: dinero });
    encabezados.push(v.length);
    v.push(['Costo del proyecto', 'Valor']);
    const fk = v.length;
    v.push(['Costo del cronograma (sin incertidumbre ni riesgos)', c.determinista]);
    v.push(['P10', c.p10]);
    v.push(['P50', c.p50]);
    v.push(['P80', c.p80]);
    v.push(['P90', c.p90]);
    v.push(['Media', c.media]);
    enDinero(fk, 1, 6);
    if (c.rangos) {
      v.push([`P80 con los costos más probables (sin la incertidumbre de ${c.rangos.n} costo${c.rangos.n === 1 ? '' : 's'})`, c.rangos.p80SinRangos]);
      v.push(['Lo que añade la incertidumbre de los costos al P80', c.rangos.aporteP80]);
      enDinero(v.length - 2, 1, 2);
    }
    v.push(['Probabilidad conjunta: plazo ≤ P80 y costo ≤ P80 (JCL)', c.jclP80]);
    pctEn(v.length - 1, 1);
    v.push(['Probabilidad de cumplir a la vez la fecha y el costo del cronograma', c.jclPlan]);
    pctEn(v.length - 1, 1);
    if (c.conjunto80) {
      v.push(['Para un 80 % conjunto: fecha', c.conjunto80.fecha, `${c.conjunto80.dias} días ${r.unidad}`]);
      fechaEn(v.length - 1, 1);
      v.push(['… y presupuesto', c.conjunto80.costo, `(percentil ${Math.round(c.conjunto80.q * 1000) / 10} de cada uno)`]);
      enDinero(v.length - 1, 1);
    }
    v.push(['']);
    // Nube de puntos: una muestra de 500 iteraciones, fecha de fin y costo.
    encabezados.push(v.length);
    v.push(['Costo y plazo (500 iteraciones)', 'Fecha de fin', 'Costo']);
    const fp = v.length;
    const paso = Math.max(1, Math.floor(r.finProyecto.length / 500));
    let puntos = 0;
    for (let i = 0; i < r.finProyecto.length && puntos < 500; i += paso, puntos++) {
      v.push(['', r.cal(r.finProyecto[i] as number), c.porIteracion[i] as number]);
    }
    fechaEn(fp, 1, puntos);
    enDinero(fp, 2, puntos);
    graficos.push({ titulo: 'Costo y fecha de fin, iteración a iteración', fila: fp, col: 1, filas: puntos, anclaFila: fp, anclaCol: 4, tipo: 'puntos' });
    v.push(['']);
  }

  if (impacto && impacto.porRiesgo.length > 0) {
    encabezados.push(v.length);
    v.push(['ID', 'Riesgo', 'Probabilidad', 'Ocurrió', 'Días de P80 que aporta', 'Días de P50 que aporta', ...(c ? ['Costo de P80 que aporta'] : [])]);
    const fr = v.length;
    for (const x of impacto.porRiesgo) {
      const ocurrio = r.riesgos.find((y) => y.id === x.id)?.ocurrio ?? NaN;
      v.push([x.id, x.nombre, x.probabilidad, ocurrio, x.diasP80, x.diasP50, ...(c ? [x.costoP80 ?? 0] : [])]);
    }
    pctEn(fr, 2, impacto.porRiesgo.length, 2);
    if (c) fechas.push({ fila: fr, col: 6, filas: impacto.porRiesgo.length, cols: 1, formato: formatoMoneda(codigoMoneda) });
    v.push(['']);
  }

  const encAct = v.length;
  encabezados.push(encAct);
  v.push(['ID', 'Actividad', 'Criticidad', 'Correlación con el fin', 'Inicio P10', 'Inicio P50', 'Inicio P90', 'Fin P10', 'Fin P50', 'Fin P80', 'Fin P90']);
  const fa = v.length;
  for (const a of r.actividades) {
    v.push([a.id, a.nombre, a.criticidad, Number.isNaN(a.correlacion) ? '' : Math.round(a.correlacion * 100) / 100,
      a.inicio.p10, a.inicio.p50, a.inicio.p90, a.fin.p10, a.fin.p50, a.fin.p80, a.fin.p90]);
  }
  pctEn(fa, 2, r.actividades.length);
  fechaEn(fa, 4, r.actividades.length, 7);

  return {
    nombre: HOJA_SIMULACION,
    valores: v,
    formatos: {},
    filaEncabezado: encabezados[0] as number,
    otrosEncabezados: encabezados.slice(1),
    primeraFilaDatos: v.length,
    anchos: [8, 44, 16, 18, 13, 13, 13, 13, 13, 13, 13],
    formatosRango: [{ fila: fa, col: 0, filas: r.actividades.length, cols: 1, formato: '@' }, ...fechas],
    resaltar: r.actividades.map((a, i) => (a.criticidad >= 0.5 ? fa + i : -1)).filter((x) => x >= 0),
    graficos,
  };
}

/**
 * Un cronograma (importado de MS Project o P6) escrito como hoja
 * «Actividades»: las mismas columnas que la plantilla, para que el usuario
 * lo revise y añada la incertidumbre (mínimo, más probable, máximo), que
 * esos programas no traen.
 */
export function hojaActividadesDe(c: Cronograma, titulo: string, codigoMoneda = MONEDA_POR_DEFECTO): HojaAEscribir {
  const base = plantillaActividades(codigoMoneda);
  const vacio = (v: number | undefined) => (v === undefined ? '' : v);
  return {
    ...base,
    valores: [
      [titulo],
      [''],
      ENCABEZADO_ACTIVIDADES,
      ...c.actividades.map((a) => [
        a.id, a.nombre, a.duracion, a.predecesoras.map(textoRelacion).join('; '),
        vacio(a.tresPuntos?.min), vacio(a.tresPuntos?.masProbable), vacio(a.tresPuntos?.max),
        a.categoria ?? '', vacio(a.costoPorDia), vacio(a.inicioNoAntesDe),
        vacio(a.inicioReal), vacio(a.finReal), vacio(a.completado), vacio(a.restante),
        vacio(a.inicioNoDespuesDe), vacio(a.terminarNoAntesDe), vacio(a.terminarNoDespuesDe),
        vacio(a.costoFijo), vacio(a.costoFijoRango?.min), vacio(a.costoFijoRango?.max),
        vacio(a.costoPorDiaRango?.min), vacio(a.costoPorDiaRango?.max), a.calendario ?? '',
      ]),
    ],
  };
}

const NOMBRES_DIAS: Array<[string, number]> = [
  ['Lunes', 1], ['Martes', 2], ['Miércoles', 3], ['Jueves', 4], ['Viernes', 5], ['Sábado', 6], ['Domingo', 0],
];

/** El calendario de un cronograma como hoja «Calendario». */
export function hojaCalendarioDe(c: Cronograma): HojaAEscribir {
  const festivos = [...c.calendario.festivos].sort((a, b) => a - b);
  return {
    nombre: HOJA_CALENDARIO,
    valores: [
      ['Inicio del proyecto', c.inicio],
      ['Fecha de corte', c.fechaCorte ?? '', 'Solo si registras avance (inicio o fin real): el día desde el que se cuenta lo que queda'],
      ['Días laborables', ''],
      ...NOMBRES_DIAS.map(([n, d]) => [n, c.calendario.laborables[d] ? 'Sí' : 'No']),
      [''],
      ['Festivos', festivos.length === 0 ? 'Escribe las fechas debajo, una por fila' : ''],
      ...festivos.map((f) => [f]),
    ],
    formatos: { 0: FORMATO_FECHA, 1: FORMATO_FECHA },
    filaEncabezado: -1,
    primeraFilaDatos: 0,
    anchos: [20, 40],
  };
}

export const ENCABEZADO_CALENDARIOS = [
  'Calendario', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Festivos del proyecto', 'Festivos propios (dd/mm/aaaa; …)',
];

const NOMBRES_SEMANA: Array<[number]> = [[1], [2], [3], [4], [5], [6], [0]];

/** Dos fechas de serie como «dd/mm/aaaa». */
function textoDia(serie: number): string {
  const f = new Date(Date.UTC(1899, 11, 30) + serie * 86_400_000);
  return `${String(f.getUTCDate()).padStart(2, '0')}/${String(f.getUTCMonth() + 1).padStart(2, '0')}/${f.getUTCFullYear()}`;
}

/**
 * V7: la hoja «Calendarios» (los que no son el del proyecto). Sin
 * calendarios, dos de ejemplo que no se usan hasta que una actividad los
 * nombre en su columna «Calendario».
 */
export function hojaCalendarios(calendarios?: Record<string, Calendario>, proyecto?: Calendario): HojaAEscribir {
  const siNo = (x: boolean | undefined) => (x ? 'Sí' : 'No');
  const filas = calendarios && Object.keys(calendarios).length > 0
    ? Object.entries(calendarios).map(([nombre, c]) => {
        const delProyecto = proyecto !== undefined && [...proyecto.festivos].every((f) => c.festivos.has(f)) && proyecto.festivos.size > 0;
        const propios = [...c.festivos].filter((f) => !(delProyecto && proyecto?.festivos.has(f))).sort((a, b) => a - b);
        return [nombre, ...NOMBRES_SEMANA.map(([d]) => siNo(c.laborables[d])), siNo(delProyecto), propios.map(textoDia).join('; ')];
      })
    : [
        ['6 días', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'No', 'Sí', ''],
        ['Continuo', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'Sí', 'No', ''],
      ];
  return {
    nombre: HOJA_CALENDARIOS,
    valores: [
      ['Calendarios de las actividades que no siguen el del proyecto (hoja «Calendario»). Escribe su nombre en la columna «Calendario» de «Actividades».'],
      [''],
      ENCABEZADO_CALENDARIOS,
      ...filas,
    ],
    formatos: { 9: '@' },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [22, 8, 8, 10, 8, 8, 8, 9, 20, 36],
  };
}

export const HOJA_PLAZO_SIMULADO = 'Plazo simulado';
/** Cuántos valores representativos se escriben (filas 3 a 1002). */
export const VALORES_PLAZO_SIMULADO = 1000;

/**
 * P5, del cronograma al modelo de costos del libro: 1.000 valores
 * representativos (los percentiles 0,05 %, 0,15 % … 99,95 %) del plazo
 * simulado, en días laborables y como fecha de fin, y del costo si lo hay.
 * En cualquier celda del modelo de costos, `=RIESGO.EMPIRICA('Plazo
 * simulado'!A3:A1002)` es una entrada con la misma distribución que el plazo
 * de la simulación; por ejemplo, para que los costos indirectos dependan del
 * plazo. (Con la distribución, no con la iteración: la correlación con otras
 * entradas del modelo de costos no se conserva.)
 */
export function hojaPlazoSimulado(r: ResultadoSimulacionPlazo, codigoMoneda = MONEDA_POR_DEFECTO): HojaAEscribir {
  const n = VALORES_PLAZO_SIMULADO;
  const dias = Float64Array.from(r.finProyecto).sort();
  const costos = r.costos ? Float64Array.from(r.costos.porIteracion).sort() : null;
  const en = (o: Float64Array, q: number) => {
    const pos = q * (o.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(o.length - 1, i0 + 1);
    return (o[i0] as number) + ((o[i1] as number) - (o[i0] as number)) * (pos - i0);
  };
  const filas: (string | number)[][] = [];
  for (let i = 0; i < n; i++) {
    const q = (i + 0.5) / n;
    const d = Math.round(en(dias, q) * 100) / 100;
    filas.push([d, r.cal(d), ...(costos ? [Math.round(en(costos, q))] : [])]);
  }
  return {
    nombre: HOJA_PLAZO_SIMULADO,
    valores: [
      [`Plazo simulado (${r.iteraciones} iteraciones): 1.000 valores representativos. Úsalo en el modelo de costos con =RIESGO.EMPIRICA('Plazo simulado'!A3:A1002)`],
      [r.unidad === 'naturales' ? 'Días naturales' : 'Días laborables', 'Fecha de fin', ...(costos ? ['Costo del cronograma'] : [])],
      ...filas,
    ],
    formatos: costos ? { 1: FORMATO_FECHA, 2: formatoMoneda(codigoMoneda) } : { 1: FORMATO_FECHA },
    filaEncabezado: 1,
    primeraFilaDatos: 2,
    anchos: [16, 14, 20],
  };
}

export const HOJA_MITIGACION = 'Cronograma (mitigación)';

/** V1: antes y después de mitigar, lado a lado, y lo que da cada respuesta. */
export function hojaMitigacion(cmp: ComparacionMitigacion, narrativa: string[] = [], codigoMoneda = MONEDA_POR_DEFECTO): HojaAEscribir {
  const { antes: a, despues: d } = cmp;
  const v: (string | number)[][] = [];
  const zonas: NonNullable<HojaAEscribir['formatosRango']> = [];
  const dinero = formatoMoneda(codigoMoneda);
  v.push(['Mitigación: antes y después — lo escribe el complemento; se rehace en cada comparación']);
  v.push([`${a.iteraciones} iteraciones · semilla ${a.semilla} · los mismos números aleatorios en los dos escenarios`]);
  for (const l of narrativa) v.push([l]);
  v.push(['']);
  const enc = [v.length];
  v.push(['', 'Antes de mitigar', 'Después de mitigar', `Diferencia (días ${cmp.antes.unidad}, puntos o dinero)`]);
  const f0 = v.length;
  v.push(['P50 del plazo', a.fechas.p50, d.fechas.p50, a.dias.p50 - d.dias.p50]);
  v.push(['P80 del plazo', a.fechas.p80, d.fechas.p80, a.dias.p80 - d.dias.p80]);
  v.push(['P90 del plazo', a.fechas.p90, d.fechas.p90, a.dias.p90 - d.dias.p90]);
  zonas.push({ fila: f0, col: 1, filas: 3, cols: 2, formato: FORMATO_FECHA });
  v.push(['Probabilidad de cumplir la fecha del cronograma', a.probDeterminista, d.probDeterminista, d.probDeterminista - a.probDeterminista]);
  zonas.push({ fila: v.length - 1, col: 1, filas: 1, cols: 3, formato: '0%' });
  if (a.costos && d.costos) {
    const fc = v.length;
    v.push(['P50 del costo (con lo que cuestan las respuestas)', a.costos.p50, d.costos.p50, a.costos.p50 - d.costos.p50]);
    v.push(['P80 del costo (con lo que cuestan las respuestas)', a.costos.p80, d.costos.p80, a.costos.p80 - d.costos.p80]);
    v.push(['Costo de las respuestas', 0, cmp.costoRespuestas, -cmp.costoRespuestas]);
    zonas.push({ fila: fc, col: 1, filas: 3, cols: 3, formato: dinero });
    v.push(['Probabilidad conjunta plazo y costo P80 (JCL, con los P80 de antes)', a.costos.jclP80, jclCon(d, a.dias.p80, a.costos.p80), '']);
    zonas.push({ fila: v.length - 1, col: 1, filas: 1, cols: 2, formato: '0%' });
  }
  v.push(['']);
  enc.push(v.length);
  v.push(['ID', 'Riesgo', 'Respuesta', 'Responsable', 'Costo de la respuesta', 'Días de P80 que ahorra', 'Ahorro en el P80 del costo', 'Retorno por unidad invertida']);
  const fr = v.length;
  for (const x of cmp.porRespuesta) {
    v.push([x.id, x.nombre, x.respuesta, x.responsable ?? '', x.costoRespuesta, x.diasP80, x.ahorroCostoP80 ?? '', x.retorno === undefined ? '' : Math.round(x.retorno * 100) / 100]);
  }
  if (cmp.porRespuesta.length > 0) {
    zonas.push({ fila: fr, col: 4, filas: cmp.porRespuesta.length, cols: 1, formato: dinero });
    zonas.push({ fila: fr, col: 6, filas: cmp.porRespuesta.length, cols: 1, formato: dinero });
  }
  return {
    nombre: HOJA_MITIGACION,
    valores: v,
    formatos: {},
    filaEncabezado: enc[0] as number,
    otrosEncabezados: enc.slice(1),
    primeraFilaDatos: v.length,
    anchos: [8, 44, 40, 22, 20, 20, 24, 24],
    formatosRango: zonas,
  };
}

/** Fracción de iteraciones con plazo ≤ `diasMax` (días laborables) y costo ≤ `costoMax`. */
function jclCon(r: ResultadoSimulacionPlazo, diasMax: number, costoMax: number): number {
  const c = r.costos;
  if (!c) return NaN;
  let n = 0;
  for (let i = 0; i < r.finProyecto.length; i++) {
    if (Math.ceil((r.finProyecto[i] as number) - 1e-9) <= diasMax && (c.porIteracion[i] as number) <= costoMax + 1e-9) n++;
  }
  return n / r.finProyecto.length;
}
