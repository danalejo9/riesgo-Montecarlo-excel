/**
 * Pestaña «Cronograma» (QRSA, Q1): crear el libro de cronograma, revisar su
 * calidad y simularlo con la ruta crítica recalculada en cada iteración. Los
 * resultados completos van a la hoja `Resultados_Cronograma`; aquí, lo que
 * hace falta para leerlos de un vistazo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  chequearCalidad, comparacionPrePost, confianzaConjunta, cronogramaAjustado, indicesActividades, resumirCosto, simularCronograma, SimulacionCancelada,
  type ChequeoCalidad, type IndiceActividad, type ModeloCronograma, type ResumenTiempo, type SimulacionCronograma,
} from '../engine/cronograma/index.ts';
import { csvIteraciones, codificarInformeCronograma, datosInformeCronograma } from '../excel/informeCronograma.ts';
import { hojasImportadas, importarCronograma, resumenImportacion, type CronogramaImportado } from '../excel/importarCronograma.ts';
import { HOJAS_CRONOGRAMA, leerCronograma, type ErrorHoja } from '../excel/cronogramaHojas.ts';
import { hojaResultados, resumenesDe } from '../excel/cronogramaResultados.ts';
import {
  crearLibroCronograma, escribirResultadosCronograma, hojasCronogramaExistentes, importarAlLibro, irACelda, leerHojasCronograma, VERSION_COMPLEMENTO,
} from '../excel/cronogramaLibro.ts';
import { Ayuda } from './ayuda.tsx';
import { datosGanttDe, qrsaDeSimulacion, type DatosGantt } from '../excel/gantt.ts';
import { GanttCompacto } from './gantt/GanttCompacto.tsx';
import { ABRIR_GANTT, controlGantt, REFRESCAR_GANTT } from './gantt/controlPanel.ts';
import { abrirEnNavegador, CurvaAcumulada, Histograma } from './Resultados.tsx';
import { formatoDe, miles, numero, porcentaje } from './formato.ts';

export type AccionCronograma = 'crear' | 'calidad' | 'simular' | 'gantt';

export interface PedidoCronograma {
  accion: AccionCronograma;
  /** Cambia en cada pulsación de la cinta, para repetir la misma acción. */
  n: number;
}

interface Estado {
  errores: ErrorHoja[];
  avisos: string[];
  calidad: ChequeoCalidad | null;
  sim: SimulacionCronograma | null;
  modelo: ModeloCronograma | null;
  fin: ResumenTiempo | null;
  hitos: ResumenTiempo[];
  indices: IndiceActividad[];
}

const VACIO: Estado = { errores: [], avisos: [], calidad: null, sim: null, modelo: null, fin: null, hitos: [], indices: [] };
const FECHA = formatoDe(true);

function pct(x: number): string {
  return `${numero(100 * x, 3)} %`;
}

function dias(x: number): string {
  return `${numero(x, 4)} días`;
}

/** Excel guarda fecha y hora como número de serie. */
function serieAhora(): number {
  const d = new Date();
  return (d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000 + 25569;
}

export function Cronograma({ visible, pedido, alAtender, alFallar }: {
  visible: boolean;
  pedido?: PedidoCronograma;
  /** Avisa de que el pedido de la cinta ya se atendió. */
  alAtender: () => void;
  alFallar: (e: unknown) => void;
}) {
  const [estado, setEstado] = useState<Estado>(VACIO);
  const [existentes, setExistentes] = useState<string[] | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [avance, setAvance] = useState<{ hecho: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const control = useRef<AbortController | null>(null);
  /** G1: la vista compacta del Gantt (también antes de simular). */
  const [datosGantt, setDatosGantt] = useState<DatosGantt | null>(null);

  const refrescarExistentes = useCallback(async () => {
    try {
      setExistentes(await hojasCronogramaExistentes());
    } catch {
      setExistentes([]);
    }
  }, []);

  // Cada vez que se enseña la pestaña: el usuario pudo crear o borrar hojas entretanto.
  useEffect(() => {
    if (visible) void refrescarExistentes();
  }, [visible, refrescarExistentes]);
  // G1: al enseñar la pestaña, el Gantt compacto se dibuja sin esperar a revisar ni simular.
  useEffect(() => {
    if (!visible || !existentes?.length) return;
    let vigente = true;
    void leerHojasCronograma().then((h) => {
      const l = leerCronograma(h);
      if (!vigente || !l.modelo) return;
      setDatosGantt(datosGanttDe(l, controlGantt.qrsa));
    }).catch(() => {});
    return () => { vigente = false; };
  }, [visible, existentes]);

  /** Lee y valida las hojas; con errores, los enseña y devuelve null. */
  const leer = useCallback(async (): Promise<ModeloCronograma | null> => {
    const lectura = leerCronograma(await leerHojasCronograma());
    if (!lectura.modelo) {
      setEstado({ ...VACIO, errores: lectura.errores, avisos: lectura.avisos });
      setDatosGantt(null);
      return null;
    }
    setDatosGantt(datosGanttDe(lectura, controlGantt.qrsa));
    setEstado((e) => ({ ...e, errores: [], avisos: lectura.avisos }));
    return lectura.modelo;
  }, []);

  const crear = useCallback(async () => {
    setOcupado('Creando las hojas…');
    setAviso(null);
    try {
      const r = await crearLibroCronograma();
      setAviso(r.completado
        ? `El libro ya tenía parte del cronograma: se añadieron, vacías, las hojas que faltaban (${r.creadas.join(', ')}).`
        : `Hojas creadas: ${r.creadas.join(', ')}. Ya tienen un ejemplo de obra con costos y riesgos: cámbielo por su cronograma o simúlelo tal cual.`);
      await refrescarExistentes();
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(null);
    }
  }, [alFallar, refrescarExistentes]);

  const [importado, setImportado] = useState<CronogramaImportado | null>(null);
  const archivo = useRef<HTMLInputElement | null>(null);

  const elegirArchivo = useCallback(async (f: File) => {
    setAviso(null);
    try {
      const bytes = await f.arrayBuffer();
      // El XML de MS Project va en UTF-8; el XER de P6, en la página de códigos de Windows.
      const utf8 = new TextDecoder('utf-8').decode(bytes);
      const texto = /^\s*</.test(utf8.replace(/^\uFEFF/, '')) ? utf8 : new TextDecoder('windows-1252').decode(bytes);
      setImportado(importarCronograma(texto));
    } catch (e) {
      alFallar(e);
    }
  }, [alFallar]);

  const confirmarImportacion = useCallback(async (deCero: boolean) => {
    if (!importado) return;
    setOcupado('Importando…');
    try {
      const escritas = await importarAlLibro(hojasImportadas(importado), importado.inicio, importado.calendarioProyecto, deCero);
      setAviso(`Importado (${importado.formato}): ${textoResumen(importado)}. Hojas escritas: ${escritas.join(', ')}. Complete Incertidumbre y Riesgos y simule.`);
      setImportado(null);
      setEstado(VACIO);
      await refrescarExistentes();
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(null);
    }
  }, [importado, alFallar, refrescarExistentes]);

  const revisar = useCallback(async () => {
    setOcupado('Revisando el cronograma…');
    setAviso(null);
    try {
      const modelo = await leer();
      if (!modelo) return;
      setEstado((e) => ({ ...e, calidad: chequearCalidad(modelo), modelo }));
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(null);
    }
  }, [alFallar, leer]);

  const simular = useCallback(async () => {
    setOcupado('Leyendo el cronograma…');
    setAviso(null);
    const c = new AbortController();
    control.current = c;
    try {
      const modelo = await leer();
      if (!modelo) return;
      const calidad = chequearCalidad(modelo);
      setEstado((e) => ({ ...e, calidad, modelo }));
      if (calidad.bloquea) return;
      setOcupado('Simulando…');
      const sim = await simularCronograma(modelo, { senal: c.signal, progreso: (hecho, total) => setAvance({ hecho, total }) });
      const { fin, hitos } = resumenesDe(sim, modelo);
      setEstado((e) => ({ ...e, sim, fin, hitos, indices: indicesActividades(sim) }));
      // El Gantt toma la criticidad y el rango P10–P90 de cada actividad.
      controlGantt.qrsa = qrsaDeSimulacion(sim);
      setDatosGantt((d) => (d ? { ...d, qrsa: controlGantt.qrsa } : d));
      window.dispatchEvent(new Event(REFRESCAR_GANTT));
      setOcupado('Escribiendo la hoja de resultados…');
      await escribirResultadosCronograma(hojaResultados({ sim, modelo, calidad, ahora: serieAhora(), version: VERSION_COMPLEMENTO }));
    } catch (e) {
      if (e instanceof SimulacionCancelada) setAviso('Simulación cancelada.');
      else alFallar(e);
    } finally {
      setOcupado(null);
      setAvance(null);
      control.current = null;
    }
  }, [alFallar, leer]);

  // La cinta pide una acción; se atiende una vez y se avisa.
  useEffect(() => {
    if (!pedido) return;
    alAtender();
    if (ocupado !== null) return;
    if (pedido.accion === 'crear') void crear();
    else if (pedido.accion === 'calidad') void revisar();
    else void simular();
  }, [pedido, alAtender, ocupado, crear, revisar, simular]);

  const { errores, avisos, calidad, sim, fin, hitos, indices } = estado;
  const faltan = existentes !== null && existentes.length === 0;
  // Un libro de la versión anterior (sin Costos, Correlaciones ni Ramas): «Crear» añade lo que falta.
  const incompleto = existentes !== null && existentes.length < Object.keys(HOJAS_CRONOGRAMA).length;

  return (
    <section className="cronograma">
      <p className="tenue">
        Análisis de riesgo del cronograma: la ruta crítica se recalcula en cada iteración, con las cuatro relaciones,
        desfases, calendarios con festivos de Colombia y riesgos que afectan varias actividades a la vez.
      </p>

      <div className="botonera">
        <button type="button" className={faltan ? '' : 'secundario'} onClick={() => void crear()} disabled={ocupado !== null || !incompleto}
          title={incompleto ? '' : 'El libro ya tiene las hojas del cronograma'}>
          {faltan || !incompleto ? 'Crear libro de cronograma' : 'Añadir las hojas que faltan'}
        </button>
        <button type="button" className="secundario" onClick={() => void revisar()} disabled={ocupado !== null || faltan}>Revisar calidad</button>
        <button type="button" className={faltan ? 'secundario' : ''} onClick={() => void simular()} disabled={ocupado !== null || faltan}>Simular cronograma</button>
        <button type="button" className="secundario" onClick={() => window.dispatchEvent(new Event(ABRIR_GANTT))} disabled={faltan}
          title="El diagrama completo, con la tabla editable y el diagnóstico de la ruta crítica, en una ventana">
          Ver Gantt
        </button>
        <button type="button" className="secundario" onClick={() => archivo.current?.click()} disabled={ocupado !== null}
          title="Un XML de MS Project (o de ProjectLibre) o un XER de Primavera P6">
          Importar MS Project o P6…
        </button>
        <input ref={archivo} type="file" accept=".xml,.xer" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void elegirArchivo(f);
        }} />
      </div>

      {importado && (
        <section className="importacion">
          <h2>Importar {importado.nombre ? `«${importado.nombre}»` : 'el cronograma'}</h2>
          <p>{importado.formato}: {textoResumen(importado)}; empieza el {FECHA.valor(importado.inicio)}.</p>
          {importado.avisos.length > 0 && <ul className="tenue">{importado.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
          <p className="tenue">
            {faltan
              ? 'Se crearán las hojas del cronograma con estas actividades; Incertidumbre, Riesgos y Costos quedan vacías para completarlas.'
              : '«Reemplazar» cambia Actividades, Relaciones y Calendario (y la fecha de inicio y el calendario de Config) y deja Incertidumbre, Riesgos, Costos y lo demás como están: sirve para actualizar el mismo cronograma. «Empezar de cero» las vacía también, porque remitían a las actividades de antes.'}
          </p>
          <div className="botonera">
            <button type="button" onClick={() => void confirmarImportacion(false)} disabled={ocupado !== null}>{faltan ? 'Crear las hojas' : 'Reemplazar'}</button>
            {!faltan && <button type="button" className="secundario" onClick={() => void confirmarImportacion(true)} disabled={ocupado !== null}>Empezar de cero</button>}
            <button type="button" className="secundario" onClick={() => setImportado(null)}>Cancelar</button>
          </div>
        </section>
      )}

      {faltan && (
        <p className="tenue">
          Este libro aún no tiene las hojas del cronograma. «Crear libro de cronograma» las añade con un ejemplo de obra
          (14 actividades y 4 riesgos) para ver cómo se llenan.
        </p>
      )}
      {aviso && <p className="aviso-ok">{aviso}</p>}

      {ocupado && (
        <section className="progreso">
          <p>{ocupado}</p>
          {avance && (
            <>
              <div className="barra" role="progressbar" aria-valuenow={Math.round(porcentaje(avance.hecho, avance.total))} aria-valuemin={0} aria-valuemax={100}>
                <div className="relleno" style={{ width: `${porcentaje(avance.hecho, avance.total)}%` }} />
              </div>
              <p className="tenue">{miles(avance.hecho)} de {miles(avance.total)} iteraciones (con las del tornado por eliminación)</p>
              <button type="button" className="secundario" onClick={() => control.current?.abort()}>Cancelar</button>
            </>
          )}
        </section>
      )}

      {errores.length > 0 && (
        <section className="errores-cronograma">
          <h2>Hay que corregir el cronograma</h2>
          <p className="tenue">Pulse un error para ir a la celda.</p>
          <ul>
            {errores.map((e, i) => (
              <li key={i}>
                <button type="button" className="enlace" onClick={() => void irACelda(e.hoja, e.columna, e.fila).catch(alFallar)}>
                  {e.hoja}{e.fila > 0 ? `, ${e.columna}${e.fila}` : ''}
                </button>
                : {e.mensaje}
              </li>
            ))}
          </ul>
        </section>
      )}
      {avisos.length > 0 && (
        <details>
          <summary>{avisos.length === 1 ? 'Un aviso' : `${avisos.length} avisos`} de la lectura</summary>
          <ul className="tenue">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </details>
      )}

      {calidad && <Calidad calidad={calidad} />}

      {datosGantt && errores.length === 0 && (
        <section>
          <h2>Diagrama de Gantt</h2>
          <Ayuda tema="gantt" />
          <GanttCompacto datos={datosGantt} />
          <p className="tenue">
            Rojo: ruta crítica (holgura total ≤ 0); naranja: casi crítica (≤ 5 días); la línea gris llega hasta el fin tardío.
            {' '}<button type="button" className="enlace" onClick={() => window.dispatchEvent(new Event(ABRIR_GANTT))}>Abrir el Gantt completo</button> para editar, ver los vínculos impulsores y «¿por qué es crítica?».
          </p>
        </section>
      )}

      {sim && fin && (
        <>
          <section>
            <h2>Fin del proyecto</h2>
            <Ayuda tema="finCronograma" />
            <table className="tabla-resumen sin-clic">
              <tbody>
                <tr><td>Fecha determinística (sin riesgos)</td><td>{FECHA.valor(fin.serieDeterministica)}</td></tr>
                <tr><td>Probabilidad de cumplirla</td><td><strong>{pct(fin.probabilidadDeterministica)}</strong></td></tr>
                {fin.probabilidadMeta !== null && estado.modelo?.configuracion.fechaMeta !== undefined && (
                  <tr><td>Probabilidad de cumplir la meta ({FECHA.valor(estado.modelo.configuracion.fechaMeta)})</td><td><strong>{pct(fin.probabilidadMeta)}</strong></td></tr>
                )}
                <tr><td>P50 · P80</td><td>{FECHA.valor(fin.percentiles[4]?.serie ?? NaN)} · {FECHA.valor(fin.percentiles[7]?.serie ?? NaN)}</td></tr>
                <tr><td>Media y desviación</td><td>{dias(fin.media)} ± {numero(fin.desviacion, 3)}</td></tr>
              </tbody>
            </table>
            <CurvaAcumulada puntos={fin.curvaS.map(([x, p]) => ({ x, p }))} formato={FECHA} />
            <Histograma barras={fin.histograma} etiqueta="Duración del proyecto (días laborables)" />
            <TablaPercentiles resumenes={[fin, ...hitos]} />
          </section>

          {estado.modelo && <SeccionesQ2 sim={sim} modelo={estado.modelo} />}

          <section>
            <h2>Riesgos: tornado por eliminación</h2>
            <Ayuda tema="eliminacion" />
            {sim.eliminacion.length === 0 ? <p className="tenue">El cronograma no tiene riesgos activos.</p> : (
              <>
                <p className="tenue">Cuánto bajaría el P80 del fin (en días) si el riesgo desapareciera, con los mismos números aleatorios.</p>
                <TornadoEliminacion filas={sim.eliminacion.map((e) => ({ id: e.id, nombre: e.nombre, valor: e.reduccionP80, ocurrencia: e.ocurrencia }))} unidad="d" />
                {sim.costo && (
                  <>
                    <p className="tenue">Y cuánto bajaría el costo P{Math.round(100 * (estado.modelo?.configuracion.percentilContingencia ?? 0.8))} (la contingencia):</p>
                    <TornadoEliminacion filas={[...sim.eliminacion].sort((a, b) => (b.reduccionP80Costo ?? 0) - (a.reduccionP80Costo ?? 0)).map((e) => ({ id: e.id, nombre: e.nombre, valor: e.reduccionP80Costo ?? 0, ocurrencia: e.ocurrencia }))} unidad="$" />
                  </>
                )}
                {sim.sinRiesgos && (
                  <p className="tenue">Sin ningún riesgo, el P80 sería {dias(sim.sinRiesgos.p80)} ({numero(sim.p80 - sim.sinRiesgos.p80, 3)} días menos): el resto es incertidumbre de las duraciones.</p>
                )}
              </>
            )}
          </section>

          <section>
            <h2>Actividades más críticas</h2>
            <Ayuda tema="criticidad" />
            <p className="tenue">Criticidad: % de iteraciones en la ruta crítica. SSI: criticidad × variabilidad de la actividad frente a la del proyecto.</p>
            <div className="tabla-desplazable">
              <table className="tabla-resumen sin-clic">
                <thead><tr><th>Actividad</th><th>Criticidad</th><th>SSI</th><th>Holgura</th></tr></thead>
                <tbody>
                  {indices.slice(0, 12).map((x) => (
                    <tr key={x.id}><td>{x.id} · {x.nombre}</td><td>{pct(x.criticidad)}</td><td>{numero(x.ssi, 2)}</td><td>{numero(x.holgura, 3)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {sim.rutas.length > 0 && (
            <section>
              <h2>Rutas críticas más frecuentes</h2>
              <ol className="rutas">
                {sim.rutas.map((r, i) => <li key={i}><strong>{pct(r.proporcion)}</strong> · {r.actividades.join(' → ')}</li>)}
              </ol>
            </section>
          )}

          <GanttAjustado sim={sim} />

          {(sim.avisos.length > 0 || sim.correlacionLograda.length > 0) && (
            <details>
              <summary>Avisos de la simulación y correlación lograda</summary>
              {sim.avisos.length > 0 && <ul className="tenue">{sim.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
              {sim.correlacionLograda.length > 0 && (
                <table className="tabla-resumen sin-clic">
                  <thead><tr><th>Par</th><th>Pedida</th><th>Aplicada</th><th>Lograda</th></tr></thead>
                  <tbody>{sim.correlacionLograda.map((c) => <tr key={`${c.a}-${c.b}`}><td>{c.a} – {c.b}</td><td>{numero(c.objetivo, 2)}</td><td>{numero(c.aplicada, 2)}</td><td>{numero(c.lograda, 2)}</td></tr>)}</tbody>
                </table>
              )}
            </details>
          )}

          <div className="botonera">
            <button type="button" onClick={() => {
              if (!estado.modelo || !calidad) return;
              void codificarInformeCronograma(datosInformeCronograma(sim, estado.modelo, calidad, VERSION_COMPLEMENTO))
                .then((codigo) => abrirEnNavegador(`${new URL('/informeCronograma.html', window.location.href).href}#d=${codigo}`))
                .catch(alFallar);
            }}>Informe ejecutivo (PDF)</button>
            <button type="button" className="secundario" onClick={() => descargar('iteraciones-cronograma.csv', csvIteraciones(sim))}>Iteraciones en CSV</button>
          </div>
          <p className="tenue">
            {miles(sim.iteraciones)} iteraciones en {numero(sim.milisegundos / 1000, 3)} s. Todo el detalle está en la hoja «Resultados_Cronograma».
          </p>
        </>
      )}
    </section>
  );
}

function Calidad({ calidad }: { calidad: ChequeoCalidad }) {
  const rojos = calidad.criterios.filter((c) => c.estado === 'rojo').length;
  const amarillos = calidad.criterios.filter((c) => c.estado === 'amarillo').length;
  return (
    <section>
      <h2>Calidad del cronograma</h2>
      <Ayuda tema="calidadCronograma" />
      <p className="tenue">
        {calidad.bloquea ? 'No se puede simular hasta corregir lo que está en rojo.' : `${rojos} en rojo, ${amarillos} en amarillo: se puede simular, pero conviene revisarlos.`}
      </p>
      <ul className="semaforos">
        {calidad.criterios.map((c) => (
          <li key={c.id}>
            <span className={`luz luz-${c.estado}`} aria-label={c.estado} />
            <div>
              <strong>{c.criterio}</strong>
              <div className="tenue">{c.detalle}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TablaPercentiles({ resumenes }: { resumenes: readonly ResumenTiempo[] }) {
  return (
    <div className="tabla-desplazable">
      <table className="tabla-resumen sin-clic">
        <thead>
          <tr><th>Percentil</th>{resumenes.map((r) => <th key={r.id}>{r.id === 'FIN' ? 'Fin' : r.nombre}</th>)}</tr>
        </thead>
        <tbody>
          {resumenes[0]?.percentiles.map((p, i) => (
            <tr key={p.p}>
              <td>P{Math.round(p.p * 100)}</td>
              {resumenes.map((r) => <td key={r.id}>{FECHA.valor(r.percentiles[i]?.serie ?? NaN)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TornadoEliminacion({ filas, unidad }: { filas: readonly { id: string; nombre: string; valor: number; ocurrencia: number }[]; unidad: 'd' | '$' }) {
  const mayor = Math.max(...filas.map((f) => Math.abs(f.valor)), 0.0001);
  return (
    <ul className="tornado-eliminacion">
      {filas.map((f) => (
        <li key={f.id}>
          <span className="nombre" title={f.nombre}>{f.id} · {f.nombre}</span>
          <span className="barra-fondo">
            <span className={`barra-valor${f.valor < 0 ? ' negativa' : ''}`} style={{ width: `${(100 * Math.abs(f.valor)) / mayor}%` }} />
          </span>
          <span className="cifra">{unidad === 'd' ? `${numero(f.valor, 3)} d` : dineroCorto(f.valor)}</span>
        </li>
      ))}
    </ul>
  );
}

/** «1,2 mil M», «350 M», «12.000»: cifras de costo cortas para el panel. */
function dineroCorto(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e9) return `${numero(x / 1e9, 3)} mil M`;
  if (a >= 1e6) return `${numero(x / 1e6, 3)} M`;
  return Math.round(x).toLocaleString('es-CO');
}

function descargar(nombre: string, texto: string): void {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Costo, JCL y pre/post mitigación (Q2). */
function SeccionesQ2({ sim, modelo }: { sim: SimulacionCronograma; modelo: ModeloCronograma }) {
  const cfg = modelo.configuracion;
  const rc = sim.costo && sim.costoBase !== null ? resumirCosto(sim.costo, sim.costoBase, cfg.percentilContingencia, cfg.costoMeta) : null;
  const pp = comparacionPrePost(sim, cfg.fechaMeta, cfg.percentilContingencia);
  const mon = cfg.moneda ? ` ${cfg.moneda}` : '';
  const dinero = (x: number) => `${Math.round(x).toLocaleString('es-CO')}${mon}`;
  const j = sim.costo && cfg.fechaMeta !== undefined && cfg.costoMeta !== undefined ? confianzaConjunta(sim.fin.serie, sim.costo, cfg.fechaMeta, cfg.costoMeta, 1200) : null;
  return (
    <>
      {rc && (
        <section>
          <h2>Costo del proyecto</h2>
          <Ayuda tema="costoCronograma" />
          <table className="tabla-resumen sin-clic">
            <tbody>
              <tr><td>Costo base (sin riesgos)</td><td>{dinero(rc.base)}</td></tr>
              <tr><td>Probabilidad de no pasarse del base</td><td>{pct(rc.probabilidadBase)}</td></tr>
              <tr><td>P{Math.round(rc.pContingencia * 100)} · contingencia</td><td><strong>{dinero(rc.valorContingencia)}</strong> · {dinero(rc.contingencia)}</td></tr>
              {rc.probabilidadMeta !== null && cfg.costoMeta !== undefined && <tr><td>Probabilidad de cumplir el costo meta ({dinero(cfg.costoMeta)})</td><td><strong>{pct(rc.probabilidadMeta)}</strong></td></tr>}
              <tr><td>Media</td><td>{dinero(rc.media)}</td></tr>
            </tbody>
          </table>
          <CurvaAcumulada puntos={rc.curvaS.map(([x, p]) => ({ x, p }))} />
        </section>
      )}
      {j && cfg.fechaMeta !== undefined && cfg.costoMeta !== undefined && (
        <section>
          <h2>Costo y plazo a la vez (JCL)</h2>
          <Ayuda tema="jcl" />
          <p>Cumplen la fecha meta <strong>y</strong> el costo meta: <strong>{pct(j.jcl)}</strong> de las iteraciones (solo la fecha: {pct(j.soloPlazo)}; solo el costo: {pct(j.soloCosto)}).</p>
          <DispersionJcl puntos={j.puntos} fechaMeta={cfg.fechaMeta} costoMeta={cfg.costoMeta} />
        </section>
      )}
      {pp.length > 0 && sim.post && (
        <section>
          <h2>Antes y después de mitigar</h2>
          <Ayuda tema="prePost" />
          <CurvaAcumulada
            puntos={resumirCurva(sim.fin.serie)}
            referencia={resumirCurva(sim.post.fin.serie)}
            etiquetaReferencia="Post mitigación"
            formato={FECHA}
          />
          <table className="tabla-resumen sin-clic">
            <thead><tr><th>Medida</th><th>Pre</th><th>Post</th><th>Gana</th></tr></thead>
            <tbody>
              {pp.map((r) => {
                const f = (x: number) => (r.unidad === 'fecha' ? FECHA.valor(x) : r.unidad === 'costo' ? dineroCorto(x) : r.unidad === 'probabilidad' ? pct(x) : numero(x, 4));
                const g = r.unidad === 'fecha' ? `${numero(r.diferencia, 3)} d` : r.unidad === 'costo' ? dineroCorto(r.diferencia) : r.unidad === 'probabilidad' ? pct(r.diferencia) : numero(r.diferencia, 3);
                return <tr key={r.medida}><td>{r.medida}</td><td>{f(r.pre)}</td><td>{f(r.post)}</td><td>{g}</td></tr>;
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function resumirCurva(serie: Float64Array): { x: number; p: number }[] {
  const o = Float64Array.from(serie).sort();
  const r: { x: number; p: number }[] = [];
  for (let i = 0; i < o.length; i++) if (i === o.length - 1 || o[i + 1] !== o[i]) r.push({ x: o[i] as number, p: (i + 1) / o.length });
  return r;
}

/** Dispersión costo–fecha con las dos metas: el cuadrante de abajo a la izquierda es el JCL. */
function DispersionJcl({ puntos, fechaMeta, costoMeta }: { puntos: readonly [number, number][]; fechaMeta: number; costoMeta: number }) {
  const W = 320, H = 200, m = { i: 46, d: 8, a: 8, b: 24 };
  const xs = puntos.map((p) => p[0]).concat(fechaMeta);
  const ys = puntos.map((p) => p[1]).concat(costoMeta);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const ax = (x: number) => m.i + ((x - x0) / (x1 - x0 || 1)) * (W - m.i - m.d);
  const ay = (y: number) => H - m.b - ((y - y0) / (y1 - y0 || 1)) * (H - m.a - m.b);
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Costo frente a fecha de fin">
        <rect className="zona-jcl" x={m.i} y={ay(costoMeta)} width={ax(fechaMeta) - m.i} height={H - m.b - ay(costoMeta)} />
        {puntos.map(([x, y], i) => <circle key={i} className="punto-dispersion" cx={ax(x)} cy={ay(y)} r={1.6} />)}
        <line className="meta" x1={ax(fechaMeta)} y1={m.a} x2={ax(fechaMeta)} y2={H - m.b} />
        <line className="meta" x1={m.i} y1={ay(costoMeta)} x2={W - m.d} y2={ay(costoMeta)} />
        <text className="eje" x={m.i} y={H - 6}>{FECHA.valor(x0)}</text>
        <text className="eje" x={W - m.d} y={H - 6} textAnchor="end">{FECHA.valor(x1)}</text>
        <text className="eje" x={m.i - 4} y={ay(y1) + 8} textAnchor="end">{dineroCorto(y1)}</text>
        <text className="eje" x={m.i - 4} y={ay(y0)} textAnchor="end">{dineroCorto(y0)}</text>
      </svg>
      <figcaption className="tenue">Cada punto es una iteración. Las líneas son las metas; el recuadro sombreado cumple las dos.</figcaption>
    </figure>
  );
}

/** Cronograma ajustado por riesgo (Q3.3): la barra base y, encima, hasta el fin P80. */
function GanttAjustado({ sim }: { sim: SimulacionCronograma }) {
  const filas = cronogramaAjustado(sim, 0.8).filter((f) => f.finBase >= f.inicioBase);
  if (filas.length === 0) return null;
  const x0 = Math.min(...filas.map((f) => f.inicioBase));
  const x1 = Math.max(...filas.map((f) => f.finP));
  const W = 320, alto = 14, izq = 42;
  const ax = (x: number) => izq + ((x - x0) / (x1 - x0 || 1)) * (W - izq - 4);
  return (
    <section>
      <h2>Cronograma ajustado por riesgo</h2>
      <p className="tenue">Barra gris: las fechas base. Barra de color: del inicio P50 al fin P80 de cada actividad. La tabla completa está en la hoja de resultados.</p>
      <figure className="grafico">
        <svg viewBox={`0 0 ${W} ${filas.length * alto + 20}`} role="img" aria-label="Cronograma base y ajustado por riesgo">
          {filas.map((f, i) => (
            <g key={f.id}>
              <text className="eje" x={izq - 4} y={i * alto + 10} textAnchor="end">{f.id}</text>
              <rect className="barra-base" x={ax(f.inicioBase)} y={i * alto + 2} width={Math.max(1.5, ax(f.finBase + 1) - ax(f.inicioBase))} height={4} />
              <rect className="barra-p80" x={ax(f.inicioP50)} y={i * alto + 7} width={Math.max(1.5, ax(f.finP + 1) - ax(f.inicioP50))} height={4} />
            </g>
          ))}
          <text className="eje" x={izq} y={filas.length * alto + 16}>{FECHA.valor(x0)}</text>
          <text className="eje" x={W - 4} y={filas.length * alto + 16} textAnchor="end">{FECHA.valor(x1)}</text>
        </svg>
      </figure>
    </section>
  );
}

function textoResumen(c: CronogramaImportado): string {
  const r = resumenImportacion(c);
  const n = (k: number, uno: string, varios: string) => `${k.toLocaleString('es-CO')} ${k === 1 ? uno : varios}`;
  return [n(r.actividades, 'actividad', 'actividades'), n(r.hitos, 'hito', 'hitos'), ...(r.resumenes ? [n(r.resumenes, 'resumen', 'resúmenes')] : []),
    n(r.relaciones, 'relación', 'relaciones'), n(r.calendarios, 'calendario', 'calendarios')].join(', ');
}
