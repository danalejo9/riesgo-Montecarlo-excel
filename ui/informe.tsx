/**
 * La página del informe imprimible ("PDF"): lee los datos del fragmento de la
 * dirección y los pinta con los mismos gráficos del panel, maquetados para una
 * hoja A4. "Imprimir → Guardar como PDF" hace el resto.
 */

import { esSalidaDeTexto } from '../excel/analisisTexto.ts';
import { Fragment, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { decodificarInforme, type DatosInforme, type SalidaInforme } from '../excel/informeImprimible.ts';
import { duracion, formatoDe, miles, numero } from './formato.ts';
import {
  MedidasDeRiesgo, Arana, CurvaAcumulada, Histograma, PrecisionSalida, TablaComparacion, Tornado } from './Resultados.tsx';
import { Abanico, CajasSalidas, CurvasSuperpuestas, TornadoCambio } from './Graficos.tsx';
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

      {datos.registroRiesgos && datos.registroRiesgos.length > 0 && <RegistroImpreso filas={datos.registroRiesgos} />}

      {datos.salidas.map((s, i) => <SalidaImpresa key={s.id} salida={s} referencia={datos.referencia} primera={i === 0} />)}

      {datos.salidas.filter((s) => s.resumen.n > 0 && !s.categorias?.length).length >= 2 && (
        <section className="salida-informe">
          <h2>Comparar salidas</h2>
          <div className="dos-columnas graficos-informe">
            <div><h3>Caja y bigotes</h3><CajasSalidas salidas={datos.salidas} /></div>
            <div><h3>Curvas acumuladas</h3><CurvasSuperpuestas salidas={datos.salidas} /></div>
          </div>
          {datos.salidas.filter((s) => s.resumen.n > 0 && !s.categorias?.length).length >= 3 && (
            <div><h3>Abanico</h3><Abanico salidas={datos.salidas} /></div>
          )}
        </section>
      )}

      <footer className="tenue pie-informe">
        Percentiles aproximados (t-digest). Sensibilidad por correlación de rangos y regresión sobre las primeras
        iteraciones. Generado por Riesgo Monte Carlo; todo el cálculo se hizo en el equipo del usuario.
      </footer>
    </main>
  );
}

/** El registro de riesgos (T8), como en el panel: de más a menos esperado. */
function RegistroImpreso({ filas }: { filas: NonNullable<DatosInforme['registroRiesgos']> }) {
  const total = filas.reduce((t, f) => t + (f.valorEsperado ?? 0), 0);
  const pct = (x: number) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
  return (
    <section>
      <h2>Registro de riesgos</h2>
      <table className="comparacion tabla-informe">
        <thead><tr><th>Riesgo</th><th>Celda</th><th>Impacto</th><th>Probabilidad</th><th>Esperado</th><th>Del total</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.celda}>
              <th scope="row">{f.nombre}</th><td>{f.celda}</td><td>{f.impacto}</td>
              <td>{f.probabilidad === null ? 'variable' : pct(f.probabilidad)}</td>
              <td>{f.valorEsperado === null ? '—' : numero(f.valorEsperado)}</td>
              <td>{f.valorEsperado !== null && total !== 0 ? pct(f.valorEsperado / total) : ''}</td>
            </tr>
          ))}
          <tr><th scope="row">Total</th><td /><td /><td /><td>{numero(total)}</td><td /></tr>
        </tbody>
      </table>
      <p className="tenue">
        Esperado: probabilidad × impacto medio, lo que aporta cada riesgo de media (ocurra o no). Lo que pesa cada uno
        en una salida, en su gráfico «Qué la mueve más».
      </p>
    </section>
  );
}

function SalidaImpresa({ salida: s, referencia, primera }: { salida: SalidaInforme; referencia?: string; primera: boolean }) {
  if (esSalidaDeTexto(s)) {
    // Salida de texto o de sí/no (T2): frecuencias, qué la decide y cruce.
    const objetivo = s.categorias?.[0]?.valor;
    const decisivas = s.decisivas?.[0]?.filas.filter((f) => f.rango > 0) ?? [];
    return (
      <section className={primera ? 'salida-informe primera' : 'salida-informe'}>
        <h2>{s.nombre} <span className="tenue">({s.ref})</span></h2>
        {s.lectura && s.lectura.length > 0 && <p className="lectura">{s.lectura.join(' ')}</p>}
        <table className="comparacion tabla-informe">
          <thead><tr><th>Valor</th><th>Iteraciones</th><th>Probabilidad</th></tr></thead>
          <tbody>
            {(s.categorias ?? []).map((c) => (
              <tr key={c.valor}><td>{c.valor}</td><td>{miles(c.conteo)}</td><td>{porcentajeTexto(c.proporcion)}</td></tr>
            ))}
          </tbody>
        </table>
        {s.comparacion && referencia && <TablaComparacion etiqueta={referencia} filas={s.comparacion} />}
        {decisivas.length > 0 && objetivo && (
          <>
            <h3>Qué decide que salga «{s.decisivas?.[0]?.valor}»</h3>
            <table className="comparacion tabla-informe">
              <thead><tr><th>Entrada</th><th>10 % más bajo</th><th>10 % más alto</th></tr></thead>
              <tbody>{decisivas.map((f) => <tr key={f.id}><td>{f.nombre}</td><td>{porcentajeTexto(f.bajo)}</td><td>{porcentajeTexto(f.alto)}</td></tr>)}</tbody>
            </table>
          </>
        )}
        {s.porCategoria?.map((b) => (
          <div key={b.id}>
            <h3>Según {b.nombre}</h3>
            <table className="comparacion tabla-informe">
              <thead><tr><th>{b.nombre}</th><th>Veces</th><th>Sale más</th><th>Prob.</th></tr></thead>
              <tbody>{b.filas.map((f) => <tr key={f.categoria}><td>{f.categoria}</td><td>{porcentajeTexto(f.proporcion)}</td><td>{f.masFrecuente ?? ''}</td><td>{f.probabilidad === undefined ? '' : porcentajeTexto(f.probabilidad)}</td></tr>)}</tbody>
            </table>
          </div>
        ))}
      </section>
    );
  }
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
          <dt>Media</dt><dd>{formatoDe(s.fecha).valor(s.resumen.media)}</dd>
          <dt>Desviación</dt><dd>{formatoDe(s.fecha).dispersion(s.resumen.desviacion)}</dd>
          <dt>Mínimo</dt><dd>{formatoDe(s.fecha).valor(s.resumen.min)}</dd>
          <dt>Máximo</dt><dd>{formatoDe(s.fecha).valor(s.resumen.max)}</dd>
          {s.noNumericas > 0 && (<><dt>Sin valor</dt><dd>{miles(s.noNumericas)} iteraciones</dd></>)}
        </dl>
        <dl className="datos">
          {Object.entries(s.resumen.percentiles).map(([k, v]) => (
            <Fragment key={k}><dt>{k}</dt><dd>{formatoDe(s.fecha).valor(v)}</dd></Fragment>
          ))}
        </dl>
      </div>

      {s.precision && <PrecisionSalida precision={s.precision} n={s.resumen.n} formato={formatoDe(s.fecha)} />}

      {s.riesgo && <MedidasDeRiesgo riesgo={s.riesgo} formato={formatoDe(s.fecha)} />}

      {s.comparacion && referencia && <TablaComparacion etiqueta={referencia} filas={s.comparacion} />}

      <div className="dos-columnas graficos-informe">
        {s.histograma && s.histograma.length > 0 && (
          <div><h3>Histograma</h3><Histograma
            barras={s.histograma}
            marcas={{
              media: s.resumen.media,
              ...(s.resumen.percentiles.p50 !== undefined ? { mediana: s.resumen.percentiles.p50 } : {}),
              ...(s.resumen.percentiles.p5 !== undefined && s.resumen.percentiles.p95 !== undefined
                ? { fijos: { desde: s.resumen.percentiles.p5, hasta: s.resumen.percentiles.p95, pDebajo: 0.05, pEntre: 0.9, pEncima: 0.05 } }
                : {}),
            }}
            formato={formatoDe(s.fecha)}
          /></div>
        )}
        <div>
          <h3>Probabilidad acumulada</h3>
          <CurvaAcumulada puntos={s.cdf} referencia={s.cdfReferencia} etiquetaReferencia={referencia} formato={formatoDe(s.fecha)} />
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

      {s.arana && s.arana.length > 0 && (
        <div className="graficos-informe">
          <h3>Cuánto mueve cada entrada</h3>
          <TornadoCambio curvas={s.arana} media={s.resumen.media} formato={formatoDe(s.fecha)} />
        </div>
      )}

      {s.colas?.map((c) => (
        <div key={c.cola}>
          <h3>Qué tiene que pasar para quedar en su 10 % {c.cola === 'baja' ? 'más bajo' : 'más alto'}</h3>
          <table className="comparacion tabla-informe">
            <thead><tr><th>Entrada</th><th>En esos casos</th><th>Normalmente</th><th>Desplazamiento</th></tr></thead>
            <tbody>{c.filas.slice(0, 5).map((f) => (
              <tr key={f.id}>
                <td>{f.nombre}</td>
                <td>{f.categoria !== undefined ? `«${f.categoria}» ${porcentajeTexto(f.proporcionCola ?? 0)}` : numero(f.medianaCola ?? NaN)}</td>
                <td>{f.categoria !== undefined ? porcentajeTexto(f.proporcion ?? 0) : numero(f.mediana ?? NaN)}</td>
                <td>{f.desplazamiento === undefined ? '' : `${f.desplazamiento > 0 ? '+' : '−'}${Math.abs(f.desplazamiento).toLocaleString('es-ES', { maximumFractionDigits: 2 })} σ`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {s.porCategoria?.map((b) => (
        <div key={b.id}>
          <h3>Según {b.nombre}</h3>
          <table className="comparacion tabla-informe">
            <thead><tr><th>{b.nombre}</th><th>Veces</th><th>Media</th><th>p5</th><th>p95</th></tr></thead>
            <tbody>{b.filas.map((f) => <tr key={f.categoria}><td>{f.categoria}</td><td>{porcentajeTexto(f.proporcion)}</td><td>{f.media === undefined ? '' : numero(f.media)}</td><td>{f.p5 === undefined ? '' : numero(f.p5)}</td><td>{f.p95 === undefined ? '' : numero(f.p95)}</td></tr>)}</tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

function porcentajeTexto(p: number): string {
  return `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><Informe /></StrictMode>);
