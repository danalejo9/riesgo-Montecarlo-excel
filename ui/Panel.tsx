/**
 * Panel de diagnóstico: el primer hito verificable de E3.
 *
 * Deliberadamente **no** simula nada. Su trabajo es contestar tres preguntas
 * que hasta ahora no se podían contestar sin Excel delante, y que condicionan
 * todo lo que venga después:
 *
 *   1. ¿Carga el complemento? (el heredado nunca llegó a hacerlo)
 *   2. ¿Qué conjuntos de `ExcelApi` hay en esta máquina? De eso depende qué
 *      APIs puede usar el adaptador, y difiere entre Windows y Mac.
 *   3. ¿Se puede leer el libro de verdad, en lote y sin errores?
 *
 * Es poco código a propósito: si algo del sideload está mal, es mucho mejor
 * descubrirlo aquí que dentro de un panel de mil líneas.
 */

import { useCallback, useEffect, useState } from 'react';

import { analizarCompatibilidad, type InformeCompatibilidad } from '../excel/compatibilidad.ts';
import { leerEntorno, versionMaximaDisponible, type EntornoOffice } from '../excel/entorno.ts';
import { leerLibro, type EstadisticasLectura } from '../excel/lectorLibro.ts';
import { leerSeleccion, type SeleccionLeida } from '../excel/seleccion.ts';

export function Panel() {
  const [entorno, setEntorno] = useState<EntornoOffice | null>(null);
  const [seleccion, setSeleccion] = useState<SeleccionLeida | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  const [estadisticas, setEstadisticas] = useState<EstadisticasLectura | null>(null);
  const [informe, setInforme] = useState<InformeCompatibilidad | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);

  useEffect(() => {
    try {
      setEntorno(leerEntorno());
    } catch (e) {
      setError(mensajeDe(e));
    }
  }, []);

  const alLeerSeleccion = useCallback(async () => {
    setLeyendo(true);
    setError(null);
    try {
      setSeleccion(await leerSeleccion());
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setLeyendo(false);
    }
  }, []);

  const alLeerLibro = useCallback(async () => {
    setLeyendo(true);
    setError(null);
    setInforme(null);
    setEstadisticas(null);
    setProgreso('Leyendo hojas…');
    try {
      const libro = await leerLibro({
        progreso: (hechas, total) => setProgreso(`Leyendo hojas… ${hechas} de ${total}`),
      });
      setEstadisticas(libro.estadisticas);
      setProgreso('Analizando fórmulas…');
      setInforme(analizarCompatibilidad(libro.formulas));
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setProgreso(null);
      setLeyendo(false);
    }
  }, []);

  return (
    <main>
      <header>
        <h1>Riesgo Monte Carlo</h1>
        <p className="version">Panel de diagnóstico · E3</p>
      </header>

      {error && (
        <section className="error">
          <h2>Algo falló</h2>
          <pre>{error}</pre>
        </section>
      )}

      <section>
        <h2>Entorno</h2>
        {!entorno ? (
          <p className="tenue">Leyendo…</p>
        ) : (
          <>
            <dl>
              <dt>Host</dt><dd>{entorno.host}</dd>
              <dt>Plataforma</dt><dd>{entorno.plataforma}</dd>
              <dt>Versión</dt><dd>{entorno.version}</dd>
              <dt>Idioma</dt><dd>{entorno.idioma}</dd>
              <dt>ExcelApi</dt><dd>hasta {versionMaximaDisponible(entorno)}</dd>
            </dl>

            <h3>Conjuntos de API disponibles</h3>
            <ul className="conjuntos">
              {entorno.conjuntos.map((c) => (
                <li key={c.version} className={c.disponible ? 'si' : 'no'}>
                  <span className="marca">{c.disponible ? '✓' : '✗'}</span>
                  <span className="nombre">ExcelApi {c.version}</span>
                  <span className="tenue">{c.para}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section>
        <h2>Lectura del libro</h2>
        <p className="tenue">
          Selecciona un rango en la hoja y pulsa el botón. Comprueba que el
          panel puede leer fórmulas de verdad, en una sola llamada a Excel.
        </p>
        <button type="button" onClick={() => void alLeerSeleccion()} disabled={leyendo}>
          {leyendo ? 'Leyendo…' : 'Leer la selección'}
        </button>

        {seleccion && (
          <dl>
            <dt>Dirección</dt><dd>{seleccion.direccion}</dd>
            <dt>Hoja</dt><dd>{seleccion.hoja}</dd>
            <dt>Tamaño</dt><dd>{seleccion.filas} × {seleccion.columnas}</dd>
            <dt>Con fórmula</dt><dd>{seleccion.celdasConFormula}</dd>
          </dl>
        )}
      </section>

      <section>
        <h2>Compatibilidad del libro</h2>
        <p className="tenue">
          Lee todas las hojas y analiza cada fórmula con el mismo motor que
          hará la simulación. Debería coincidir con lo que dice{' '}
          <code>npm run scan</code> sobre el mismo archivo: son dos caminos
          independientes hasta la misma respuesta.
        </p>
        <button type="button" onClick={() => void alLeerLibro()} disabled={leyendo}>
          {leyendo ? 'Trabajando…' : 'Analizar el libro'}
        </button>
        {progreso && <p className="tenue">{progreso}</p>}

        {estadisticas && (
          <dl>
            <dt>Hojas</dt>
            <dd>{estadisticas.hojasVisibles} visibles de {estadisticas.hojas}</dd>
            <dt>Con contenido</dt><dd>{miles(estadisticas.celdasConContenido)} celdas</dd>
            <dt>Recorridas</dt><dd>{miles(estadisticas.celdasRecorridas)} celdas</dd>
            <dt>Fórmulas</dt><dd>{miles(estadisticas.formulas)}</dd>
            <dt>Viajes a Excel</dt><dd>{estadisticas.sincronizaciones}</dd>
            <dt>Tiempo</dt><dd>{(estadisticas.milisegundos / 1000).toFixed(2)} s</dd>
          </dl>
        )}

        {informe && (
          <>
            <h3>
              {informe.noSoportadas.length === 0
                ? '✓ El motor sabe evaluar todas las funciones'
                : `${informe.noSoportadas.length} función(es) sin soporte`}
            </h3>
            <dl>
              <dt>Cobertura</dt><dd>{informe.cobertura} % de las fórmulas</dd>
              <dt>Evaluables</dt>
              <dd>{miles(informe.formulasEvaluables)} de {miles(informe.formulasAnalizadas)}</dd>
            </dl>

            {informe.noSoportadas.length > 0 && (
              <ul className="conjuntos">
                {informe.noSoportadas.slice(0, 20).map((f) => (
                  <li key={f.nombre} className="no">
                    <span className="marca">✗</span>
                    <span className="nombre">{f.nombre}</span>
                    <span className="tenue">{miles(f.veces)} usos · {f.ejemplo}</span>
                  </li>
                ))}
              </ul>
            )}

            {informe.formulasConErrorDeSintaxis > 0 && (
              <>
                {/*
                  Esto no es un problema del libro sino del parser del motor:
                  una fórmula válida en Excel que aquí no se entiende. Es
                  información valiosa y por eso se enseña aparte, con ejemplos.
                */}
                <h3>
                  {miles(informe.formulasConErrorDeSintaxis)} fórmula(s) que el
                  motor no supo leer
                </h3>
                <p className="tenue">
                  Son válidas en Excel; es el parser del motor el que se queda
                  corto. Estos ejemplos hacen falta para arreglarlo:
                </p>
                <pre className="ejemplos">
                  {informe.ejemplosDeErrorDeSintaxis.join('\n')}
                </pre>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function miles(n: number): string {
  return n.toLocaleString('es-ES');
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
