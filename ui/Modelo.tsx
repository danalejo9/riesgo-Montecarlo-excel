/**
 * La pestaña del modelo: qué celdas son inciertas, qué se está midiendo y con
 * cuántas iteraciones.
 *
 * Es la parte del complemento con la que el usuario pasa más tiempo, así que
 * dos decisiones la gobiernan:
 *
 * **Se marca desde la selección, no escribiendo direcciones.** El usuario ya
 * tiene el cursor en la celda que le preocupa; pedirle que teclee `Flujo!D12`
 * es pedirle que se equivoque. El botón lee la selección, y si hay más de una
 * celda lo dice en vez de quedarse con la primera.
 *
 * **Se guarda solo, en el libro.** No hay botón de guardar: cada cambio
 * confirmado va a `workbook.settings`. Un panel que se puede cerrar sin querer
 * —y en Excel se cierra sin querer— no debe poder perder el trabajo de nadie.
 */

import { useCallback, useState } from 'react';

import { leerNombresSugeridos } from '../excel/etiquetasEnExcel.ts';
import { nombreUnico } from '../excel/nombreSugerido.ts';
import { aplicarResaltado, quitarResaltado } from '../excel/resaltado.ts';
import {
  agruparCorrelaciones,
  resumirDistribucion,
  resumirDistribucionFecha,
  type DistributionSpec,
  type EntradaRiskModel,
  type ModeloRiesgo,
} from '../engine/modelo/index.ts';
import { leerSeleccion } from '../excel/seleccion.ts';
import { medirRitmoEnExcel } from '../excel/simulacionCompatible.ts';
import { guardarRitmo, type RitmoGuardado } from '../excel/ritmo.ts';
import { convieneAvisar, tiempoEstimado } from '../engine/compatible/index.ts';
import { AjusteDatos } from './AjusteDatos.tsx';
import { Compartir, useFormulasCompartidas } from './Compartir.tsx';
import { EditorCorrelaciones, MatrizCorrelaciones } from './EditorCorrelaciones.tsx';
import { Plegable } from './Plegable.tsx';
import { PLANTILLAS, type Plantilla } from '../excel/plantillas.ts';
import { escribirPlantilla } from '../excel/escribirPlantilla.ts';
import { Ayuda } from './ayuda.tsx';
import { EditorDistribucion } from './EditorDistribucion.tsx';
import { miles } from './formato.ts';
import { celdaSeleccionada, marcarSeleccion } from './marcar.ts';
import { claveComparable } from '../excel/direcciones.ts';

/**
 * Lo que tarda el modo compatible, **antes** de pulsar Simular.
 *
 * Esto no es una cortesía: medido en un libro real, el modo compatible da
 * **33 iteraciones por segundo**, así que el millón de iteraciones que el
 * motor rápido resuelve en 400 ms son aquí **ocho horas y media**. Ofrecer el
 * mismo desplegable en los dos modos, sin decir nada, es dejar que alguien se
 * comprometa a una jornada de espera con un clic.
 *
 * El ritmo se mide corriendo unas pocas iteraciones de verdad sobre el libro
 * del usuario, porque el coste lo pone su modelo y su máquina; no hay forma
 * honesta de estimarlo sin hacerlo. Una vez medido se guarda en el libro y no
 * hace falta repetirlo.
 */
function AvisoCompatible({
  modelo,
  ritmo,
  ocupado,
  alMedirRitmo,
  alFallar,
}: {
  modelo: ModeloRiesgo;
  ritmo: RitmoGuardado | null;
  ocupado: boolean;
  alMedirRitmo: (r: RitmoGuardado) => void;
  alFallar: (mensaje: string) => void;
}) {
  const [midiendo, setMidiendo] = useState(false);
  const n = modelo.settings.iterations;

  const medir = async () => {
    setMidiendo(true);
    try {
      const entradas = modelo.inputs.map((e) => ({ direccion: e.ref, muestras: new Float64Array([0]) }));
      const salidas = modelo.outputs.map((s) => s.ref);
      const r = await medirRitmoEnExcel(entradas, salidas);
      if (!r.ok) {
        alFallar(r.motivo);
        return;
      }
      const medido: RitmoGuardado = {
        iteracionesPorSegundo: r.iteracionesPorSegundo,
        medidoEn: new Date().toISOString(),
        celdas: 0,
      };
      alMedirRitmo(medido);
      await guardarRitmo(medido);
    } catch (e) {
      alFallar(e instanceof Error ? e.message : String(e));
    } finally {
      setMidiendo(false);
    }
  };

  return (
    <section>
      <h2>Con Excel en el bucle</h2>
      <p className="tenue">
        Este modo escribe cada iteración en tus celdas y deja que Excel
        recalcule. Funciona con cualquier libro y es lentísimo: no es el mismo
        producto más despacio, es otro trato.
      </p>

      {ritmo === null ? (
        <>
          <p className="tenue">
            Todavía no se ha medido el ritmo en este libro, así que no se puede
            decir cuánto va a tardar. Medirlo cuesta unos segundos.
          </p>
          <button type="button" onClick={() => void medir()} disabled={ocupado || midiendo || modelo.inputs.length === 0}>
            {midiendo ? 'Midiendo…' : 'Medir el ritmo'}
          </button>
        </>
      ) : (
        <>
          <dl>
            <dt>Ritmo medido</dt>
            <dd>{miles(ritmo.iteracionesPorSegundo)} iteraciones por segundo</dd>
            <dt>{miles(n)} iteraciones</dt>
            <dd>≈ {tiempoEstimado(ritmo.iteracionesPorSegundo, n)}</dd>
          </dl>

          {convieneAvisar(ritmo.iteracionesPorSegundo, n) && (
            <p className="aviso-linea">
              Es una espera muy larga. Con el motor rápido el mismo modelo tarda
              menos de un segundo; el compatible solo hace falta si tu libro usa
              funciones que el rápido no conoce. Baja las iteraciones o cambia
              de motor.
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function Modelo({
  modelo,
  alCambiar,
  alSimular,
  ocupado,
  ritmo,
  alMedirRitmo,
  alAbrirConfiguracion,
  alDeshacer,
  entradasDelLibro,
  idsFecha,
  pedidoAjuste = 0,
}: {
  modelo: ModeloRiesgo;
  alCambiar: (m: ModeloRiesgo) => void;
  alSimular: () => void;
  ocupado: boolean;
  /** El último ritmo medido del modo compatible en este libro, si lo hay. */
  ritmo: RitmoGuardado | null;
  alMedirRitmo: (r: RitmoGuardado) => void;
  alAbrirConfiguracion?: () => void;
  /** Deshacer el último cambio del modelo (E3); sin él, no hay nada que deshacer. */
  alDeshacer?: () => void;
  /** Las entradas que declaran funciones RIESGO del libro, de la última simulación (E1). */
  entradasDelLibro?: readonly { ref: string; distribucion: string; nombre?: string }[];
  /** Entradas cuya celda tiene formato de fecha, según la última simulación (T7). */
  idsFecha?: ReadonlySet<string>;
  /** U3.2: «Ajustar a datos» desde la cinta; cada pulsación lo suma. */
  pedidoAjuste?: number;
}) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [compartidas, setCompartidas] = useFormulasCompartidas();
  const preparadoParaCompartir = compartidas !== null && compartidas > 0;
  const compartir = (
    <Compartir modelo={modelo} alCambiar={alCambiar} guardadas={compartidas} setGuardadas={setCompartidas} />
  );

  /** Para los modelos marcados antes del 27/09: nombrar desde la hoja lo que aún se llama como su celda. */
  const sinNombre = [...modelo.inputs, ...modelo.outputs].filter((x) => x.name === x.ref);
  const nombrarDesdeLaHoja = useCallback(async () => {
    try {
      const refs = [...modelo.inputs, ...modelo.outputs].filter((x) => x.name === x.ref).map((x) => x.ref);
      const sugeridos = await leerNombresSugeridos(refs);
      const usados = [...modelo.inputs, ...modelo.outputs].filter((x) => x.name !== x.ref).map((x) => x.name);
      const nombrar = <T extends { name: string; ref: string }>(x: T): T => {
        if (x.name !== x.ref) return x;
        const nombre = nombreUnico(sugeridos.get(x.ref) ?? x.ref, x.ref, usados);
        usados.push(nombre);
        return { ...x, name: nombre };
      };
      alCambiar({ ...modelo, inputs: modelo.inputs.map(nombrar), outputs: modelo.outputs.map(nombrar) });
    } catch (e) {
      setAviso(`No se pudieron leer las etiquetas de la hoja: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [modelo, alCambiar]);

  const anadir = useCallback(async (como: 'entrada' | 'salida') => {
    setAviso(null);
    const r = await marcarSeleccion(modelo, como);
    if (!r.ok) {
      setAviso(r.aviso);
      return;
    }
    alCambiar(r.modelo);
    if (como === 'entrada') setAbierta(r.id);
  }, [modelo, alCambiar]);
  const anadirEntrada = useCallback(() => anadir('entrada'), [anadir]);

  // U3.2: el ajuste suelto de la cinta. «Usar» aplica la distribución a la
  // celda que esté seleccionada entonces: si ya es una entrada, la cambia; si
  // no, la marca como entrada nueva con esa distribución.
  const [ajusteCerrado, setAjusteCerrado] = useState(0);
  const ajusteSuelto = pedidoAjuste > ajusteCerrado;
  const aplicarAjuste = useCallback(async (dist: DistributionSpec) => {
    setAviso(null);
    const sel = await celdaSeleccionada();
    if (typeof sel === 'string') {
      setAviso(`${sel} Selecciona la celda de la entrada y pulsa «Usar» otra vez.`);
      return;
    }
    const clave = claveComparable(sel.direccion);
    const existente = modelo.inputs.find((e) => clave !== undefined && claveComparable(e.ref) === clave);
    if (existente) {
      alCambiar({ ...modelo, inputs: modelo.inputs.map((e) => (e.id === existente.id ? { ...e, dist } : e)) });
      setAbierta(existente.id);
    } else {
      const r = await marcarSeleccion(modelo, 'entrada');
      if (!r.ok) {
        setAviso(r.aviso);
        return;
      }
      alCambiar({ ...r.modelo, inputs: r.modelo.inputs.map((e) => (e.id === r.id ? { ...e, dist } : e)) });
      setAbierta(r.id);
    }
    setAjusteCerrado(pedidoAjuste);
  }, [modelo, alCambiar, pedidoAjuste]);
  const anadirSalida = useCallback(() => anadir('salida'), [anadir]);

  const cambiarEntrada = (id: string, cambio: Partial<EntradaRiskModel>) =>
    alCambiar({ ...modelo, inputs: modelo.inputs.map((e) => (e.id === id ? { ...e, ...cambio } : e)) });

  /**
   * Quitar una entrada se lleva también las correlaciones que la nombraban.
   * Si no, quedarían apuntando a algo que ya no existe: `validarRiskModel` lo
   * rechazaría y el modelo dejaría de poder guardarse, con un mensaje sobre un
   * identificador que el usuario nunca ha visto.
   */
  const quitarEntrada = (id: string) =>
    alCambiar({
      ...modelo,
      inputs: modelo.inputs
        .filter((e) => e.id !== id)
        .map((e) => ({ ...e, correlations: e.correlations.filter((c) => c.with !== id) })),
    });

  // Las entradas pueden venir también de funciones RIESGO.* escritas en el
  // libro, que solo se descubren al simular: basta con tener una salida.
  const listo = modelo.outputs.length > 0;

  return (
    <>
      {aviso && <p className="aviso-linea">{aviso}</p>}

      {alDeshacer && (
        <p className="barra-deshacer">
          <button type="button" className="secundario" onClick={alDeshacer} title="Deshace el último cambio del modelo (también Ctrl+Z fuera de un campo)">
            ↶ Deshacer
          </button>
        </p>
      )}

      {ajusteSuelto && (
        <section className="ajuste-suelto">
          <AjusteDatos
            key={pedidoAjuste}
            pedido={pedidoAjuste}
            decimal={modelo.settings.locale?.decimalSeparator ?? ','}
            alUsar={(dist) => void aplicarAjuste(dist)}
            alCerrar={() => setAjusteCerrado(pedidoAjuste)}
            explicacion="Para usar una distribución: selecciona en la hoja la celda de la entrada (si no lo es, se marca como entrada) y pulsa «Usar»."
          />
        </section>
      )}

      {modelo.inputs.length === 0 && modelo.outputs.length === 0 && !ajusteSuelto && <PrimerModelo />}

      {preparadoParaCompartir && compartir}

      {sinNombre.length > 0 && (
        <p className="aviso-linea">
          {sinNombre.length === 1 ? 'Una celda se llama' : `${miles(sinNombre.length)} celdas se llaman`} como su
          referencia ({sinNombre.slice(0, 3).map((x) => x.ref).join(', ')}{sinNombre.length > 3 ? '…' : ''}).{' '}
          <button type="button" className="secundario" onClick={() => void nombrarDesdeLaHoja()}>
            Poner nombres desde la hoja
          </button>
        </p>
      )}

      <section>
        <h2>Entradas inciertas</h2>
        <p className="tenue">
          Las celdas cuyo valor no conoces. Selecciona una en la hoja y añádela.
          {modelo.inputs.length >= 2 &&
            ' Despliega una (▸) para cambiarle la distribución o declarar que se mueve junto a otra.'}
        </p>

        {modelo.inputs.length === 0 && <p className="tenue">Todavía no hay ninguna.</p>}

        <ul className="fichas">
          {modelo.inputs.map((entrada) => (
            <li key={entrada.id}>
              <div className="cabecera">
                <button
                  type="button"
                  className="plano"
                  onClick={() => setAbierta(abierta === entrada.id ? null : entrada.id)}
                >
                  {abierta === entrada.id ? '▾' : '▸'} {entrada.name}
                </button>
                <span className="tenue">
                  {resumirDistribucion(entrada.dist)}
                  {entrada.correlations.length > 0 &&
                    ` · ${entrada.correlations.length} correlación(es)`}
                </span>
                <button
                  type="button"
                  className="plano borrar"
                  title="Quitar del modelo"
                  onClick={() => quitarEntrada(entrada.id)}
                >
                  ✕
                </button>
              </div>

              {abierta === entrada.id && (
                <div className="detalle">
                  <label className="campo ancho">
                    <span className="tenue">Nombre</span>
                    <input
                      type="text"
                      value={entrada.name}
                      onChange={(e) => cambiarEntrada(entrada.id, { name: e.target.value })}
                    />
                  </label>
                  <p className="tenue">Celda: {entrada.ref}</p>
                  <EditorDistribucion
                    spec={entrada.dist}
                    alCambiar={(dist) => cambiarEntrada(entrada.id, { dist })}
                    leerSeleccion={async () => (await leerSeleccion()).valores}
                  />
                  <AjusteDatos
                    decimal={modelo.settings.locale?.decimalSeparator ?? ','}
                    alUsar={(dist) => cambiarEntrada(entrada.id, { dist })}
                  />
                  <EditorCorrelaciones modelo={modelo} entrada={entrada} alCambiar={alCambiar} />
                </div>
              )}
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => void anadirEntrada()} disabled={ocupado}>
          Añadir la selección como entrada
        </button>

        {modelo.inputs.length + (entradasDelLibro?.length ?? 0) >= 2 && (
          <Plegable id="todas-entradas" titulo="Todas las entradas"
            resumen={`${modelo.inputs.length} del panel${entradasDelLibro?.length ? ` · ${entradasDelLibro.length} del libro` : ''}`}>
            <div className="tabla-desplazable">
              <table className="tabla-resumen todas-entradas">
                <thead><tr><th>Entrada</th><th>Celda</th><th>Distribución</th><th title="Correlaciones">ρ</th></tr></thead>
                <tbody>
                  {modelo.inputs.map((e) => (
                    <tr key={e.id} onClick={() => setAbierta(e.id)} title="Abrir para editarla">
                      <td>{e.name}</td>
                      <td className="tenue">{e.ref}</td>
                      <td>{idsFecha?.has(e.id) ? resumirDistribucionFecha(e.dist) : resumirDistribucion(e.dist)}</td>
                      <td>{e.correlations.length || ''}</td>
                    </tr>
                  ))}
                  {(entradasDelLibro ?? []).map((e, i) => (
                    <tr key={`${e.ref}-${i}`} className="del-libro" title="Una función RIESGO escrita en la celda: se cambia en la hoja">
                      <td>{e.nombre ?? e.ref}</td>
                      <td className="tenue">{e.ref}</td>
                      <td>{e.distribucion}</td>
                      <td className="tenue">libro</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tenue">
              Pulsa una del panel para abrirla y editarla. Las del libro son funciones RIESGO escritas en las celdas (las de
              la última simulación): se cambian en la hoja.
            </p>
          </Plegable>
        )}

        {modelo.inputs.filter((e) => e.dist.type !== 'categorical').length >= 2 && (
          <Plegable id="matriz-correlaciones" titulo="Matriz de correlaciones"
            resumen={(() => {
              const n = modelo.inputs.reduce((s, e) => s + e.correlations.length, 0) / 2;
              return n === 0 ? 'todas independientes' : `${Math.round(n)} pareja${Math.round(n) === 1 ? '' : 's'}`;
            })()}>
            <Ayuda tema="correlaciones" />
            <MatrizCorrelaciones modelo={modelo} alCambiar={alCambiar} problemas={(() => {
              const r = agruparCorrelaciones(modelo.inputs);
              // Los mensajes nombran los identificadores internos: se cambian por los nombres.
              return r.ok ? [] : r.errores.map((t) => modelo.inputs.reduce((x, e) => x.split(`"${e.id}"`).join(`«${e.name}»`), t));
            })()} />
          </Plegable>
        )}
      </section>

      <section>
        <h2>Salidas</h2>
        <p className="tenue">Lo que quieres medir: el resultado del que verás la distribución.</p>

        {modelo.outputs.length === 0 && <p className="tenue">Todavía no hay ninguna.</p>}

        <ul className="fichas">
          {modelo.outputs.map((salida) => (
            <li key={salida.id}>
              <div className="cabecera">
                <input
                  type="text"
                  className="nombre-suelto"
                  value={salida.name}
                  onChange={(e) =>
                    alCambiar({
                      ...modelo,
                      outputs: modelo.outputs.map((s) =>
                        s.id === salida.id ? { ...s, name: e.target.value } : s,
                      ),
                    })
                  }
                />
                <span className="tenue">{salida.ref}</span>
                <button
                  type="button"
                  className="plano borrar"
                  title="Quitar del modelo"
                  onClick={() => alCambiar({ ...modelo, outputs: modelo.outputs.filter((s) => s.id !== salida.id) })}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>

        <button type="button" onClick={() => void anadirSalida()} disabled={ocupado}>
          Añadir la selección como salida
        </button>
      </section>

      <section>
        <h2>Resaltado en la hoja</h2>
        <p className="tenue">
          Las entradas se pintan de amarillo y las salidas de verde, el convenio
          de toda la vida en modelización financiera; las celdas con funciones
          RIESGO, de melocotón (se descubren al simular). Al quitarlo, cada
          celda vuelve al relleno que tenía.
        </p>
        <div className="botonera">
          <button type="button" onClick={() => void aplicarResaltado(modelo)} disabled={ocupado}>
            Resaltar en la hoja
          </button>
          <button type="button" onClick={() => void quitarResaltado()} disabled={ocupado}>
            Quitar el resaltado
          </button>
        </div>
      </section>

      <section>
        <h2>Ajustes</h2>
        <p className="tenue">
          {modelo.settings.convergence?.untilConverged
            ? `Hasta ±${(modelo.settings.convergence.target * 100).toLocaleString('es-ES')} % de precisión (tope ${miles(modelo.settings.convergence.maxIterations)})`
            : `${miles(modelo.settings.iterations)} iteraciones`}
          {' · '}semilla {modelo.settings.seed}
          {' · '}{modelo.settings.sampling === 'lhs' ? 'hipercubo latino' : 'Monte Carlo'}
          {' · '}motor {modelo.settings.engine === 'auto' ? 'automático' : modelo.settings.engine === 'fast' ? 'rápido' : 'compatible'}
        </p>
        {alAbrirConfiguracion && (
          <button type="button" className="secundario" onClick={alAbrirConfiguracion}>
            ⚙ Cambiar en Configuración
          </button>
        )}
      </section>

      {!preparadoParaCompartir && compartir}

      {modelo.settings.engine === 'compatible' && (
        <AvisoCompatible
          modelo={modelo}
          ritmo={ritmo}
          ocupado={ocupado}
          alMedirRitmo={alMedirRitmo}
          alFallar={setAviso}
        />
      )}

      <section>
        {/* Sin salidas en el panel también: el libro puede declararlas con RIESGO.SALIDA. */}
        <button type="button" className="principal" onClick={alSimular} disabled={ocupado}>
          {ocupado ? 'Simulando…' : 'Simular'}
        </button>
        {!listo && (
          <p className="tenue">
            Hace falta al menos una salida: márcala aquí o súmale a su fórmula
            =RIESGO.SALIDA("nombre"). Las entradas pueden ser celdas marcadas aquí o celdas
            con una función como =RIESGO.NORMAL(100; 15).
          </p>
        )}
      </section>
    </>
  );
}

/**
 * El asistente del primer modelo (U1): los cuatro pasos, en corto, y tres
 * plantillas que se escriben en una hoja nueva listas para simular.
 */
function PrimerModelo() {
  const [hecho, setHecho] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [escribiendo, setEscribiendo] = useState(false);
  const crear = async (p: Plantilla) => {
    setEscribiendo(true);
    setFallo(null);
    try {
      const hoja = await escribirPlantilla(p);
      setHecho(`«${p.nombre}» está en la hoja «${hoja}». Pulsa Simular (abajo): sus entradas y salidas ya están en las fórmulas.`);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e));
    } finally {
      setEscribiendo(false);
    }
  };
  // Plegado y recordado: quien ya sabe empezar lo cierra una vez y no lo vuelve
  // a ver; los ejemplos, cerrados de salida (no son lo primero que importa).
  return (
    <section className="primer-modelo">
      <Plegable id="primer-modelo" titulo={<h2>Cómo empezar</h2>} abierta resumen="cuatro pasos y ejemplos">
        <ol className="pasos">
          <li><strong>Las entradas inciertas.</strong> Selecciona en la hoja una celda cuyo valor no conoces (un precio, unas unidades, un plazo) y pulsa «Añadir la selección como entrada».</li>
          <li><strong>Su distribución.</strong> Despliégala (▸) y elige cómo puede variar: si sabes el mínimo, el más probable y el máximo, una triangular.</li>
          <li><strong>La salida.</strong> Selecciona el resultado que te importa (el beneficio, el coste total) y pulsa «Añadir la selección como salida».</li>
          <li><strong>Simula.</strong> En Resultados verás la media, el rango probable y qué entrada pesa más.</li>
        </ol>
        <p className="tenue">¿Ya usas funciones RIESGO en las fórmulas? Te basta el paso 3: marca la salida y simula.</p>
        <Plegable id="plantillas" titulo={<h3>Ejemplos listos para simular</h3>} resumen={`${PLANTILLAS.length} ejemplos`}>
          <p className="tenue">Cada uno se escribe en una hoja nueva de este libro, con sus entradas y salidas ya puestas.</p>
          <div className="plantillas">
            {PLANTILLAS.map((p) => (
              <button key={p.id} type="button" className="secundario plantilla" disabled={escribiendo} onClick={() => void crear(p)} title={p.descripcion}>
                <strong>{p.nombre}</strong>
                <span className="tenue">{p.descripcion}</span>
              </button>
            ))}
          </div>
        </Plegable>
        {hecho && <p className="aviso-ok">{hecho}</p>}
        {fallo && <p className="aviso-linea">{fallo}</p>}
      </Plegable>
    </section>
  );
}
