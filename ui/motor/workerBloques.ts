/**
 * Un hilo de cálculo del panel (Web Worker). Todo lo que hace está en
 * `crearAtendedor` del motor; esto solo lo conecta a los mensajes del
 * navegador y transfiere —sin copiar— las muestras de vuelta.
 */
import { crearAtendedor, type MensajeAlHilo, type MensajeDelHilo } from '../../engine/executor/pool.ts';

interface AmbitoWorker {
  onmessage: ((e: MessageEvent<MensajeAlHilo>) => void) | null;
  postMessage(m: MensajeDelHilo, transferibles: Transferable[]): void;
}

const ambito = self as unknown as AmbitoWorker;
const atender = crearAtendedor();

ambito.onmessage = (e) => {
  const r = atender(e.data);
  if (r) ambito.postMessage(r.respuesta, r.transferibles);
};
