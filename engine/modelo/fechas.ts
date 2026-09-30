/**
 * Fechas (T7): en Excel una fecha es un número de serie (días desde el
 * 30/12/1899, con el famoso 29/02/1900 que no existió) con un formato de
 * fecha. La simulación trabaja con el número; aquí está lo necesario para
 * **enseñarlo** como fecha y para leer una fecha escrita por el usuario.
 * Sin Office.js.
 */

/** Día 0 del sistema de 1900 de Excel, en milisegundos UTC (30/12/1899). */
const EPOCA = Date.UTC(1899, 11, 30);
const DIA = 86_400_000;

/**
 * ¿Es un formato de número de fecha? Con el código invariante de Excel
 * (`numberFormat`: `m/d/yyyy`, `dd/mm/yyyy`, `d-mmm-yy`, `[$-x-sysdate]…`).
 * Solo hora (`h:mm`) no cuenta: eso no es una fecha.
 */
export function esFormatoFecha(formato: string | null | undefined): boolean {
  if (!formato) return false;
  if (/\[\$-(x-sysdate|F800)\]/i.test(formato)) return true;
  // Fuera lo que no son códigos: textos entre comillas, escapes y corchetes (colores, configuración regional).
  const codigos = formato.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '').replace(/_./g, '');
  if (/general/i.test(codigos)) return false;
  // Solo la primera sección (la de los positivos).
  const primera = codigos.split(';')[0] ?? '';
  if (/[dy]/i.test(primera)) return true;
  return /m/i.test(primera) && !/[hs]/i.test(primera) && !/[0#?]/.test(primera);
}

/** El número de serie de un día (año, mes 1–12, día). */
export function serieDeFecha(anio: number, mes: number, dia: number): number {
  const s = Math.round((Date.UTC(anio, mes - 1, dia) - EPOCA) / DIA);
  // Excel cuenta el 29/02/1900, que no existió: antes del 01/03/1900 hay un día menos.
  return s < 61 ? s - 1 : s;
}

/** Año, mes y día de un número de serie (la parte entera). */
export function fechaDeSerie(serie: number): { anio: number; mes: number; dia: number } {
  let s = Math.floor(serie);
  if (s < 61) s += 1;
  const d = new Date(EPOCA + s * DIA);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/** `15/03/2027`. Lo que no es un número finito, como `numero()`: con palabras. */
export function textoFecha(serie: number): string {
  if (Number.isNaN(serie)) return 'sin datos';
  if (!Number.isFinite(serie)) return serie > 0 ? '∞' : '−∞';
  const { anio, mes, dia } = fechaDeSerie(serie);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
}

/** Lee `15/03/2027`, `15-3-27` o `2027-03-15`. `null` si no es una fecha válida. */
export function leerFecha(texto: string): number | null {
  const t = texto.trim();
  let anio: number;
  let mes: number;
  let dia: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    anio = Number(m[1]); mes = Number(m[2]); dia = Number(m[3]);
  } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
    if (!m) return null;
    dia = Number(m[1]); mes = Number(m[2]); anio = Number(m[3]);
    // Dos cifras, como Excel: 00–29 son 2000–2029; 30–99, 1930–1999.
    if ((m[3] as string).length === 2) anio += anio < 30 ? 2000 : 1900;
  }
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return serieDeFecha(anio, mes, dia);
}
