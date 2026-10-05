/**
 * Pestaña «Cronograma» (QRSA, Q1): crear el libro de cronograma, revisar su
 * calidad y simularlo con la ruta crítica recalculada en cada iteración. Los
 * resultados completos van a la hoja `Resultados_Cronograma`; aquí, lo que
 * hace falta para leerlos de un vistazo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  chequearCalidad, indicesActividades, simularCronograma, SimulacionCancelada,
  type ChequeoCalidad, type IndiceActividad, type ModeloCronograma, type ResumenTiempo, type SimulacionCronograma,
} from '../engine/cronograma/index.ts';
import { leerCronograma, type ErrorHoja } from '../excel/cronogramaHojas.ts';
import { hojaResultados, resumenesDe } from '../excel/cronogramaResultados.ts';
import {
  crearLibroCronograma, escribirResultadosCronograma, hojasCronogramaExistentes, irACelda, leerHojasCronograma, VERSION_COMPLEMENTO,
} from '../excel/cronogramaLibro.ts';
import { Ayuda } from './ayuda.tsx';
import { CurvaAcumulada, Histograma } from './Resultados.tsx';
import { formatoDe, miles, numero, porcentaje } from './formato.ts';

export type AccionCronograma = 'crear' | 'calidad' | 'simular';

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

  /** Lee y valida las hojas; con errores, los enseña y devuelve null. */
  const leer = useCallback(async (): Promise<ModeloCronograma | null> => {
    const lectura = leerCronograma(await leerHojasCronograma());
    if (!lectura.modelo) {
      setEstado({ ...VACIO, errores: lectura.errores, avisos: lectura.avisos });
      return null;
    }
    setEstado((e) => ({ ...e, errores: [], avisos: lectura.avisos }));
    return lectura.modelo;
  }, []);

  const crear = useCallback(async () => {
    setOcupado('Creando las hojas…');
    setAviso(null);
    try {
      const hojas = await crearLibroCronograma();
      setAviso(`Hojas creadas: ${hojas.join(', ')}. Ya tienen un ejemplo de obra: cámbielo por su cronograma o simúlelo tal cual.`);
      await refrescarExistentes();
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(null);
    }
  }, [alFallar, refrescarExistentes]);

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

  return (
    <section className="cronograma">
      <p className="tenue">
        Análisis de riesgo del cronograma: la ruta crítica se recalcula en cada iteración, con las cuatro relaciones,
        desfases, calendarios con festivos de Colombia y riesgos que afectan varias actividades a la vez.
      </p>

      <div className="botonera">
        <button type="button" className={faltan ? '' : 'secundario'} onClick={() => void crear()} disabled={ocupado !== null || !faltan}
          title={faltan ? '' : 'El libro ya tiene las hojas del cronograma'}>
          Crear libro de cronograma
        </button>
        <button type="button" className="secundario" onClick={() => void revisar()} disabled={ocupado !== null || faltan}>Revisar calidad</button>
        <button type="button" className={faltan ? 'secundario' : ''} onClick={() => void simular()} disabled={ocupado !== null || faltan}>Simular cronograma</button>
      </div>

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

          <section>
            <h2>Riesgos: tornado por eliminación</h2>
            <Ayuda tema="eliminacion" />
            {sim.eliminacion.length === 0 ? <p className="tenue">El cronograma no tiene riesgos activos.</p> : (
              <>
                <p className="tenue">Cuánto bajaría el P80 del fin (en días) si el riesgo desapareciera, con los mismos números aleatorios.</p>
                <TornadoEliminacion filas={sim.eliminacion.map((e) => ({ id: e.id, nombre: e.nombre, valor: e.reduccionP80, ocurrencia: e.ocurrencia }))} />
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

function TornadoEliminacion({ filas }: { filas: readonly { id: string; nombre: string; valor: number; ocurrencia: number }[] }) {
  const mayor = Math.max(...filas.map((f) => Math.abs(f.valor)), 0.0001);
  return (
    <ul className="tornado-eliminacion">
      {filas.map((f) => (
        <li key={f.id}>
          <span className="nombre" title={f.nombre}>{f.id} · {f.nombre}</span>
          <span className="barra-fondo">
            <span className={`barra-valor${f.valor < 0 ? ' negativa' : ''}`} style={{ width: `${(100 * Math.abs(f.valor)) / mayor}%` }} />
          </span>
          <span className="cifra">{numero(f.valor, 3)} d</span>
        </li>
      ))}
    </ul>
  );
}
