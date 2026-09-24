/**
 * La pestaña de diagnóstico: lo que fue el panel entero en el primer hito de
 * E3, ahora en su sitio.
 *
 * No simula nada, y sigue haciendo falta. Contesta las preguntas que solo se
 * pueden contestar con Excel delante —¿qué APIs hay en esta máquina?, ¿se lee
 * el libro?, ¿qué funciones del libro conoce el motor?— y son las primeras que
 * hay que mirar cuando algo no va. Que el informe de compatibilidad de aquí
 * coincida con el de `npm run scan` sobre el mismo archivo es, además, la
 * comprobación más honesta que tenemos: dos caminos independientes hasta la
 * misma respuesta.
 */

import { useCallback, useEffect, useState } from 'react';

import { leerAjustesGuardados } from '../excel/almacenModelo.ts';
import { leerRegionalDeExcel, type RegionalLeida } from '../excel/regional.ts';
import { analizarCompatibilidad, type InformeCompatibilidad } from '../excel/compatibilidad.ts';
import { versionMaximaDisponible, type EntornoOffice } from '../excel/entorno.ts';
import { leerLibro, type EstadisticasLectura } from '../excel/lectorLibro.ts';
import { leerSeleccion, type SeleccionLeida } from '../excel/seleccion.ts';
import { duracion, miles } from './formato.ts';

export function Diagnostico({ entorno, alFallar }: { entorno: EntornoOffice | null; alFallar: (e: unknown) => void }) {
  const [seleccion, setSeleccion] = useState<SeleccionLeida | null>(null);
  const [estadisticas, setEstadisticas] = useState<EstadisticasLectura | null>(null);
  const [informe, setInforme] = useState<InformeCompatibilidad | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [ajustes, setAjustes] = useState<Array<{ clave: string; valor: string }> | null>(null);
  const [regional, setRegional] = useState<RegionalLeida | null>(null);

  useEffect(() => {
    leerRegionalDeExcel().then(setRegional, () => setRegional(null));
  }, []);

  const alLeerSeleccion = useCallback(async () => {
    setOcupado(true);
    try {
      setSeleccion(await leerSeleccion());
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(false);
    }
  }, [alFallar]);

  const alLeerLibro = useCallback(async () => {
    setOcupado(true);
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
      alFallar(e);
    } finally {
      setProgreso(null);
      setOcupado(false);
    }
  }, [alFallar]);

  const alLeerAjustes = useCallback(async () => {
    setOcupado(true);
    try {
      setAjustes(await leerAjustesGuardados());
    } catch (e) {
      alFallar(e);
    } finally {
      setOcupado(false);
    }
  }, [alFallar]);

  return (
    <>
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
              {regional && (
                <>
                  <dt>Separadores</dt>
                  <dd>
                    decimal «{regional.regional.decimal}» · miles «{regional.regional.miles === '\u00a0' ? 'espacio' : regional.regional.miles}»
                    {regional.origen === 'deducida' && ' (deducidos del idioma: esta versión de Excel no los expone)'}
                  </dd>
                  <dt>Lógicos</dt>
                  <dd>{regional.regional.verdadero} / {regional.regional.falso}</dd>
                </>
              )}
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
        <h2>Lectura de la selección</h2>
        <button type="button" onClick={() => void alLeerSeleccion()} disabled={ocupado}>
          Leer la selección
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
        <h2>Lo que hay guardado en este libro</h2>
        <p className="tenue">
          El modelo, el resaltado y el ritmo medido viven dentro del archivo, en
          los ajustes del complemento. Si algo se pierde al cerrar y reabrir, lo
          primero es mirar si de verdad está aquí.
        </p>
        <button type="button" onClick={() => void alLeerAjustes()} disabled={ocupado}>
          Ver los ajustes guardados
        </button>

        {ajustes !== null && (
          ajustes.length === 0 ? (
            <p className="aviso-linea">
              No hay nada guardado en este libro. Si acabas de definir un modelo,
              esto es el fallo: cuéntamelo.
            </p>
          ) : (
            <pre className="ejemplos">
              {ajustes.map((a) => `${a.clave}\n${a.valor}\n`).join('\n')}
            </pre>
          )
        )}
      </section>

      <section>
        <h2>Compatibilidad del libro</h2>
        <p className="tenue">
          Analiza cada fórmula con el mismo motor que hará la simulación.
          Debería coincidir con lo que dice <code>npm run scan</code> sobre el
          mismo archivo: son dos caminos independientes hasta la misma respuesta.
        </p>
        <button type="button" onClick={() => void alLeerLibro()} disabled={ocupado}>
          Analizar el libro
        </button>
        {progreso && <p className="tenue">{progreso}</p>}

        {estadisticas && (
          <dl>
            <dt>Hojas</dt>
            <dd>{estadisticas.hojasVisibles} visibles de {estadisticas.hojas}</dd>
            <dt>Con contenido</dt><dd>{miles(estadisticas.celdasConContenido)} celdas</dd>
            <dt>Fórmulas</dt><dd>{miles(estadisticas.formulas)}</dd>
            <dt>Viajes a Excel</dt><dd>{estadisticas.sincronizaciones}</dd>
            <dt>Tiempo</dt><dd>{duracion(estadisticas.milisegundos)}</dd>
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
                  una fórmula válida en Excel que aquí no se entiende.
                */}
                <h3>{miles(informe.formulasConErrorDeSintaxis)} fórmula(s) que el motor no supo leer</h3>
                <p className="tenue">
                  Son válidas en Excel; es el parser del motor el que se queda corto.
                  Estos ejemplos hacen falta para arreglarlo:
                </p>
                <pre className="ejemplos">{informe.ejemplosDeErrorDeSintaxis.join('\n')}</pre>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}
