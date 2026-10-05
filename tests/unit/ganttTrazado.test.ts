/** Gantt, trazado (G1): escala, encabezados y flechas de los cuatro tipos (prueba 2 de la especificación). */
import { describe, expect, it } from 'vitest';
import {
  ajustarTodo, distanciaAFlecha, encabezados, filasVisibles, GEOMETRIA, rectBarra, rutaFlecha, sentidoPunta, TALON, unidades, x,
  zonaBarra, type Punto, type Rect,
} from '../../ui/gantt/trazado.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const e = { origen: serieDeFecha(2027, 1, 1), px: 10 };
const g = GEOMETRIA;
// Predecesora en la fila 0 del 04/01 al 08/01; sucesora en la fila 2.
const P = rectBarra(e, g, 0, serieDeFecha(2027, 1, 4), serieDeFecha(2027, 1, 8), false);
const barra = (k: number, d1: number, d2: number) => rectBarra(e, g, k, serieDeFecha(2027, 1, d1), serieDeFecha(2027, 1, d2), false);
const ortogonal = (ps: Punto[]) => ps.every((q, i) => i === 0 || q.x === ps[i - 1]!.x || q.y === ps[i - 1]!.y);
/** Ningún tramo horizontal pasa por dentro de la barra (excepto tocando su borde). */
const noCruza = (ps: Punto[], r: Rect) => ps.every((q, i) => {
  if (i === 0) return true;
  const a = ps[i - 1]!;
  if (a.y !== q.y || q.y < r.y || q.y > r.y + r.alto) return true;
  const [x1, x2] = [Math.min(a.x, q.x), Math.max(a.x, q.x)];
  return x2 <= r.x + 0.01 || x1 >= r.x + r.ancho - 0.01;
});

describe('escala y encabezados', () => {
  it('cada día ocupa px; una tarea va de su primer día al final del último', () => {
    expect(x(e, e.origen + 3)).toBe(30);
    expect(P.x).toBe(30);
    expect(P.ancho).toBe(50);
    const h = rectBarra(e, g, 1, serieDeFecha(2027, 1, 4), serieDeFecha(2027, 1, 4), true);
    expect(h.x + h.ancho / 2).toBe(30);
  });
  it('ajustar todo cabe en el ancho', () => {
    const a = ajustarTodo(serieDeFecha(2027, 1, 4), serieDeFecha(2027, 11, 22), 1000);
    expect(x(a, serieDeFecha(2027, 1, 4))).toBeGreaterThan(0);
    expect(x(a, serieDeFecha(2027, 11, 23))).toBeLessThan(1000);
  });
  it('dos niveles según el zoom', () => {
    expect(unidades(1)).toEqual({ arriba: 'anio', abajo: 'trimestre' });
    expect(unidades(28)).toEqual({ arriba: 'mes', abajo: 'dia' });
    const m = encabezados({ origen: serieDeFecha(2027, 1, 15), px: 4 }, serieDeFecha(2027, 1, 15), serieDeFecha(2027, 4, 10));
    expect(m.abajo.map((c) => c.texto)).toEqual(['ene', 'feb', 'mar', 'abr']);
    expect(m.abajo[1]!.ancho).toBe(28 * 4);
    expect(m.arriba.map((c) => c.texto)).toEqual(['2027']);
    const s = encabezados({ origen: 0, px: 14 }, serieDeFecha(2027, 1, 6), serieDeFecha(2027, 1, 20));
    expect(s.abajo[0]!.serie).toBe(serieDeFecha(2027, 1, 4)); // lunes
    expect(s.abajo[0]!.texto).toBe('4 ene');
    const d = encabezados({ origen: 0, px: 28 }, serieDeFecha(2027, 1, 4), serieDeFecha(2027, 1, 5));
    expect(d.abajo.map((c) => c.texto)).toEqual(['L 4', 'M 5']);
  });
});

describe('flechas (prueba 2)', () => {
  it('FC: del final de la predecesora al comienzo de la sucesora, entrando por la izquierda', () => {
    const S = barra(2, 12, 15);
    const ps = rutaFlecha(P, S, 'FC', g.altoFila);
    expect(ps[0]).toEqual({ x: P.x + P.ancho, y: P.y + P.alto / 2 });
    expect(ps[ps.length - 1]).toEqual({ x: S.x, y: S.y + S.alto / 2 });
    expect(ps).toHaveLength(4);
    expect(sentidoPunta(ps)).toBe(1);
    expect(ortogonal(ps) && noCruza(ps, P) && noCruza(ps, S)).toBe(true);
  });
  it('FC con desfase negativo (la sucesora empieza antes): da la vuelta por el hueco entre filas', () => {
    const S = barra(2, 6, 10);
    const ps = rutaFlecha(P, S, 'FC', g.altoFila);
    expect(ps).toHaveLength(6);
    expect(ps[2]!.y).toBe(g.altoFila); // el borde entre la fila 0 y la 1
    expect(ps[ps.length - 1]).toEqual({ x: S.x, y: S.y + S.alto / 2 });
    expect(sentidoPunta(ps)).toBe(1);
    expect(ortogonal(ps) && noCruza(ps, P) && noCruza(ps, S)).toBe(true);
  });
  it('CC: de comienzo a comienzo, por la izquierda de las dos', () => {
    const S = barra(1, 6, 10);
    const ps = rutaFlecha(P, S, 'CC', g.altoFila);
    expect(ps[0]!.x).toBe(P.x);
    expect(ps[1]!.x).toBe(Math.min(P.x, S.x) - TALON);
    expect(ps[ps.length - 1]).toEqual({ x: S.x, y: S.y + S.alto / 2 });
    expect(sentidoPunta(ps)).toBe(1);
  });
  it('FF: de final a final, por la derecha, entrando hacia la izquierda', () => {
    const S = barra(1, 5, 12);
    const ps = rutaFlecha(P, S, 'FF', g.altoFila);
    expect(ps[0]!.x).toBe(P.x + P.ancho);
    expect(ps[1]!.x).toBe(S.x + S.ancho + TALON);
    expect(ps[ps.length - 1]!.x).toBe(S.x + S.ancho);
    expect(sentidoPunta(ps)).toBe(-1);
  });
  it('CF: del comienzo al final; si la sucesora termina antes, da la vuelta', () => {
    const antes = barra(3, 1, 1);
    const ps = rutaFlecha(P, antes, 'CF', g.altoFila);
    expect(ps[0]!.x).toBe(P.x);
    expect(ps[ps.length - 1]!.x).toBe(antes.x + antes.ancho);
    expect(ps).toHaveLength(4);
    expect(sentidoPunta(ps)).toBe(-1);
    const despues = barra(3, 6, 20);
    const ps2 = rutaFlecha(P, despues, 'CF', g.altoFila);
    expect(ps2).toHaveLength(6);
    expect(sentidoPunta(ps2)).toBe(-1);
    expect(ortogonal(ps2) && noCruza(ps2, P) && noCruza(ps2, despues)).toBe(true);
  });
  it('hacia arriba también (sucesora en una fila anterior)', () => {
    const S = rectBarra(e, g, 0, serieDeFecha(2027, 1, 2), serieDeFecha(2027, 1, 3), false);
    const Pb = barra(3, 4, 8);
    const ps = rutaFlecha(Pb, S, 'FC', g.altoFila);
    expect(ps[2]!.y).toBe(3 * g.altoFila);
    expect(ps[ps.length - 1]!.y).toBe(S.y + S.alto / 2);
  });
});

describe('interacción', () => {
  it('zonas de una barra, distancia a una flecha y filas visibles', () => {
    expect(zonaBarra(P, P.x + 10, false)).toBe('cuerpo');
    expect(zonaBarra(P, P.x + P.ancho - 2, false)).toBe('fin');
    expect(zonaBarra(P, P.x + P.ancho + 8, false)).toBe('vincular');
    expect(zonaBarra(P, P.x - 20, false)).toBeNull();
    const ps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(distanciaAFlecha(ps, { x: 5, y: 3 })).toBe(3);
    expect(filasVisibles(240, 100, 24, 1000)).toEqual([9, 16]);
    expect(filasVisibles(0, 100, 24, 3)).toEqual([0, 2]);
  });
});
