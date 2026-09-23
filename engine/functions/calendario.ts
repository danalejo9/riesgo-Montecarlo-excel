/**
 * Funciones de calendario: las que dependen de una **convención** y no solo de
 * contar días.
 *
 * `fechas.ts` las dejó fuera a propósito, con una advertencia que sigue en
 * pie: todas tienen variantes (las cinco bases de `FRAC.AÑO`, el método
 * europeo y el estadounidense de `DIAS360`, los festivos de las laborables) y
 * se pueden escribir de memoria dando números **plausibles y equivocados**.
 * Aquí se implementan con los algoritmos documentados —y reproducidos por
 * otras hojas de cálculo para ser compatibles con Excel—, y **la sexta tanda
 * del libro de fidelidad** los pone a prueba en los bordes donde las
 * convenciones difieren: el último día de febrero, los días 31, los años
 * bisiestos. Hasta que vuelva de Excel, nada de esto está verificado.
 *
 * Las fechas se truncan a días enteros, como en Excel: la hora no cuenta.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import { coercionNumerica } from '../values/coercion.ts';
import {
  crearConstructor,
  desdeEscalar,
  esInvariante,
  numeroEn,
  textoEn,
  tipoEn,
  ERROR,
  NUMERO,
  TEXTO,
  VACIO,
  errorEn,
  type Columna,
  type ValorEscalar,
} from '../values/columna.ts';
import { regionalActual } from '../values/regional.ts';
import { nAriaNumerica, type Resultado } from './elemental.ts';
import { partesDeSerie, serieDePartes } from './fechas.ts';
import type { Argumento } from './types.ts';

interface Fecha {
  anio: number;
  mes: number;
  dia: number;
}

function partes(serie: number): Fecha | ErrorExcel {
  return partesDeSerie(Math.floor(serie));
}

const esBisiesto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const esUltimoDelMes = (f: Fecha) => f.dia === diasDelMes(f.anio, f.mes);
const esUltimoDeFebrero = (f: Fecha) => f.mes === 2 && esUltimoDelMes(f);

// --- 30/360 --------------------------------------------------------------------

/**
 * Días entre dos fechas contando meses de 30 días, con el método de la NASD
 * (Estados Unidos) o el europeo.
 *
 * - **Europeo**: un día 31 pasa a ser 30, en las dos fechas. Nada más.
 * - **NASD**: el inicio pasa a 30 si es día 31 o el último día de febrero; el
 *   fin pasa a 30 si es día 31 y el inicio ya es 30. `conFebreroFinal` añade
 *   la regla de que, si las dos fechas son el último día de febrero, el fin
 *   también pasa a 30: la aplica `FRAC.AÑO` con base 0 y, según las fuentes,
 *   **no** `DIAS360`. Es exactamente la clase de diferencia que tiene que
 *   confirmar el libro de fidelidad.
 */
function dias360(inicio: Fecha, fin: Fecha, europeo: boolean, conFebreroFinal: boolean): number {
  let d1 = inicio.dia;
  let d2 = fin.dia;

  if (europeo) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    if (conFebreroFinal && esUltimoDeFebrero(inicio) && esUltimoDeFebrero(fin)) d2 = 30;
    if (d1 === 31 || esUltimoDeFebrero(inicio)) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
  }

  return (fin.anio - inicio.anio) * 360 + (fin.mes - inicio.mes) * 30 + (d2 - d1);
}

/** `DIAS360(inicio; fin; [europeo])`. */
export function DAYS360(args: Argumento[], n: number): Columna {
  const conMetodo = args.length >= 3;
  const lista = conMetodo ? [args[0], args[1], args[2]] : [args[0], args[1]];
  return nAriaNumerica(lista, n, (v) => {
    const a = partes(v[0] as number);
    const b = partes(v[1] as number);
    if (typeof a === 'string') return a;
    if (typeof b === 'string') return b;
    return dias360(a, b, conMetodo && (v[2] as number) !== 0, false);
  });
}

// --- FRAC.AÑO ----------------------------------------------------------------

/**
 * La base "real/real" de `FRAC.AÑO`, que es la difícil: Excel no divide entre
 * 365 ni entre 366, sino entre **la duración media de los años que toca** el
 * intervalo, con un caso aparte para los intervalos de menos de un año. Es el
 * algoritmo que reproducen otras hojas para ser compatibles con Excel.
 */
function realReal(s1: number, s2: number, a: Fecha, b: Fecha): number {
  const dias = s2 - s1;
  const menosDeUnAno =
    a.anio === b.anio ||
    (b.anio === a.anio + 1 && (a.mes > b.mes || (a.mes === b.mes && a.dia >= b.dia)));

  if (menosDeUnAno) {
    let base: number;
    if (a.anio === b.anio) {
      base = esBisiesto(a.anio) ? 366 : 365;
    } else {
      // Cruza un fin de año sin llegar a uno entero: 366 si toca un 29 de
      // febrero dentro del intervalo, 365 si no.
      const tocaInicio = esBisiesto(a.anio) && (a.mes < 2 || (a.mes === 2 && a.dia <= 29));
      const tocaFin = esBisiesto(b.anio) && (b.mes > 2 || (b.mes === 2 && b.dia === 29));
      base = tocaInicio || tocaFin ? 366 : 365;
    }
    return dias / base;
  }

  let total = 0;
  for (let y = a.anio; y <= b.anio; y++) total += esBisiesto(y) ? 366 : 365;
  const media = total / (b.anio - a.anio + 1);
  return dias / media;
}

/**
 * `FRAC.AÑO(inicio; fin; [base])`: la fracción de año entre dos fechas.
 *
 * | base | convención          |
 * |-----:|---------------------|
 * |    0 | 30/360 NASD (defecto)|
 * |    1 | real/real           |
 * |    2 | real/360            |
 * |    3 | real/365            |
 * |    4 | 30/360 europea      |
 *
 * El orden de las fechas no importa: el resultado es siempre positivo.
 */
export function YEARFRAC(args: Argumento[], n: number): Columna {
  const conBase = args.length >= 3;
  const lista = conBase ? [args[0], args[1], args[2]] : [args[0], args[1]];
  return nAriaNumerica(lista, n, (v) => {
    let s1 = Math.floor(v[0] as number);
    let s2 = Math.floor(v[1] as number);
    const base = conBase ? Math.trunc(v[2] as number) : 0;
    if (base < 0 || base > 4) return '#NUM!';
    if (s1 > s2) [s1, s2] = [s2, s1];

    const a = partes(s1);
    const b = partes(s2);
    if (typeof a === 'string') return a;
    if (typeof b === 'string') return b;

    switch (base) {
      case 0: return dias360(a, b, false, true) / 360;
      case 1: return realReal(s1, s2, a, b);
      case 2: return (s2 - s1) / 360;
      case 3: return (s2 - s1) / 365;
      default: return dias360(a, b, true, false) / 360;
    }
  });
}

// --- SIFECHA ----------------------------------------------------------------

/**
 * `SIFECHA(inicio; fin; unidad)`: la función que Excel tiene y no documenta en
 * el asistente, heredada de Lotus.
 *
 * | unidad | qué cuenta                                           |
 * |:------:|------------------------------------------------------|
 * |   Y    | años completos                                       |
 * |   M    | meses completos                                      |
 * |   D    | días                                                 |
 * |   YM   | meses completos, sin contar los años                 |
 * |   YD   | días, sin contar los años                            |
 * |   MD   | días, sin contar meses ni años                       |
 *
 * **"MD" tiene un fallo conocido en Excel** que Microsoft documenta y no
 * corrige: `SIFECHA(31/1; 1/3; "MD")` da -2. Se reproduce, porque un modelo
 * que lo use depende de ese número.
 */
export function DATEDIF(args: Argumento[], n: number): Columna {
  const cUnidad = args[2]?.columnas[0];
  if (!args[0] || !args[1] || !cUnidad) return desdeEscalar({ tipo: ERROR, error: '#VALUE!' }, n);

  const unidades = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const t = tipoEn(cUnidad, i);
    if (t === ERROR) unidades.ponerError(i, errorEn(cUnidad, i) ?? '#VALUE!');
    else unidades.ponerTexto(i, (t === TEXTO ? textoEn(cUnidad, i) ?? '' : '').toUpperCase());
  }
  const colUnidad = unidades.terminar();

  const calcular = (s1: number, s2: number, unidad: string): Resultado => {
    if (s1 > s2) return '#NUM!';
    const a = partes(s1);
    const b = partes(s2);
    if (typeof a === 'string') return a;
    if (typeof b === 'string') return b;

    const meses = (b.anio - a.anio) * 12 + (b.mes - a.mes) - (b.dia < a.dia ? 1 : 0);
    switch (unidad) {
      case 'Y': return Math.floor(meses / 12);
      case 'M': return meses;
      case 'D': return Math.floor(s2) - Math.floor(s1);
      case 'YM': return meses % 12;
      case 'MD': {
        if (b.dia >= a.dia) return b.dia - a.dia;
        // Días del mes anterior al del fin, menos el día de inicio, más el día
        // de fin. Con un mes anterior más corto que el día de inicio sale
        // negativo: es el fallo conocido de Excel, reproducido a propósito.
        const mesPrevio = b.mes === 1 ? 12 : b.mes - 1;
        const anioPrevio = b.mes === 1 ? b.anio - 1 : b.anio;
        return diasDelMes(anioPrevio, mesPrevio) - a.dia + b.dia;
      }
      case 'YD': {
        let aniversario = serieDePartes(a.anio, b.mes, b.dia);
        if (typeof aniversario === 'string') return aniversario;
        if (aniversario < Math.floor(s1)) {
          aniversario = serieDePartes(a.anio + 1, b.mes, b.dia);
          if (typeof aniversario === 'string') return aniversario;
        }
        return aniversario - Math.floor(s1);
      }
      default:
        return '#NUM!';
    }
  };

  const c1 = args[0].columnas[0] as Columna;
  const c2 = args[1].columnas[0] as Columna;
  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) {
    const v1 = coercionNumerica(c1, i);
    const v2 = coercionNumerica(c2, i);
    if (typeof v1 === 'string') { salida.ponerError(i, v1); continue; }
    if (typeof v2 === 'string') { salida.ponerError(i, v2); continue; }
    if (tipoEn(colUnidad, i) === ERROR) { salida.ponerError(i, errorEn(colUnidad, i) ?? '#VALUE!'); continue; }
    const r = calcular(v1, v2, textoEn(colUnidad, i) ?? '');
    if (typeof r === 'string') salida.ponerError(i, r);
    else salida.ponerNumero(i, r);
  }
  return salida.terminar();
}

// --- Días laborables ---------------------------------------------------------

/** 0 = domingo … 6 = sábado. El 31-12-1899 (serie 0) fue sábado para Excel. */
function diaSemana(serie: number): number {
  return (((Math.floor(serie) % 7) + 7) % 7 + 6) % 7;
}

const esFinDeSemana = (serie: number) => {
  const d = diaSemana(serie);
  return d === 0 || d === 6;
};

/**
 * Los festivos de un argumento, en cada iteración. Lo que no sea un número se
 * ignora; un error se propaga.
 */
function festivos(arg: Argumento | undefined, i: number): Set<number> | ErrorExcel {
  const out = new Set<number>();
  if (!arg || arg.omitido) return out;
  for (const c of arg.columnas) {
    const t = tipoEn(c, i);
    if (t === ERROR) return errorEn(c, i) ?? '#VALUE!';
    if (t === NUMERO) out.add(Math.floor(numeroEn(c, i)));
  }
  return out;
}

function porIteracionConFestivos(
  args: Argumento[],
  n: number,
  calcular: (a: number, b: number, fest: Set<number>) => Resultado,
): Columna {
  const c1 = args[0]?.columnas[0];
  const c2 = args[1]?.columnas[0];
  if (!c1 || !c2) return desdeEscalar({ tipo: ERROR, error: '#VALUE!' }, n);

  const todoFijo = esInvariante(c1) && esInvariante(c2) && (args[2]?.columnas ?? []).every(esInvariante);
  const una = (i: number): ValorEscalar => {
    const a = coercionNumerica(c1, i);
    if (typeof a === 'string') return { tipo: ERROR, error: a };
    const b = coercionNumerica(c2, i);
    if (typeof b === 'string') return { tipo: ERROR, error: b };
    const f = festivos(args[2], i);
    if (typeof f === 'string') return { tipo: ERROR, error: f };
    const r = calcular(a, b, f);
    return typeof r === 'string' ? { tipo: ERROR, error: r } : { tipo: NUMERO, numero: r };
  };

  if (todoFijo) return desdeEscalar(una(0), n);
  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) salida.ponerValor(i, una(i));
  return salida.terminar();
}

/**
 * `DIA.LAB(inicio; días; [festivos])`: la fecha que cae tantos días laborables
 * después (o antes, si es negativo) del inicio, saltando sábados, domingos y
 * festivos. Con 0 días devuelve el inicio aunque sea festivo.
 */
export function WORKDAY(args: Argumento[], n: number): Columna {
  return porIteracionConFestivos(args, n, (inicio, dias, fest) => {
    let s = Math.floor(inicio);
    let quedan = Math.trunc(dias);
    const paso = quedan < 0 ? -1 : 1;
    while (quedan !== 0) {
      s += paso;
      if (!esFinDeSemana(s) && !fest.has(s)) quedan -= paso;
    }
    return s < 0 ? '#NUM!' : s;
  });
}

/**
 * `DIAS.LAB(inicio; fin; [festivos])`: cuántos días laborables hay entre dos
 * fechas, **contando las dos**. Si el inicio es posterior al fin, el resultado
 * es negativo. Un festivo repetido o en fin de semana no descuenta dos veces.
 */
export function NETWORKDAYS(args: Argumento[], n: number): Columna {
  return porIteracionConFestivos(args, n, (inicio, fin, fest) => {
    let a = Math.floor(inicio);
    let b = Math.floor(fin);
    const signo = a > b ? -1 : 1;
    if (a > b) [a, b] = [b, a];

    // Semanas completas de cinco laborables, y el resto día a día.
    const total = b - a + 1;
    const semanas = Math.floor(total / 7);
    let laborables = semanas * 5;
    for (let s = a + semanas * 7; s <= b; s++) if (!esFinDeSemana(s)) laborables++;

    for (const f of fest) if (f >= a && f <= b && !esFinDeSemana(f)) laborables--;
    return signo * laborables;
  });
}

// --- FECHANUMERO ---------------------------------------------------------------

const MESES_TEXTO: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5,
  jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9,
  oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
  jan: 1, january: 1, february: 2, march: 3, apr: 4, april: 4, june: 6, july: 7,
  aug: 8, august: 8, september: 9, october: 10, november: 11, dec: 12, december: 12,
};

/** Un año de dos cifras, con la regla de Excel: 00-29 es 20xx y 30-99 es 19xx. */
function anioCompleto(a: number, cifras: number): number {
  if (cifras > 2) return a;
  return a < 30 ? 2000 + a : 1900 + a;
}

/**
 * `FECHANUMERO(texto)`: una fecha escrita como texto, convertida a número de
 * serie. **El orden del día y el mes lo decide la configuración regional**:
 * en español "03/04/2026" es el 3 de abril; en inglés, el 4 de marzo.
 *
 * Entiende día/mes/año con `/`, `-` o `.`, el formato ISO año-mes-día, y los
 * meses escritos con letra en español o inglés ("23-sep-2026"). La hora, si
 * la hay, se ignora, como hace Excel.
 *
 * **Sin año, `#¡VALOR!`**, aunque Excel tome el año en curso: eso haría que el
 * resultado dependiera del día en que se simula, y el motor no admite nada
 * volátil (la misma razón por la que `HOY` no está).
 */
export function DATEVALUE(args: Argumento[], n: number): Columna {
  const c = args[0]?.columnas[0];
  if (!c) return desdeEscalar({ tipo: ERROR, error: '#VALUE!' }, n);

  const leer = (i: number): ValorEscalar => {
    const t = tipoEn(c, i);
    if (t === ERROR) return { tipo: ERROR, error: errorEn(c, i) ?? '#VALUE!' };
    if (t !== TEXTO && t !== VACIO) return { tipo: ERROR, error: '#VALUE!' };
    const serie = serieDeTexto(textoEn(c, i) ?? '');
    return serie === undefined ? { tipo: ERROR, error: '#VALUE!' } : { tipo: NUMERO, numero: serie };
  };

  if (esInvariante(c)) return desdeEscalar(leer(0), n);
  const salida = crearConstructor(n);
  for (let i = 0; i < n; i++) salida.ponerValor(i, leer(i));
  return salida.terminar();
}

function serieDeTexto(bruto: string): number | undefined {
  // La hora, si viene detrás, no cuenta.
  const s = bruto.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?(\s*[ap]\.?\s*m\.?)?$/i, '').trim().toLowerCase();
  if (s === '') return undefined;

  const valida = (a: number, m: number, d: number) => {
    if (m < 1 || m > 12 || d < 1 || d > diasDelMes(a, m) || a < 1900 || a > 9999) return undefined;
    const r = serieDePartes(a, m, d);
    return typeof r === 'string' ? undefined : r;
  };

  // ISO: 2026-09-23.
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]));

  // Numérico con tres partes: el orden de día y mes, según el idioma.
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const primero = Number(m[1]);
    const segundo = Number(m[2]);
    const anio = anioCompleto(Number(m[3]), (m[3] as string).length);
    const mesPrimero = regionalActual().idioma.toLowerCase().startsWith('en');
    return mesPrimero ? valida(anio, primero, segundo) : valida(anio, segundo, primero);
  }

  // Con el mes en letra: 23-sep-2026, 23 septiembre 2026, 23 de septiembre de 2026.
  m = /^(\d{1,2})[-/.\s]+(?:de\s+)?([a-záéíóú]+)\.?[-/.\s]+(?:de\s+)?(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mes = MESES_TEXTO[m[2] as string];
    if (!mes) return undefined;
    return valida(anioCompleto(Number(m[3]), (m[3] as string).length), mes, Number(m[1]));
  }

  return undefined;
}
