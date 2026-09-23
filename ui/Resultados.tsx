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
 * **Se dice con qué motor se calculó y cuánto tardó.** No es un detalle
 * técnico: si fue el compatible, el usuario acaba de esperar minutos y tiene
 * derecho a saber por qué, y qué función del libro lo obligó.
 */

import { useState } from 'react';

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { volcarResultados } from '../excel/volcarResultados.ts';

import type { PuntoCDF } from '../engine/stats/index.ts';
import { motivosLegibles, type SimulacionCompletada } from '../excel/ejecutarSimulacion.ts';
import { duracion, miles, numero } from './formato.ts';

export function Resultados({
  modelo,
  resultado,
}: {
  modelo: ModeloRiesgo;
  resultado: SimulacionCompletada;
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

          <h3>Probabilidad acumulada</h3>
          <CurvaAcumulada puntos={salida.cdf} />
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
