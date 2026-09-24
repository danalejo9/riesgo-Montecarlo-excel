/**
 * Funciones de texto (Nivel 2).
 *
 * Son las que más aparecen en libros ajenos y las que menos importan dentro de
 * una simulación: casi siempre construyen etiquetas (`"Año "&A1`), limpian
 * datos importados (`ESPACIOS`, `IZQUIERDA`) o extraen un código de una
 * referencia. Casi nunca están en el camino entre una entrada incierta y una
 * salida. Pero basta **una** en ese camino para que el motor rápido no pueda
 * evaluar el modelo, y entonces la simulación cae al modo compatible: 33
 * iteraciones por segundo en vez de 250.000. Por eso entran.
 *
 * ---
 *
 * **Atajo para lo invariante.** Si ningún argumento cambia entre iteraciones
 * —que es lo normal con texto: una etiqueta es la misma en el millón de
 * iteraciones—, la función se calcula **una vez** y se difunde, en vez de
 * construir un millón de cadenas iguales. Ver `porIteracion`.
 *
 * **Lo que queda fuera, a propósito: `TEXTO`.** Su resultado depende de la
 * configuración regional por cuatro sitios a la vez: el separador decimal, el
 * de miles, los nombres de meses y días, y los separadores de la propia cadena
 * de formato (que Excel guarda tal como la escribió el usuario, en su idioma).
 * Implementarla en inglés daría un resultado distinto al de Excel en cada
 * libro en español, que es exactamente el caso del usuario. Entra con la
 * configuración regional, no antes.
 *
 * **`VALOR` y `VALOR.NUMERO` sin separadores siguen la configuración
 * regional** (`engine/values/regional.ts`), igual que el resto del motor al
 * convertir texto en número. `VALOR.NUMERO` con separadores explícitos no
 * depende de nada, y por eso es la forma robusta de leer números importados.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import { coercionNumerica, coercionTexto, numeroDeTexto } from '../values/coercion.ts';
import { regionalActual } from '../values/regional.ts';
import {
  crearConstructor,
  desdeEscalar,
  errorEn,
  esInvariante,
  numeroEn,
  textoEn,
  tipoEn,
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
  type Columna,
  type ValorEscalar,
} from '../values/columna.ts';
import { celdaEn, type Argumento } from './types.ts';

/** El límite de longitud de una celda de Excel. Pasarlo es `#¡VALOR!`. */
const MAX_CARACTERES = 32767;

// --- Resultados ------------------------------------------------------------

const texto = (s: string): ValorEscalar => ({ tipo: TEXTO, texto: s });
const numero = (x: number): ValorEscalar => ({ tipo: NUMERO, numero: x });
const logico = (b: boolean): ValorEscalar => ({ tipo: LOGICO, numero: b ? 1 : 0 });
const error = (e: ErrorExcel): ValorEscalar => ({ tipo: ERROR, error: e });

/** Un texto dentro del límite de Excel, o el error que da Excel si lo pasa. */
function textoAcotado(s: string): ValorEscalar {
  return s.length > MAX_CARACTERES ? error('#VALUE!') : texto(s);
}

// --- Lectura de argumentos -------------------------------------------------

/**
 * Un argumento como texto, con la regla de Excel: un error se propaga, todo lo
 * demás se convierte (un número con su formato General, un vacío como "").
 */
function leerTexto(c: Columna, i: number): string | { error: ErrorExcel } {
  if (tipoEn(c, i) === ERROR) return { error: errorEn(c, i) ?? '#VALUE!' };
  return coercionTexto(c, i);
}

function leerNumero(c: Columna, i: number): number | { error: ErrorExcel } {
  const v = coercionNumerica(c, i);
  return typeof v === 'string' ? { error: v } : v;
}

const esFallo = (v: unknown): v is { error: ErrorExcel } =>
  typeof v === 'object' && v !== null && 'error' in v;

/** La primera columna de un argumento, si el argumento existe y no se omitió. */
function col(args: Argumento[], k: number): Columna | undefined {
  const a = args[k];
  if (!a || a.omitido) return undefined;
  return a.columnas[0];
}

/**
 * Recorre las iteraciones llamando a `f`, o **la llama una sola vez** si todos
 * los argumentos son invariantes. Con texto es el caso normal: una etiqueta es
 * la misma en todas las iteraciones, y construir un millón de copias de la
 * misma cadena para descubrirlo después sería tirar el tiempo y la memoria.
 */
function porIteracion(
  columnas: readonly (Columna | undefined)[],
  n: number,
  f: (i: number) => ValorEscalar,
): Columna {
  const presentes = columnas.filter((c): c is Columna => c !== undefined);
  if (presentes.every(esInvariante)) return desdeEscalar(f(0), n);

  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) salida.ponerValor(i, f(i));
  return salida.terminar();
}

/**
 * Las celdas de un argumento **por filas**, que es como las recorren
 * `CONCAT` y `UNIRCADENAS`. El motor aplana los rangos por columnas (ver
 * `celdaEn`), así que para un rango de varias columnas el orden hay que
 * reconstruirlo: `CONCAT(A1:B2)` es A1, B1, A2, B2 — no A1, A2, B1, B2.
 */
function celdasPorFilas(arg: Argumento): Columna[] {
  const forma = arg.forma;
  if (!arg.esRango || !forma || forma.cols === 1) return arg.columnas;

  const out: Columna[] = [];
  for (let f = 0; f < forma.filas; f++) {
    for (let c = 0; c < forma.cols; c++) {
      const celda = celdaEn(arg, f, c);
      if (celda) out.push(celda);
    }
  }
  return out;
}

/** Un argumento que tiene que ser un único valor. Un rango de varias celdas no lo es. */
function unValor(arg: Argumento | undefined): Columna | undefined {
  if (!arg || arg.omitido) return undefined;
  return arg.columnas.length === 1 ? arg.columnas[0] : undefined;
}

// --- Longitud y extracción -------------------------------------------------

/** `LARGO(texto)`. Un número cuenta los caracteres de su formato General. */
export function LEN(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  if (!c) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([c], n, (i) => {
    const s = leerTexto(c, i);
    return esFallo(s) ? error(s.error) : numero(s.length);
  });
}

/**
 * `IZQUIERDA(texto; [n])` y `DERECHA(texto; [n])`. `n` por omisión es 1; un
 * `n` negativo es `#¡VALOR!`, uno mayor que el texto devuelve el texto entero.
 */
function extremo(args: Argumento[], n: number, desdeLaDerecha: boolean): Columna {
  const c = col(args, 0);
  const cn = col(args, 1);
  if (!c) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion([c, cn], n, (i) => {
    const s = leerTexto(c, i);
    if (esFallo(s)) return error(s.error);
    const k = cn ? leerNumero(cn, i) : 1;
    if (esFallo(k)) return error(k.error);
    const cuantos = Math.trunc(k);
    if (cuantos < 0) return error('#VALUE!');
    return texto(desdeLaDerecha ? s.slice(Math.max(0, s.length - cuantos)) : s.slice(0, cuantos));
  });
}

export function LEFT(args: Argumento[], n: number): Columna {
  return extremo(args, n, false);
}

export function RIGHT(args: Argumento[], n: number): Columna {
  return extremo(args, n, true);
}

/**
 * `EXTRAE(texto; inicio; n)`. Un inicio menor que 1 o un `n` negativo es
 * `#¡VALOR!`; un inicio más allá del final devuelve el texto vacío, no un
 * error.
 */
export function MID(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  const ci = col(args, 1);
  const cn = col(args, 2);
  if (!c || !ci || !cn) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion([c, ci, cn], n, (i) => {
    const s = leerTexto(c, i);
    if (esFallo(s)) return error(s.error);
    const inicio = leerNumero(ci, i);
    if (esFallo(inicio)) return error(inicio.error);
    const cuantos = leerNumero(cn, i);
    if (esFallo(cuantos)) return error(cuantos.error);

    const desde = Math.trunc(inicio);
    const largo = Math.trunc(cuantos);
    if (desde < 1 || largo < 0) return error('#VALUE!');
    return texto(s.slice(desde - 1, desde - 1 + largo));
  });
}

// --- Mayúsculas, minúsculas y espacios -------------------------------------

function transformar(args: Argumento[], n: number, f: (s: string) => string): Columna {
  const c = col(args, 0);
  if (!c) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([c], n, (i) => {
    const s = leerTexto(c, i);
    return esFallo(s) ? error(s.error) : texto(f(s));
  });
}

export function UPPER(args: Argumento[], n: number): Columna {
  return transformar(args, n, (s) => s.toUpperCase());
}

export function LOWER(args: Argumento[], n: number): Columna {
  return transformar(args, n, (s) => s.toLowerCase());
}

/**
 * `NOMPROPIO(texto)`: mayúscula la primera letra de cada palabra y minúscula
 * el resto.
 *
 * Lo que Excel entiende por "palabra" es más tosco de lo que parece: **una
 * letra va en mayúscula si la anterior no es una letra**, sea un espacio, un
 * guion, un apóstrofo **o un dígito**. Por eso `NOMPROPIO("2nd")` da "2Nd" y
 * `NOMPROPIO("o'neil")` da "O'Neil". Es una rareza conocida y hay que
 * reproducirla, no corregirla.
 */
export function PROPER(args: Argumento[], n: number): Columna {
  return transformar(args, n, (s) => {
    let out = '';
    let anteriorEsLetra = false;
    for (const ch of s) {
      const esLetra = /\p{L}/u.test(ch);
      out += esLetra ? (anteriorEsLetra ? ch.toLowerCase() : ch.toUpperCase()) : ch;
      anteriorEsLetra = esLetra;
    }
    return out;
  });
}

/**
 * `ESPACIOS(texto)`: quita los espacios de los extremos y deja uno solo entre
 * palabras.
 *
 * **Solo el espacio normal** (carácter 32). El espacio duro (160), que es el
 * que traen los datos copiados de una web, no lo toca: es la razón por la que
 * `ESPACIOS` "no funciona" con datos importados, y hay que reproducirlo igual.
 */
export function TRIM(args: Argumento[], n: number): Columna {
  return transformar(args, n, (s) => s.replace(/ +/g, ' ').replace(/^ /, '').replace(/ $/, ''));
}

// --- Concatenar ------------------------------------------------------------

/**
 * `CONCATENAR(texto1; …)`: la versión antigua. Cada argumento tiene que ser un
 * único valor; un rango de varias celdas es `#¡VALOR!` en una celda suelta
 * (en Excel 365 se "derramaría" en varias celdas, cosa que el motor no hace).
 */
export function CONCATENATE(args: Argumento[], n: number): Columna {
  const columnas = args.map(unValor);
  if (columnas.some((c) => c === undefined)) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion(columnas, n, (i) => {
    let out = '';
    for (const c of columnas as Columna[]) {
      const s = leerTexto(c, i);
      if (esFallo(s)) return error(s.error);
      out += s;
    }
    return textoAcotado(out);
  });
}

/** `CONCAT(texto1; …)`: acepta rangos y los recorre por filas. */
export function CONCAT(args: Argumento[], n: number): Columna {
  const celdas = args.flatMap(celdasPorFilas);

  return porIteracion(celdas, n, (i) => {
    let out = '';
    for (const c of celdas) {
      const s = leerTexto(c, i);
      if (esFallo(s)) return error(s.error);
      out += s;
    }
    return textoAcotado(out);
  });
}

/**
 * `UNIRCADENAS(delimitador; ignorar_vacías; texto1; …)`.
 *
 * "Ignorar vacías" ignora tanto las celdas vacías como las que contienen el
 * texto vacío `""`, que es lo que devuelve una fórmula `=SI(…;"";…)`. Es justo
 * el caso para el que se usa.
 */
export function TEXTJOIN(args: Argumento[], n: number): Columna {
  const cDelim = unValor(args[0]);
  const cIgnorar = unValor(args[1]);
  if (!cDelim || !cIgnorar) return desdeEscalar(error('#VALUE!'), n);
  const celdas = args.slice(2).flatMap(celdasPorFilas);

  return porIteracion([cDelim, cIgnorar, ...celdas], n, (i) => {
    const delim = leerTexto(cDelim, i);
    if (esFallo(delim)) return error(delim.error);
    const ignorar = leerNumero(cIgnorar, i);
    if (esFallo(ignorar)) return error(ignorar.error);

    const partes: string[] = [];
    for (const c of celdas) {
      const s = leerTexto(c, i);
      if (esFallo(s)) return error(s.error);
      if (ignorar !== 0 && s === '') continue;
      partes.push(s);
    }
    return textoAcotado(partes.join(delim));
  });
}

// --- Buscar y sustituir ----------------------------------------------------

/**
 * `ENCONTRAR` (distingue mayúsculas, sin comodines) y `HALLAR` (no distingue,
 * con comodines `*`, `?` y `~`). Devuelven la posición contando desde el
 * principio del texto, no desde el inicio de la búsqueda; si no encuentran,
 * `#¡VALOR!` — no `#N/A`, que es lo que uno esperaría.
 *
 * Buscar el texto vacío devuelve la posición de inicio: `ENCONTRAR("";"abc")`
 * es 1.
 */
function buscarTexto(args: Argumento[], n: number, comodinesSinMayusculas: boolean): Columna {
  const cBuscado = col(args, 0);
  const cDentro = col(args, 1);
  const cInicio = col(args, 2);
  if (!cBuscado || !cDentro) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion([cBuscado, cDentro, cInicio], n, (i) => {
    const buscado = leerTexto(cBuscado, i);
    if (esFallo(buscado)) return error(buscado.error);
    const dentro = leerTexto(cDentro, i);
    if (esFallo(dentro)) return error(dentro.error);
    const inicio = cInicio ? leerNumero(cInicio, i) : 1;
    if (esFallo(inicio)) return error(inicio.error);

    const desde = Math.trunc(inicio);
    if (desde < 1 || desde > dentro.length + 1) return error('#VALUE!');
    if (buscado === '') return numero(desde);

    if (!comodinesSinMayusculas) {
      const k = dentro.indexOf(buscado, desde - 1);
      return k < 0 ? error('#VALUE!') : numero(k + 1);
    }

    const patron = new RegExp(patronHallar(buscado), 'iy');
    for (let k = desde - 1; k < dentro.length; k++) {
      patron.lastIndex = k;
      if (patron.test(dentro)) return numero(k + 1);
    }
    return error('#VALUE!');
  });
}

/**
 * Los comodines de `HALLAR` como expresión regular **sin anclar al final**:
 * `HALLAR("b*d";"abcde")` encuentra en la 2, porque basta con que el patrón
 * encaje empezando ahí. `~` escapa el comodín que le sigue.
 */
function patronHallar(s: string): string {
  let re = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (ch === '~' && i + 1 < s.length && '*?~'.includes(s[i + 1] as string)) {
      re += escapar(s[++i] as string);
    } else if (ch === '*') {
      re += '[\\s\\S]*?';
    } else if (ch === '?') {
      re += '[\\s\\S]';
    } else {
      re += escapar(ch);
    }
  }
  return re;
}

function escapar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function FIND(args: Argumento[], n: number): Columna {
  return buscarTexto(args, n, false);
}

export function SEARCH(args: Argumento[], n: number): Columna {
  return buscarTexto(args, n, true);
}

/**
 * `SUSTITUIR(texto; viejo; nuevo; [ocurrencia])`. Distingue mayúsculas. Sin
 * ocurrencia sustituye todas; con ella, solo esa. Sustituir el texto vacío no
 * hace nada.
 */
export function SUBSTITUTE(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  const cViejo = col(args, 1);
  const cNuevo = col(args, 2);
  const cOcurrencia = col(args, 3);
  if (!c || !cViejo || !cNuevo) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion([c, cViejo, cNuevo, cOcurrencia], n, (i) => {
    const s = leerTexto(c, i);
    if (esFallo(s)) return error(s.error);
    const viejo = leerTexto(cViejo, i);
    if (esFallo(viejo)) return error(viejo.error);
    const nuevo = leerTexto(cNuevo, i);
    if (esFallo(nuevo)) return error(nuevo.error);
    if (viejo === '') return texto(s);

    if (!cOcurrencia) return textoAcotado(s.split(viejo).join(nuevo));

    const cual = leerNumero(cOcurrencia, i);
    if (esFallo(cual)) return error(cual.error);
    const objetivo = Math.trunc(cual);
    if (objetivo < 1) return error('#VALUE!');

    let desde = 0;
    for (let vista = 1; ; vista++) {
      const k = s.indexOf(viejo, desde);
      if (k < 0) return texto(s); // no hay tantas ocurrencias: se deja tal cual
      if (vista === objetivo) return textoAcotado(s.slice(0, k) + nuevo + s.slice(k + viejo.length));
      desde = k + viejo.length;
    }
  });
}

/** `REEMPLAZAR(texto; inicio; n; nuevo)`: por posición, no por contenido. */
export function REPLACE(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  const cInicio = col(args, 1);
  const cCuantos = col(args, 2);
  const cNuevo = col(args, 3);
  if (!c || !cInicio || !cCuantos || !cNuevo) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion([c, cInicio, cCuantos, cNuevo], n, (i) => {
    const s = leerTexto(c, i);
    if (esFallo(s)) return error(s.error);
    const inicio = leerNumero(cInicio, i);
    if (esFallo(inicio)) return error(inicio.error);
    const cuantos = leerNumero(cCuantos, i);
    if (esFallo(cuantos)) return error(cuantos.error);
    const nuevo = leerTexto(cNuevo, i);
    if (esFallo(nuevo)) return error(nuevo.error);

    const desde = Math.trunc(inicio);
    const largo = Math.trunc(cuantos);
    if (desde < 1 || largo < 0) return error('#VALUE!');
    return textoAcotado(s.slice(0, desde - 1) + nuevo + s.slice(desde - 1 + largo));
  });
}

/** `REPETIR(texto; n)`. Pasar el límite de una celda es `#¡VALOR!`. */
export function REPT(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  const cn = col(args, 1);
  if (!c || !cn) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion([c, cn], n, (i) => {
    const s = leerTexto(c, i);
    if (esFallo(s)) return error(s.error);
    const veces = leerNumero(cn, i);
    if (esFallo(veces)) return error(veces.error);
    const k = Math.trunc(veces);
    if (k < 0 || s.length * k > MAX_CARACTERES) return error('#VALUE!');
    return texto(s.repeat(k));
  });
}

// --- Caracteres --------------------------------------------------------------

/**
 * La página de códigos de Windows (1252) entre 128 y 159, que es donde difiere
 * de Unicode. `CARACTER(128)` es "€" en Excel para Windows, no un carácter de
 * control. Los cinco huecos que 1252 no define se dejan como su propio código.
 */
const WINDOWS_1252: Record<number, number> = {
  128: 0x20ac, 130: 0x201a, 131: 0x0192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021,
  136: 0x02c6, 137: 0x2030, 138: 0x0160, 139: 0x2039, 140: 0x0152, 142: 0x017d,
  145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014,
  152: 0x02dc, 153: 0x2122, 154: 0x0161, 155: 0x203a, 156: 0x0153, 158: 0x017e, 159: 0x0178,
};
const INVERSO_1252 = new Map(Object.entries(WINDOWS_1252).map(([k, v]) => [v, Number(k)] as const));

/** `CARACTER(n)`, entre 1 y 255. */
export function CHAR(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  if (!c) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([c], n, (i) => {
    const v = leerNumero(c, i);
    if (esFallo(v)) return error(v.error);
    const k = Math.trunc(v);
    if (k < 1 || k > 255) return error('#VALUE!');
    return texto(String.fromCodePoint(WINDOWS_1252[k] ?? k));
  });
}

/**
 * `CODIGO(texto)`: el código del primer carácter en la página de Windows. Un
 * carácter que no existe en ella da 63, que es el "?" con el que Windows lo
 * sustituye. El texto vacío es `#¡VALOR!`.
 */
export function CODE(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  if (!c) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([c], n, (i) => {
    const s = leerTexto(c, i);
    if (esFallo(s)) return error(s.error);
    const primero = s.codePointAt(0);
    if (primero === undefined) return error('#VALUE!');
    if (primero <= 127 || (primero >= 160 && primero <= 255)) return numero(primero);
    return numero(INVERSO_1252.get(primero) ?? 63);
  });
}

/** `IGUAL(a; b)`: distingue mayúsculas, a diferencia del operador `=`. */
export function EXACT(args: Argumento[], n: number): Columna {
  const a = col(args, 0);
  const b = col(args, 1);
  if (!a || !b) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([a, b], n, (i) => {
    const sa = leerTexto(a, i);
    if (esFallo(sa)) return error(sa.error);
    const sb = leerTexto(b, i);
    if (esFallo(sb)) return error(sb.error);
    return logico(sa === sb);
  });
}

// --- De texto a número -----------------------------------------------------

/**
 * `VALOR(texto)`: la misma conversión que hace el motor con `"5"+0`, para que
 * las dos no puedan discrepar. Con dos diferencias que Excel sí hace: el texto
 * vacío es `#¡VALOR!` (aunque `""+0` sea 0) y un lógico también.
 *
 * **No reconoce fechas ni horas escritas como texto** (`VALOR("12:30")` es 0,5
 * en Excel). Ni la coma decimal de un libro en español: ver el docstring del
 * módulo.
 */
export function VALUE(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  if (!c) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([c], n, (i) => {
    switch (tipoEn(c, i)) {
      case NUMERO:
        return numero(numeroEn(c, i));
      case VACIO:
        return numero(0);
      case ERROR:
        return error(errorEn(c, i) ?? '#VALUE!');
      case LOGICO:
        return error('#VALUE!');
      case TEXTO: {
        const s = textoEn(c, i) ?? '';
        if (s.trim() === '') return error('#VALUE!');
        const v = numeroDeTexto(s);
        return v === undefined ? error('#VALUE!') : numero(v);
      }
    }
  });
}

/**
 * `VALOR.NUMERO(texto; [separador_decimal]; [separador_miles])`: la versión
 * que **no depende de la configuración regional**, porque se le dicen los
 * separadores. Es la forma robusta de leer números importados de otro país.
 *
 * Las reglas de Excel: se ignoran los espacios; los separadores de miles solo
 * valen antes del decimal; cada `%` final divide entre 100; el texto vacío es
 * 0; y si los dos separadores son iguales, `#¡VALOR!`.
 */
export function NUMBERVALUE(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  const cDec = col(args, 1);
  const cMiles = col(args, 2);
  if (!c) return desdeEscalar(error('#VALUE!'), n);

  return porIteracion([c, cDec, cMiles], n, (i) => {
    const s = leerTexto(c, i);
    if (esFallo(s)) return error(s.error);
    // Sin separadores, los de la configuración regional: es lo que hace Excel.
    const regional = regionalActual();
    const dec = cDec ? leerTexto(cDec, i) : regional.decimal;
    if (esFallo(dec)) return error(dec.error);
    const miles = cMiles ? leerTexto(cMiles, i) : regional.miles;
    if (esFallo(miles)) return error(miles.error);

    const sd = dec[0] ?? '.';
    const sm = miles[0] ?? ',';
    if (sd === sm) return error('#VALUE!');

    let cuerpo = s.replace(/\s+/g, '');
    if (cuerpo === '') return numero(0);

    let porcientos = 0;
    while (cuerpo.endsWith('%')) {
      porcientos++;
      cuerpo = cuerpo.slice(0, -1);
    }

    const posDecimal = cuerpo.indexOf(sd);
    if (posDecimal >= 0 && cuerpo.indexOf(sd, posDecimal + 1) >= 0) return error('#VALUE!');
    const entera = posDecimal >= 0 ? cuerpo.slice(0, posDecimal) : cuerpo;
    const fraccion = posDecimal >= 0 ? cuerpo.slice(posDecimal + 1) : '';
    if (fraccion.includes(sm)) return error('#VALUE!');

    const normalizado = `${entera.split(sm).join('')}${posDecimal >= 0 ? `.${fraccion}` : ''}`;
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(normalizado)) return error('#VALUE!');
    return numero(Number(normalizado) / 100 ** porcientos);
  });
}

// --- Tipo y conversión trivial ---------------------------------------------

/**
 * `TIPO(valor)`: 1 número, 2 texto, 4 lógico, 16 error, 64 matriz. Una celda
 * vacía es 1. **No propaga el error**: preguntar el tipo de un error es la
 * forma de detectarlo sin `ESERROR`.
 */
export function TYPE(args: Argumento[], n: number): Columna {
  const a = args[0];
  if (!a) return desdeEscalar(error('#VALUE!'), n);
  if (a.esRango && a.columnas.length > 1) return desdeEscalar(numero(64), n);
  const c = a.columnas[0] as Columna;
  return porIteracion([c], n, (i) => {
    switch (tipoEn(c, i)) {
      case NUMERO:
      case VACIO:
        return numero(1);
      case TEXTO:
        return numero(2);
      case LOGICO:
        return numero(4);
      case ERROR:
        return numero(16);
    }
  });
}

/** `N(valor)`: el número si lo es, 1/0 si es lógico, 0 para todo lo demás. El error se propaga. */
export function N(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  if (!c) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([c], n, (i) => {
    switch (tipoEn(c, i)) {
      case NUMERO:
      case LOGICO:
        return numero(numeroEn(c, i));
      case ERROR:
        return error(errorEn(c, i) ?? '#VALUE!');
      default:
        return numero(0);
    }
  });
}

/** `T(valor)`: el texto si lo es, el texto vacío para todo lo demás. El error se propaga. */
export function T(args: Argumento[], n: number): Columna {
  const c = col(args, 0);
  if (!c) return desdeEscalar(error('#VALUE!'), n);
  return porIteracion([c], n, (i) => {
    switch (tipoEn(c, i)) {
      case TEXTO:
        return texto(textoEn(c, i) ?? '');
      case ERROR:
        return error(errorEn(c, i) ?? '#VALUE!');
      default:
        return texto('');
    }
  });
}

/**
 * `HIPERVINCULO(ubicación; [nombre])`. El valor de la celda es el nombre si se
 * da, o la ubicación si no; lo de abrir el enlace es cosa de la interfaz de
 * Excel y no afecta al cálculo.
 */
export function HYPERLINK(args: Argumento[], n: number): Columna {
  const cLink = col(args, 0);
  const cNombre = col(args, 1);
  if (!cLink) return desdeEscalar(error('#VALUE!'), n);
  const mostrado = cNombre ?? cLink;
  return porIteracion([mostrado], n, (i) => {
    const s = leerTexto(mostrado, i);
    return esFallo(s) ? error(s.error) : texto(s);
  });
}
