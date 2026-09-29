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

import { useEffect, useMemo, useState } from 'react';

import { construirDesdeDescriptor } from '../engine/distributions/index.ts';
import {
  ajustarDistribuciones,
  bootstrapAjuste,
  CRITERIO_DE_OBJETIVO,
  describirDistribucion,
  ordenarCandidatos,
  PERCENTILES_OBJETIVO,
  tablaPercentiles,
  type CriterioAjuste,
  type ObjetivoAjuste,
  type ResultadoBootstrap,
  leerDatos,
  resumirDistribucion,
  toDescriptor,
  type DistributionSpec,
} from '../engine/modelo/index.ts';
import { histogramaDeMuestra, ordenarUtiles } from '../engine/stats/index.ts';
import { leerSeleccion } from '../excel/seleccion.ts';
import { Histograma } from './Resultados.tsx';
import { miles, numero } from './formato.ts';

const ANCHO = 280;
const ALTO = 120;
const M = { arriba: 6, derecha: 8, abajo: 18, izquierda: 8 };

export function AjusteDatos({
  decimal,
  alUsar,
  pedido = 0,
  alCerrar,
  explicacion,
}: {
  decimal: string;
  alUsar: (spec: DistributionSpec) => void;
  /** U3.2: cada vez que cambia (la cinta pide «Ajustar a datos»), se abre y lee la selección. */
  pedido?: number;
  /** Si se da, «Cerrar» lo llama en vez de plegar el ajuste (el ajuste suelto de la cinta). */
  alCerrar?: () => void;
  /** Un párrafo más, arriba (qué hace «Usar» en ese sitio). */
  explicacion?: string;
}) {
  const [abierto, setAbierto] = useState(pedido > 0);
  const [texto, setTexto] = useState('');
  const [origen, setOrigen] = useState<string | null>(null);
  const [elegida, setElegida] = useState(0);
  const [fallo, setFallo] = useState<string | null>(null);
  const [criterio, setCriterio] = useState<CriterioAjuste>('aicc');
  // I2: qué parte de la distribución importa (los percentiles que se comparan).
  const [objetivo, setObjetivo] = useState<ObjetivoAjuste>('general');

  const lectura = useMemo(() => leerDatos(texto, decimal), [texto, decimal]);
  const ajuste = useMemo(() => ajustarDistribuciones(lectura.valores), [lectura]);
  const candidatos = useMemo(() => (ajuste ? ordenarCandidatos(ajuste.candidatos, criterio) : []), [ajuste, criterio]);
  const candidata = candidatos[elegida];

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

  useEffect(() => {
    if (pedido <= 0) return;
    setAbierto(true);
    void deLaSeleccion();
    // Solo cuando llega un pedido nuevo de la cinta.
  }, [pedido]);

  if (!abierto) {
    return (
      <button type="button" className="secundario" onClick={() => setAbierto(true)}>
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
      {explicacion && <p className="tenue">{explicacion}</p>}
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
        <button type="button" className="secundario" onClick={() => (alCerrar ? alCerrar() : setAbierto(false))}>Cerrar</button>
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

      {ajuste?.diagnostico && ajuste.diagnostico.notas.length > 0 && (
        <div className="diagnostico-ajuste">
          <h5>Lo que dicen los datos</h5>
          <ul>{ajuste.diagnostico.notas.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}

      {ajuste && ajuste.candidatos.length > 0 && (
        <>
          <label className="campo ordenar-ajuste">
            <span className="tenue">Ordenar por</span>
            <select
              value={criterio}
              onChange={(e) => {
                setCriterio(e.target.value as CriterioAjuste);
                setElegida(0);
              }}
            >
              <option value="aicc">AICc (AIC corregido para pocos datos)</option>
              <option value="aic">AIC (ajuste, castigando parámetros)</option>
              <option value="bic">BIC (castiga más los parámetros)</option>
              <option value="andersonDarling">Anderson–Darling (colas)</option>
              <option value="cramerVonMises">Cramér–von Mises (todo el rango)</option>
              <option value={CRITERIO_DE_OBJETIVO[objetivo]}>Error en los percentiles del objetivo</option>
            </select>
          </label>
          <label className="campo ordenar-ajuste">
            <span className="tenue">Lo que más importa</span>
            <select
              value={objetivo}
              onChange={(e) => {
                const o = e.target.value as ObjetivoAjuste;
                setObjetivo(o);
                // Si se ordenaba por el error en percentiles, que siga, con el objetivo nuevo.
                if (criterio.startsWith('error')) setCriterio(CRITERIO_DE_OBJETIVO[o]);
                setElegida(0);
              }}
            >
              <option value="general">Toda la distribución (p5, p25, p50, p75, p95)</option>
              <option value="superior">La cola alta (p50 a p99: costes, plazos)</option>
              <option value="inferior">La cola baja (p1 a p50: ingresos, márgenes)</option>
            </select>
          </label>
          <table className="comparacion ajuste-tabla">
            <thead>
              <tr>
                <th>Distribución</th>
                <th title="Akaike corregido para pocos datos: cuanto menor, mejor">AICc</th>
                <th title="Criterio bayesiano: cuanto menor, mejor">BIC</th>
                <th title="Anderson–Darling: cuanto menor, mejor">A–D</th>
                <th title="Cramér–von Mises: cuanto menor, mejor">CvM</th>
                <th title="Error medio en los percentiles del objetivo, en desviaciones típicas de los datos: cuanto menor, mejor">Perc.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {candidatos.map((c, i) => (
                <tr
                  key={c.spec.type}
                  className={i === elegida ? 'elegida' : undefined}
                  onClick={() => setElegida(i)}
                >
                  <th scope="row">
                    {i === 0 && <span className="insignia">mejor</span>}
                    {describirDistribucion(c.spec.type)?.nombre ?? c.spec.type}
                    {c.discreta && <span className="tenue"> (discreta)</span>}
                    <span className="tenue parametros-ajuste">{resumirDistribucion(c.spec)}</span>
                  </th>
                  <td title={`AIC: ${c.aic.toLocaleString('es-ES', { maximumFractionDigits: 1 })}`}>{c.aicc.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</td>
                  <td>{c.bic.toLocaleString('es-ES', { maximumFractionDigits: 1 })}</td>
                  <td title={`Kolmogorov–Smirnov: ${c.kolmogorovSmirnov.toLocaleString('es-ES', { maximumFractionDigits: 3 })}`}>
                    {c.andersonDarling.toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                  </td>
                  <td>{c.cramerVonMises.toLocaleString('es-ES', { maximumFractionDigits: 3 })}</td>
                  <td>{c[CRITERIO_DE_OBJETIVO[objetivo]].toLocaleString('es-ES', { maximumFractionDigits: 3 })}</td>
                  <td>
                    <button type="button" onClick={(e) => { e.stopPropagation(); alUsar(c.spec); }}>Usar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {candidatos.some((c) => c.discreta) && (
            <p className="tenue">
              Las discretas (Poisson, binomial, binomial negativa) dan la probabilidad de cada valor, no una densidad:
              su AICc y su BIC no se comparan con los de las continuas. Compáralas por el error en
              percentiles o por la curva.
            </p>
          )}
          {candidata && <PercentilesAjuste datos={lectura.valores} spec={candidata.spec} objetivo={objetivo} />}
          {candidata && <Fiabilidad key={`${candidata.spec.type}-${lectura.valores.length}-${objetivo}`} datos={lectura.valores} spec={candidata.spec} objetivo={objetivo} />}
          {candidata && <HistogramaAjuste datos={lectura.valores} spec={candidata.spec} />}
          {candidata && <CurvaAjuste datos={lectura.valores} spec={candidata.spec} />}
          {ajuste.empirica && (
            <p>
              <button type="button" className="secundario" onClick={() => alUsar(ajuste.empirica as DistributionSpec)}>
                Usar los datos tal cual (distribución empírica)
              </button>
              <span className="tenue"> — cada valor observado con su frecuencia; no inventa valores que no se hayan visto.</span>
            </p>
          )}
          <p className="tenue">
            AICc y BIC comparan cómo de probables son los datos con cada
            distribución, castigando las que tienen más parámetros (el AICc,
            además, corrige los pocos datos); A–D pesa más las colas y CvM todo
            el rango (pasa el ratón para ver AIC y K–S). Todos: cuanto menor, mejor.
            Es una ordenación, no una prueba de aceptación: mira que la curva
            siga a los datos en la cola que te importa.
          </p>
        </>
      )}
    </div>
  );
}

/** Percentil a percentil (I2): los datos frente a la candidata elegida, en los del objetivo. */
function PercentilesAjuste({ datos, spec, objetivo }: { datos: readonly number[]; spec: DistributionSpec; objetivo: ObjetivoAjuste }) {
  const filas = useMemo(() => {
    try {
      return tablaPercentiles(spec, datos, objetivo);
    } catch {
      return [];
    }
  }, [datos, spec, objetivo]);
  if (filas.length === 0) return null;
  return (
    <>
      <h5>Percentiles: datos y {describirDistribucion(spec.type)?.nombre ?? spec.type}</h5>
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead><tr><th /><th>Datos</th><th>Ajustada</th><th title="Ajustada − datos, en desviaciones típicas de los datos">Diferencia</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.p} className={Math.abs(f.error) > 0.25 ? 'desvio' : undefined}>
                <td>p{Math.round(f.p * 100)}</td>
                <td>{numero(f.datos)}</td>
                <td>{numero(f.ajustado)}</td>
                <td>{f.error >= 0 ? '+' : '−'}{Math.abs(f.error).toLocaleString('es-ES', { maximumFractionDigits: 2 })} σ</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tenue">
        Más de 0,25 σ de diferencia (en negrita) es un aviso: en ese percentil la distribución
        no sigue a los datos. Con pocos datos, los percentiles extremos de los datos son poco fiables también.
      </p>
    </>
  );
}

/**
 * Cuánto fiarse del ajuste (I2): bootstrap bajo demanda (con muchos datos
 * tarda un momento), con los intervalos de los parámetros y de los percentiles.
 */
function Fiabilidad({ datos, spec, objetivo }: { datos: readonly number[]; spec: DistributionSpec; objetivo: ObjetivoAjuste }) {
  const [r, setR] = useState<ResultadoBootstrap | null>(null);
  const [calculando, setCalculando] = useState(false);
  const calcular = () => {
    setCalculando(true);
    // Un respiro para que se pinte «Calculando…» antes del cálculo.
    setTimeout(() => {
      try {
        setR(bootstrapAjuste(datos, spec, PERCENTILES_OBJETIVO[objetivo], datos.length > 2_000 ? 100 : 200));
      } finally {
        setCalculando(false);
      }
    }, 20);
  };
  if (!r) {
    return (
      <p>
        <button type="button" className="secundario" onClick={calcular} disabled={calculando}>
          {calculando ? 'Calculando…' : '¿Cuánto fiarse de este ajuste? (bootstrap)'}
        </button>
      </p>
    );
  }
  const fila = (x: { nombre: string; etiqueta: string; estimado: number; bajo: number; alto: number }) => (
    <tr key={x.nombre}>
      <td>{x.etiqueta}</td>
      <td>{numero(x.estimado)}</td>
      <td>{numero(x.bajo)} – {numero(x.alto)}</td>
    </tr>
  );
  return (
    <>
      <h5>Cuánto fiarse: bootstrap ({miles(r.validas)} de {miles(r.repeticiones)} repeticiones)</h5>
      <div className="tabla-desplazable">
        <table className="tabla-resumen sin-clic">
          <thead><tr><th /><th>Ajustado</th><th>Intervalo del 90 %</th></tr></thead>
          <tbody>
            {r.parametros.map(fila)}
            {r.percentiles.map(fila)}
          </tbody>
        </table>
      </div>
      <p className="tenue">
        Se remuestrean los datos con reemplazo, se vuelve a ajustar la misma distribución y se
        mira cuánto cambian sus parámetros y sus percentiles. Un intervalo ancho dice que con estos
        datos no se puede afinar mucho, la ordene como la ordene el criterio.
      </p>
    </>
  );
}

/** El histograma de los datos con lo que esperaba la candidata en cada barra (I1). */
function HistogramaAjuste({ datos, spec }: { datos: readonly number[]; spec: DistributionSpec }) {
  const { barras, esperado } = useMemo(() => {
    const ordenada = ordenarUtiles(datos);
    const barras = histogramaDeMuestra(ordenada, 25);
    let esperado: number[] | undefined;
    try {
      const d = construirDesdeDescriptor(toDescriptor(spec));
      esperado = barras.map((b) => ordenada.length * Math.max(0, d.cdf(b.x1) - d.cdf(b.x0)));
    } catch {
      esperado = undefined;
    }
    return { barras, esperado };
  }, [datos, spec]);
  if (barras.length === 0) return null;
  return <Histograma barras={barras} {...(esperado ? { esperado } : {})} etiqueta="Histograma de los datos con la distribución elegida" />;
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
