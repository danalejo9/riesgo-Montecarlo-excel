/**
 * El resumen ejecutivo del cronograma (QRSA, Q3.7): supuestos, advertencias
 * de calidad, fin y costo con sus percentiles, JCL, pre/post mitigación y el
 * top 10 de riesgos y de actividades críticas, maquetado para una hoja A4.
 * «Imprimir → Guardar como PDF» hace el resto.
 */
import { Fragment, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { decodificarInformeCronograma, type DatosInformeCronograma } from '../excel/informeCronograma.ts';
import { formatoDe, numero } from './formato.ts';
import { CurvaAcumulada, type LineaReferencia } from './Resultados.tsx';
import { GanttInforme } from './gantt/GanttInforme.tsx';
import './estilos.css';
import './informe.css';

const FECHA = formatoDe(true);
const pct = (x: number) => `${numero(100 * x, 3)} %`;

function Informe() {
  const [d, setD] = useState<DatosInformeCronograma | null | 'cargando'>('cargando');
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.hash.slice(1)).get('d');
    if (!codigo) { setD(null); return; }
    void decodificarInformeCronograma(codigo).then(setD);
  }, []);
  if (d === 'cargando') return <p className="tenue">Preparando el informe…</p>;
  if (!d) return <main className="informe"><h1>No hay informe que enseñar</h1><p>Se abre desde la pestaña Cronograma del complemento, después de simular.</p></main>;
  const dinero = (x: number) => `${Math.round(x).toLocaleString('es-CO')}${d.moneda ? ` ${d.moneda}` : ''}`;
  const p = (q: number) => d.fin.percentiles.find((x) => Math.abs(x.p - q) < 1e-9);
  return (
    <main className="informe">
      <div className="solo-pantalla barra-informe">
        <button type="button" className="principal" onClick={() => window.print()}>Imprimir o guardar como PDF</button>
        <span className="tenue">En el cuadro de impresión, elige «Guardar como PDF» como impresora.</span>
      </div>
      <header className="portada">
        <h1>Análisis de riesgo del cronograma</h1>
        <p className="tenue">{new Date(d.generado).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}</p>
        <p className="descripcion-proyecto">
          Con las duraciones base, el proyecto termina el <strong>{FECHA.valor(d.fin.deterministica)}</strong>: esa fecha se cumple
          en el <strong>{pct(d.fin.probabilidadDeterministica)}</strong> de las iteraciones. Con un 80 % de confianza termina el
          <strong> {FECHA.valor(p(0.8)?.serie ?? NaN)}</strong>
          {d.costo ? <> y cuesta <strong>{dinero(d.costo.percentiles.find((x) => x.p === 0.8)?.valor ?? NaN)}</strong> (contingencia de {dinero(d.costo.contingencia)} sobre el costo base)</> : null}.
        </p>
      </header>

      {d.enPalabras && d.enPalabras.length > 0 && (
        <section>
          <h2>En pocas palabras</h2>
          {d.enPalabras.map((t) => <p key={t}>{t}</p>)}
        </section>
      )}

      <section>
        <h2>Supuestos</h2>
        <dl className="datos">{d.supuestos.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
      </section>

      {d.advertencias.length > 0 && (
        <section>
          <h2>Advertencias de calidad del cronograma</h2>
          <ul className="semaforos">
            {d.advertencias.map((a) => (
              <li key={a.criterio}><span className={`luz luz-${a.estado}`} /><div><strong>{a.criterio}</strong><div className="tenue">{a.detalle}</div></div></li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Fecha de fin</h2>
        <div className="dos-columnas">
          <table className="comparacion tabla-informe">
            <tbody>
              <tr><th scope="row">Fecha determinística</th><td>{FECHA.valor(d.fin.deterministica)} ({pct(d.fin.probabilidadDeterministica)})</td></tr>
              {d.fin.fechaMeta !== null && d.fin.probabilidadMeta !== null && <tr><th scope="row">Fecha meta</th><td>{FECHA.valor(d.fin.fechaMeta)} ({pct(d.fin.probabilidadMeta)})</td></tr>}
              <tr><th scope="row">Media</th><td>{numero(d.fin.media, 4)} días ± {numero(d.fin.desviacion, 3)}</td></tr>
              {d.fin.percentiles.map((x) => <tr key={x.p}><th scope="row">P{Math.round(x.p * 100)}</th><td>{FECHA.valor(x.serie)} · {numero(x.dias, 4)} días</td></tr>)}
            </tbody>
          </table>
          <CurvaAcumulada
            puntos={d.fin.curvaS.map(([x, q]) => ({ x, p: q }))}
            {...(d.fin.curvaSPost ? { referencia: d.fin.curvaSPost.map(([x, q]) => ({ x, p: q })), etiquetaReferencia: 'Post mitigación' } : {})}
            formato={FECHA}
            lineas={[
              ...(d.fin.fechaMeta !== null ? [{ x: d.fin.fechaMeta, etiqueta: `Meta ${FECHA.valor(d.fin.fechaMeta)}`, tipo: 'meta' } as LineaReferencia] : []),
              ...(p(0.8) ? [{ x: (p(0.8) as { serie: number }).serie, etiqueta: 'P80', tipo: 'percentil' } as LineaReferencia] : []),
            ]}
          />
        </div>
      </section>

      {d.contractuales && d.contractuales.length > 0 && (
        <section>
          <h2>Hitos contractuales</h2>
          <table className="comparacion tabla-informe">
            <thead><tr><th>Hito</th><th>Fecha del contrato</th><th>Probabilidad de cumplir</th><th>Fin P80</th><th>Multa esperada</th></tr></thead>
            <tbody>
              {d.contractuales.map((h) => (
                <tr key={h.id}>
                  <th scope="row">{h.id} · {h.nombre}</th>
                  <td>{FECHA.valor(h.fecha)}</td>
                  <td>{pct(h.probabilidadCumplir)}</td>
                  <td>{FECHA.valor(h.p80)}{h.retrasoP80 > 0 ? ` (+${h.retrasoP80} días)` : ''}</td>
                  <td>{h.multaMedia === null ? '—' : dinero(h.multaMedia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {d.gantt && (
        <section className="salto-antes">
          <h2>Cronograma y fechas de fin posibles</h2>
          <GanttInforme datos={d.gantt} />
        </section>
      )}

      {d.costo && (
        <section>
          <h2>Costo</h2>
          <div className="dos-columnas">
            <table className="comparacion tabla-informe">
              <tbody>
                <tr><th scope="row">Costo base</th><td>{dinero(d.costo.base)} ({pct(d.costo.probabilidadBase)} de no pasarse)</td></tr>
                <tr><th scope="row">Contingencia (P{Math.round(d.costo.pContingencia * 100)} − base)</th><td>{dinero(d.costo.contingencia)}</td></tr>
                {d.costo.costoMeta !== null && d.costo.probabilidadMeta !== null && <tr><th scope="row">Costo meta</th><td>{dinero(d.costo.costoMeta)} ({pct(d.costo.probabilidadMeta)})</td></tr>}
                {d.jcl && <tr><th scope="row">JCL: cumplir fecha y costo meta</th><td><strong>{pct(d.jcl.jcl)}</strong></td></tr>}
                {d.costo.percentiles.filter((x) => [0.1, 0.5, 0.8, 0.9].includes(x.p)).map((x) => <tr key={x.p}><th scope="row">P{Math.round(x.p * 100)}</th><td>{dinero(x.valor)}</td></tr>)}
              </tbody>
            </table>
            <CurvaAcumulada puntos={d.costo.curvaS.map(([x, q]) => ({ x, p: q }))} />
          </div>
        </section>
      )}

      {d.prePost.length > 0 && (
        <section>
          <h2>Antes y después de mitigar</h2>
          <table className="comparacion tabla-informe">
            <thead><tr><th>Medida</th><th>Pre</th><th>Post</th><th>Gana la mitigación</th></tr></thead>
            <tbody>
              {d.prePost.map((r) => {
                const f = (x: number) => (r.unidad === 'fecha' ? FECHA.valor(x) : r.unidad === 'costo' ? dinero(x) : r.unidad === 'probabilidad' ? pct(x) : numero(x, 4));
                return <tr key={r.medida}><th scope="row">{r.medida}</th><td>{f(r.pre)}</td><td>{f(r.post)}</td><td>{r.unidad === 'fecha' ? `${numero(r.diferencia, 3)} días` : r.unidad === 'costo' ? dinero(r.diferencia) : r.unidad === 'probabilidad' ? pct(r.diferencia) : numero(r.diferencia, 3)}</td></tr>;
              })}
            </tbody>
          </table>
        </section>
      )}

      {d.reserva && d.reserva.partes.length > 1 && (
        <section>
          <h2>Reserva de contingencia al P{Math.round(d.reserva.nivel * 100)} y de dónde sale</h2>
          <p>
            Sobre el plan ({FECHA.valor(d.reserva.plan.fecha)}{d.reserva.plan.costo !== null ? `, ${dinero(d.reserva.plan.costo)}` : ''}) hay que reservar
            <strong> {numero(d.reserva.dias, 4)} días laborables</strong>{d.reserva.costo !== null ? <> y <strong>{dinero(d.reserva.costo)}</strong></> : null}.
          </p>
          <table className="comparacion tabla-informe">
            <thead><tr><th>Parte</th><th>Días</th>{d.reserva.costo !== null && <th>Costo</th>}</tr></thead>
            <tbody>
              {d.reserva.partes.map((x) => (
                <tr key={x.id}><th scope="row">{x.tipo === 'amenaza' || x.tipo === 'oportunidad' ? `${x.id} · ${x.nombre}` : x.nombre}</th><td>{numero(x.dias, 3)}</td>{d.reserva?.costo !== null && <td>{x.costo === null ? '—' : dinero(x.costo)}</td>}</tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {d.riesgos.length > 0 && (
        <section>
          <h2>Los riesgos que más pesan (eliminación)</h2>
          <table className="comparacion tabla-informe">
            <thead><tr><th>Riesgo</th><th>Ocurrió</th><th>Baja el P80 (días)</th>{d.costo && <th>Baja el costo P{Math.round(d.costo.pContingencia * 100)}</th>}</tr></thead>
            <tbody>{d.riesgos.map((r) => <tr key={r.id}><th scope="row">{r.id} · {r.nombre}</th><td>{pct(r.ocurrencia)}</td><td>{numero(r.reduccionP80, 3)}</td>{d.costo && <td>{r.reduccionP80Costo === null ? '—' : dinero(r.reduccionP80Costo)}</td>}</tr>)}</tbody>
          </table>
        </section>
      )}

      <section>
        <h2>Actividades más críticas</h2>
        <table className="comparacion tabla-informe">
          <thead><tr><th>Actividad</th><th>Criticidad</th><th>SSI</th></tr></thead>
          <tbody>{d.criticas.map((x) => <tr key={x.id}><th scope="row">{x.id} · {x.nombre}</th><td>{pct(x.criticidad)}</td><td>{numero(x.ssi, 2)}</td></tr>)}</tbody>
        </table>
        {d.rutas.length > 0 && (
          <>
            <h3>Rutas críticas más frecuentes</h3>
            <ol>{d.rutas.map((r, i) => <li key={i}>{pct(r.proporcion)}: {r.actividades.join(' → ')}</li>)}</ol>
          </>
        )}
      </section>

      {d.convergencias && d.convergencias.length > 0 && (
        <section>
          <h2>Sesgo de convergencia</h2>
          <p className="tenue">Donde se juntan varias rutas, la actividad solo empieza a tiempo si llegan todas.</p>
          <table className="comparacion tabla-informe">
            <thead><tr><th>Actividad</th><th>Ruta</th><th>Llega a tiempo</th></tr></thead>
            <tbody>
              {d.convergencias.map((c) => (
                <Fragment key={c.id}>
                  {c.ramas.map((r) => <tr key={r.id}><th scope="row">{c.id} · {c.nombre}</th><td>{r.id} · {r.nombre}</td><td>{pct(r.probATiempo)}</td></tr>)}
                  <tr><th scope="row">{c.id} · {c.nombre}</th><td><strong>Empieza a tiempo ({FECHA.valor(c.inicioPlan)})</strong></td><td><strong>{pct(c.probATiempo)}</strong> (independientes: {pct(c.probProducto)})</td></tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {d.avisos.length > 0 && <section><h2>Avisos de la simulación</h2><ul>{d.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></section>}

      <footer className="tenue pie-informe">
        Ruta crítica recalculada en cada iteración (sesgo de convergencia incluido); tornado por eliminación con los mismos números
        aleatorios. Generado por Riesgo Monte Carlo {d.complemento}; todo el cálculo se hizo en el equipo del usuario.
      </footer>
    </main>
  );
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><Informe /></StrictMode>);
