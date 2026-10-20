/**
 * Ventanas flotantes (U3.1, U3.4): una página del complemento abierta con
 * `displayDialogAsync`, que funciona en Windows, Mac y la Web. La ventana no
 * puede hablar con Excel: el panel le manda lo que tiene que enseñar, al
 * abrirla (en la URL, `#d=…`) y después por mensaje (`messageChild`, DialogApi
 * 1.2; si no existe, la ventana se queda con lo primero). Solo puede haber una
 * abierta a la vez por complemento.
 *
 * Fuera de Office (el banco de pruebas) se abre con `window.open` y los
 * mensajes van por `postMessage`, para poder probarla en un navegador.
 */

import { juntarTrozos } from './trozos.ts';

export { enviarEnTrozos, juntarTrozos, TAMANO_TROZO } from './trozos.ts';

/**
 * La URL de otra página del complemento. Va contra `BASE_URL` y no contra la
 * raíz del servidor: publicado en GitHub Pages, el complemento vive en una
 * subcarpeta (`/riesgo-Montecarlo-excel/`), y en desarrollo, en `/`.
 */
export function urlDePagina(pagina: string): string {
  return new URL(`${import.meta.env.BASE_URL}${pagina}`, window.location.origin).href;
}

export interface Ventana {
  /** Manda datos a la ventana. `false` si esta versión de Excel no puede. */
  enviar(datos: unknown): boolean;
  cerrar(): void;
}

interface DialogoOffice {
  messageChild?: (m: string) => void;
  close(): void;
  addEventHandler(tipo: unknown, f: (arg: { message?: string; error?: number }) => void): void;
}

let abierta: { pagina: string; ventana: Ventana } | null = null;

/** La ventana de esa página, si está abierta. */
export function ventanaAbierta(pagina: string): Ventana | null {
  return abierta && abierta.pagina === pagina ? abierta.ventana : null;
}

export async function abrirVentana(
  pagina: string,
  codigo: string,
  opciones: { alto: number; ancho: number; alRecibir?: (m: string) => void; alCerrar?: () => void },
): Promise<Ventana> {
  abierta?.ventana.cerrar();
  const url = `${urlDePagina(pagina)}#d=${codigo}`;
  const office = (globalThis as unknown as { Office?: { context?: { ui?: { displayDialogAsync?: unknown } }; EventType?: Record<string, unknown> } }).Office;
  const mostrar = office?.context?.ui?.displayDialogAsync as
    | ((u: string, o: object, cb: (r: { status: string; value: DialogoOffice; error?: { message: string } }) => void) => void)
    | undefined;

  if (!mostrar || !office?.EventType) {
    const w = window.open(url, pagina, `width=${Math.round(opciones.ancho * 10)},height=${Math.round(opciones.alto * 8)}`);
    const alMensaje = (e: MessageEvent) => {
      const m = e.data as { riesgoPanel?: string; datos?: unknown } | null;
      if (e.origin === window.location.origin && m?.riesgoPanel === pagina) opciones.alRecibir?.(JSON.stringify(m.datos));
    };
    window.addEventListener('message', alMensaje);
    const ventana: Ventana = {
      enviar: (d) => {
        if (!w || w.closed) return false;
        w.postMessage({ riesgo: pagina, datos: d }, window.location.origin);
        return true;
      },
      cerrar: () => w?.close(),
    };
    abierta = { pagina, ventana };
    return ventana;
  }

  const tipos = office.EventType;
  return new Promise((ok, mal) => {
    mostrar.call(office.context?.ui, url, { height: opciones.alto, width: opciones.ancho, displayInIframe: true }, (r) => {
      if (r.status !== 'succeeded') {
        mal(new Error(r.error?.message ?? 'No se pudo abrir la ventana.'));
        return;
      }
      const d = r.value;
      const ventana: Ventana = {
        enviar: (datos) => {
          if (typeof d.messageChild !== 'function') return false;
          try {
            d.messageChild(JSON.stringify(datos));
            return true;
          } catch {
            return false;
          }
        },
        cerrar: () => {
          try {
            d.close();
          } catch {
            // ya cerrada
          }
          if (abierta?.ventana === ventana) abierta = null;
        },
      };
      d.addEventHandler(tipos.DialogMessageReceived, (arg) => {
        if (typeof arg.message === 'string') opciones.alRecibir?.(arg.message);
      });
      // Cerrada por el usuario (la ✕) o por un error de la página.
      d.addEventHandler(tipos.DialogEventReceived, () => {
        if (abierta?.ventana === ventana) abierta = null;
        opciones.alCerrar?.();
      });
      abierta = { pagina, ventana };
      ok(ventana);
    });
  });
}

/** Del lado de la ventana: le dice algo al panel (`messageParent`; en el banco, `postMessage` al que la abrió). */
export function hablarAlPanel(pagina: string, datos: unknown): void {
  const ui = (globalThis as unknown as { Office?: { context?: { ui?: { messageParent?: (m: string) => void } } } }).Office?.context?.ui;
  if (typeof ui?.messageParent === 'function') {
    try {
      ui.messageParent(JSON.stringify(datos));
      return;
    } catch {
      // fuera de una ventana de Office: se prueba con el que la abrió
    }
  }
  window.opener?.postMessage({ riesgoPanel: pagina, datos }, window.location.origin);
}

/**
 * Del lado de la ventana: lo que el panel le manda después de abrirla. Con
 * Office, por `DialogParentMessageReceived`; en el banco, por `postMessage`.
 */
export function escucharAlPanel(pagina: string, alRecibirEntero: (datos: unknown) => void): void {
  const alRecibir = juntarTrozos(alRecibirEntero);
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== window.location.origin) return;
    const m = e.data as { riesgo?: string; datos?: unknown } | null;
    if (m && m.riesgo === pagina) alRecibir(m.datos);
  });
  const office = (globalThis as unknown as {
    Office?: {
      onReady?: (cb: () => void) => unknown;
      context?: { ui?: { addHandlerAsync?: (t: unknown, f: (a: { message: string }) => void) => void } };
      EventType?: Record<string, unknown>;
    };
  }).Office;
  if (!office?.onReady) return;
  void office.onReady(() => {
    try {
      office.context?.ui?.addHandlerAsync?.(office.EventType?.DialogParentMessageReceived, (a) => {
        try {
          alRecibir(JSON.parse(a.message) as unknown);
        } catch {
          // un mensaje que no se entiende no cambia lo que se ve
        }
      });
    } catch {
      // sin DialogApi 1.2: la ventana se queda con lo que traía la URL
    }
  });
}
