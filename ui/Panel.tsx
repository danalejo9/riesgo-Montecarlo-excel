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
import {
  guardarEscenarios, guardarModelo, guardarResultados, leerEscenariosGuardados, leerModelo, leerResultadosGuardados,
} from '../excel/almacenModelo.ts';
import {
  elegirActivo, guardarEscenario, quitarEscenario, restaurarEscenarios, serializarEscenarios, vacio as sinEscenarios,
  type AlmacenEscenarios,
} from '../excel/escenarios.ts';
import { huellaModelo, restaurarResultados, serializarResultados } from '../excel/resultadosGuardados.ts';
import { aLocaleDelModelo, leerRegionalDeExcel } from '../excel/regional.ts';
import { aplicarResaltado, recordarCeldasRiesgo } from '../excel/resaltado.ts';
import { publicarRestaurados, publicarResultados, refrescarCeldas } from '../excel/almacenResultadosHoja.ts';
import { guardarRitmo, leerRitmo, type RitmoGuardado } from '../excel/ritmo.ts';
import {
  ejecutarSimulacion,
  type AvanceSimulacion,
  type ResultadoSimulacionPanel,
} from '../excel/ejecutarSimulacion.ts';
import { modeloVacio, type ModeloRiesgo } from '../engine/modelo/index.ts';
import { Diagnostico } from './Diagnostico.tsx';
import { Configuracion } from './Configuracion.tsx';
import { crearPoolNavegador } from './motor/poolNavegador.ts';
import { compensanHilos } from '../engine/executor/pool.ts';
import { hilosEfectivos, leerCongelarPantalla, leerPreferenciaHilos } from './motor/preferencias.ts';
import { Modelo } from './Modelo.tsx';
import { Resultados } from './Resultados.tsx';
import { duracion, miles, porcentaje } from './formato.ts';
import { escribirFragmento } from './fragmento.ts';

type Pestana = 'modelo' | 'resultados' | 'diagnostico' | 'configuracion';

/**
 * La pestaña que pide la URL: cada botón de la cinta abre el panel con su
 * fragmento (`taskpane.html#resultados`). Sin fragmento, o con uno que no es
 * una pestaña, el modelo.
 */
export function pestanaDeFragmento(hash: string): Pestana {
  const h = hash.replace(/^#/, '').toLowerCase();
  return h === 'resultados' || h === 'diagnostico' || h === 'configuracion' ? h : 'modelo';
}

const PREFIJO_FALLO_GUARDADO = 'El modelo no se pudo guardar:';

export function Panel() {
  const [entorno, setEntorno] = useState<EntornoOffice | null>(null);
  const [pestana, setPestana] = useState<Pestana>(() => pestanaDeFragmento(window.location.hash));
  const [modelo, setModelo] = useState<ModeloRiesgo | null>(null);
  const [modeloInvalido, setModeloInvalido] = useState<{ errores: string[]; crudo: string } | null>(null);
  const [resultado, setResultado] = useState<ResultadoSimulacionPanel | null>(null);
  const [avance, setAvance] = useState<AvanceSimulacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [ritmo, setRitmo] = useState<RitmoGuardado | null>(null);
  const [guardado, setGuardado] = useState<EstadoGuardado>({ estado: 'sin-cambios' });
  const [escenarios, setEscenarios] = useState<AlmacenEscenarios>(sinEscenarios);
  /** Las celdas del modelo la última vez que se pintó la hoja. Ver `cambiarModelo`. */
  const refsPintadas = useRef<string | null>(null);
  const cancelado = useRef(false);

  // Si Office vuelve a navegar con el panel abierto (otro botón de la cinta),
  // solo cambia el fragmento: no hay recarga, y los resultados siguen ahí.
  useEffect(() => {
    // La pestaña visible queda escrita en el fragmento, sin disparar
    // "hashchange" (replaceState no lo hace). Así, pulsar en la cinta el botón
    // de otra pestaña siempre cambia la URL y siempre se nota.
    // Ver `fragmento.ts`: dentro de Excel, Office.js anula replaceState.
    escribirFragmento(pestana);
  }, [pestana]);

  useEffect(() => {
    const alCambiar = () => setPestana(pestanaDeFragmento(window.location.hash));
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

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
        if (lectura.estado === 'invalido') {
          setModeloInvalido({ errores: lectura.errores, crudo: lectura.crudo });
          return;
        }

        const base = lectura.estado === 'ok' ? lectura.modelo : modeloVacio();

        // Los resultados de la última simulación, y los escenarios con los que
        // compararlos, si el libro los trae.
        if (lectura.estado === 'ok') {
          void leerEscenariosGuardados()
            .then(({ texto, legado }) => setEscenarios(restaurarEscenarios(texto, legado)))
            .catch(() => {
              // Sin escenarios legibles, no hay comparación: nada más.
            });
          void leerResultadosGuardados()
            .then((texto) => {
              if (!texto) return;
              const r = restaurarResultados(texto);
              // Solo si no se ha simulado ya en esta sesión mientras se leía.
              if (!r.ok) return;
              setResultado((actual) => actual ?? r.resultado);
              recordarCeldasRiesgo((r.resultado.entradasDeFunciones ?? []).map((e) => e.ref));
              // B6: que RIESGO.MEDIA y compañía tengan los resultados también en otro equipo.
              void publicarRestaurados(r.resultado).catch(() => {});
            })
            .catch(() => {
              // Sin resultados guardados legibles se abre como un libro sin simular.
            });
        }

        // La configuración regional se lee de Excel la primera vez y se guarda
        // con el modelo: es parte de lo que el modelo significa (`VALOR("1,5")`
        // vale 1,5 en un libro español y es un error en uno inglés). Un modelo
        // que ya la trae la conserva, aunque se abra en otro Excel: el libro
        // se escribió con esos separadores.
        if (base.settings.locale) {
          setModelo(base);
        } else {
          const { regional } = await leerRegionalDeExcel();
          const conLocale = { ...base, settings: { ...base.settings, locale: aLocaleDelModelo(regional) } };
          setModelo(conLocale);
          // Un modelo vacío no se guarda solo por esto: no hay nada que
          // conservar todavía, y escribir en un libro recién abierto sin que el
          // usuario haya hecho nada lo marcaría como modificado.
          if (lectura.estado === 'ok') void guardarModelo(conLocale);
        }
      } catch (e) {
        setError(mensajeDe(e));
      }
    })();
  }, []);

  const cambiarModelo = useCallback((m: ModeloRiesgo) => {
    setModelo(m);

    // El resaltado solo se rehace cuando cambian **las celdas**, no en cada
    // pulsación al renombrar una entrada: pintar la hoja es un viaje a Excel y
    // hacerlo por cada tecla se nota. La comparación va en una `ref` y no
    // dentro del actualizador de estado porque React puede invocar ese
    // actualizador dos veces (lo hace en modo estricto), y entonces el efecto
    // se ejecutaría por duplicado.
    const refs = refsDe(m);
    if (refsPintadas.current !== refs) {
      refsPintadas.current = refs;
      void aplicarResaltado(m).catch((e: unknown) => setError(mensajeDe(e)));
    }

    setGuardado({ estado: 'guardando' });
    void guardarModelo(m).then(
      (r) => {
        if (!r.ok) {
          setGuardado({ estado: 'fallo', detalle: r.errores.join('\n') });
          setError(`${PREFIJO_FALLO_GUARDADO}\n${r.errores.join('\n')}`);
        } else {
          setGuardado({ estado: r.verificado ? 'guardado' : 'sin-verificar', cuando: new Date() });
          // Un fallo de guardado anterior ya no aplica: el modelo actual sí se guardó.
          setError((previo) => (previo?.startsWith(PREFIJO_FALLO_GUARDADO) ? null : previo));
        }
      },
      (e: unknown) => setGuardado({ estado: 'fallo', detalle: mensajeDe(e) }),
    );
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
        congelarPantalla: leerCongelarPantalla(),
        crearPool: (contexto, { iteraciones }) => {
          const preferencia = leerPreferenciaHilos();
          // F4: en automático, una simulación pequeña va en un hilo (arrancar
          // varios tarda más de lo que ahorran). Si el usuario eligió los
          // núcleos a mano, se respeta.
          if (preferencia === 'auto' && !compensanHilos(contexto.plan, iteraciones)) return null;
          return crearPoolNavegador(contexto, hilosEfectivos(preferencia));
        },
      });
      const conHuella = r.ok ? { ...r, huellaModelo: huellaModelo(modelo), idSimulacion: new Date().toISOString() } : r;
      setResultado(conHuella);
      if (conHuella.ok) {
        setPestana('resultados');
        // E8: las celdas con RIESGO.* se conocen ahora; se pintan con su color.
        recordarCeldasRiesgo((conHuella.entradasDeFunciones ?? []).map((e) => e.ref));
        void aplicarResaltado(modelo).catch(() => {});
        // B6: los resultados, para las funciones RIESGO.MEDIA, PERCENTIL…
        void publicarResultados(conHuella)
          .then(() => refrescarCeldas(conHuella.celdasConResultados ?? []))
          .catch(() => {});
        // Guardarlos no puede estropear la simulación: si falla, se dice y ya.
        void guardarResultados(serializarResultados(modelo, conHuella)).catch((e: unknown) =>
          setError(`Los resultados no se pudieron guardar en el libro: ${mensajeDe(e)}`),
        );
      }

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
            >
              {p === 'modelo' ? 'Modelo' : p === 'resultados' ? 'Resultados' : 'Diagnóstico'}
            </button>
          ))}
          <button
            type="button"
            className={`engranaje${pestana === 'configuracion' ? ' activa' : ''}`}
            onClick={() => setPestana('configuracion')}
            aria-label="Configuración"
            title="Configuración"
          >
            ⚙
          </button>
        </nav>
      </header>

      {error && (
        <section className="error">
          <div className="error-cabecera">
            <h2>Algo falló</h2>
            <button type="button" className="cerrar-error" aria-label="Cerrar el aviso" title="Cerrar el aviso" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
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

      {modelo && <Guardado estado={guardado} />}

      {pestana === 'modelo' &&
        (modelo ? (
          <Modelo
            modelo={modelo}
            alCambiar={cambiarModelo}
            alSimular={() => void simular()}
            ocupado={simulando}
            ritmo={ritmo}
            alMedirRitmo={setRitmo}
            alAbrirConfiguracion={() => setPestana('configuracion')}
          />
        ) : (
          !modeloInvalido && <p className="tenue">Leyendo el modelo del libro…</p>
        ))}

      {pestana === 'resultados' && !(resultado?.ok === true) && !simulando && (
        <section>
          <h2>Todavía no hay resultados</h2>
          <p className="tenue">
            Simula desde la pestaña Modelo y aparecerán aquí. Los resultados
            viven mientras el panel está abierto: para conservarlos, vuélcalos a
            una hoja del libro.
          </p>
          <button type="button" onClick={() => setPestana('modelo')}>Ir al modelo</button>
        </section>
      )}

      {pestana === 'resultados' && resultado?.ok === true && modelo && (
        <Resultados
          modelo={modelo}
          resultado={resultado}
          alCambiarModelo={cambiarModelo}
          escenarios={escenarios}
          alCambiarEscenarios={(accion) => {
            let nuevo: AlmacenEscenarios;
            if (accion.tipo === 'guardar') {
              const r = guardarEscenario(escenarios, accion.etiqueta, resultado);
              if (!r.ok) {
                setError(r.motivo);
                return;
              }
              nuevo = r.almacen;
            } else if (accion.tipo === 'quitar') {
              nuevo = quitarEscenario(escenarios, accion.id);
            } else {
              nuevo = elegirActivo(escenarios, accion.id);
            }
            setEscenarios(nuevo);
            void guardarEscenarios(serializarEscenarios(modelo, nuevo)).catch((e: unknown) =>
              setError(`Los escenarios no se pudieron guardar en el libro: ${mensajeDe(e)}`),
            );
          }}
        />
      )}

      {pestana === 'configuracion' && modelo && (
        <Configuracion
          modelo={modelo}
          alCambiar={cambiarModelo}
          hilosUltimaSimulacion={resultado?.ok ? resultado.hilos : undefined}
        />
      )}

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

type EstadoGuardado =
  | { estado: 'sin-cambios' }
  | { estado: 'guardando' }
  | { estado: 'guardado'; cuando: Date }
  | { estado: 'sin-verificar'; cuando: Date }
  | { estado: 'fallo'; detalle: string };

/**
 * Que el modelo está guardado **en el libro**, y qué falta para que sobreviva.
 *
 * El usuario reportó que tras simular, guardar el libro y reabrirlo tuvo que
 * volver a marcarlo todo. El modelo vive en `workbook.settings`, que viaja
 * dentro del `.xlsx`, así que hay dos pasos y solo uno es nuestro: el
 * complemento escribe el ajuste, y **Excel lo persiste cuando el usuario
 * guarda el archivo**. Sin decir esto en voz alta, los dos pasos parecen uno
 * y su fallo es indistinguible.
 *
 * Por eso aquí se enseña lo que sabemos con certeza —el ajuste se escribió y
 * se pudo releer— y se recuerda lo que no depende de nosotros.
 */
function Guardado({ estado }: { estado: EstadoGuardado }) {
  if (estado.estado === 'sin-cambios') return null;

  if (estado.estado === 'guardando') return <p className="tenue guardado">Guardando en el libro…</p>;

  if (estado.estado === 'fallo') {
    return <p className="aviso-linea">No se pudo guardar el modelo en el libro: {estado.detalle}</p>;
  }

  if (estado.estado === 'sin-verificar') {
    return (
      <p className="aviso-linea">
        El modelo se escribió pero Excel no lo devolvió al releerlo. Cuéntamelo:
        es justo el fallo que haría que se perdiera al cerrar el libro.
      </p>
    );
  }

  return (
    <p className="tenue guardado">
      ✓ Modelo guardado en el libro a las {estado.cuando.toLocaleTimeString('es-ES')} ·{' '}
      <strong>guarda el archivo</strong> (Ctrl+S) para que sobreviva al cerrarlo.
    </p>
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
