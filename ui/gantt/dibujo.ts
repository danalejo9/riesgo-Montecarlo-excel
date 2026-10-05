/**
 * Dibuja la línea de tiempo del Gantt en un Canvas (G1): encabezado de dos
 * niveles, días no laborables, líneas de hoy, inicio, fin y meta, barras de
 * tarea, hito y resumen con sus colores (crítica, casi crítica, holgura
 * negativa), línea de holgura, fecha límite, restricciones, rango QRSA y
 * flechas. Solo las filas visibles; las flechas, si cruzan lo visible.
 * Devuelve las flechas dibujadas (en píxeles de pantalla) para el ratón.
 */

import type { FilaGantt, VistaGantt } from '../../excel/gantt.ts';
import {
  centroFila, encabezados, filasVisibles, rectBarra, rutaFlecha, sentidoPunta, x as xDe, type Escala, type Geometria, type Punto, type Rect,
} from './trazado.ts';

export const COLORES = {
  fondo: '#FFFFFF',
  encabezado: '#F3F3F3',
  borde: '#D4D4D4',
  texto: '#262626',
  tenue: '#7F7F7F',
  noLaborable: '#F2F2F2',
  seleccion: '#DDEBF7',
  tarea: '#4472C4',
  tareaBorde: '#2F5597',
  critica: '#C00000',
  casiCritica: '#ED7D31',
  negativa: '#7B0000',
  resumen: '#262626',
  holgura: '#7F7F7F',
  flecha: '#8C8C8C',
  flechaImpulsora: '#C00000',
  flechaResaltada: '#1F4E79',
  hoy: '#00B050',
  limites: '#7F7F7F',
  meta: '#7030A0',
  limite: '#2E75B6',
  restriccion: '#7030A0',
  qrsa: '#404040',
  avance: 'rgba(0,0,0,0.38)',
  lineaBase: '#A6A6A6',
  corte: '#C55A11',
} as const;

/** G3: un color por ruta de holgura (la 1, roja como la crítica). */
export const COLORES_RUTA = ['#C00000', '#ED7D31', '#FFC000', '#70AD47', '#00B0F0', '#7030A0', '#FF66CC', '#8C6D31', '#2F75B5', '#548235'] as const;

/** G3: mapa de calor de la criticidad QRSA: del azul (nunca crítica) al rojo (siempre). */
export function colorCalor(criticidad: number): string {
  const t = Math.max(0, Math.min(1, criticidad));
  const a = [68, 114, 196];
  const b = [255, 192, 0];
  const c = [192, 0, 0];
  const [x, y, u] = t < 0.5 ? [a, b, t / 0.5] : [b, c, (t - 0.5) / 0.5];
  return `rgb(${x.map((v, i) => Math.round(v + ((y[i] as number) - v) * u)).join(',')})`;
}

export interface Resaltado {
  actividades: Set<string>;
  relaciones: Set<number>;
}

export interface ArrastreGantt {
  tipo: 'fin' | 'cuerpo' | 'vincular';
  id: string;
  /** Duración: el nuevo último día; mover: el nuevo primer día. */
  serie?: number;
  /** Vincular: desde qué borde y dónde está el ratón (pantalla). */
  desde?: 'inicio' | 'fin';
  raton?: Punto;
}

export interface EscenaGantt {
  vista: VistaGantt;
  /** Las filas que se ven (con filtro y resúmenes plegados), en orden. */
  filas: readonly FilaGantt[];
  indiceFila: ReadonlyMap<string, number>;
  escala: Escala;
  g: Geometria;
  ancho: number;
  alto: number;
  scrollLeft: number;
  scrollTop: number;
  altoEncabezado: number;
  seleccion: string | null;
  relacionSeleccionada: number | null;
  resaltado: Resaltado | null;
  hoy: number;
  capas: { flechas: boolean; holgura: boolean; qrsa: boolean; etiquetas: boolean; rutas?: boolean; calor?: boolean };
  arrastre?: ArrastreGantt | null;
}

export interface FlechaDibujada {
  relacion: number;
  puntos: Punto[];
}

/** El rectángulo de una fila en coordenadas de pantalla (sin la barra de desplazamiento). */
export function rectEnPantalla(e: EscenaGantt, k: number, f: FilaGantt): Rect {
  const r = rectBarra(e.escala, e.g, k, f.inicio, f.fin, f.tipo === 'hito');
  return { ...r, x: r.x - e.scrollLeft, y: r.y + e.altoEncabezado - e.scrollTop };
}

export function dibujar(ctx: CanvasRenderingContext2D, e: EscenaGantt): FlechaDibujada[] {
  const { escala, g, ancho, alto, altoEncabezado: AE } = e;
  const X = (s: number) => xDe(escala, s) - e.scrollLeft;
  const Y = (k: number) => k * g.altoFila + AE - e.scrollTop;
  const desde = escala.origen + e.scrollLeft / escala.px - 1;
  const hasta = escala.origen + (e.scrollLeft + ancho) / escala.px + 1;
  ctx.save();
  ctx.fillStyle = COLORES.fondo;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.font = '11px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // Cuerpo recortado bajo el encabezado.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, AE, ancho, alto - AE);
  ctx.clip();

  // Días no laborables (con zoom suficiente para verlos).
  if (escala.px >= 3) {
    ctx.fillStyle = COLORES.noLaborable;
    for (let s = Math.floor(desde); s <= hasta; s++) if (e.vista.noLaborables.has(s)) ctx.fillRect(X(s), AE, escala.px, alto - AE);
  }
  // Líneas de la escala inferior.
  const enc = encabezados(escala, desde, hasta);
  ctx.strokeStyle = '#EDEDED';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const c of enc.abajo) {
    const x0 = Math.round(c.x - e.scrollLeft) + 0.5;
    ctx.moveTo(x0, AE);
    ctx.lineTo(x0, alto);
  }
  ctx.stroke();

  const [k0, k1] = filasVisibles(e.scrollTop, alto - AE, g.altoFila, e.filas.length);
  // Fila seleccionada.
  const ks = e.seleccion ? e.indiceFila.get(e.seleccion) : undefined;
  if (ks !== undefined) {
    ctx.fillStyle = COLORES.seleccion;
    ctx.fillRect(0, Y(ks), ancho, g.altoFila);
  }

  // Líneas verticales: inicio, fin, meta y hoy.
  const linea = (s: number, color: string, discontinua: boolean) => {
    const x0 = Math.round(X(s)) + 0.5;
    if (x0 < 0 || x0 > ancho) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = discontinua ? 1 : 1.5;
    if (discontinua) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, AE);
    ctx.lineTo(x0, alto);
    ctx.stroke();
    ctx.restore();
  };
  linea(e.vista.inicio, COLORES.limites, true);
  linea(e.vista.fin + 1, COLORES.limites, true);
  if (e.vista.fechaMeta !== null) linea(e.vista.fechaMeta + 1, COLORES.meta, true);
  linea(Math.floor(e.hoy), COLORES.hoy, false);
  // G3: la fecha de corte, gruesa y punteada en naranja (distinta de hoy).
  if (e.vista.fechaCorte !== null) {
    const x0 = Math.round(X(e.vista.fechaCorte + 1)) + 0.5;
    if (x0 >= 0 && x0 <= ancho) {
      ctx.save();
      ctx.strokeStyle = COLORES.corte;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 3, 2, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, AE);
      ctx.lineTo(x0, alto);
      ctx.stroke();
      ctx.restore();
    }
  }

  const atenuada = (id: string) => e.resaltado !== null && !e.resaltado.actividades.has(id);

  // Flechas (debajo de las barras).
  const flechas: FlechaDibujada[] = [];
  if (e.capas.flechas) {
    for (const rel of e.vista.relaciones) {
      const kp = e.indiceFila.get(rel.pred);
      const kq = e.indiceFila.get(rel.suc);
      if (kp === undefined || kq === undefined) continue;
      if (Math.max(kp, kq) < k0 || Math.min(kp, kq) > k1) continue;
      const fp = e.filas[kp] as FilaGantt;
      const fq = e.filas[kq] as FilaGantt;
      const puntos = rutaFlecha(rectEnPantalla(e, kp, fp), rectEnPantalla(e, kq, fq), rel.tipo, g.altoFila);
      const xs = puntos.map((p) => p.x);
      if (Math.max(...xs) < -10 || Math.min(...xs) > ancho + 10) continue;
      const resaltada = e.resaltado?.relaciones.has(rel.indice) === true;
      const seleccionada = e.relacionSeleccionada === rel.indice;
      const critica = rel.impulsora && fp.critica && fq.critica;
      ctx.save();
      ctx.globalAlpha = e.resaltado && !resaltada ? 0.2 : 1;
      const color = seleccionada || resaltada ? COLORES.flechaResaltada : critica ? COLORES.flechaImpulsora : COLORES.flecha;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = seleccionada ? 2.5 : resaltada || critica ? 1.5 : 1;
      ctx.beginPath();
      puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5) : ctx.lineTo(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5)));
      ctx.stroke();
      const fin = puntos[puntos.length - 1] as Punto;
      const d = sentidoPunta(puntos);
      ctx.beginPath();
      ctx.moveTo(fin.x, fin.y);
      ctx.lineTo(fin.x - 5 * d, fin.y - 3.5);
      ctx.lineTo(fin.x - 5 * d, fin.y + 3.5);
      ctx.closePath();
      ctx.fill();
      // Desfase sobre el primer tramo horizontal.
      if (rel.desfase !== 0 && e.capas.etiquetas && escala.px >= 6 && puntos.length >= 2) {
        const a = puntos[0] as Punto;
        ctx.font = '9px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = COLORES.tenue;
        ctx.fillText(`${rel.desfase > 0 ? '+' : '−'}${Math.abs(rel.desfase)}${rel.transcurrido ? 'dc' : 'd'}`, a.x + 2, a.y - 6);
        ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      }
      ctx.restore();
      flechas.push({ relacion: rel.indice, puntos });
    }
  }

  // Barras.
  for (let k = k0; k <= k1; k++) {
    const f = e.filas[k];
    if (!f || !Number.isFinite(f.inicio)) continue;
    const r = rectEnPantalla(e, k, f);
    if (r.x > ancho + 300 || r.x + r.ancho < -300) continue;
    ctx.save();
    if (atenuada(f.id)) ctx.globalAlpha = 0.25;
    const cy = r.y + r.alto / 2;
    const negativa = f.holguraTotal !== null && f.holguraTotal < -1e-9;
    const color = e.capas.calor && f.qrsa ? colorCalor(f.qrsa.criticidad)
      : e.capas.rutas ? (f.rutaHolgura > 0 ? COLORES_RUTA[(f.rutaHolgura - 1) % COLORES_RUTA.length] as string : '#BFBFBF')
        : f.critica ? COLORES.critica : f.casiCritica ? COLORES.casiCritica : COLORES.tarea;

    // G3: la línea base, una barra gris delgada justo debajo (un rombo hueco si es hito).
    if (f.lineaBase && f.tipo !== 'resumen') {
      const lb = f.lineaBase;
      ctx.fillStyle = COLORES.lineaBase;
      if (lb.fin === lb.inicio && f.tipo === 'hito') {
        const c = X(lb.inicio);
        ctx.strokeStyle = COLORES.lineaBase;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(c, r.y + r.alto - 1);
        ctx.lineTo(c + 4, r.y + r.alto + 3);
        ctx.lineTo(c, r.y + r.alto + 7);
        ctx.lineTo(c - 4, r.y + r.alto + 3);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.fillRect(X(lb.inicio), r.y + r.alto + 1, Math.max(2, X(lb.fin + 1) - X(lb.inicio)), 3);
      }
    }

    // Rango QRSA (bigote P10–P90 con marca en P80) sobre el fin.
    if (e.capas.qrsa && f.qrsa && f.tipo !== 'resumen') {
      const a = X(f.qrsa.p10 + 1);
      const b = X(f.qrsa.p90 + 1);
      const p8 = X(f.qrsa.p80 + 1);
      ctx.strokeStyle = COLORES.qrsa;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a, cy);
      ctx.lineTo(b, cy);
      ctx.moveTo(a, cy - 3);
      ctx.lineTo(a, cy + 3);
      ctx.moveTo(b, cy - 3);
      ctx.lineTo(b, cy + 3);
      ctx.stroke();
      ctx.fillStyle = COLORES.qrsa;
      ctx.fillRect(p8 - 1.5, cy - 4, 3, 8);
    }

    if (f.tipo === 'resumen') {
      const h = 6;
      ctx.fillStyle = f.critica ? COLORES.critica : COLORES.resumen;
      ctx.fillRect(r.x, r.y, r.ancho, h);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y + h);
      ctx.lineTo(r.x + 5, r.y + h);
      ctx.lineTo(r.x, r.y + h + 5);
      ctx.closePath();
      ctx.moveTo(r.x + r.ancho, r.y + h);
      ctx.lineTo(r.x + r.ancho - 5, r.y + h);
      ctx.lineTo(r.x + r.ancho, r.y + h + 5);
      ctx.closePath();
      ctx.fill();
    } else if (f.tipo === 'hito') {
      const c = r.x + r.ancho / 2;
      const m = r.alto / 2 + 1;
      ctx.fillStyle = f.critica ? COLORES.critica : COLORES.resumen;
      ctx.beginPath();
      ctx.moveTo(c, cy - m);
      ctx.lineTo(c + m, cy);
      ctx.lineTo(c, cy + m);
      ctx.lineTo(c - m, cy);
      ctx.closePath();
      ctx.fill();
      if (negativa) {
        ctx.strokeStyle = COLORES.negativa;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    } else {
      // Línea de holgura total: del fin temprano al fin tardío.
      if (e.capas.holgura && f.holguraTotal !== null && f.holguraTotal > 1e-9 && f.finTardio > f.fin) {
        ctx.strokeStyle = COLORES.holgura;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(r.x + r.ancho, r.y + r.alto - 1.5);
        ctx.lineTo(X(f.finTardio + 1), r.y + r.alto - 1.5);
        ctx.moveTo(X(f.finTardio + 1), r.y + r.alto - 4);
        ctx.lineTo(X(f.finTardio + 1), r.y + r.alto + 1);
        ctx.stroke();
      }
      ctx.fillStyle = f.estado === 'terminada' ? '#8EA9DB' : color;
      ctx.fillRect(r.x, r.y, r.ancho, r.alto);
      // G3: el avance, una franja oscura dentro de la barra.
      if (f.avance !== null && f.avance > 0) {
        ctx.fillStyle = COLORES.avance;
        ctx.fillRect(r.x, r.y + r.alto * 0.3, r.ancho * Math.min(1, f.avance), r.alto * 0.4);
      }
      if (negativa) {
        // Holgura negativa: rayas y borde oscuro.
        ctx.save();
        ctx.beginPath();
        ctx.rect(r.x, r.y, r.ancho, r.alto);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let xx = r.x - r.alto; xx < r.x + r.ancho; xx += 6) {
          ctx.moveTo(xx, r.y + r.alto);
          ctx.lineTo(xx + r.alto, r.y);
        }
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = COLORES.negativa;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.ancho - 2, r.alto - 2);
      } else {
        ctx.strokeStyle = f.critica || f.casiCritica ? color : COLORES.tareaBorde;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.ancho - 1, r.alto - 1);
      }
    }

    // Restricción: una marca al comienzo o al fin.
    if (f.restriccion && f.fechaRestriccion !== null) {
      const alFin = /terminar/.test(f.restriccion);
      const xm = alFin ? r.x + r.ancho : r.x;
      ctx.fillStyle = COLORES.restriccion;
      ctx.fillRect(xm - 1, r.y - 4, 2, r.alto + 8);
      ctx.fillRect(alFin ? xm - 5 : xm - 1, r.y - 4, 6, 2);
    }
    // Fecha límite: flecha hacia abajo en la fecha.
    if (f.fechaLimite !== null) {
      const xl = X(f.fechaLimite + 1);
      ctx.fillStyle = f.fin > f.fechaLimite ? COLORES.critica : COLORES.limite;
      ctx.beginPath();
      ctx.moveTo(xl - 4, r.y - 6);
      ctx.lineTo(xl + 4, r.y - 6);
      ctx.lineTo(xl, r.y - 1);
      ctx.closePath();
      ctx.fill();
    }
    // Etiqueta a la derecha.
    if (e.capas.etiquetas) {
      let xt = r.x + r.ancho + 6;
      if (e.capas.qrsa && f.qrsa) xt = Math.max(xt, X(f.qrsa.p90 + 1) + 4);
      if (e.capas.holgura && f.holguraTotal !== null && f.holguraTotal > 0 && f.tipo === 'tarea') xt = Math.max(xt, X(f.finTardio + 1) + 4);
      ctx.fillStyle = COLORES.texto;
      ctx.font = f.tipo === 'resumen' ? 'bold 11px "Segoe UI", system-ui, sans-serif' : '11px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(f.nombre, xt, centroFila(g, k) + AE - e.scrollTop);
    }
    ctx.restore();
  }

  // Lo que se está arrastrando.
  const a = e.arrastre;
  if (a) {
    const k = e.indiceFila.get(a.id);
    const f = k === undefined ? undefined : e.filas[k];
    if (f && k !== undefined) {
      const r = rectEnPantalla(e, k, f);
      ctx.save();
      ctx.strokeStyle = COLORES.texto;
      ctx.setLineDash([3, 2]);
      ctx.lineWidth = 1;
      if (a.tipo === 'fin' && a.serie !== undefined) {
        ctx.strokeRect(r.x + 0.5, r.y - 2.5, Math.max(2, X(a.serie + 1) - r.x), r.alto + 4);
      } else if (a.tipo === 'cuerpo' && a.serie !== undefined) {
        ctx.strokeRect(X(a.serie) + 0.5, r.y - 2.5, r.ancho, r.alto + 4);
      } else if (a.tipo === 'vincular' && a.raton) {
        const x0 = a.desde === 'inicio' ? r.x : r.x + r.ancho;
        ctx.beginPath();
        ctx.moveTo(x0, r.y + r.alto / 2);
        ctx.lineTo(a.raton.x, a.raton.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  ctx.restore(); // fin del recorte del cuerpo

  // Encabezado de dos niveles.
  const mitad = AE / 2;
  ctx.fillStyle = COLORES.encabezado;
  ctx.fillRect(0, 0, ancho, AE);
  ctx.strokeStyle = COLORES.borde;
  ctx.lineWidth = 1;
  ctx.fillStyle = COLORES.texto;
  for (const [fila, y0] of [[enc.arriba, 0], [enc.abajo, mitad]] as const) {
    for (const c of fila) {
      const x0 = Math.round(c.x - e.scrollLeft) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0, y0 + mitad);
      ctx.stroke();
      const w = c.ancho;
      if (w < 14) continue;
      // El texto de una celda muy ancha se queda visible al desplazar.
      const xt = Math.max(x0 + 4, Math.min(4, x0 + w - ctx.measureText(c.texto).width - 4));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, mitad);
      ctx.clip();
      ctx.fillText(c.texto, xt, y0 + mitad / 2);
      ctx.restore();
    }
  }
  ctx.beginPath();
  ctx.moveTo(0, mitad + 0.5);
  ctx.lineTo(ancho, mitad + 0.5);
  ctx.moveTo(0, AE - 0.5);
  ctx.lineTo(ancho, AE - 0.5);
  ctx.stroke();
  // Marca de hoy en el encabezado.
  const xh = X(Math.floor(e.hoy));
  if (xh >= 0 && xh <= ancho) {
    ctx.fillStyle = COLORES.hoy;
    ctx.beginPath();
    ctx.moveTo(xh - 4, AE - 6);
    ctx.lineTo(xh + 4, AE - 6);
    ctx.lineTo(xh, AE);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  return flechas;
}
