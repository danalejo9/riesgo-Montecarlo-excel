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
import { HOJA_RIESGOS } from './riesgos.ts';
import type { ImpactoRiesgo, ResultadoSimulacionPlazo } from './simulacion.ts';
import { HOJA_ACTIVIDADES, HOJA_CALENDARIO } from './lectorTabla.ts';

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
  /** Un gráfico de dispersión con líneas sobre dos columnas contiguas (x, y). */
  grafico?: { titulo: string; fila: number; col: number; filas: number; anclaFila: number; anclaCol: number };
}

export const ENCABEZADO_ACTIVIDADES = [
  'ID', 'Actividad', 'Duración (días)', 'Predecesoras', 'Mínimo', 'Más probable', 'Máximo',
  'Categoría', 'Costo por día', 'Inicio no antes de',
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
    formatos: { 0: '@', 8: formatoMoneda(codigoMoneda), 9: FORMATO_FECHA },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [6, 32, 15, 16, 10, 13, 10, 15, 14, 18],
  };
}

/** El calendario: la fecha de inicio es `hoy` (número de serie). */
export function plantillaCalendario(hoy: number): HojaAEscribir {
  return {
    nombre: HOJA_CALENDARIO,
    valores: [
      ['Inicio del proyecto', hoy],
      [''],
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
  'ID', 'Actividad', 'Duración', 'Inicio', 'Fin', 'Inicio tardío', 'Fin tardío', 'Holgura total', 'Crítica',
];

export function hojaResultadoCPM(r: Extract<ResultadoCPM, { ok: true }>): HojaAEscribir {
  const criticas = r.filas.filter((f) => f.critica).length;
  return {
    nombre: HOJA_RESULTADO,
    valores: [
      ['Cronograma determinista (sin incertidumbre) — lo escribe el complemento; se rehace en cada cálculo'],
      ['Fin del proyecto', r.fechaFinProyecto],
      ['Duración (días laborables)', r.duracionProyecto],
      ['Actividades críticas', criticas],
      ENCABEZADO_RESULTADO,
      ...r.filas.map((f) => [
        f.id, f.nombre, f.duracion, f.fechaInicio, f.fechaFin, f.fechaInicioTardio, f.fechaFinTardio,
        redondear(f.holguraTotal), f.critica ? 'Sí' : 'No',
      ]),
    ],
    // El ID como texto (igual que en «Actividades» y en «Esperado»).
    formatos: { 0: '@', 3: FORMATO_FECHA, 4: FORMATO_FECHA, 5: FORMATO_FECHA, 6: FORMATO_FECHA },
    filaEncabezado: 4,
    primeraFilaDatos: 5,
    anchos: [6, 32, 10, 12, 12, 13, 12, 13, 8],
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
      ['ID', 'Riesgo', 'Probabilidad', 'Impacto mínimo', 'Impacto más probable', 'Impacto máximo', 'Actividades afectadas'],
      ['R1', 'Lluvias durante la obra', 0.3, 0.05, 0.1, 0.25, 'Obra'],
      ['R2', 'Retraso en la aprobación del diseño', 0.2, 0.1, 0.2, 0.5, '1'],
    ],
    formatos: { 2: '0%', 3: '0%', 4: '0%', 5: '0%' },
    filaEncabezado: 2,
    primeraFilaDatos: 3,
    anchos: [6, 40, 12, 15, 20, 15, 22],
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
  impacto?: { porRiesgo: ImpactoRiesgo[]; sinRiesgos: { p80: number; diasP80: number } },
  narrativa: string[] = [],
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
  v.push(['', 'Fecha de fin', 'Días laborables']);
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
  const grafico = { titulo: 'Curva S del fin del proyecto', fila: fc, col: 1, filas: r.curvaS.length, anclaFila: fc, anclaCol: 4 };
  v.push(['']);

  if (impacto && impacto.porRiesgo.length > 0) {
    encabezados.push(v.length);
    v.push(['ID', 'Riesgo', 'Probabilidad', 'Ocurrió', 'Días de P80 que aporta', 'Días de P50 que aporta']);
    const fr = v.length;
    for (const x of impacto.porRiesgo) {
      const ocurrio = r.riesgos.find((y) => y.id === x.id)?.ocurrio ?? NaN;
      v.push([x.id, x.nombre, x.probabilidad, ocurrio, x.diasP80, x.diasP50]);
    }
    pctEn(fr, 2, impacto.porRiesgo.length, 2);
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
    grafico,
  };
}
