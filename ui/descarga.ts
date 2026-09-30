/**
 * Descargar un archivo generado en el panel (V9). Donde el navegador del
 * panel lo permite (Excel en la Web), directamente; en Excel de escritorio
 * el panel no descarga, así que se abre `exportar.html` en el navegador del
 * sistema con el archivo comprimido en la dirección.
 */

export interface ArchivoDescarga {
  nombre: string;
  /** El contenido: texto (UTF-8) o, si `windows1252`, texto que se guarda en esa codificación. */
  texto: string;
  tipo: string;
  windows1252?: boolean;
}

/** Descarga con un enlace temporal. Devuelve `false` si el entorno no lo admite. */
export function descargarDirecto(bytes: Uint8Array, nombre: string, tipo: string): boolean {
  try {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** ¿Estamos en Excel de escritorio (Windows o Mac), donde el panel no descarga? */
export function esEscritorio(): boolean {
  if (typeof Office === 'undefined') return false;
  const p = Office.context?.platform as unknown as string | undefined;
  return p === 'PC' || p === 'Mac';
}
