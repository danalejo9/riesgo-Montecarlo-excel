/**
 * Mensajes grandes entre el panel y la ventana flotante (el cronograma del
 * Gantt). Sin DOM, para poder probarlo.
 */

/** Lo mínimo de una ventana para mandarle algo. */
interface Destino {
  enviar(datos: unknown): boolean;
}

/**
 * Mensajes grandes (el cronograma del Gantt): `messageChild` no garantiza
 * mensajes largos en todas las plataformas, así que el texto se parte en
 * trozos que `escucharAlPanel` vuelve a juntar antes de entregarlo.
 */
export const TAMANO_TROZO = 20_000;
let siguienteEnvio = 1;

export function enviarEnTrozos(ventana: Destino, datos: unknown): boolean {
  const texto = JSON.stringify(datos);
  if (texto.length <= TAMANO_TROZO) return ventana.enviar(datos);
  const id = siguienteEnvio++;
  const n = Math.ceil(texto.length / TAMANO_TROZO);
  for (let i = 0; i < n; i++) {
    if (!ventana.enviar({ trozo: { id, i, n, t: texto.slice(i * TAMANO_TROZO, (i + 1) * TAMANO_TROZO) } })) return false;
  }
  return true;
}

/** Junta los trozos de `enviarEnTrozos`; lo que no es un trozo pasa tal cual. */
export function juntarTrozos(alRecibir: (datos: unknown) => void): (datos: unknown) => void {
  const pendientes = new Map<number, string[]>();
  return (d) => {
    const t = (d as { trozo?: { id: number; i: number; n: number; t: string } } | null)?.trozo;
    if (!t || typeof t.t !== 'string') {
      alRecibir(d);
      return;
    }
    const partes = pendientes.get(t.id) ?? new Array<string>(t.n);
    partes[t.i] = t.t;
    pendientes.set(t.id, partes);
    // Array.from para contar también los huecos (un arreglo disperso no los recorre con every).
    if (Array.from(partes).every((x) => typeof x === 'string')) {
      pendientes.delete(t.id);
      try {
        alRecibir(JSON.parse(partes.join('')) as unknown);
      } catch {
        // incompleto o roto: se ignora
      }
    }
  };
}

