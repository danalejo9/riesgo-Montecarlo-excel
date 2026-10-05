/**
 * Geometría del Gantt (G1), sin DOM: escala de tiempo, encabezados de dos
 * niveles, rectángulo de cada barra, ruteo ortogonal de las flechas de los
 * cuatro tipos y qué parte de una barra está bajo el ratón. Lo dibuja
 * `LineaTiempo.tsx` en un Canvas; aquí todo se puede probar.
 *
 * El eje son números de serie de Excel: el día `s` ocupa de `x(s)` a
 * `x(s + 1)`. Una tarea va del comienzo de su primer día al final del
 * último; un hito, al comienzo de su día.
 */

import { fechaDeSerie } from '../../engine/modelo/fechas.ts';

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;
const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;

/** Zoom en píxeles por día, de más lejos a más cerca. */
export const ZOOMS = [
  { id: 'anio', etiqueta: 'Años', px: 1 },
  { id: 'trimestre', etiqueta: 'Trimestres', px: 2.5 },
  { id: 'mes', etiqueta: 'Meses', px: 6 },
  { id: 'semana', etiqueta: 'Semanas', px: 14 },
  { id: 'dia', etiqueta: 'Días', px: 28 },
] as const;
export const PX_MIN = 0.4;
export const PX_MAX = 48;

export interface Escala {
  /** Número de serie en x = 0. */
  origen: number;
  /** Píxeles por día. */
  px: number;
}

export const x = (e: Escala, serie: number): number => (serie - e.origen) * e.px;
export const serieEn = (e: Escala, px: number): number => e.origen + px / e.px;

/** Escala que enseña de `inicio` a `fin` (ambos incluidos) en `ancho` píxeles, con un margen. */
export function ajustarTodo(inicio: number, fin: number, ancho: number): Escala {
  const dias = Math.max(1, fin - inicio + 1);
  const margen = Math.max(2, Math.round(dias * 0.03));
  const px = Math.min(PX_MAX, Math.max(PX_MIN, ancho / (dias + 2 * margen)));
  return { origen: inicio - margen, px };
}

export interface Celda {
  x: number;
  ancho: number;
  texto: string;
  /** El día de serie donde empieza. */
  serie: number;
}

function diaSemana(serie: number): number {
  // Por la fecha y no por la serie: así no cuenta el 29/02/1900 que Excel cree que existió.
  const { anio, mes, dia } = fechaDeSerie(serie);
  return new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
}

/** Primer día de un mes como número de serie (sin depender de la época). */
function primeroDeMes(serie: number): number {
  const { dia } = fechaDeSerie(serie);
  return Math.floor(serie) - (dia - 1);
}

function siguienteMes(primero: number): number {
  const { anio, mes } = fechaDeSerie(primero);
  return primero + new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Las unidades de cada nivel según el zoom. */
export function unidades(px: number): { arriba: 'anio' | 'mes'; abajo: 'trimestre' | 'mes' | 'semana' | 'dia' } {
  if (px < 1.8) return { arriba: 'anio', abajo: 'trimestre' };
  if (px < 9) return { arriba: 'anio', abajo: 'mes' };
  if (px < 20) return { arriba: 'mes', abajo: 'semana' };
  return { arriba: 'mes', abajo: 'dia' };
}

/** Las celdas de los dos niveles del encabezado entre `desde` y `hasta` (series). */
export function encabezados(e: Escala, desde: number, hasta: number): { arriba: Celda[]; abajo: Celda[] } {
  const u = unidades(e.px);
  const celdas = (tipo: 'anio' | 'trimestre' | 'mes' | 'semana' | 'dia'): Celda[] => {
    const out: Celda[] = [];
    let s: number;
    if (tipo === 'dia') s = Math.floor(desde);
    else if (tipo === 'semana') s = Math.floor(desde) - ((diaSemana(Math.floor(desde)) + 6) % 7);
    else {
      s = primeroDeMes(desde);
      if (tipo !== 'mes') {
        // Retrocede hasta enero (año) o al primer mes del trimestre.
        while (true) {
          const { mes } = fechaDeSerie(s);
          if (tipo === 'anio' ? mes === 1 : (mes - 1) % 3 === 0) break;
          s = primeroDeMes(s - 1);
        }
      }
    }
    for (let guard = 0; s <= hasta && guard < 5000; guard++) {
      let sig: number;
      let texto: string;
      const f = fechaDeSerie(s);
      if (tipo === 'dia') {
        sig = s + 1;
        texto = e.px >= 20 ? `${DIAS[diaSemana(s)]} ${f.dia}` : String(f.dia);
      } else if (tipo === 'semana') {
        sig = s + 7;
        texto = `${f.dia} ${MESES[f.mes - 1]}`;
      } else if (tipo === 'mes') {
        sig = siguienteMes(s);
        const ancho = (sig - s) * e.px;
        texto = u.arriba === 'mes' ? `${MESES[f.mes - 1]} ${f.anio}` : ancho < 24 ? (MESES[f.mes - 1] as string).charAt(0).toUpperCase() : (MESES[f.mes - 1] as string);
      } else if (tipo === 'trimestre') {
        sig = siguienteMes(siguienteMes(siguienteMes(s)));
        texto = `T${Math.floor((f.mes - 1) / 3) + 1}`;
      } else {
        sig = s;
        for (let k = 0; k < 12; k++) sig = siguienteMes(sig);
        texto = String(f.anio);
      }
      out.push({ x: x(e, s), ancho: (sig - s) * e.px, texto, serie: s });
      s = sig;
    }
    return out;
  };
  return { arriba: celdas(u.arriba), abajo: celdas(u.abajo) };
}

// ------------------------------------------------------------- barras

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface Geometria {
  altoFila: number;
  /** Alto de la barra de una tarea. */
  altoBarra: number;
}

export const GEOMETRIA: Geometria = { altoFila: 24, altoBarra: 12 };

/** Centro vertical de la fila `k`. */
export const centroFila = (g: Geometria, k: number): number => k * g.altoFila + g.altoFila / 2;

/** Rectángulo de la barra (un hito: un cuadrado centrado en su día). */
export function rectBarra(e: Escala, g: Geometria, k: number, inicio: number, fin: number, hito: boolean): Rect {
  const cy = centroFila(g, k);
  if (hito) {
    const t = g.altoBarra;
    return { x: x(e, inicio) - t / 2, y: cy - t / 2, ancho: t, alto: t };
  }
  const x0 = x(e, inicio);
  const ancho = Math.max(2, x(e, fin + 1) - x0);
  return { x: x0, y: cy - g.altoBarra / 2, ancho, alto: g.altoBarra };
}

export type ZonaBarra = 'fin' | 'cuerpo' | 'vincular-inicio' | 'vincular-fin';

/**
 * Bajo el ratón: el borde derecho (cambia la duración), el centro (mueve) o
 * uno de los dos conectores, fuera de la barra a cada lado (crea un vínculo
 * desde el comienzo o desde el fin).
 */
export function zonaBarra(r: Rect, px: number, hito: boolean): ZonaBarra | null {
  if (px < r.x - 14 || px > r.x + r.ancho + 14) return null;
  if (px > r.x + r.ancho + 2) return 'vincular-fin';
  if (px < r.x - 2) return 'vincular-inicio';
  if (!hito && px >= r.x + r.ancho - 5) return 'fin';
  return 'cuerpo';
}

/** El tipo de un vínculo arrastrado (§6.4): del borde de origen y de la mitad de la barra destino donde se suelta. */
export function tipoVinculo(desde: 'inicio' | 'fin', destino: Rect, px: number): TipoFlecha {
  const llegaComienzo = px < destino.x + destino.ancho / 2;
  return desde === 'fin' ? (llegaComienzo ? 'FC' : 'FF') : llegaComienzo ? 'CC' : 'CF';
}

// ------------------------------------------------------------- flechas

export type TipoFlecha = 'FC' | 'CC' | 'FF' | 'CF';
export interface Punto {
  x: number;
  y: number;
}

/** Tramo horizontal que sale de una barra y entra en la otra. */
export const TALON = 8;

/**
 * Los puntos de una flecha de la barra `p` (predecesora) a la `s`
 * (sucesora). Sale del final de `p` (FC, FF) o de su comienzo (CC, CF) con
 * un tramo de `TALON` hacia fuera y entra en el comienzo de `s` (FC, CC) o en
 * su final (FF, CF) desde fuera, de modo que los tramos horizontales nunca
 * pasan por encima de las dos barras. Si no cabe un solo tramo vertical (una
 * FC con desfase negativo, o una sucesora que empieza antes de que termine la
 * predecesora), da la vuelta por el hueco entre las dos filas.
 */
export function rutaFlecha(p: Rect, s: Rect, tipo: TipoFlecha, altoFila: number): Punto[] {
  const saleFin = tipo === 'FC' || tipo === 'FF';
  const entraComienzo = tipo === 'FC' || tipo === 'CC';
  const sx = saleFin ? p.x + p.ancho : p.x;
  const sy = p.y + p.alto / 2;
  const tx = entraComienzo ? s.x : s.x + s.ancho;
  const ty = s.y + s.alto / 2;
  const ds = saleFin ? 1 : -1;
  const dt = entraComienzo ? 1 : -1;
  // Un tramo vertical en x vale si ds·(x − sx) ≥ TALON y dt·(tx − x) ≥ TALON.
  let xv: number | null;
  if (ds === 1 && dt === 1) xv = sx + TALON <= tx - TALON ? sx + TALON : null;
  else if (ds === -1 && dt === -1) xv = sx - TALON >= tx + TALON ? sx - TALON : null;
  else if (ds === -1) xv = Math.min(sx, tx) - TALON;
  else xv = Math.max(sx, tx) + TALON;
  const puntos: Punto[] = xv !== null
    ? [{ x: sx, y: sy }, { x: xv, y: sy }, { x: xv, y: ty }, { x: tx, y: ty }]
    : (() => {
        const yh = sy + (ty >= sy ? 1 : -1) * (altoFila / 2);
        const c1 = sx + ds * TALON;
        const c2 = tx - dt * TALON;
        return [{ x: sx, y: sy }, { x: c1, y: sy }, { x: c1, y: yh }, { x: c2, y: yh }, { x: c2, y: ty }, { x: tx, y: ty }];
      })();
  return simplificar(puntos);
}

/** Quita los puntos repetidos y los que quedan en medio de un tramo recto. */
function simplificar(ps: Punto[]): Punto[] {
  const out: Punto[] = [];
  for (const q of ps) {
    const u = out[out.length - 1];
    if (u && u.x === q.x && u.y === q.y) continue;
    const v = out[out.length - 2];
    if (u && v && ((v.x === u.x && u.x === q.x) || (v.y === u.y && u.y === q.y))) out[out.length - 1] = q;
    else out.push(q);
  }
  return out;
}

/** Hacia dónde apunta la punta: +1 a la derecha, −1 a la izquierda. */
export function sentidoPunta(ps: readonly Punto[]): 1 | -1 {
  const a = ps[ps.length - 2] as Punto;
  const b = ps[ps.length - 1] as Punto;
  return b.x >= a.x ? 1 : -1;
}

/** Distancia de un punto a la flecha (para el tooltip y el clic sobre un vínculo). */
export function distanciaAFlecha(ps: readonly Punto[], q: Punto): number {
  let d = Infinity;
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1] as Punto;
    const b = ps[i] as Punto;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = dx * dx + dy * dy;
    const t = l === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l));
    d = Math.min(d, Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy)));
  }
  return d;
}

/** Filas visibles (con una de margen a cada lado). */
export function filasVisibles(scrollTop: number, alto: number, altoFila: number, n: number): [number, number] {
  const desde = Math.max(0, Math.floor(scrollTop / altoFila) - 1);
  const hasta = Math.min(n - 1, Math.ceil((scrollTop + alto) / altoFila) + 1);
  return [desde, hasta];
}

// ------------------------------------------------------------- impresión (G3, prueba 9)

/** Papeles en milímetros (ancho × alto en vertical). */
export const PAPELES = { A4: [210, 297], A3: [297, 420], Carta: [215.9, 279.4], Oficio: [215.9, 355.6] } as const;
export type Papel = keyof typeof PAPELES;
export const MARGEN_MM = 10;
const PX_POR_MM = 96 / 25.4;

/** El área útil de una página en píxeles CSS (96 por pulgada), descontados los márgenes. */
export function areaPagina(papel: Papel, horizontal: boolean): { ancho: number; alto: number } {
  const [a, b] = PAPELES[papel];
  const [w, h] = horizontal ? [b, a] : [a, b];
  return { ancho: Math.floor((w - 2 * MARGEN_MM) * PX_POR_MM), alto: Math.floor((h - 2 * MARGEN_MM) * PX_POR_MM) };
}

export interface Pagina {
  numero: number;
  /** Filas de la página: [desde, hasta). */
  desde: number;
  hasta: number;
}

/**
 * Reparte `n` filas en páginas: en cada una caben el encabezado de la página,
 * la escala de tiempo (que se repite) y el pie; lo demás, filas enteras. La
 * leyenda va en el pie de la última, que por eso puede llevar menos filas.
 */
export function paginar(n: number, altoUtil: number, partes: { encabezado: number; escala: number; pie: number; leyenda: number; fila: number }): Pagina[] {
  const porPagina = Math.max(1, Math.floor((altoUtil - partes.encabezado - partes.escala - partes.pie) / partes.fila));
  const enUltima = Math.max(1, Math.floor((altoUtil - partes.encabezado - partes.escala - partes.pie - partes.leyenda) / partes.fila));
  const paginas: Pagina[] = [];
  let desde = 0;
  while (desde < n || paginas.length === 0) {
    const queda = n - desde;
    // Si lo que queda cabe con la leyenda, es la última; si no, una página llena.
    const cuantas = queda <= enUltima ? queda : Math.min(queda, porPagina);
    paginas.push({ numero: paginas.length + 1, desde, hasta: desde + cuantas });
    desde += cuantas;
    if (cuantas === 0) break;
  }
  // La última no tiene sitio para la leyenda: se añade una página solo con ella.
  const ultima = paginas[paginas.length - 1] as Pagina;
  if (ultima.hasta - ultima.desde > enUltima) paginas.push({ numero: paginas.length + 1, desde: n, hasta: n });
  return paginas;
}
