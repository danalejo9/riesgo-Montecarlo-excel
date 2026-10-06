/**
 * Editor de ramas (06/10): una decisión o un resultado que aún no se
 * conoce, con sus opciones; en cada iteración se sortea una y solo cuentan
 * sus actividades. Al guardar se reescribe la hoja Ramas.
 */

import { useEffect, useState } from 'react';

import { revisarPedido, type DatosEditores, type OpcionEditable, type RamaEditable } from '../../excel/editoresCronograma.ts';
import type { EstadoEdicion } from '../../excel/gantt.ts';
import { CampoNumero, OpcionesActividad, PieEditor } from './comunes.tsx';

const separar = (t: string) => t.split(/[,;]/).map((s) => s.trim()).filter(Boolean);

export function EditorRamas({ datos, estado, alGuardar, alDeshacer }: {
  datos: DatosEditores;
  estado: EstadoEdicion;
  alGuardar: (d: RamaEditable[]) => void;
  alDeshacer: () => void;
}) {
  const [borrador, setBorrador] = useState<RamaEditable[]>(datos.ramas);
  useEffect(() => setBorrador(datos.ramas), [datos]);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(datos.ramas);
  const problemas = revisarPedido({ tipo: 'ramas', datos: borrador }, datos.actividades.map((a) => a.id));
  const cambiarRama = (i: number, c: Partial<RamaEditable>) => setBorrador((b) => b.map((x, k) => (k === i ? { ...x, ...c } : x)));
  const cambiarOpcion = (i: number, j: number, c: Partial<OpcionEditable>) =>
    setBorrador((b) => b.map((x, k) => (k === i ? { ...x, opciones: x.opciones.map((o, m) => (m === j ? { ...o, ...c } : o)) } : x)));
  const nombre = (id: string) => datos.actividades.find((a) => a.id.toLowerCase() === id.toLowerCase())?.nombre;

  return (
    <div className="editor editor-ramas">
      <p className="tenue">
        Una rama es algo que aún no se sabe (un permiso rápido o lento, un diseño u otro). En cada iteración se sortea una opción
        según su probabilidad y <b>solo cuentan sus actividades</b>: las de las demás opciones duran 0. Las probabilidades de una
        rama tienen que sumar 100 %. Se escribe en la hoja <b>Ramas</b>.
      </p>
      {borrador.length === 0 && <p className="tenue">No hay ramas. Pulse «+ Rama».</p>}
      {borrador.map((r, i) => {
        const suma = r.opciones.reduce((s, o) => s + (o.probabilidad ?? 0), 0);
        const bien = Math.abs(suma - 1) <= 0.005;
        return (
          <section key={i} className="tarjeta-rama">
            <div className="fila-controles">
              <label>Rama <input type="text" value={r.nombre} onChange={(e) => cambiarRama(i, { nombre: e.target.value })} /></label>
              <span className={bien ? 'aviso-ok' : 'aviso-error'}>Suman {Math.round(suma * 1000) / 10} %{bien ? ' ✓' : ' (tienen que sumar 100 %)'}</span>
              <button type="button" className="secundario" onClick={() => setBorrador((b) => b.filter((_, k) => k !== i))}>Quitar la rama</button>
            </div>
            <table className="tabla-editor">
              <thead><tr><th>Opción</th><th>Probabilidad (%)</th><th>Actividades que cuentan</th><th>Añadir</th><th /></tr></thead>
              <tbody>
                {r.opciones.map((o, j) => (
                  <tr key={j}>
                    <td><input type="text" value={o.nombre} onChange={(e) => cambiarOpcion(i, j, { nombre: e.target.value })} aria-label="Opción" /></td>
                    <td><CampoNumero valor={o.probabilidad} escala={100} alCambiar={(v) => cambiarOpcion(i, j, { probabilidad: v })} etiqueta="Probabilidad" /></td>
                    <td>
                      <input type="text" value={o.actividades} onChange={(e) => cambiarOpcion(i, j, { actividades: e.target.value })} aria-label="Actividades" />
                      <div className="tenue">{separar(o.actividades).map((id) => `${id} · ${nombre(id) ?? '¿no existe?'}`).join(' — ')}</div>
                    </td>
                    <td>
                      <select value="" aria-label="Añadir una actividad" onChange={(e) => {
                        const id = e.target.value;
                        if (id && !separar(o.actividades).includes(id)) cambiarOpcion(i, j, { actividades: [...separar(o.actividades), id].join(', ') });
                      }}>
                        <option value="">+ actividad…</option>
                        <OpcionesActividad actividades={datos.actividades} />
                      </select>
                    </td>
                    <td><button type="button" className="secundario" onClick={() => cambiarRama(i, { opciones: r.opciones.filter((_, m) => m !== j) })}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="secundario" onClick={() => cambiarRama(i, { opciones: [...r.opciones, { nombre: `Opción ${r.opciones.length + 1}`, probabilidad: null, actividades: '' }] })}>+ Opción</button>
          </section>
        );
      })}
      <button type="button" className="secundario" onClick={() => setBorrador((b) => [...b, {
        nombre: `Rama ${b.length + 1}`, opciones: [{ nombre: 'Opción 1', probabilidad: 0.5, actividades: '' }, { nombre: 'Opción 2', probabilidad: 0.5, actividades: '' }],
      }])}>+ Rama</button>

      <PieEditor cambiado={cambiado} problemas={problemas} estado={estado} alGuardar={() => alGuardar(borrador)}
        alDescartar={() => setBorrador(datos.ramas)} alDeshacer={alDeshacer} />
    </div>
  );
}
