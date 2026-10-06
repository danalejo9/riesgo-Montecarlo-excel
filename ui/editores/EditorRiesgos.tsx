/**
 * Editor de riesgos (06/10): un formulario por riesgo con sus impactos
 * (qué actividades retrasa y cuánto cuesta), en vez de las hojas Riesgos e
 * Impactos por separado. Al guardar se reescriben las dos hojas.
 */

import { useEffect, useState } from 'react';

import { revisarPedido, type DatosEditores, type ImpactoEditable, type RiesgoEditable } from '../../excel/editoresCronograma.ts';
import { LISTAS } from '../../excel/cronogramaHojas.ts';
import type { EstadoEdicion } from '../../excel/gantt.ts';
import { CampoNumero, OpcionesActividad, PieEditor } from './comunes.tsx';

const RIESGO_NUEVO = (n: number): RiesgoEditable => ({
  id: `R${n}`, descripcion: '', causa: '', consecuencia: '', dueno: '', categoria: '', probabilidad: 0.2, estado: 'Activo',
  probabilidadPost: null, impactoPost: null, costoMitigacion: null, modo: 'Extiende actividades', impactos: [],
});

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 1000) / 10} %`);

export function EditorRiesgos({ datos, estado, alGuardar, alDeshacer }: {
  datos: DatosEditores;
  estado: EstadoEdicion;
  alGuardar: (d: RiesgoEditable[]) => void;
  alDeshacer: () => void;
}) {
  const [borrador, setBorrador] = useState<RiesgoEditable[]>(datos.riesgos);
  useEffect(() => setBorrador(datos.riesgos), [datos]);
  const [elegido, setElegido] = useState(0);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(datos.riesgos);
  const problemas = revisarPedido({ tipo: 'riesgos', datos: borrador }, datos.actividades.map((a) => a.id));
  const k = Math.min(elegido, borrador.length - 1);
  const r = borrador[k];
  const cambiar = (c: Partial<RiesgoEditable>) => setBorrador((b) => b.map((x, i) => (i === k ? { ...x, ...c } : x)));
  const cambiarImpacto = (j: number, c: Partial<ImpactoEditable>) => r && cambiar({ impactos: r.impactos.map((x, i) => (i === j ? { ...x, ...c } : x)) });

  return (
    <div className="editor editor-riesgos">
      <p className="tenue">
        Lo que se cambia aquí se escribe en las hojas <b>Riesgos</b> e <b>Impactos</b> al pulsar «Guardar en las hojas».
        Una oportunidad es un riesgo con impactos negativos (acorta o ahorra).
      </p>
      <div className="dos-columnas">
        <section className="lista-editor">
          <h2>Riesgos ({borrador.length})</h2>
          <ul>
            {borrador.map((x, i) => (
              <li key={i}>
                <button type="button" className={i === k ? 'elegida' : ''} onClick={() => setElegido(i)}>
                  <b>{x.id || '(sin ID)'}</b> {x.descripcion || <span className="tenue">sin descripción</span>}
                  <span className="tenue"> · {pct(x.probabilidad)}{x.estado !== 'Activo' ? ` · ${x.estado}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="secundario" onClick={() => {
            const n = Math.max(0, ...borrador.map((x) => Number(/^R(\d+)$/i.exec(x.id)?.[1] ?? 0))) + 1;
            setBorrador((b) => [...b, RIESGO_NUEVO(n)]);
            setElegido(borrador.length);
          }}>+ Riesgo</button>
        </section>

        {r ? (
          <section className="formulario-riesgo">
            <div className="fila-controles">
              <h2>{r.id || 'Riesgo'}</h2>
              <button type="button" className="secundario" onClick={() => { setBorrador((b) => b.filter((_, i) => i !== k)); setElegido(Math.max(0, k - 1)); }}>
                Quitar este riesgo
              </button>
            </div>
            <div className="campos-editor">
              <label>ID <input type="text" value={r.id} onChange={(e) => cambiar({ id: e.target.value })} style={{ width: 70 }} /></label>
              <label className="ancho">Descripción <input type="text" value={r.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} /></label>
              <label className="ancho">Causa <input type="text" value={r.causa} onChange={(e) => cambiar({ causa: e.target.value })} /></label>
              <label className="ancho">Consecuencia <input type="text" value={r.consecuencia} onChange={(e) => cambiar({ consecuencia: e.target.value })} /></label>
              <label>Dueño <input type="text" value={r.dueno} onChange={(e) => cambiar({ dueno: e.target.value })} /></label>
              <label>Categoría <input type="text" value={r.categoria} onChange={(e) => cambiar({ categoria: e.target.value })} /></label>
              <label>Probabilidad (%) <CampoNumero valor={r.probabilidad} escala={100} alCambiar={(v) => cambiar({ probabilidad: v })} /></label>
              <label>Estado
                <select value={r.estado} onChange={(e) => cambiar({ estado: e.target.value })}>{LISTAS.estadoRiesgo.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
              <label>Modo
                <select value={r.modo} onChange={(e) => cambiar({ modo: e.target.value })}>{LISTAS.modoRiesgo.map((x) => <option key={x}>{x}</option>)}</select>
              </label>
            </div>
            <p className="tenue">
              «Extiende actividades»: si ocurre, alarga las actividades de abajo. «Actividad insertada»: si ocurre, se inserta una
              actividad nueva tras cada una (por ejemplo, un rediseño).
            </p>

            <h3>Impactos: qué actividades afecta</h3>
            <div className="desplazable-x">
            <table className="tabla-editor">
              <thead>
                <tr><th>Actividad</th><th>Distribución</th><th>Mín. (días)</th><th>Más prob.</th><th>Máx.</th><th>Costo mín.</th><th>Costo más prob.</th><th>Costo máx.</th><th /></tr>
              </thead>
              <tbody>
                {r.impactos.map((i, j) => {
                  const fija = i.distribucion === 'Fija';
                  return (
                    <tr key={j}>
                      <td>
                        <select value={i.actividad} onChange={(e) => cambiarImpacto(j, { actividad: e.target.value })} aria-label="Actividad">
                          {!datos.actividades.some((a) => a.id === i.actividad) && <option value={i.actividad}>{i.actividad || '(elija)'}</option>}
                          <OpcionesActividad actividades={datos.actividades} />
                        </select>
                      </td>
                      <td>
                        <select value={i.distribucion} onChange={(e) => cambiarImpacto(j, { distribucion: e.target.value })} aria-label="Distribución">
                          {LISTAS.distribucionImpacto.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      </td>
                      <td><CampoNumero valor={i.min} alCambiar={(v) => cambiarImpacto(j, { min: v })} ancho={55} deshabilitado={fija} etiqueta="Mínimo en días" /></td>
                      <td><CampoNumero valor={i.mp} alCambiar={(v) => cambiarImpacto(j, { mp: v })} ancho={55} etiqueta="Más probable en días" /></td>
                      <td><CampoNumero valor={i.max} alCambiar={(v) => cambiarImpacto(j, { max: v })} ancho={55} deshabilitado={fija} etiqueta="Máximo en días" /></td>
                      <td><CampoNumero valor={i.costoMin} alCambiar={(v) => cambiarImpacto(j, { costoMin: v })} ancho={90} deshabilitado={fija} etiqueta="Costo mínimo" /></td>
                      <td><CampoNumero valor={i.costoMp} alCambiar={(v) => cambiarImpacto(j, { costoMp: v })} ancho={90} etiqueta="Costo más probable" /></td>
                      <td><CampoNumero valor={i.costoMax} alCambiar={(v) => cambiarImpacto(j, { costoMax: v })} ancho={90} deshabilitado={fija} etiqueta="Costo máximo" /></td>
                      <td><button type="button" className="secundario" onClick={() => cambiar({ impactos: r.impactos.filter((_, x) => x !== j) })}>Quitar</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <button type="button" className="secundario" onClick={() => cambiar({
              impactos: [...r.impactos, { actividad: datos.actividades[0]?.id ?? '', distribucion: 'Triangular', min: null, mp: null, max: null, costoMin: null, costoMp: null, costoMax: null }],
            })}>+ Impacto</button>
            <p className="tenue">«Fija»: solo cuenta el más probable (en días y en costo). El costo es opcional.</p>

            <h3>Mitigación (para «Antes y después de mitigar»)</h3>
            <div className="campos-editor">
              <label>Probabilidad después (%) <CampoNumero valor={r.probabilidadPost} escala={100} alCambiar={(v) => cambiar({ probabilidadPost: v })} /></label>
              <label>Impacto que queda (%) <CampoNumero valor={r.impactoPost} escala={100} alCambiar={(v) => cambiar({ impactoPost: v })} /></label>
              <label>Costo de la mitigación <CampoNumero valor={r.costoMitigacion} alCambiar={(v) => cambiar({ costoMitigacion: v })} ancho={120} /></label>
            </div>
          </section>
        ) : <p className="tenue">No hay riesgos. Pulse «+ Riesgo».</p>}
      </div>

      <PieEditor cambiado={cambiado} problemas={problemas} estado={estado} alGuardar={() => alGuardar(borrador)}
        alDescartar={() => setBorrador(datos.riesgos)} alDeshacer={alDeshacer} />
    </div>
  );
}
