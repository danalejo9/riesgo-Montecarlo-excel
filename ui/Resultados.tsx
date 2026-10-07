/**
 * Los resultados: qué salió, con cuánta incertidumbre y con qué motor.
 *
 * Tres decisiones de fondo:
 *
 * **La curva acumulada, no el histograma.** Un histograma enseña la forma; la
 * CDF contesta la pregunta que la gente hace de verdad delante de un análisis
 * de riesgo: *¿qué probabilidad hay de pasarme de X?* Se lee apuntando a un
 * valor y mirando la altura, y por eso lleva un cursor que dice el par exacto.
 * (El histograma por bloques todavía no existe — ver `engine/stats/resumen.ts`.)
 *
 * **Los percentiles se marcan como aproximados.** Vienen de un t-digest, no
 * de ordenar el millón de valores, que es lo que permite no guardarlos. La
 * diferencia es de decimales, pero decir "p95" a secas cuando es aproximado es
 * mentir en un informe que alguien va a firmar (Fase 2 §3.3 lo exige).
 *
 * **El umbral primero, luego las formas.** "¿Qué probabilidad hay de que el
 * VAN salga negativo?" es la pregunta por la que la gente abre un análisis de
 * riesgo; se contesta con un número, y ese número va arriba. El histograma
 * pinta la misma respuesta como área: las barras del lado contado, en color.
 *
 * **El tornado va debajo de cada salida**, no en una pestaña aparte: "qué la
 * mueve" es una propiedad de esa salida, y la siguiente pregunta natural tras
 * mirar su curva.
 *
 * **Se dice con qué motor se calculó y cuánto tardó.** No es un detalle
 * técnico: si fue el compatible, el usuario acaba de esperar minutos y tiene
 * derecho a saber por qué, y qué función del libro lo obligó.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { ModeloRiesgo, SalidaRiskModel } from '../engine/modelo/index.ts';
import type { AnalisisCola } from '../excel/analisisCola.ts';
import type { EntradaMuestreada } from '../excel/entradasMuestreadas.ts';
import {
  escenarioActivo, MAXIMO_ESCENARIOS, tablaEscenarios, type AlmacenEscenarios, type FilaEscenario,
} from '../excel/escenarios.ts';
import { esSalidaDeTexto, probabilidadDeValor, type PorCategoria } from '../excel/analisisTexto.ts';
import { lecturaDeSalida, lecturaDeTexto } from '../excel/lectura.ts';
import { claveComparable, escucharSeleccion } from '../excel/seleccionActiva.ts';
import { volcarResultados } from '../excel/volcarResultados.ts';
import { claseSugerida, contingencia, type ClaseSalida, type NivelContingencia } from '../excel/contingencia.ts';
import { matrizDeRiesgos, NIVELES_IMPACTO, NIVELES_PROBABILIDAD, NOMBRE_SEVERIDAD, severidad } from '../excel/matrizRiesgos.ts';
import { exportarIteraciones } from '../excel/exportarIteraciones.ts';

import type { PuntoCDF } from '../engine/stats/index.ts';
import { motivosLegibles, type SimulacionCompletada } from '../excel/ejecutarSimulacion.ts';
import { percentilesClave, type CurvaAranaPanel, type FilaSensibilidadPanel, type PercentilesClave, type ResultadoSalida } from '../excel/informe.ts';
import type { FilaRiesgo } from '../excel/registroRiesgos.ts';
import type { PeticionBusqueda, ResultadoBusqueda } from '../excel/busquedaObjetivo.ts';
import { leerSeleccion } from '../excel/seleccion.ts';
import type { ResultadoDecisiones, SalidaEnOpcion } from '../excel/decisiones.ts';
import { resultadosDesactualizados } from '../excel/resultadosGuardados.ts';
import { codificarInforme, datosDelInforme } from '../excel/informeImprimible.ts';
import {
  compararSalida, salidaDeReferencia, type FilaComparacion, type ReferenciaGuardada,
} from '../excel/comparacion.ts';
import type { BinHistograma } from '../engine/stats/index.ts';
import { probabilidadUmbral, type MedidasRiesgo } from '../engine/stats/index.ts';
import type { UmbralRiskModel } from '../engine/modelo/index.ts';
import type { Precision } from '../engine/stats/index.ts';
import { duracion, formatoDe, leerNumero, miles, numero, type FormatoValor } from './formato.ts';
import { Plegable } from './Plegable.tsx';
import { Ayuda } from './ayuda.tsx';
import { Abanico, CajasSalidas, CurvasSuperpuestas, Dispersion, Estres, TornadoCambio } from './Graficos.tsx';

export function Resultados({
  modelo,
  resultado,
  alCambiarModelo,
  escenarios,
  alCambiarEscenarios,
  alBuscarObjetivo,
}: {
  modelo: ModeloRiesgo;
  resultado: SimulacionCompletada;
  /** Para guardar el umbral de cada salida en el modelo del libro. */
  alCambiarModelo?: (m: ModeloRiesgo) => void;
  /** Los escenarios guardados en el libro (E7); el activo es con el que se compara. */
  escenarios?: AlmacenEscenarios;
  alCambiarEscenarios?: (accion: AccionEscenarios) => void;
  /** H4: buscar el valor de una celda que da una probabilidad; devuelve el resultado o el motivo del fallo. */
  alBuscarObjetivo?: (b: PeticionBusqueda, alAvanzar: (mensaje: string) => void) => Promise<ResultadoBusqueda | string>;
}) {
  const referencia: ReferenciaGuardada | null = escenarios ? escenarioActivo(escenarios) : null;
  const motivos = motivosLegibles(resultado.eleccion);
  const [volcando, setVolcando] = useState(false);
  const [volcado, setVolcado] = useState<string | null>(null);
  const [falloVolcado, setFalloVolcado] = useState<string | null>(null);

  // E6: con varias salidas se enseña una cada vez (o todas), elegida arriba,
  // en la tabla resumen o seleccionando su celda en la hoja.
  const varias = resultado.salidas.length > 1;
  const [vista, setVista] = useState<string>(() => (varias ? (resultado.salidas[0]?.id ?? TODAS) : TODAS));
  const vistaValida = vista === TODAS || resultado.salidas.some((s) => s.id === vista) ? vista : TODAS;
  const salidasVisibles = vistaValida === TODAS ? resultado.salidas : resultado.salidas.filter((s) => s.id === vistaValida);
  const pc = percentilesClave(resultado);

  useEffect(() => {
    if (!varias) return;
    const porClave = new Map<string, string>();
    for (const s of resultado.salidas) {
      const clave = claveComparable(s.ref);
      if (clave) porClave.set(clave, s.id);
    }
    let dejar: (() => Promise<void>) | undefined;
    let vivo = true;
    escucharSeleccion((direccion) => {
      const clave = claveComparable(direccion);
      const id = clave ? porClave.get(clave) : undefined;
      if (id && vivo) setVista(id);
    })
      .then((d) => (vivo ? (dejar = d) : void d()))
      .catch(() => {}); // sin el evento, se elige a mano: no es un error
    return () => {
      vivo = false;
      void dejar?.().catch(() => {});
    };
  }, [varias, resultado.salidas]);

  const abrirInforme = async () => {
    setFalloVolcado(null);
    try {
      const codigo = await codificarInforme(datosDelInforme(modelo, resultado, { referencia: referencia ?? null }));
      const url = `${new URL('/informe.html', window.location.href).href}#d=${codigo}`;
      abrirEnNavegador(url);
    } catch (e) {
      setFalloVolcado(`No se pudo preparar el informe: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const volcar = async () => {
    setVolcando(true);
    setFalloVolcado(null);
    try {
      const hecho = await volcarResultados(modelo, resultado);
      setVolcado(`Escritos en la hoja «${hecho.hoja}».`);
    } catch (e) {
      setFalloVolcado(e instanceof Error ? e.message : String(e));
    } finally {
      setVolcando(false);
    }
  };

  // C3: las iteraciones, a una hoja (hasta 100.000 filas, las que se retienen).
  const exportar = async () => {
    if (!resultado.iteraciones) return;
    setVolcando(true);
    setFalloVolcado(null);
    try {
      const hecho = await exportarIteraciones(resultado.iteraciones, LIMITE_EXPORTAR);
      setVolcado(`${miles(hecho.filas)} iteraciones escritas en la hoja «${hecho.hoja}».`);
    } catch (e) {
      setFalloVolcado(e instanceof Error ? e.message : String(e));
    } finally {
      setVolcando(false);
    }
  };

  const desactualizados = resultadosDesactualizados(resultado, modelo);
  // Comparar solo si la referencia es otra simulación, no esta misma.
  const comparando =
    referencia && !(referencia.resultado.idSimulacion && referencia.resultado.idSimulacion === resultado.idSimulacion)
      ? referencia
      : null;

  const umbralDe = (id: string) => modelo.outputs.find((o) => o.id === id)?.threshold;
  /**
   * Cambia una salida del modelo (su umbral, su valor de interés). Una salida
   * declarada con RIESGO.SALIDA no está en el panel: pasa a él (con su id `rs_`)
   * para que lo que se le pone se guarde en el libro.
   */
  const cambiarSalida = (salida: ResultadoSalida, cambio: (o: SalidaRiskModel) => SalidaRiskModel) => {
    const esta = modelo.outputs.some((o) => o.id === salida.id);
    alCambiarModelo?.({
      ...modelo,
      outputs: esta
        ? modelo.outputs.map((o) => (o.id === salida.id ? cambio(o) : o))
        : [...modelo.outputs, cambio({ id: salida.id, name: salida.nombre, ref: salida.ref })],
    });
  };
  // U2: los avisos que importan, arriba y a la vista; el detalle, plegado abajo.
  const avisos: ReactNode[] = [];
  if (resultado.restaurado) {
    avisos.push(
      <p key="restaurado" className="tenue">
        Resultados guardados en el libro el {fecha(resultado.restaurado.guardadoEn)} (los umbrales son
        aproximados: ±0,1 puntos).
      </p>,
    );
  }
  if (desactualizados) {
    avisos.push(
      <p key="desactualizados" className="aviso-linea">
        El modelo ha cambiado desde esta simulación: vuelve a simular para actualizar estos resultados.
      </p>,
    );
  }
  if (resultado.convergencia && !resultado.convergencia.alcanzada && !resultado.convergencia.noDisponible) {
    avisos.push(
      <p key="convergencia" className="aviso-linea">
        No se alcanzó el ±{(resultado.convergencia.objetivo * 100).toLocaleString('es-ES')} % de precisión sin pasar
        del tope ({miles(resultado.convergencia.tope)} iteraciones). Sube el tope o relaja el margen en Configuración.
      </p>,
    );
  }
  if (resultado.eleccion.salidasConstantes.length > 0) {
    avisos.push(
      <p key="constantes" className="aviso-linea">
        Estas salidas no dependen de ninguna entrada (dan siempre lo mismo): {resultado.eleccion.salidasConstantes.join(', ')}.
      </p>,
    );
  }
  for (const a of resultado.avisosCoherencia ?? []) {
    avisos.push(<p key={a} className="aviso-linea">{a}</p>);
  }
  if (resultado.entradasDeFunciones && resultado.entradasDeFunciones.length > 0) {
    avisos.push(
      <p key="compartir" className="aviso-linea">
        El libro tiene funciones RIESGO: antes de enviarlo a alguien sin el complemento, usa «Preparar para
        compartir» (pestaña Modelo).
      </p>,
    );
  }
  const resumenCalculo =
    `${resultado.motor === 'fast' ? 'Rápido' : 'Compatible'} · ${miles(resultado.iteracionesCompletadas)} iteraciones · ${duracion(resultado.milisegundos)}` +
    (resultado.cancelada ? ' · cancelada' : '');

  return (
    <>
      <section className="barra-resultados">
        <p className="resumen-calculo">{resumenCalculo}</p>
        {avisos}
        <div className="fila-botones">
          <button type="button" className="secundario" onClick={() => void volcar()} disabled={volcando}
            title="Escribe el informe en una hoja del libro (se rehace en cada volcado), con gráficos de Excel.">
            {volcando ? 'Escribiendo…' : 'Volcar a una hoja'}
          </button>
          <button type="button" className="secundario" onClick={() => void abrirInforme()}
            title="Abre el informe en el navegador, listo para imprimir o guardar como PDF. Los datos no salen del equipo.">
            Informe PDF
          </button>
          {resultado.iteraciones && resultado.iteraciones.n > 0 && (
            <button type="button" className="secundario" onClick={() => void exportar()} disabled={volcando}
              title={`Escribe en la hoja «Iteraciones» las entradas y salidas de las primeras ${miles(Math.min(resultado.iteraciones.n, LIMITE_EXPORTAR))} iteraciones, para tus propios análisis o gráficos.`}>
              Iteraciones a una hoja
            </button>
          )}
        </div>
        {volcado && <p className="tenue">{volcado}</p>}
        {falloVolcado && <p className="aviso-linea">{falloVolcado}</p>}
      </section>

      {varias && (
        <ResumenSalidas
          salidas={resultado.salidas}
          umbrales={new Map(modelo.outputs.map((o) => [o.id, o.threshold]))}
          vista={vistaValida}
          alElegir={setVista}
          pc={percentilesClave(resultado)}
        />
      )}

      {varias && resultado.salidas.filter((s) => s.resumen.n > 0 && !s.categorias?.length).length >= 2 && (
        <section>
          <Plegable id="comparar-salidas" titulo={<h2>Comparar salidas</h2>} resumen="caja, curvas, abanico">
            <Ayuda tema="comparar" />
            <h3>Caja y bigotes</h3>
            <CajasSalidas salidas={resultado.salidas} />
            <h3>Curvas acumuladas</h3>
            <CurvasSuperpuestas salidas={resultado.salidas} />
            {resultado.salidas.filter((s) => s.resumen.n > 0 && !s.categorias?.length).length >= 3 && (
              <>
                <h3>Abanico</h3>
                <Abanico salidas={resultado.salidas} />
              </>
            )}
          </Plegable>
        </section>
      )}

      {salidasVisibles.map((salida) => esSalidaDeTexto(salida) ? (
        <SalidaDeTexto
          key={salida.id}
          salida={salida}
          comparaciones={<>
            {comparando && (() => {
              const ref = salidaDeReferencia(comparando, salida.id);
              return ref ? <TablaComparacion etiqueta={comparando.etiqueta} filas={compararSalida(salida, ref)} /> : null;
            })()}
            {escenarios && escenarios.escenarios.length > 0 && (() => {
              const filas = tablaEscenarios(salida, resultado, escenarios, undefined, modelo.outputs.find((o) => o.id === salida.id)?.valueOfInterest);
              return filas.length > 1 ? <TablaEscenarios filas={filas} conUmbral={false} /> : null;
            })()}
            {resultado.decisiones && <TablaDecisiones decisiones={resultado.decisiones} idSalida={salida.id} formato={formatoDe(false)} />}
          </>}
          valorDeInteres={modelo.outputs.find((o) => o.id === salida.id)?.valueOfInterest}
          alCambiarValor={(v) =>
            cambiarSalida(salida, (o) => {
              const copia = { ...o };
              if (v) copia.valueOfInterest = v;
              else delete copia.valueOfInterest;
              return copia;
            })
          }
        />
      ) : salida.resumen.n === 0 ? (
        // Ninguna iteración dio un número (una celda que devuelve texto, como
        // un FILTRAR de nombres, o un error en todas): no hay nada que medir, y
        // enseñar «mínimo ∞» o un tornado de ceros solo confunde (prueba G3).
        <section key={salida.id}>
          <h2 className="titulo-salida">{salida.nombre}</h2>
          <p className="tenue">{salida.ref}</p>
          <p className="aviso-linea">
            Ninguna de las {miles(salida.noNumericas ?? resultado.iteracionesCompletadas)} iteraciones
            dio un número en esta celda (devuelve un texto o un error de Excel), así que no
            hay estadísticas ni gráficos que enseñar. Si esperabas un número, revisa la
            fórmula de la celda.
          </p>
        </section>
      ) : (
        <section key={salida.id}>
          <h2 className="titulo-salida">{salida.nombre} <span className="ref-salida">{salida.ref}</span></h2>

          <div className="cifras">
            <div><span className="cifra">{formatoDe(salida.fecha).valor(salida.resumen.media)}</span><span className="cifra-nombre">media</span></div>
            <div><span className="cifra">{formatoDe(salida.fecha).valor(salida.resumen.percentiles[pc.claveBajo] ?? NaN)}</span><span className="cifra-nombre">{pc.etiquetaBajo}</span></div>
            <div><span className="cifra">{formatoDe(salida.fecha).valor(salida.resumen.percentiles[pc.claveAlto] ?? NaN)}</span><span className="cifra-nombre">{pc.etiquetaAlto}</span></div>
            <div><span className="cifra">{formatoDe(salida.fecha).dispersion(salida.resumen.desviacion)}</span><span className="cifra-nombre">desviación</span></div>
          </div>

          <Ayuda tema="cifras" />
          <LecturaSalida salida={salida} umbral={umbralDe(salida.id)} />

          {salida.noNumericas !== undefined && salida.noNumericas > 0 && (
            <p className="aviso-linea">
              {miles(salida.noNumericas)} iteración(es) no dieron un número (un error
              de Excel, o un texto). No cuentan en estas estadísticas.
            </p>
          )}

          {salida.histograma && salida.histograma.length > 0 && (
            <Histograma
              barras={salida.histograma}
              umbral={umbralDe(salida.id)}
              marcas={{ media: salida.resumen.media, ...(salida.resumen.percentiles.p50 !== undefined ? { mediana: salida.resumen.percentiles.p50 } : {}) }}
              {...(salida.muestraOrdenada ? { muestraOrdenada: salida.muestraOrdenada } : {})}
              formato={formatoDe(salida.fecha)}
            />
          )}

          {salida.muestraOrdenada && salida.muestraOrdenada.length > 0 && (
            <Umbral
              salida={salida}
              umbral={umbralDe(salida.id)}
              exacto={(resultado.muestraSensibilidad ?? 0) >= resultado.iteracionesCompletadas}
              decimal={modelo.settings.locale?.decimalSeparator ?? ','}
              alCambiar={(u) =>
                cambiarSalida(salida, (o) => {
                  if (u) return { ...o, threshold: u };
                  const copia = { ...o };
                  delete copia.threshold;
                  return copia;
                })
              }
            />
          )}

          {/* V1: contingencia frente al valor base (la hoja sin incertidumbre). */}
          {salida.muestraOrdenada && salida.muestraOrdenada.length > 1 && (salida.valorBase !== undefined || (resultado.base && 'aleatorio' in resultado.base)) && (
            <SeccionContingencia
              salida={salida}
              base={resultado.base}
              clase={modelo.outputs.find((o) => o.id === salida.id)?.kind ?? claseSugerida(salida.nombre)}
              alCambiarClase={(kind) => cambiarSalida(salida, (o) => ({ ...o, kind }))}
            />
          )}

          {alBuscarObjetivo && umbralDe(salida.id) && (
            <Plegable id="objetivo" titulo="Buscar objetivo" resumen="¿qué valor da esa probabilidad?">
              <BuscarObjetivo
                salida={salida}
                umbral={umbralDe(salida.id) as UmbralRiskModel}
                decimal={modelo.settings.locale?.decimalSeparator ?? ','}
                alBuscar={alBuscarObjetivo}
              />
            </Plegable>
          )}

          {comparando && (() => {
            const ref = salidaDeReferencia(comparando, salida.id);
            if (!ref) {
              return <p className="tenue">Esta salida no estaba en «{comparando.etiqueta}»: no se compara.</p>;
            }
            const filas = compararSalida(salida, ref, umbralDe(salida.id), pc);
            return <TablaComparacion etiqueta={comparando.etiqueta} filas={filas} />;
          })()}

          {escenarios && escenarios.escenarios.length > 0 && (() => {
            const umbral = umbralDe(salida.id);
            const filas = tablaEscenarios(salida, resultado, escenarios, umbral);
            return filas.length > 1 ? <TablaEscenarios filas={filas} conUmbral={Boolean(umbral)} /> : null;
          })()}

          {resultado.decisiones && <TablaDecisiones decisiones={resultado.decisiones} idSalida={salida.id} formato={formatoDe(salida.fecha)} />}

          {salida.sensibilidad && salida.sensibilidad.length > 0 && (
            <Plegable id="tornado" titulo="Qué la mueve más" abierta
              resumen={salida.sensibilidad[0]?.nombre}>
              <Ayuda tema="tornado" />
              <Sensibilidad salida={salida} muestra={resultado.muestraSensibilidad} />
            </Plegable>
          )}

          {resultado.iteraciones && resultado.iteraciones.salidas.some((s) => s.id === salida.id) && resultado.iteraciones.entradas.some((e) => !e.categorias) && (
            <Plegable id="dispersion" titulo="Dispersión con una entrada">
              <Ayuda tema="dispersion" />
              <Dispersion iteraciones={resultado.iteraciones} idSalida={salida.id} formato={formatoDe(salida.fecha)} />
            </Plegable>
          )}

          {resultado.iteraciones && resultado.iteraciones.salidas.some((s) => s.id === salida.id) && resultado.iteraciones.entradas.length > 0 && (
            <Plegable id="estres" titulo="Estrés: una entrada en un extremo">
              <Ayuda tema="estres" />
              <Estres
                iteraciones={resultado.iteraciones}
                idSalida={salida.id}
                formato={formatoDe(salida.fecha)}
                {...(umbralDe(salida.id) ? { umbral: { valor: (umbralDe(salida.id) as UmbralRiskModel).value, sentido: (umbralDe(salida.id) as UmbralRiskModel).direction } } : {})}
              />
            </Plegable>
          )}

          <Plegable id="percentiles" titulo="Estadísticos y percentiles"
            resumen={`${formatoDe(salida.fecha).valor(salida.resumen.min)} … ${formatoDe(salida.fecha).valor(salida.resumen.max)}`}>
            <Ayuda tema="percentiles" />
            <dl>
              <dt>Media</dt><dd>{formatoDe(salida.fecha).valor(salida.resumen.media)}</dd>
              <dt>Desviación</dt><dd>{formatoDe(salida.fecha).dispersion(salida.resumen.desviacion)}</dd>
              <dt>Mínimo</dt><dd>{formatoDe(salida.fecha).valor(salida.resumen.min)}</dd>
              <dt>Máximo</dt><dd>{formatoDe(salida.fecha).valor(salida.resumen.max)}</dd>
            </dl>
            <ul className="percentiles">
              {Object.entries(salida.resumen.percentiles).map(([clave, valor]) => (
                <li key={clave}>
                  <span className="tenue">{clave}</span>
                  <span>{formatoDe(salida.fecha).valor(valor)}</span>
                </li>
              ))}
            </ul>
            <p className="tenue">Percentiles aproximados.</p>
            {salida.precision && <PrecisionSalida precision={salida.precision} n={salida.resumen.n} formato={formatoDe(salida.fecha)} />}
          </Plegable>

          <Plegable id="acumulada" titulo="Probabilidad acumulada">
            <Ayuda tema="acumulada" />
            <CurvaAcumulada
              puntos={salida.cdf}
              referencia={comparando ? salidaDeReferencia(comparando, salida.id)?.cdf : undefined}
              etiquetaReferencia={comparando?.etiqueta}
              formato={formatoDe(salida.fecha)}
            />
          </Plegable>

          {salida.riesgo && (
            <Plegable id="riesgo" titulo="Medidas de riesgo" resumen="VaR, CVaR, forma">
              <Ayuda tema="riesgo" />
              <MedidasDeRiesgo riesgo={salida.riesgo} conTitulo={false} formato={formatoDe(salida.fecha)} />
            </Plegable>
          )}

          {salida.colas && salida.colas.length > 0 && (
            <Plegable id="colas" titulo="Qué tiene que pasar" resumen="en el 10 % más bajo o más alto">
              <Ayuda tema="colas" />
              <QueTieneQuePasar colas={salida.colas} conTitulo={false} />
            </Plegable>
          )}

          {salida.porCategoria && salida.porCategoria.length > 0 && (
            <Plegable id="categorias" titulo="Según las entradas de texto">
              <TablasPorCategoria bloques={salida.porCategoria} />
            </Plegable>
          )}

          {salida.arana && salida.arana.length > 0 && (
            <Plegable id="arana" titulo="Qué pasa si cada entrada se mueve">
              <Arana curvas={salida.arana} />
            </Plegable>
          )}
        </section>
      ))}

      {resultado.registroRiesgos && resultado.registroRiesgos.length > 0 && <RegistroRiesgos filas={resultado.registroRiesgos} />}

      {alCambiarEscenarios && (
        <Escenarios
          escenarios={escenarios ?? { escenarios: [] }}
          idSimulacion={resultado.idSimulacion}
          alCambiar={alCambiarEscenarios}
        />
      )}

      <section>
        <Plegable id="calculo" titulo={<h2>Cómo se calculó</h2>} resumen={resumenCalculo}>
          <dl>
            <dt>Motor</dt>
            <dd>{resultado.motor === 'fast' ? 'Rápido (en memoria)' : 'Compatible (Excel en el bucle)'}</dd>
            <dt>Iteraciones</dt>
            <dd>
              {miles(resultado.iteracionesCompletadas)}
              {resultado.cancelada && ' · cancelada antes de terminar'}
            </dd>
            <dt>Tiempo</dt>
            <dd>
              {duracion(resultado.milisegundos)}
              {resultado.hilos !== undefined && ` · ${resultado.hilos === 1 ? 'un hilo' : `${resultado.hilos} hilos`}`}
            </dd>
            <dt>Celdas del modelo</dt><dd>{miles(resultado.eleccion.celdasNecesarias)}</dd>
            {/* F2: cuánto de ese tiempo fue leer el libro y cuánto simular. */}
            {resultado.lectura && (
              <>
                <dt>Leer el libro</dt>
                <dd>
                  {duracion(resultado.lectura.milisegundos)} · {miles(resultado.lectura.hojasVisibles)} hojas,{' '}
                  {miles(resultado.lectura.formulas)} fórmulas, {miles(resultado.lectura.sincronizaciones)} viajes a Excel
                </dd>
                <dt>Preparar y simular</dt>
                <dd>{duracion(Math.max(0, resultado.milisegundos - resultado.lectura.milisegundos))}</dd>
              </>
            )}
          </dl>

          {resultado.entradasDeFunciones && resultado.entradasDeFunciones.length > 0 && (
            <>
              <h3>Entradas con funciones RIESGO del libro</h3>
              <ul className="motivos">
                {resultado.entradasDeFunciones.map((e, i) => <li key={`${e.ref}-${i}`}>{e.nombre && e.nombre !== e.ref ? `${e.nombre} (${e.ref})` : e.ref}: {e.distribucion}</li>)}
              </ul>
            </>
          )}
          {resultado.funcionesIgnoradas && resultado.funcionesIgnoradas.length > 0 && (
            <p className="tenue">
              Estas celdas tienen una función RIESGO y también están en el panel; se usó la distribución
              del panel: {resultado.funcionesIgnoradas.join(', ')}.
            </p>
          )}

          {resultado.convergencia && (
            <p className="tenue">
              {resultado.convergencia.noDisponible
                ? `«Simular hasta alcanzar la precisión» no se aplica con Excel en el bucle: se simularon las ${miles(resultado.iteracionesCompletadas)} iteraciones fijadas.`
                : `Precisión buscada ±${(resultado.convergencia.objetivo * 100).toLocaleString('es-ES')} %: ${resultado.convergencia.tandas.map(miles).join(' → ')} iteraciones.`}
            </p>
          )}

          {resultado.trazado && resultado.trazado.length > 0 && (
            <>
              <h3>Por dónde llega cada entrada</h3>
              <ul className="motivos trazado">
                {resultado.trazado.map((t) => (
                  <li key={t.entrada}>
                    <strong>{t.entrada}</strong>
                    {t.salidas.length === 0
                      ? <span className="aviso-linea"> no llega a ninguna salida.</span>
                      : t.salidas.map((s) => <div key={s.salida} className="tenue">→ {s.salida}: {s.camino.join(' → ')}</div>)}
                  </li>
                ))}
              </ul>
            </>
          )}

          {motivos.length > 0 && (
            <>
              <h3>Por qué no pudo el motor rápido</h3>
              <ul className="motivos">
                {motivos.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </Plegable>
      </section>

      {resultado.entradas && resultado.entradas.length > 0 && <EntradasMuestreadas entradas={resultado.entradas} />}
    </>
  );
}

const ANCHO = 280;
const ALTO = 150;
const MARGEN = { arriba: 8, derecha: 8, abajo: 20, izquierda: 34 };

/**
 * La CDF, dibujada a mano en SVG.
 *
 * Sin librería de gráficos: son cien puntos y una polilínea, y meter 200 kB de
 * dependencia en un panel que vive dentro de Excel para esto no se sostiene.
 * El `viewBox` hace que escale sola al ancho del panel, que el usuario cambia
 * arrastrando.
 *
 * El cursor no es un adorno: leer "con un 90 % de probabilidad, por debajo de
 * 4,2 M" **es** el uso de esta curva, y sin cursor hay que estimarlo a ojo
 * contra el eje.
 */
/** Una línea vertical con su nombre sobre un gráfico (la meta, el P80 del cronograma). */
export interface LineaReferencia {
  x: number;
  etiqueta: string;
  /** 'meta' (morada, continua) o 'percentil' (punteada). */
  tipo?: 'meta' | 'percentil';
}

/** Las líneas visibles de izquierda a derecha; con dos o más, la primera escribe su nombre a su izquierda (no se pisan). */
function ordenarLineas(lineas: readonly LineaReferencia[] | undefined, visible: (x: number) => boolean): { l: LineaReferencia; izquierda: boolean }[] {
  const v = (lineas ?? []).filter((l) => visible(l.x)).sort((a, b) => a.x - b.x);
  return v.map((l, k) => ({ l, izquierda: v.length > 1 && k === 0 }));
}

export function CurvaAcumulada({
  puntos,
  referencia,
  etiquetaReferencia,
  formato = formatoDe(false),
  lineas,
}: {
  puntos: readonly PuntoCDF[];
  referencia?: readonly PuntoCDF[];
  etiquetaReferencia?: string;
  /** Líneas verticales con nombre (V2: la meta y el P80). */
  lineas?: readonly LineaReferencia[];
  /** Números o fechas (T7). */
  formato?: FormatoValor;
}) {
  const [cerca, setCerca] = useState<PuntoCDF | null>(null);

  if (puntos.length < 2) return <p className="tenue">Sin curva: hacen falta al menos dos valores distintos.</p>;

  const conRef = referencia && referencia.length >= 2 ? referencia : null;
  // El eje abarca las dos curvas, para que se puedan comparar a la misma escala.
  const xs = [...puntos, ...(conRef ?? [])].map((p) => p.x);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const rango = max - min || 1;

  const aX = (x: number) => MARGEN.izquierda + ((x - min) / rango) * (ANCHO - MARGEN.izquierda - MARGEN.derecha);
  const aY = (p: number) => ALTO - MARGEN.abajo - p * (ALTO - MARGEN.arriba - MARGEN.abajo);

  const linea = puntos.map((p) => `${aX(p.x).toFixed(1)},${aY(p.p).toFixed(1)}`).join(' ');

  const alMover = (e: React.MouseEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    // De píxeles de pantalla a unidades del viewBox: el SVG escala con el panel.
    const xSvg = ((e.clientX - caja.left) / caja.width) * ANCHO;
    let mejor = puntos[0] as PuntoCDF;
    for (const p of puntos) if (Math.abs(aX(p.x) - xSvg) < Math.abs(aX(mejor.x) - xSvg)) mejor = p;
    setCerca(mejor);
  };

  return (
    <figure className="grafico">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label="Curva de probabilidad acumulada"
        onMouseMove={alMover}
        onMouseLeave={() => setCerca(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line className="rejilla" x1={MARGEN.izquierda} y1={aY(p)} x2={ANCHO - MARGEN.derecha} y2={aY(p)} />
            <text className="eje" x={MARGEN.izquierda - 5} y={aY(p) + 3} textAnchor="end">
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}

        {conRef && (
          <polyline
            className="curva-referencia"
            points={conRef.map((p) => `${aX(p.x).toFixed(1)},${aY(p.p).toFixed(1)}`).join(' ')}
          />
        )}
        <polyline className="curva" points={linea} />
        {ordenarLineas(lineas, (x) => Number.isFinite(x) && x >= min && x <= max).map(({ l, izquierda }, k) => (
          <g key={`${l.etiqueta}-${k}`} className={`linea-ref ${l.tipo ?? 'percentil'}`}>
            <line x1={aX(l.x)} y1={MARGEN.arriba} x2={aX(l.x)} y2={ALTO - MARGEN.abajo} />
            <text x={aX(l.x) + (izquierda ? -3 : 3)} y={MARGEN.arriba + 9} textAnchor={izquierda ? 'end' : 'start'}>{l.etiqueta}</text>
          </g>
        ))}

        {cerca && (
          <g>
            <line className="cursor" x1={aX(cerca.x)} y1={MARGEN.arriba} x2={aX(cerca.x)} y2={ALTO - MARGEN.abajo} />
            <circle className="punto" cx={aX(cerca.x)} cy={aY(cerca.p)} r={3.5} />
          </g>
        )}

        <text className="eje" x={MARGEN.izquierda} y={ALTO - 6}>{formato.valor(min)}</text>
        <text className="eje" x={ANCHO - MARGEN.derecha} y={ALTO - 6} textAnchor="end">{formato.valor(max)}</text>
      </svg>

      {conRef && (
        <p className="leyenda-curvas">
          <span><span className="muestra-linea actual" />Esta simulación</span>
          <span><span className="muestra-linea referencia" />{etiquetaReferencia ?? 'Referencia'}</span>
        </p>
      )}
      <figcaption className="tenue">
        {cerca
          ? `${Math.round(cerca.p * 100)} % de probabilidad de quedar por debajo de ${formato.valor(cerca.x)}`
          : 'Pasa el ratón por la curva para leer un valor.'}
      </figcaption>
    </figure>
  );
}

const VISIBLES_TORNADO = 10;

/** Coma decimal y signo explícito: "+0,82", "−0,15". */

/** Barras de frecuencia de una salida o entrada de texto (T2). */
function BarrasCategorias({ filas, resaltar }: { filas: readonly { valor: string; proporcion: number; conteo: number; esperada?: number }[]; resaltar?: string }) {
  const mayor = Math.max(...filas.map((f) => Math.max(f.proporcion, f.esperada ?? 0)), 0.0001);
  return (
    <ul className="barras-categorias">
      {filas.map((f) => (
        <li key={f.valor} className={f.valor === resaltar ? 'resaltada' : undefined}>
          <span className="cat-nombre" title={f.valor}>{f.valor}</span>
          <span className="cat-barra">
            <span className="cat-relleno" style={{ width: `${(f.proporcion / mayor) * 100}%` }} />
            {f.esperada !== undefined && <span className="cat-esperada" style={{ left: `${(f.esperada / mayor) * 100}%` }} title="Lo esperado" />}
          </span>
          <span className="cat-valor">
            {(f.proporcion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %
            <span className="tenue"> ({miles(f.conteo)})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** La salida en cada categoría de cada entrada de texto (T3). */
function TablasPorCategoria({ bloques }: { bloques: readonly PorCategoria[] }) {
  return (
    <>
      {bloques.map((b) => {
        const numerica = b.filas.some((f) => f.media !== undefined);
        return (
          <div key={b.id}>
            <h3>Según {b.nombre}</h3>
            <div className="tabla-desplazable">
              <table className="tabla-resumen sin-clic">
                <thead>
                  <tr>
                    <th>{b.nombre}</th>
                    <th>Veces</th>
                    {numerica ? (<><th>Media</th><th>p5</th><th>p95</th></>) : (<><th>Sale más</th><th>Prob.</th></>)}
                  </tr>
                </thead>
                <tbody>
                  {b.filas.map((f) => (
                    <tr key={f.categoria}>
                      <td>{f.categoria}</td>
                      <td>{(f.proporcion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</td>
                      {numerica ? (
                        <>
                          <td>{f.media === undefined ? '' : numero(f.media)}</td>
                          <td>{f.p5 === undefined ? '' : numero(f.p5)}</td>
                          <td>{f.p95 === undefined ? '' : numero(f.p95)}</td>
                        </>
                      ) : (
                        <>
                          <td>{f.masFrecuente ?? ''}</td>
                          <td>{f.probabilidad === undefined ? '' : `${(f.probabilidad * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}

/**
 * Una salida de texto o de sí/no (T2, T6): con qué frecuencia sale cada valor,
 * la probabilidad del valor que interesa y qué entradas lo deciden (T3).
 */
function SalidaDeTexto({
  salida,
  valorDeInteres,
  alCambiarValor,
  comparaciones,
}: {
  salida: ResultadoSalida;
  valorDeInteres?: string;
  alCambiarValor: (v: string | null) => void;
  /** La comparación con el escenario marcado y la tabla de escenarios, si los hay. */
  comparaciones?: ReactNode;
}) {
  const categorias = salida.categorias ?? [];
  const elegido = valorDeInteres && categorias.some((c) => c.valor === valorDeInteres) ? valorDeInteres : undefined;
  const objetivo = elegido ?? categorias[0]?.valor;
  const p = objetivo ? probabilidadDeValor(categorias, objetivo) : undefined;
  const decisivas = salida.decisivas?.find((d) => d.valor === objetivo)?.filas.filter((f) => f.rango > 0) ?? [];
  const frases = lecturaDeTexto({
    nombre: salida.nombre,
    categorias,
    ...(elegido ? { valorDeInteres: elegido } : {}),
    ...(salida.decisivas ? { decisivas: salida.decisivas } : {}),
  });
  return (
    <section>
      <h2 className="titulo-salida">{salida.nombre}</h2>
      <p className="tenue">{salida.ref} · salida de {categorias.length <= 2 ? 'sí/no o texto' : 'texto'}</p>
      {frases.length > 0 && <p className="lectura">{frases.join(' ')}</p>}

      <h3>Valores que salen</h3>
      <BarrasCategorias filas={categorias} {...(objetivo ? { resaltar: objetivo } : {})} />

      <div className="umbral">
        <label className="umbral-pregunta">
          <span>Probabilidad de que salga</span>
          <select value={elegido ?? ''} onChange={(e) => alCambiarValor(e.target.value || null)}>
            <option value="">{categorias[0] ? `${categorias[0].valor} (el más frecuente)` : '—'}</option>
            {categorias.map((c) => <option key={c.valor} value={c.valor}>{c.valor}</option>)}
          </select>
        </label>
        {p !== undefined && (
          <p className="umbral-respuesta">
            <strong>{(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</strong>
            <span className="tenue"> de las iteraciones</span>
          </p>
        )}
      </div>

      {decisivas.length > 0 && (
        <>
          <h3>Qué decide que salga «{objetivo}»</h3>
          <div className="tabla-desplazable">
            <table className="tabla-resumen sin-clic">
              <thead><tr><th>Entrada</th><th>10 % más bajo</th><th>10 % más alto</th></tr></thead>
              <tbody>
                {decisivas.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nombre}</td>
                    <td>{(f.bajo * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</td>
                    <td>{(f.alto * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tenue">Con qué probabilidad sale «{objetivo}» cuando cada entrada está en su 10 % más bajo y en su 10 % más alto.</p>
        </>
      )}

      {comparaciones}

      {salida.porCategoria && salida.porCategoria.length > 0 && <TablasPorCategoria bloques={salida.porCategoria} />}
    </section>
  );
}


/** Medidas de riesgo de una salida (H2): las dos colas y la forma. */
export function MedidasDeRiesgo({ riesgo, conTitulo = true, formato = formatoDe(false) }: { riesgo: MedidasRiesgo; conTitulo?: boolean; formato?: FormatoValor }) {
  const forma = riesgo.asimetria > 0.3 ? 'cola larga a la derecha' : riesgo.asimetria < -0.3 ? 'cola larga a la izquierda' : 'casi simétrica';
  return (
    <>
      {conTitulo && <h3>Medidas de riesgo</h3>}
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead><tr><th></th><th>Cola baja</th><th>Cola alta</th></tr></thead>
          <tbody>
            <tr><td title="Valor que solo el 5 % de las iteraciones empeora">VaR 5 %</td><td>{formato.valor(riesgo.varInferior)}</td><td>{formato.valor(riesgo.varSuperior)}</td></tr>
            <tr><td title="Media del 5 % de las iteraciones más extremas">CVaR 5 %</td><td>{formato.valor(riesgo.cvarInferior)}</td><td>{formato.valor(riesgo.cvarSuperior)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="tenue">
        VaR: el valor que solo el 5 % de las iteraciones empeora. CVaR: la media de ese 5 %.
        Si la salida es una ganancia, mira la cola baja; si es un coste, la alta.
        Asimetría {riesgo.asimetria.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ({forma}) ·
        curtosis {riesgo.curtosis.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ·
        semidesviación {formato.dispersion(riesgo.semidesviacion)}.
      </p>
    </>
  );
}


/**
 * Qué tiene que pasar para que la salida caiga en su 10 % más bajo o más alto
 * (D1): cómo están las entradas en esos casos frente a lo normal.
 */
export function QueTieneQuePasar({ colas, conTitulo = true }: { colas: readonly AnalisisCola[]; conTitulo?: boolean }) {
  const [cola, setCola] = useState<'baja' | 'alta'>('baja');
  const c = colas.find((x) => x.cola === cola) ?? colas[0];
  if (!c) return null;
  const filas = c.filas.slice(0, 6);
  const pct = (p: number) => `${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`;
  return (
    <>
      {conTitulo && <h3>Qué tiene que pasar</h3>}
      <label className="umbral-pregunta">
        <span>Para que quede en su 10 %</span>
        <select value={cola} onChange={(e) => setCola(e.target.value as 'baja' | 'alta')}>
          <option value="baja">más bajo</option>
          <option value="alta">más alto</option>
        </select>
      </label>
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead><tr><th>Entrada</th><th>En esos casos</th><th>Normalmente</th><th>Desplaz.</th></tr></thead>
          <tbody>
            {filas.map((f) => f.categoria !== undefined ? (
              <tr key={f.id}>
                <td>{f.nombre}</td>
                <td className="celda-texto">«{f.categoria}» {pct(f.proporcionCola ?? 0)}</td>
                <td>{pct(f.proporcion ?? 0)}</td>
                <td></td>
              </tr>
            ) : (
              <tr key={f.id}>
                <td>{f.nombre}</td>
                <td>{numero(f.medianaCola ?? NaN)}</td>
                <td>{numero(f.mediana ?? NaN)}</td>
                <td>{(f.desplazamiento ?? 0) > 0 ? '▲' : '▼'} {Math.abs(f.desplazamiento ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} σ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tenue">
        Medianas de cada entrada en las iteraciones en que la salida cae en su 10 % {cola === 'baja' ? 'más bajo' : 'más alto'},
        frente a su mediana normal. El desplazamiento está en desviaciones típicas de la entrada: más de 0,5 σ
        es una señal clara. En las entradas de texto, la categoría que más abunda en esos casos.
      </p>
    </>
  );
}

const TODAS = '__todas__';

/**
 * Búsqueda de objetivo (H4): qué valor de una celda deja la probabilidad del
 * umbral en la que se quiere. Cada punto, una simulación entera.
 */
function BuscarObjetivo({
  salida, umbral, decimal, alBuscar,
}: {
  salida: ResultadoSalida;
  umbral: UmbralRiskModel;
  decimal: string;
  alBuscar: (b: PeticionBusqueda, alAvanzar: (m: string) => void) => Promise<ResultadoBusqueda | string>;
}) {
  const [ref, setRef] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [objetivo, setObjetivo] = useState('10');
  const [avance, setAvance] = useState<string | null>(null);
  const [r, setR] = useState<ResultadoBusqueda | string | null>(null);
  const d = leerNumero(desde, decimal);
  const h = leerNumero(hasta, decimal);
  const o = leerNumero(objetivo, decimal);
  const listo = ref.trim() !== '' && d !== null && h !== null && d !== h && o !== null && o > 0 && o < 100;
  const deLaSeleccion = async () => {
    try {
      const s = await leerSeleccion();
      setRef(s.direccion);
    } catch (e) {
      setR(e instanceof Error ? e.message : String(e));
    }
  };
  const buscar = async () => {
    if (!listo) return;
    setR(null);
    setAvance('Empezando…');
    try {
      setR(await alBuscar({ ref: ref.trim(), desde: d as number, hasta: h as number, idSalida: salida.id, umbral: { valor: umbral.value, sentido: umbral.direction }, objetivo: (o as number) / 100 }, setAvance));
    } catch (e) {
      setR(e instanceof Error ? e.message : String(e));
    } finally {
      setAvance(null);
    }
  };
  const texto = `P(${salida.nombre} ${umbral.direction === 'below' ? '<' : '>'} ${numero(umbral.value)})`;
  return (
    <div className="buscar-objetivo">
      <p className="tenue">Qué valor de una celda deja {texto} en la probabilidad que quieras. Cada paso es una simulación entera (unas 15).</p>
      <div className="parametros">
        <label className="campo ancho">
          <span className="tenue">Celda que se ajusta</span>
          <input type="text" value={ref} placeholder="Modelo!C5" onChange={(e) => setRef(e.target.value)} />
        </label>
        <button type="button" className="secundario" onClick={() => void deLaSeleccion()}>Leer de la selección</button>
        <label className="campo"><span className="tenue">Desde</span><input type="text" inputMode="decimal" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="campo"><span className="tenue">Hasta</span><input type="text" inputMode="decimal" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <label className="campo"><span className="tenue">Probabilidad (%)</span><input type="text" inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /></label>
      </div>
      <button type="button" onClick={() => void buscar()} disabled={!listo || avance !== null}>{avance !== null ? 'Buscando…' : 'Buscar'}</button>
      {avance && <p className="tenue">{avance}</p>}
      {typeof r === 'string' && <p className="aviso-linea">{r}</p>}
      {r && typeof r !== 'string' && (
        <>
          {r.solucion !== undefined
            ? <p className="aviso-ok">Con <strong>{ref}</strong> = <strong>{numero(r.solucion)}</strong>, {texto} es del {pct(r.probSolucion ?? NaN)}.</p>
            : <p className="aviso-linea">{r.motivo}</p>}
          <p className="tenue">Probado: {r.puntos.map((p) => `${numero(p.valor)} → ${pct(p.prob)}`).join(' · ')}</p>
        </>
      )}
    </div>
  );
}

/** «Qué la mueve más»: por correlación (el tornado de siempre) o por cambio en la salida (D4). */
function Sensibilidad({ salida, muestra }: { salida: ResultadoSalida; muestra?: number }) {
  const [vista, setVista] = useState<'correlacion' | 'cambio'>('correlacion');
  const conCambio = Boolean(salida.arana && salida.arana.length > 0);
  return (
    <>
      {conCambio && (
        <div className="conmutador" role="group" aria-label="Cómo medir la sensibilidad">
          <button type="button" aria-pressed={vista === 'correlacion'} onClick={() => setVista('correlacion')}>Correlación</button>
          <button type="button" aria-pressed={vista === 'cambio'} onClick={() => setVista('cambio')}>Cambio en la salida</button>
        </div>
      )}
      {vista === 'cambio' && conCambio
        ? <TornadoCambio curvas={salida.arana ?? []} media={salida.resumen.media} formato={formatoDe(salida.fecha)} />
        : <Tornado filas={salida.sensibilidad ?? []} {...(muestra !== undefined ? { muestra } : {})} {...(salida.r2 !== undefined ? { r2: salida.r2 } : {})} />}
    </>
  );
}

/** Como mucho, estas iteraciones a la hoja (C3): más, y Excel tarda en escribirlas y en abrir el libro. */
const LIMITE_EXPORTAR = 100_000;

/**
 * Las opciones de las decisiones lado a lado (T9): cada una simulada con los
 * mismos números aleatorios. Sin juicio: si es mejor más o menos depende de
 * la salida (un beneficio o un coste).
 */
function TablaDecisiones({ decisiones, idSalida, formato }: { decisiones: ResultadoDecisiones; idSalida: string; formato: FormatoValor }) {
  const filas = decisiones.opciones
    .map((o, i) => ({ etiqueta: o.etiqueta, i, s: o.salidas.find((x) => x.id === idSalida) }))
    .filter((f): f is { etiqueta: string; i: number; s: SalidaEnOpcion } => f.s !== undefined);
  if (filas.length < 2) return null;
  const conUmbral = filas.some((f) => f.s.probUmbral !== undefined);
  const texto = filas.some((f) => f.s.moda !== undefined);
  return (
    <Plegable id="decisiones" titulo="Comparar decisiones" abierta resumen={decisiones.celdas.map((c) => c.nombre).join(' · ')}>
      <Ayuda tema="decisiones" />
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead>
            <tr>
              <th>{decisiones.celdas.map((c) => c.nombre).join(' · ')}</th>
              {texto ? <th>Lo más frecuente</th> : <><th>Media</th><th>p5</th><th>p95</th></>}
              {conUmbral && <th>Umbral</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.i}>
                <td className="celda-texto">{f.etiqueta}{f.i === 0 && <span className="tenue"> (en la hoja)</span>}</td>
                {texto
                  ? <td className="celda-texto">{f.s.moda ? `«${f.s.moda.valor}» ${pct(f.s.moda.proporcion)}` : '—'}</td>
                  : <>
                      <td>{formato.valor(f.s.media)}</td>
                      <td>{f.s.p5 === undefined ? '' : formato.valor(f.s.p5)}</td>
                      <td>{f.s.p95 === undefined ? '' : formato.valor(f.s.p95)}</td>
                    </>}
                {conUmbral && <td>{f.s.probUmbral === undefined ? '' : pct(f.s.probUmbral)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tenue">
        Cada opción se simuló con los mismos números aleatorios, así que las diferencias son de la
        decisión y no del azar. El resto de esta página es de la opción que hay en la hoja (la primera).
      </p>
    </Plegable>
  );
}

/**
 * V1: la contingencia de una salida frente a su valor base —lo que da la hoja
 * sin incertidumbre—: la probabilidad de cumplirlo y, en un coste, la reserva
 * para el P50, P80 y P90 (en un beneficio, lo que se obtiene con esa
 * confianza). Ver `excel/contingencia.ts`.
 */
function SeccionContingencia({
  salida,
  base,
  clase,
  alCambiarClase,
}: {
  salida: ResultadoSalida;
  base: SimulacionCompletada['base'];
  clase: ClaseSalida;
  alCambiarClase: (c: ClaseSalida) => void;
}) {
  const f = formatoDe(salida.fecha);
  if (base && 'aleatorio' in base) {
    return (
      <Plegable id="contingencia" titulo="Contingencia" resumen="sin valor base">
        <p className="tenue">
          El libro estaba en «Aleatorio» al simular, así que la hoja no enseñaba una estimación sino un sorteo.
          Pon «Valores fijos» en la cinta y vuelve a simular para ver la contingencia frente al valor base.
        </p>
      </Plegable>
    );
  }
  const c = salida.muestraOrdenada && salida.valorBase !== undefined ? contingencia(salida.muestraOrdenada, salida.valorBase, clase) : null;
  if (!c) return null;
  const coste = clase === 'cost';
  const p80 = c.niveles.find((n) => n.confianza === 0.8) as NivelContingencia;
  const resumen = coste
    ? `${pctCorto(c.probabilidadBase)} de no pasarse · reserva P80 ${f.dispersion(Math.max(0, p80.diferencia))}`
    : `${pctCorto(c.probabilidadBase)} de alcanzarlo · P20 ${f.valor(p80.valor)}`;
  return (
    <Plegable id="contingencia" titulo="Contingencia" abierta resumen={resumen}>
      <div className="clase-salida" role="radiogroup" aria-label="Qué es esta salida">
        <label><input type="radio" checked={coste} onChange={() => alCambiarClase('cost')} /> Un coste o un plazo (malo si sube)</label>
        <label><input type="radio" checked={!coste} onChange={() => alCambiarClase('benefit')} /> Un beneficio (malo si baja)</label>
      </div>
      <p>
        Valor base <strong>{f.valor(c.base)}</strong>
        <span className="tenue"> (lo que da la hoja sin incertidumbre{base && 'fijo' in base ? `, con las funciones RIESGO en ${base.fijo}` : ''})</span>.
        {' '}Probabilidad de {coste ? 'no pasarse de él' : 'alcanzarlo'}: <strong>{pctCorto(c.probabilidadBase)}</strong>.
      </p>
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead>
            <tr><th>Confianza</th><th>Percentil</th><th>Valor</th><th>{coste ? 'Reserva sobre el base' : 'Por debajo del base'}</th><th>% del base</th></tr>
          </thead>
          <tbody>
            {c.niveles.map((n) => (
              <tr key={n.confianza}>
                <td>{pctCorto(n.confianza)}</td>
                <td>p{Math.round(n.percentil * 100)}</td>
                <td>{f.valor(n.valor)}</td>
                <td>{f.dispersion(n.diferencia)}</td>
                <td>{n.relativa === null || salida.fecha ? '' : pctCorto(n.relativa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tenue">
        {coste
          ? p80.diferencia > 0
            ? `Para tener un 80 % de confianza de no pasarse hace falta una reserva de ${f.dispersion(p80.diferencia)} sobre el valor base (el P80, ${f.valor(p80.valor)}).`
            : `El valor base ya cubre un 80 % de confianza: el P80 (${f.valor(p80.valor)}) no lo supera.`
          : `Con un 80 % de confianza se obtiene al menos ${f.valor(p80.valor)}${p80.diferencia > 0 ? `: ${f.dispersion(p80.diferencia)} menos que el valor base` : ', por encima del valor base'}.`}
      </p>
      <Ayuda tema="contingencia" />
    </Plegable>
  );
}

/**
 * V2: la matriz de probabilidad e impacto (5 × 5): la probabilidad en
 * horizontal, el impacto en vertical (el mayor arriba) y el color de la
 * severidad. Cada riesgo, numerado como en la lista de debajo.
 */
export function MatrizRiesgosTabla({ filas }: { filas: readonly FilaRiesgo[] }) {
  const m = matrizDeRiesgos(filas);
  const numeroDe = new Map(m.ubicados.map((r, i) => [r, i + 1] as const));
  return (
    <>
      <div className="tabla-desplazable">
        <table className="matriz-riesgos" aria-label="Matriz de probabilidad e impacto">
          <tbody>
            {[4, 3, 2, 1, 0].map((i) => (
              <tr key={i}>
                <th scope="row">{NIVELES_IMPACTO[i]}</th>
                {[0, 1, 2, 3, 4].map((p) => {
                  const riesgos = m.casillas[i]?.[p] ?? [];
                  const sev = severidad(p, i);
                  return (
                    <td key={p} className={`sev-${sev}`} title={`${NIVELES_PROBABILIDAD[p]} probabilidad · impacto ${NIVELES_IMPACTO[i]?.toLowerCase()} · severidad ${NOMBRE_SEVERIDAD[sev].toLowerCase()}${riesgos.length ? `: ${riesgos.map((r) => r.nombre).join(', ')}` : ''}`}>
                      {riesgos.map((r) => numeroDe.get(r)).join(' ')}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="ejes">
              <th scope="row" className="tenue">Impacto ↑ · Probabilidad →</th>
              {NIVELES_PROBABILIDAD.map((n) => <th key={n} scope="col">{n}</th>)}
            </tr>
          </tbody>
        </table>
      </div>
      <ol className="lista-matriz">
        {m.ubicados.map((r) => (
          <li key={r.celda + r.nombre}>
            {r.nombre} <span className={`etiqueta-sev sev-${r.severidad}`}>{NOMBRE_SEVERIDAD[r.severidad]}</span>
          </li>
        ))}
      </ol>
      {m.sinUbicar.length > 0 && (
        <p className="tenue">Sin casilla (su probabilidad o su impacto cambian en cada iteración): {m.sinUbicar.join(', ')}.</p>
      )}
      <p className="tenue">
        Probabilidad: muy baja &lt; 10 %, baja 10–30 %, media 30–50 %, alta 50–70 %, muy alta ≥ 70 %. Impacto medio
        frente al mayor del registro ({numero(m.mayorImpacto)}): muy alto ≥ 1/2, alto ≥ 1/4, medio ≥ 1/8, bajo ≥ 1/16.
      </p>
    </>
  );
}

const pctCorto = (x: number) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

/**
 * El registro de riesgos (T8): cada `RIESGO.EVENTO` con su probabilidad, su
 * impacto y su valor esperado (p × impacto medio), de más a menos, y cuánto
 * es del total. Lo que pesa cada uno en una salida concreta, en el tornado.
 */
function RegistroRiesgos({ filas }: { filas: readonly FilaRiesgo[] }) {
  const total = filas.reduce((s, f) => s + (f.valorEsperado ?? 0), 0);
  const conValor = filas.filter((f) => f.valorEsperado !== null);
  const mayor = Math.max(...conValor.map((f) => Math.abs(f.valorEsperado as number)), 0);
  return (
    <section>
      <Plegable id="registro" titulo={<h2>Registro de riesgos</h2>} abierta
        resumen={`${filas.length} riesgo${filas.length === 1 ? '' : 's'} · esperado ${numero(total)}`}>
        <Ayuda tema="registro" />
        <div className="tabla-desplazable">
          <table className="tabla-resumen sin-clic registro-riesgos">
            <thead>
              <tr><th>Riesgo · impacto</th><th>Prob.</th><th title="Probabilidad × impacto medio">Esperado</th><th>Del total</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.celda}>
                  <td title={f.celda}>{f.nombre}<span className="tenue impacto-registro">{f.impacto}</span></td>
                  <td>{f.probabilidad === null ? 'variable' : pct(f.probabilidad)}</td>
                  <td>{f.valorEsperado === null ? '—' : numero(f.valorEsperado)}</td>
                  <td>
                    {f.valorEsperado !== null && total !== 0 && (
                      <span className="barra-registro">
                        <span style={{ width: `${mayor > 0 ? Math.round((Math.abs(f.valorEsperado) / mayor) * 30) : 0}px` }} />
                        {pct(f.valorEsperado / total)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tenue">
          Esperado: probabilidad × impacto medio, lo que aporta cada riesgo de media (ocurra o no).
          Entre todos, {numero(total)}. Lo que pesa cada uno en una salida concreta, y su incertidumbre,
          lo dice «Qué la mueve más» (sus entradas «ocurre» e «impacto»).
        </p>
        <h3>Probabilidad e impacto</h3>
        <MatrizRiesgosTabla filas={filas} />
        <Ayuda tema="matriz" />
      </Plegable>
    </section>
  );
}

/**
 * Cómo se muestreó cada entrada (C9): los valores que de verdad se generaron,
 * con la distribución elegida encima, para comprobar que el modelo usó lo que
 * se quería. Una entrada cada vez, elegida arriba.
 */
function EntradasMuestreadas({ entradas }: { entradas: readonly EntradaMuestreada[] }) {
  const [id, setId] = useState(entradas[0]?.id ?? '');
  const e = entradas.find((x) => x.id === id) ?? entradas[0];
  if (!e) return null;
  return (
    <section>
      <Plegable id="muestreadas" titulo={<h2>Cómo se muestrearon las entradas</h2>} resumen={`${entradas.length} entrada${entradas.length === 1 ? '' : 's'}`}>
      <p className="tenue">
        Los valores que de verdad se generaron en la simulación ({miles(e.n)} iteraciones), con la
        distribución elegida encima: la línea es lo que se esperaba en cada barra.
      </p>
      <label className="selector-salida">
        <span className="tenue">Entrada</span>
        <select value={e.id} onChange={(ev) => setId(ev.target.value)}>
          {entradas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
        </select>
      </label>
      <p className="tenue">{e.ref} · {e.distribucion}</p>
      {e.frecuencias ? (
        <>
          <BarrasCategorias filas={e.frecuencias} />
          <p className="tenue">La marca de cada barra es la probabilidad que se le dio a esa categoría.</p>
        </>
      ) : (<>
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead>
            <tr><th></th><th>Muestreado</th>{e.teorica && <th>Esperado</th>}</tr>
          </thead>
          <tbody>
            <tr><td>Media</td><td>{formatoDe(e.fecha).valor(e.media)}</td>{e.teorica && <td>{formatoDe(e.fecha).valor(e.teorica.media)}</td>}</tr>
            <tr><td>Desviación</td><td>{formatoDe(e.fecha).dispersion(e.desviacion)}</td>{e.teorica && <td>{formatoDe(e.fecha).dispersion(e.teorica.desviacion)}</td>}</tr>
            <tr><td>Mínimo</td><td>{formatoDe(e.fecha).valor(e.min)}</td>{e.teorica && <td></td>}</tr>
            <tr><td>p5</td><td>{formatoDe(e.fecha).valor(e.percentiles.p5)}</td>{e.teorica && <td></td>}</tr>
            <tr><td>p50</td><td>{formatoDe(e.fecha).valor(e.percentiles.p50)}</td>{e.teorica && <td></td>}</tr>
            <tr><td>p95</td><td>{formatoDe(e.fecha).valor(e.percentiles.p95)}</td>{e.teorica && <td></td>}</tr>
            <tr><td>Máximo</td><td>{formatoDe(e.fecha).valor(e.max)}</td>{e.teorica && <td></td>}</tr>
          </tbody>
        </table>
      </div>
      {e.histograma.length > 0 && (
        <>
          <h3>Histograma</h3>
          <Histograma barras={e.histograma} {...(e.esperado ? { esperado: e.esperado } : {})} etiqueta={`Histograma de ${e.nombre}`} formato={formatoDe(e.fecha)} />
        </>
      )}
      <h3>Probabilidad acumulada</h3>
      <CurvaAcumulada puntos={e.cdf} formato={formatoDe(e.fecha)} />
      </>)}
      </Plegable>
    </section>
  );
}

/** Dos o tres frases que dicen lo que enseñan los números de la salida (C7). Con reglas, sin IA. */
function LecturaSalida({ salida, umbral }: { salida: ResultadoSalida; umbral?: UmbralRiskModel }) {
  const p = umbral && salida.muestraOrdenada && salida.muestraOrdenada.length > 0
    ? probabilidadUmbral(salida.muestraOrdenada, umbral.value, umbral.direction === 'below' ? 'debajo' : 'encima')
    : undefined;
  const frases = lecturaDeSalida({
    ...salida,
    ...(umbral && p !== undefined ? { umbral: { valor: umbral.value, sentido: umbral.direction, probabilidad: p } } : {}),
  });
  return frases.length > 0 ? <p className="lectura">{frases.join(' ')}</p> : null;
}

/**
 * La tabla con todas las salidas y el selector de cuál enseñar (E6). Con
 * muchas salidas, recorrer una detrás de otra obligaba a desplazarse mucho
 * (prueba del usuario, 27/09).
 */
function ResumenSalidas({
  salidas,
  umbrales,
  vista,
  alElegir,
  pc,
}: {
  salidas: readonly ResultadoSalida[];
  umbrales: ReadonlyMap<string, UmbralRiskModel | undefined>;
  vista: string;
  alElegir: (id: string) => void;
  pc: PercentilesClave;
}) {
  const conUmbral = salidas.some((s) => umbrales.get(s.id) && s.muestraOrdenada);
  return (
    <section>
      <h2>Salidas</h2>
      <label className="selector-salida">
        <span className="tenue">Ver</span>
        <select value={vista} onChange={(e) => alElegir(e.target.value)}>
          {salidas.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}</option>
          ))}
          <option value={TODAS}>Todas, una debajo de otra</option>
        </select>
      </label>
      <div className="tabla-desplazable">
        <table className="tabla-resumen">
          <thead>
            <tr>
              <th>Salida</th>
              <th>Media</th>
              <th>{pc.etiquetaBajo}</th>
              <th>p50</th>
              <th>{pc.etiquetaAlto}</th>
              {conUmbral && <th>Umbral</th>}
            </tr>
          </thead>
          <tbody>
            {salidas.map((s) => {
              const u = umbrales.get(s.id);
              const p = u && s.muestraOrdenada && s.resumen.n > 0
                ? probabilidadUmbral(s.muestraOrdenada, u.value, u.direction === 'below' ? 'debajo' : 'encima')
                : null;
              const sinDatos = s.resumen.n === 0;
              if (esSalidaDeTexto(s)) {
                const moda = s.categorias?.[0];
                return (
                  <tr key={s.id} className={s.id === vista ? 'elegida' : undefined} onClick={() => alElegir(s.id)} title="Ver esta salida">
                    <td>{s.nombre}</td>
                    <td colSpan={4} className="celda-texto">
                      {moda ? `«${moda.valor}» ${(moda.proporcion * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : '—'}
                    </td>
                    {conUmbral && <td></td>}
                  </tr>
                );
              }
              return (
                <tr
                  key={s.id}
                  className={s.id === vista ? 'elegida' : undefined}
                  onClick={() => alElegir(s.id)}
                  title="Ver esta salida"
                >
                  <td>{s.nombre}</td>
                  <td>{sinDatos ? '—' : formatoDe(s.fecha).valor(s.resumen.media)}</td>
                  <td>{sinDatos ? '—' : formatoDe(s.fecha).valor(s.resumen.percentiles[pc.claveBajo] ?? NaN)}</td>
                  <td>{sinDatos ? '—' : formatoDe(s.fecha).valor(s.resumen.percentiles.p50 ?? NaN)}</td>
                  <td>{sinDatos ? '—' : formatoDe(s.fecha).valor(s.resumen.percentiles[pc.claveAlto] ?? NaN)}</td>
                  {conUmbral && (
                    <td>{p === null ? '' : `${u?.direction === 'below' ? '<' : '>'} ${formatoDe(s.fecha).valor(u?.value ?? 0)}: ${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="tenue">
        Pulsa una fila, o selecciona la celda de una salida en la hoja, para verla.
      </p>
    </section>
  );
}

function rho(v: number): string {
  const t = Math.abs(v).toFixed(2).replace('.', ',');
  return `${v < 0 ? '\u2212' : '+'}${t}`;
}

/**
 * El gráfico de tornado: una barra por entrada, de mayor a menor efecto.
 *
 * Hacia la derecha, las entradas que **suben** la salida al subir (ρ > 0);
 * hacia la izquierda, las que la **bajan**. El color repite lo que ya dicen el
 * lado y el signo del número, así que no hace falta distinguir colores para
 * leerlo. La longitud es |ρ| sobre una escala fija de −1 a 1: dos tornados se
 * pueden comparar entre sí a ojo.
 *
 * HTML y no SVG porque los nombres de las entradas son largos y el panel,
 * estrecho: una rejilla recorta con puntos suspensivos y el nombre completo
 * sigue en la línea de lectura de abajo.
 */
export function Tornado({ filas, muestra, r2 }: { filas: readonly FilaSensibilidadPanel[]; muestra?: number; r2?: number }) {
  const [todas, setTodas] = useState(false);
  const [cerca, setCerca] = useState<FilaSensibilidadPanel | null>(null);
  const visibles = todas ? filas : filas.slice(0, VISIBLES_TORNADO);

  const describir = (f: FilaSensibilidadPanel) =>
    `${f.nombre === f.ref ? f.nombre : `${f.nombre} (${f.ref})`}: ρ = ${rho(f.spearman)} · ` +
    (f.contribucion !== undefined
      ? `${Math.round(Math.max(0, f.contribucion) * 100)} % de la varianza explicada. `
      : `${Math.round(f.peso * 100)} % del efecto. `) +
    (f.categorica
      ? 'Es una entrada de texto: cuenta cuánto cambia la salida según su valor, sin sentido de subir o bajar.'
      : f.spearman >= 0 ? 'Cuando sube, la salida tiende a subir.' : 'Cuando sube, la salida tiende a bajar.');

  return (
    <figure className="tornado" aria-label="Sensibilidad de la salida a cada entrada">
      <p className="tornado-leyenda" aria-hidden="true">
        <span><span className="marca" style={{ background: 'var(--baja)' }} />la baja</span>
        <span>la sube<span className="marca" style={{ background: 'var(--sube)' }} /></span>
      </p>

      {visibles.map((f) => {
        const lado = f.categorica ? 'segun' : f.spearman >= 0 ? 'sube' : 'baja';
        return (
          <div
            key={f.id}
            className="tornado-fila"
            tabIndex={0}
            title={describir(f)}
            onMouseEnter={() => setCerca(f)}
            onMouseLeave={() => setCerca(null)}
            onFocus={() => setCerca(f)}
            onBlur={() => setCerca(null)}
          >
            <span className="tornado-nombre">{f.nombre}</span>
            <span className="tornado-pista">
              <span className={`tornado-barra ${lado}`} style={{ width: `${Math.abs(f.spearman) * 50}%` }} />
            </span>
            <span className="tornado-valor">{f.categorica ? 'texto' : rho(f.spearman)}</span>
            <span className="tornado-contribucion tenue">
              {f.contribucion !== undefined ? `${Math.round(Math.max(0, f.contribucion) * 100)} %` : ''}
            </span>
          </div>
        );
      })}

      {filas.length > VISIBLES_TORNADO && (
        <button type="button" className="enlace" onClick={() => setTodas(!todas)}>
          {todas ? `Ver solo las ${VISIBLES_TORNADO} primeras` : `Ver las ${filas.length} entradas`}
        </button>
      )}

      <figcaption className="tenue">
        {cerca
          ? describir(cerca)
          : `Correlación de rangos (Spearman) sobre ${muestra ? miles(muestra) : 'las'} iteraciones; ` +
            'a la derecha, el % de la varianza que explica cada entrada (regresión). ' +
            (r2 !== undefined
              ? `Entre todas explican el ${Math.round(r2 * 100)} % de la variación${r2 < 0.6 ? ': el resto son interacciones o efectos no monótonos, que el tornado no ve' : ''}. `
              : '') +
            'Pasa el ratón por una barra para leerla.'}
      </figcaption>
    </figure>
  );
}

/**
 * "¿Qué probabilidad hay de quedar por debajo (o por encima) de X?"
 *
 * El usuario escribe X y la respuesta sale al momento: es una búsqueda binaria
 * sobre la muestra ya ordenada, no un cálculo nuevo. El umbral se guarda en el
 * modelo al salir del campo, así que el siguiente que abra el libro ve la
 * misma pregunta —y el informe volcado la incluye—.
 */
function Umbral({
  salida,
  umbral,
  exacto,
  decimal,
  alCambiar,
}: {
  salida: ResultadoSalida;
  decimal: string;
  umbral: UmbralRiskModel | undefined;
  exacto: boolean;
  alCambiar: (u: UmbralRiskModel | null) => void;
}) {
  const formato = formatoDe(salida.fecha);
  const [texto, setTexto] = useState(umbral ? (formato.fecha ? formato.valor(umbral.value) : String(umbral.value).replace('.', decimal)) : '');
  const [sentido, setSentido] = useState<UmbralRiskModel['direction']>(umbral?.direction ?? 'below');
  const valor = formato.leer(texto, decimal);
  const ordenada = salida.muestraOrdenada as Float64Array;
  const p = valor === null ? null : probabilidadUmbral(ordenada, valor, sentido === 'below' ? 'debajo' : 'encima');

  const guardar = (s: UmbralRiskModel['direction'] = sentido) => {
    if (valor === null) {
      if (texto.trim() === '' && umbral) alCambiar(null);
      return;
    }
    if (umbral?.value !== valor || umbral.direction !== s) alCambiar({ value: valor, direction: s });
  };

  return (
    <div className="umbral">
      <label className="umbral-pregunta">
        <span>Probabilidad de quedar</span>
        <select
          value={sentido}
          onChange={(e) => {
            const s = e.target.value as UmbralRiskModel['direction'];
            setSentido(s);
            guardar(s);
          }}
        >
          <option value="below">por debajo de</option>
          <option value="above">por encima de</option>
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder={formato.fecha ? 'p. ej. 15/03/2027' : 'p. ej. 0'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => guardar()}
          onKeyDown={(e) => e.key === 'Enter' && guardar()}
          aria-invalid={texto.trim() !== '' && valor === null}
        />
      </label>
      {p !== null && Number.isFinite(p) ? (
        <p className="umbral-respuesta">
          <strong>{(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</strong>
          <span className="tenue">
            {salida.muestraReducida
              ? ' aproximada, de los resultados guardados'
              : <>
                  {' '}{miles(Math.round(p * ordenada.length))} de {miles(ordenada.length)} iteraciones
                  {exacto ? '' : ' (las primeras; margen ±0,3 puntos)'}
                </>}
          </span>
        </p>
      ) : texto.trim() !== '' ? (
        <p className="aviso-linea">Escribe un número, por ejemplo 0 o -1.500.000.</p>
      ) : null}
    </div>
  );
}

const ALTO_H = 120;
const MARGEN_H = { arriba: 6, derecha: 8, abajo: 20, izquierda: 8 };

/**
 * El histograma: cuántas iteraciones cayeron en cada tramo.
 *
 * Una sola tinta, porque la altura ya dice cuántas. Si hay umbral, las barras
 * del lado que cuenta la probabilidad van en color y el resto apagadas: el
 * área coloreada **es** la respuesta de arriba, y se ve de un vistazo si la
 * cola que preocupa es fina o gruesa.
 */
/** Marcas fijas sobre el histograma (C10): media, mediana y, en el informe, p5 y p95. */
export interface MarcasHistograma {
  media?: number;
  mediana?: number;
  /** Delimitadores fijos, con el porcentaje de cada tramo ya calculado (informe impreso). */
  fijos?: { desde: number; hasta: number; pDebajo: number; pEntre: number; pEncima: number };
}

/** Cuántos valores de una muestra ordenada quedan por debajo de x (búsqueda binaria). */
function cuantosDebajo(ordenada: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = ordenada.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if ((ordenada[m] as number) < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

const cuantilDe = (ordenada: ArrayLike<number>, p: number) =>
  ordenada[Math.min(ordenada.length - 1, Math.max(0, Math.round(p * (ordenada.length - 1))))] as number;

export function Histograma({
  barras,
  umbral,
  esperado,
  etiquetaEsperado = 'la distribución esperaba',
  etiqueta = 'Histograma de la salida',
  marcas,
  muestraOrdenada,
  formato = formatoDe(false),
  lineas,
}: {
  barras: readonly BinHistograma[];
  umbral?: UmbralRiskModel;
  /** Lo que esperaba la distribución teórica en cada barra (C9): una línea encima. */
  esperado?: readonly number[];
  /** Cómo se lee la línea de `esperado` al pasar el ratón (V3: «Base tendría»). */
  etiquetaEsperado?: string;
  etiqueta?: string;
  /** Media, mediana y delimitadores fijos (C10). */
  marcas?: MarcasHistograma;
  /** Con la muestra, dos delimitadores que se arrastran y dicen el % de cada tramo (C10). */
  muestraOrdenada?: ArrayLike<number>;
  /** Números o fechas (T7). */
  formato?: FormatoValor;
  /** Líneas verticales con nombre (V2). */
  lineas?: readonly LineaReferencia[];
}) {
  const [cerca, setCerca] = useState<number | null>(null);
  const min = (barras[0] as BinHistograma).x0;
  const max = (barras[barras.length - 1] as BinHistograma).x1;
  const rango = max - min || 1;
  const total = barras.reduce((s, b) => s + b.count, 0);
  const mayor = Math.max(...barras.map((b) => b.count), ...(esperado ?? []), 1);
  const ancho = ANCHO - MARGEN_H.izquierda - MARGEN_H.derecha;
  const aX = (x: number) => MARGEN_H.izquierda + ((x - min) / rango) * ancho;
  const deX = (px: number) => Math.min(max, Math.max(min, min + ((px - MARGEN_H.izquierda) / ancho) * rango));

  // C10: los delimitadores que se arrastran, en p5 y p95 al empezar.
  const conMuestra = muestraOrdenada && muestraOrdenada.length > 1 ? muestraOrdenada : null;
  const [lim, setLim] = useState<[number, number] | null>(() => (conMuestra ? [cuantilDe(conMuestra, 0.05), cuantilDe(conMuestra, 0.95)] : null));
  const [arrastrando, setArrastrando] = useState<0 | 1 | null>(null);
  const tramos = (() => {
    if (lim && conMuestra) {
      const n = conMuestra.length;
      const d = cuantosDebajo(conMuestra, lim[0]) / n;
      const h = cuantosDebajo(conMuestra, lim[1]) / n;
      return { desde: lim[0], hasta: lim[1], pDebajo: d, pEntre: h - d, pEncima: 1 - h };
    }
    return marcas?.fijos ?? null;
  })();
  const arriba = tramos ? 14 : MARGEN_H.arriba;
  const altoTotal = ALTO_H + (arriba - MARGEN_H.arriba);
  const alto = altoTotal - arriba - MARGEN_H.abajo;
  const base = altoTotal - MARGEN_H.abajo;

  const contada = (b: BinHistograma) => {
    if (!umbral) return true;
    const medio = (b.x0 + b.x1) / 2;
    return umbral.direction === 'below' ? medio < umbral.value : medio > umbral.value;
  };

  const b = cerca === null ? null : barras[cerca];

  const moverA = (e: React.PointerEvent<SVGSVGElement>) => {
    if (arrastrando === null || !lim) return;
    const r = e.currentTarget.getBoundingClientRect();
    const v = deX(((e.clientX - r.left) / r.width) * ANCHO);
    setLim(arrastrando === 0 ? [Math.min(v, lim[1]), lim[1]] : [lim[0], Math.max(v, lim[0])]);
  };

  const dentro = (x: number | undefined) => x !== undefined && Number.isFinite(x) && x >= min && x <= max;
  const linea = (x: number, clase: string, texto: string, ancla: 'start' | 'end') => (
    <g className={clase}>
      <line x1={aX(x)} y1={arriba} x2={aX(x)} y2={base} />
      <text x={aX(x) + (ancla === 'start' ? 2 : -2)} y={arriba + 8} textAnchor={ancla}>{texto}</text>
    </g>
  );

  return (
    <figure className="grafico">
      <svg
        viewBox={`0 0 ${ANCHO} ${altoTotal}`}
        role="img"
        aria-label={etiqueta}
        onMouseLeave={() => setCerca(null)}
        onPointerMove={moverA}
        onPointerUp={() => setArrastrando(null)}
        onPointerCancel={() => setArrastrando(null)}
      >
        <line className="rejilla" x1={MARGEN_H.izquierda} y1={base} x2={ANCHO - MARGEN_H.derecha} y2={base} />
        {barras.map((bin, i) => {
          const x = aX(bin.x0);
          const w = Math.max(0.5, aX(bin.x1) - x - 1); // 1 unidad de separación entre barras
          const h = (bin.count / mayor) * alto;
          const fuera = tramos ? (bin.x1 <= tramos.desde || bin.x0 >= tramos.hasta) : false;
          return (
            <g key={i} onMouseEnter={() => setCerca(i)}>
              {/* Zona sensible a toda la altura: más fácil de señalar que una barra baja. */}
              <rect x={x} y={arriba} width={w + 1} height={alto} fill="transparent" />
              <rect
                className={`histo-barra${contada(bin) && !fuera ? '' : ' apagada'}${cerca === i ? ' activa' : ''}`}
                x={x}
                y={base - h}
                width={w}
                height={h}
                rx={Math.min(2, w / 2)}
              />
            </g>
          );
        })}
        {esperado && esperado.length === barras.length && (
          <polyline
            className="curva-teorica"
            points={barras.map((bin, i) => `${(aX(bin.x0) + aX(bin.x1)) / 2},${base - ((esperado[i] ?? 0) / mayor) * alto}`).join(' ')}
          />
        )}
        {umbral && umbral.value > min && umbral.value < max && (
          <line className="cursor" x1={aX(umbral.value)} y1={arriba} x2={aX(umbral.value)} y2={base} />
        )}
        {dentro(marcas?.media) && linea(marcas?.media as number, 'marca-media', 'media', (marcas?.media as number) < (min + max) / 2 ? 'start' : 'end')}
        {dentro(marcas?.mediana) && Math.abs(aX(marcas?.mediana as number) - aX(marcas?.media ?? Infinity)) > 3 &&
          linea(marcas?.mediana as number, 'marca-mediana', 'mediana', (marcas?.mediana as number) < (min + max) / 2 ? 'end' : 'start')}
        {ordenarLineas(lineas, dentro).map(({ l, izquierda }, k) => (
          <g key={`${l.etiqueta}-${k}`} className={`linea-ref ${l.tipo ?? 'percentil'}`}>
            <line x1={aX(l.x)} y1={arriba} x2={aX(l.x)} y2={base} />
            <text x={aX(l.x) + (izquierda ? -3 : 3)} y={arriba + 8} textAnchor={izquierda ? 'end' : 'start'}>{l.etiqueta}</text>
          </g>
        ))}
        {tramos && (
          <g className="delimitadores">
            {[tramos.desde, tramos.hasta].map((x, k) => (
              <g key={k} className={lim ? 'arrastrable' : undefined}>
                <line x1={aX(x)} y1={arriba - 2} x2={aX(x)} y2={base} />
                {lim && (
                  <rect
                    x={aX(x) - 5}
                    y={arriba - 2}
                    width={10}
                    height={alto + 2}
                    fill="transparent"
                    style={{ cursor: 'ew-resize', touchAction: 'none' }}
                    onPointerDown={(e) => {
                      (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                      setArrastrando(k as 0 | 1);
                    }}
                  />
                )}
              </g>
            ))}
            <text x={(MARGEN_H.izquierda + aX(tramos.desde)) / 2} y={10} textAnchor="middle">{pct(tramos.pDebajo)}</text>
            <text x={(aX(tramos.desde) + aX(tramos.hasta)) / 2} y={10} textAnchor="middle" className="fuerte">{pct(tramos.pEntre)}</text>
            <text x={(aX(tramos.hasta) + ANCHO - MARGEN_H.derecha) / 2} y={10} textAnchor="middle">{pct(tramos.pEncima)}</text>
          </g>
        )}
        <text className="eje" x={MARGEN_H.izquierda} y={altoTotal - 6}>{formato.valor(min)}</text>
        <text className="eje" x={ANCHO - MARGEN_H.derecha} y={altoTotal - 6} textAnchor="end">{formato.valor(max)}</text>
      </svg>
      {lim && tramos && (
        <div className="delimitadores-campos">
          <CampoLimite formato={formato} etiqueta="Desde" valor={lim[0]} alCambiar={(v) => setLim([Math.min(Math.max(v, min), lim[1]), lim[1]])} />
          <CampoLimite formato={formato} etiqueta="Hasta" valor={lim[1]} alCambiar={(v) => setLim([lim[0], Math.max(Math.min(v, max), lim[0])])} />
        </div>
      )}
      <figcaption className="tenue">
        {b
          ? `Entre ${formato.valor(b.x0)} y ${formato.valor(b.x1)}: ${miles(b.count)} iteraciones (${((b.count / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %)` +
            (esperado && cerca !== null && esperado[cerca] !== undefined ? `; ${etiquetaEsperado} ${miles(Math.round(esperado[cerca]))}` : '')
          : tramos
            ? `Entre ${formato.valor(tramos.desde)} y ${formato.valor(tramos.hasta)} queda el ${pct(tramos.pEntre)}; por debajo, el ${pct(tramos.pDebajo)}; por encima, el ${pct(tramos.pEncima)}.` +
              (lim ? ' Arrastra las líneas o escribe los límites.' : '')
            : 'Pasa el ratón por una barra para leerla.'}
      </figcaption>
    </figure>
  );
}

/** Un límite de los delimitadores, editable a mano (y sin ratón). */
function CampoLimite({ etiqueta, valor, alCambiar, formato }: { etiqueta: string; valor: number; alCambiar: (v: number) => void; formato: FormatoValor }) {
  const [texto, setTexto] = useState(() => formato.valor(valor));
  const [editando, setEditando] = useState(false);
  return (
    <label className="campo">
      <span className="tenue">{etiqueta}</span>
      <input
        type="text"
        inputMode="decimal"
        value={editando ? texto : formato.valor(valor)}
        onFocus={() => {
          setTexto(formato.valor(valor));
          setEditando(true);
        }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          setEditando(false);
          const v = formato.fecha ? formato.leer(texto) : leerNumero(texto.replace(/\./g, ''));
          if (v !== null) alCambiar(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

/** "24/09/2026, 18:40" a partir de una fecha ISO; el texto tal cual si no se entiende. */
function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

const pct = (x: number) => `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;

/**
 * ¿Bastan las iteraciones? Con un símbolo y palabras, no solo color: "✓
 * suficientes" o "! pocas, harían falta unas N". El criterio (un 1 %) se dice,
 * para que quien tenga otro listón pueda aplicarlo con el número de al lado.
 */
/** Un margen relativo pequeño con sus cifras: "0,03 %", no "0 %". */
const pctFino = (x: number) =>
  `${(x * 100).toLocaleString('es-ES', { maximumSignificantDigits: 2 })} %`;

export function PrecisionSalida({ precision, n, formato = formatoDe(false) }: { precision: Precision; n: number; formato?: FormatoValor }) {
  const { margenMedia, margenRelativo, iteracionesParaObjetivo, suficiente, percentiles } = precision;
  const pct = pctFino;
  return (
    <div className={`precision ${suficiente ? 'bien' : 'mejorable'}`}>
      <p>
        <span className="precision-icono" aria-hidden="true">{suficiente ? '✓' : '!'}</span>
        {suficiente
          ? <>Iteraciones suficientes: la media se conoce con ±{formato.dispersion(margenMedia)} ({pct(margenRelativo)}){precision.margenP80Relativo !== undefined ? <> y el P80 con ±{pct(precision.margenP80Relativo)}</> : null}.</>
          : <>
              Con {miles(n)} iteraciones la media tiene un margen de ±{formato.dispersion(margenMedia)} ({pct(margenRelativo)}){precision.margenP80Relativo !== undefined ? <> y el P80 de ±{pct(precision.margenP80Relativo)}</> : null}.
              Para bajar{precision.margenP80Relativo !== undefined ? 'los' : 'lo'} al {pct(precision.objetivo)} harían falta unas {miles(iteracionesParaObjetivo)}.
            </>}
      </p>
      {percentiles.length > 0 && (
        <p className="tenue">
          {percentiles.map((iv) => `p${Math.round(iv.p * 100)} entre ${formato.valor(iv.inferior)} y ${formato.valor(iv.superior)}`).join(' · ')}
          {' '}(intervalos al 95 %)
        </p>
      )}
    </div>
  );
}

/** Lo que el panel pide hacer con los escenarios (E7). */
export type AccionEscenarios =
  | { tipo: 'guardar'; etiqueta: string }
  | { tipo: 'quitar'; id: string }
  | { tipo: 'activar'; id: string | null };

/**
 * El administrador de escenarios (E7): guardar la simulación con un nombre,
 * elegir con cuál se compara y borrar los que sobran. Ver `excel/escenarios.ts`.
 */
function Escenarios({
  escenarios,
  idSimulacion,
  alCambiar,
}: {
  escenarios: AlmacenEscenarios;
  idSimulacion?: string;
  alCambiar: (accion: AccionEscenarios) => void;
}) {
  const lista = escenarios.escenarios;
  const [etiqueta, setEtiqueta] = useState(lista.length === 0 ? 'Escenario base' : `Escenario ${lista.length + 1}`);
  const yaGuardada = lista.find((e) => idSimulacion && e.resultado.idSimulacion === idSimulacion);
  return (
    <section id="seccion-escenarios">
      <h2>Escenarios</h2>
      <p className="tenue">
        Guarda esta simulación con un nombre, cambia el modelo y vuelve a simular: cada salida se
        compara con el escenario marcado, y una tabla enseña todos a la vez. Se guardan en el libro
        (hasta {MAXIMO_ESCENARIOS}).
      </p>
      {lista.length > 0 && (
        <ul className="lista-escenarios">
          {lista.map((e) => (
            <li key={e.id}>
              <label>
                <input
                  type="radio"
                  name="escenario-activo"
                  checked={escenarios.activo === e.id}
                  onChange={() => alCambiar({ tipo: 'activar', id: e.id })}
                />
                <span>{e.etiqueta}</span>
                {e.guardadoEn && <span className="tenue"> · {fecha(e.guardadoEn)}</span>}
                {idSimulacion && e.resultado.idSimulacion === idSimulacion && <span className="tenue"> · esta simulación</span>}
              </label>
              <button
                type="button"
                className="plano borrar"
                aria-label={`Borrar el escenario ${e.etiqueta}`}
                title="Borrar este escenario"
                onClick={() => alCambiar({ tipo: 'quitar', id: e.id })}
              >
                ✕
              </button>
            </li>
          ))}
          <li>
            <label>
              <input
                type="radio"
                name="escenario-activo"
                checked={!escenarios.activo}
                onChange={() => alCambiar({ tipo: 'activar', id: null })}
              />
              <span className="tenue">No comparar con ninguno</span>
            </label>
          </li>
        </ul>
      )}
      {yaGuardada ? (
        <p className="tenue">Esta simulación está guardada como «{yaGuardada.etiqueta}».</p>
      ) : (
        <div className="fila-botones">
          <input
            type="text"
            aria-label="Nombre del escenario"
            value={etiqueta}
            onChange={(ev) => setEtiqueta(ev.target.value)}
          />
          <button type="button" onClick={() => alCambiar({ tipo: 'guardar', etiqueta: etiqueta.trim() || 'Escenario' })}>
            Guardar como escenario
          </button>
        </div>
      )}
    </section>
  );
}

/** Una salida en todos los escenarios a la vez (E7). */
function TablaEscenarios({ filas, conUmbral }: { filas: readonly FilaEscenario[]; conUmbral: boolean }) {
  if (filas.some((f) => f.masFrecuente !== undefined)) {
    // Salida de texto (T2): el valor que más sale y la probabilidad del de interés.
    return (
      <>
        <h3>En todos los escenarios</h3>
        <div className="tabla-desplazable">
          <table className="tabla-resumen sin-clic">
            <thead><tr><th>Escenario</th><th>Sale más</th><th>Probabilidad</th></tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.etiqueta} className={f.esActual ? 'elegida' : undefined}>
                  <td>{f.etiqueta}</td>
                  <td className="celda-texto">{f.masFrecuente ?? ''}</td>
                  <td>{f.probabilidad === undefined ? '' : `${(f.probabilidad * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }
  return (
    <>
      <h3>En todos los escenarios</h3>
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead>
            <tr>
              <th>Escenario</th>
              <th>Media</th>
              <th>p5</th>
              <th>p50</th>
              <th>p95</th>
              {conUmbral && <th>Umbral</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.etiqueta} className={f.esActual ? 'elegida' : undefined}>
                <td>{f.etiqueta}</td>
                <td>{numero(f.media)}</td>
                <td>{f.p5 === undefined ? '' : numero(f.p5)}</td>
                <td>{f.p50 === undefined ? '' : numero(f.p50)}</td>
                <td>{f.p95 === undefined ? '' : numero(f.p95)}</td>
                {conUmbral && <td>{f.probabilidad === undefined ? '' : `${(f.probabilidad * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function diferenciaTexto(f: FilaComparacion): string {
  const signo = f.diferencia > 0 ? '+' : f.diferencia < 0 ? '\u2212' : '';
  if (f.esProbabilidad) {
    return `${signo}${Math.abs(f.diferencia * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} pt`;
  }
  return `${signo}${numero(Math.abs(f.diferencia))}`;
}

export function TablaComparacion({ etiqueta, filas }: { etiqueta: string; filas: readonly FilaComparacion[] }) {
  const valor = (f: FilaComparacion, x: number) => (f.esProbabilidad ? pct(x) : numero(x));
  return (
    <>
      <h3>Frente a «{etiqueta}»</h3>
      <table className="comparacion">
        <thead>
          <tr><th /><th>{etiqueta}</th><th>Esta</th><th>Diferencia</th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.medida}>
              <th scope="row">{f.medida}</th>
              <td>{valor(f, f.referencia)}</td>
              <td>{valor(f, f.actual)}</td>
              <td>{diferenciaTexto(f)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const SERIES_ARANA = 4;

/**
 * El gráfico de araña: la media de la salida en cada décimo de cada entrada.
 *
 * Una línea por entrada (las cuatro de más efecto, con leyenda y color fijo
 * por orden), el eje horizontal es el décimo de la entrada (del 10 % más bajo
 * al 10 % más alto) y el vertical, la salida en sus unidades. Una línea
 * plana es una entrada que no importa; una empinada, una que manda; una que
 * se tuerce, un efecto que se satura o tiene umbral.
 */
export function Arana({ curvas }: { curvas: readonly CurvaAranaPanel[] }) {
  const [cerca, setCerca] = useState<{ c: number; d: number } | null>(null);
  const visibles = curvas.slice(0, SERIES_ARANA);
  const todas = visibles.flatMap((c) => c.medias);
  const min = Math.min(...todas);
  const max = Math.max(...todas);
  const rango = max - min || 1;
  const IZQ = 44;
  const aX = (d: number) => IZQ + (d / 9) * (ANCHO - IZQ - 8);
  const aY = (v: number) => 6 + (1 - (v - min) / rango) * (ALTO - 6 - 22);

  const alMover = (e: React.MouseEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - caja.left) / caja.width) * ANCHO;
    const y = ((e.clientY - caja.top) / caja.height) * ALTO;
    const d = Math.max(0, Math.min(9, Math.round(((x - IZQ) / (ANCHO - IZQ - 8)) * 9)));
    let mejor = 0;
    visibles.forEach((c, i) => {
      if (Math.abs(aY(c.medias[d] as number) - y) < Math.abs(aY((visibles[mejor] as CurvaAranaPanel).medias[d] as number) - y)) mejor = i;
    });
    setCerca({ c: mejor, d });
  };

  const seleccion = cerca ? visibles[cerca.c] : null;

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Gráfico de araña" onMouseMove={alMover} onMouseLeave={() => setCerca(null)}>
        {[min, (min + max) / 2, max].map((v) => (
          <g key={v}>
            <line className="rejilla" x1={IZQ} y1={aY(v)} x2={ANCHO - 8} y2={aY(v)} />
            <text className="eje" x={IZQ - 4} y={aY(v) + 3} textAnchor="end">{numero(v, 3)}</text>
          </g>
        ))}
        {visibles.map((c, i) => (
          <polyline
            key={c.id}
            className={`serie serie-${i + 1}${cerca && cerca.c !== i ? ' atenuada' : ''}`}
            points={c.medias.map((m, d) => `${aX(d).toFixed(1)},${aY(m).toFixed(1)}`).join(' ')}
          />
        ))}
        {cerca && seleccion && (
          <circle className={`punto-serie serie-${cerca.c + 1}`} cx={aX(cerca.d)} cy={aY(seleccion.medias[cerca.d] as number)} r={4} />
        )}
        <text className="eje" x={IZQ} y={ALTO - 6}>10 % más bajo</text>
        <text className="eje" x={ANCHO - 8} y={ALTO - 6} textAnchor="end">10 % más alto</text>
      </svg>
      <p className="leyenda-curvas leyenda-series">
        {visibles.map((c, i) => (
          <span key={c.id}>
            <span className={`muestra-linea serie-${i + 1}`} />
            {c.nombre} <span className="tenue">(±{numero(c.rango / 2, 3)})</span>
          </span>
        ))}
      </p>
      <figcaption className="tenue">
        {cerca && seleccion
          ? `Con ${seleccion.nombre} en su décimo ${cerca.d + 1} de 10, la salida vale de media ${numero(seleccion.medias[cerca.d] as number)}.`
          : `Media de la salida según en qué décimo cae cada entrada${curvas.length > SERIES_ARANA ? ` (las ${SERIES_ARANA} de más efecto de ${curvas.length})` : ''}. Entre paréntesis, la mitad del recorrido: cuánto sube o baja la media de la salida.`}
      </figcaption>
    </figure>
  );
}

/**
 * Abre una dirección en el navegador del sistema. Dentro de Excel,
 * `openBrowserWindow` es la vía oficial (una ventana del panel no puede
 * imprimir de forma fiable); fuera de Office —el banco de pruebas— basta
 * `window.open`.
 */
export function abrirEnNavegador(url: string): void {
  const ui = typeof Office !== 'undefined' ? (Office.context?.ui as { openBrowserWindow?: (u: string) => void } | undefined) : undefined;
  if (ui?.openBrowserWindow) ui.openBrowserWindow(url);
  else window.open(url, '_blank', 'noopener');
}
