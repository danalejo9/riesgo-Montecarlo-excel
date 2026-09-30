/**
 * W5: `RIESGO.CRONOGRAMA` al simular el modelo de costos. Lee las hojas del
 * cronograma, lo simula con la semilla del modelo de costos y da, para cada
 * entrada `RIESGO.CRONOGRAMA`, sus muestras iteración a iteración. La lógica
 * está en `engine/cronograma/enCostos.ts`; las hojas las lee quien llama
 * (`leerHojasCronograma`, con Office.js), así que este módulo se prueba en Node.
 */

import {
  fuenteDesdeHojas, medidaDe, MEDIDAS_CRONOGRAMA, OPCIONES_PLAZO_POR_DEFECTO, resumenDeMuestra,
  type FuenteCronograma, type HojasCronograma, type PedidoCronograma,
} from '../engine/cronograma/index.ts';
import type { ProveedorCronograma } from '../engine/modelo/index.ts';

export interface EnlaceCronograma {
  fuente: FuenteCronograma;
  /** La distribución (un resumen) y la media de cada `RIESGO.CRONOGRAMA`, para el análisis del modelo. */
  proveedor: ProveedorCronograma;
  /**
   * Las muestras de las entradas `RIESGO.CRONOGRAMA` para `n` iteraciones,
   * por id de entrada; simula antes las que falten. `null` si se canceló.
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
  leerHojas: () => Promise<HojasCronograma>,
  op: { ceder?: () => Promise<void>; debeCancelar?: () => boolean } = {},
): Promise<{ ok: true; enlace: EnlaceCronograma } | { ok: false; errores: string[] }> {
  const hojas = await leerHojas();
  const creada = fuenteDesdeHojas(hojas, pedidos, { semilla, forma: OPCIONES_PLAZO_POR_DEFECTO.forma });
  if (!creada.ok) return creada;
  const fuente = creada.fuente;
  await fuente.asegurar(nInicial, op);
  const pedidoDe = (hito: string, medida: string): PedidoCronograma | string => {
    const m = medidaDe(medida);
    return m ? { hito, medida: m } : `la medida «${medida}» de RIESGO.CRONOGRAMA no existe: usa ${MEDIDAS}`;
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
