/**
 * El explorador de distribución (U3.1), en su ventana flotante: la
 * distribución de una celda —histograma con dos delimitadores que se
 * arrastran, o curva acumulada— y sus estadísticas a la derecha. Lo que
 * enseña lo arma el panel (`excel/explorador.ts`) y llega en la URL al abrir
 * y por mensaje al seleccionar otra celda.
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { decodificarJson } from '../excel/codificacion.ts';
import { conteosDesdeCdf, PERCENTILES_EXPLORADOR, VERSION_EXPLORADOR, type Comparable, type FilaLista, type ListaModelo, type VistaExplorador } from '../excel/explorador.ts';
import { escucharAlPanel, hablarAlPanel } from '../excel/ventana.ts';
import { formatoDe, miles } from './formato.ts';
import { CurvaAcumulada, Histograma } from './Resultados.tsx';
import { Gantt } from './gantt/Gantt.tsx';
import { ESTADO_INICIAL, type DatosGantt, type EstadoEdicion } from '../excel/gantt.ts';
import type { OperacionGantt } from '../excel/edicionGantt.ts';
import './estilos.css';
import './explorador.css';

/**
 * Lo que manda el panel: una vista, o por qué no la hay para la celda
 * seleccionada; y la lista del modelo (U3.4) y con qué pestaña abrir.
 */
interface Mensaje {
  vista?: VistaExplorador;
  comparables?: Comparable[];
  motivo?: string;
  lista?: ListaModelo;
  pestana?: Pestana;
  /** G1/G2: el cronograma para el Gantt y cómo va la edición. */
  gantt?: DatosGantt;
  estadoGantt?: EstadoEdicion;
}

type Pestana = 'distribucion' | 'lista' | 'gantt';

function comoMensaje(d: unknown): Mensaje | null {
  const m = d as Mensaje | null;
  if (!m || typeof m !== 'object') return null;
  const vistaValida = m.vista && m.vista.version === VERSION_EXPLORADOR && Array.isArray(m.vista.barras);
  return {
    ...(vistaValida ? { vista: m.vista, comparables: Array.isArray(m.comparables) ? m.comparables : [] } : {}),
    ...(typeof m.motivo === 'string' ? { motivo: m.motivo } : {}),
    ...(m.lista && Array.isArray(m.lista.entradas) ? { lista: m.lista } : {}),
    ...(m.pestana === 'lista' || m.pestana === 'distribucion' || m.pestana === 'gantt' ? { pestana: m.pestana } : {}),
    ...(m.gantt && m.gantt.version === 1 && Array.isArray(m.gantt.orden) ? { gantt: m.gantt } : {}),
    ...(m.estadoGantt && typeof m.estadoGantt === 'object' ? { estadoGantt: m.estadoGantt } : {}),
  };
}

function Explorador() {
  const [vista, setVista] = useState<VistaExplorador | null>(null);
  const [aviso, setAviso] = useState<string | null>('Cargando…');
  const [modo, setModo] = useState<'histograma' | 'acumulada'>('histograma');
  const [lista, setLista] = useState<ListaModelo | null>(null);
  const [pestana, setPestana] = useState<Pestana>('distribucion');
  const [gantt, setGantt] = useState<DatosGantt | null>(null);
  const [estadoGantt, setEstadoGantt] = useState<EstadoEdicion>(ESTADO_INICIAL);
  const [comparables, setComparables] = useState<Comparable[]>([]);
  /** V3: la distribución superpuesta (su id); se conserva al cambiar de celda si sigue disponible. */
  const [comparar, setComparar] = useState<string>('');

  useEffect(() => {
    const aplicar = (m: Mensaje | null) => {
      if (!m) return;
      if (m.lista) setLista(m.lista);
      if (m.pestana) setPestana(m.pestana);
      if (m.gantt) setGantt(m.gantt);
      if (m.estadoGantt) setEstadoGantt(m.estadoGantt);
      if (m.vista) {
        const v = m.vista;
        setVista(v);
        setComparables(m.comparables ?? []);
        setAviso(null);
        document.title = `${v.titulo} — explorador`;
      } else if (m.motivo) {
        // Se queda la última vista, con el motivo encima: no se pierde lo que se miraba.
        setAviso(m.motivo);
      }
    };
    const codigo = new URLSearchParams(window.location.hash.slice(1)).get('d');
    if (codigo) void decodificarJson(codigo).then((d) => aplicar(comoMensaje(d) ?? { motivo: 'No se pudo leer lo que mandó el panel.' }));
    else setAviso('Esta ventana se abre desde la cinta: Riesgo → Ver distribución.');
    escucharAlPanel('explorador.html', (d) => aplicar(comoMensaje(d)));
    // Ya escucha: el panel puede mandar lo grande (el cronograma del Gantt).
    hablarAlPanel('explorador.html', { accion: 'listo' });
  }, []);

  const pestanas = (
    <nav className="pestanas pestanas-ventana">
      {(['distribucion', 'lista', 'gantt'] as const).map((p) => (
        <button key={p} type="button" className={p === pestana ? 'activa' : ''} onClick={() => {
          setPestana(p);
          if (p === 'gantt' && !gantt) hablarAlPanel('explorador.html', { accion: 'gantt-releer' });
        }}>
          {p === 'distribucion' ? 'Distribución' : p === 'lista' ? 'Entradas y salidas' : 'Gantt'}
        </button>
      ))}
    </nav>
  );
  if (pestana === 'gantt') {
    const pedir = (d: object) => {
      setEstadoGantt((e) => ({ ...e, ocupado: true, error: null, mensaje: null }));
      hablarAlPanel('explorador.html', d);
    };
    return (
      <main className="explorador ventana-gantt">
        {pestanas}
        {gantt ? (
          <Gantt datos={gantt} editable estado={estadoGantt}
            alOperar={(op: OperacionGantt) => pedir({ accion: 'gantt', op })}
            alDeshacer={() => pedir({ accion: 'gantt-deshacer' })}
            alRehacer={() => pedir({ accion: 'gantt-rehacer' })}
            alReleer={() => pedir({ accion: 'gantt-releer' })} />
        ) : <p className={estadoGantt.error ? 'aviso-error' : 'tenue'}>{estadoGantt.error ?? 'Leyendo el cronograma…'}</p>}
      </main>
    );
  }
  if (pestana === 'lista') {
    return (
      <main className="explorador">
        {pestanas}
        {lista ? (
          <ListaDelModelo
            lista={lista}
            alElegir={(ref) => {
              hablarAlPanel('explorador.html', { accion: 'ir', ref });
              setPestana('distribucion');
            }}
          />
        ) : <p className="tenue">Cargando…</p>}
      </main>
    );
  }
  if (!vista) return <main className="explorador">{pestanas}<p className="tenue">{aviso}</p></main>;

  const f = formatoDe(vista.fecha);
  const e = vista.estadisticas;
  const muestra = vista.muestra.length > 1 ? vista.muestra : undefined;
  // El id de un escenario es su nombre: al cambiar de salida se sigue comparando con el mismo escenario.
  const otra = comparables.find((c) => c.id === comparar);
  const esperadoComparado = otra ? conteosDesdeCdf(vista.barras, otra.cdf) : undefined;
  return (
    <main className="explorador">
      {pestanas}
      <header>
        <h1>{vista.titulo}</h1>
        <p className="tenue">
          {vista.tipo === 'salida' ? 'Salida' : 'Entrada'} · {vista.ref}
          {vista.distribucion ? ` · ${vista.distribucion}` : ''}
        </p>
        {aviso && <p className="aviso-linea">{aviso}</p>}
      </header>

      <div className="explorador-cuerpo">
        <section className="explorador-grafico">
          <div className="selector-vista" role="tablist">
            {(['histograma', 'acumulada'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={modo === m} className={modo === m ? 'activa' : 'secundario'} onClick={() => setModo(m)}>
                {m === 'histograma' ? 'Histograma' : 'Acumulada'}
              </button>
            ))}
          </div>
          {comparables.length > 0 && (
            <label className="comparar-con">
              <span className="tenue">Comparar con</span>
              <select value={otra ? otra.id : ''} onChange={(ev) => setComparar(ev.target.value)}>
                <option value="">Nada</option>
                {comparables.some((c) => c.origen === 'escenario') && (
                  <optgroup label="La misma salida en un escenario">
                    {comparables.filter((c) => c.origen === 'escenario').map((c) => <option key={c.id} value={c.id}>{c.titulo.replace(`${vista.titulo} en el escenario `, '')}</option>)}
                  </optgroup>
                )}
                {comparables.some((c) => c.origen === 'salida') && (
                  <optgroup label="Otra salida de esta simulación">
                    {comparables.filter((c) => c.origen === 'salida').map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
          )}
          {modo === 'histograma' ? (
            <Histograma
              key={`${vista.tipo}:${vista.ref}:${otra?.id ?? ''}`}
              barras={vista.barras}
              {...(esperadoComparado ? { esperado: esperadoComparado, etiquetaEsperado: `«${otra?.titulo}» tendría` } : vista.esperado ? { esperado: vista.esperado } : {})}
              {...(vista.umbral ? { umbral: { value: vista.umbral.valor, direction: vista.umbral.sentido } } : {})}
              marcas={{ media: e.media, ...(e.percentiles[4] !== undefined ? { mediana: e.percentiles[4] } : {}) }}
              {...(muestra ? { muestraOrdenada: muestra } : {})}
              etiqueta={`Histograma de ${vista.titulo}`}
              formato={f}
            />
          ) : (
            <CurvaAcumulada puntos={vista.cdf} formato={f} {...(otra ? { referencia: otra.cdf, etiquetaReferencia: otra.titulo } : {})} />
          )}
          {otra && modo === 'histograma' && <p className="tenue">La línea es «{otra.titulo}», a la misma escala.</p>}
          {otra && <TablaComparada vista={vista} otra={otra} />}
          {modo === 'histograma' && muestra && (
            <p className="tenue">Arrastra los dos delimitadores: arriba se lee qué parte de las iteraciones queda a cada lado y entre ellos.</p>
          )}
        </section>

        <aside className="explorador-estadisticas">
          <h2>Estadísticas</h2>
          <table className="tabla-estadisticas">
            <tbody>
              <Fila nombre="Iteraciones" valor={miles(e.n)} />
              <Fila nombre="Media" valor={f.valor(e.media)} />
              <Fila nombre="Desviación" valor={f.dispersion(e.desviacion)} />
              <Fila nombre="Mínimo" valor={f.valor(e.min)} />
              <Fila nombre="Máximo" valor={f.valor(e.max)} />
            </tbody>
          </table>
          {e.percentiles.length === PERCENTILES_EXPLORADOR.length && (
            <>
              <h3>Percentiles</h3>
              <table className="tabla-estadisticas">
                <tbody>
                  {PERCENTILES_EXPLORADOR.map((p, i) => (
                    <Fila key={p} nombre={`p${Math.round(p * 100)}`} valor={f.valor(e.percentiles[i] as number)} />
                  ))}
                </tbody>
              </table>
            </>
          )}
          {e.riesgo && (
            <>
              <h3>Riesgo y forma</h3>
              <table className="tabla-estadisticas">
                <tbody>
                  <Fila nombre="VaR 5 % (cola baja)" valor={f.valor(e.riesgo.varInferior)} />
                  <Fila nombre="CVaR 5 % (cola baja)" valor={f.valor(e.riesgo.cvarInferior)} />
                  <Fila nombre="VaR 5 % (cola alta)" valor={f.valor(e.riesgo.varSuperior)} />
                  <Fila nombre="CVaR 5 % (cola alta)" valor={f.valor(e.riesgo.cvarSuperior)} />
                  <Fila nombre="Asimetría" valor={e.riesgo.asimetria.toLocaleString('es-ES', { maximumFractionDigits: 2 })} />
                  <Fila nombre="Curtosis" valor={e.riesgo.curtosis.toLocaleString('es-ES', { maximumFractionDigits: 2 })} />
                </tbody>
              </table>
            </>
          )}
          {vista.aproximada && <p className="tenue">Resultados guardados en el libro: percentiles y delimitadores aproximados (±0,2 puntos).</p>}
        </aside>
      </div>
      <footer className="tenue">Selecciona otra entrada o salida en la hoja y esta ventana la enseña.</footer>
    </main>
  );
}

/** V3: las cifras de las dos distribuciones, lado a lado, con la diferencia. */
function TablaComparada({ vista, otra }: { vista: VistaExplorador; otra: Comparable }) {
  const f = formatoDe(vista.fecha);
  const e = vista.estadisticas;
  const filas: [string, number, number, boolean][] = [
    ['Media', e.media, otra.media, false],
    ['Desviación', e.desviacion, otra.desviacion, true],
    ...([1, 4, 7] as const).map((i): [string, number, number, boolean] => [`p${Math.round((PERCENTILES_EXPLORADOR[i] as number) * 100)}`, e.percentiles[i] ?? NaN, otra.percentiles[i] ?? NaN, false]),
  ];
  const dif = (a: number, b: number, disp: boolean) => {
    const d = a - b;
    if (!Number.isFinite(d)) return '—';
    const t = disp || vista.fecha ? f.dispersion(Math.abs(d)) : f.valor(Math.abs(d));
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${t}`;
  };
  return (
    <table className="tabla-estadisticas tabla-comparada">
      <thead><tr><th /><th>Esta</th><th>Comparada</th><th>Diferencia</th></tr></thead>
      <tbody>
        {filas.map(([n, a, b, disp]) => (
          <tr key={n}><th scope="row">{n}</th><td>{disp ? f.dispersion(a) : f.valor(a)}</td><td>{disp ? f.dispersion(b) : f.valor(b)}</td><td>{dif(a, b, disp)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/** U3.4: todas las entradas y salidas; pulsar una la selecciona en la hoja y enseña su distribución. */
function ListaDelModelo({ lista, alElegir }: { lista: ListaModelo; alElegir: (ref: string) => void }) {
  const tabla = (titulo: string, filas: FilaLista[], columna: string) => (
    <section>
      <h2>{titulo} <span className="tenue">({filas.length})</span></h2>
      {filas.length === 0 ? <p className="tenue">Ninguna.</p> : (
        <div className="tabla-desplazable">
          <table className="tabla-resumen tabla-lista">
            <thead><tr><th>Nombre</th><th>Celda</th><th>{columna}</th>{lista.conSimulacion && <><th>Media</th><th>p5</th><th>p95</th></>}</tr></thead>
            <tbody>
              {filas.map((f) => {
                const fmt = formatoDe(f.fecha);
                return (
                  <tr key={`${f.origen}:${f.ref}`} onClick={() => alElegir(f.ref)} title="Seleccionarla en la hoja y ver su distribución">
                    <td>{f.nombre}{f.origen === 'funcion' && <span className="tenue"> · función</span>}</td>
                    <td className="tenue">{f.ref}</td>
                    <td>{f.detalle}</td>
                    {lista.conSimulacion && <>
                      <td>{f.media !== undefined ? fmt.valor(f.media) : ''}</td>
                      <td>{f.p5 !== undefined ? fmt.valor(f.p5) : ''}</td>
                      <td>{f.p95 !== undefined ? fmt.valor(f.p95) : ''}</td>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
  return (
    <>
      {!lista.conSimulacion && <p className="tenue">Sin simulación todavía: las cifras aparecen al simular (y también las entradas de funciones RIESGO).</p>}
      {tabla('Entradas', lista.entradas, 'Distribución')}
      {tabla('Salidas', lista.salidas, 'Más frecuente')}
      <p className="tenue">Pulsa una fila para seleccionarla en la hoja y ver su distribución.</p>
    </>
  );
}

function Fila({ nombre, valor }: { nombre: string; valor: string }) {
  return <tr><th scope="row">{nombre}</th><td>{valor}</td></tr>;
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><Explorador /></StrictMode>);
