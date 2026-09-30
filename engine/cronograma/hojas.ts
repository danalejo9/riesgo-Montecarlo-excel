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
