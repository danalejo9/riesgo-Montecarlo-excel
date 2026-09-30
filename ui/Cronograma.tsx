/**
 * Pestaña «Cronograma» (bloque P): plantilla, camino crítico determinista
 * (P1), chequeo de salud con semáforo (P2) y Monte Carlo del plazo con los
 * riesgos de plazo (P3). Todo el cálculo está en `engine/cronograma/`; aquí
 * solo se lee el libro, se enseña y se escribe.
 */

import { useRef, useState } from 'react';

import {
  calcularCPM, compararMitigacion, completarRangos, escenarioDespues, hojaMitigacion, narrativaMitigacion, tieneMitigacion,
  type ComparacionMitigacion, hojaGantt, hojaPlazoSimulado, importarCronograma, verificarContraFuente,
  type CronogramaImportado, type Verificacion, hojaSimulacionPlazo, vistaGantt, impactoDeRiesgos, leerCronograma, leerRiesgosPlazo, narrativaPlazo, revisarSalud,
  simularPlazo, simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO,
  type Cronograma as ModeloCronograma, type FormaDuracion, type ImpactoRiesgo, type InformeSalud, type ProblemaCronograma,
  type ResultadoCPM, type ResultadoSimulacionPlazo, type RiesgoPlazo, type Semaforo,
  agregarInstantanea, hojaSeguimiento, instantaneaDe, leerSeguimiento, serieLocal, tendencia, type Instantanea,
} from '../engine/cronograma/index.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';
import { textoMoneda } from '../engine/modelo/moneda.ts';
import { tieneCapacidad } from '../engine/licencia/capacidades.ts';
import {
  escribirCeldasActividades, escribirCronogramaImportado, escribirHojaGantt, escribirHojaSeguimiento, escribirHojaSimulacion, escribirPlantillaCronograma,
  escribirResultadoCPM, leerHojaSeguimiento, leerHojasCronograma,
} from '../excel/cronograma.ts';
import { codificarJson } from '../excel/codificacion.ts';
import { plantillaDelLibro } from '../excel/almacenPlantilla.ts';
import { datosInformeCronograma } from '../excel/informeCronograma.ts';
import { codificarInforme } from '../excel/informeImprimible.ts';
import { abrirVentana, ventanaAbierta } from '../excel/ventana.ts';
import { Plegable } from './Plegable.tsx';
import { abrirEnNavegador } from './Resultados.tsx';
import { HistogramaFechas, NubeCostoPlazo, TendenciaPlazo } from './graficosCronograma.tsx';
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
  escenario: 'antes' | 'despues';
  comparacion?: { cmp: ComparacionMitigacion; narrativa: string[] };
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
  const [pctMenos, setPctMenos] = useState(10);
  const [pctMas, setPctMas] = useState(25);
  const [escenario, setEscenario] = useState<'antes' | 'despues' | 'comparar'>('antes');
  const [seguimiento, setSeguimiento] = useState<Instantanea[]>([]);

  if (!tieneCapacidad('cronograma')) {
    return <section><p className="aviso-linea">{T.sinCapacidad}</p></section>;
  }

  const calcular = async () => {
    setOcupado(T.calculando);
    setNota(null);
    setSimulado(null);
    try {
      const hojas = await leerHojasCronograma();
      setSeguimiento(leerSeguimiento(hojas.seguimiento));
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
      // V1: el escenario de riesgos. «Comparar» enseña el de antes y añade la comparación.
      const usado = escenario === 'despues' ? escenarioDespues(datos.cron, datos.riesgos) : { cronograma: datos.cron, riesgos: datos.riesgos };
      const r = await simular(usado.cronograma, usado.riesgos, op);
      let impacto: Simulado['impacto'];
      if (!r.cancelada && usado.riesgos.length > 0) {
        setOcupado(T.midiendoRiesgos(0, usado.riesgos.length + 1));
        const imp = await impactoDeRiesgos(usado.cronograma, usado.riesgos, r, {
          ...op, alAvanzar: (h, t) => setOcupado(T.midiendoRiesgos(h, t)),
        }, simular);
        if (!cancelado.current) impacto = imp;
      }
      let comparacion: Simulado['comparacion'];
      if (escenario === 'comparar' && !r.cancelada && !cancelado.current) {
        setOcupado(T.comparando(0, 1));
        const cmp = await compararMitigacion(datos.cron, datos.riesgos, { ...op, alAvanzar: (h, t) => setOcupado(T.comparando(h, t)) }, simular, r);
        if (!cancelado.current) {
          const texto = narrativaMitigacion(cmp);
          await escribirHojaSimulacion(hojaMitigacion(cmp, texto));
          comparacion = { cmp, narrativa: texto };
        }
      }
      const narrativa = [
        ...(escenario === 'despues' ? [T.escenarioDespuesAviso] : []),
        ...narrativaPlazo(r, impacto, salud ?? undefined),
      ];
      const hoja = await escribirHojaSimulacion(hojaSimulacionPlazo(r, impacto, narrativa), r.cancelada ? undefined : hojaPlazoSimulado(r));
      if (resultado) {
        const vista = vistaGantt(datos.cron.actividades, resultado.filas, resultado.fechaFinProyecto, r, datos.cron.fechaCorte);
        await escribirHojaGantt(hojaGantt(vista));
        ventanaAbierta(PAGINA_GANTT)?.enviar(vista);
      }
      setSimulado({
        r, impacto, narrativa, hoja, hilos: hilos?.hilos ?? 1, escenario: escenario === 'despues' ? 'despues' : 'antes',
        ...(comparacion ? { comparacion } : {}),
      });
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

  /** V5: guarda la última simulación como instantánea (una por fecha de corte y escenario). */
  const guardarInstantanea = async () => {
    if (!simulado || !datos) return;
    try {
      const nueva = instantaneaDe(simulado.r, { fechaCorte: datos.cron.fechaCorte, escenario: simulado.escenario, ahora: serieLocal(new Date()) });
      const { lista, reemplazada } = agregarInstantanea(leerSeguimiento(await leerHojaSeguimiento()), nueva);
      await escribirHojaSeguimiento(hojaSeguimiento(lista));
      setSeguimiento(lista);
      setNota(reemplazada && nueva.fechaCorte !== undefined ? T.instantaneaReemplazada(textoFecha(nueva.fechaCorte)) : T.instantaneaGuardada(lista.length));
    } catch (e) {
      alFallar(e);
    }
  };

  /** V3: el informe PDF, con la plantilla del libro y lo último calculado y simulado. */
  const abrirInforme = async () => {
    if (!resultado || !datos) return;
    try {
      const d = datosInformeCronograma({
        cronograma: datos.cron,
        filas: resultado.filas,
        fechaFinProyecto: resultado.fechaFinProyecto,
        duracionProyecto: resultado.duracionProyecto,
        salud,
        ...(simulado ? { simulado } : {}),
        ...(simulado?.comparacion ? { comparacion: simulado.comparacion } : {}),
        seguimiento,
        plantilla: await plantillaDelLibro(),
      });
      abrirEnNavegador(`${new URL('/informe.html', window.location.href).href}#d=${await codificarInforme(d)}`);
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

  const rellenar = async () => {
    try {
      const hojas = await leerHojasCronograma();
      const r = completarRangos(hojas.actividades ?? [], pctMenos / 100, pctMas / 100);
      if ('error' in r) {
        setNota(r.error);
        return;
      }
      await escribirCeldasActividades(r.cambios);
      await calcular();
      setNota(T.rellenados(r.actividades));
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
            <button type="button" onClick={abrirInforme} disabled={ocupado !== null || !datos} title={T.informeAyuda}>{T.informe}</button>{' '}
            <span className="tenue">{T.verCronogramaAyuda}</span>
          </p>
        </>
      )}

      {salud && <Salud informe={salud} />}
      {salud && salud.comprobaciones.some((c) => c.codigo === 'incertidumbre' && c.estado !== 'verde') && (
        <p title={T.rellenarAyuda}>
          <button type="button" onClick={rellenar} disabled={ocupado !== null}>{T.rellenarRangos}</button>{' '}
          <label>{T.menos}<input type="number" min={0} max={90} value={pctMenos} onChange={(e) => setPctMenos(Number(e.target.value))} style={{ width: 48 }} /> %</label>{' '}
          <label>{T.mas}<input type="number" min={0} max={500} value={pctMas} onChange={(e) => setPctMas(Number(e.target.value))} style={{ width: 48 }} /> %</label>
        </p>
      )}

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
            {datos && datos.riesgos.some(tieneMitigacion) && (
              <>
                <label>{T.escenario}{' '}
                  <select value={escenario} onChange={(e) => setEscenario(e.target.value as 'antes' | 'despues' | 'comparar')} disabled={ocupado !== null}>
                    <option value="antes">{T.escenarios.antes}</option>
                    <option value="despues">{T.escenarios.despues}</option>
                    <option value="comparar">{T.escenarios.comparar}</option>
                  </select>
                </label>{' '}
              </>
            )}
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
          {simulado && !simulado.r.cancelada && (
            <p title={T.seguimientoAyuda}>
              <button type="button" onClick={guardarInstantanea} disabled={ocupado !== null}>{T.guardarInstantanea}</button>{' '}
              {datos?.cron.fechaCorte === undefined && <span className="tenue">{T.sinCorteAviso}</span>}
            </p>
          )}
          {seguimiento.length > 0 && <Seguimiento lista={seguimiento} />}
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
      {s.comparacion && <Comparacion c={s.comparacion} />}
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

function Histograma({ r }: { r: ResultadoSimulacionPlazo }) {
  return (
    <HistogramaFechas histograma={r.histograma} diaCronograma={Math.max(0, Math.ceil(r.determinista.dias - 1e-9) - 1)}
      diaP80={r.dias.p80 - 1} titulo={T.histograma} marcaCronograma={T.marcaCronograma} />
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

/** La nube costo–plazo (P5). */
function Nube({ r }: { r: ResultadoSimulacionPlazo }) {
  const c = r.costos;
  if (!c) return null;
  const paso = Math.max(1, Math.floor(r.finProyecto.length / 1500));
  const puntos: Array<[number, number]> = [];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < r.finProyecto.length; i += paso) {
    const f = r.finProyecto[i] as number;
    puntos.push([f, c.porIteracion[i] as number]);
    min = Math.min(min, f);
    max = Math.max(max, f);
  }
  return <NubeCostoPlazo puntos={puntos} p80Dias={r.dias.p80} p80Costo={c.p80} fechaMin={r.cal(min)} fechaMax={r.cal(max)} titulo={T.nube} />;
}

/** V5: la tendencia de las instantáneas guardadas. */
function Seguimiento({ lista }: { lista: Instantanea[] }) {
  return (
    <Plegable id="cronograma-seguimiento" abierta titulo={T.seguimiento} resumen={lista.length === 1 ? T.unaInstantanea : T.instantaneas(lista.length)}>
      {lista.length === 1 && <p className="tenue">{T.unaInstantanea}</p>}
      {tendencia(lista).map((l) => <p key={l}>{l}</p>)}
      <TendenciaPlazo puntos={lista} titulo={T.tendencia} nombres={{ cronograma: T.serieCronograma, p50: 'P50', p80: 'P80' }} />
    </Plegable>
  );
}

/** V1: antes y después de mitigar, y lo que rinde cada respuesta. */
function Comparacion({ c }: { c: { cmp: ComparacionMitigacion; narrativa: string[] } }) {
  const { antes: a, despues: d } = c.cmp;
  return (
    <Plegable id="cronograma-mitigacion" abierta titulo={T.mitigacion}>
      {c.narrativa.map((l) => <p key={l}>{l}</p>)}
      <table>
        <thead><tr><th /><th>{T.escenarios.antes}</th><th>{T.escenarios.despues}</th></tr></thead>
        <tbody>
          <tr><td>P80</td><td>{textoFecha(a.fechas.p80)}</td><td>{textoFecha(d.fechas.p80)}</td></tr>
          {a.costos && d.costos && <tr><td>{T.costoP80}</td><td>{textoMoneda(a.costos.p80)}</td><td>{textoMoneda(d.costos.p80)}</td></tr>}
        </tbody>
      </table>
      <table>
        <thead><tr><th>{T.respuestaCol}</th><th>{T.costoCol}</th><th>{T.diasP80}</th><th>{T.retornoCol}</th></tr></thead>
        <tbody>
          {c.cmp.porRespuesta.map((x) => (
            <tr key={x.id}>
              <td>{x.respuesta || x.nombre}</td>
              <td>{textoMoneda(x.costoRespuesta)}</td>
              <td>{x.diasP80 > 0 ? `−${x.diasP80}` : '0'}</td>
              <td>{x.retorno === undefined ? '—' : `${x.retorno.toFixed(2).replace('.', ',')} ×`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tenue">{T.escritoEn('Cronograma (mitigación)')}</p>
    </Plegable>
  );
}
