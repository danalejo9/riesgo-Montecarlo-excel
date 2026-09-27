/**
 * La página del informe imprimible ("PDF"): lee los datos del fragmento de la
 * dirección y los pinta con los mismos gráficos del panel, maquetados para una
 * hoja A4. "Imprimir → Guardar como PDF" hace el resto.
 */

import { Fragment, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { decodificarInforme, type DatosInforme, type SalidaInforme } from '../excel/informeImprimible.ts';
import { duracion, miles, numero } from './formato.ts';
import { Arana, CurvaAcumulada, Histograma, PrecisionSalida, TablaComparacion, Tornado } from './Resultados.tsx';
import './estilos.css';
import './informe.css';

function Informe() {
  const [datos, setDatos] = useState<DatosInforme | null | 'cargando'>('cargando');

  useEffect(() => {
    const codigo = new URLSearchParams(window.location.hash.slice(1)).get('d');
    if (!codigo) {
      setDatos(null);
      return;
    }
    void decodificarInforme(codigo).then((d) => {
      setDatos(d);
      if (d) document.title = `Informe de riesgo — ${new Date(d.generado).toLocaleDateString('es-ES')}`;
    });
  }, []);

  if (datos === 'cargando') return <p className="tenue">Preparando el informe…</p>;
  if (!datos) {
    return (
      <main className="informe">
        <h1>No hay informe que enseñar</h1>
        <p>Esta página se abre desde el panel del complemento, con el botón «Informe PDF» de Resultados.</p>
      </main>
    );
  }

  const a = datos.ajustes;
  return (
    <main className="informe">
      <div className="solo-pantalla barra-informe">
        <button type="button" className="principal" onClick={() => window.print()}>Imprimir o guardar como PDF</button>
        <span className="tenue">En el cuadro de impresión, elige «Guardar como PDF» como impresora.</span>
      </div>

      <header className="portada">
        <h1>{datos.titulo}</h1>
        <p className="tenue">
          {new Date(datos.generado).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}
          {datos.libro ? ` · ${datos.libro}` : ''}
        </p>
        {datos.descripcion && <p className="descripcion-proyecto">{datos.descripcion}</p>}
      </header>

      <section>
        <h2>Cómo se calculó</h2>
        <dl className="datos">
          <dt>Iteraciones</dt><dd>{miles(a.iteraciones)}{a.tandas && a.tandas.length > 1 ? ` (hasta la precisión: ${a.tandas.map(miles).join(' → ')})` : ''}</dd>
          <dt>Muestreo</dt><dd>{a.muestreo}</dd>
          <dt>Semilla</dt><dd>{a.semilla}</dd>
          <dt>Motor</dt><dd>{a.motor}{a.hilos ? ` · ${a.hilos === 1 ? 'un hilo' : `${a.hilos} hilos`}` : ''}</dd>
          <dt>Tiempo</dt><dd>{duracion(a.tiempoMs)}</dd>
        </dl>
      </section>

      <section>
        <h2>Entradas inciertas</h2>
        <table className="comparacion tabla-informe">
          <thead><tr><th>Entrada</th><th>Celda</th><th>Distribución</th><th>Correlaciones</th></tr></thead>
          <tbody>
            {datos.entradas.map((e) => (
              <tr key={e.ref}><th scope="row">{e.nombre}</th><td>{e.ref}</td><td>{e.distribucion}</td><td>{e.correlaciones}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {datos.salidas.map((s, i) => <SalidaImpresa key={s.id} salida={s} referencia={datos.referencia} primera={i === 0} />)}

      <footer className="tenue pie-informe">
        Percentiles aproximados (t-digest). Sensibilidad por correlación de rangos y regresión sobre las primeras
        iteraciones. Generado por Riesgo Monte Carlo; todo el cálculo se hizo en el equipo del usuario.
      </footer>
    </main>
  );
}

function SalidaImpresa({ salida: s, referencia, primera }: { salida: SalidaInforme; referencia?: string; primera: boolean }) {
  if (s.resumen.n === 0) {
    return (
      <section className={primera ? 'salida-informe primera' : 'salida-informe'}>
        <h2>{s.nombre} <span className="tenue">({s.ref})</span></h2>
        <p>Ninguna iteración dio un número en esta celda (devuelve un texto o un error de Excel): no hay estadísticas.</p>
      </section>
    );
  }
  return (
    <section className={primera ? 'salida-informe primera' : 'salida-informe'}>
      <h2>{s.nombre} <span className="tenue">({s.ref})</span></h2>

      {s.lectura && s.lectura.length > 0 && <p className="lectura">{s.lectura.join(' ')}</p>}

      {s.umbral && (
        <p className="umbral-respuesta">
          {s.umbral.texto}: <strong>{(s.umbral.probabilidad * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</strong>
        </p>
      )}

      <div className="dos-columnas">
        <dl className="datos">
          <dt>Media</dt><dd>{numero(s.resumen.media)}</dd>
          <dt>Desviación</dt><dd>{numero(s.resumen.desviacion)}</dd>
          <dt>Mínimo</dt><dd>{numero(s.resumen.min)}</dd>
          <dt>Máximo</dt><dd>{numero(s.resumen.max)}</dd>
          {s.noNumericas > 0 && (<><dt>Sin valor</dt><dd>{miles(s.noNumericas)} iteraciones</dd></>)}
        </dl>
        <dl className="datos">
          {Object.entries(s.resumen.percentiles).map(([k, v]) => (
            <Fragment key={k}><dt>{k}</dt><dd>{numero(v)}</dd></Fragment>
          ))}
        </dl>
      </div>

      {s.precision && <PrecisionSalida precision={s.precision} n={s.resumen.n} />}

      {s.comparacion && referencia && <TablaComparacion etiqueta={referencia} filas={s.comparacion} />}

      <div className="dos-columnas graficos-informe">
        {s.histograma && s.histograma.length > 0 && (
          <div><h3>Histograma</h3><Histograma barras={s.histograma} /></div>
        )}
        <div>
          <h3>Probabilidad acumulada</h3>
          <CurvaAcumulada puntos={s.cdf} referencia={s.cdfReferencia} etiquetaReferencia={referencia} />
        </div>
      </div>

      <div className="dos-columnas graficos-informe">
        {s.sensibilidad && s.sensibilidad.length > 0 && (
          <div><h3>Qué la mueve más</h3><Tornado filas={s.sensibilidad} r2={s.r2} /></div>
        )}
        {s.arana && s.arana.length > 0 && (
          <div><h3>Qué pasa si cada entrada se mueve</h3><Arana curvas={s.arana} /></div>
        )}
      </div>
    </section>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><Informe /></StrictMode>);
