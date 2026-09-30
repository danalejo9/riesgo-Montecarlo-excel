/**
 * Pestaña «Cronograma» (bloque P). Hoy, P0–P1: la plantilla y el camino
 * crítico determinista. El chequeo de salud (P2) y el Monte Carlo del plazo
 * (P3) se añaden aquí mismo.
 */

import { useState } from 'react';

import { calcularCPM, leerCronograma, type ProblemaCronograma, type ResultadoCPM } from '../engine/cronograma/index.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';
import { tieneCapacidad } from '../engine/licencia/capacidades.ts';
import { escribirPlantillaCronograma, escribirResultadoCPM, leerHojasCronograma } from '../excel/cronograma.ts';
import { textosCronograma as T } from './textos/es.ts';

type Calculado = Extract<ResultadoCPM, { ok: true }> & { hoja: string };

export function Cronograma({ alFallar }: { alFallar: (e: unknown) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [problemas, setProblemas] = useState<ProblemaCronograma[]>([]);
  const [resultado, setResultado] = useState<Calculado | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  if (!tieneCapacidad('cronograma')) {
    return <section><p className="aviso-linea">{T.sinCapacidad}</p></section>;
  }

  const calcular = async () => {
    setOcupado(true);
    setNota(null);
    try {
      const hojas = await leerHojasCronograma();
      const lectura = leerCronograma(hojas.actividades, hojas.calendario);
      if (!lectura.cronograma) {
        setProblemas(lectura.problemas);
        setResultado(null);
        return;
      }
      const r = calcularCPM(lectura.cronograma);
      if (!r.ok) {
        setProblemas([...lectura.problemas, ...r.problemas]);
        setResultado(null);
        return;
      }
      const hoja = await escribirResultadoCPM(r);
      setProblemas([...lectura.problemas, ...r.avisos]);
      setResultado({ ...r, hoja });
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(false);
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

  return (
    <section>
      <h2>{T.titulo}</h2>
      <p className="tenue">{T.intro}</p>
      <p>
        <button type="button" onClick={calcular} disabled={ocupado}>{ocupado ? T.calculando : T.calcular}</button>{' '}
        <button type="button" onClick={plantilla} title={T.plantillaAyuda}>{T.plantilla}</button>
      </p>
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

      {resultado && errores.length === 0 && (
        <>
          <div className="cifras">
            <div><span className="cifra">{textoFecha(resultado.fechaFinProyecto)}</span><span className="cifra-nombre">{T.finProyecto}</span></div>
            <div><span className="cifra">{resultado.duracionProyecto}</span><span className="cifra-nombre">{T.dias}</span></div>
            <div><span className="cifra">{criticas.length} / {resultado.filas.length}</span><span className="cifra-nombre">{T.criticas}</span></div>
          </div>
          <p className="tenue">{T.rutaCritica}: {criticas.map((f) => f.nombre).join(' → ')}</p>
          <p className="tenue">{T.escritoEn(resultado.hoja)}</p>
        </>
      )}
    </section>
  );
}
