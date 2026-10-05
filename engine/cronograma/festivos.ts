/**
 * Festivos de Colombia (QRSA, Q0.4). Sin Office.js.
 *
 * Los fijos, los que la ley Emiliani (Ley 51 de 1983) traslada al lunes
 * siguiente y los que dependen de la Pascua (Jueves y Viernes Santo, y la
 * Ascensión, el Corpus Christi y el Sagrado Corazón, que ya caen en lunes).
 * Las fechas son números de serie de Excel, el eje de días de todo el módulo.
 *
 * La misma regla está escrita aparte en Python
 * (`tests/fixtures/qrsa/generar-referencias.py`); la prueba compara las dos.
 */

import { serieDeFecha } from '../modelo/fechas.ts';

export interface Festivo {
  /** Número de serie de Excel. */
  dia: number;
  nombre: string;
}

/** Domingo de Pascua (algoritmo gregoriano anónimo), como número de serie. */
export function pascua(anio: number): number {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return serieDeFecha(anio, mes, dia);
}

/** Día de la semana de un número de serie: 0 = lunes … 6 = domingo. */
export function diaSemana(serie: number): number {
  // El 01/01/1900 (serie 1) fue lunes en el calendario de Excel; desde el
  // 01/03/1900 la serie ya cuadra con el calendario real (serie 61 = jueves).
  return (((Math.floor(serie) - 61 + 3) % 7) + 7) % 7;
}

/** Ley Emiliani: el festivo pasa al lunes siguiente (si no cae ya en lunes). */
function alLunes(serie: number): number {
  return serie + ((7 - diaSemana(serie)) % 7);
}

export function festivosColombia(anio: number): Festivo[] {
  const p = pascua(anio);
  const f = (mes: number, dia: number) => serieDeFecha(anio, mes, dia);
  const lista: Festivo[] = [
    { dia: f(1, 1), nombre: 'Año Nuevo' },
    { dia: alLunes(f(1, 6)), nombre: 'Reyes Magos' },
    { dia: alLunes(f(3, 19)), nombre: 'San José' },
    { dia: p - 3, nombre: 'Jueves Santo' },
    { dia: p - 2, nombre: 'Viernes Santo' },
    { dia: f(5, 1), nombre: 'Día del Trabajo' },
    { dia: p + 43, nombre: 'Ascensión del Señor' },
    { dia: p + 64, nombre: 'Corpus Christi' },
    { dia: p + 71, nombre: 'Sagrado Corazón' },
    { dia: alLunes(f(6, 29)), nombre: 'San Pedro y San Pablo' },
    { dia: f(7, 20), nombre: 'Independencia' },
    { dia: f(8, 7), nombre: 'Batalla de Boyacá' },
    { dia: alLunes(f(8, 15)), nombre: 'Asunción de la Virgen' },
    { dia: alLunes(f(10, 12)), nombre: 'Día de la Raza' },
    { dia: alLunes(f(11, 1)), nombre: 'Todos los Santos' },
    { dia: alLunes(f(11, 11)), nombre: 'Independencia de Cartagena' },
    { dia: f(12, 8), nombre: 'Inmaculada Concepción' },
    { dia: f(12, 25), nombre: 'Navidad' },
  ];
  // Dos festivos pueden caer el mismo día (el 01/07/2030, Sagrado Corazón y
  // San Pedro): es un solo día libre, con los dos nombres.
  const porDia = new Map<number, string>();
  for (const f of lista) porDia.set(f.dia, porDia.has(f.dia) ? `${porDia.get(f.dia)} · ${f.nombre}` : f.nombre);
  return [...porDia].map(([dia, nombre]) => ({ dia, nombre })).sort((x, y) => x.dia - y.dia);
}

/** Los festivos de varios años seguidos (los del proyecto). */
export function festivosColombiaEntre(desde: number, hasta: number): Festivo[] {
  const r: Festivo[] = [];
  for (let a = desde; a <= hasta; a++) r.push(...festivosColombia(a));
  return r;
}
