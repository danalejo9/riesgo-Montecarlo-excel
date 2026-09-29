/**
 * Gráficas nuevas de C4, dibujadas a mano en SVG como las demás (sin
 * librería): dispersión entrada × salida, caja y bigotes de varias salidas,
 * curvas acumuladas superpuestas y abanico de una serie.
 */

import { useMemo, useState } from 'react';

import type { IteracionesSimuladas } from '../excel/iteraciones.ts';
import { estres, TRAMOS_ESTRES } from '../excel/estres.ts';
import type { ResultadoSalida } from '../excel/informe.ts';
import type { PuntoCDF } from '../engine/stats/index.ts';
import { formatoDe, numero, type FormatoValor } from './formato.ts';

const ANCHO = 280;
/** Colores de serie que hay en el CSS (`--serie-1` … `--serie-4`); se repiten. */
const SERIES = 4;
/** Puntos de la dispersión: más no se distinguen y el SVG pesa. */
const MAX_PUNTOS = 1500;

/**
 * Dispersión de una entrada frente a la salida (C4): la forma de la relación
 * que el tornado resume en un número (¿lineal? ¿con umbral? ¿nube sin forma?).
 */
export function Dispersion({ iteraciones, idSalida, formato }: { iteraciones: IteracionesSimuladas; idSalida: string; formato: FormatoValor }) {
  const numericas = iteraciones.entradas.filter((e) => !e.categorias);
  const [id, setId] = useState(numericas[0]?.id ?? '');
  const salida = iteraciones.salidas.find((s) => s.id === idSalida);
  const entrada = numericas.find((e) => e.id === id) ?? numericas[0];

  const puntos = useMemo(() => {
    if (!entrada || !salida) return [];
    const n = Math.min(iteraciones.n, MAX_PUNTOS);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const x = entrada.valores[i] as number;
      const y = salida.valores[i] as number;
      if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
    }
    return out;
  }, [entrada, salida, iteraciones.n]);

  if (!entrada || !salida || puntos.length < 2) return <p className="tenue">No hay entradas numéricas que dibujar.</p>;
  const M = { arriba: 6, derecha: 8, abajo: 20, izquierda: 8 };
  const ALTO = 170;
  const xs = puntos.map((p) => p.x);
  const ys = puntos.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const aX = (x: number) => M.izquierda + ((x - x0) / (x1 - x0 || 1)) * (ANCHO - M.izquierda - M.derecha);
  const aY = (y: number) => ALTO - M.abajo - ((y - y0) / (y1 - y0 || 1)) * (ALTO - M.arriba - M.abajo);
  const fx = formatoDe(entrada.fecha);
  return (
    <figure className="grafico">
      <label className="selector-salida">
        <span className="tenue">Entrada</span>
        <select value={entrada.id} onChange={(e) => setId(e.target.value)}>
          {numericas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
      </label>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={`Dispersión de ${entrada.nombre} frente a la salida`}>
        <line className="rejilla" x1={M.izquierda} y1={ALTO - M.abajo} x2={ANCHO - M.derecha} y2={ALTO - M.abajo} />
        {puntos.map((p, i) => <circle key={i} className="punto-dispersion" cx={aX(p.x)} cy={aY(p.y)} r={1.4} />)}
        <text className="eje" x={M.izquierda} y={ALTO - 6}>{fx.valor(x0)}</text>
        <text className="eje" x={ANCHO - M.derecha} y={ALTO - 6} textAnchor="end">{fx.valor(x1)}</text>
        <text className="eje" x={M.izquierda + 2} y={M.arriba + 8}>{formato.valor(y1)}</text>
        <text className="eje" x={M.izquierda + 2} y={ALTO - M.abajo - 3}>{formato.valor(y0)}</text>
      </svg>
      <figcaption className="tenue">
        Cada punto es una iteración ({puntos.length.toLocaleString('es-ES')} primeras): en horizontal, {entrada.nombre}; en vertical, la salida.
        Una nube inclinada es una relación fuerte; una sin forma, que esa entrada apenas la mueve.
      </figcaption>
    </figure>
  );
}

type Numerica = ResultadoSalida & { resumen: ResultadoSalida['resumen'] & { percentiles: Record<string, number> } };

const numericas = (salidas: readonly ResultadoSalida[]) =>
  salidas.filter((s): s is Numerica => s.resumen.n > 0 && !s.categorias?.length && s.resumen.percentiles.p5 !== undefined);

/** Caja (p25–p75), bigotes (p5–p95), mediana y media de cada salida, en un eje común (C4). */
export function CajasSalidas({ salidas }: { salidas: readonly ResultadoSalida[] }) {
  const ss = numericas(salidas);
  if (ss.length < 2) return null;
  const P = (s: Numerica, k: string) => s.resumen.percentiles[k] as number;
  const lo = Math.min(...ss.map((s) => P(s, 'p5')));
  const hi = Math.max(...ss.map((s) => P(s, 'p95')));
  const IZQ = 86;
  const FILA = 22;
  const ALTO = ss.length * FILA + 22;
  const aX = (x: number) => IZQ + ((x - lo) / (hi - lo || 1)) * (ANCHO - IZQ - 8);
  const f = formatoDe(ss.every((s) => s.fecha));
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Caja y bigotes de las salidas">
        {ss.map((s, i) => {
          const y = 6 + i * FILA + FILA / 2;
          return (
            <g key={s.id}>
              <text className="eje" x={IZQ - 6} y={y + 3} textAnchor="end">{recortar(s.nombre, 14)}</text>
              <line className="bigote" x1={aX(P(s, 'p5'))} y1={y} x2={aX(P(s, 'p95'))} y2={y} />
              <rect className={`caja serie-${(i % SERIES) + 1}`} x={aX(P(s, 'p25'))} y={y - 6} width={Math.max(1, aX(P(s, 'p75')) - aX(P(s, 'p25')))} height={12} />
              <line className="mediana-caja" x1={aX(P(s, 'p50'))} y1={y - 6} x2={aX(P(s, 'p50'))} y2={y + 6} />
              <circle className="media-caja" cx={aX(s.resumen.media)} cy={y} r={2} />
            </g>
          );
        })}
        <text className="eje" x={IZQ} y={ALTO - 4}>{f.valor(lo)}</text>
        <text className="eje" x={ANCHO - 8} y={ALTO - 4} textAnchor="end">{f.valor(hi)}</text>
      </svg>
      <figcaption className="tenue">
        La caja va del p25 al p75, la raya es la mediana, el punto la media y los bigotes del p5 al p95.
        Comparar tiene sentido si las salidas están en las mismas unidades.
      </figcaption>
    </figure>
  );
}

/** Las curvas acumuladas de varias salidas, superpuestas en un eje común (C4). */
export function CurvasSuperpuestas({ salidas }: { salidas: readonly ResultadoSalida[] }) {
  const ss = numericas(salidas).filter((s) => s.cdf.length >= 2);
  if (ss.length < 2) return null;
  const ALTO = 150;
  const M = { arriba: 8, derecha: 8, abajo: 20, izquierda: 30 };
  const lo = Math.min(...ss.map((s) => (s.cdf[0] as PuntoCDF).x));
  const hi = Math.max(...ss.map((s) => (s.cdf[s.cdf.length - 1] as PuntoCDF).x));
  const aX = (x: number) => M.izquierda + ((x - lo) / (hi - lo || 1)) * (ANCHO - M.izquierda - M.derecha);
  const aY = (p: number) => ALTO - M.abajo - p * (ALTO - M.arriba - M.abajo);
  const f = formatoDe(ss.every((s) => s.fecha));
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Curvas acumuladas de las salidas">
        {[0, 0.5, 1].map((p) => (
          <g key={p}>
            <line className="rejilla" x1={M.izquierda} y1={aY(p)} x2={ANCHO - M.derecha} y2={aY(p)} />
            <text className="eje" x={M.izquierda - 4} y={aY(p) + 3} textAnchor="end">{Math.round(p * 100)}%</text>
          </g>
        ))}
        {ss.map((s, i) => (
          <polyline key={s.id} className={`serie serie-${(i % SERIES) + 1}`} points={s.cdf.map((p) => `${aX(p.x).toFixed(1)},${aY(p.p).toFixed(1)}`).join(' ')} />
        ))}
        <text className="eje" x={M.izquierda} y={ALTO - 6}>{f.valor(lo)}</text>
        <text className="eje" x={ANCHO - M.derecha} y={ALTO - 6} textAnchor="end">{f.valor(hi)}</text>
      </svg>
      <p className="leyenda-curvas">
        {ss.map((s, i) => <span key={s.id}><span className={`muestra-linea serie-${(i % SERIES) + 1}`} />{s.nombre}</span>)}
      </p>
    </figure>
  );
}

/**
 * Abanico (C4): las salidas como una serie (el flujo de caja de cada año):
 * mediana, banda p25–p75 y banda p5–p95, en el orden en que están.
 */
export function Abanico({ salidas }: { salidas: readonly ResultadoSalida[] }) {
  const ss = numericas(salidas);
  if (ss.length < 3) return null;
  const ALTO = 160;
  const M = { arriba: 8, derecha: 10, abajo: 30, izquierda: 10 };
  const P = (s: Numerica, k: string) => s.resumen.percentiles[k] as number;
  const lo = Math.min(...ss.map((s) => P(s, 'p5')));
  const hi = Math.max(...ss.map((s) => P(s, 'p95')));
  const aX = (i: number) => M.izquierda + (i / (ss.length - 1)) * (ANCHO - M.izquierda - M.derecha);
  const aY = (y: number) => ALTO - M.abajo - ((y - lo) / (hi - lo || 1)) * (ALTO - M.arriba - M.abajo);
  // Las etiquetas caben en el hueco entre dos puntos (unos 5,5 unidades por letra).
  const letras = Math.max(3, Math.floor((ANCHO - M.izquierda - M.derecha) / (ss.length - 1) / 6.5));
  const banda = (a: string, b: string) =>
    [...ss.map((s, i) => `${aX(i).toFixed(1)},${aY(P(s, a)).toFixed(1)}`), ...ss.map((s, i) => `${aX(i).toFixed(1)},${aY(P(s, b)).toFixed(1)}`).reverse()].join(' ');
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Abanico de las salidas">
        <polygon className="abanico-exterior" points={banda('p5', 'p95')} />
        <polygon className="abanico-interior" points={banda('p25', 'p75')} />
        <polyline className="curva" points={ss.map((s, i) => `${aX(i).toFixed(1)},${aY(P(s, 'p50')).toFixed(1)}`).join(' ')} />
        {ss.map((s, i) => (
          <text key={s.id} className="eje" x={aX(i)} y={ALTO - M.abajo + 12} textAnchor={i === 0 ? 'start' : i === ss.length - 1 ? 'end' : 'middle'}>
            {recortar(s.nombre, i === 0 || i === ss.length - 1 ? Math.max(3, Math.floor(letras * 0.9)) : letras)}
          </text>
        ))}
        <text className="eje" x={M.izquierda} y={M.arriba + 8}>{numero(hi)}</text>
        <text className="eje" x={M.izquierda} y={ALTO - M.abajo - 3}>{numero(lo)}</text>
      </svg>
      <figcaption className="tenue">
        La línea es la mediana; la banda oscura, del p25 al p75; la clara, del p5 al p95. Sirve cuando
        las salidas son una serie, como el flujo de caja de cada año, en el orden en que las marcaste.
      </figcaption>
    </figure>
  );
}

function recortar(t: string, n: number): string {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/**
 * Tornado de cambio en la salida (D4): la media de la salida cuando cada
 * entrada está en su décimo más bajo y en el más alto, en unidades de la
 * salida. El de correlaciones dice «cuánto se parecen»; este, «cuánto mueve».
 * Sale de las medias por décimos de la araña.
 */
export function TornadoCambio({ curvas, media, formato }: { curvas: readonly { id: string; nombre: string; medias: number[] }[]; media: number; formato: FormatoValor }) {
  const [todas, setTodas] = useState(false);
  const filas = curvas
    .filter((c) => c.medias.length >= 2)
    .map((c) => ({ ...c, bajo: c.medias[0] as number, alto: c.medias[c.medias.length - 1] as number }))
    .sort((a, b) => Math.abs(b.alto - b.bajo) - Math.abs(a.alto - a.bajo));
  if (filas.length === 0) return null;
  const visibles = todas ? filas : filas.slice(0, 8);
  const lo = Math.min(media, ...visibles.map((f) => Math.min(f.bajo, f.alto)));
  const hi = Math.max(media, ...visibles.map((f) => Math.max(f.bajo, f.alto)));
  const IZQ = 96;
  const FILA = 20;
  const ALTO = visibles.length * FILA + 22;
  const aX = (x: number) => IZQ + ((x - lo) / (hi - lo || 1)) * (ANCHO - IZQ - 8);
  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label="Cambio en la salida entre el décimo bajo y el alto de cada entrada">
        <line className="rejilla" x1={aX(media)} y1={2} x2={aX(media)} y2={ALTO - 18} />
        {visibles.map((f, i) => {
          const y = 4 + i * FILA;
          const sube = f.alto >= f.bajo;
          return (
            <g key={f.id}>
              <title>{`${f.nombre}: en su décimo más bajo, la salida vale de media ${formato.valor(f.bajo)}; en el más alto, ${formato.valor(f.alto)}.`}</title>
              <text className="eje" x={IZQ - 6} y={y + 11} textAnchor="end">{recortar(f.nombre, 16)}</text>
              <rect className={`barra-cambio ${sube ? 'sube' : 'baja'}`} x={aX(Math.min(f.bajo, f.alto))} y={y + 3} width={Math.max(1, Math.abs(aX(f.alto) - aX(f.bajo)))} height={FILA - 8} rx={2} />
            </g>
          );
        })}
        <text className="eje" x={IZQ} y={ALTO - 4}>{formato.valor(lo)}</text>
        <text className="eje" x={aX(media)} y={ALTO - 4} textAnchor="middle">media</text>
        <text className="eje" x={ANCHO - 8} y={ALTO - 4} textAnchor="end">{formato.valor(hi)}</text>
      </svg>
      {filas.length > 8 && (
        <button type="button" className="enlace" onClick={() => setTodas(!todas)}>
          {todas ? 'Ver solo las 8 primeras' : `Ver las ${filas.length} entradas`}
        </button>
      )}
      <figcaption className="tenue">
        Cada barra va de la media de la salida cuando esa entrada está en su 10 % más bajo a cuando está en su 10 %
        más alto, en unidades de la salida (azul: sube con la entrada; rojo: baja). Pasa el ratón por una barra para
        leer los dos valores.
      </figcaption>
    </figure>
  );
}

/**
 * Estrés (D2): la salida cuando una entrada se queda en una parte de su
 * rango, frente a la de siempre. Con las iteraciones retenidas, al instante.
 */
export function Estres({
  iteraciones,
  idSalida,
  formato,
  umbral,
}: {
  iteraciones: IteracionesSimuladas;
  idSalida: string;
  formato: FormatoValor;
  umbral?: { valor: number; sentido: 'below' | 'above' };
}) {
  const [id, setId] = useState(iteraciones.entradas[0]?.id ?? '');
  const [tramo, setTramo] = useState(TRAMOS_ESTRES.length - 1);
  const entrada = iteraciones.entradas.find((e) => e.id === id) ?? iteraciones.entradas[0];
  if (!entrada) return null;
  const categorias = entrada.categorias;
  const indice = categorias ? Math.min(tramo, categorias.length - 1) : Math.min(tramo, TRAMOS_ESTRES.length - 1);
  const t = TRAMOS_ESTRES[indice] ?? (TRAMOS_ESTRES[0] as (typeof TRAMOS_ESTRES)[number]);
  const r = estres(
    iteraciones, entrada.id, idSalida,
    categorias ? { tipo: 'categoria', indice } : { tipo: 'percentiles', desde: t.desde, hasta: t.hasta },
    umbral,
  );
  const fe = formatoDe(entrada.fecha);
  const fila = (etq: string, a: number, b: number, esProb = false) => {
    const v = (x: number) => (esProb ? `${(x * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %` : formato.valor(x));
    const d = b - a;
    return (
      <tr key={etq}>
        <td>{etq}</td>
        <td>{v(a)}</td>
        <td>{v(b)}</td>
        <td>{d === 0 ? '' : `${d > 0 ? '+' : '−'}${esProb ? `${(Math.abs(d) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} pt` : formato.dispersion(Math.abs(d))}`}</td>
      </tr>
    );
  };
  return (
    <div>
      <div className="fila-estres">
        <label className="selector-salida">
          <span className="tenue">Con</span>
          <select value={entrada.id} onChange={(e) => { setId(e.target.value); setTramo(TRAMOS_ESTRES.length - 1); }}>
            {iteraciones.entradas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
        <label className="selector-salida">
          <span className="tenue">en</span>
          <select value={indice} onChange={(e) => setTramo(Number(e.target.value))}>
            {categorias
              ? categorias.map((c, i) => <option key={c} value={i}>«{c}»</option>)
              : TRAMOS_ESTRES.map((x, i) => <option key={x.etiqueta} value={i}>{x.etiqueta}</option>)}
          </select>
        </label>
      </div>
      {r ? (
        <>
          <div className="tabla-desplazable">
            <table className="tabla-resumen sin-clic">
              <thead><tr><th /><th>Siempre</th><th>Con eso</th><th>Cambio</th></tr></thead>
              <tbody>
                {fila('Media', r.base.media, r.estres.media)}
                {fila('p5', r.base.p5, r.estres.p5)}
                {fila('p50', r.base.p50, r.estres.p50)}
                {fila('p95', r.base.p95, r.estres.p95)}
                {r.base.probUmbral !== undefined && r.estres.probUmbral !== undefined && fila('Umbral', r.base.probUmbral, r.estres.probUmbral, true)}
              </tbody>
            </table>
          </div>
          <p className="tenue">
            {r.limites ? `${entrada.nombre} entre ${fe.valor(r.limites.desde)} y ${fe.valor(r.limites.hasta)}: ` : ''}
            {r.estres.n.toLocaleString('es-ES')} de {r.base.n.toLocaleString('es-ES')} iteraciones. Sin volver a simular: son las
            iteraciones en que la entrada cayó ahí, con el resto de entradas como vinieran.
          </p>
        </>
      ) : <p className="tenue">No hay iteraciones con esa condición.</p>}
    </div>
  );
}
