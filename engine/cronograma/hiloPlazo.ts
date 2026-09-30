/**
 * Lo que hace un hilo de la simulación del plazo (P3b), sin depender de si
 * es un Web Worker del navegador o un `worker_threads` de Node: recibe un
 * tramo de iteraciones y devuelve su acumulador. La preparación (la red en
 * arreglos, los muestreadores) se guarda por `clave`, para no rehacerla en
 * cada tramo de la misma simulación.
 */

import {
  nuevoAcumulador, prepararPlazo, simularTramo, transferiblesDe,
  type AcumuladorPlazo, type FormaDuracion, type PlazoPreparado,
} from './simulacion.ts';
import type { RiesgoPlazo } from './riesgos.ts';
import type { Cronograma } from './tipos.ts';

export interface PedidoTramo {
  id: number;
  /** Identifica la simulación (cronograma + riesgos + semilla + forma). */
  clave: string;
  /** Solo hace falta la primera vez que el hilo ve una `clave`. */
  cronograma?: Cronograma;
  riesgos?: RiesgoPlazo[];
  semilla: number;
  forma: FormaDuracion;
  desde: number;
  hasta: number;
}

export type RespuestaTramo =
  | { id: number; ok: true; acumulador: AcumuladorPlazo }
  | { id: number; ok: false; error: string; faltaCronograma?: boolean };

export function crearAtendedorPlazo(): (p: PedidoTramo) => { respuesta: RespuestaTramo; transferibles: ArrayBuffer[] } {
  let clave = '';
  let prep: PlazoPreparado | null = null;
  return (pedido) => {
    try {
      if (pedido.clave !== clave || !prep) {
        if (!pedido.cronograma) return { respuesta: { id: pedido.id, ok: false, error: 'falta el cronograma', faltaCronograma: true }, transferibles: [] };
        // Los Set no siempre sobreviven al clonado: se reconstruyen.
        const c = pedido.cronograma;
        const cron: Cronograma = { ...c, calendario: { ...c.calendario, festivos: new Set(c.calendario.festivos) } };
        prep = prepararPlazo(cron, pedido.riesgos ?? [], { semilla: pedido.semilla, forma: pedido.forma });
        clave = pedido.clave;
      }
      const acc = nuevoAcumulador(prep);
      simularTramo(prep, acc, pedido.desde, pedido.hasta);
      return { respuesta: { id: pedido.id, ok: true, acumulador: acc }, transferibles: transferiblesDe(acc) };
    } catch (e) {
      return { respuesta: { id: pedido.id, ok: false, error: e instanceof Error ? e.message : String(e) }, transferibles: [] };
    }
  };
}

/** Un canal a un hilo: el `Worker` del navegador o un adaptador de `worker_threads`. */
export interface CanalPlazo {
  postMessage(m: PedidoTramo): void;
  onmessage: ((e: { data: RespuestaTramo }) => void) | null;
  terminate(): void;
}

/**
 * Reparte los tramos entre los hilos: cada hilo atiende uno cada vez. La
 * primera vez que un hilo ve una simulación se le manda el cronograma; las
 * siguientes, solo el tramo.
 */
export function crearEjecutorPlazo(canales: CanalPlazo[]) {
  let siguienteId = 1;
  const libres = [...canales];
  const esperando: Array<(c: CanalPlazo) => void> = [];
  const vistas = new Map<CanalPlazo, string>();
  const pendientes = new Map<number, { ok: (a: AcumuladorPlazo) => void; mal: (e: Error) => void }>();
  for (const c of canales) {
    c.onmessage = (e) => {
      const r = e.data;
      const p = pendientes.get(r.id);
      pendientes.delete(r.id);
      if (r.ok) p?.ok(r.acumulador);
      else p?.mal(new Error(r.error));
    };
  }
  const tomar = () => new Promise<CanalPlazo>((ok) => {
    const c = libres.shift();
    if (c) ok(c);
    else esperando.push(ok);
  });
  const soltar = (c: CanalPlazo) => {
    const w = esperando.shift();
    if (w) w(c);
    else libres.push(c);
  };
  return {
    hilos: canales.length,
    /** Una función `ejecutar` para `simularPlazoEnParalelo`, ligada a una simulación. */
    para(cronograma: Cronograma, riesgos: readonly RiesgoPlazo[], op: { semilla: number; forma: FormaDuracion }) {
      const clave = `${siguienteId++}`;
      return async (t: { desde: number; hasta: number }): Promise<AcumuladorPlazo> => {
        const c = await tomar();
        try {
          const id = siguienteId++;
          const primera = vistas.get(c) !== clave;
          const pedido: PedidoTramo = {
            id, clave, semilla: op.semilla, forma: op.forma, desde: t.desde, hasta: t.hasta,
            ...(primera ? { cronograma: { ...cronograma, calendario: { ...cronograma.calendario, festivos: [...cronograma.calendario.festivos] as unknown as Set<number> } }, riesgos: [...riesgos] } : {}),
          };
          const r = await new Promise<AcumuladorPlazo>((ok, mal) => {
            pendientes.set(id, { ok, mal });
            c.postMessage(pedido);
          });
          vistas.set(c, clave);
          return r;
        } finally {
          soltar(c);
        }
      };
    },
    cerrar() {
      for (const c of canales) c.terminate();
    },
  };
}
