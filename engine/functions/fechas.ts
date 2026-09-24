/**
 * Funciones de fecha (Nivel 1 de Fase 2 §4.2).
 *
 * Entran ahora porque el escáner las encontró en un libro real del usuario
 * (`Caso_practico.xlsx`): `FIN.MES`, `MES` y `AÑO` salen 300 veces cada una.
 * Sin ellas ese libro no corre en el motor rápido.
 *
 * ---
 *
 * **Una fecha de Excel es un número**, el "número de serie": los días
 * transcurridos desde una época, con la hora en la parte decimal. Por eso
 * `AÑO(A1)` no necesita ningún tipo nuevo — opera sobre el mismo `Float64Array`
 * que el resto del motor.
 *
 * **El error de 1900 que hay que reproducir a propósito.** Lotus 1-2-3 trataba
 * 1900 como año bisiesto y Excel copió el fallo para ser compatible con él, así
 * que el número de serie 60 es el 29 de febrero de 1900, un día que no existió.
 * La consecuencia práctica es que la época cambia según el tramo:
 *
 *   - serie 1..59  → 1 de enero de 1900 en adelante (época 1899-12-31)
 *   - serie 60     → el 29 de febrero de 1900 inexistente
 *   - serie 61..   → 1 de marzo de 1900 en adelante (época 1899-12-30)
 *
 * Usar una sola época, que es lo que sale natural, da un día de diferencia en
 * uno de los dos tramos. Ningún presupuesto usa fechas de enero de 1900, pero
 * equivocarlo sería un error silencioso, y son cuatro líneas hacerlo bien.
 *
 * **Las de convención** (`FRAC.AÑO`, `SIFECHA`, `DIAS360`, `DIA.LAB`,
 * `DIAS.LAB`, `FECHANUMERO`) viven aparte, en `calendario.ts`: cada una tiene
 * variantes (bases de cálculo, regla europea o estadounidense, festivos) que
 * se verifican una a una contra el libro de fidelidad.
 */

import type { ErrorExcel } from '../parser/ast.ts';
import type { Columna } from '../values/columna.ts';
import type { Argumento } from './types.ts';
import { mapaNumerico, nAriaNumerica, zipNumerico, type Resultado } from './elemental.ts';

const MS_POR_DIA = 86_400_000;
const EPOCA_ANTES = Date.UTC(1899, 11, 31); // para las series 1..59
const EPOCA_DESPUES = Date.UTC(1899, 11, 30); // para las series 61 en adelante

interface PartesFecha {
  anio: number;
  mes: number; // 1..12
  dia: number; // 1..31
}

/** Número de serie de Excel -> año, mes y día. */
export function partesDeSerie(serie: number): PartesFecha | ErrorExcel {
  const dias = Math.floor(serie);
  if (dias < 0 || !Number.isFinite(dias)) return '#NUM!';

  // Excel muestra el 0 como "0 de enero de 1900": un día que tampoco existe,
  // pero del que AÑO y MES sí devuelven algo.
  if (dias === 0) return { anio: 1900, mes: 1, dia: 0 };
  if (dias === 60) return { anio: 1900, mes: 2, dia: 29 }; // el 29 que no existió

  const base = dias < 60 ? EPOCA_ANTES : EPOCA_DESPUES;
  const d = new Date(base + dias * MS_POR_DIA);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/**
 * Año, mes y día -> número de serie de Excel.
 *
 * Acepta meses y días fuera de rango, como Excel: `FECHA(2024;13;1)` es enero
 * de 2025 y `FECHA(2024;3;0)` es el último día de febrero. Es la misma
 * normalización que hace `Date.UTC`, y es lo que permite que `FIN.MES` se
 * escriba en una línea.
 */
export function serieDePartes(anio: number, mes: number, dia: number): Resultado {
  // Excel: un año entre 0 y 1899 se interpreta como 1900 + año.
  const a = anio >= 0 && anio <= 1899 ? anio + 1900 : anio;
  if (a < 1900 || a > 9999) return '#NUM!';

  const ms = Date.UTC(a, mes - 1, dia);
  if (!Number.isFinite(ms)) return '#NUM!';

  const crudo = Math.round((ms - EPOCA_DESPUES) / MS_POR_DIA);
  // Antes del 1 de marzo de 1900 hay que descontar el 29 de febrero ficticio.
  const serie = ms < Date.UTC(1900, 2, 1) ? crudo - 1 : crudo;
  return serie < 0 ? '#NUM!' : serie;
}

function porPartes(args: Argumento[], n: number, extraer: (p: PartesFecha) => number): Columna {
  return mapaNumerico(args[0], n, (serie) => {
    const p = partesDeSerie(serie);
    return typeof p === 'string' ? p : extraer(p);
  });
}

export function YEAR(args: Argumento[], n: number): Columna {
  return porPartes(args, n, (p) => p.anio);
}

export function MONTH(args: Argumento[], n: number): Columna {
  return porPartes(args, n, (p) => p.mes);
}

export function DAY(args: Argumento[], n: number): Columna {
  return porPartes(args, n, (p) => p.dia);
}

/** `FECHA(año; mes; día)`. */
export function DATE(args: Argumento[], n: number): Columna {
  return nAriaNumerica([args[0], args[1], args[2]], n, (v) =>
    serieDePartes(v[0] as number, v[1] as number, v[2] as number));
}

/**
 * `FIN.MES(inicio; meses)`: el último día del mes resultante.
 *
 * El día 0 del mes siguiente **es** el último del mes pedido, así que
 * desplazar el mes y pedir el día 0 resuelve de una vez los meses de 28, 29,
 * 30 y 31 días sin ningún caso especial.
 */
export function EOMONTH(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (inicio, meses) => {
    const p = partesDeSerie(inicio);
    if (typeof p === 'string') return p;
    return serieDePartes(p.anio, p.mes + Math.trunc(meses) + 1, 0);
  });
}

/**
 * `FECHA.MES(inicio; meses)`: el mismo día, tantos meses después.
 *
 * Si el mes de destino es más corto, Excel devuelve su último día: el 31 de
 * enero más un mes es el 28 de febrero, no el 3 de marzo. `Date.UTC` haría lo
 * segundo, así que hay que recortar a mano.
 */
export function EDATE(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (inicio, meses) => {
    const p = partesDeSerie(inicio);
    if (typeof p === 'string') return p;

    const mesDestino = p.mes + Math.trunc(meses);
    const finDeMes = serieDePartes(p.anio, mesDestino + 1, 0);
    if (typeof finDeMes === 'string') return finDeMes;

    const partesFin = partesDeSerie(finDeMes);
    if (typeof partesFin === 'string') return partesFin;

    return serieDePartes(p.anio, mesDestino, Math.min(p.dia, partesFin.dia));
  });
}

/** `DIAS(fin; inicio)`: la diferencia en días, con el fin primero. */
export function DAYS(args: Argumento[], n: number): Columna {
  return zipNumerico(args[0], args[1], n, (fin, inicio) => Math.trunc(fin) - Math.trunc(inicio));
}

/**
 * `DIASEM(fecha; [tipo])`. El tipo 1 (predeterminado) numera de domingo=1 a
 * sábado=7; el 2, de lunes=1 a domingo=7; el 3, de lunes=0 a domingo=6.
 */
export function WEEKDAY(args: Argumento[], n: number): Columna {
  const conTipo = args.length >= 2;
  const calcular = (serie: number, tipo: number): Resultado => {
    const p = partesDeSerie(serie);
    if (typeof p === 'string') return p;
    // El 31 de diciembre de 1899 (serie 0) fue domingo, y la serie avanza de
    // día en día, así que el día de la semana sale del resto entre 7.
    const domingoCero = ((Math.floor(serie) % 7) + 7) % 7;
    switch (Math.trunc(tipo)) {
      case 1: return domingoCero === 0 ? 7 : domingoCero;
      case 2: return domingoCero === 0 ? 6 : domingoCero === 1 ? 7 : domingoCero - 1;
      case 3: return domingoCero === 0 ? 5 : domingoCero === 1 ? 6 : domingoCero - 2;
      default: return '#NUM!';
    }
  };

  if (!conTipo) return mapaNumerico(args[0], n, (s) => calcular(s, 1));
  return zipNumerico(args[0], args[1], n, calcular);
}
