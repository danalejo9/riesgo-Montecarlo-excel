/**
 * Gráficos del cronograma que comparten el panel y el informe PDF (V3). Con
 * datos planos (no el resultado entero de la simulación), porque el informe
 * los recibe resumidos en la dirección de su página.
 */

import { COLORES_GANTT, type VistaGantt } from '../engine/cronograma/gantt.ts';
import { COLUMNAS_CONSOLIDADA, colorDe, type Clase } from '../engine/cronograma/registro.ts';
import { fechaDeSerie, textoFecha } from '../engine/modelo/fechas.ts';
import { textoMoneda } from '../engine/modelo/moneda.ts';

/** Barras por día (agrupadas si hay muchos), con el cronograma y el P80 marcados. */
export function HistogramaFechas({ histograma, diaCronograma, diaP80, titulo, marcaCronograma = 'cronograma' }: {
  histograma: ReadonlyArray<{ dia: number; fecha: number; cuenta: number }>;
  diaCronograma: number;
  diaP80: number;
  titulo: string;
  marcaCronograma?: string;
}) {
  const h = histograma;
  if (h.length === 0) return null;
  const d0 = h[0]!.dia;
  const d1 = h[h.length - 1]!.dia;
  const paso = Math.max(1, Math.ceil((d1 - d0 + 1) / 40));
  const barras = new Map<number, number>();
  for (const x of h) {
    const k = d0 + Math.floor((x.dia - d0) / paso) * paso;
    barras.set(k, (barras.get(k) ?? 0) + x.cuenta);
  }
  const max = Math.max(...barras.values());
  const n = Math.ceil((d1 - d0 + 1) / paso);
  const W = 300;
  const H = 110;
  const ancho = W / n;
  const xDia = (d: number) => ((d - d0) / paso) * ancho;
  return (
    <figure style={{ margin: '8px 0' }}>
      <figcaption className="tenue" style={{ fontSize: 12 }}>{titulo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={titulo}>
        {[...barras].map(([d, c]) => (
          <rect key={d} x={xDia(d) + 0.5} y={H - (c / max) * H} width={Math.max(1, ancho - 1)} height={(c / max) * H} fill="var(--acento)" opacity={d <= diaP80 ? 0.9 : 0.45} />
        ))}
        {[{ d: diaCronograma, t: marcaCronograma }, { d: diaP80, t: 'P80' }].map(({ d, t }) => (
          d >= d0 - paso && d <= d1 + paso ? (
            <g key={t}>
              <line x1={xDia(d) + ancho / 2} x2={xDia(d) + ancho / 2} y1={0} y2={H} stroke="var(--texto, #333)" strokeDasharray="3 2" />
              <text x={Math.min(W - 40, Math.max(0, xDia(d) + ancho / 2 + 2))} y={10} fontSize="9" fill="currentColor">{t}</text>
            </g>
          ) : null
        ))}
        <text x={0} y={H + 12} fontSize="9" fill="currentColor">{textoFecha(h[0]!.fecha)}</text>
        <text x={W} y={H + 12} fontSize="9" fill="currentColor" textAnchor="end">{textoFecha(h[h.length - 1]!.fecha)}</text>
      </svg>
    </figure>
  );
}

/** Curva S: probabilidad de haber terminado en cada fecha. */
export function CurvaS({ curva, titulo }: { curva: ReadonlyArray<{ p: number; fecha: number }>; titulo: string }) {
  if (curva.length < 2) return null;
  const W = 300;
  const H = 120;
  const f0 = curva[0]!.fecha;
  const f1 = curva[curva.length - 1]!.fecha;
  const x = (f: number) => 20 + ((f - f0) / Math.max(1, f1 - f0)) * (W - 30);
  const y = (p: number) => H - p * (H - 10);
  const d = curva.map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.fecha)},${y(c.p)}`).join(' ');
  return (
    <figure style={{ margin: '8px 0' }}>
      <figcaption className="tenue" style={{ fontSize: 12 }}>{titulo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={titulo}>
        {[0.5, 0.8].map((p) => (
          <g key={p}>
            <line x1={20} x2={W - 10} y1={y(p)} y2={y(p)} stroke="var(--borde, #ddd)" />
            <text x={0} y={y(p) + 3} fontSize="9" fill="currentColor">{Math.round(p * 100)}%</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--acento)" strokeWidth={2} />
        <text x={20} y={H + 12} fontSize="9" fill="currentColor">{textoFecha(f0)}</text>
        <text x={W - 10} y={H + 12} fontSize="9" fill="currentColor" textAnchor="end">{textoFecha(f1)}</text>
      </svg>
    </figure>
  );
}

/** Nube costo–plazo: cada punto una iteración; las líneas, los P80. */
export function NubeCostoPlazo({ puntos, p80Dias, p80Costo, fechaMin, fechaMax, titulo }: {
  puntos: ReadonlyArray<readonly [number, number]>;
  p80Dias: number;
  p80Costo: number;
  fechaMin: number;
  fechaMax: number;
  titulo: string;
}) {
  if (puntos.length === 0) return null;
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const W = 300;
  const H = 150;
  const px = (v: number) => ((v - x0) / Math.max(1e-9, x1 - x0)) * (W - 10) + 5;
  const py = (v: number) => H - 5 - ((v - y0) / Math.max(1e-9, y1 - y0)) * (H - 10);
  const xP80 = px(p80Dias);
  const yP80 = py(p80Costo);
  return (
    <figure style={{ margin: '8px 0' }}>
      <figcaption className="tenue" style={{ fontSize: 12 }}>{titulo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={titulo}>
        <rect x={0} y={yP80} width={Math.max(0, xP80)} height={Math.max(0, H - yP80)} fill="var(--acento)" opacity={0.08} />
        {puntos.map((p, i) => <circle key={i} cx={px(p[0])} cy={py(p[1])} r={1.4} fill="var(--acento)" opacity={0.35} />)}
        <line x1={xP80} x2={xP80} y1={0} y2={H} stroke="var(--texto, #333)" strokeDasharray="3 2" />
        <line x1={0} x2={W} y1={yP80} y2={yP80} stroke="var(--texto, #333)" strokeDasharray="3 2" />
        <text x={xP80 + 2} y={10} fontSize="9" fill="currentColor">P80 plazo</text>
        <text x={W - 2} y={yP80 - 3} fontSize="9" fill="currentColor" textAnchor="end">P80 costo {textoMoneda(p80Costo)}</text>
        <text x={2} y={H + 12} fontSize="9" fill="currentColor">{textoFecha(fechaMin)}</text>
        <text x={W} y={H + 12} fontSize="9" fill="currentColor" textAnchor="end">{textoFecha(fechaMax)}</text>
      </svg>
    </figure>
  );
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** El Gantt para imprimir: barras, franja P10–P90, críticas, hitos y las líneas de fin, P80 y corte. Sin flechas. */
export function GanttImpreso({ vista }: { vista: VistaGantt }) {
  const FILA = 16;
  const NOMBRES = 230;
  const W = 1000;
  const desde = vista.desde - 3;
  const hasta = vista.hasta + 3;
  const px = (W - NOMBRES - 10) / Math.max(1, hasta - desde + 1);
  const x = (s: number) => NOMBRES + (s - desde) * px;
  const alto = 24 + vista.barras.length * FILA;
  const meses: number[] = [];
  for (let d = desde; d <= hasta; d++) if (fechaDeSerie(d).dia === 1) meses.push(d);
  return (
    <svg viewBox={`0 0 ${W} ${alto + 4}`} width="100%" role="img" aria-label="Gantt">
      {meses.map((d) => {
        const f = fechaDeSerie(d);
        return (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={14} y2={alto} stroke="var(--borde, #ddd)" />
            <text x={x(d) + 2} y={11} fontSize="10" fill="currentColor">{MESES[f.mes - 1]} {String(f.anio).slice(2)}</text>
          </g>
        );
      })}
      {vista.barras.map((b, i) => {
        const y = 20 + i * FILA;
        const color = b.estado === 'terminada' ? COLORES_GANTT.terminada : b.critica ? COLORES_GANTT.critica : COLORES_GANTT.normal;
        return (
          <g key={b.id}>
            <text x={2} y={y + 11} fontSize="10" fill="currentColor" fontWeight={b.critica ? 600 : 400}>
              {`${b.id} ${b.nombre}`.slice(0, 38)}
            </text>
            {b.franja && <rect x={x(b.franja.desde)} y={y + 3} width={Math.max(1, x(b.franja.hasta + 1) - x(b.franja.desde))} height={FILA - 6} fill={b.critica ? COLORES_GANTT.franjaCritica : COLORES_GANTT.franjaNormal} rx={2} />}
            {b.hito
              ? <path d={`M${x(b.fin + 1)},${y + 2} l6,6 l-6,6 l-6,-6 z`} fill={color} />
              : <rect x={x(b.inicio)} y={y + 5} width={Math.max(1.5, x(b.fin + 1) - x(b.inicio))} height={FILA - 10} fill={color} rx={1.5} />}
          </g>
        );
      })}
      <line x1={x(vista.fechaCronograma + 1)} x2={x(vista.fechaCronograma + 1)} y1={14} y2={alto} stroke={COLORES_GANTT.cronograma} strokeDasharray="4 3" />
      {vista.fechaP80 !== undefined && <line x1={x(vista.fechaP80 + 1)} x2={x(vista.fechaP80 + 1)} y1={14} y2={alto} stroke={COLORES_GANTT.p80} strokeWidth={2} strokeDasharray="4 3" />}
      {vista.fechaCorte !== undefined && <line x1={x(vista.fechaCorte)} x2={x(vista.fechaCorte)} y1={14} y2={alto} stroke={COLORES_GANTT.corte} strokeDasharray="1 3" />}
    </svg>
  );
}

/** V5: la tendencia de las instantáneas: fin del cronograma, P50 y P80 en cada fecha de referencia. */
export function TendenciaPlazo({ puntos, titulo, nombres }: {
  puntos: ReadonlyArray<{ referencia: number; finCronograma: number; p50: number; p80: number }>;
  titulo: string;
  nombres: { cronograma: string; p50: string; p80: string };
}) {
  if (puntos.length < 2) return null;
  const W = 300;
  const H = 130;
  const IZQ = 44;
  const xs = puntos.map((p) => p.referencia);
  const ys = puntos.flatMap((p) => [p.finCronograma, p.p50, p.p80]).filter(Number.isFinite);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const px = (v: number) => IZQ + ((v - x0) / Math.max(1, x1 - x0)) * (W - IZQ - 8);
  const py = (v: number) => H - 6 - ((v - y0) / Math.max(1, y1 - y0)) * (H - 16);
  const serie = (clave: 'finCronograma' | 'p50' | 'p80') =>
    puntos.filter((p) => Number.isFinite(p[clave])).map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.referencia)},${py(p[clave])}`).join(' ');
  const estilos = [
    { clave: 'finCronograma' as const, color: 'var(--tenue, #888)', guion: '4 3', nombre: nombres.cronograma },
    { clave: 'p50' as const, color: 'var(--serie-1, #2a78d6)', guion: undefined, nombre: nombres.p50 },
    { clave: 'p80' as const, color: 'var(--acento)', guion: undefined, nombre: nombres.p80 },
  ];
  return (
    <figure style={{ margin: '8px 0' }}>
      <figcaption className="tenue" style={{ fontSize: 12 }}>{titulo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H + 28}`} width="100%" role="img" aria-label={titulo}>
        <text x={0} y={py(y1) + 3} fontSize="9" fill="currentColor">{textoFecha(y1)}</text>
        <text x={0} y={py(y0) + 3} fontSize="9" fill="currentColor">{textoFecha(y0)}</text>
        {estilos.map((e) => <path key={e.clave} d={serie(e.clave)} fill="none" stroke={e.color} strokeWidth={e.clave === 'p80' ? 2 : 1.5} strokeDasharray={e.guion} />)}
        {puntos.map((p) => <circle key={p.referencia} cx={px(p.referencia)} cy={py(p.p80)} r={2.2} fill="var(--acento)" />)}
        <text x={IZQ} y={H + 10} fontSize="9" fill="currentColor">{textoFecha(x0)}</text>
        <text x={W - 8} y={H + 10} fontSize="9" fill="currentColor" textAnchor="end">{textoFecha(x1)}</text>
        {estilos.map((e, i) => (
          <g key={e.clave} transform={`translate(${IZQ + i * 85},${H + 22})`}>
            <line x1={0} x2={14} y1={-3} y2={-3} stroke={e.color} strokeWidth={2} strokeDasharray={e.guion} />
            <text x={18} y={0} fontSize="9" fill="currentColor">{e.nombre}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** V10: una matriz 5 × 5 (amenazas u oportunidades): probabilidad hacia arriba, impacto hacia la derecha; en cada casilla, los IDs. */
export function MatrizRiesgos({ matriz, clase = 'amenaza' }: { matriz: string[][][]; clase?: Clase }) {
  return (
    <table className="matriz-riesgos" style={{ borderCollapse: 'collapse', fontSize: 11, margin: '6px 0' }}>
      <tbody>
        {[5, 4, 3, 2, 1].map((p) => (
          <tr key={p}>
            <th scope="row" style={{ padding: '0 4px', fontWeight: 400 }} className="tenue">P{p}</th>
            {[1, 2, 3, 4, 5].map((i) => (
              <td key={i} style={{ background: colorDe(clase, p * i), color: '#1b1b1b', width: 46, height: 26, textAlign: 'center', border: '1px solid #fff' }}>
                {(matriz[p - 1]?.[i - 1] ?? []).join(' ')}
              </td>
            ))}
          </tr>
        ))}
        <tr><th />{[1, 2, 3, 4, 5].map((i) => <th key={i} style={{ fontWeight: 400 }} className="tenue">I{i}</th>)}</tr>
      </tbody>
    </table>
  );
}

/**
 * V10: la matriz consolidada (la doble del PMBOK): amenazas a la izquierda
 * (I1 → I5) y oportunidades a la derecha (I5 → I1), con la probabilidad
 * común; lo que más pesa de los dos lados queda en el centro.
 */
export function MatrizConsolidada({ amenazas, oportunidades, textos }: {
  amenazas: string[][][];
  oportunidades: string[][][];
  textos: { amenazas: string; oportunidades: string };
}) {
  return (
    <table className="matriz-riesgos" style={{ borderCollapse: 'collapse', fontSize: 10, margin: '6px 0' }}>
      <tbody>
        <tr>
          <th />
          <th colSpan={5} style={{ fontWeight: 600, textAlign: 'center' }}>{textos.amenazas}</th>
          <th colSpan={5} style={{ fontWeight: 600, textAlign: 'center' }}>{textos.oportunidades}</th>
        </tr>
        {[5, 4, 3, 2, 1].map((p) => (
          <tr key={p}>
            <th scope="row" style={{ padding: '0 4px', fontWeight: 400 }} className="tenue">P{p}</th>
            {COLUMNAS_CONSOLIDADA.map((c, j) => (
              <td key={j} style={{
                background: colorDe(c.clase, p * c.i), color: '#1b1b1b', minWidth: 28, height: 24, textAlign: 'center',
                border: '1px solid #fff', ...(j === 5 ? { borderLeft: '3px solid var(--texto, #333)' } : {}),
              }}>
                {((c.clase === 'amenaza' ? amenazas : oportunidades)[p - 1]?.[c.i - 1] ?? []).join(' ')}
              </td>
            ))}
          </tr>
        ))}
        <tr><th />{COLUMNAS_CONSOLIDADA.map((c, j) => <th key={j} style={{ fontWeight: 400 }} className="tenue">I{c.i}</th>)}</tr>
      </tbody>
    </table>
  );
}

/**
 * W4: el sesgo de convergencia de una actividad: la probabilidad de que cada
 * ruta llegue a tiempo y la de que lleguen todas (la de la convergencia),
 * que es menor que la de cualquiera.
 */
export function BarrasConvergencia({ c, textos }: {
  c: { nombre: string; probATiempo: number; probProducto: number; ramas: ReadonlyArray<{ id: string; nombre: string; probATiempo: number }> };
  textos: { titulo: string; todas: string; independientes: string };
}) {
  const filas = [...c.ramas.map((x) => ({ k: x.id, nombre: x.nombre, p: x.probATiempo, fuerte: false })), { k: '__todas', nombre: textos.todas, p: c.probATiempo, fuerte: true }];
  const W = 300;
  const IZQ = 118;
  const FILA = 18;
  const H = filas.length * FILA + 14;
  const x = (p: number) => IZQ + p * (W - IZQ - 34);
  return (
    <figure style={{ margin: '8px 0' }}>
      <figcaption className="tenue" style={{ fontSize: 12 }}>{textos.titulo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={textos.titulo}>
        {filas.map((f, i) => (
          <g key={f.k} transform={`translate(0,${i * FILA})`}>
            <text x={IZQ - 4} y={12} fontSize="9" textAnchor="end" fill="currentColor" fontWeight={f.fuerte ? 700 : 400}>{f.nombre.length > 24 ? `${f.nombre.slice(0, 23)}…` : f.nombre}</text>
            <rect x={IZQ} y={3} width={Math.max(1, x(f.p) - IZQ)} height={FILA - 6} fill={f.fuerte ? 'var(--baja, #e34948)' : 'var(--acento)'} opacity={f.fuerte ? 0.9 : 0.6} rx={2} />
            <text x={x(f.p) + 3} y={12} fontSize="9" fill="currentColor">{Math.round(f.p * 100)} %</text>
          </g>
        ))}
        {/* Lo que daría si las rutas fueran independientes: el producto. */}
        <line x1={x(c.probProducto)} x2={x(c.probProducto)} y1={(filas.length - 1) * FILA + 1} y2={filas.length * FILA - 1} stroke="currentColor" strokeDasharray="2 2" />
        <text x={IZQ} y={H - 2} fontSize="8" fill="currentColor" className="tenue">{textos.independientes}</text>
      </svg>
    </figure>
  );
}
