/**
 * Un hilo de la simulación del plazo (P3b). Todo lo que hace está en
 * `crearAtendedorPlazo`; esto solo lo conecta a los mensajes del navegador y
 * transfiere —sin copiar— los arreglos de vuelta.
 */
import { crearAtendedorPlazo, type PedidoTramo, type RespuestaTramo } from '../../engine/cronograma/hiloPlazo.ts';

interface AmbitoWorker {
  onmessage: ((e: MessageEvent<PedidoTramo>) => void) | null;
  postMessage(m: RespuestaTramo, transferibles: Transferable[]): void;
}

const ambito = self as unknown as AmbitoWorker;
const atender = crearAtendedorPlazo();
ambito.onmessage = (e) => {
  const r = atender(e.data);
  ambito.postMessage(r.respuesta, r.transferibles);
};
