/**
 * Editor de calendarios (06/10): los días laborables de cada calendario y,
 * en un año a la vista, los festivos y los días trabajados de excepción. Un
 * clic en un día lo marca o lo desmarca. Al guardar se reescribe la hoja
 * Calendario (y, si se renombró un calendario, Actividades y Config).
 */

import { useEffect, useMemo, useState } from 'react';

import {
  anadirFestivosColombia, calendariosEnUso, revisarPedido,
  type CalendarioEditable, type DatosCalendarios, type DatosEditores, type ExcepcionEditable,
} from '../../excel/editoresCronograma.ts';
import type { EstadoEdicion } from '../../excel/gantt.ts';
import { diaSemana } from '../../engine/cronograma/festivos.ts';
import { fechaDeSerie, serieDeFecha, textoFecha } from '../../engine/modelo/fechas.ts';
import { normalizar } from '../../excel/cronogramaHojas.ts';
import { PieEditor } from './comunes.tsx';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function EditorCalendarios({ datos, estado, alGuardar, alDeshacer }: {
  datos: DatosEditores;
  estado: EstadoEdicion;
  alGuardar: (d: DatosCalendarios) => void;
  alDeshacer: () => void;
}) {
  const [borrador, setBorrador] = useState<DatosCalendarios>(datos.calendarios);
  useEffect(() => setBorrador(datos.calendarios), [datos]);
  const cambiado = JSON.stringify(borrador) !== JSON.stringify(datos.calendarios);
  const uso = useMemo(() => calendariosEnUso(datos), [datos]);
  const [elegido, setElegido] = useState(0);
  const cal = borrador.calendarios[Math.min(elegido, borrador.calendarios.length - 1)];
  const primerAnio = borrador.excepciones[0] ? fechaDeSerie(borrador.excepciones[0].fecha).anio : new Date().getFullYear();
  const [anio, setAnio] = useState(() => Math.max(primerAnio, new Date().getFullYear()));
  const [soloEste, setSoloEste] = useState(false);
  const [desde, setDesde] = useState(anio);
  const [hasta, setHasta] = useState(anio + 4);
  const problemas = revisarPedido({ tipo: 'calendarios', datos: borrador }, datos.actividades.map((a) => a.id));

  const cambiarCal = (i: number, c: Partial<CalendarioEditable>) =>
    setBorrador((b) => ({ ...b, calendarios: b.calendarios.map((x, k) => (k === i ? { ...x, ...c } : x)) }));
  const cambiarExc = (cambio: (e: ExcepcionEditable[]) => ExcepcionEditable[]) =>
    setBorrador((b) => ({ ...b, excepciones: cambio(b.excepciones).sort((x, y) => x.fecha - y.fecha) }));

  /** Excepciones que tocan a este calendario (las de todos y las suyas). */
  const deEste = (c: CalendarioEditable | undefined, e: ExcepcionEditable) =>
    !e.calendario || (c && [normalizar(c.nombre), normalizar(c.original)].includes(normalizar(e.calendario)));

  const alPulsarDia = (serie: number) => {
    if (!cal) return;
    const existente = borrador.excepciones.findIndex((e) => e.fecha === serie && deEste(cal, e));
    if (existente >= 0) {
      cambiarExc((ex) => ex.filter((_, k) => k !== existente));
      return;
    }
    const laborable = cal.laborables[diaSemana(serie)] === true;
    cambiarExc((ex) => [...ex, {
      fecha: serie, descripcion: laborable ? 'Festivo' : 'Día trabajado', calendario: soloEste ? cal.nombre : '', tipo: laborable ? 'Festivo' : 'Laborable',
    }]);
  };

  const enAnio = borrador.excepciones.map((e, i) => ({ e, i })).filter(({ e }) => fechaDeSerie(e.fecha).anio === anio);

  return (
    <div className="editor editor-calendarios">
      <p className="tenue">
        Lo que se cambia aquí se escribe en la hoja <b>Calendario</b> al pulsar «Guardar en las hojas». Un clic en un día del año
        lo marca como festivo (o, si no se trabaja ese día de la semana, como día trabajado); otro clic lo desmarca.
      </p>
      <section>
        <h2>Calendarios</h2>
        <table className="tabla-editor">
          <thead>
            <tr><th>Nombre</th>{DIAS.map((d, i) => <th key={d} title={DIAS_LARGOS[i]}>{d}</th>)}<th>Lo usan</th><th /></tr>
          </thead>
          <tbody>
            {borrador.calendarios.map((c, i) => {
              const quien = uso.get(normalizar(c.original)) ?? [];
              return (
                <tr key={i} className={i === elegido ? 'elegida' : ''} onClick={() => setElegido(i)}>
                  <td><input type="text" value={c.nombre} onChange={(e) => cambiarCal(i, { nombre: e.target.value })} aria-label="Nombre del calendario" /></td>
                  {c.laborables.map((l, d) => (
                    <td key={d} className="centro">
                      <input type="checkbox" checked={l} aria-label={`${DIAS_LARGOS[d]} laborable`}
                        onChange={(e) => cambiarCal(i, { laborables: c.laborables.map((x, k) => (k === d ? e.target.checked : x)) })} />
                    </td>
                  ))}
                  <td className="tenue">{quien.length ? quien.join(', ') : '—'}</td>
                  <td>
                    <button type="button" className="secundario" disabled={quien.length > 0}
                      title={quien.length ? `No se puede quitar: lo usan ${quien.join(', ')}` : 'Quitar este calendario'}
                      onClick={(e) => { e.stopPropagation(); setBorrador((b) => ({ ...b, calendarios: b.calendarios.filter((_, k) => k !== i) })); setElegido(0); }}>Quitar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="secundario" onClick={() => {
          setBorrador((b) => ({ ...b, calendarios: [...b.calendarios, { nombre: `Calendario ${b.calendarios.length + 1}`, original: '', laborables: [true, true, true, true, true, false, false] }] }));
          setElegido(borrador.calendarios.length);
        }}>+ Calendario</button>
        <span className="tenue"> Al renombrar un calendario, también se renombra en Actividades y en Config.</span>
      </section>

      <section>
        <div className="fila-controles">
          <h2>Año {anio}{cal ? ` · ${cal.nombre}` : ''}</h2>
          <button type="button" className="secundario" onClick={() => setAnio(anio - 1)}>‹ {anio - 1}</button>
          <button type="button" className="secundario" onClick={() => setAnio(anio + 1)}>{anio + 1} ›</button>
          <label>Ver el calendario{' '}
            <select value={elegido} onChange={(e) => setElegido(Number(e.target.value))}>
              {borrador.calendarios.map((c, i) => <option key={i} value={i}>{c.nombre}</option>)}
            </select>
          </label>
          <label><input type="checkbox" checked={soloEste} onChange={(e) => setSoloEste(e.target.checked)} /> Lo que marque, solo para este calendario</label>
        </div>
        <div className="anio">
          {MESES.map((m, mes) => <Mes key={m} anio={anio} mes={mes} cal={cal} excepciones={borrador.excepciones.filter((e) => deEste(cal, e))} alPulsar={alPulsarDia} />)}
        </div>
        <p className="leyenda-calendario tenue">
          <span className="dia no-laborable">8</span> no se trabaja ese día de la semana ·
          <span className="dia festivo">8</span> festivo ·
          <span className="dia trabajado">8</span> día trabajado de excepción
        </p>
      </section>

      <section>
        <h2>Festivos y excepciones de {anio} ({enAnio.length})</h2>
        <div className="fila-controles">
          <span>Añadir los festivos de Colombia de</span>
          <input type="number" value={desde} onChange={(e) => setDesde(Number(e.target.value))} style={{ width: 70 }} aria-label="Desde el año" />
          <span>a</span>
          <input type="number" value={hasta} onChange={(e) => setHasta(Number(e.target.value))} style={{ width: 70 }} aria-label="Hasta el año" />
          <button type="button" className="secundario" disabled={!(hasta >= desde && hasta - desde <= 30)}
            onClick={() => cambiarExc((ex) => anadirFestivosColombia(ex, desde, hasta))}>Añadir</button>
          <span className="tenue">(no repite los que ya están)</span>
        </div>
        {enAnio.length === 0 ? <p className="tenue">Ninguno en {anio}.</p> : (
          <table className="tabla-editor">
            <thead><tr><th>Fecha</th><th>Descripción</th><th>Calendario</th><th>Tipo</th><th /></tr></thead>
            <tbody>
              {enAnio.map(({ e, i }) => (
                <tr key={`${e.fecha}-${i}`}>
                  <td>{DIAS_LARGOS[diaSemana(e.fecha)]?.slice(0, 3)} {textoFecha(e.fecha)}</td>
                  <td><input type="text" value={e.descripcion} aria-label="Descripción"
                    onChange={(x) => cambiarExc((ex) => ex.map((y, k) => (k === i ? { ...y, descripcion: x.target.value } : y)))} /></td>
                  <td>
                    <select value={e.calendario} aria-label="Calendario" onChange={(x) => cambiarExc((ex) => ex.map((y, k) => (k === i ? { ...y, calendario: x.target.value } : y)))}>
                      <option value="">Todos</option>
                      {borrador.calendarios.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={e.tipo} aria-label="Tipo" onChange={(x) => cambiarExc((ex) => ex.map((y, k) => (k === i ? { ...y, tipo: x.target.value as ExcepcionEditable['tipo'] } : y)))}>
                      <option>Festivo</option><option>Laborable</option>
                    </select>
                  </td>
                  <td><button type="button" className="secundario" onClick={() => cambiarExc((ex) => ex.filter((_, k) => k !== i))}>Quitar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <PieEditor cambiado={cambiado} problemas={problemas} estado={estado} alGuardar={() => alGuardar(borrador)}
        alDescartar={() => setBorrador(datos.calendarios)} alDeshacer={alDeshacer} />
    </div>
  );
}

function Mes({ anio, mes, cal, excepciones, alPulsar }: {
  anio: number; mes: number; cal: CalendarioEditable | undefined; excepciones: readonly ExcepcionEditable[]; alPulsar: (serie: number) => void;
}) {
  const primero = serieDeFecha(anio, mes + 1, 1);
  const dias = serieDeFecha(mes === 11 ? anio + 1 : anio, mes === 11 ? 1 : mes + 2, 1) - primero;
  const hueco = diaSemana(primero);
  const porDia = new Map(excepciones.map((e) => [e.fecha, e]));
  return (
    <div className="mes">
      <div className="nombre-mes">{MESES[mes]}</div>
      <div className="rejilla-mes">
        {DIAS.map((d) => <span key={d} className="cabeza">{d}</span>)}
        {Array.from({ length: hueco }, (_, i) => <span key={`h${i}`} />)}
        {Array.from({ length: dias }, (_, i) => {
          const s = primero + i;
          const e = porDia.get(s);
          const laborable = cal?.laborables[diaSemana(s)] === true;
          const clase = e ? (e.tipo === 'Laborable' ? 'trabajado' : 'festivo') : laborable ? '' : 'no-laborable';
          return (
            <button key={s} type="button" className={`dia ${clase}`} onClick={() => alPulsar(s)}
              title={`${textoFecha(s)}${e ? ` · ${e.descripcion}${e.calendario ? ` (${e.calendario})` : ''}` : laborable ? ' · laborable' : ' · no se trabaja'}`}>{i + 1}</button>
          );
        })}
      </div>
    </div>
  );
}
