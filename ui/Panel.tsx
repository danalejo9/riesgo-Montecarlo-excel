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

import { leerEntorno, versionMaximaDisponible, type EntornoOffice } from '../excel/entorno.ts';
import { leerSeleccion, type SeleccionLeida } from '../excel/seleccion.ts';

export function Panel() {
  const [entorno, setEntorno] = useState<EntornoOffice | null>(null);
  const [seleccion, setSeleccion] = useState<SeleccionLeida | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

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
    </main>
  );
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
