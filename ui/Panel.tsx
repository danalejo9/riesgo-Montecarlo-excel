/**
 * El panel: el ciclo completo del producto en tres pestañas.
 *
 * Deja de ser un panel de diagnóstico. Aquí se define el modelo, se simula y
 * se leen los resultados; el diagnóstico sigue estando, en su pestaña, porque
 * es lo primero que hay que mirar cuando algo no va.
 *
 * Lo que este archivo decide, y que no es evidente:
 *
 * **El modelo se carga al abrir y se guarda en cada cambio.** Vive en el
 * libro, así que abrir el complemento sobre un libro ya trabajado enseña el
 * modelo de quien lo hizo. Un modelo guardado que ya no valga —de una versión
 * anterior, corrupto— **no se pisa en silencio**: se enseña el problema y el
 * JSON crudo, y el usuario decide.
 *
 * **Cancelar es de verdad.** `debeCancelar` se consulta entre rondas de
 * bloques y cada pocas iteraciones en el modo compatible. Se guarda en una
 * `ref` y no en un estado porque el bucle lee su valor actual, no el que había
 * cuando empezó: con un `useState` capturaría el `false` inicial para siempre.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { leerEntorno, type EntornoOffice } from '../excel/entorno.ts';
import { guardarModelo, leerModelo } from '../excel/almacenModelo.ts';
import { aplicarResaltado } from '../excel/resaltado.ts';
import { guardarRitmo, leerRitmo, type RitmoGuardado } from '../excel/ritmo.ts';
import {
  ejecutarSimulacion,
  type AvanceSimulacion,
  type ResultadoSimulacionPanel,
} from '../excel/ejecutarSimulacion.ts';
import { modeloVacio, type ModeloRiesgo } from '../engine/modelo/index.ts';
import { Diagnostico } from './Diagnostico.tsx';
import { Modelo } from './Modelo.tsx';
import { Resultados } from './Resultados.tsx';
import { duracion, miles, porcentaje } from './formato.ts';

type Pestana = 'modelo' | 'resultados' | 'diagnostico';

export function Panel() {
  const [entorno, setEntorno] = useState<EntornoOffice | null>(null);
  const [pestana, setPestana] = useState<Pestana>('modelo');
  const [modelo, setModelo] = useState<ModeloRiesgo | null>(null);
  const [modeloInvalido, setModeloInvalido] = useState<{ errores: string[]; crudo: string } | null>(null);
  const [resultado, setResultado] = useState<ResultadoSimulacionPanel | null>(null);
  const [avance, setAvance] = useState<AvanceSimulacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [ritmo, setRitmo] = useState<RitmoGuardado | null>(null);
  const cancelado = useRef(false);

  useEffect(() => {
    try {
      setEntorno(leerEntorno());
    } catch (e) {
      setError(mensajeDe(e));
    }

    void (async () => {
      try {
        setRitmo((await leerRitmo()) ?? null);
      } catch {
        // Sin ritmo guardado se sigue igual: solo significa que todavía no se
        // puede estimar el tiempo del modo compatible.
      }
    })();

    void (async () => {
      try {
        const lectura = await leerModelo();
        if (lectura.estado === 'ok') setModelo(lectura.modelo);
        else if (lectura.estado === 'vacio') setModelo(modeloVacio());
        else setModeloInvalido({ errores: lectura.errores, crudo: lectura.crudo });
      } catch (e) {
        setError(mensajeDe(e));
      }
    })();
  }, []);

  const cambiarModelo = useCallback((m: ModeloRiesgo) => {
    setModelo((anterior) => {
      // El resaltado solo se rehace cuando cambian **las celdas**, no en cada
      // pulsación al renombrar una entrada: pintar la hoja es un viaje a Excel
      // y hacerlo por cada tecla se nota.
      if (anterior === null || refsDe(anterior) !== refsDe(m)) {
        void aplicarResaltado(m).catch((e: unknown) => setError(mensajeDe(e)));
      }
      return m;
    });

    void guardarModelo(m).then((r) => {
      if (!r.ok) setError(`El modelo no se pudo guardar:\n${r.errores.join('\n')}`);
    });
  }, []);

  const simular = useCallback(async () => {
    if (!modelo) return;
    cancelado.current = false;
    setSimulando(true);
    setError(null);
    setResultado(null);
    setAvance({ fase: 'resolviendo', mensaje: 'Preparando…' });

    try {
      const r = await ejecutarSimulacion({
        modelo,
        progreso: setAvance,
        debeCancelar: () => cancelado.current,
      });
      setResultado(r);
      if (r.ok) setPestana('resultados');

      // Un ritmo medido de verdad vale más que cualquier estimación, y es lo
      // que permite avisar **antes** la próxima vez.
      if (r.ok && r.motor === 'compatible' && r.iteracionesPorSegundo !== undefined && r.iteracionesPorSegundo > 0) {
        const medido: RitmoGuardado = {
          iteracionesPorSegundo: r.iteracionesPorSegundo,
          medidoEn: new Date().toISOString(),
          celdas: r.eleccion.celdasNecesarias,
        };
        setRitmo(medido);
        void guardarRitmo(medido);
      }
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setAvance(null);
      setSimulando(false);
    }
  }, [modelo]);

  return (
    <main>
      <header>
        <h1>Riesgo Monte Carlo</h1>
        <nav className="pestanas">
          {(['modelo', 'resultados', 'diagnostico'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={p === pestana ? 'activa' : ''}
              onClick={() => setPestana(p)}
              disabled={p === 'resultados' && !(resultado?.ok === true)}
            >
              {p === 'modelo' ? 'Modelo' : p === 'resultados' ? 'Resultados' : 'Diagnóstico'}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <section className="error">
          <h2>Algo falló</h2>
          <pre>{error}</pre>
        </section>
      )}

      {resultado && !resultado.ok && (
        <section className="error">
          <h2>{resultado.mensaje}</h2>
          <ul className="motivos">
            {resultado.detalles.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {avance && <Progreso avance={avance} alCancelar={() => (cancelado.current = true)} />}

      {modeloInvalido && (
        <section className="error">
          <h2>El modelo guardado en este libro no se entiende</h2>
          <ul className="motivos">
            {modeloInvalido.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="tenue">
            No se ha tocado nada. Puedes empezar un modelo nuevo —lo que hay se
            perderá— o cerrar el panel y recuperar una copia del libro.
          </p>
          <pre className="ejemplos">{modeloInvalido.crudo}</pre>
          <button
            type="button"
            onClick={() => {
              setModeloInvalido(null);
              cambiarModelo(modeloVacio());
            }}
          >
            Empezar un modelo nuevo
          </button>
        </section>
      )}

      {pestana === 'modelo' &&
        (modelo ? (
          <Modelo
            modelo={modelo}
            alCambiar={cambiarModelo}
            alSimular={() => void simular()}
            ocupado={simulando}
            ritmo={ritmo}
            alMedirRitmo={setRitmo}
          />
        ) : (
          !modeloInvalido && <p className="tenue">Leyendo el modelo del libro…</p>
        ))}

      {pestana === 'resultados' && resultado?.ok === true && <Resultados resultado={resultado} />}

      {pestana === 'diagnostico' && <Diagnostico entorno={entorno} alFallar={(e) => setError(mensajeDe(e))} />}
    </main>
  );
}

/**
 * El progreso. Con Excel en el bucle **se dice el ritmo medido y lo que
 * falta**, no una barra sin números: la diferencia entre esperar dos minutos
 * y esperar dos horas la tiene que saber el usuario mientras espera, no
 * después.
 */
function Progreso({ avance, alCancelar }: { avance: AvanceSimulacion; alCancelar: () => void }) {
  const pct = porcentaje(avance.completadas ?? 0, avance.totales ?? 0);
  const restantes = (avance.totales ?? 0) - (avance.completadas ?? 0);
  const ritmo = avance.iteracionesPorSegundo;

  return (
    <section className="progreso">
      <p>{avance.mensaje}</p>
      {avance.totales !== undefined && (
        <>
          <div className="barra" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="relleno" style={{ width: `${pct}%` }} />
          </div>
          <p className="tenue">
            {miles(avance.completadas ?? 0)} de {miles(avance.totales)}
            {ritmo !== undefined && ritmo > 0 && ` · ${miles(ritmo)} it/s · quedan ${duracion((restantes / ritmo) * 1000)}`}
          </p>
        </>
      )}
      <button type="button" className="plano" onClick={alCancelar}>
        Cancelar
      </button>
    </section>
  );
}

/** Las celdas del modelo, en una cadena que se puede comparar de un vistazo. */
function refsDe(m: ModeloRiesgo): string {
  return [...m.inputs.map((e) => e.ref), '|', ...m.outputs.map((s) => s.ref)].join(',');
}

/**
 * Los errores de Office.js no siempre son `Error`: a veces son un objeto con
 * `code` y `message`, y a veces traen un `debugInfo` que es lo único que
 * explica de verdad qué pasó. Perderlo por hacer `String(e)` cuesta horas.
 */
function mensajeDe(e: unknown): string {
  if (e instanceof Error) {
    const info = (e as { debugInfo?: unknown }).debugInfo;
    return info ? `${e.message}\n\n${JSON.stringify(info, null, 2)}` : e.message;
  }
  return typeof e === 'string' ? e : JSON.stringify(e, null, 2);
}
