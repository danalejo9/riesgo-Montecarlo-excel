/**
 * V6 (07/10): el Gantt en el informe ejecutivo del cronograma, con la franja
 * de las fechas de fin posibles debajo y en el mismo eje. Una imagen fija
 * para imprimir: el nombre junto a cada barra, la ruta crítica en rojo y el
 * rango P10–P90 de la simulación. Con muchas actividades, solo las primeras
 * (el Gantt completo se imprime desde su ventana).
 */

import { useLayoutEffect, useMemo, useRef } from 'react';

import { construirVista, type DatosGantt } from '../../excel/gantt.ts';
import { dibujar, dibujarDistribucion } from './dibujo.ts';
import { ajustarTodo, GEOMETRIA } from './trazado.ts';

const ANCHO = 720;
const AE = 34;
const G = { ...GEOMETRIA, altoFila: 18, altoBarra: 9 };
const ALTO_DIST = 90;
export const MAX_FILAS_INFORME = 60;

export function GanttInforme({ datos }: { datos: DatosGantt }) {
  const vista = useMemo(() => {
    try {
      return construirVista(datos);
    } catch {
      return null;
    }
  }, [datos]);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const lienzoDist = useRef<HTMLCanvasElement | null>(null);
  const filas = vista ? vista.filas.slice(0, MAX_FILAS_INFORME) : [];
  const dist = datos.distribucionFin;
  const finEje = vista ? Math.max(vista.fin, dist ? dist.desde + 7 * dist.semanas.length : -Infinity) : 0;
  // Sitio a la derecha para el nombre de las últimas barras.
  const escala = vista ? ajustarTodo(vista.inicio, finEje, ANCHO * 0.74) : null;
  const alto = AE + filas.length * G.altoFila + 6;

  useLayoutEffect(() => {
    if (!vista || !escala) return;
    const k = 2; // a doble resolución: el PDF sale nítido
    const pintar = (c: HTMLCanvasElement | null, h: number, f: (ctx: CanvasRenderingContext2D) => void) => {
      if (!c) return;
      c.width = ANCHO * k;
      c.height = h * k;
      c.style.width = `${ANCHO}px`;
      c.style.height = `${h}px`;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      f(ctx);
    };
    pintar(lienzo.current, alto, (ctx) => dibujar(ctx, {
      vista, filas, indiceFila: new Map(filas.map((x, i) => [x.id, i])), escala, g: G, ancho: ANCHO, alto,
      scrollLeft: 0, scrollTop: 0, altoEncabezado: AE, seleccion: null, relacionSeleccionada: null, resaltado: null,
      hoy: Math.floor(Date.now() / 86_400_000) + 25569, capas: { flechas: true, holgura: false, qrsa: true, etiquetas: true },
    }));
    if (dist) pintar(lienzoDist.current, ALTO_DIST, (ctx) => dibujarDistribucion(ctx, {
      dist, escala, scrollLeft: 0, ancho: ANCHO, alto: ALTO_DIST, meta: datos.modelo.configuracion.fechaMeta ?? null,
    }));
  }, [vista, escala, filas, alto, dist, datos]);

  if (!vista) return null;
  return (
    <figure className="gantt-informe">
      <canvas ref={lienzo} aria-label="Diagrama de Gantt del cronograma" />
      {dist && <canvas ref={lienzoDist} aria-label="Fechas de fin posibles, una barra por semana" />}
      <figcaption className="tenue">
        Rojo: ruta crítica; naranja: casi crítica; azul: con holgura. Sobre cada barra, el rango P10–P90 de su fin.
        {dist && <> Debajo, las fechas de fin posibles ({dist.iteraciones.toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)} iteraciones, una barra por semana): azules las que cumplen la meta, naranjas las que no.</>}
        {vista.filas.length > MAX_FILAS_INFORME && <> Se muestran las primeras {MAX_FILAS_INFORME} de {vista.filas.length} filas; el Gantt completo se imprime desde su ventana («Imprimir y exportar»).</>}
      </figcaption>
    </figure>
  );
}
