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
import { PERCENTILES_EXPLORADOR, VERSION_EXPLORADOR, type FilaLista, type ListaModelo, type VistaExplorador } from '../excel/explorador.ts';
import { escucharAlPanel, hablarAlPanel } from '../excel/ventana.ts';
import { formatoDe, miles } from './formato.ts';
import { CurvaAcumulada, Histograma } from './Resultados.tsx';
import './estilos.css';
import './explorador.css';

/**
 * Lo que manda el panel: una vista, o por qué no la hay para la celda
 * seleccionada; y la lista del modelo (U3.4) y con qué pestaña abrir.
 */
interface Mensaje {
  vista?: VistaExplorador;
  motivo?: string;
  lista?: ListaModelo;
  pestana?: 'distribucion' | 'lista';
}

function comoMensaje(d: unknown): Mensaje | null {
  const m = d as Mensaje | null;
  if (!m || typeof m !== 'object') return null;
  const vistaValida = m.vista && m.vista.version === VERSION_EXPLORADOR && Array.isArray(m.vista.barras);
  return {
    ...(vistaValida ? { vista: m.vista } : {}),
    ...(typeof m.motivo === 'string' ? { motivo: m.motivo } : {}),
    ...(m.lista && Array.isArray(m.lista.entradas) ? { lista: m.lista } : {}),
    ...(m.pestana === 'lista' || m.pestana === 'distribucion' ? { pestana: m.pestana } : {}),
  };
}

function Explorador() {
  const [vista, setVista] = useState<VistaExplorador | null>(null);
  const [aviso, setAviso] = useState<string | null>('Cargando…');
  const [modo, setModo] = useState<'histograma' | 'acumulada'>('histograma');
  const [lista, setLista] = useState<ListaModelo | null>(null);
  const [pestana, setPestana] = useState<'distribucion' | 'lista'>('distribucion');

  useEffect(() => {
    const aplicar = (m: Mensaje | null) => {
      if (!m) return;
      if (m.lista) setLista(m.lista);
      if (m.pestana) setPestana(m.pestana);
      if (m.vista) {
        const v = m.vista;
        setVista(v);
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
  }, []);

  const pestanas = (
    <nav className="pestanas pestanas-ventana">
      {(['distribucion', 'lista'] as const).map((p) => (
        <button key={p} type="button" className={p === pestana ? 'activa' : ''} onClick={() => setPestana(p)}>
          {p === 'distribucion' ? 'Distribución' : 'Entradas y salidas'}
        </button>
      ))}
    </nav>
  );
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
          {modo === 'histograma' ? (
            <Histograma
              key={`${vista.tipo}:${vista.ref}`}
              barras={vista.barras}
              {...(vista.esperado ? { esperado: vista.esperado } : {})}
              {...(vista.umbral ? { umbral: { value: vista.umbral.valor, direction: vista.umbral.sentido } } : {})}
              marcas={{ media: e.media, ...(e.percentiles[4] !== undefined ? { mediana: e.percentiles[4] } : {}) }}
              {...(muestra ? { muestraOrdenada: muestra } : {})}
              etiqueta={`Histograma de ${vista.titulo}`}
              formato={f}
            />
          ) : (
            <CurvaAcumulada puntos={vista.cdf} formato={f} />
          )}
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
