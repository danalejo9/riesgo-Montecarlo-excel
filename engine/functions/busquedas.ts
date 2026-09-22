/**
 * Funciones de búsqueda: `BUSCARV`, `BUSCARH`, `INDICE`, `COINCIDIR`,
 * `BUSCARX`, `COINCIDIRX`, `ELEGIR`.
 *
 * Son el mayor hueco de generalidad que tenía el motor. Ninguno de los dos
 * libros reales que se usaron para priorizar las usa, y eso es **suerte, no
 * representatividad**: una tabla de tarifas, de rendimientos o de precios
 * unitarios consultada con `BUSCARV` está en casi todos los modelos de
 * presupuesto. Entran por eso, no porque las pidiera un archivo concreto.
 *
 * ---
 *
 * **La trampa de `BUSCARV`, que hay que reproducir y no arreglar.**
 *
 * El cuarto argumento decide dos algoritmos distintos:
 *
 * - `FALSO` → coincidencia **exacta**, la tabla puede estar desordenada, y se
 *   admiten comodines (`*`, `?`).
 * - `VERDADERO` **u omitido** → coincidencia **aproximada**: Excel da por
 *   hecho que la primera columna está ordenada de menor a mayor y devuelve la
 *   fila con el mayor valor que no supere al buscado. Si la tabla **no** está
 *   ordenada, Excel no avisa: devuelve un número equivocado. El motor hace lo
 *   mismo, porque la alternativa —ser más listo que Excel— daría un resultado
 *   distinto al de la hoja del usuario, que es exactamente lo que la batería
 *   de fidelidad existe para impedir.
 *
 * Omitir el cuarto argumento es el error más común con esta función, y como
 * el modo aproximado es el predeterminado, el fallo es silencioso.
 *
 * **Rendimiento, dicho con honestidad**: cada iteración recorre la tabla. Con
 * un millón de iteraciones y una tabla de mil filas son mil millones de
 * comparaciones. En un modelo Monte Carlo el valor buscado **varía** (suele
 * depender de una entrada) mientras la tabla es fija, así que hay margen para
 * indexar la tabla una sola vez. No se ha hecho todavía a propósito: primero
 * hay que medirlo con el benchmark, que para eso está, en vez de optimizar
 * contra una intuición. Está anotado en el handoff.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import { coercionNumerica, compararEn } from '../values/coercion.ts';
import {
  crearConstructor, esInvariante, numeroEn, tipoEn, valorEn, NUMERO, VACIO, type Columna,
} from '../values/columna.ts';
import { compilarCriterio, cumple } from './criterios.ts';
import { celdaEn, type Argumento } from './types.ts';

/** Construye una columna en la que todas las iteraciones son el mismo error. */
function todoError(e: ErrorExcel, n: number): Columna {
  const b = crearConstructor(n);
  for (let i = 0; i < n; i++) b.ponerError(i, e);
  return b.terminar();
}

/** Lee un argumento opcional como número, con valor por omisión. */
function opcionalNumero(arg: Argumento | undefined, i: number, porOmision: number): number | ErrorExcel {
  const c = arg?.columnas[0];
  if (!c) return porOmision;
  const v = coercionNumerica(c, i);
  return v;
}

/**
 * Coincidencia exacta: devuelve el índice (base 0) o -1.
 *
 * Usa la gramática de criterios, que ya sabe comparar sin distinguir
 * mayúsculas y aplicar comodines — es la misma semántica que `CONTAR.SI`, y
 * Excel la comparte entre las dos familias.
 */
function buscarExacto(
  buscado: Columna,
  i: number,
  largo: number,
  celda: (k: number) => Columna | undefined,
): number {
  const criterio = compilarCriterio(valorEn(buscado, i));
  for (let k = 0; k < largo; k++) {
    const c = celda(k);
    if (c && cumple(criterio, c, i)) return k;
  }
  return -1;
}

/**
 * Coincidencia aproximada ascendente: el mayor valor que no supera al
 * buscado, dando por hecho que la lista está ordenada. Devuelve -1 si el
 * primer elemento ya es mayor.
 *
 * Recorrido lineal y no binario a propósito: si la lista **no** está
 * ordenada —que es un error frecuente del usuario y Excel no detecta— la
 * búsqueda binaria y la lineal divergen, y la lineal se parece más a lo que
 * hace Excel en la práctica. Verificarlo contra Excel está pendiente en la
 * próxima tanda del libro de fidelidad.
 */
function buscarAproximado(
  buscado: Columna,
  i: number,
  largo: number,
  celda: (k: number) => Columna | undefined,
  descendente = false,
): number {
  let encontrado = -1;
  for (let k = 0; k < largo; k++) {
    const c = celda(k);
    if (!c || tipoEn(c, i) === VACIO) continue;

    const orden = compararEn(c, buscado, i);
    if (typeof orden === 'string') continue; // un error en la tabla no participa

    const sirve = descendente ? orden >= 0 : orden <= 0;
    if (sirve) encontrado = k;
    else break; // la lista está ordenada: a partir de aquí ya no sirve ninguna
  }
  return encontrado;
}

/**
 * El vecino más cercano por debajo (o por encima) **sin suponer orden**.
 *
 * `buscarAproximado` sirve a `BUSCARV`, `BUSCARH` y `COINCIDIR`, que Excel
 * define sobre una lista ordenada y que por eso pueden cortar en cuanto se
 * pasan. `BUSCARX` y `COINCIDIRX` son justamente la familia que **no** exige
 * ese orden con sus modos -1 y 1 (solo los modos binarios ±2 lo exigen), así
 * que aquí hay que recorrer entero y quedarse con el mejor candidato.
 *
 * Reutilizar el otro daba `#N/A` buscando "el siguiente más grande" que 700 en
 * una lista que empieza por 0: cortaba en el primer elemento.
 */
function buscarCercano(
  buscado: Columna,
  i: number,
  largo: number,
  celda: (k: number) => Columna | undefined,
  haciaArriba: boolean,
): number {
  let mejor = -1;
  let mejorColumna: Columna | undefined;

  for (let k = 0; k < largo; k++) {
    const c = celda(k);
    if (!c || tipoEn(c, i) === VACIO) continue;

    const orden = compararEn(c, buscado, i);
    if (typeof orden === 'string') continue; // un error en la tabla no participa

    // Coincidencia exacta: no hay nada más cercano, y Excel la prefiere.
    if (orden === 0) return k;
    if (haciaArriba ? orden < 0 : orden > 0) continue; // está en el lado que no es

    if (mejorColumna === undefined) {
      mejor = k;
      mejorColumna = c;
      continue;
    }
    // Entre dos candidatos del lado bueno gana el más próximo al buscado.
    const contra = compararEn(c, mejorColumna, i);
    if (typeof contra === 'string') continue;
    if (haciaArriba ? contra < 0 : contra > 0) {
      mejor = k;
      mejorColumna = c;
    }
  }
  return mejor;
}

// --- Índice precalculado --------------------------------------------------

/**
 * Cuando la columna de búsqueda no cambia entre iteraciones —una tabla de
 * tarifas es siempre la misma— sus claves se extraen **una sola vez** y cada
 * iteración compara números planos en vez de pasar por el despacho del canal
 * de valores.
 *
 * No es una micro-optimización: medido con el benchmark, `BUSCARV` sobre una
 * tabla de 100 filas tardaba **281 s** en un millón de iteraciones sin esto.
 *
 * La semántica no cambia. La búsqueda binaria solo se usa cuando las claves
 * están de verdad ordenadas, y en ese caso da exactamente el mismo índice que
 * el recorrido lineal. Si la tabla está desordenada —error frecuente que Excel
 * tampoco detecta— se sigue recorriendo linealmente, que es lo que reproduce
 * el comportamiento de Excel.
 */
interface IndiceFijo {
  claves: Float64Array;
  ordenada: boolean;
  /** Primera posición de cada clave, para la coincidencia exacta. */
  exacto: Map<number, number>;
}

function construirIndice(largo: number, celda: (k: number) => Columna | undefined): IndiceFijo | null {
  const claves = new Float64Array(largo);
  const exacto = new Map<number, number>();
  let ordenada = true;

  for (let k = 0; k < largo; k++) {
    const c = celda(k);
    // Solo sirve si consta que no cambia y además es numérica: con texto hay
    // que pasar por la comparación sin distinguir mayúsculas y los comodines.
    if (!c || !esInvariante(c) || tipoEn(c, 0) !== NUMERO) return null;

    const v = numeroEn(c, 0);
    claves[k] = v;
    if (k > 0 && v < (claves[k - 1] as number)) ordenada = false;
    if (!exacto.has(v)) exacto.set(v, k);
  }
  return { claves, ordenada, exacto };
}

/** Último índice cuya clave no supera al objetivo, parando en la primera mayor. */
function aproximadoSobreIndice(indice: IndiceFijo, objetivo: number): number {
  const { claves, ordenada } = indice;

  if (!ordenada) {
    let encontrado = -1;
    for (let k = 0; k < claves.length; k++) {
      if ((claves[k] as number) <= objetivo) encontrado = k;
      else break;
    }
    return encontrado;
  }

  let lo = 0;
  let hi = claves.length - 1;
  let res = -1;
  while (lo <= hi) {
    const medio = (lo + hi) >> 1;
    if ((claves[medio] as number) <= objetivo) {
      res = medio;
      lo = medio + 1;
    } else {
      hi = medio - 1;
    }
  }
  return res;
}

/** `BUSCARV(buscado; tabla; índice_columna; [ordenado])`. */
export function VLOOKUP(args: Argumento[], n: number): Columna {
  return buscarEnTabla(args, n, 'vertical');
}

/** `BUSCARH(buscado; tabla; índice_fila; [ordenado])`. */
export function HLOOKUP(args: Argumento[], n: number): Columna {
  return buscarEnTabla(args, n, 'horizontal');
}

function buscarEnTabla(args: Argumento[], n: number, sentido: 'vertical' | 'horizontal'): Columna {
  const buscado = args[0]?.columnas[0];
  const tabla = args[1];
  const indiceArg = args[2];
  if (!buscado || !tabla?.forma || !indiceArg) return todoError('#VALUE!', n);

  const { filas, cols } = tabla.forma;
  // En vertical se busca por la primera columna y se devuelve una columna; en
  // horizontal, por la primera fila y se devuelve una fila. Es la misma
  // función con los ejes cambiados.
  const largoBusqueda = sentido === 'vertical' ? filas : cols;
  const maximoIndice = sentido === 'vertical' ? cols : filas;

  const celdaClave = (k: number): Columna | undefined =>
    sentido === 'vertical' ? celdaEn(tabla, k, 0) : celdaEn(tabla, 0, k);

  // Se intenta una sola vez, fuera del bucle de iteraciones.
  const indiceFijo = construirIndice(largoBusqueda, celdaClave);

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const indice = coercionNumerica(indiceArg.columnas[0] as Columna, i);
    if (typeof indice === 'string') {
      salida.ponerError(i, indice);
      continue;
    }
    const idx = Math.trunc(indice);
    if (idx < 1) {
      salida.ponerError(i, '#VALUE!');
      continue;
    }
    if (idx > maximoIndice) {
      salida.ponerError(i, '#REF!');
      continue;
    }

    const ordenado = opcionalNumero(args[3], i, 1);
    if (typeof ordenado === 'string') {
      salida.ponerError(i, ordenado);
      continue;
    }

    const k = buscarPosicion(
      buscado, i, largoBusqueda, celdaClave, indiceFijo, ordenado !== 0,
    );

    if (k < 0) {
      salida.ponerError(i, '#N/A');
      continue;
    }

    const destino = sentido === 'vertical' ? celdaEn(tabla, k, idx - 1) : celdaEn(tabla, idx - 1, k);
    if (!destino) salida.ponerError(i, '#REF!');
    else salida.ponerValor(i, valorEn(destino, i));
  }
  return salida.terminar();
}

/**
 * Elige el camino: el índice precalculado si sirve para este valor buscado, y
 * el recorrido general si no.
 *
 * El índice solo vale cuando lo que se busca es un número: con texto entran la
 * comparación sin mayúsculas y los comodines, que el índice numérico no sabe.
 */
function buscarPosicion(
  buscado: Columna,
  i: number,
  largo: number,
  celda: (k: number) => Columna | undefined,
  indice: IndiceFijo | null,
  aproximado: boolean,
): number {
  if (indice && tipoEn(buscado, i) === NUMERO) {
    const objetivo = numeroEn(buscado, i);
    return aproximado
      ? aproximadoSobreIndice(indice, objetivo)
      : indice.exacto.get(objetivo) ?? -1;
  }
  return aproximado
    ? buscarAproximado(buscado, i, largo, celda)
    : buscarExacto(buscado, i, largo, celda);
}

/**
 * `INDICE(matriz; fila; [columna])`, con índices que empiezan en 1.
 *
 * Solo la forma que devuelve **una celda**. `INDICE` con fila o columna a cero
 * devuelve una fila o columna entera, que es semántica matricial y el motor no
 * la implementa: se responde `#¡VALOR!` en vez de un número inventado.
 */
export function INDEX(args: Argumento[], n: number): Columna {
  const matriz = args[0];
  if (!matriz?.forma) return todoError('#VALUE!', n);

  const { filas, cols } = matriz.forma;
  const unaSolaColumna = cols === 1;
  const unaSolaFila = filas === 1;

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const a = coercionNumerica(args[1]?.columnas[0] as Columna, i);
    if (typeof a === 'string') {
      salida.ponerError(i, a);
      continue;
    }

    let fila: number;
    let col: number;

    if (args.length >= 3) {
      const b = coercionNumerica(args[2]?.columnas[0] as Columna, i);
      if (typeof b === 'string') {
        salida.ponerError(i, b);
        continue;
      }
      fila = Math.trunc(a);
      col = Math.trunc(b);
    } else if (unaSolaColumna) {
      fila = Math.trunc(a);
      col = 1;
    } else if (unaSolaFila) {
      fila = 1;
      col = Math.trunc(a);
    } else {
      // Un único índice sobre una matriz de dos dimensiones devolvería una
      // fila entera: matricial, fuera de alcance.
      salida.ponerError(i, '#VALUE!');
      continue;
    }

    if (fila < 1 || col < 1) {
      salida.ponerError(i, '#VALUE!');
      continue;
    }
    const destino = celdaEn(matriz, fila - 1, col - 1);
    if (!destino) salida.ponerError(i, '#REF!');
    else salida.ponerValor(i, valorEn(destino, i));
  }
  return salida.terminar();
}

/**
 * `COINCIDIR(buscado; rango; [tipo])`. Devuelve la **posición**, empezando en 1.
 *
 * El tipo 1 (predeterminado) busca el mayor valor menor o igual en una lista
 * ascendente; el 0, coincidencia exacta con comodines; el -1, el menor valor
 * mayor o igual en una lista descendente.
 */
export function MATCH(args: Argumento[], n: number): Columna {
  const buscado = args[0]?.columnas[0];
  const rango = args[1];
  if (!buscado || !rango) return todoError('#VALUE!', n);

  const largo = rango.columnas.length;
  const celda = (k: number): Columna | undefined => rango.columnas[k];
  const indiceFijo = construirIndice(largo, celda);

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const tipo = opcionalNumero(args[2], i, 1);
    if (typeof tipo === 'string') {
      salida.ponerError(i, tipo);
      continue;
    }

    const t = Math.trunc(tipo);
    // El tipo -1 recorre una lista descendente: el índice precalculado asume
    // orden ascendente, así que ahí se usa el camino general.
    const k = t < 0
      ? buscarAproximado(buscado, i, largo, celda, true)
      : buscarPosicion(buscado, i, largo, celda, indiceFijo, t !== 0);

    if (k < 0) salida.ponerError(i, '#N/A');
    else salida.ponerNumero(i, k + 1);
  }
  return salida.terminar();
}

/**
 * `BUSCARX(buscado; rango_busqueda; rango_devuelto; [si_no_encontrado];
 * [modo_coincidencia]; [modo_busqueda])`.
 *
 * Mejora dos cosas de `BUSCARV` que causaban errores a diario: el modo
 * predeterminado es la coincidencia **exacta** (no la aproximada) y el rango
 * devuelto es independiente del de búsqueda, así que no hay que contar
 * columnas ni mantener el índice cuando alguien inserta una.
 *
 * Del modo de búsqueda solo se distingue el sentido (de arriba abajo o al
 * revés). Los modos binarios 2 y -2 se tratan como su equivalente lineal:
 * dan el mismo resultado sobre una lista ordenada, que es su única condición
 * de uso, y evitan una implementación aparte que habría que verificar.
 */
export function XLOOKUP(args: Argumento[], n: number): Columna {
  const buscado = args[0]?.columnas[0];
  const rangoBusqueda = args[1];
  const rangoDevuelto = args[2];
  if (!buscado || !rangoBusqueda || !rangoDevuelto) return todoError('#VALUE!', n);

  const largo = rangoBusqueda.columnas.length;
  if (rangoDevuelto.columnas.length !== largo) return todoError('#VALUE!', n);

  // Un cuarto argumento omitido (`BUSCARX(x;a;b;;-1)`) no es un valor por
  // defecto: pide el `#N/A` de siempre. Ver `Argumento.omitido`.
  const siNoEncontrado = args[3]?.omitido === true ? undefined : args[3]?.columnas[0];
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    const modoCoincidencia = opcionalNumero(args[4], i, 0);
    const modoBusqueda = opcionalNumero(args[5], i, 1);
    if (typeof modoCoincidencia === 'string' || typeof modoBusqueda === 'string') {
      salida.ponerError(i, typeof modoCoincidencia === 'string' ? modoCoincidencia : (modoBusqueda as ErrorExcel));
      continue;
    }

    const alReves = Math.trunc(modoBusqueda) < 0;
    const celda = (k: number): Columna | undefined =>
      rangoBusqueda.columnas[alReves ? largo - 1 - k : k];

    const modo = Math.trunc(modoCoincidencia);
    let k: number;
    if (modo === 0 || modo === 2) {
      // El modo 2 es "con comodines", que es lo que `buscarExacto` ya hace.
      k = buscarExacto(buscado, i, largo, celda);
    } else {
      k = buscarCercano(buscado, i, largo, celda, modo > 0);
    }

    if (k < 0) {
      if (siNoEncontrado) salida.ponerValor(i, valorEn(siNoEncontrado, i));
      else salida.ponerError(i, '#N/A');
      continue;
    }

    const indiceReal = alReves ? largo - 1 - k : k;
    const destino = rangoDevuelto.columnas[indiceReal];
    if (!destino) salida.ponerError(i, '#REF!');
    else salida.ponerValor(i, valorEn(destino, i));
  }
  return salida.terminar();
}

/** `COINCIDIRX(buscado; rango; [modo_coincidencia]; [modo_busqueda])`. */
export function XMATCH(args: Argumento[], n: number): Columna {
  const buscado = args[0]?.columnas[0];
  const rango = args[1];
  if (!buscado || !rango) return todoError('#VALUE!', n);

  const largo = rango.columnas.length;
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    const modo = opcionalNumero(args[2], i, 0);
    const modoBusqueda = opcionalNumero(args[3], i, 1);
    if (typeof modo === 'string' || typeof modoBusqueda === 'string') {
      salida.ponerError(i, typeof modo === 'string' ? modo : (modoBusqueda as ErrorExcel));
      continue;
    }

    const alReves = Math.trunc(modoBusqueda) < 0;
    const celda = (k: number): Columna | undefined => rango.columnas[alReves ? largo - 1 - k : k];

    const m = Math.trunc(modo);
    const k = m === 0 || m === 2
      ? buscarExacto(buscado, i, largo, celda)
      : buscarCercano(buscado, i, largo, celda, m > 0);

    if (k < 0) salida.ponerError(i, '#N/A');
    else salida.ponerNumero(i, (alReves ? largo - 1 - k : k) + 1);
  }
  return salida.terminar();
}

/** `ELEGIR(índice; valor1; valor2; …)`, con el índice empezando en 1. */
export function CHOOSE(args: Argumento[], n: number): Columna {
  const indiceCol = args[0]?.columnas[0];
  if (!indiceCol || args.length < 2) return todoError('#VALUE!', n);

  const opciones = args.slice(1);
  const salida = crearConstructor(n);

  for (let i = 0; i < n; i++) {
    const v = coercionNumerica(indiceCol, i);
    if (typeof v === 'string') {
      salida.ponerError(i, v);
      continue;
    }
    const idx = Math.trunc(v);
    if (idx < 1 || idx > opciones.length) {
      salida.ponerError(i, '#VALUE!');
      continue;
    }
    const elegido = (opciones[idx - 1] as Argumento).columnas[0];
    if (!elegido) salida.ponerError(i, '#VALUE!');
    else salida.ponerValor(i, valorEn(elegido, i));
  }
  return salida.terminar();
}
