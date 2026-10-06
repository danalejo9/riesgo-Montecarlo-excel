/**
 * Piezas comunes de los editores en ventana (calendarios, riesgos, ramas):
 * un campo numérico que se puede escribir con coma, y el pie con Guardar,
 * Descartar y Deshacer.
 */

import { useEffect, useState } from 'react';

import type { EstadoEdicion } from '../../excel/gantt.ts';
import { leerNumero } from '../formato.ts';

const texto = (v: number | null, escala: number) => (v === null ? '' : (Math.round(v * escala * 1e6) / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 6, useGrouping: false }));

/** Un número (o vacío). `escala` 100 para porcentajes: se escribe 35 y se guarda 0,35. */
export function CampoNumero({ valor, alCambiar, escala = 1, ancho = 70, etiqueta, deshabilitado }: {
  valor: number | null; alCambiar: (v: number | null) => void; escala?: number; ancho?: number; etiqueta?: string; deshabilitado?: boolean;
}) {
  const [t, setT] = useState(texto(valor, escala));
  useEffect(() => setT(texto(valor, escala)), [valor, escala]);
  const confirmar = () => {
    const x = leerNumero(t);
    if (t.trim() === '') alCambiar(null);
    else if (x !== null) alCambiar(x / escala);
    else setT(texto(valor, escala));
  };
  return (
    <input type="text" inputMode="decimal" value={t} style={{ width: ancho }} aria-label={etiqueta} disabled={deshabilitado}
      onChange={(e) => setT(e.target.value)} onBlur={confirmar} onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }} />
  );
}

/** El pie de un editor: estado, Guardar, Descartar y Deshacer el último guardado. */
export function PieEditor({ cambiado, problemas, estado, alGuardar, alDescartar, alDeshacer }: {
  cambiado: boolean;
  problemas: string[];
  estado: EstadoEdicion;
  alGuardar: () => void;
  alDescartar: () => void;
  alDeshacer: () => void;
}) {
  return (
    <div className="pie-editor">
      {problemas.length > 0 && (
        <ul className="aviso-error lista-problemas">{problemas.map((p) => <li key={p}>{p}</li>)}</ul>
      )}
      {estado.error && <p className="aviso-error">{estado.error}</p>}
      {estado.mensaje && !estado.error && <p className="aviso-ok">{estado.mensaje}</p>}
      <div className="botonera">
        <button type="button" onClick={alGuardar} disabled={!cambiado || problemas.length > 0 || estado.ocupado}>Guardar en las hojas</button>
        <button type="button" className="secundario" onClick={alDescartar} disabled={!cambiado || estado.ocupado}>Descartar los cambios</button>
        <button type="button" className="secundario" onClick={alDeshacer} disabled={!estado.deshacer || estado.ocupado}
          title={estado.deshacer ? `Deshacer: ${estado.deshacer}` : ''}>Deshacer{estado.deshacer ? `: ${estado.deshacer}` : ''}</button>
        <span className={cambiado ? 'pendiente' : 'tenue'}>{estado.ocupado ? 'Guardando…' : cambiado ? 'Cambios sin guardar' : 'Igual que las hojas'}</span>
      </div>
    </div>
  );
}

/** Lista para elegir una actividad («A · Diseño y estudios»). */
export function OpcionesActividad({ actividades }: { actividades: readonly { id: string; nombre: string }[] }) {
  return <>{actividades.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.nombre}</option>)}</>;
}
