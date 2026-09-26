/**
 * «Compartir el libro»: convertir las funciones RIESGO en entradas del panel
 * antes de enviar el libro, y deshacerlo. Ver `excel/compartir.ts`.
 */

import { useEffect, useState } from 'react';

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { formulasCompartidasGuardadas, prepararParaCompartir, restaurarFuncionesRiesgo } from '../excel/compartir.ts';
import { miles } from './formato.ts';

export function Compartir({ modelo, alCambiar }: { modelo: ModeloRiesgo; alCambiar: (m: ModeloRiesgo) => void }) {
  const [guardadas, setGuardadas] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; detalles?: string[]; aviso?: boolean } | null>(null);

  useEffect(() => {
    void formulasCompartidasGuardadas().then(setGuardadas).catch(() => setGuardadas(0));
  }, []);

  const preparar = async () => {
    setOcupado(true);
    setMensaje(null);
    try {
      const r = await prepararParaCompartir(modelo);
      const n = r.plan.conversiones.length;
      if (n > 0) alCambiar(r.modelo);
      setGuardadas((g) => (g ?? 0) + n);
      setMensaje({
        texto: n === 0
          ? 'El libro no tiene funciones RIESGO que convertir: ya se puede compartir tal cual.'
          : `Convertidas ${miles(n)} funciones RIESGO en entradas del panel; sus celdas tienen ahora la media. Guarda el libro (Ctrl+S) antes de enviarlo.`,
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
      setGuardadas(0);
      setMensaje({ texto: `Restauradas ${miles(r.restauradas)} funciones RIESGO; sus entradas del panel se han quitado.` });
    } catch (e) {
      setMensaje({ texto: `No se pudo restaurar: ${e instanceof Error ? e.message : String(e)}`, aviso: true });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section>
      <h2>Compartir el libro</h2>
      <p className="tenue">
        Quien abra el libro <strong>sin el complemento</strong> verá #¿NOMBRE? en las celdas con
        funciones RIESGO. «Preparar para compartir» las convierte en entradas del panel (que viajan
        con el libro) y deja en cada celda su media. Las entradas marcadas desde el panel no
        necesitan nada: ya se comparten bien.
      </p>
      <div className="fila-botones">
        <button type="button" onClick={() => void preparar()} disabled={ocupado}>
          {ocupado ? 'Trabajando…' : 'Preparar para compartir'}
        </button>
        {guardadas !== null && guardadas > 0 && (
          <button type="button" className="plano" onClick={() => void restaurar()} disabled={ocupado}>
            Restaurar las {miles(guardadas)} funciones RIESGO
          </button>
        )}
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
