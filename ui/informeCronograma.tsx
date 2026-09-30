/**
 * El informe PDF del cronograma (V3): las secciones, en el orden y con la
 * visibilidad de la plantilla. Los datos llegan ya resumidos
 * (`excel/informeCronograma.ts`).
 */

import { Fragment, type ReactNode } from 'react';

import type { DatosInformeCronograma } from '../excel/informeCronograma.ts';
import type { IdSeccionCronograma } from '../excel/plantillaInforme.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';
import { textoMoneda } from '../engine/modelo/moneda.ts';
import { COLORES_ZONA, colorDe } from '../engine/cronograma/registro.ts';
import { CurvaS, GanttImpreso, HistogramaFechas, MatrizConsolidada, NubeCostoPlazo, TendenciaPlazo } from './graficosCronograma.tsx';
import { miles } from './formato.ts';
import { textosInforme as T } from './textos/es.ts';

const COLOR_SEMAFORO = { verde: '#2e9e5b', amarillo: '#d9a400', rojo: '#e34948', info: '#8a8f98' } as const;
const pct = (x: number) => `${Math.round(x * 100)} %`;

function Punto({ estado }: { estado: keyof typeof COLOR_SEMAFORO }) {
  return <span className="punto-semaforo" aria-label={estado} style={{ background: COLOR_SEMAFORO[estado] }} />;
}

export function SeccionesCronograma({ datos: d }: { datos: DatosInformeCronograma }) {
  const s = d.simulacion;
  const piezas: Partial<Record<IdSeccionCronograma, ReactNode>> = {
    resumen: (
      <section>
        <h2>Resumen ejecutivo</h2>
        <div className="cifras-informe">
          <div><strong>{textoFecha(d.determinista.fin)}</strong><span>{T.finCronograma}</span></div>
          <div><strong>{miles(d.determinista.dias)}</strong><span>{d.determinista.unidad === 'naturales' ? T.diasNaturales : T.dias}</span></div>
          <div><strong>{d.determinista.criticas} / {d.determinista.total}</strong><span>{T.criticas}</span></div>
          {s && <div><strong>{textoFecha(s.fechas.p50)}</strong><span>P50</span></div>}
          {s && <div><strong>{textoFecha(s.fechas.p80)}</strong><span>P80</span></div>}
          {s && <div><strong>{textoFecha(s.fechas.p90)}</strong><span>P90</span></div>}
          {s && <div><strong>{pct(s.probDeterminista)}</strong><span>{T.probCumplir}</span></div>}
          {s?.costos && <div><strong>{textoMoneda(s.costos.p80)}</strong><span>{T.costoP80}</span></div>}
          {s?.costos && <div><strong>{pct(s.costos.jclP80)}</strong><span>{T.jclP80}</span></div>}
        </div>
        {s ? s.narrativa.map((l) => <p key={l} className="lectura">{l}</p>) : <p className="lectura">{T.sinSimular}</p>}
        {s?.cancelada && <p className="lectura">{T.cancelada}</p>}
        <p className="tenue">{T.rutaCritica}: {d.determinista.rutaCritica.slice(0, 40).join(' → ')}{d.determinista.rutaCritica.length > 40 ? ' → …' : ''}</p>
      </section>
    ),
    fechas: s && (
      <section className="grafico-informe">
        <h2>Fechas de fin</h2>
        <div className="dos-columnas graficos-informe">
          <CurvaS curva={s.curvaS} titulo={T.curvaS} />
          <HistogramaFechas histograma={s.histograma} diaCronograma={s.diaCronograma} diaP80={s.dias.p80 - 1} titulo={T.histograma} marcaCronograma={T.marcaCronograma} />
        </div>
      </section>
    ),
    gantt: (
      <section className="gantt-informe">
        <h2>Gantt{s ? ' probabilístico' : ''}</h2>
        <GanttImpreso vista={d.gantt} />
        <p className="tenue nota-informe">{T.ganttLeyenda}</p>
        {d.gantt.truncado && <p className="tenue nota-informe">{T.ganttTruncado(d.gantt.barras.length, d.determinista.total)}</p>}
      </section>
    ),
    riesgos: s && s.riesgos.length > 0 && (
      <section>
        <h2>Riesgos de plazo</h2>
        <table className="comparacion tabla-informe">
          <thead><tr><th>{T.riesgoCol}</th><th>{T.probCol}</th><th>{T.ocurrioCol}</th><th>{T.diasP80Col}</th>{s.costos && <th>{T.costoP80Col}</th>}</tr></thead>
          <tbody>
            {s.riesgos.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.nombre}</th><td>{pct(r.probabilidad)}</td><td>{Number.isFinite(r.ocurrio) ? pct(r.ocurrio) : '—'}</td>
                <td>{r.diasP80 > 0 ? `+${r.diasP80}` : r.diasP80}</td>
                {s.costos && <td>{textoMoneda(r.costoP80 ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tenue nota-informe">{T.riesgosNota}</p>
      </section>
    ),
    registro: d.registro && (
      <section>
        <h2>Registro y matriz de riesgos</h2>
        <MatrizConsolidada amenazas={d.registro.matriz} oportunidades={d.registro.matrizOportunidades ?? []} textos={T.matrices} />
        <p className="tenue nota-informe">{T.matrizNota}</p>
        {d.registro.vencidas > 0 && <p className="lectura">{T.vencidas(d.registro.vencidas)}</p>}
        <table className="comparacion tabla-informe">
          <thead><tr><th>ID</th><th>{T.riesgoCol}</th><th>{T.estadoCol}</th><th>{T.responsableCol}</th><th>{T.revisionCol}</th><th>P × I</th><th>{T.respuestaCol}</th></tr></thead>
          <tbody>
            {d.registro.filas.map((f) => (
              <tr key={f.id} style={f.estado === 'cerrado' ? { opacity: 0.55 } : undefined}>
                <td>{f.id}</td><th scope="row">{f.nombre}</th><td>{T.estados[f.estado]}</td><td>{f.responsable ?? ''}</td>
                <td style={f.vencida ? { color: COLORES_ZONA.roja, fontWeight: 600 } : undefined}>{f.revision !== undefined ? textoFecha(f.revision) : ''}</td>
                <td><span className="punto-semaforo" style={{ background: colorDe(f.clase ?? 'amenaza', f.puntaje) }} />{f.puntaje}{f.clase === 'oportunidad' ? ` · ${T.oportunidad}` : ''}</td>
                <td>{f.respuesta ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ),
    mitigacion: d.mitigacion && (
      <section>
        <h2>Mitigación: antes y después</h2>
        {d.mitigacion.narrativa.map((l) => <p key={l} className="lectura">{l}</p>)}
        <table className="comparacion tabla-informe">
          <thead><tr><th /><th>{T.escenarios.antes}</th><th>{T.escenarios.despues}</th></tr></thead>
          <tbody>
            <tr><th scope="row">P80</th><td>{textoFecha(d.mitigacion.antes.p80)}</td><td>{textoFecha(d.mitigacion.despues.p80)}</td></tr>
            {d.mitigacion.antes.costoP80 !== undefined && d.mitigacion.despues.costoP80 !== undefined && (
              <tr><th scope="row">{T.costoP80}</th><td>{textoMoneda(d.mitigacion.antes.costoP80)}</td><td>{textoMoneda(d.mitigacion.despues.costoP80)}</td></tr>
            )}
            <tr><th scope="row">{T.costoRespuestas}</th><td /><td>{textoMoneda(d.mitigacion.costoRespuestas)}</td></tr>
          </tbody>
        </table>
        {d.mitigacion.porRespuesta.length > 0 && (
          <table className="comparacion tabla-informe">
            <thead><tr><th>{T.respuestaCol}</th><th>{T.responsableCol}</th><th>{T.costoCol}</th><th>{T.adelantaCol}</th><th>{T.retornoCol}</th></tr></thead>
            <tbody>
              {d.mitigacion.porRespuesta.map((x) => (
                <tr key={x.id}>
                  <th scope="row">{x.respuesta || x.nombre}</th><td>{x.responsable ?? ''}</td><td>{textoMoneda(x.costoRespuesta)}</td>
                  <td>{x.diasP80 > 0 ? `${x.diasP80} d` : '0'}</td>
                  <td>{x.retorno === undefined ? '—' : `${x.retorno.toFixed(2).replace('.', ',')} ×`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    ),
    seguimiento: d.seguimiento && (
      <section>
        <h2>Seguimiento en el tiempo</h2>
        {d.seguimiento.tendencia.map((l) => <p key={l} className="lectura">{l}</p>)}
        <TendenciaPlazo puntos={d.seguimiento.instantaneas} titulo={T.tendencia} nombres={{ cronograma: T.serieCronograma, p50: 'P50', p80: 'P80' }} />
        <table className="comparacion tabla-informe">
          <thead><tr><th>{T.referenciaCol}</th><th>{T.finCronograma}</th><th>P50</th><th>P80</th><th>{T.probCumplir}</th>{d.seguimiento.instantaneas.some((x) => x.costoP80 !== undefined) && <th>{T.costoP80}</th>}<th>{T.notaCol}</th></tr></thead>
          <tbody>
            {d.seguimiento.instantaneas.map((x) => (
              <tr key={`${x.referencia}-${x.guardada}`}>
                <td>{textoFecha(x.referencia)}</td><td>{textoFecha(x.finCronograma)}</td><td>{textoFecha(x.p50)}</td><td>{textoFecha(x.p80)}</td>
                <td>{Number.isFinite(x.probCumplir) ? pct(x.probCumplir) : ''}</td>
                {d.seguimiento!.instantaneas.some((y) => y.costoP80 !== undefined) && <td>{x.costoP80 === undefined ? '' : textoMoneda(x.costoP80)}</td>}
                <td>{x.nota ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    ),
    costos: s?.costos && (
      <section>
        <h2>Costo y plazo (JCL)</h2>
        <div className="dos-columnas">
          <dl className="datos">
            <dt>{T.costoPlan}</dt><dd>{textoMoneda(s.costos.determinista)}</dd>
            <dt>{T.costoMedio}</dt><dd>{textoMoneda(s.costos.media)}</dd>
            <dt>{T.costoP50}</dt><dd>{textoMoneda(s.costos.p50)}</dd>
            <dt>{T.costoP80}</dt><dd>{textoMoneda(s.costos.p80)}</dd>
            {s.costos.rangos && (<><dt>{T.p80SinRangos}</dt><dd>{textoMoneda(s.costos.rangos.p80SinRangos)}</dd></>)}
            <dt>{T.jclP80}</dt><dd>{pct(s.costos.jclP80)}</dd>
            <dt>{T.jclPlan}</dt><dd>{pct(s.costos.jclPlan)}</dd>
            {s.costos.conjunto80 && (<><dt>{T.conjunto80}</dt><dd>{textoFecha(s.costos.conjunto80.fecha)} · {textoMoneda(s.costos.conjunto80.costo)}</dd></>)}
          </dl>
          <NubeCostoPlazo puntos={s.costos.nube} p80Dias={s.dias.p80} p80Costo={s.costos.p80} fechaMin={s.costos.nubeDesde} fechaMax={s.costos.nubeHasta} titulo={T.nube} />
        </div>
      </section>
    ),
    salud: d.salud && (
      <section>
        <h2>Salud del cronograma</h2>
        <p><Punto estado={d.salud.estado} />{T.saludEstado[d.salud.estado]}</p>
        <table className="comparacion tabla-informe">
          <tbody>
            {d.salud.comprobaciones.map((c) => (
              <tr key={c.codigo}><td><Punto estado={c.estado} /></td><th scope="row">{c.titulo}</th><td>{c.detalle}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    ),
    actividades: s && s.actividades.length > 0 && (
      <section>
        <h2>Actividades más críticas</h2>
        <table className="comparacion tabla-informe">
          <thead><tr><th>ID</th><th>{T.actividadCol}</th><th>{T.criticidadCol}</th><th>{T.finP50Col}</th><th>{T.finP80Col}</th></tr></thead>
          <tbody>
            {s.actividades.map((a) => (
              <tr key={a.id}><td>{a.id}</td><th scope="row">{a.nombre}</th><td>{pct(a.criticidad)}</td><td>{textoFecha(a.finP50)}</td><td>{textoFecha(a.finP80)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    ),
    ajustes: (
      <section>
        <h2>Cómo se calculó</h2>
        <dl className="datos">
          {d.determinista.fechaCorte !== undefined && (<><dt>{T.fechaCorte}</dt><dd>{textoFecha(d.determinista.fechaCorte)}</dd></>)}
          {s && (
            <>
              <dt>{T.escenario}</dt><dd>{T.escenarios[s.escenario]}</dd>
              <dt>{T.iteraciones}</dt><dd>{miles(s.iteraciones)}</dd>
              <dt>{T.forma}</dt><dd>{s.forma}</dd>
              <dt>{T.semilla}</dt><dd>{s.semilla}</dd>
              <dt>{T.hilos}</dt><dd>{s.hilos}</dd>
            </>
          )}
        </dl>
      </section>
    ),
  };
  return (
    <>
      {d.plantilla.seccionesCronograma.filter((x) => x.visible && piezas[x.id]).map((x) => <Fragment key={x.id}>{piezas[x.id]}</Fragment>)}
    </>
  );
}
