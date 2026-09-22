/**
 * Un Excel de mentira, para poder trabajar en el panel sin Excel.
 *
 * **Qué prueba y qué no.** Prueba que el panel se pinta, que el ciclo completo
 * encaja de punta a punta (modelo → grafo → elección de motor → simulación →
 * resultados) y que los adaptadores llaman a las cosas en el orden correcto.
 * **No prueba nada sobre el Excel real**: ni que `calculate` recalcule antes
 * del `sync`, ni que se pueda cambiar el modo de cálculo, ni cuántas
 * iteraciones por segundo da un libro de verdad. Esas tres siguen siendo
 * preguntas abiertas y solo se contestan con Excel delante.
 *
 * **La diferencia que más importa**: aquí las propiedades están disponibles
 * nada más pedirlas, sin esperar al `sync()`. En Office.js leer antes de
 * sincronizar lanza. Es decir, este banco **no puede** cazar un `load` sin su
 * `sync`, que es de los errores más típicos del modelo de Office.js. Se dice
 * aquí para que nadie confunda "funciona en el banco" con "funciona".
 *
 * El recálculo lo hace el propio motor del proyecto. Es circular a sabiendas:
 * el banco sirve para ver la interfaz y el flujo, no para verificar
 * aritmética — para eso está el libro de fidelidad, calculado por el Excel
 * real del usuario.
 */

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveCelda, columnaDeLetras } from '../../engine/parser/index.ts';
import { construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { NUMERO, numeroEn, tipoEn, type ValorEscalar } from '../../engine/values/index.ts';

interface Celda {
  formula?: string;
  valor?: number | string | boolean;
}

/**
 * Un modelo de presupuesto mínimo pero realista: dos celdas inciertas, una
 * cadena de fórmulas y un total. Es lo bastante pequeño para entenderlo de un
 * vistazo y lo bastante parecido a un libro de verdad para que el panel tenga
 * algo que decir.
 */
const HOJA = 'Modelo';
const LIBRO: Record<string, Celda> = {
  A1: { valor: 'Presupuesto de obra' },
  A3: { valor: 'Coste unitario' },
  B3: { valor: 1200 },
  A4: { valor: 'Unidades' },
  B4: { valor: 50 },
  A5: { valor: 'Sobrecoste' },
  B5: { valor: 0.1 },
  A7: { valor: 'Coste directo' },
  B7: { formula: 'B3*B4' },
  A8: { valor: 'Total con sobrecoste' },
  B8: { formula: 'B7*(1+B5)' },
  A9: { valor: 'Margen' },
  B9: { formula: 'B8*0.08' },
  A10: { valor: 'Precio de venta' },
  B10: { formula: 'B8+B9' },
};

const refDe = (ref: string) => {
  const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref) as RegExpExecArray;
  return { col: columnaDeLetras(m[1] as string), fila: Number(m[2]) };
};

/** Recalcula todas las fórmulas con el motor del proyecto. Ver el docstring. */
function recalcular(): void {
  const formulas: FormulaCelda[] = [];
  const valores: ValorCelda[] = [];

  for (const [ref, celda] of Object.entries(LIBRO)) {
    const { col, fila } = refDe(ref);
    if (celda.formula) formulas.push({ hoja: HOJA, col, fila, formula: celda.formula });
    else if (typeof celda.valor === 'number') valores.push({ hoja: HOJA, col, fila, valor: { tipo: NUMERO, numero: celda.valor } as ValorEscalar });
  }

  const { grafo } = construirGrafo(formulas, valores);
  const salidas = formulas.map((f) => claveCelda(f.hoja, f.col, f.fila));
  const r = evaluarModelo(grafo, new Map(), salidas, 1);
  if (!r.ok) return;

  for (const [ref, celda] of Object.entries(LIBRO)) {
    if (!celda.formula) continue;
    const { col, fila } = refDe(ref);
    const columna = r.valores.get(claveCelda(HOJA, col, fila));
    if (columna) celda.valor = tipoEn(columna, 0) === NUMERO ? numeroEn(columna, 0) : '#VALUE!';
  }
}

/** Qué celda está "seleccionada". El banco la cambia con un desplegable. */
export const seleccion = { ref: 'B3' };

function celda(ref: string): Celda {
  return (LIBRO[ref] ??= {});
}

function tipoDeValor(v: Celda['valor']): string {
  if (typeof v === 'number') return 'Double';
  if (typeof v === 'boolean') return 'Boolean';
  if (typeof v === 'string') return v.startsWith('#') ? 'Error' : 'String';
  return 'Empty';
}

function rangoFalso(ref: string) {
  const objetivo = celda(ref);
  return {
    address: `${HOJA}!${ref}`,
    rowCount: 1,
    columnCount: 1,
    cellCount: 1,
    isNullObject: false,
    get values() {
      return [[objetivo.valor ?? '']];
    },
    set values(v: unknown[][]) {
      objetivo.valor = v[0]?.[0] as number;
    },
    get formulas() {
      return [[objetivo.formula ? `=${objetivo.formula}` : (objetivo.valor ?? '')]];
    },
    get valueTypes() {
      return [[tipoDeValor(objetivo.valor)]];
    },
    get worksheet() {
      return { name: HOJA, load: () => {} };
    },
    load: () => {},
  };
}

const ajustes = new Map<string, string>();

/** Instala los globales `Office` y `Excel` que espera el panel. */
export function instalarExcelFalso(): void {
  recalcular();

  const hojaFalsa = {
    name: HOJA,
    visibility: 'Visible',
    load: () => {},
    getRange: (ref: string) => rangoFalso(ref),
    getUsedRangeOrNullObject: () => ({
      isNullObject: false,
      address: `${HOJA}!A1:B10`,
      rowIndex: 0,
      columnIndex: 0,
      rowCount: 10,
      columnCount: 2,
      load: () => {},
      get formulas() {
        return rejilla((c) => (c.formula ? `=${c.formula}` : (c.valor ?? '')));
      },
      get valueTypes() {
        return rejilla((c) => tipoDeValor(c.valor));
      },
    }),
  };

  const rejilla = (de: (c: Celda) => unknown): unknown[][] =>
    Array.from({ length: 10 }, (_, f) =>
      ['A', 'B'].map((col) => de(LIBRO[`${col}${f + 1}`] ?? {})),
    );

  const contexto = {
    workbook: {
      application: {
        calculationMode: 'Automatic',
        load: () => {},
        calculate: () => recalcular(),
      },
      settings: {
        getItemOrNullObject: (clave: string) => ({
          isNullObject: !ajustes.has(clave),
          value: ajustes.get(clave),
          load: () => {},
          delete: () => ajustes.delete(clave),
        }),
        add: (clave: string, valor: string) => ajustes.set(clave, valor),
      },
      names: {
        // El banco no tiene nombres definidos: todo son direcciones.
        getItemOrNullObject: () => ({
          isNullObject: true,
          load: () => {},
          getRangeOrNullObject: () => ({ isNullObject: true, cellCount: 0, address: '', load: () => {} }),
        }),
      },
      worksheets: {
        items: [hojaFalsa],
        load: () => {},
        getItem: () => hojaFalsa,
        getActiveWorksheet: () => hojaFalsa,
      },
      getSelectedRange: () => rangoFalso(seleccion.ref),
    },
    sync: () => Promise.resolve(),
  };

  const g = globalThis as unknown as Record<string, unknown>;

  g.Excel = {
    run: <T>(fn: (c: typeof contexto) => Promise<T>) => fn(contexto),
    CalculationType: { recalculate: 'Recalculate', full: 'Full' },
    RangeValueType: { double: 'Double', integer: 'Integer', boolean: 'Boolean', string: 'String', error: 'Error', empty: 'Empty' },
    SheetVisibility: { visible: 'Visible' },
  };

  g.Office = {
    onReady: (fn: () => void) => Promise.resolve().then(fn),
    context: {
      displayLanguage: 'es-ES',
      diagnostics: { host: 'Excel', platform: 'Banco', version: 'banco de pruebas' },
      requirements: { isSetSupported: () => true },
    },
  };
}

/** Las celdas del libro falso, para el desplegable de selección. */
export const CELDAS = Object.keys(LIBRO).filter((r) => r.startsWith('B'));
