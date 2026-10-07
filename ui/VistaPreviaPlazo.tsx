/**
 * V11: la vista previa del plazo mientras se edita. Un hook que escucha los
 * cambios de las hojas del cronograma y, pasada la espera, lee, revisa y
 * simula con pocas iteraciones (solo la corrida principal, sin escribir nada
 * en el libro), y la tarjeta que lo enseña, marcada como vista previa. Las
 * preferencias son de este equipo (`vistaPrevia.ts`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { chequearCalidad, resumirTiempo, simularCronograma, type ResumenTiempo, type SimulacionCronograma } from '../engine/cronograma/index.ts';
import { escucharCambiosCronograma } from '../excel/cambiosCronograma.ts';
import { leerCronograma } from '../excel/cronogramaHojas.ts';
import { leerHojasCronograma } from '../excel/cronogramaLibro.ts';
import { formatoDe, miles, numero } from './formato.ts';
import { ESPERAS_VISTA_PREVIA, ITERACIONES_VISTA_PREVIA, Programador, guardarVistaPrevia, leerVistaPrevia, type PreferenciasVistaPrevia } from './vistaPrevia.ts';

const FECHA = formatoDe(true);

export interface VistaPrevia {
  fin?: ResumenTiempo;
  iteraciones?: number;
  /** Por qué no hay resultado (errores en las hojas, calidad en rojo). */
  motivo?: string;
  cuando: Date;
  calculando: boolean;
}

const p80 = (r: ResumenTiempo) => r.percentiles.find((x) => Math.abs(x.p - 0.8) < 1e-9)?.serie ?? NaN;
const p50 = (r: ResumenTiempo) => r.percentiles.find((x) => Math.abs(x.p - 0.5) < 1e-9)?.serie ?? NaN;

export function useVistaPrevia(ocupado: string | null) {
  const [prefs, setPrefs] = useState<PreferenciasVistaPrevia>(leerVistaPrevia);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [sinEventos, setSinEventos] = useState(false);
  const ocupadoRef = useRef(ocupado);
  useEffect(() => { ocupadoRef.current = ocupado; }, [ocupado]);
  const programador = useRef<Programador | null>(null);

  const previsualizar = useCallback(async () => {
    if (ocupadoRef.current !== null) return; // una simulación completa en marcha manda
    setVista((v) => ({ ...(v ?? { cuando: new Date() }), calculando: true }));
    try {
      const lectura = leerCronograma(await leerHojasCronograma());
      if (!lectura.modelo) {
        setVista({ motivo: `El cronograma tiene ${lectura.errores.length === 1 ? 'un error' : `${lectura.errores.length} errores`}: «Revisar calidad» los enseña.`, cuando: new Date(), calculando: false });
        return;
      }
      const m = lectura.modelo;
      if (chequearCalidad(m).bloquea) {
        setVista({ motivo: 'La red no se puede calcular (un ciclo o una referencia rota): «Revisar calidad» lo enseña.', cuando: new Date(), calculando: false });
        return;
      }
      const sim: SimulacionCronograma = await simularCronograma(
        { ...m, configuracion: { ...m.configuracion, iteraciones: prefs.iteraciones, iteracionesAutomaticas: false } }, { soloPrincipal: true });
      setVista({ fin: resumirTiempo(sim.fin, sim.deterministico.fin, m.configuracion.fechaMeta), iteraciones: sim.iteraciones, cuando: new Date(), calculando: false });
    } catch (e) {
      setVista({ motivo: e instanceof Error ? e.message : String(e), cuando: new Date(), calculando: false });
    }
  }, [prefs.iteraciones]);

  useEffect(() => {
    if (!prefs.activa) {
      setVista(null);
      return;
    }
    const prog = new Programador(prefs.espera * 1000, previsualizar);
    programador.current = prog;
    let dejar: (() => Promise<void>) | null = null;
    let vivo = true;
    void escucharCambiosCronograma(() => prog.avisar()).then((d) => {
      if (!vivo) void d?.();
      else {
        dejar = d;
        setSinEventos(d === null);
      }
    });
    // Al activarla, una primera vista previa sin esperar a editar.
    void prog.ahora();
    return () => {
      vivo = false;
      prog.cancelar();
      programador.current = null;
      void dejar?.().catch(() => {});
    };
  }, [prefs.activa, prefs.espera, previsualizar]);

  const cambiar = (p: Partial<PreferenciasVistaPrevia>) => {
    const n = { ...prefs, ...p };
    guardarVistaPrevia(n);
    setPrefs(n);
  };
  /** Tras simular o revisar: la vista previa, ya. */
  const tras = useCallback(() => void programador.current?.ahora(), []);
  return { prefs, cambiar, vista, sinEventos, tras };
}

export function ControlesVistaPrevia({ prefs, cambiar, sinEventos, deshabilitado }: {
  prefs: PreferenciasVistaPrevia; cambiar: (p: Partial<PreferenciasVistaPrevia>) => void; sinEventos: boolean; deshabilitado: boolean;
}) {
  return (
    <p className="controles-vista-previa" title="Mientras edita las hojas, recalcula el plazo con pocas iteraciones para ver hacia dónde se mueve. No escribe nada en el libro.">
      <label>
        <input type="checkbox" checked={prefs.activa} disabled={deshabilitado} onChange={(e) => cambiar({ activa: e.target.checked })} /> Vista previa del plazo mientras edito
      </label>{' '}
      {prefs.activa && (
        <>
          <select aria-label="Iteraciones de la vista previa" value={prefs.iteraciones} onChange={(e) => cambiar({ iteraciones: Number(e.target.value) })}>
            {ITERACIONES_VISTA_PREVIA.map((n) => <option key={n} value={n}>{miles(n)} iteraciones</option>)}
          </select>{' '}
          <select aria-label="Espera tras la última edición" value={prefs.espera} onChange={(e) => cambiar({ espera: Number(e.target.value) })}>
            {ESPERAS_VISTA_PREVIA.map((s) => <option key={s} value={s}>{s === 1 ? 'a 1 s' : `a ${s} s`} de la última edición</option>)}
          </select>
          {sinEventos && <><br /><span className="tenue">Este Excel no avisa de las ediciones: la vista previa se actualiza al simular o revisar la calidad.</span></>}
        </>
      )}
    </p>
  );
}

export function TarjetaVistaPrevia({ v, completa }: { v: VistaPrevia; completa?: ResumenTiempo | null }) {
  const r = v.fin;
  return (
    <div className="vista-previa">
      <p>
        <strong className="etiqueta-vista-previa">Vista previa</strong>{' '}
        <span className="tenue">{v.calculando ? 'calculando…' : `a las ${v.cuando.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}${v.iteraciones ? `, ${miles(v.iteraciones)} iteraciones` : ''}`}</span>
      </p>
      {v.motivo && !v.calculando && <p className="aviso-linea">{v.motivo}</p>}
      {r && (
        <p>
          P50 <strong>{FECHA.valor(p50(r))}</strong> · P80 <strong>{FECHA.valor(p80(r))}</strong> · cumple el cronograma: <strong>{numero(100 * r.probabilidadDeterministica, 2)} %</strong>
          {r.probabilidadMeta !== null && <> · la meta: <strong>{numero(100 * r.probabilidadMeta, 2)} %</strong></>}
          {completa && p80(completa) !== p80(r) && <span className="tenue"> · la última simulación completa dio el P80 el {FECHA.valor(p80(completa))}</span>}
        </p>
      )}
      <p className="tenue nota-vista-previa">Con pocas iteraciones y sin el tornado: orienta, pero las cifras para decidir son las de «Simular cronograma».</p>
    </div>
  );
}
