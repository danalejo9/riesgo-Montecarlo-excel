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

import { useState } from 'react';

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { volcarResultados } from '../excel/volcarResultados.ts';

import type { PuntoCDF } from '../engine/stats/index.ts';
import { motivosLegibles, type SimulacionCompletada } from '../excel/ejecutarSimulacion.ts';
import type { FilaSensibilidadPanel, ResultadoSalida } from '../excel/informe.ts';
import type { BinHistograma } from '../engine/stats/index.ts';
import { probabilidadUmbral } from '../engine/stats/index.ts';
import type { UmbralRiskModel } from '../engine/modelo/index.ts';
import { duracion, leerNumero, miles, numero } from './formato.ts';

export function Resultados({
  modelo,
  resultado,
  alCambiarModelo,
}: {
  modelo: ModeloRiesgo;
  resultado: SimulacionCompletada;
  /** Para guardar el umbral de cada salida en el modelo del libro. */
  alCambiarModelo?: (m: ModeloRiesgo) => void;
}) {
  const motivos = motivosLegibles(resultado.eleccion);
  const [volcando, setVolcando] = useState(false);
  const [volcado, setVolcado] = useState<string | null>(null);
  const [falloVolcado, setFalloVolcado] = useState<string | null>(null);

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

  return (
    <>
      <section>
        <h2>Guardar en el libro</h2>
        <p className="tenue">
          Escribe el informe en una hoja: el modelo que se usó, los
          estadísticos, los percentiles y los puntos de la curva, con un
          gráfico de Excel encima de ellos. Así se puede guardar, imprimir y
          enviar. La hoja se rehace en cada volcado.
        </p>
        <button type="button" onClick={() => void volcar()} disabled={volcando}>
          {volcando ? 'Escribiendo…' : 'Volcar a una hoja'}
        </button>
        {volcado && <p className="tenue">{volcado}</p>}
        {falloVolcado && <p className="aviso-linea">{falloVolcado}</p>}
      </section>

      <section>
        <h2>Cómo se calculó</h2>
        <dl>
          <dt>Motor</dt>
          <dd>{resultado.motor === 'fast' ? 'Rápido (en memoria)' : 'Compatible (Excel en el bucle)'}</dd>
          <dt>Iteraciones</dt>
          <dd>
            {miles(resultado.iteracionesCompletadas)}
            {resultado.cancelada && ' · cancelada antes de terminar'}
          </dd>
          <dt>Tiempo</dt><dd>{duracion(resultado.milisegundos)}</dd>
          <dt>Celdas del modelo</dt><dd>{miles(resultado.eleccion.celdasNecesarias)}</dd>
        </dl>

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

        {resultado.eleccion.salidasConstantes.length > 0 && (
          <p className="aviso-linea">
            Estas salidas no dependen de ninguna entrada, así que su valor es el
            mismo en todas las iteraciones: {resultado.eleccion.salidasConstantes.join(', ')}.
          </p>
        )}
      </section>

      {resultado.salidas.map((salida) => (
        <section key={salida.id}>
          <h2 className="titulo-salida">{salida.nombre}</h2>
          <p className="tenue">{salida.ref}</p>

          <dl>
            <dt>Media</dt><dd>{numero(salida.resumen.media)}</dd>
            <dt>Desviación</dt><dd>{numero(salida.resumen.desviacion)}</dd>
            <dt>Mínimo</dt><dd>{numero(salida.resumen.min)}</dd>
            <dt>Máximo</dt><dd>{numero(salida.resumen.max)}</dd>
          </dl>

          {salida.noNumericas !== undefined && salida.noNumericas > 0 && (
            <p className="aviso-linea">
              {miles(salida.noNumericas)} iteración(es) no dieron un número (un error
              de Excel, o un texto). No cuentan en estas estadísticas.
            </p>
          )}

          <h3>Percentiles <span className="tenue">(aproximados)</span></h3>
          <ul className="percentiles">
            {Object.entries(salida.resumen.percentiles).map(([clave, valor]) => (
              <li key={clave}>
                <span className="tenue">{clave}</span>
                <span>{numero(valor)}</span>
              </li>
            ))}
          </ul>

          {salida.muestraOrdenada && salida.muestraOrdenada.length > 0 && (
            <Umbral
              salida={salida}
              umbral={modelo.outputs.find((o) => o.id === salida.id)?.threshold}
              exacto={(resultado.muestraSensibilidad ?? 0) >= resultado.iteracionesCompletadas}
              decimal={modelo.settings.locale?.decimalSeparator ?? ','}
              alCambiar={(u) =>
                alCambiarModelo?.({
                  ...modelo,
                  outputs: modelo.outputs.map((o) => {
                    if (o.id !== salida.id) return o;
                    if (u) return { ...o, threshold: u };
                    const copia = { ...o };
                    delete copia.threshold;
                    return copia;
                  }),
                })
              }
            />
          )}

          {salida.histograma && salida.histograma.length > 0 && (
            <>
              <h3>Histograma</h3>
              <Histograma
                barras={salida.histograma}
                umbral={modelo.outputs.find((o) => o.id === salida.id)?.threshold}
              />
            </>
          )}

          <h3>Probabilidad acumulada</h3>
          <CurvaAcumulada puntos={salida.cdf} />

          {salida.sensibilidad && salida.sensibilidad.length > 0 && (
            <>
              <h3>Qué la mueve más</h3>
              <Tornado filas={salida.sensibilidad} muestra={resultado.muestraSensibilidad} />
            </>
          )}
        </section>
      ))}
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
function CurvaAcumulada({ puntos }: { puntos: readonly PuntoCDF[] }) {
  const [cerca, setCerca] = useState<PuntoCDF | null>(null);

  if (puntos.length < 2) return <p className="tenue">Sin curva: hacen falta al menos dos valores distintos.</p>;

  const xs = puntos.map((p) => p.x);
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

        <polyline className="curva" points={linea} />

        {cerca && (
          <g>
            <line className="cursor" x1={aX(cerca.x)} y1={MARGEN.arriba} x2={aX(cerca.x)} y2={ALTO - MARGEN.abajo} />
            <circle className="punto" cx={aX(cerca.x)} cy={aY(cerca.p)} r={3.5} />
          </g>
        )}

        <text className="eje" x={MARGEN.izquierda} y={ALTO - 6}>{numero(min)}</text>
        <text className="eje" x={ANCHO - MARGEN.derecha} y={ALTO - 6} textAnchor="end">{numero(max)}</text>
      </svg>

      <figcaption className="tenue">
        {cerca
          ? `${Math.round(cerca.p * 100)} % de probabilidad de quedar por debajo de ${numero(cerca.x)}`
          : 'Pasa el ratón por la curva para leer un valor.'}
      </figcaption>
    </figure>
  );
}

const VISIBLES_TORNADO = 10;

/** Coma decimal y signo explícito: "+0,82", "−0,15". */
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
function Tornado({ filas, muestra }: { filas: readonly FilaSensibilidadPanel[]; muestra?: number }) {
  const [todas, setTodas] = useState(false);
  const [cerca, setCerca] = useState<FilaSensibilidadPanel | null>(null);
  const visibles = todas ? filas : filas.slice(0, VISIBLES_TORNADO);

  const describir = (f: FilaSensibilidadPanel) =>
    `${f.nombre === f.ref ? f.nombre : `${f.nombre} (${f.ref})`}: ρ = ${rho(f.spearman)} · ${Math.round(f.peso * 100)} % del efecto. ` +
    (f.spearman >= 0 ? 'Cuando sube, la salida tiende a subir.' : 'Cuando sube, la salida tiende a bajar.');

  return (
    <figure className="tornado" aria-label="Sensibilidad de la salida a cada entrada">
      <p className="tornado-leyenda" aria-hidden="true">
        <span><span className="marca" style={{ background: 'var(--baja)' }} />la baja</span>
        <span>la sube<span className="marca" style={{ background: 'var(--sube)' }} /></span>
      </p>

      {visibles.map((f) => {
        const lado = f.spearman >= 0 ? 'sube' : 'baja';
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
            <span className="tornado-valor">{rho(f.spearman)}</span>
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
          : `Correlación de rangos (Spearman) sobre ${muestra ? miles(muestra) : 'las'} iteraciones. ` +
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
  const [texto, setTexto] = useState(umbral ? String(umbral.value).replace('.', decimal) : '');
  const [sentido, setSentido] = useState<UmbralRiskModel['direction']>(umbral?.direction ?? 'below');
  const valor = leerNumero(texto, decimal);
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
          placeholder="p. ej. 0"
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
            {' '}{miles(Math.round(p * ordenada.length))} de {miles(ordenada.length)} iteraciones
            {exacto ? '' : ' (las primeras; margen ±0,3 puntos)'}
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
function Histograma({ barras, umbral }: { barras: readonly BinHistograma[]; umbral?: UmbralRiskModel }) {
  const [cerca, setCerca] = useState<number | null>(null);
  const min = (barras[0] as BinHistograma).x0;
  const max = (barras[barras.length - 1] as BinHistograma).x1;
  const rango = max - min || 1;
  const total = barras.reduce((s, b) => s + b.count, 0);
  const mayor = Math.max(...barras.map((b) => b.count), 1);
  const ancho = ANCHO - MARGEN_H.izquierda - MARGEN_H.derecha;
  const aX = (x: number) => MARGEN_H.izquierda + ((x - min) / rango) * ancho;
  const alto = ALTO_H - MARGEN_H.arriba - MARGEN_H.abajo;

  const contada = (b: BinHistograma) => {
    if (!umbral) return true;
    const medio = (b.x0 + b.x1) / 2;
    return umbral.direction === 'below' ? medio < umbral.value : medio > umbral.value;
  };

  const b = cerca === null ? null : barras[cerca];

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO_H}`} role="img" aria-label="Histograma de la salida" onMouseLeave={() => setCerca(null)}>
        <line className="rejilla" x1={MARGEN_H.izquierda} y1={ALTO_H - MARGEN_H.abajo} x2={ANCHO - MARGEN_H.derecha} y2={ALTO_H - MARGEN_H.abajo} />
        {barras.map((bin, i) => {
          const x = aX(bin.x0);
          const w = Math.max(0.5, aX(bin.x1) - x - 1); // 1 unidad de separación entre barras
          const h = (bin.count / mayor) * alto;
          return (
            <g key={i} onMouseEnter={() => setCerca(i)}>
              {/* Zona sensible a toda la altura: más fácil de señalar que una barra baja. */}
              <rect x={x} y={MARGEN_H.arriba} width={w + 1} height={alto} fill="transparent" />
              <rect
                className={`histo-barra${contada(bin) ? '' : ' apagada'}${cerca === i ? ' activa' : ''}`}
                x={x}
                y={ALTO_H - MARGEN_H.abajo - h}
                width={w}
                height={h}
                rx={Math.min(2, w / 2)}
              />
            </g>
          );
        })}
        {umbral && umbral.value > min && umbral.value < max && (
          <line className="cursor" x1={aX(umbral.value)} y1={MARGEN_H.arriba} x2={aX(umbral.value)} y2={ALTO_H - MARGEN_H.abajo} />
        )}
        <text className="eje" x={MARGEN_H.izquierda} y={ALTO_H - 6}>{numero(min)}</text>
        <text className="eje" x={ANCHO - MARGEN_H.derecha} y={ALTO_H - 6} textAnchor="end">{numero(max)}</text>
      </svg>
      <figcaption className="tenue">
        {b
          ? `Entre ${numero(b.x0)} y ${numero(b.x1)}: ${miles(b.count)} iteraciones (${((b.count / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %)`
          : 'Pasa el ratón por una barra para leerla.'}
      </figcaption>
    </figure>
  );
}
