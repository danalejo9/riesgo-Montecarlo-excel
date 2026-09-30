/**
 * «Ver cronograma» (P3c): Gantt interactivo en una ventana flotante, como el
 * de los programas de riesgo de cronograma (Safran, Acumen, RiskyProject):
 * barras, flechas de las relaciones, zoom, críticas y criticidad en color,
 * franja P10–P90 tras simular y, al pulsar una actividad, sus predecesoras y
 * sucesoras. Lo que dibuja lo arma el panel (`vistaGantt`) y llega en la URL
 * o por mensaje.
 */

import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { decodificarJson } from '../excel/codificacion.ts';
import { escucharAlPanel, hablarAlPanel } from '../excel/ventana.ts';
import { COLORES_GANTT, VERSION_GANTT, type BarraGantt, type Escala, type VistaGantt } from '../engine/cronograma/gantt.ts';
import { diaSemana } from '../engine/cronograma/calendario.ts';
import { fechaDeSerie, textoFecha } from '../engine/modelo/fechas.ts';
import { textosGantt as T } from './textos/es.ts';
import './estilos.css';
import './gantt.css';

const PAGINA = 'gantt.html';
const FILA = 24;
const CABECERA = 34;
const PX: Record<Escala, number> = { dia: 22, semana: 5, mes: 1.3 };
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function comoVista(d: unknown): VistaGantt | null {
  const v = d as VistaGantt | null;
  return v && typeof v === 'object' && v.version === VERSION_GANTT && Array.isArray(v.barras) ? v : null;
}

/** Azul (0) → rojo (1), para el índice de criticidad. */
function colorCriticidad(c: number): string {
  const a = [0x2a, 0x78, 0xd6];
  const b = [0xe3, 0x49, 0x48];
  const m = a.map((x, i) => Math.round(x + ((b[i] as number) - x) * Math.max(0, Math.min(1, c))));
  return `rgb(${m.join(',')})`;
}

function Gantt() {
  const [vista, setVista] = useState<VistaGantt | null>(null);
  const [aviso, setAviso] = useState<string | null>(T.cargando);
  const [escala, setEscala] = useState<Escala | null>(null);
  const [flechas, setFlechas] = useState<boolean | null>(null);
  const [color, setColor] = useState<'critica' | 'criticidad'>('critica');
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    const aplicar = (d: unknown) => {
      const v = comoVista(d);
      if (!v) return;
      setVista(v);
      setAviso(null);
      if (v.simulado) setColor('criticidad');
    };
    escucharAlPanel(PAGINA, aplicar);
    const codigo = /#d=([^&]*)/.exec(window.location.hash)?.[1] ?? '';
    void (async () => {
      const d = codigo ? await decodificarJson(codigo) : null;
      if (comoVista(d)) aplicar(d);
      else {
        // Cronograma grande: no cabe en la URL; se pide por mensaje.
        hablarAlPanel(PAGINA, { accion: 'listo' });
        setTimeout(() => setAviso((a) => (a === T.cargando ? T.sinDatos : a)), 8000);
      }
    })();
  }, []);

  if (!vista) return <main className="gantt"><p className="tenue">{aviso}</p></main>;
  const esc: Escala = escala ?? (vista.hasta - vista.desde <= 92 ? 'dia' : vista.hasta - vista.desde <= 800 ? 'semana' : 'mes');
  const conFlechas = flechas ?? vista.barras.length <= 300;
  return (
    <main className="gantt">
      <header>
        <h1>{T.titulo}</h1>
        <p className="tenue">{T.resumen(vista.barras.length, vista.simulado)}</p>
        <div className="gantt-controles">
          <span>{T.escala}:{' '}
            {(['dia', 'semana', 'mes'] as const).map((e) => (
              <button key={e} type="button" className={e === esc ? 'activa' : ''} onClick={() => setEscala(e)}>{T.escalas[e]}</button>
            ))}
          </span>
          <label><input type="checkbox" checked={conFlechas} onChange={(e) => setFlechas(e.target.checked)} /> {T.flechas}</label>
          {vista.simulado && (
            <label>{T.color}{' '}
              <select value={color} onChange={(e) => setColor(e.target.value as 'critica' | 'criticidad')}>
                <option value="critica">{T.colores.critica}</option>
                <option value="criticidad">{T.colores.criticidad}</option>
              </select>
            </label>
          )}
        </div>
        <Leyenda simulado={vista.simulado} color={color} />
        {vista.barras.length > 300 && flechas === null && <p className="tenue">{T.muchas}</p>}
      </header>
      <Diagrama vista={vista} escala={esc} flechas={conFlechas} color={color} sel={sel} alElegir={setSel} />
      <Seleccion vista={vista} sel={sel} alQuitar={() => setSel(null)} />
    </main>
  );
}

function Leyenda({ simulado, color }: { simulado: boolean; color: 'critica' | 'criticidad' }) {
  const caja = (c: string) => <span className="gantt-caja" style={{ background: c }} />;
  return (
    <p className="gantt-leyenda">
      {color === 'critica' ? (
        <>{caja(COLORES_GANTT.critica)}{T.leyendaCritica} {caja(COLORES_GANTT.normal)}{T.leyendaNormal}</>
      ) : (
        <><span className="gantt-caja gantt-gradiente" />{T.colores.criticidad} (0 → 100 %)</>
      )}
      {simulado && <> {caja(COLORES_GANTT.franjaNormal)}{T.leyendaFranja}</>}
      {caja(COLORES_GANTT.terminada)}{T.leyendaTerminada}
      {' '}◆ {T.leyendaHito} <span className="gantt-linea" style={{ borderColor: COLORES_GANTT.cronograma }} />{T.finCronograma}
      {simulado && <> <span className="gantt-linea" style={{ borderColor: COLORES_GANTT.p80 }} />{T.p80}</>}
    </p>
  );
}

function Diagrama({ vista, escala, flechas, color, sel, alElegir }: {
  vista: VistaGantt; escala: Escala; flechas: boolean; color: 'critica' | 'criticidad'; sel: string | null; alElegir: (id: string | null) => void;
}) {
  const px = PX[escala];
  const desde = vista.desde - (escala === 'dia' ? 1 : escala === 'semana' ? 7 : 15);
  const hasta = vista.hasta + (escala === 'dia' ? 3 : escala === 'semana' ? 14 : 45);
  const ancho = Math.ceil((hasta - desde + 1) * px);
  const alto = CABECERA + vista.barras.length * FILA + 8;
  const x = (serie: number) => (serie - desde) * px;
  const fila = useMemo(() => new Map(vista.barras.map((b, i) => [b.id, i])), [vista]);
  const barra = useMemo(() => new Map(vista.barras.map((b) => [b.id, b])), [vista]);
  const y = (i: number) => CABECERA + i * FILA;

  const vecinos = useMemo(() => {
    if (!sel) return null;
    const s = new Set<string>([sel]);
    for (const e of vista.enlaces) {
      if (e.a === sel) s.add(e.de);
      if (e.de === sel) s.add(e.a);
    }
    return s;
  }, [sel, vista]);

  const marcas = [];
  for (let d = desde; d <= hasta; d++) {
    const { dia, mes, anio } = fechaDeSerie(d);
    if (escala === 'dia') {
      const fin = diaSemana(d) === 0 || diaSemana(d) === 6;
      marcas.push(
        <g key={d}>
          {fin && <rect x={x(d)} y={CABECERA} width={px} height={alto - CABECERA} className="gantt-finde" />}
          <text x={x(d) + px / 2} y={CABECERA - 6} textAnchor="middle" className="gantt-eje">{dia}</text>
          {(dia === 1 || d === desde) && <text x={x(d) + 2} y={12} className="gantt-eje-mes">{MESES[mes - 1]} {anio}</text>}
        </g>,
      );
    } else if (escala === 'semana') {
      if (diaSemana(d) === 1) {
        marcas.push(
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={CABECERA - 4} y2={alto} className="gantt-reja" />
            <text x={x(d) + 2} y={CABECERA - 6} className="gantt-eje">{String(dia).padStart(2, '0')}/{String(mes).padStart(2, '0')}</text>
          </g>,
        );
      }
      if (dia === 1) marcas.push(<text key={`m${d}`} x={x(d) + 2} y={12} className="gantt-eje-mes">{MESES[mes - 1]} {anio}</text>);
    } else if (dia === 1) {
      marcas.push(
        <g key={d}>
          <line x1={x(d)} x2={x(d)} y1={14} y2={alto} className="gantt-reja" />
          <text x={x(d) + 2} y={CABECERA - 6} className="gantt-eje">{MESES[mes - 1]}</text>
          {mes === 1 && <text x={x(d) + 2} y={12} className="gantt-eje-mes">{anio}</text>}
        </g>,
      );
    }
  }

  const colorDe = (b: BarraGantt) => (b.estado === 'terminada' ? COLORES_GANTT.terminada : color === 'criticidad' && b.criticidad !== undefined
    ? colorCriticidad(b.criticidad)
    : b.critica ? COLORES_GANTT.critica : COLORES_GANTT.normal);
  const opacidad = (id: string) => (vecinos && !vecinos.has(id) ? 0.2 : 1);

  const enlaces = flechas ? vista.enlaces.map((e, k) => {
    const i = fila.get(e.de);
    const j = fila.get(e.a);
    const p = barra.get(e.de);
    const s = barra.get(e.a);
    if (i === undefined || j === undefined || !p || !s) return null;
    const desdeFin = e.tipo === 'FS' || e.tipo === 'FF';
    const haciaFin = e.tipo === 'FF' || e.tipo === 'SF';
    const x0 = desdeFin ? x(p.fin + 1) : x(p.inicio);
    const x1 = haciaFin ? x(s.fin + 1) : x(s.inicio);
    const y0 = y(i) + FILA / 2;
    const y1 = y(j) + FILA / 2;
    const salida = x0 + (desdeFin ? 6 : -6);
    const llegada = x1 + (haciaFin ? 6 : -6);
    const d = `M${x0},${y0} H${salida} V${(y0 + y1) / 2} H${llegada} V${y1} H${x1 + (haciaFin ? 1 : -1)}`;
    const activa = vecinos ? (e.a === sel || e.de === sel) : true;
    return <path key={k} d={d} className={`gantt-enlace${activa && vecinos ? ' activa' : ''}`} opacity={vecinos && !activa ? 0.1 : 1} markerEnd="url(#punta)" />;
  }) : null;

  return (
    <div className="gantt-cuerpo" style={{ maxHeight: 'calc(100vh - 230px)' }}>
      <svg width={260} height={alto} className="gantt-nombres">
        <text x={6} y={CABECERA - 6} className="gantt-eje">ID · Actividad</text>
        {vista.barras.map((b, i) => (
          <g key={b.id} opacity={opacidad(b.id)} onClick={() => alElegir(b.id === sel ? null : b.id)} style={{ cursor: 'pointer' }}>
            {b.id === sel && <rect x={0} y={y(i)} width={260} height={FILA} className="gantt-fila-sel" />}
            <text x={6} y={y(i) + 16} className="gantt-id">{b.id}</text>
            <text x={44} y={y(i) + 16} className={b.critica ? 'gantt-nombre critica' : 'gantt-nombre'}>
              {b.nombre.length > 30 ? `${b.nombre.slice(0, 29)}…` : b.nombre}
            </text>
          </g>
        ))}
      </svg>
      <div className="gantt-tiempo">
        <svg width={ancho} height={alto}>
          <defs>
            <marker id="punta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" className="gantt-punta" />
            </marker>
          </defs>
          {marcas}
          {vista.barras.map((b, i) => (
            <g key={b.id} opacity={opacidad(b.id)} onClick={() => alElegir(b.id === sel ? null : b.id)} style={{ cursor: 'pointer' }}>
              <title>{tooltip(b)}</title>
              {b.id === sel && <rect x={0} y={y(i)} width={ancho} height={FILA} className="gantt-fila-sel" />}
              {b.franja && (
                <rect x={x(b.franja.desde)} y={y(i) + 4} width={Math.max(2, x(b.franja.hasta + 1) - x(b.franja.desde))} height={FILA - 8}
                  rx={3} fill={b.critica ? COLORES_GANTT.franjaCritica : COLORES_GANTT.franjaNormal} />
              )}
              {b.hito ? (
                <path d={`M${x(b.fin + 1)},${y(i) + 5} l7,7 l-7,7 l-7,-7 z`} fill={colorDe(b)} />
              ) : (
                <rect x={x(b.inicio)} y={y(i) + 7} width={Math.max(2, x(b.fin + 1) - x(b.inicio))} height={FILA - 14} rx={2} fill={colorDe(b)} />
              )}
            </g>
          ))}
          {enlaces}
          <line x1={x(vista.fechaCronograma + 1)} x2={x(vista.fechaCronograma + 1)} y1={16} y2={alto} stroke={COLORES_GANTT.cronograma} strokeDasharray="4 3" />
          {vista.fechaCorte !== undefined && (
            <g>
              <line x1={x(vista.fechaCorte)} x2={x(vista.fechaCorte)} y1={16} y2={alto} stroke={COLORES_GANTT.corte} strokeWidth={1.5} strokeDasharray="1 3" />
              <text x={x(vista.fechaCorte) + 3} y={alto - 4} className="gantt-eje">{T.fechaCorte}</text>
            </g>
          )}
          {vista.fechaP80 !== undefined && (
            <line x1={x(vista.fechaP80 + 1)} x2={x(vista.fechaP80 + 1)} y1={16} y2={alto} stroke={COLORES_GANTT.p80} strokeWidth={2} strokeDasharray="4 3" />
          )}
        </svg>
      </div>
    </div>
  );
}

function tooltip(b: BarraGantt): string {
  const lineas = [
    `${b.id} · ${b.nombre}`,
    b.hito ? textoFecha(b.fin) : `${textoFecha(b.inicio)} → ${textoFecha(b.fin)}`,
    `${T.holgura}: ${Math.round(b.holgura * 10) / 10} ${T.dias}`,
  ];
  if (b.criticidad !== undefined) lineas.push(`${T.criticaEn} ${Math.round(b.criticidad * 100)} % ${T.deLosCasos}`);
  if (b.franja) lineas.push(`P10–P90: ${textoFecha(b.franja.desde)} → ${textoFecha(b.franja.hasta)}`);
  if (b.predecesoras) lineas.push(`${T.predecesoras}: ${b.predecesoras}`);
  return lineas.join('\n');
}

function Seleccion({ vista, sel, alQuitar }: { vista: VistaGantt; sel: string | null; alQuitar: () => void }) {
  if (!sel) return <p className="tenue gantt-pie">{T.pulsa}</p>;
  const b = vista.barras.find((x) => x.id === sel);
  const nombre = (id: string) => vista.barras.find((x) => x.id === id)?.nombre ?? id;
  const lista = (xs: typeof vista.enlaces, lado: 'de' | 'a') =>
    xs.length === 0 ? T.ninguna : xs.map((e) => `${e[lado]} ${nombre(e[lado])} (${T.tipos[e.tipo]}${e.retardo ? `, ${e.retardo > 0 ? '+' : ''}${e.retardo} d` : ''})`).join(' · ');
  return (
    <div className="gantt-pie">
      <strong>{T.seleccion(b?.nombre ?? sel)}</strong>{' '}
      <button type="button" onClick={alQuitar}>{T.quitarSeleccion}</button>
      <p><strong>{T.predecesoras}:</strong> {lista(vista.enlaces.filter((e) => e.a === sel), 'de')}</p>
      <p><strong>{T.sucesoras}:</strong> {lista(vista.enlaces.filter((e) => e.de === sel), 'a')}</p>
    </div>
  );
}

createRoot(document.getElementById('raiz') as HTMLElement).render(
  <StrictMode>
    <Gantt />
  </StrictMode>,
);
