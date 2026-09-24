/**
 * "Ajustar a datos": se pegan datos históricos (o se leen de la selección de
 * Excel) y se proponen las distribuciones que mejor los describen, de mejor a
 * peor, con un botón para usar la elegida.
 *
 * La curva no es decoración: el estadístico ordena, pero **mirar** la
 * distribución propuesta encima de los datos es lo que evita aceptar una que
 * encaja bien en el centro y mal en la cola que importa. Se dibuja la CDF
 * empírica (escalones) y la de la candidata elegida.
 */

import { useMemo, useState } from 'react';

import { construirDesdeDescriptor } from '../engine/distributions/index.ts';
import {
  ajustarDistribuciones,
  describirDistribucion,
  leerDatos,
  resumirDistribucion,
  toDescriptor,
  type DistributionSpec,
} from '../engine/modelo/index.ts';
import { leerSeleccion } from '../excel/seleccion.ts';
import { miles, numero } from './formato.ts';

const ANCHO = 280;
const ALTO = 120;
const M = { arriba: 6, derecha: 8, abajo: 18, izquierda: 8 };

export function AjusteDatos({
  decimal,
  alUsar,
}: {
  decimal: string;
  alUsar: (spec: DistributionSpec) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState<string | null>(null);
  const [elegida, setElegida] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);

  const lectura = useMemo(() => leerDatos(texto, decimal), [texto, decimal]);
  const ajuste = useMemo(() => ajustarDistribuciones(lectura.valores), [lectura]);
  const candidata = ajuste?.candidatos[elegida];

  const deLaSeleccion = async () => {
    setFallo(null);
    try {
      const s = await leerSeleccion();
      if (s.numeros.length === 0) {
        setFallo(`La selección (${s.direccion}) no tiene números.`);
        return;
      }
      // Se escriben con el separador del libro para que se lean igual que si
      // se hubieran pegado.
      setTexto(s.numeros.map((v) => String(v).replace('.', decimal)).join('\n'));
      setOrigen(s.direccion);
      setElegida(0);
    } catch (e) {
      setFallo(e instanceof Error ? e.message : String(e));
    }
  };

  if (!abierto) {
    return (
      <button type="button" className="plano" onClick={() => setAbierto(true)}>
        Ajustar a datos históricos…
      </button>
    );
  }

  return (
    <div className="ajuste">
      <h4>Ajustar a datos</h4>
      <p className="tenue">
        Pega los datos (una columna de Excel sirve) o selecciónalos en la hoja.
        Se proponen las distribuciones que mejor los describen.
      </p>
      <textarea
        rows={4}
        value={texto}
        placeholder={'1.250\n1.310,5\n1.190\n…'}
        onChange={(e) => {
          setTexto(e.target.value);
          setOrigen(null);
          setElegida(0);
        }}
        aria-label="Datos para ajustar"
      />
      <div className="fila-botones">
        <button type="button" onClick={() => void deLaSeleccion()}>Leer de la selección</button>
        <button type="button" className="plano" onClick={() => setAbierto(false)}>Cerrar</button>
      </div>
      {fallo && <p className="aviso-linea">{fallo}</p>}

      {texto.trim() !== '' && (
        <p className="tenue">
          {miles(lectura.valores.length)} datos{origen ? ` de ${origen}` : ''}
          {lectura.ignorados > 0 ? ` · ${miles(lectura.ignorados)} ignorados (no son números)` : ''}
          {ajuste ? ` · media ${numero(ajuste.media)} · desviación ${numero(ajuste.desviacion)}` : ''}
        </p>
      )}
      {texto.trim() !== '' && !ajuste && <p className="aviso-linea">Hacen falta al menos 5 datos.</p>}
      {ajuste && ajuste.candidatos.length === 0 && (
        <p className="aviso-linea">Todos los datos son iguales: no hay distribución que ajustar.</p>
      )}

      {ajuste && ajuste.candidatos.length > 0 && (
        <>
          <table className="comparacion ajuste-tabla">
            <thead>
              <tr><th>Distribución</th><th title="Anderson–Darling: cuanto menor, mejor">A–D</th><th title="Kolmogorov–Smirnov">K–S</th><th /></tr>
            </thead>
            <tbody>
              {ajuste.candidatos.map((c, i) => (
                <tr
                  key={c.spec.type}
                  className={i === elegida ? 'elegida' : undefined}
                  onClick={() => setElegida(i)}
                >
                  <th scope="row">
                    {i === 0 && <span className="insignia">mejor</span>}
                    {describirDistribucion(c.spec.type)?.nombre ?? c.spec.type}
                    <span className="tenue parametros-ajuste">{resumirDistribucion(c.spec)}</span>
                  </th>
                  <td>{c.andersonDarling.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</td>
                  <td>{c.kolmogorovSmirnov.toLocaleString('es-ES', { maximumFractionDigits: 3 })}</td>
                  <td>
                    <button type="button" onClick={(e) => { e.stopPropagation(); alUsar(c.spec); }}>Usar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidata && <CurvaAjuste datos={lectura.valores} spec={candidata.spec} />}
          <p className="tenue">
            Ordenadas por Anderson–Darling, que pesa más las colas. Es una
            ordenación, no una prueba de aceptación: mira que la curva siga a
            los datos en la cola que te importa.
          </p>
        </>
      )}
    </div>
  );
}

function CurvaAjuste({ datos, spec }: { datos: readonly number[]; spec: DistributionSpec }) {
  const { escalones, teorica, min, max } = useMemo(() => {
    const o = [...datos].sort((a, b) => a - b);
    const lo = o[0] as number;
    const hi = o[o.length - 1] as number;
    const margen = (hi - lo) * 0.05;
    const a = lo - margen;
    const b = hi + margen;
    let dist;
    try { dist = construirDesdeDescriptor(toDescriptor(spec)); } catch { dist = null; }
    const teorica = dist
      ? Array.from({ length: 101 }, (_, i) => { const x = a + ((b - a) * i) / 100; return { x, p: dist.cdf(x) }; })
      : [];
    return { escalones: o.map((x, i) => ({ x, p: (i + 1) / o.length })), teorica, min: a, max: b };
  }, [datos, spec]);

  const aX = (x: number) => M.izquierda + ((x - min) / (max - min || 1)) * (ANCHO - M.izquierda - M.derecha);
  const aY = (p: number) => ALTO - M.abajo - p * (ALTO - M.arriba - M.abajo);
  let escalera = `${aX(min).toFixed(1)},${aY(0).toFixed(1)}`;
  let previo = 0;
  for (const e of escalones) {
    escalera += ` ${aX(e.x).toFixed(1)},${aY(previo).toFixed(1)} ${aX(e.x).toFixed(1)},${aY(e.p).toFixed(1)}`;
    previo = e.p;
  }

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Datos frente a la distribución ajustada">
        <line className="rejilla" x1={M.izquierda} y1={aY(0)} x2={ANCHO - M.derecha} y2={aY(0)} />
        <line className="rejilla" x1={M.izquierda} y1={aY(1)} x2={ANCHO - M.derecha} y2={aY(1)} />
        <polyline className="curva-referencia" points={escalera} />
        <polyline className="curva" points={teorica.map((t) => `${aX(t.x).toFixed(1)},${aY(t.p).toFixed(1)}`).join(' ')} />
        <text className="eje" x={M.izquierda} y={ALTO - 4}>{numero(min)}</text>
        <text className="eje" x={ANCHO - M.derecha} y={ALTO - 4} textAnchor="end">{numero(max)}</text>
      </svg>
      <p className="leyenda-curvas">
        <span><span className="muestra-linea referencia" />Datos</span>
        <span><span className="muestra-linea actual" />{describirDistribucion(spec.type)?.nombre ?? spec.type} ajustada</span>
      </p>
    </figure>
  );
}
