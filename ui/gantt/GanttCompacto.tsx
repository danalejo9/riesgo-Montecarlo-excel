/**
 * Vista compacta del Gantt en el panel (G1, decisión 1): solo la línea de
 * tiempo con el nombre junto a cada barra, todo el proyecto en el ancho del
 * panel. Aparece también antes de simular; la vista completa (grid,
 * edición, diagnóstico) está en la ventana.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { construirVista, type DatosGantt } from '../../excel/gantt.ts';
import { dibujar } from './dibujo.ts';
import { ajustarTodo, GEOMETRIA } from './trazado.ts';
import './gantt.css';

const AE = 34;
const MAX_ALTO = 380;
const G = { altoFila: 20, altoBarra: 10 };

export function GanttCompacto({ datos }: { datos: DatosGantt }) {
  const calculo = useMemo(() => {
    try {
      return { vista: construirVista(datos) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [datos]);
  const caja = useRef<HTMLDivElement | null>(null);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const [ancho, setAncho] = useState(320);
  const [scrollTop, setScrollTop] = useState(0);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAncho(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const vista = 'vista' in calculo ? calculo.vista : null;
  const altoTotal = vista ? AE + vista.filas.length * G.altoFila + 8 : 0;
  // El lienzo es del alto visible y se queda fijo: con miles de filas no crece.
  const alto = Math.min(altoTotal, MAX_ALTO);

  useLayoutEffect(() => {
    const c = lienzo.current;
    if (!c || !vista) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(ancho * dpr);
    c.height = Math.round(alto * dpr);
    c.style.width = `${ancho}px`;
    c.style.height = `${alto}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Deja sitio a la derecha para el nombre de las últimas barras.
    const escala = ajustarTodo(vista.inicio, vista.fin, Math.max(120, ancho * 0.72));
    const filas = vista.filas;
    dibujar(ctx, {
      vista, filas, indiceFila: new Map(filas.map((f, k) => [f.id, k])), escala, g: { ...GEOMETRIA, ...G }, ancho, alto,
      scrollLeft: 0, scrollTop, altoEncabezado: AE, seleccion: null, relacionSeleccionada: null, resaltado: null,
      hoy: Math.floor(Date.now() / 86_400_000) + 25569, capas: { flechas: true, holgura: true, qrsa: true, etiquetas: true },
    });
  }, [vista, ancho, alto, scrollTop]);

  if ('error' in calculo) return <p className="aviso-error">No se puede dibujar el cronograma: {calculo.error}</p>;
  return (
    <div className="gantt-compacto" ref={caja} onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}>
      <div style={{ height: altoTotal, position: 'relative' }}>
        <canvas ref={lienzo} className="gantt-lienzo" aria-label="Diagrama de Gantt del cronograma" />
      </div>
    </div>
  );
}
