/**
 * Un pool de hilos para el ejecutor por bloques, **sin depender de ninguna API
 * de hilos concreta**: vale para Web Workers en el panel y para cualquier otra
 * cosa que sepa mandar y recibir mensajes.
 *
 * El motor no puede nombrar `Worker` (es del navegador) ni `worker_threads`
 * (es de Node). Lo que sí puede es fijar **el protocolo**, que es donde está
 * todo lo que hay que acertar:
 *
 * 1. **El modelo viaja una vez por hilo**, en un mensaje `iniciar` (grafo,
 *    plan, entradas, semilla, configuración regional). Después cada trabajo
 *    es solo `{ inicio, largo }`: unas decenas de bytes. El arnés de pruebas
 *    anterior mandaba el grafo entero con cada bloque, que con un libro de
 *    miles de celdas cuesta más copiarlo que calcularlo.
 * 2. **Un trabajo por hilo a la vez**, y el siguiente en cuanto responde. Así
 *    un hilo lento no retiene a los demás y no hace falta adivinar cuánto
 *    tarda cada bloque.
 * 3. **Los resultados se colocan por índice**, no por orden de llegada: el
 *    ejecutor devuelve los parciales en el orden en que se pidieron, que es lo
 *    que hace que la simulación sea la misma con dos hilos que con ocho.
 *
 * `atenderMensaje` es el otro extremo: lo que ejecuta cada hilo. Es puro, así
 * que se prueba sin hilos.
 */
import type { Plan } from '../compiler/plan.ts';
import type { Grafo } from '../graph/graph.ts';
import { establecerRegional, type ConfiguracionRegional } from '../values/regional.ts';
import type { Bloque } from './bloques.ts';
import { calcularBloque } from './calcularBloque.ts';
import type { DefinicionEntrada } from './entradas.ts';
import { ErrorCalculoBloque, type EjecutorDeBloques, type ResultadoBloque, type Trabajo } from './tipos.ts';

/** Todo lo que un hilo necesita saber del modelo, una sola vez. */
export interface ContextoHilo {
  grafo: Grafo;
  plan: Plan;
  entradas: readonly DefinicionEntrada[];
  seed: number;
  compresionTDigest: number;
  limiteMuestra: number;
  regional?: ConfiguracionRegional;
}

export type MensajeAlHilo =
  | { tipo: 'iniciar'; contexto: ContextoHilo }
  | { tipo: 'bloque'; id: number; bloque: Bloque };

export type MensajeDelHilo =
  | { id: number; ok: true; parcial: ResultadoBloque }
  | { id: number; ok: false; error: { clave: string; motivo: string } };

/** Lo mínimo que el pool necesita de un hilo. `Worker` del navegador lo cumple. */
export interface CanalHilo {
  postMessage(mensaje: MensajeAlHilo): void;
  onmessage: ((evento: { data: MensajeDelHilo }) => void) | null;
  onerror: ((evento: unknown) => void) | null;
  terminate(): void;
}

export interface Pool {
  ejecutor: EjecutorDeBloques;
  hilos: number;
  cerrar(): void;
}

export function crearPool(canales: readonly CanalHilo[], contexto: ContextoHilo): Pool {
  if (canales.length === 0) throw new Error('Un pool necesita al menos un hilo.');
  for (const c of canales) c.postMessage({ tipo: 'iniciar', contexto });

  let siguienteId = 0;

  const ejecutor: EjecutorDeBloques = {
    ejecutar(trabajos: readonly Trabajo[]): Promise<ResultadoBloque[]> {
      if (trabajos.length === 0) return Promise.resolve([]);

      return new Promise((resolver, rechazar) => {
        const resultados: ResultadoBloque[] = new Array(trabajos.length);
        let pendientes = trabajos.length;
        let siguiente = 0;
        let fallado = false;
        /** id del mensaje -> índice del trabajo en esta ronda. */
        const enCurso = new Map<number, number>();

        const asignar = (canal: CanalHilo) => {
          if (fallado || siguiente >= trabajos.length) return;
          const indice = siguiente++;
          const id = siguienteId++;
          enCurso.set(id, indice);
          canal.postMessage({ tipo: 'bloque', id, bloque: trabajos[indice] as Trabajo });
        };

        for (const canal of canales) {
          canal.onmessage = ({ data }) => {
            const indice = enCurso.get(data.id);
            if (indice === undefined || fallado) return;
            enCurso.delete(data.id);
            if (!data.ok) {
              fallado = true;
              rechazar(new ErrorCalculoBloque(data.error.clave, data.error.motivo));
              return;
            }
            resultados[indice] = data.parcial;
            pendientes--;
            if (pendientes === 0) resolver(resultados);
            else asignar(canal);
          };
          canal.onerror = (e) => {
            if (fallado) return;
            fallado = true;
            const motivo = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
            rechazar(new Error(`Un hilo de cálculo falló: ${motivo}`));
          };
          asignar(canal);
        }
      });
    },
  };

  return {
    ejecutor,
    hilos: canales.length,
    cerrar() {
      for (const c of canales) c.terminate();
    },
  };
}

/**
 * El lado del hilo: guarda el contexto al iniciar y calcula cada bloque que
 * le llega. Devuelve la respuesta (o nada, para `iniciar`) y, aparte, los
 * `ArrayBuffer` que se pueden **transferir** en vez de copiar: las muestras
 * retenidas, que con bloques de 65.536 iteraciones son medio megabyte cada una.
 */
export function crearAtendedor(): (m: MensajeAlHilo) => { respuesta: MensajeDelHilo; transferibles: ArrayBuffer[] } | null {
  let contexto: ContextoHilo | null = null;
  return (m) => {
    if (m.tipo === 'iniciar') {
      contexto = m.contexto;
      // Cada hilo tiene su propia copia del ajuste regional: hay que fijarla aquí.
      if (contexto.regional) establecerRegional(contexto.regional);
      return null;
    }
    if (!contexto) {
      return { respuesta: { id: m.id, ok: false, error: { clave: '', motivo: 'El hilo recibió trabajo antes que el modelo.' } }, transferibles: [] };
    }
    const c = contexto;
    const r = calcularBloque(c.grafo, c.plan, c.entradas, c.seed, m.bloque, c.compresionTDigest, c.limiteMuestra);
    if (!r.ok) return { respuesta: { id: m.id, ok: false, error: r.error }, transferibles: [] };
    const transferibles: ArrayBuffer[] = [];
    for (const p of r.parcial.values()) if (p.muestra) transferibles.push(p.muestra.buffer as ArrayBuffer);
    return { respuesta: { id: m.id, ok: true, parcial: r.parcial }, transferibles };
  };
}
