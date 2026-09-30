/**
 * Pestaña «Cronograma» (bloque P): plantilla, camino crítico determinista
 * (P1), chequeo de salud con semáforo (P2) y Monte Carlo del plazo con los
 * riesgos de plazo (P3). Todo el cálculo está en `engine/cronograma/`; aquí
 * solo se lee el libro, se enseña y se escribe.
 */

import { useRef, useState } from 'react';

import {
  calcularCPM, hojaGantt, hojaPlazoSimulado, importarCronograma, verificarContraFuente,
  type CronogramaImportado, type Verificacion, hojaSimulacionPlazo, vistaGantt, impactoDeRiesgos, leerCronograma, leerRiesgosPlazo, narrativaPlazo, revisarSalud,
  simularPlazo, simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO,
  type Cronograma as ModeloCronograma, type FormaDuracion, type ImpactoRiesgo, type InformeSalud, type ProblemaCronograma,
  type ResultadoCPM, type ResultadoSimulacionPlazo, type RiesgoPlazo, type Semaforo,
} from '../engine/cronograma/index.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';
import { textoMoneda } from '../engine/modelo/moneda.ts';
import { tieneCapacidad } from '../engine/licencia/capacidades.ts';
import { escribirCronogramaImportado, escribirHojaGantt, escribirHojaSimulacion, escribirPlantillaCronograma, escribirResultadoCPM, leerHojasCronograma } from '../excel/cronograma.ts';
import { codificarJson } from '../excel/codificacion.ts';
import { abrirVentana, ventanaAbierta } from '../excel/ventana.ts';
import { Plegable } from './Plegable.tsx';
import { crearHilosPlazo } from './motor/plazoNavegador.ts';
import { hilosEfectivos, leerPreferenciaHilos } from './motor/preferencias.ts';
import { textosCronograma as T } from './textos/es.ts';

type Calculado = Extract<ResultadoCPM, { ok: true }> & { hoja: string };
interface Simulado {
  r: ResultadoSimulacionPlazo;
  impacto?: { porRiesgo: ImpactoRiesgo[]; sinRiesgos: { p80: number; diasP80: number } };
  narrativa: string[];
  hoja: string;
  hilos: number;
}

const ITERACIONES = [1000, 5000, 10_000, 50_000];
const PAGINA_GANTT = 'gantt.html';
/** Caracteres de la vista codificada que se meten en la URL de la ventana; más, por mensaje. */
const LIMITE_URL = 24_000;
const ceder = () => new Promise<void>((r) => setTimeout(r, 0));

export function Cronograma({ alFallar }: { alFallar: (e: unknown) => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<ProblemaCronograma[]>([]);
  const [resultado, setResultado] = useState<Calculado | null>(null);
  const [salud, setSalud] = useState<InformeSalud | null>(null);
  const [datos, setDatos] = useState<{ cron: ModeloCronograma; riesgos: RiesgoPlazo[] } | null>(null);
  const [simulado, setSimulado] = useState<Simulado | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [iteraciones, setIteraciones] = useState(OPCIONES_PLAZO_POR_DEFECTO.iteraciones);
  const [forma, setForma] = useState<FormaDuracion>(OPCIONES_PLAZO_POR_DEFECTO.forma);
  const cancelado = useRef(false);
  const [importado, setImportado] = useState<{ imp: CronogramaImportado; ver: Verificacion; confirmar: boolean } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  if (!tieneCapacidad('cronograma')) {
    return <section><p className="aviso-linea">{T.sinCapacidad}</p></section>;
  }

  const calcular = async () => {
    setOcupado(T.calculando);
    setNota(null);
    setSimulado(null);
    try {
      const hojas = await leerHojasCronograma();
      const lectura = leerCronograma(hojas.actividades, hojas.calendario);
      const cron = lectura.cronograma;
      if (!cron) {
        setProblemas(lectura.problemas);
        setResultado(null);
        setSalud(null);
        setDatos(null);
        return;
      }
      const r = calcularCPM(cron);
      if (!r.ok) {
        setProblemas([...lectura.problemas, ...r.problemas]);
        setResultado(null);
        setSalud(null);
        setDatos(null);
        return;
      }
      const riesgos = leerRiesgosPlazo(hojas.riesgos, cron.actividades);
      const hoja = await escribirResultadoCPM(r);
      const vista = vistaGantt(cron.actividades, r.filas, r.fechaFinProyecto, undefined, cron.fechaCorte);
      await escribirHojaGantt(hojaGantt(vista));
      ventanaAbierta(PAGINA_GANTT)?.enviar(vista);
      setProblemas([...lectura.problemas, ...r.avisos, ...riesgos.problemas]);
      setResultado({ ...r, hoja });
      setSalud(revisarSalud(cron.actividades, r.filas));
      setDatos(riesgos.problemas.some((p) => p.gravedad === 'error') ? null : { cron, riesgos: riesgos.riesgos });
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(null);
    }
  };

  const simular = async () => {
    if (!datos) return;
    cancelado.current = false;
    setOcupado(T.simulando(0, iteraciones));
    // P3b: tantos hilos como diga la configuración; sin Web Workers, en el hilo del panel.
    const hilos = crearHilosPlazo(hilosEfectivos(leerPreferenciaHilos()));
    try {
      const op = {
        iteraciones, forma, semilla: OPCIONES_PLAZO_POR_DEFECTO.semilla, ceder,
        debeCancelar: () => cancelado.current,
        alAvanzar: (h: number, t: number) => setOcupado(T.simulando(h, t)),
      };
      const simular: typeof simularPlazo = (c, rs, o) =>
        hilos ? simularPlazoEnParalelo(c, rs, o, hilos.para(c, rs, o), hilos.hilos) : simularPlazo(c, rs, o);
      const r = await simular(datos.cron, datos.riesgos, op);
      let impacto: Simulado['impacto'];
      if (!r.cancelada && datos.riesgos.length > 0) {
        setOcupado(T.midiendoRiesgos(0, datos.riesgos.length + 1));
        const imp = await impactoDeRiesgos(datos.cron, datos.riesgos, r, {
          ...op, alAvanzar: (h, t) => setOcupado(T.midiendoRiesgos(h, t)),
        }, simular);
        if (!cancelado.current) impacto = imp;
      }
      const narrativa = narrativaPlazo(r, impacto, salud ?? undefined);
      const hoja = await escribirHojaSimulacion(hojaSimulacionPlazo(r, impacto, narrativa), r.cancelada ? undefined : hojaPlazoSimulado(r));
      if (resultado) {
        const vista = vistaGantt(datos.cron.actividades, resultado.filas, resultado.fechaFinProyecto, r, datos.cron.fechaCorte);
        await escribirHojaGantt(hojaGantt(vista));
        ventanaAbierta(PAGINA_GANTT)?.enviar(vista);
      }
      setSimulado({ r, impacto, narrativa, hoja, hilos: hilos?.hilos ?? 1 });
    } catch (e) {
      alFallar(e);
    } finally {
      hilos?.cerrar();
      setOcupado(null);
    }
  };

  const verCronograma = async () => {
    if (!resultado || !datos) return;
    try {
      const vista = vistaGantt(datos.cron.actividades, resultado.filas, resultado.fechaFinProyecto, simulado?.r, datos.cron.fechaCorte);
      const codigo = await codificarJson(vista);
      // Si no cabe en la dirección, la ventana la pide por mensaje al abrirse.
      const ventana = await abrirVentana(PAGINA_GANTT, codigo.length <= LIMITE_URL ? codigo : '', {
        alto: 85,
        ancho: 85,
        alRecibir: (texto) => {
          if (texto.includes('"listo"')) ventana.enviar(vista);
        },
      });
    } catch (e) {
      alFallar(e);
    }
  };

  const leerArchivo = async (f: File) => {
    setNota(null);
    try {
      const imp = importarCronograma(f.name, new Uint8Array(await f.arrayBuffer()));
      setImportado({ imp, ver: verificarContraFuente(imp), confirmar: false });
    } catch (e) {
      setImportado(null);
      alFallar(e);
    } finally {
      if (archivo.current) archivo.current.value = '';
    }
  };

  const escribirImportado = async (forzar: boolean) => {
    if (!importado) return;
    try {
      if (!forzar) {
        const hojas = await leerHojasCronograma();
        const hayDatos = (hojas.actividades?.length ?? 0) > 3;
        if (hayDatos) {
          setImportado({ ...importado, confirmar: true });
          return;
        }
      }
      await escribirCronogramaImportado(importado.imp);
      setImportado(null);
      await calcular();
      setNota(T.importadoEscrito);
    } catch (e) {
      alFallar(e);
    }
  };

  const plantilla = async () => {
    try {
      setNota(T.plantillaCreada(await escribirPlantillaCronograma()));
    } catch (e) {
      alFallar(e);
    }
  };

  const errores = problemas.filter((p) => p.gravedad === 'error');
  const avisos = problemas.filter((p) => p.gravedad === 'aviso');
  const criticas = resultado?.filas.filter((f) => f.critica) ?? [];
  const simulando = ocupado !== null && ocupado !== T.calculando;

  return (
    <section>
      <h2>{T.titulo}</h2>
      <p className="tenue">{T.intro}</p>
      <p>
        <button type="button" onClick={calcular} disabled={ocupado !== null}>{ocupado === T.calculando ? T.calculando : T.calcular}</button>{' '}
        <button type="button" onClick={plantilla} title={T.plantillaAyuda} disabled={ocupado !== null}>{T.plantilla}</button>{' '}
        <button type="button" onClick={() => archivo.current?.click()} title={T.importarAyuda} disabled={ocupado !== null}>{T.importar}</button>
        <input ref={archivo} type="file" accept=".xml,.xer,.mpp" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void leerArchivo(f); }} />
      </p>
      {importado && <Importado i={importado} alEscribir={escribirImportado} alCancelar={() => setImportado(null)} />}
      {nota && <p className="aviso-ok">{nota}</p>}

      {errores.length > 0 && (
        <div className="error">
          <h3>{T.errores}</h3>
          <ul className="motivos">{errores.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
        </div>
      )}
      {avisos.length > 0 && (
        <>
          <h3>{T.avisos}</h3>
          <ul className="aviso-linea">{avisos.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
        </>
      )}

      {resultado && (
        <>
          <div className="cifras fechas">
            <div><span className="cifra">{textoFecha(resultado.fechaFinProyecto)}</span><span className="cifra-nombre">{T.finProyecto}</span></div>
            <div><span className="cifra">{resultado.duracionProyecto}</span><span className="cifra-nombre">{T.dias}</span></div>
            <div><span className="cifra">{criticas.length} / {resultado.filas.length}</span><span className="cifra-nombre">{T.criticas}</span></div>
          </div>
          <p className="tenue">{T.rutaCritica}: {criticas.map((f) => f.nombre).join(' → ')}</p>
          <p className="tenue">{T.escritoEn(resultado.hoja)}</p>
          <p>
            <button type="button" onClick={verCronograma} disabled={ocupado !== null || !datos}>{T.verCronograma}</button>{' '}
            <span className="tenue">{T.verCronogramaAyuda}</span>
          </p>
        </>
      )}

      {salud && <Salud informe={salud} />}

      {salud && (
        <>
          <h3>{T.simulacion}</h3>
          {datos && datos.riesgos.length === 0 && <p className="tenue">{T.sinRiesgos}</p>}
          <p>
            <label>{T.iteraciones}{' '}
              <select value={iteraciones} onChange={(e) => setIteraciones(Number(e.target.value))} disabled={ocupado !== null}>
                {ITERACIONES.map((n) => <option key={n} value={n}>{n.toLocaleString('es')}</option>)}
              </select>
            </label>{' '}
            <label>{T.forma}{' '}
              <select value={forma} onChange={(e) => setForma(e.target.value as FormaDuracion)} disabled={ocupado !== null}>
                <option value="pert">{T.formas.pert}</option>
                <option value="triangular">{T.formas.triangular}</option>
              </select>
            </label>
          </p>
          <p>
            <button type="button" onClick={simular} disabled={ocupado !== null || !datos || salud.bloquea}>{T.simular}</button>{' '}
            {simulando && <><span className="tenue">{ocupado}</span>{' '}<button type="button" onClick={() => (cancelado.current = true)}>{T.cancelar}</button></>}
          </p>
          {salud.bloquea && <p className="aviso-linea">{T.saludBloquea}</p>}
          {simulado && <ResultadoPlazo s={simulado} />}
        </>
      )}
    </section>
  );
}

const COLOR: Record<Semaforo, string> = { verde: '#2e9e5b', amarillo: '#d9a400', rojo: '#e34948', info: '#8a8f98' };

function Punto({ estado }: { estado: Semaforo }) {
  return <span aria-label={estado} title={estado} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: COLOR[estado], marginRight: 6, flex: 'none' }} />;
}

function Salud({ informe }: { informe: InformeSalud }) {
  return (
    <Plegable
      id="cronograma-salud"
      abierta={informe.estado !== 'verde'}
      titulo={<><Punto estado={informe.estado} />{T.salud}</>}
      resumen={T.saludResumen[informe.estado]}
    >
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {informe.comprobaciones.map((c) => (
          <li key={c.codigo} style={{ margin: '6px 0' }}>
            <details>
              <summary style={{ display: 'flex', alignItems: 'baseline', cursor: 'pointer' }}>
                <Punto estado={c.estado} /><span><strong>{c.titulo}.</strong> <span className="tenue">{c.detalle}</span></span>
              </summary>
              <p className="tenue" style={{ margin: '4px 0 0 16px' }}>{c.porque}</p>
              {c.actividades.length > 0 && c.estado !== 'verde' && (
                <p className="tenue" style={{ margin: '2px 0 0 16px' }}>{T.actividadesImplicadas}: {c.actividades.join(', ')}</p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </Plegable>
  );
}

function ResultadoPlazo({ s }: { s: Simulado }) {
  const { r, impacto } = s;
  const top = [...r.actividades].filter((a) => a.criticidad > 0).sort((a, b) => b.criticidad - a.criticidad || (b.correlacion || 0) - (a.correlacion || 0)).slice(0, 6);
  return (
    <>
      {r.cancelada && <p className="aviso-linea">{T.cancelada}</p>}
      <div className="cifras fechas">
        <div><span className="cifra">{textoFecha(r.fechas.p50)}</span><span className="cifra-nombre">P50</span></div>
        <div><span className="cifra">{textoFecha(r.fechas.p80)}</span><span className="cifra-nombre">P80</span></div>
        <div><span className="cifra">{textoFecha(r.fechas.p90)}</span><span className="cifra-nombre">P90</span></div>
        <div><span className="cifra">{Math.round(r.probDeterminista * 100)} %</span><span className="cifra-nombre">{T.probCumplir}</span></div>
      </div>
      {r.costos && (
        <div className="cifras fechas">
          <div><span className="cifra">{textoMoneda(r.costos.p50)}</span><span className="cifra-nombre">{T.costoP50}</span></div>
          <div><span className="cifra">{textoMoneda(r.costos.p80)}</span><span className="cifra-nombre">{T.costoP80}</span></div>
          <div><span className="cifra">{Math.round(r.costos.jclP80 * 100)} %</span><span className="cifra-nombre">{T.jcl}</span></div>
        </div>
      )}
      {s.narrativa.map((l) => <p key={l}>{l}</p>)}
      <Histograma r={r} />
      {r.costos && <Nube r={r} />}
      {impacto && impacto.porRiesgo.length > 0 && (
        <Plegable id="cronograma-riesgos" abierta titulo={T.riesgos}>
          <table>
            <thead><tr><th>{T.riesgoCol}</th><th>{T.probCol}</th><th>{T.diasP80}</th>{r.costos && <th>{T.costoP80Col}</th>}</tr></thead>
            <tbody>
              {impacto.porRiesgo.map((x) => (
                <tr key={x.id}>
                  <td>{x.nombre}</td><td>{Math.round(x.probabilidad * 100)} %</td><td>{x.diasP80 > 0 ? `+${x.diasP80}` : x.diasP80}</td>
                  {r.costos && <td>{textoMoneda(x.costoP80 ?? 0)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Plegable>
      )}
      <Plegable id="cronograma-criticas" titulo={T.masCriticas}>
        <table>
          <thead><tr><th>ID</th><th>{T.actividadCol}</th><th>{T.criticidadCol}</th></tr></thead>
          <tbody>
            {top.map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.nombre}</td><td>{Math.round(a.criticidad * 100)} %</td></tr>)}
          </tbody>
        </table>
      </Plegable>
      <p className="tenue">{T.escritoEn(s.hoja)} {T.calculadoCon(r.iteraciones, s.hilos)}</p>
    </>
  );
}

/** Barras por día (agrupadas si hay muchos), con el cronograma y el P80 marcados. */
function Histograma({ r }: { r: ResultadoSimulacionPlazo }) {
  const h = r.histograma;
  if (h.length === 0) return null;
  const d0 = h[0]!.dia;
  const d1 = h[h.length - 1]!.dia;
  const paso = Math.max(1, Math.ceil((d1 - d0 + 1) / 40));
  const barras = new Map<number, number>();
  for (const x of h) {
    const k = d0 + Math.floor((x.dia - d0) / paso) * paso;
    barras.set(k, (barras.get(k) ?? 0) + x.cuenta);
  }
  const max = Math.max(...barras.values());
  const n = Math.ceil((d1 - d0 + 1) / paso);
  const W = 300;
  const H = 110;
  const ancho = W / n;
  const xDia = (d: number) => ((d - d0) / paso) * ancho;
  const diaDet = Math.max(0, Math.ceil(r.determinista.dias - 1e-9) - 1);
  const diaP80 = r.dias.p80 - 1;
  return (
    <figure style={{ margin: '8px 0' }}>
      <figcaption className="tenue" style={{ fontSize: 12 }}>{T.histograma}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={T.histograma}>
        {[...barras].map(([d, c]) => (
          <rect key={d} x={xDia(d) + 0.5} y={H - (c / max) * H} width={Math.max(1, ancho - 1)} height={(c / max) * H} fill="var(--acento)" opacity={d <= diaP80 ? 0.9 : 0.45} />
        ))}
        {[{ d: diaDet, t: T.marcaCronograma }, { d: diaP80, t: 'P80' }].map(({ d, t }) => (
          d >= d0 - paso && d <= d1 + paso ? (
            <g key={t}>
              <line x1={xDia(d) + ancho / 2} x2={xDia(d) + ancho / 2} y1={0} y2={H} stroke="var(--texto, #333)" strokeDasharray="3 2" />
              <text x={Math.min(W - 40, Math.max(0, xDia(d) + ancho / 2 + 2))} y={10} fontSize="9" fill="currentColor">{t}</text>
            </g>
          ) : null
        ))}
        <text x={0} y={H + 12} fontSize="9" fill="currentColor">{textoFecha(h[0]!.fecha)}</text>
        <text x={W} y={H + 12} fontSize="9" fill="currentColor" textAnchor="end">{textoFecha(h[h.length - 1]!.fecha)}</text>
      </svg>
    </figure>
  );
}

function Importado({ i, alEscribir, alCancelar }: {
  i: { imp: CronogramaImportado; ver: Verificacion; confirmar: boolean };
  alEscribir: (forzar: boolean) => void;
  alCancelar: () => void;
}) {
  const { imp, ver } = i;
  const relaciones = imp.cronograma.actividades.reduce((n, a) => n + a.predecesoras.length, 0);
  const bien = ver.total > 0 && ver.coinciden === ver.total;
  return (
    <div className="importado" style={{ border: '1px solid var(--borde)', borderRadius: 4, padding: '8px 10px', margin: '8px 0' }}>
      <p><strong>{T.importado(imp.fuente, imp.proyecto, imp.cronograma.actividades.length, relaciones)}</strong></p>
      {imp.avisos.length > 0 && <ul className="aviso-linea">{imp.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
      <p className={bien ? 'aviso-ok' : 'aviso-linea'}>{T.verificacion}: {ver.resumen}</p>
      {ver.diferencias.length > 0 && (
        <ul className="tenue">
          {ver.diferencias.slice(0, 10).map((d) => (
            <li key={`${d.id}-${d.campo}`}>{T.diferencia(d.id, d.nombre, d.campo, textoFecha(d.fuente), textoFecha(d.calculado))}</li>
          ))}
        </ul>
      )}
      {i.confirmar ? (
        <p className="aviso-linea">
          {T.reemplazarAviso}{' '}
          <button type="button" onClick={() => alEscribir(true)}>{T.reemplazar}</button>{' '}
          <button type="button" onClick={alCancelar}>{T.cancelarImportar}</button>
        </p>
      ) : (
        <p>
          <button type="button" onClick={() => alEscribir(false)}>{T.escribirImportado}</button>{' '}
          <button type="button" onClick={alCancelar}>{T.cancelarImportar}</button>
        </p>
      )}
    </div>
  );
}

/** La nube costo–plazo (P5): cada punto es una iteración; las líneas, los P80. El cuadrante abajo a la izquierda es el «a tiempo y en presupuesto». */
function Nube({ r }: { r: ResultadoSimulacionPlazo }) {
  const c = r.costos;
  if (!c) return null;
  const n = r.finProyecto.length;
  const paso = Math.max(1, Math.floor(n / 1500));
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i += paso) {
    xs.push(r.finProyecto[i] as number);
    ys.push(c.porIteracion[i] as number);
  }
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const W = 300;
  const H = 150;
  const px = (v: number) => ((v - x0) / Math.max(1e-9, x1 - x0)) * (W - 10) + 5;
  const py = (v: number) => H - 5 - ((v - y0) / Math.max(1e-9, y1 - y0)) * (H - 10);
  const xP80 = px(r.dias.p80);
  const yP80 = py(c.p80);
  return (
    <figure style={{ margin: '8px 0' }}>
      <figcaption className="tenue" style={{ fontSize: 12 }}>{T.nube}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={T.nube}>
        <rect x={0} y={yP80} width={xP80} height={H - yP80} fill="var(--acento)" opacity={0.08} />
        {xs.map((x, i) => <circle key={i} cx={px(x)} cy={py(ys[i] as number)} r={1.4} fill="var(--acento)" opacity={0.35} />)}
        <line x1={xP80} x2={xP80} y1={0} y2={H} stroke="var(--texto, #333)" strokeDasharray="3 2" />
        <line x1={0} x2={W} y1={yP80} y2={yP80} stroke="var(--texto, #333)" strokeDasharray="3 2" />
        <text x={xP80 + 2} y={10} fontSize="9" fill="currentColor">P80 plazo</text>
        <text x={W - 2} y={yP80 - 3} fontSize="9" fill="currentColor" textAnchor="end">P80 costo</text>
        <text x={2} y={H + 12} fontSize="9" fill="currentColor">{textoFecha(r.cal(x0))}</text>
        <text x={W} y={H + 12} fontSize="9" fill="currentColor" textAnchor="end">{textoFecha(r.cal(x1))}</text>
      </svg>
    </figure>
  );
}
