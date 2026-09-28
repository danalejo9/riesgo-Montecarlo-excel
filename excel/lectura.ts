/**
 * La lectura de una salida en palabras (C7, y el primer paso de la narrativa
 * de E12): dos o tres frases generadas **con reglas** a partir de los
 * percentiles, el umbral, el tornado y la precisión. Nada sale del equipo y no
 * interviene ningún modelo de IA. Sin Office.js.
 *
 * Las frases se quedan en lo que los números dicen: rango probable,
 * probabilidad del umbral, qué entradas pesan más y si las iteraciones bastan.
 * No opinan («es un buen proyecto») porque eso depende de cosas que el modelo
 * no sabe.
 */

import type { Precision } from '../engine/stats/index.ts';
import type { FilaSensibilidadPanel } from './informe.ts';

export interface DatosLectura {
  nombre: string;
  resumen: { n: number; media: number; percentiles: Record<string, number> };
  noNumericas?: number;
  sensibilidad?: readonly FilaSensibilidadPanel[];
  precision?: Precision;
  /** El umbral ya calculado, si la salida tiene uno. */
  umbral?: { valor: number; sentido: 'below' | 'above'; probabilidad: number };
}

/** Un número en formato español con las cifras justas para leerlo en una frase. */
function cifra(n: number): string {
  const a = Math.abs(n);
  const decimales = a >= 100 ? 0 : a >= 1 ? 2 : 4;
  return n.toLocaleString('es-ES', { maximumFractionDigits: decimales });
}

function porcentaje(p: number): string {
  return `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}

/** Las frases de la lectura, en orden. Vacío si no hay datos. */
export function lecturaDeSalida(d: DatosLectura): string[] {
  if (d.resumen.n === 0) return [];
  const frases: string[] = [];
  const { p5, p50, p95 } = d.resumen.percentiles;

  if (p5 !== undefined && p95 !== undefined) {
    frases.push(
      `${d.nombre} tiene una media de ${cifra(d.resumen.media)}` +
        (p50 !== undefined ? ` y una mediana de ${cifra(p50)}` : '') +
        `; en el 90 % de los casos simulados queda entre ${cifra(p5)} y ${cifra(p95)}.`,
    );
  } else {
    frases.push(`${d.nombre} tiene una media de ${cifra(d.resumen.media)}.`);
  }

  if (d.umbral) {
    frases.push(
      `La probabilidad de que quede ${d.umbral.sentido === 'below' ? 'por debajo' : 'por encima'} de ` +
        `${cifra(d.umbral.valor)} es del ${porcentaje(d.umbral.probabilidad)}.`,
    );
  }

  // Lo que más la mueve: por contribución a la varianza si se pudo calcular,
  // si no por ρ². Solo las que pesan de verdad (≥ 5 %), y como mucho tres.
  const filas = [...(d.sensibilidad ?? [])]
    .map((f) => ({ nombre: f.nombre, peso: f.contribucion ?? f.peso, sube: f.spearman >= 0 }))
    .filter((f) => f.peso >= 0.05)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 3);
  if (filas.length > 0) {
    const [primera, ...resto] = filas;
    const sentido = (f: { sube: boolean }) => (f.sube ? 'la sube' : 'la baja');
    let frase = `Lo que más la mueve es ${primera!.nombre} (${porcentaje(primera!.peso)} de la variación; cuando sube, ${sentido(primera!)})`;
    if (resto.length > 0) {
      frase += `, seguido de ${resto.map((f) => `${f.nombre} (${porcentaje(f.peso)})`).join(' y ')}`;
    }
    frases.push(`${frase}.`);
  }

  if (d.noNumericas && d.noNumericas > 0) {
    frases.push(`En ${d.noNumericas.toLocaleString('es-ES')} iteraciones no dio un número y no cuentan en estas cifras.`);
  }

  if (d.precision && !d.precision.suficiente) {
    frases.push(
      `Con estas iteraciones, la media se conoce con un margen de ±${porcentaje(d.precision.margenRelativo)}; ` +
        `para bajarlo al ${porcentaje(d.precision.objetivo)} harían falta unas ` +
        `${d.precision.iteracionesParaObjetivo.toLocaleString('es-ES')}.`,
    );
  }
  return frases;
}

/** La lectura de una salida de texto o de sí/no (T2, T6), con las mismas reglas. */
export function lecturaDeTexto(d: {
  nombre: string;
  categorias: readonly { valor: string; proporcion: number }[];
  valorDeInteres?: string;
  decisivas?: readonly { valor: string; filas: readonly { nombre: string; bajo: number; alto: number; rango: number }[] }[];
}): string[] {
  const [primera, ...resto] = d.categorias;
  if (!primera) return [];
  const frases: string[] = [];
  let f = `${d.nombre} sale «${primera.valor}» el ${porcentaje(primera.proporcion)} de las veces`;
  const siguientes = resto.slice(0, 2);
  if (siguientes.length > 0) f += `, seguido de ${siguientes.map((c) => `«${c.valor}» (${porcentaje(c.proporcion)})`).join(' y ')}`;
  frases.push(`${f}.`);
  if (d.valorDeInteres && d.valorDeInteres !== primera.valor) {
    const p = d.categorias.find((c) => c.valor === d.valorDeInteres)?.proporcion ?? 0;
    frases.push(`La probabilidad de «${d.valorDeInteres}» es del ${porcentaje(p)}.`);
  }
  const objetivo = d.valorDeInteres ?? primera.valor;
  const fila = d.decisivas?.find((x) => x.valor === objetivo)?.filas[0];
  if (fila && fila.rango >= 0.05) {
    frases.push(
      `Lo que más decide que salga «${objetivo}» es ${fila.nombre}: sale el ${porcentaje(fila.bajo)} de las veces ` +
        `cuando está en su 10 % más bajo y el ${porcentaje(fila.alto)} cuando está en su 10 % más alto.`,
    );
  }
  return frases;
}
