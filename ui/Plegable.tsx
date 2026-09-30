/**
 * Una sección que se pliega (U2): el título siempre a la vista y el contenido
 * solo si se abre. Cada lector decide qué quiere ver; se recuerda en este
 * equipo (solo es una comodidad: sin almacenamiento, empieza como diga
 * `abierta`).
 */
import { useState, type ReactNode } from 'react';

const CLAVE = 'riesgo.plegable.';

function leer(id: string): boolean | null {
  try {
    const v = globalThis.localStorage?.getItem(CLAVE + id);
    return v === null || v === undefined ? null : v === '1';
  } catch {
    return null;
  }
}

function guardar(id: string, abierta: boolean): void {
  try {
    globalThis.localStorage?.setItem(CLAVE + id, abierta ? '1' : '0');
  } catch {
    // sin almacenamiento: no se recuerda, y ya está
  }
}

export function Plegable({
  id,
  titulo,
  resumen,
  abierta = false,
  children,
}: {
  /** Qué sección es (la misma para todas las salidas: se recuerda por tipo). */
  id: string;
  titulo: ReactNode;
  /** Una pista corta junto al título, visible aunque esté plegada. */
  resumen?: ReactNode;
  abierta?: boolean;
  children: ReactNode;
}) {
  const [abrir, setAbrir] = useState(() => leer(id) ?? abierta);
  return (
    <details
      className="plegable"
      open={abrir}
      onToggle={(e) => {
        const ahora = (e.currentTarget as HTMLDetailsElement).open;
        if (ahora !== abrir) {
          setAbrir(ahora);
          guardar(id, ahora);
        }
      }}
    >
      <summary>
        <span className="plegable-titulo">{titulo}</span>
        {resumen !== undefined && <span className="plegable-resumen">{resumen}</span>}
      </summary>
      <div className="plegable-cuerpo">{children}</div>
    </details>
  );
}
