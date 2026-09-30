/**
 * Los resultados de la última simulación, **guardados en el libro** junto al
 * modelo. Sin Office.js: aquí solo se decide qué se guarda y cómo se lee.
 *
 * Hasta ahora los resultados vivían mientras el panel estaba abierto. Cerrar
 * el panel o el libro obligaba a simular otra vez —o a haber volcado a una
 * hoja— solo para volver a mirar un número que ya se había calculado.
 *
 * **Qué se guarda.** Todo lo que el panel enseña: resumen, percentiles, curva,
 * histograma, sensibilidad, con qué motor y cuánto tardó. **Qué no**: la
 * muestra de hasta cien mil valores por salida, que en `workbook.settings`
 * (un espacio pequeño y compartido) no cabe con dignidad. En su lugar se
 * guardan **1.001 cuantiles** de esa muestra: con ellos la probabilidad de un
 * umbral se sigue leyendo con una resolución de 0,1 puntos, y el panel dice
 * que es aproximada.
 *
 * **Cuándo ya no valen.** Se guarda una huella del modelo (entradas, salidas y
 * ajustes). Si el modelo ya no es el que se simuló —al reabrir, o en la misma
 * sesión tras tocar una distribución—, los resultados se enseñan igual pero
 * marcados como desactualizados: esconderlos sería
 * perder información; enseñarlos sin aviso, mentir. Cambiar solo el umbral de
 * una salida no cuenta como cambio: no altera la simulación.
 */

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import type { ResultadoSalida, SimulacionCompletada } from './informe.ts';

export const VERSION_RESULTADOS = 1;
export const CUANTILES_GUARDADOS = 1001;

/** FNV-1a de 32 bits: no es criptográfico ni lo necesita; solo distinguir modelos. */
function fnv1a(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * La huella de lo que determina una simulación. El umbral no entra, ni las
 * salidas que declara `RIESGO.SALIDA` y que pasaron al panel solo para guardar
 * su umbral (id `rs_`): la simulación ya las tenía.
 */
export function huellaModelo(m: ModeloRiesgo): string {
  return fnv1a(
    JSON.stringify({
      inputs: m.inputs,
      outputs: m.outputs.filter((o) => !o.id.startsWith('rs_')).map((o) => ({ id: o.id, name: o.name, ref: o.ref })),
      settings: m.settings,
    }),
  );
}

/** `n` cuantiles equiespaciados (del mínimo al máximo) de una muestra ordenada. */
export function reducirACuantiles(ordenada: Float64Array, n = CUANTILES_GUARDADOS): number[] {
  if (ordenada.length <= n) return Array.from(ordenada);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = ordenada[Math.round((i / (n - 1)) * (ordenada.length - 1))] as number;
  }
  return out;
}

/** Diez cifras significativas: sobra para leer, y el JSON ocupa la mitad. */
const recortar = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(10)) : x);

type SalidaGuardada = Omit<ResultadoSalida, 'muestraOrdenada' | 'muestraTexto'> & { cuantiles?: number[] };

interface ResultadosGuardados {
  version: typeof VERSION_RESULTADOS;
  guardadoEn: string;
  huellaModelo: string;
  resultado: Omit<SimulacionCompletada, 'salidas' | 'restaurado' | 'iteraciones'> & { salidas: SalidaGuardada[] };
}

export function serializarResultados(
  modelo: ModeloRiesgo,
  resultado: SimulacionCompletada,
  ahora: Date = new Date(),
): string {
  // Las iteraciones (C3) son hasta 100.000 filas: solo en memoria.
  const { restaurado: _r, iteraciones: _i, salidas, ...resto } = resultado;
  void _r;
  void _i;
  const guardado: ResultadosGuardados = {
    version: VERSION_RESULTADOS,
    guardadoEn: ahora.toISOString(),
    huellaModelo: huellaModelo(modelo),
    resultado: {
      ...resto,
      huellaModelo: huellaModelo(modelo),
      salidas: salidas.map(({ muestraOrdenada, ...conTexto }) => {
        const s = { ...conTexto };
        delete s.muestraTexto; // solo en memoria: 100.000 textos no caben en el libro
        return {
          ...s,
          ...(muestraOrdenada ? { cuantiles: reducirACuantiles(muestraOrdenada).map(recortar) } : {}),
        };
      }),
    },
  };
  return JSON.stringify(guardado);
}

export type LecturaResultados =
  | { ok: true; resultado: SimulacionCompletada }
  | { ok: false; motivo: string };

/** ¿Estos resultados son de este modelo? Sin huella (versión antigua), se asume que sí. */
export function resultadosDesactualizados(resultado: SimulacionCompletada, modelo: ModeloRiesgo): boolean {
  return resultado.huellaModelo !== undefined && resultado.huellaModelo !== huellaModelo(modelo);
}

/**
 * Lee lo guardado. Un contenido que no se entiende no rompe nada: se descarta
 * con su motivo (el diagnóstico lo enseña) y el panel se abre sin resultados,
 * como si no hubiera habido simulación.
 */
export function restaurarResultados(texto: string): LecturaResultados {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'Los resultados guardados no son JSON válido.' };
  }
  const g = json as Partial<ResultadosGuardados> | null;
  if (!g || typeof g !== 'object') return { ok: false, motivo: 'Los resultados guardados no son un objeto.' };
  if (g.version !== VERSION_RESULTADOS) {
    return { ok: false, motivo: `Versión de resultados desconocida (${String(g.version)}).` };
  }
  const r = g.resultado;
  if (!r || !Array.isArray(r.salidas) || typeof r.iteracionesCompletadas !== 'number' || !r.eleccion) {
    return { ok: false, motivo: 'A los resultados guardados les faltan partes.' };
  }

  return {
    ok: true,
    resultado: {
      ...r,
      ok: true,
      restaurado: { guardadoEn: String(g.guardadoEn ?? '') },
      huellaModelo: String(g.huellaModelo ?? ''),
      salidas: r.salidas.map(({ cuantiles, ...s }) => ({
        ...s,
        ...(Array.isArray(cuantiles) ? { muestraOrdenada: Float64Array.from(cuantiles), muestraReducida: true } : {}),
      })),
    },
  };
}
