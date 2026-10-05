/**
 * El Gantt para imprimir (G3, prueba 9): páginas del tamaño y la orientación
 * elegidos, cada una con su encabezado (título, fechas, «página n de N»), la
 * escala de tiempo repetida, las filas que caben enteras y el pie; la
 * leyenda en la última. «Imprimir → Guardar como PDF» del navegador hace el
 * archivo. Desde aquí también se descarga la imagen (PNG), el XML de MS
 * Project y el CSV: en el navegador las descargas funcionan siempre, cosa que
 * no garantiza la ventana flotante de Office.
 */

import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { decodificarJson } from '../../excel/codificacion.ts';
import { construirVista, type DatosGantt, type DefinicionCritica, type FilaGantt, type VistaGantt } from '../../excel/gantt.ts';
import { csvGantt, exportarMspdi } from '../../excel/exportarGantt.ts';
import { textoFecha } from '../../engine/modelo/fechas.ts';
import { COLORES, dibujar, type EscenaGantt } from './dibujo.ts';
import { ajustarTodo, areaPagina, GEOMETRIA, paginar, PAPELES, type Papel } from './trazado.ts';
import '../estilos.css';
import './gantt.css';

/** Lo que manda la ventana del Gantt. */
export interface PedidoImpresion {
  datos: DatosGantt;
  titulo: string;
  definicion: DefinicionCritica;
  lineaBase?: number;
  capas: EscenaGantt['capas'];
}

const G = { ...GEOMETRIA, altoFila: 20, altoBarra: 10 };
const PARTES = { encabezado: 44, escala: 34, pie: 22, leyenda: 96, fila: G.altoFila };
const ANCHO_NOMBRES = 300;

function Impreso() {
  const [pedido, setPedido] = useState<PedidoImpresion | null | 'cargando'>('cargando');
  const [papel, setPapel] = useState<Papel>('A4');
  const [horizontal, setHorizontal] = useState(true);
  useEffect(() => {
    const codigo = new URLSearchParams(window.location.hash.slice(1)).get('d');
    if (!codigo) { setPedido(null); return; }
    void decodificarJson(codigo).then((d) => setPedido(d as PedidoImpresion)).catch(() => setPedido(null));
  }, []);
  const vista = useMemo(() => (pedido && pedido !== 'cargando'
    ? construirVista(pedido.datos, { definicion: pedido.definicion, ...(pedido.lineaBase !== undefined ? { lineaBase: pedido.lineaBase } : {}) }) : null), [pedido]);

  if (pedido === 'cargando') return <p className="tenue">Preparando…</p>;
  if (!pedido || !vista) return <main className="informe"><h1>No hay cronograma que imprimir</h1><p>Se abre desde la ventana del Gantt: «Imprimir y exportar».</p></main>;

  const area = areaPagina(papel, horizontal);
  const paginas = paginar(vista.filas.length, area.alto, PARTES);
  const anchoLinea = area.ancho - ANCHO_NOMBRES;
  const generado = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  const [w, h] = PAPELES[papel];
  return (
    <>
      <style>{`@page { size: ${horizontal ? `${h}mm ${w}mm` : `${w}mm ${h}mm`}; margin: 10mm; }`}</style>
      <div className="solo-pantalla barra-impreso">
        <label>Papel <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>{Object.keys(PAPELES).map((p) => <option key={p}>{p}</option>)}</select></label>
        <label><input type="checkbox" checked={horizontal} onChange={(e) => setHorizontal(e.target.checked)} /> Horizontal</label>
        <button type="button" className="principal" onClick={() => window.print()}>Imprimir o guardar como PDF</button>
        <button type="button" className="secundario" onClick={() => descargarPng(vista, pedido)}>Imagen (PNG)</button>
        <button type="button" className="secundario" onClick={() => descargar(`${pedido.titulo}.xml`, exportarMspdi(pedido.datos, vista, pedido.titulo), 'application/xml')}>MS Project (XML)</button>
        <button type="button" className="secundario" onClick={() => descargar(`${pedido.titulo}.csv`, csvGantt(vista), 'text/csv;charset=utf-8')}>Tabla (CSV)</button>
        <span className="tenue">{paginas.length} {paginas.length === 1 ? 'página' : 'páginas'} · en el cuadro de impresión, elige «Guardar como PDF».</span>
      </div>
      <main className="paginas-gantt">
        {paginas.map((p) => (
          <section key={p.numero} className="pagina-gantt" style={{ width: area.ancho, height: area.alto }}>
            <header className="encabezado-pagina" style={{ height: PARTES.encabezado }}>
              <strong>{pedido.titulo}</strong>
              <span>{textoFecha(vista.inicio)} – {textoFecha(vista.fin)} · ruta crítica: {pedido.definicion === 'holgura' ? 'holgura total ≤ 0' : 'ruta más larga'}{vista.fechaCorte !== null ? ` · corte ${textoFecha(vista.fechaCorte)}` : ''}</span>
            </header>
            <div className="cuerpo-pagina" style={{ height: PARTES.escala + (p.hasta - p.desde) * G.altoFila }}>
              <Nombres filas={vista.filas.slice(p.desde, p.hasta)} />
              <Lamina vista={vista} desde={p.desde} hasta={p.hasta} ancho={anchoLinea} capas={pedido.capas} />
            </div>
            {p.numero === paginas.length && <LeyendaImpresa alto={PARTES.leyenda} />}
            <footer className="pie-pagina" style={{ height: PARTES.pie }}>
              <span>{generado}</span><span>Página {p.numero} de {paginas.length}</span>
            </footer>
          </section>
        ))}
      </main>
    </>
  );
}

function Nombres({ filas }: { filas: FilaGantt[] }) {
  return (
    <div className="nombres-pagina" style={{ width: ANCHO_NOMBRES }}>
      <div className="fila-nombre encabezado" style={{ height: PARTES.escala }}><span>ID</span><span>Nombre</span><span>Dur.</span><span>Fin</span></div>
      {filas.map((f) => (
        <div key={f.id} className={`fila-nombre${f.tipo === 'resumen' ? ' resumen' : ''}${f.critica ? ' critica' : ''}`} style={{ height: G.altoFila }}>
          <span>{f.id}</span>
          <span style={{ paddingLeft: (f.nivel - 1) * 10 }}>{f.nombre}</span>
          <span>{f.duracion === null ? '' : f.duracion}</span>
          <span>{Number.isFinite(f.fin) ? textoFecha(f.fin) : ''}</span>
        </div>
      ))}
    </div>
  );
}

function escenaDe(vista: VistaGantt, ancho: number, alto: number, scrollTop: number, capas: EscenaGantt['capas']): EscenaGantt {
  const escala = ajustarTodo(vista.inicio, vista.fin, ancho - 20);
  return {
    vista, filas: vista.filas, indiceFila: new Map(vista.filas.map((f, k) => [f.id, k])), escala, g: G, ancho, alto,
    scrollLeft: 0, scrollTop, altoEncabezado: PARTES.escala, seleccion: null, relacionSeleccionada: null, resaltado: null,
    hoy: Math.floor(Date.now() / 86_400_000) + 25569, capas,
  };
}

/** La línea de tiempo de una página: las filas [desde, hasta), con la escala arriba. */
function Lamina({ vista, desde, hasta, ancho, capas }: { vista: VistaGantt; desde: number; hasta: number; ancho: number; capas: EscenaGantt['capas'] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const alto = PARTES.escala + (hasta - desde) * G.altoFila;
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    // A doble resolución: el PDF sale nítido.
    const k = 2;
    c.width = ancho * k;
    c.height = alto * k;
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    dibujar(ctx, escenaDe(vista, ancho, alto, desde * G.altoFila, capas));
  }, [vista, desde, hasta, ancho, alto, capas]);
  return <canvas ref={ref} />;
}

function LeyendaImpresa({ alto }: { alto: number }) {
  const items: [string, string][] = [
    [COLORES.tarea, 'Tarea'], [COLORES.critica, 'Crítica'], [COLORES.casiCritica, 'Casi crítica'], [COLORES.resumen, 'Resumen / hito'],
    [COLORES.lineaBase, 'Línea base'], [COLORES.holgura, 'Holgura total'], [COLORES.flechaImpulsora, 'Vínculo impulsor'], [COLORES.corte, 'Fecha de corte'],
  ];
  return (
    <div className="leyenda-pagina" style={{ height: alto }}>
      {items.map(([c, t]) => <span key={t}><i style={{ background: c }} /> {t}</span>)}
    </div>
  );
}

/** Todo el Gantt en una imagen: los nombres a la izquierda y la línea de tiempo. */
function descargarPng(vista: VistaGantt, pedido: PedidoImpresion): void {
  const filas = vista.filas.length;
  const maxFilas = Math.floor((30_000 - PARTES.escala) / G.altoFila);
  const n = Math.min(filas, maxFilas);
  const ancho = 1800;
  const alto = PARTES.escala + n * G.altoFila;
  const c = document.createElement('canvas');
  c.width = ANCHO_NOMBRES + ancho;
  c.height = alto;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLORES.encabezado;
  ctx.fillRect(0, 0, ANCHO_NOMBRES, PARTES.escala);
  ctx.fillStyle = COLORES.texto;
  ctx.fillText(pedido.titulo, 6, PARTES.escala / 2);
  vista.filas.slice(0, n).forEach((f, k) => {
    const y = PARTES.escala + k * G.altoFila + G.altoFila / 2;
    ctx.font = f.tipo === 'resumen' ? 'bold 11px "Segoe UI", system-ui, sans-serif' : '11px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = f.critica ? COLORES.critica : COLORES.texto;
    ctx.fillText(`${f.id}  ${'  '.repeat(f.nivel - 1)}${f.nombre}`.slice(0, 48), 6, y);
  });
  ctx.save();
  ctx.translate(ANCHO_NOMBRES, 0);
  dibujar(ctx, escenaDe(vista, ancho, alto, 0, pedido.capas));
  ctx.restore();
  c.toBlob((b) => { if (b) descargarBlob(`${pedido.titulo}.png`, b); }, 'image/png');
  if (n < filas) alert(`La imagen lleva las primeras ${n} de ${filas} filas (más no caben en una imagen); para todo el cronograma, usa el PDF.`);
}

function descargar(nombre: string, texto: string, tipo: string): void {
  descargarBlob(nombre, new Blob([texto], { type: tipo }));
}

function descargarBlob(nombre: string, b: Blob): void {
  const url = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.replace(/[\\/:*?"<>|]/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const raiz = document.getElementById('raiz');
if (raiz) createRoot(raiz).render(<StrictMode><Impreso /></StrictMode>);
