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
import { REGISTRO } from '../../engine/functions/registry.ts';
import { reemplazarAst } from '../../engine/graph/index.ts';
import { esLlamadaDistribucion, idDeFuncionRiesgo } from '../../engine/modelo/index.ts';
import { coercionNumerica } from '../../engine/values/coercion.ts';
import type { Nodo } from '../../engine/parser/ast.ts';
import { claveCelda, columnaDeLetras } from '../../engine/parser/index.ts';
import { construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { LOGICO, NUMERO, TEXTO, desdeEscalar, numeroEn, textoEn, tipoEn, type ValorEscalar } from '../../engine/values/index.ts';

interface Celda {
  formula?: string;
  valor?: number | string | boolean;
  /** Formato de número (código invariante, como `numberFormat`). */
  formato?: string;
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
  // Variables de texto (T1, T2): una zona que cambia el precio, y una salida de texto.
  A12: { valor: 'Zona' },
  B12: { valor: 'Norte' },
  A13: { valor: 'Recargo por zona' },
  B13: { formula: 'IF(B12="Norte",1.1,IF(B12="Sur",1,0.9))' },
  A14: { valor: 'Precio en la zona' },
  B14: { formula: 'B10*B13' },
  A15: { valor: 'Gama' },
  B15: { formula: 'IF(B14>75000,"Cara","Normal")' },
  A16: { valor: '¿Supera 80.000?' },
  B16: { formula: 'B14>80000' },
  D12: { valor: 'Norte' }, E12: { valor: 20 },
  D13: { valor: 'Sur' }, E13: { valor: 50 },
  D14: { valor: 'Este' }, E14: { valor: 30 },
  // Funciones RIESGO con celdas como argumentos (B7) y de resultados (B6).
  A18: { valor: 'Desviación del coste' },
  B18: { valor: 100 },
  A19: { valor: 'Coste con RIESGO' },
  B19: { formula: 'RIESGO.NORMAL(B3,B18)' },
  A20: { valor: 'Imprevistos' },
  B20: { formula: '1000+RIESGO.NORMAL(0,B18)' },
  A21: { valor: 'Coste con funciones' },
  B21: { formula: 'B19*B4+B20' },
  A22: { valor: 'Media del precio' },
  B22: { formula: 'RIESGO.MEDIA(B10)' },
  // Salida y correlación declaradas desde la fórmula (resto de B6).
  A24: { valor: 'Materiales' },
  B24: { formula: 'RIESGO.NORMAL(100,10)' },
  A25: { valor: 'Transporte' },
  B25: { formula: 'RIESGO.NORMAL(50,5)' },
  A26: { valor: 'Correlación' },
  B26: { formula: 'RIESGO.CORRELACION(B24,B25,0.9)' },
  A27: { valor: 'Coste total' },
  B27: { formula: 'RIESGO.SALIDA("Coste total")+B24+B25' },
  // Fechas (T7): inicio incierto y fin de obra con formato de fecha.
  A29: { valor: 'Inicio' },
  B29: { formula: 'RIESGO.TRIANGULAR(DATE(2027,1,1),DATE(2027,2,1),DATE(2027,4,1))', formato: 'dd/mm/yyyy' },
  A30: { valor: 'Fin de obra' },
  B30: { formula: 'RIESGO.SALIDA("Fin de obra")+B29+RIESGO.NORMAL(90,10)', formato: 'dd/mm/yyyy' },
  // Registro de riesgos (T8).
  A32: { valor: 'Retraso de permisos' },
  B32: { formula: 'RIESGO.EVENTO(0.3,RIESGO.TRIANGULAR(10000,20000,60000))' },
  A33: { valor: 'Avería grave' },
  B33: { formula: 'RIESGO.EVENTO(0.1,50000)' },
  A34: { valor: 'Coste con riesgos' },
  B34: { formula: 'RIESGO.SALIDA("Coste con riesgos")+B14+B32+B33' },
  // Decisión (T9): tres proveedores con distinto factor de precio.
  A36: { valor: 'Factor del proveedor' },
  B36: { formula: 'RIESGO.DECISION(0.9,1,1.15)' },
  A37: { valor: 'Coste según proveedor' },
  B37: { formula: 'RIESGO.SALIDA("Coste según proveedor")+B14*B36' },
};

/** El rango usado de la hoja falsa: hasta donde llegan sus celdas. */
const COLUMNAS_USADAS = ['A', 'B', 'C', 'D', 'E'];
const FILAS_USADAS = 37;

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
    else if (typeof celda.valor === 'string' && celda.valor !== '') valores.push({ hoja: HOJA, col, fila, valor: { tipo: TEXTO, texto: celda.valor } as ValorEscalar });
    else if (typeof celda.valor === 'boolean') valores.push({ hoja: HOJA, col, fila, valor: { tipo: LOGICO, numero: celda.valor ? 1 : 0 } as ValorEscalar });
  }

  const { grafo } = construirGrafo(formulas, valores);
  conFuncionesRiesgo(grafo);

  // Celda a celda: las funciones RIESGO no las calcula el motor (en Excel las
  // calcula el complemento), y una sola no debe dejar sin recalcular el resto.
  for (const [ref, celda] of Object.entries(LIBRO)) {
    if (!celda.formula) continue;
    const { col, fila } = refDe(ref);
    const clave = claveCelda(HOJA, col, fila);
    const r = evaluarModelo(grafo, new Map(), [clave], 1);
    if (!r.ok) {
      celda.valor = '#NAME?';
      continue;
    }
    const columna = r.valores.get(clave);
    if (!columna) continue;
    const tipo = tipoEn(columna, 0);
    celda.valor = tipo === NUMERO ? numeroEn(columna, 0)
      : tipo === TEXTO ? (textoEn(columna, 0) ?? '')
      : tipo === LOGICO ? numeroEn(columna, 0) !== 0
      : '#VALUE!';
  }
}

/**
 * Las funciones RIESGO del banco: las de verdad (`ui/funciones.ts`), cargadas
 * con un `CustomFunctions` de mentira. Cada llamada de una fórmula se
 * sustituye por `_BANCO.RIESGO("Modelo!B20"; "NORMAL"; args…)`, para que la
 * función sepa su celda como en Excel (y así el modo compatible del banco
 * pruebe también B1b). Solo argumentos numéricos: es lo que usa el banco.
 */
const funcionesRiesgo = new Map<string, (...args: unknown[]) => unknown>();
(globalThis as unknown as { CustomFunctions: unknown }).CustomFunctions = {
  associate: (id: string, f: (...args: unknown[]) => unknown) => funcionesRiesgo.set(id, f),
  Error: class extends Error {},
  ErrorCode: { invalidNumber: '#NUM!', invalidName: '#NAME?', invalidValue: '#VALUE!', notAvailable: '#N/A' },
};
void import('../funciones.ts');

(REGISTRO as Record<string, (typeof REGISTRO)[string]>)['_BANCO.RIESGO'] = (args, n) => {
  const [dir, id, ...resto] = args.map((a) => a.columnas[0]);
  const direccion = dir ? String(valorEn(dir)) : '';
  const f = funcionesRiesgo.get(id ? String(valorEn(id)) : '');
  const valores = resto.map((c) => (c ? coercionNumerica(c, 0) : NaN));
  let v: unknown;
  try {
    v = f ? f(...valores, { address: direccion }) : '#NAME?';
  } catch {
    v = '#NUM!';
  }
  const valor: ValorEscalar = typeof v === 'number' ? { tipo: NUMERO, numero: v } : { tipo: TEXTO, texto: String(v) };
  return desdeEscalar(valor, n);
};

function valorEn(c: import('../../engine/values/columna.ts').Columna): unknown {
  const t = tipoEn(c, 0);
  return t === TEXTO ? textoEn(c, 0) : numeroEn(c, 0);
}

function conFuncionesRiesgo(grafo: ReturnType<typeof construirGrafo>['grafo']): void {
  for (const [clave, nodo] of grafo.nodos) {
    if (!nodo.ast) continue;
    let hay = false;
    const cambiar = (x: Nodo): Nodo => {
      // En un booleano: si no, el `if` estrecha el tipo y el resto no ve funciones.
      const esDistribucion: boolean = esLlamadaDistribucion(x);
      if (esDistribucion && x.tipo === 'funcion') {
        hay = true;
        return {
          tipo: 'funcion', nombre: '_BANCO.RIESGO', pos: x.pos,
          args: [{ tipo: 'texto', valor: clave, pos: x.pos }, { tipo: 'texto', valor: idDeFuncionRiesgo(x.nombre) ?? '', pos: x.pos }, ...x.args.map(cambiar)],
        };
      }
      // Las que declaran algo valen lo que en Excel: 0 la salida, el coeficiente la correlación.
      const id = x.tipo === 'funcion' ? idDeFuncionRiesgo(x.nombre) : null;
      if (x.tipo === 'funcion' && id === 'SALIDA') {
        hay = true;
        return { tipo: 'numero', valor: 0, pos: x.pos };
      }
      if (x.tipo === 'funcion' && id === 'CORRELACION' && x.args[2]) {
        hay = true;
        return x.args[2];
      }
      // Una decisión vale su primera opción.
      if (x.tipo === 'funcion' && id === 'DECISION' && x.args[0]) {
        hay = true;
        const a = x.args[0];
        return a.tipo === 'matriz' ? (a.filas[0]?.[0] ?? a) : a;
      }
      if (x.tipo === 'funcion') return { ...x, args: x.args.map(cambiar) };
      if (x.tipo === 'binaria') return { ...x, izq: cambiar(x.izq), der: cambiar(x.der) };
      if (x.tipo === 'unaria' || x.tipo === 'porcentaje') return { ...x, arg: cambiar(x.arg) };
      return x;
    };
    const nuevo = cambiar(nodo.ast);
    if (hay) reemplazarAst(grafo, clave, nuevo);
  }
}

/** Qué celda está "seleccionada". El banco la cambia con un desplegable. */
export const seleccion = { ref: 'B3' };

/** `workbook.onSelectionChanged` (U3.1: el explorador sigue a la selección). */
const alSeleccionar = new Set<() => Promise<void> | void>();
export function avisarSeleccion(): void {
  for (const f of alSeleccionar) void f();
}

/**
 * El relleno de cada celda, que aquí no se ve pero sí se puede comprobar: el
 * banco lo enseña como texto, y así se verifica que el resaltado pinta las
 * celdas correctas y las despinta al quitarlas del modelo.
 */
export const rellenos = new Map<string, string>();

function celda(ref: string): Celda {
  return (LIBRO[ref] ??= {});
}

function tipoDeValor(v: Celda['valor']): string {
  if (typeof v === 'number') return 'Double';
  if (typeof v === 'boolean') return 'Boolean';
  if (typeof v === 'string') return v.startsWith('#') ? 'Error' : 'String';
  return 'Empty';
}

/** Un rango de varias celdas (D12:E14), solo para leer: las categorías de una entrada de texto. */
function rangoMultiple(ref: string) {
  const [a, b] = ref.split(':') as [string, string];
  const ia = refDe(a);
  const ib = refDe(b);
  const filas = ib.fila - ia.fila + 1;
  const cols = ib.col - ia.col + 1;
  const letra = (c: number) => String.fromCharCode(64 + c);
  const valores = Array.from({ length: filas }, (_, f) =>
    Array.from({ length: cols }, (_, c) => LIBRO[`${letra(ia.col + c)}${ia.fila + f}`]?.valor ?? ''),
  );
  return {
    address: `${HOJA}!${ref}`,
    rowCount: filas,
    columnCount: cols,
    cellCount: filas * cols,
    values: valores,
    formulas: valores,
    worksheet: { name: HOJA, load: () => {} },
    load: () => {},
  };
}

function rangoFalso(ref: string) {
  if (ref.includes(':')) return rangoMultiple(ref) as unknown as ReturnType<typeof rangoSimple>;
  return rangoSimple(ref);
}

function rangoSimple(ref: string) {
  const objetivo = celda(ref);
  // Como Office.js: `load` toma el valor en ese punto de la cola, no al
  // leerlo después. Sin esto, varias iteraciones en un mismo viaje (F5b)
  // leerían todas el valor de la última.
  let foto: { valor: Celda['valor'] } | null = null;
  return {
    format: {
      fill: {
        get color() {
          return rellenos.get(ref) ?? '';
        },
        set color(v: string) {
          rellenos.set(ref, v);
        },
        clear: () => rellenos.delete(ref),
        load: () => {},
      },
    },
    address: `${HOJA}!${ref}`,
    rowCount: 1,
    columnCount: 1,
    cellCount: 1,
    isNullObject: false,
    get values() {
      return [[(foto ? foto.valor : objetivo.valor) ?? '']];
    },
    set values(v: unknown[][]) {
      // Como en Excel: escribir un valor quita la fórmula (se restaura con `formulas`).
      delete objetivo.formula;
      objetivo.valor = v[0]?.[0] as number;
      foto = null;
    },
    get formulas() {
      return [[objetivo.formula ? `=${objetivo.formula}` : (objetivo.valor ?? '')]];
    },
    // Reescribir la fórmula (refrescar las celdas de B6, restaurar): como en Excel.
    set formulas(v: unknown[][]) {
      const x = v[0]?.[0];
      if (typeof x === 'string' && x.startsWith('=')) objetivo.formula = x.slice(1);
      else {
        delete objetivo.formula;
        objetivo.valor = x as number;
      }
      foto = null;
    },
    get numberFormat() {
      return [[objetivo.formato ?? 'General']];
    },
    get valueTypes() {
      return [[tipoDeValor(foto ? foto.valor : objetivo.valor)]];
    },
    get worksheet() {
      return { name: HOJA, load: () => {} };
    },
    load: () => {
      foto = { valor: objetivo.valor };
    },
  };
}

const ajustes = new Map<string, string>();

/**
 * Q1: hojas en memoria para el libro de cronograma (Config, Actividades…,
 * Resultados_Cronograma). Guardan los valores que se escriben por índices y
 * los devuelven como rango usado; el formato, las listas y los gráficos se
 * aceptan y se descartan.
 */
export const hojasMemoria = new Map<string, unknown[][]>();

function hojaMemoria(nombre: string): Record<string, unknown> {
  const rejillaDe = () => hojasMemoria.get(nombre) as unknown[][];
  const nada = () => {};
  const formato = () => ({ font: {}, fill: {}, borders: { getItem: () => ({}) }, autofitColumns: nada, columnWidth: 0, wrapText: false });
  const validacion = () => ({ clear: nada, rule: {}, prompt: {} });
  const rango = (fila: number, col: number) => ({
    set values(v: unknown[][]) {
      const g = rejillaDe();
      v.forEach((f, i) => {
        const r = (g[fila + i] ??= []);
        f.forEach((x, j) => { r[col + j] = x === '' ? null : x; });
      });
    },
    set numberFormat(_v: unknown) {},
    format: formato(),
    dataValidation: validacion(),
    select: nada,
    // G2: insertar y borrar filas enteras desde el Gantt.
    getEntireRow: () => ({
      insert: () => { rejillaDe().splice(fila, 0, []); },
      delete: () => { rejillaDe().splice(fila, 1); },
    }),
  });
  return {
    name: nombre,
    isNullObject: false,
    load: nada,
    delete: () => hojasMemoria.delete(nombre),
    activate: nada,
    getRangeByIndexes: (fila: number, col: number) => rango(fila, col),
    getRange: (ref: string) => {
      const m = /^([A-Z]+)(\d+)/.exec(ref);
      return rango(m ? Number(m[2]) - 1 : 0, m ? columnaDeLetras(m[1] as string) - 1 : 0);
    },
    getUsedRangeOrNullObject: () => {
      const g = rejillaDe();
      const ancho = Math.max(0, ...g.map((f) => f?.length ?? 0));
      return {
        isNullObject: g.length === 0,
        rowIndex: 0,
        columnIndex: 0,
        load: nada,
        values: Array.from({ length: g.length }, (_, i) => Array.from({ length: ancho }, (_, j) => g[i]?.[j] ?? '')),
      };
    },
    freezePanes: { freezeRows: nada },
    charts: { add: () => ({ title: {}, legend: {}, setPosition: nada }) },
  };
}

const ES_HOJA_MEMORIA = /^(Config|Calendario|Actividades|Relaciones|Incertidumbre|Riesgos|Impactos|Costos|Correlaciones|Ramas|Lineas_Base|Resultados_Cronograma|Hitos_Contrato|Clima|Escenarios|Rangos_Tipo|Seguimiento|Resultados_Escenarios)$/;

/** Instala los globales `Office` y `Excel` que espera el panel. */
export function instalarExcelFalso(): void {
  recalcular();

  const hojaFalsa = {
    name: HOJA,
    visibility: 'Visible',
    load: () => {},
    getRange: (ref: string) => rangoFalso(ref),
    // Para los nombres legibles (E5): una franja de valores por índices (desde 0).
    getRangeByIndexes: (fila: number, col: number, filas: number, cols: number) => ({
      load: () => {},
      get values() {
        return Array.from({ length: filas }, (_, f) =>
          Array.from({ length: cols }, (_, c) => {
            const letra = String.fromCharCode(65 + col + c);
            return LIBRO[`${letra}${fila + f + 1}`]?.valor ?? '';
          }),
        );
      },
    }),
    getUsedRangeOrNullObject: () => ({
      isNullObject: false,
      address: `${HOJA}!A1:E${FILAS_USADAS}`,
      rowIndex: 0,
      columnIndex: 0,
      rowCount: FILAS_USADAS,
      columnCount: COLUMNAS_USADAS.length,
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
    Array.from({ length: FILAS_USADAS }, (_, f) =>
      COLUMNAS_USADAS.map((col) => de(LIBRO[`${col}${f + 1}`] ?? {})),
    );

  const contexto = {
    workbook: {
      application: {
        // El banco imita el Excel del usuario: español, con coma decimal.
        decimalSeparator: ',',
        thousandsSeparator: '.',
        useSystemSeparators: true,
        cultureInfo: {
          name: 'es-ES',
          load: () => {},
          numberFormat: { numberDecimalSeparator: ',', numberGroupSeparator: '.', load: () => {} },
        },
        calculationMode: 'Automatic',
        load: () => {},
        calculate: () => {
          recalcular();
          // Excel de verdad tarda milisegundos por iteración (33 por segundo
          // medidos en una máquina real). Aquí se imita con una espera
          // ocupada de 1 ms: sin ella el banco daría un ritmo de cientos de
          // miles por segundo y el aviso de "esto va a tardar" no se podría
          // ni ver, que es justo lo que hay que poder probar.
          const hasta = performance.now() + 1;
          while (performance.now() < hasta) { /* esperar */ }
        },
      },
      settings: {
        get items() {
          return [...ajustes].map(([key, value]) => ({ key, value }));
        },
        load: () => {},
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
        get items() {
          return [hojaFalsa, ...[...hojasMemoria.keys()].map((name) => ({ name }))];
        },
        load: () => {},
        getItem: (nombre?: string) => (nombre && hojasMemoria.has(nombre) ? hojaMemoria(nombre) : hojaFalsa),
        getActiveWorksheet: () => hojaFalsa,
        getItemOrNullObject: (nombre?: string) => (nombre && hojasMemoria.has(nombre)
          ? hojaMemoria(nombre)
          : { isNullObject: true, load: () => {}, delete: () => {}, getUsedRangeOrNullObject: () => ({ isNullObject: true, load: () => {} }) }),
        // El volcado crea una hoja nueva. El banco no dibuja cuadrícula, así
        // que la recoge en `hojaVolcada` para poder comprobar qué se escribió.
        add: (nombre: string) => {
          if (ES_HOJA_MEMORIA.test(nombre)) {
            hojasMemoria.set(nombre, []);
            return hojaMemoria(nombre);
          }
          hojaVolcada.nombre = nombre;
          hojaVolcada.filas = [];
          hojaVolcada.graficos = 0;
          return hojaVolcada.objeto;
        },
      },
      getSelectedRange: () => rangoFalso(seleccion.ref),
      onSelectionChanged: {
        add: (f: () => Promise<void> | void) => {
          alSeleccionar.add(f);
          return { context: undefined, remove: () => alSeleccionar.delete(f) };
        },
      },
    },
    sync: () => Promise.resolve(),
  };

  const g = globalThis as unknown as Record<string, unknown>;

  g.Excel = {
    // También `Excel.run(contextoAnterior, fn)`, como al dejar de escuchar un evento.
    run: <T>(a: unknown, b?: (c: typeof contexto) => Promise<T>) =>
      (typeof a === 'function' ? (a as (c: typeof contexto) => Promise<T>) : (b as (c: typeof contexto) => Promise<T>))(contexto),
    ChartType: { line: 'Line', columnClustered: 'ColumnClustered', barClustered: 'BarClustered', xyscatterLinesNoMarkers: 'XYScatterLinesNoMarkers', xyscatter: 'XYScatter' },
    BorderIndex: { edgeBottom: 'EdgeBottom' },
    BorderLineStyle: { continuous: 'Continuous' },
    ChartSeriesBy: { columns: 'Columns', rows: 'Rows' },
    CalculationType: { recalculate: 'Recalculate', full: 'Full' },
    RangeValueType: { double: 'Double', integer: 'Integer', boolean: 'Boolean', string: 'String', error: 'Error', empty: 'Empty' },
    SheetVisibility: { visible: 'Visible' },
    InsertShiftDirection: { down: 'Down' },
    DeleteShiftDirection: { up: 'Up' },
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

/**
 * Lo que el volcado de resultados escribió. El banco no dibuja una
 * cuadrícula, así que esta es la forma de comprobar que la hoja se creó con
 * las filas y los gráficos esperados.
 */
export const hojaVolcada: {
  nombre: string;
  filas: unknown[][];
  graficos: number;
  objeto: Record<string, unknown>;
} = {
  nombre: '',
  filas: [],
  graficos: 0,
  objeto: {
    getRangeByIndexes: (fila: number, col: number, filas: number, cols: number) => ({
      set values(v: unknown[][]) {
        hojaVolcada.filas = v;
      },
      set numberFormat(_v: unknown[][]) {},
      format: { font: {}, fill: {}, borders: { getItem: () => ({}) }, autofitColumns: () => {} },
      _dims: [fila, col, filas, cols],
    }),
    freezePanes: { freezeRows: () => {} },
    getUsedRange: () => ({ format: { autofitColumns: () => {} } }),
    // Las plantillas (U1) escriben celda a celda: se apuntan en `filas` como [ref, valor].
    getRange: (ref: string) => ({
      set values(v: unknown[][]) {
        hojaVolcada.filas.push([ref, v[0]?.[0]]);
      },
      set formulas(v: unknown[][]) {
        hojaVolcada.filas.push([ref, v[0]?.[0]]);
      },
      set numberFormat(_v: unknown[][]) {},
      format: { font: {}, columnWidth: 0 },
    }),
    charts: {
      add: () => {
        hojaVolcada.graficos += 1;
        return { title: {}, legend: {}, setPosition: () => {} };
      },
    },
    activate: () => {},
  },
};

/** Las celdas del libro falso, para el desplegable de selección. */
export const CELDAS = [...Object.keys(LIBRO).filter((r) => r.startsWith('B')), 'D12:E14', 'B24:B25', 'B32:B33'];
