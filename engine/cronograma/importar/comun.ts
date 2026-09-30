/**
 * Lo común a los importadores de cronogramas (P4): el resultado, la
 * conversión de fechas y la verificación contra las fechas del archivo.
 *
 * Un importador no calcula nada: traduce el archivo a un `Cronograma` (las
 * mismas actividades, relaciones, calendario, avance y restricciones que la
 * hoja «Actividades») y guarda las fechas que calculó el programa de origen,
 * para comprobar después que nuestro CPM llega a las mismas.
 */

import { calcularCPM } from '../cpm.ts';
import type { Cronograma } from '../tipos.ts';
import { textoFecha } from '../../modelo/fechas.ts';

export type Fuente = 'MS Project' | 'Primavera P6';

export interface CronogramaImportado {
  fuente: Fuente;
  proyecto: string;
  cronograma: Cronograma;
  /** Fechas que calculó el programa de origen (serie de Excel, día). */
  fechasFuente: Map<string, { inicio: number; fin: number }>;
  /** Lo que no se pudo traducir tal cual, dicho con palabras. */
  avisos: string[];
}

/** «2027-02-01T08:00:00» o «2027-02-01 08:00» → número de serie de Excel (el día). */
export function serieDeIso(texto: string | undefined | null): number | undefined {
  if (!texto) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto.trim());
  if (!m) return undefined;
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export interface Verificacion {
  total: number;
  coinciden: number;
  /** Las primeras diferencias, para enseñarlas. */
  diferencias: Array<{ id: string; nombre: string; campo: 'inicio' | 'fin'; fuente: number; calculado: number }>;
  resumen: string;
}

/**
 * ¿Nuestro CPM llega a las mismas fechas que el programa de origen? Se
 * compara por día. Si no coinciden, lo normal es que el archivo use cosas que
 * aquí se simplifican (calendarios distintos por actividad, horas sueltas,
 * «lo más tarde posible», nivelación de recursos); por eso se enseña, no se
 * esconde.
 */
export function verificarContraFuente(imp: CronogramaImportado): Verificacion {
  const r = calcularCPM(imp.cronograma);
  if (!r.ok) {
    return { total: 0, coinciden: 0, diferencias: [], resumen: `No se pudo calcular: ${r.problemas.map((p) => p.mensaje).join('; ')}` };
  }
  let total = 0;
  let coinciden = 0;
  const diferencias: Verificacion['diferencias'] = [];
  for (const f of r.filas) {
    const fuente = imp.fechasFuente.get(f.id);
    if (!fuente) continue;
    total++;
    const di = fuente.inicio !== f.fechaInicio;
    const df = fuente.fin !== f.fechaFin;
    if (!di && !df) coinciden++;
    if (di && diferencias.length < 50) diferencias.push({ id: f.id, nombre: f.nombre, campo: 'inicio', fuente: fuente.inicio, calculado: f.fechaInicio });
    if (df && diferencias.length < 50) diferencias.push({ id: f.id, nombre: f.nombre, campo: 'fin', fuente: fuente.fin, calculado: f.fechaFin });
  }
  const resumen = total === 0
    ? `El archivo no trae fechas calculadas por ${imp.fuente} con las que comparar.`
    : coinciden === total
      ? `Las ${total} actividades dan las mismas fechas que en ${imp.fuente}. Fin: ${textoFecha(r.fechaFinProyecto)}.`
      : `${coinciden} de ${total} actividades dan las mismas fechas que en ${imp.fuente}; ${total - coinciden} difieren (ver la lista).`;
  return { total, coinciden, diferencias, resumen };
}

const ENTIDADES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&apos;': "'" };
export function desescaparXml(s: string): string {
  return s.replace(/&(?:lt|gt|amp|quot|apos);/g, (e) => ENTIDADES[e] as string)
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

/** Decodifica un archivo: UTF-8 si es válido; si no, Windows-1252 (los XER suelen venir así). */
export function textoDeArchivo(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
