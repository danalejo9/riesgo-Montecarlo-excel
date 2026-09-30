/**
 * Gráficos del cronograma que comparten el panel y el informe PDF (V3). Con
 * datos planos (no el resultado entero de la simulación), porque el informe
 * los recibe resumidos en la dirección de su página.
 */

import { COLORES_GANTT, type VistaGantt } from '../engine/cronograma/gantt.ts';
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
