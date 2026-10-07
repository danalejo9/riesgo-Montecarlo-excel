/**
 * W5: `RIESGO.CRONOGRAMA` al simular el modelo de costos. Lee las hojas del
 * cronograma, lo simula con la semilla del modelo de costos y da, para cada
 * entrada `RIESGO.CRONOGRAMA`, sus muestras iteración a iteración. La lógica
 * está en `engine/cronograma/enCostos.ts`; las hojas las lee quien llama
 * (`leerHojasCronograma`, con Office.js), así que este módulo se prueba en Node.
 */

import { crearFuenteCronograma, medidaDe, MEDIDAS_CRONOGRAMA, resumenDeMuestra, type FuenteCronograma, type OpcionesFuente, type PedidoCronograma } from '../engine/cronograma/index.ts';
import type { ProveedorCronograma } from '../engine/modelo/index.ts';
import { leerCronograma, type MatrizHoja } from './cronogramaHojas.ts';

export interface EnlaceCronograma {
  fuente: FuenteCronograma;
  /** La distribución (un resumen) y la media de cada `RIESGO.CRONOGRAMA`, para el análisis del modelo. */
  proveedor: ProveedorCronograma;
  /**
   * Las muestras de las entradas `RIESGO.CRONOGRAMA` para `n` iteraciones,
   * por id de entrada; simula de nuevo si hace falta. `null` si se canceló.
   */
  fijas(entradas: ReadonlyMap<string, { hito: string; medida: string }>, n: number): Promise<Map<string, Float64Array> | null>;
}

const MEDIDAS = MEDIDAS_CRONOGRAMA.map((m) => `"${m}"`).join(', ');

/** Qué pide cada fórmula: registra lo que se le pregunta y da un marcador (primera pasada del análisis). */
export function recolectorDePedidos(): { pedidos: PedidoCronograma[]; proveedor: ProveedorCronograma } {
  const pedidos: PedidoCronograma[] = [];
  return {
    pedidos,
    proveedor: (hito, medida) => {
      const m = medidaDe(medida);
      if (m) pedidos.push({ hito, medida: m });
      return { spec: { type: 'uniform', min: 0, max: 1 }, media: 0 };
    },
  };
}

export async function enlazarCronograma(
  pedidos: readonly PedidoCronograma[],
  semilla: number,
  nInicial: number,
  leerHojas: () => Promise<Readonly<Record<string, MatrizHoja | undefined>>>,
  op: OpcionesFuente = {},
): Promise<{ ok: true; enlace: EnlaceCronograma } | { ok: false; errores: string[] }> {
  const hojas = await leerHojas();
  if (!hojas.Actividades) return { ok: false, errores: ['RIESGO.CRONOGRAMA: el libro no tiene la hoja Actividades (créela desde la pestaña Cronograma).'] };
  const lectura = leerCronograma(hojas);
  if (!lectura.modelo) {
    return { ok: false, errores: ['El cronograma del libro tiene errores (RIESGO.CRONOGRAMA):', ...lectura.errores.map((e) => `${e.hoja}${e.fila > 0 ? `, ${e.columna}${e.fila}` : ''}: ${e.mensaje}`)] };
  }
  const creada = crearFuenteCronograma(lectura.modelo, pedidos, { semilla });
  if (!creada.ok) return creada;
  const fuente = creada.fuente;
  try {
    if (!(await fuente.asegurar(nInicial, op))) return { ok: false, errores: ['Se canceló mientras se simulaba el cronograma.'] };
  } catch (e) {
    return { ok: false, errores: [`El cronograma del libro no se puede simular (RIESGO.CRONOGRAMA): ${(e as Error).message}`] };
  }
  const pedidoDe = (hito: string, medida: string): PedidoCronograma | string => {
    const m = medidaDe(medida);
    return m ? { hito, medida: m } : `la medida «${medida}» de RIESGO.CRONOGRAMA no existe: use ${MEDIDAS}`;
  };
  return {
    ok: true,
    enlace: {
      fuente,
      proveedor: (hito, medida) => {
        const p = pedidoDe(hito, medida);
        if (typeof p === 'string') return p;
        const r = resumenDeMuestra(fuente.muestras(p, fuente.hechas));
        return { spec: { type: 'discrete', values: r.values, weights: r.weights }, media: r.media };
      },
      async fijas(entradas, n) {
        if (!(await fuente.asegurar(n, op))) return null;
        const out = new Map<string, Float64Array>();
        for (const [id, x] of entradas) {
          const p = pedidoDe(x.hito, x.medida);
          if (typeof p !== 'string') out.set(id, fuente.muestras(p, n));
        }
        return out;
      },
    },
  };
}
