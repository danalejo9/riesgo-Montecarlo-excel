/**
 * DESREF con desplazamientos constantes (F1): `OFFSET(A1, 2, 1)` es B3, y
 * `OFFSET(A1, 0, 0, 3, 1)` es A1:A3. Con números escritos en todos los
 * argumentos la referencia se conoce antes de calcular, así que se sustituye
 * por esa celda o ese rango y el grafo de dependencias sale exacto. Con
 * desplazamientos calculados sigue siendo no soportada (la referencia cambia
 * en cada iteración): el modelo va al modo compatible, como hasta ahora.
 */
import type { Nodo } from './ast.ts';

function entero(n: Nodo | undefined): number | null {
  if (!n || n.tipo === 'vacio') return null;
  if (n.tipo === 'numero' && Number.isInteger(n.valor)) return n.valor;
  if (n.tipo === 'unaria' && n.arg.tipo === 'numero' && Number.isInteger(n.arg.valor)) return n.op === '-' ? -n.arg.valor : n.arg.valor;
  return null;
}

function desrefConstante(n: Extract<Nodo, { tipo: 'funcion' }>): Nodo | null {
  const [base, filas, cols, alto, ancho] = n.args;
  if (!base || n.args.length < 3 || n.args.length > 5) return null;
  const df = entero(filas);
  const dc = entero(cols);
  if (df === null || dc === null) return null;
  let hoja: string | undefined;
  let f0: number, c0: number, altoBase: number, anchoBase: number;
  if (base.tipo === 'celda') {
    ({ hoja } = base.ref);
    f0 = base.ref.fila; c0 = base.ref.col; altoBase = 1; anchoBase = 1;
  } else if (base.tipo === 'rango' && base.ref.fila1 !== null && base.ref.col1 !== null && base.ref.fila2 !== null && base.ref.col2 !== null) {
    ({ hoja } = base.ref);
    f0 = Math.min(base.ref.fila1, base.ref.fila2); c0 = Math.min(base.ref.col1, base.ref.col2);
    altoBase = Math.abs(base.ref.fila2 - base.ref.fila1) + 1; anchoBase = Math.abs(base.ref.col2 - base.ref.col1) + 1;
  } else return null;
  const a = alto === undefined || alto.tipo === 'vacio' ? altoBase : entero(alto);
  const w = ancho === undefined || ancho.tipo === 'vacio' ? anchoBase : entero(ancho);
  if (a === null || w === null || a < 1 || w < 1) return null;
  const fila = f0 + df;
  const col = c0 + dc;
  if (fila < 1 || col < 1) return { tipo: 'error', valor: '#REF!', pos: n.pos };
  const h = hoja !== undefined ? { hoja } : {};
  if (a === 1 && w === 1) return { tipo: 'celda', ref: { ...h, col, fila }, pos: n.pos };
  return { tipo: 'rango', ref: { ...h, col1: col, fila1: fila, col2: col + w - 1, fila2: fila + a - 1 }, pos: n.pos };
}

/** Sustituye cada DESREF de argumentos constantes por su referencia. */
export function resolverDesrefConstantes(n: Nodo): Nodo {
  switch (n.tipo) {
    case 'funcion': {
      const args = n.args.map(resolverDesrefConstantes);
      const nuevo = { ...n, args };
      if (n.nombre.toUpperCase() === 'OFFSET') return desrefConstante(nuevo) ?? nuevo;
      return nuevo;
    }
    case 'unaria':
    case 'porcentaje':
      return { ...n, arg: resolverDesrefConstantes(n.arg) };
    case 'binaria':
      return { ...n, izq: resolverDesrefConstantes(n.izq), der: resolverDesrefConstantes(n.der) };
    case 'matriz':
      return { ...n, filas: n.filas.map((f) => f.map(resolverDesrefConstantes)) };
    default:
      return n;
  }
}
