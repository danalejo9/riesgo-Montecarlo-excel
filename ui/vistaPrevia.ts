/**
 * Vista previa del plazo mientras se edita (V11), configurable. Las
 * preferencias son **de este equipo** (como los núcleos, `motor/preferencias.ts`):
 * cuánto se puede permitir simular cada vez depende de la máquina, y no
 * cambian ningún resultado guardado.
 *
 * `Programador`: espera a que el usuario deje de escribir (la última edición
 * manda) y nunca lanza dos vistas previas a la vez; si llega un cambio
 * mientras una corre, se repite al terminar.
 */

export interface PreferenciasVistaPrevia {
  activa: boolean;
  iteraciones: number;
  /** Segundos de calma tras la última edición antes de recalcular. */
  espera: number;
}

export const ITERACIONES_VISTA_PREVIA = [500, 1000, 2000] as const;
export const ESPERAS_VISTA_PREVIA = [1, 3, 10] as const;
export const VISTA_PREVIA_POR_DEFECTO: PreferenciasVistaPrevia = { activa: false, iteraciones: 1000, espera: 3 };
const CLAVE = 'riesgoMontecarlo.vistaPreviaPlazo';

export function leerVistaPrevia(): PreferenciasVistaPrevia {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(CLAVE) ?? 'null') as Partial<PreferenciasVistaPrevia> | null;
    if (!v) return VISTA_PREVIA_POR_DEFECTO;
    return {
      activa: v.activa === true,
      iteraciones: (ITERACIONES_VISTA_PREVIA as readonly number[]).includes(v.iteraciones as number) ? (v.iteraciones as number) : VISTA_PREVIA_POR_DEFECTO.iteraciones,
      espera: (ESPERAS_VISTA_PREVIA as readonly number[]).includes(v.espera as number) ? (v.espera as number) : VISTA_PREVIA_POR_DEFECTO.espera,
    };
  } catch {
    return VISTA_PREVIA_POR_DEFECTO;
  }
}

export function guardarVistaPrevia(p: PreferenciasVistaPrevia): void {
  try {
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify(p));
  } catch {
    // Sin almacenamiento, dura lo que el panel abierto.
  }
}

interface Temporizador {
  setTimeout: (f: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
}

export class Programador {
  private temporizador: unknown = null;
  private corriendo = false;
  private otraVez = false;
  private readonly reloj: Temporizador;
  esperaMs: number;
  private readonly tarea: () => Promise<void>;

  constructor(esperaMs: number, tarea: () => Promise<void>, reloj: Temporizador = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t as number) }) {
    this.esperaMs = esperaMs;
    this.tarea = tarea;
    this.reloj = reloj;
  }

  /** Hubo un cambio: (re)empieza la espera. */
  avisar(): void {
    if (this.temporizador !== null) this.reloj.clearTimeout(this.temporizador);
    this.temporizador = this.reloj.setTimeout(() => {
      this.temporizador = null;
      void this.lanzar();
    }, this.esperaMs);
  }

  /** Lanzar ya (p. ej. tras «Calcular cronograma»), respetando la que esté corriendo. */
  async ahora(): Promise<void> {
    if (this.temporizador !== null) {
      this.reloj.clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    await this.lanzar();
  }

  private async lanzar(): Promise<void> {
    if (this.corriendo) {
      this.otraVez = true;
      return;
    }
    this.corriendo = true;
    try {
      await this.tarea();
    } finally {
      this.corriendo = false;
      if (this.otraVez) {
        this.otraVez = false;
        void this.lanzar();
      }
    }
  }

  cancelar(): void {
    if (this.temporizador !== null) this.reloj.clearTimeout(this.temporizador);
    this.temporizador = null;
    this.otraVez = false;
  }
}
