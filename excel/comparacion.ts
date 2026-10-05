/**
 * Comparar dos simulaciones: **la de referencia** (la que el usuario fijó,
 * p. ej. "sin refinanciación") y **la actual**. Sin Office.js.
 *
 * Es la pregunta de decisión por excelencia —¿mejora esto el riesgo, o solo
 * la media?— y responderla a mano obliga a apuntar números de una simulación
 * antes de lanzar la otra. Aquí la referencia se guarda entera en el libro
 * (con el mismo formato que los resultados, `resultadosGuardados.ts`) y cada
 * salida se empareja por su id: si una salida no estaba en la referencia, no
 * se compara, y se dice.
 *
 * Las diferencias son **actual − referencia**: un VAN que sube da un número
 * positivo. No se juzga si subir es bueno (en un coste no lo es): se enseña
 * el signo y cada cual lo lee.
 */

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { probabilidadUmbral } from '../engine/stats/index.ts';
import { esSalidaDeTexto, probabilidadDeValor } from './analisisTexto.ts';
import type { ResultadoSalida, SimulacionCompletada } from './informe.ts';
import { restaurarResultados, serializarResultados } from './resultadosGuardados.ts';

export interface FilaComparacion {
  medida: string;
  referencia: number;
  actual: number;
  diferencia: number;
  /** `true` si es una probabilidad (0..1), para formatearla como porcentaje. */
  esProbabilidad?: boolean;
}

export interface ReferenciaGuardada {
  etiqueta: string;
  resultado: SimulacionCompletada;
}

export function compararSalida(
  actual: ResultadoSalida,
  referencia: ResultadoSalida,
  umbral?: { value: number; direction: 'below' | 'above' },
  pc: { claveBajo: string; claveAlto: string; etiquetaBajo: string; etiquetaAlto: string } = { claveBajo: 'p5', claveAlto: 'p95', etiquetaBajo: 'p5', etiquetaAlto: 'p95' },
): FilaComparacion[] {
  // Salida de texto o de sí/no (T2): se compara la probabilidad de cada valor.
  if (esSalidaDeTexto(actual) || esSalidaDeTexto(referencia)) {
    const valores = [...new Set([...(actual.categorias ?? []), ...(referencia.categorias ?? [])].map((c) => c.valor))];
    return valores.slice(0, 8).map((v) => {
      const r = probabilidadDeValor(referencia.categorias, v) ?? 0;
      const a = probabilidadDeValor(actual.categorias, v) ?? 0;
      return { medida: `P(«${v}»)`, referencia: r, actual: a, diferencia: a - r, esProbabilidad: true };
    });
  }
  const fila = (medida: string, r: number | undefined, a: number | undefined, esProbabilidad?: boolean) =>
    r === undefined || a === undefined || !Number.isFinite(r) || !Number.isFinite(a)
      ? []
      : [{ medida, referencia: r, actual: a, diferencia: a - r, ...(esProbabilidad ? { esProbabilidad } : {}) }];

  const filas: FilaComparacion[] = [
    ...fila('Media', referencia.resumen.media, actual.resumen.media),
    ...fila('Desviación', referencia.resumen.desviacion, actual.resumen.desviacion),
    ...fila(pc.etiquetaBajo, referencia.resumen.percentiles[pc.claveBajo], actual.resumen.percentiles[pc.claveBajo]),
    ...fila('p50', referencia.resumen.percentiles.p50, actual.resumen.percentiles.p50),
    ...fila(pc.etiquetaAlto, referencia.resumen.percentiles[pc.claveAlto], actual.resumen.percentiles[pc.claveAlto]),
  ];

  if (umbral && actual.muestraOrdenada && referencia.muestraOrdenada) {
    const sentido = umbral.direction === 'below' ? 'debajo' : 'encima';
    filas.push(
      ...fila(
        `P(${umbral.direction === 'below' ? '<' : '>'} ${umbral.value})`,
        probabilidadUmbral(referencia.muestraOrdenada, umbral.value, sentido),
        probabilidadUmbral(actual.muestraOrdenada, umbral.value, sentido),
        true,
      ),
    );
  }
  return filas;
}

/** La salida de la referencia que corresponde a esta, por id. */
export function salidaDeReferencia(ref: ReferenciaGuardada, id: string): ResultadoSalida | undefined {
  return ref.resultado.salidas.find((s) => s.id === id);
}

export function serializarReferencia(modelo: ModeloRiesgo, etiqueta: string, resultado: SimulacionCompletada): string {
  return JSON.stringify({ etiqueta, datos: serializarResultados(modelo, resultado) });
}

export function restaurarReferencia(texto: string): ReferenciaGuardada | null {
  try {
    const j = JSON.parse(texto) as { etiqueta?: unknown; datos?: unknown };
    if (typeof j.etiqueta !== 'string' || typeof j.datos !== 'string') return null;
    const r = restaurarResultados(j.datos);
    return r.ok ? { etiqueta: j.etiqueta, resultado: r.resultado } : null;
  } catch {
    return null;
  }
}
