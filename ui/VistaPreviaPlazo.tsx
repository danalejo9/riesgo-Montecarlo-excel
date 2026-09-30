/**
 * V11: la vista previa del plazo mientras se edita. Un hook que escucha los
 * cambios de las hojas del cronograma y, pasada la espera, recalcula y
 * simula con pocas iteraciones (sin escribir nada en el libro), y la
 * tarjeta que lo enseña, marcada como vista previa.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  calcularCPM, leerCronograma, leerRiesgosPlazo, revisarSalud, riesgosActivos, simularPlazo, simularPlazoEnParalelo, OPCIONES_PLAZO_POR_DEFECTO,
  type FormaDuracion, type ResultadoSimulacionPlazo,
} from '../engine/cronograma/index.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';
import { escucharCambiosCronograma } from '../excel/cambiosCronograma.ts';
import { leerHojasCronograma } from '../excel/cronograma.ts';
import { crearHilosPlazo } from './motor/plazoNavegador.ts';
import { hilosEfectivos, leerPreferenciaHilos } from './motor/preferencias.ts';
import { textosCronograma as T } from './textos/es.ts';
import {
  ESPERAS_VISTA_PREVIA, ITERACIONES_VISTA_PREVIA, Programador, guardarVistaPrevia, leerVistaPrevia, type PreferenciasVistaPrevia,
} from './vistaPrevia.ts';

export interface VistaPrevia {
  r?: ResultadoSimulacionPlazo;
  /** Por qué no hay resultado (errores en las hojas, salud en rojo). */
  motivo?: string;
  cuando: Date;
  calculando: boolean;
}

export function useVistaPrevia(ocupado: string | null, forma: FormaDuracion) {
  const [prefs, setPrefs] = useState<PreferenciasVistaPrevia>(leerVistaPrevia);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [sinEventos, setSinEventos] = useState(false);
  const ocupadoRef = useRef(ocupado);
  ocupadoRef.current = ocupado;
  const programador = useRef<Programador | null>(null);

  const previsualizar = useCallback(async () => {
    if (ocupadoRef.current !== null) return; // una simulación completa en marcha manda
    setVista((v) => ({ ...(v ?? { cuando: new Date() }), calculando: true }));
    try {
      const hojas = await leerHojasCronograma();
      const lectura = leerCronograma(hojas.actividades, hojas.calendario, hojas.calendarios, hojas.clima);
      const c = lectura.cronograma;
      if (!c) {
        setVista({ motivo: T.previaErrores, cuando: new Date(), calculando: false });
        return;
      }
      const cpm = calcularCPM(c);
      if (!cpm.ok || revisarSalud(c.actividades, cpm.filas).bloquea) {
        setVista({ motivo: T.previaErrores, cuando: new Date(), calculando: false });
        return;
      }
      const riesgos = leerRiesgosPlazo(hojas.riesgos, c.actividades);
      if (riesgos.problemas.some((p) => p.gravedad === 'error')) {
        setVista({ motivo: T.previaErrores, cuando: new Date(), calculando: false });
        return;
      }
      const activos = riesgosActivos(riesgos.riesgos);
      const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: prefs.iteraciones, forma };
      const hilos = crearHilosPlazo(hilosEfectivos(leerPreferenciaHilos()));
      try {
        const r = hilos ? await simularPlazoEnParalelo(c, activos, op, hilos.para(c, activos, op), hilos.hilos) : await simularPlazo(c, activos, op);
        setVista({ r, cuando: new Date(), calculando: false });
      } finally {
        hilos?.cerrar();
      }
    } catch (e) {
      setVista({ motivo: e instanceof Error ? e.message : String(e), cuando: new Date(), calculando: false });
    }
  }, [prefs.iteraciones, forma]);

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
  /** Tras «Calcular cronograma»: la vista previa, ya. */
  const tras = () => void programador.current?.ahora();
  return { prefs, cambiar, vista, sinEventos, tras };
}

export function ControlesVistaPrevia({ prefs, cambiar, sinEventos, deshabilitado }: {
  prefs: PreferenciasVistaPrevia; cambiar: (p: Partial<PreferenciasVistaPrevia>) => void; sinEventos: boolean; deshabilitado: boolean;
}) {
  return (
    <p title={T.previaAyuda}>
      <label>
        <input type="checkbox" checked={prefs.activa} disabled={deshabilitado} onChange={(e) => cambiar({ activa: e.target.checked })} /> {T.previa}
      </label>{' '}
      {prefs.activa && (
        <>
          <select aria-label={T.previaIteraciones} value={prefs.iteraciones} onChange={(e) => cambiar({ iteraciones: Number(e.target.value) })}>
            {ITERACIONES_VISTA_PREVIA.map((n) => <option key={n} value={n}>{T.previaIteracionesOpcion(n)}</option>)}
          </select>{' '}
          <select aria-label={T.previaEspera} value={prefs.espera} onChange={(e) => cambiar({ espera: Number(e.target.value) })}>
            {ESPERAS_VISTA_PREVIA.map((s) => <option key={s} value={s}>{T.previaEsperaOpcion(s)}</option>)}
          </select>
          {sinEventos && <><br /><span className="tenue">{T.previaSinEventos}</span></>}
        </>
      )}
    </p>
  );
}

export function TarjetaVistaPrevia({ v, completa }: { v: VistaPrevia; completa?: ResultadoSimulacionPlazo }) {
  const r = v.r;
  return (
    <div className="vista-previa" style={{ border: '1px dashed var(--borde)', borderRadius: 4, padding: '6px 10px', margin: '8px 0' }}>
      <p style={{ margin: 0 }}>
        <strong style={{ fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{T.previaEtiqueta}</strong>{' '}
        <span className="tenue">{v.calculando ? T.previaCalculando : T.previaCuando(v.cuando.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), r?.iteraciones ?? 0)}</span>
      </p>
      {v.motivo && !v.calculando && <p className="aviso-linea" style={{ margin: '4px 0 0' }}>{v.motivo}</p>}
      {r && (
        <p style={{ margin: '4px 0 0' }}>
          P50 <strong>{textoFecha(r.fechas.p50)}</strong> · P80 <strong>{textoFecha(r.fechas.p80)}</strong> · {T.probCumplir} <strong>{Math.round(r.probDeterminista * 100)} %</strong>
          {completa && completa.fechas.p80 !== r.fechas.p80 && <span className="tenue"> · {T.previaFrente(textoFecha(completa.fechas.p80))}</span>}
        </p>
      )}
      <p className="tenue" style={{ margin: '4px 0 0', fontSize: 11 }}>{T.previaNota}</p>
    </div>
  );
}
