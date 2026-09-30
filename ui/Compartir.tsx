/**
 * «Compartir el libro»: convertir las funciones RIESGO en entradas del panel
 * antes de enviar el libro, y deshacerlo. Ver `excel/compartir.ts`.
 *
 * Cuánto hay por restaurar lo lleva quien lo pinta (`useFormulasCompartidas`),
 * porque la pestaña Modelo pone esta sección **arriba** cuando el libro está
 * preparado: «Restaurar» es lo primero que hay que ver al volver a trabajar
 * con él (prueba J4, 27/09), y no el final de la pestaña.
 */

import { useEffect, useState } from 'react';

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { formulasCompartidasGuardadas, prepararParaCompartir, restaurarFuncionesRiesgo } from '../excel/compartir.ts';
import { miles } from './formato.ts';

/** Cuántas funciones RIESGO hay guardadas para restaurar (`null` mientras se lee). */
export function useFormulasCompartidas() {
  const [guardadas, setGuardadas] = useState<number | null>(null);
  useEffect(() => {
    void formulasCompartidasGuardadas().then(setGuardadas).catch(() => setGuardadas(0));
  }, []);
  return [guardadas, setGuardadas] as const;
}

export function Compartir({
  modelo,
  alCambiar,
  guardadas,
  setGuardadas,
}: {
  modelo: ModeloRiesgo;
  alCambiar: (m: ModeloRiesgo) => void;
  guardadas: number | null;
  setGuardadas: (f: (g: number | null) => number | null) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; detalles?: string[]; aviso?: boolean } | null>(null);
  const preparado = guardadas !== null && guardadas > 0;

  const preparar = async () => {
    setOcupado(true);
    setMensaje(null);
    try {
      const r = await prepararParaCompartir(modelo);
      const n = r.plan.conversiones.length;
      const fijadas = r.plan.congelar.length;
      if (n > 0) alCambiar(r.modelo);
      setGuardadas((g) => (g ?? 0) + n + fijadas);
      const partes = [
        n > 0 ? `Convertidas ${miles(n)} funciones RIESGO en entradas del panel; sus celdas tienen ahora la media.` : '',
        fijadas > 0
          ? `${miles(fijadas)} celdas con RIESGO dentro de una operación, con parámetros de otras celdas aleatorias o con funciones de resultados (RIESGO.MEDIA…) se quedan con su valor actual: mientras el libro esté preparado no variarán al simular.`
          : '',
      ].filter(Boolean);
      setMensaje({
        texto: partes.length === 0
          ? 'El libro no tiene funciones RIESGO que convertir: ya se puede compartir tal cual.'
          : `${partes.join(' ')} Guarda el libro (Ctrl+S) antes de enviarlo.`,
        ...(r.plan.noConvertibles.length > 0
          ? { detalles: r.plan.noConvertibles, aviso: true }
          : {}),
      });
    } catch (e) {
      setMensaje({ texto: `No se pudo preparar: ${e instanceof Error ? e.message : String(e)}`, aviso: true });
    } finally {
      setOcupado(false);
    }
  };

  const restaurar = async () => {
    setOcupado(true);
    setMensaje(null);
    try {
      const r = await restaurarFuncionesRiesgo(modelo);
      alCambiar(r.modelo);
      setGuardadas(() => 0);
      setMensaje({ texto: `Restauradas ${miles(r.restauradas)} funciones RIESGO; sus entradas del panel se han quitado.` });
    } catch (e) {
      setMensaje({ texto: `No se pudo restaurar: ${e instanceof Error ? e.message : String(e)}`, aviso: true });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className={preparado ? 'compartido' : undefined}>
      <h2>{preparado ? 'Libro preparado para compartir' : 'Compartir el libro'}</h2>
      {preparado && (
        <p>
          {miles(guardadas)} celdas con funciones RIESGO están preparadas: convertidas en entradas del
          panel o fijadas en su valor. Para volver a trabajar con ellas en sus celdas, pulsa{' '}
          <strong>Restaurar</strong>.
        </p>
      )}
      <p className="tenue">
        Quien abra el libro <strong>sin el complemento</strong> verá #¿NOMBRE? en las celdas con
        funciones RIESGO. «Preparar para compartir» las convierte en entradas del panel (que viajan
        con el libro) y deja en cada celda su media. Las entradas marcadas desde el panel no
        necesitan nada: ya se comparten bien.
      </p>
      <div className="fila-botones">
        {preparado && (
          <button type="button" onClick={() => void restaurar()} disabled={ocupado}>
            Restaurar las {miles(guardadas)} funciones RIESGO
          </button>
        )}
        <button type="button" className={preparado ? 'secundario' : undefined} onClick={() => void preparar()} disabled={ocupado}>
          {ocupado ? 'Trabajando…' : 'Preparar para compartir'}
        </button>
      </div>
      {mensaje && (
        <>
          <p className={mensaje.aviso ? 'aviso-linea' : 'tenue'}>{mensaje.texto}</p>
          {mensaje.detalles && (
            <>
              <p className="aviso-linea">No se han tocado, porque no se pueden convertir:</p>
              <ul className="motivos">{mensaje.detalles.map((d) => <li key={d}>{d}</li>)}</ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
