/**
 * Las acciones de los botones de la cinta (B1, runtime compartido).
 *
 * Con el runtime compartido la cinta ejecuta código de esta misma página
 * (`ExecuteFunction` en el manifiesto): cada botón pone su pestaña y muestra
 * el panel con `Office.addin.showAsTaskpane()`. El panel no se recarga, así
 * que no se ve en blanco ni pierde los resultados (prueba B4 del 29/09, que
 * con cuatro URL distintas veía un instante en blanco).
 *
 * La pestaña se cambia con el fragmento de la URL, que el panel ya escucha
 * (`hashchange`, ver `Panel.tsx`).
 */

/** Las pestañas del panel (las mismas que `Pestana` en `Panel.tsx`). */
type Pestana = 'modelo' | 'resultados' | 'cronograma' | 'configuracion' | 'diagnostico';

const ACCIONES: Record<string, Pestana> = {
  mostrarModelo: 'modelo',
  mostrarResultados: 'resultados',
  mostrarConfiguracion: 'configuracion',
  mostrarDiagnostico: 'diagnostico',
};

interface EventoCinta {
  completed(): void;
}

/** Lo que se usa de Office y de la ventana, sin depender de sus tipos globales (se prueba en Node). */
interface Entorno {
  Office?: {
    actions?: { associate?: (id: string, f: (e: EventoCinta) => void) => void };
    addin?: { showAsTaskpane?: () => Promise<void> };
  };
  window?: { location: { hash: string }; dispatchEvent(e: unknown): boolean };
}

const entorno = () => globalThis as unknown as Entorno;

/**
 * Registra las acciones de la cinta. Fuera de Office (el banco) no hace nada.
 * `otras` son acciones que no cambian de pestaña (el modo del libro, B2; las
 * que actúan sin abrir el panel, B3): las pone quien sabe hacerlas.
 */
export function registrarAcciones(otras: Record<string, () => Promise<void>> = {}): void {
  const acciones = entorno().Office?.actions;
  if (typeof acciones?.associate !== 'function') return;
  for (const [id, pestana] of Object.entries(ACCIONES)) {
    acciones.associate(id, (evento: EventoCinta) => {
      void mostrar(pestana).finally(() => evento.completed());
    });
  }
  for (const [id, hacer] of Object.entries(otras)) {
    acciones.associate(id, (evento: EventoCinta) => {
      // Un fallo no puede dejar la cinta esperando: siempre se da por terminada.
      void hacer().catch(() => {}).finally(() => evento.completed());
    });
  }
}

export async function mostrar(pestana: Pestana): Promise<void> {
  const { window: ventana, Office: office } = entorno();
  if (ventana) {
    if (ventana.location.hash.replace(/^#/, '') !== pestana) ventana.location.hash = pestana;
    // Por si el fragmento ya decía esa pestaña pero el panel enseña otra.
    ventana.dispatchEvent(new CustomEvent('riesgo:pestana', { detail: pestana }));
  }
  try {
    await office?.addin?.showAsTaskpane?.();
  } catch {
    // Sin runtime compartido no se puede mostrar desde aquí; el panel ya
    // estará abierto si el usuario lo abrió antes.
  }
}

/**
 * B3: lo que la cinta pide al panel sin abrirlo (marcar la selección, simular,
 * quitar el resaltado). El panel, que en el runtime compartido está montado
 * aunque no se vea, registra aquí cómo hacerlo; la cinta lo llama por nombre.
 */
const manejadores = new Map<string, () => Promise<void>>();

export function manejarDesdeLaCinta(nombre: string, hacer: () => Promise<void>): () => void {
  manejadores.set(nombre, hacer);
  return () => {
    if (manejadores.get(nombre) === hacer) manejadores.delete(nombre);
  };
}

export async function pedirAlPanel(nombre: string): Promise<void> {
  const hacer = manejadores.get(nombre);
  // Si el panel aún no ha arrancado, se muestra: es donde se ve qué pasa.
  if (!hacer) return mostrarPanel();
  return hacer();
}

/** Muestra el panel sin cambiar de pestaña. */
export async function mostrarPanel(): Promise<void> {
  try {
    await entorno().Office?.addin?.showAsTaskpane?.();
  } catch {
    // sin runtime compartido: nada que hacer desde aquí
  }
}
