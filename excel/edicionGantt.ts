/**
 * Edición desde el Gantt (G2), sin Office.js. Las hojas siguen siendo la
 * verdad (decisión 2): cada edición se traduce en **cambios** sobre las hojas
 * —escribir una celda, insertar o borrar una fila— que el panel aplica en
 * Excel tal cual (así se conservan las fórmulas, los formatos y las listas de
 * las demás celdas) y que se pueden invertir para deshacer.
 *
 * Antes de aceptar una edición se vuelve a leer el libro con los cambios:
 * si aparece un error nuevo (un ciclo, una predecesora que no existe, una
 * fecha inválida), la edición se rechaza con ese mensaje y no se escribe nada.
 */

import { compilarRed, ErrorRed, leerPredecesoras, nivelDeWbs, padres, type TipoRelacion, type TipoRestriccion } from '../engine/cronograma/index.ts';
import { COLUMNAS, HOJAS_CRONOGRAMA, LISTAS, leerCronograma, normalizar, type LecturaCronograma, type MatrizHoja } from './cronogramaHojas.ts';

const H = HOJAS_CRONOGRAMA;
const NOMBRE_RESTRICCION: Record<TipoRestriccion, string> = {
  SNET: LISTAS.restriccion[0], FNET: LISTAS.restriccion[1], SNLT: LISTAS.restriccion[2], FNLT: LISTAS.restriccion[3], MSO: LISTAS.restriccion[4], MFO: LISTAS.restriccion[5],
};

/** Un cambio sobre una hoja; `fila` y `col` empiezan en 0 (la fila 0 es el encabezado). */
export type CambioHoja =
  | { hoja: string; op: 'celda'; fila: number; col: number; valor: unknown; antes: unknown }
  | { hoja: string; op: 'insertar'; fila: number; valores: unknown[] }
  | { hoja: string; op: 'borrar'; fila: number; antes: unknown[] };

export type OperacionGantt =
  | { op: 'campo'; id: string; campo: 'nombre' | 'duracion' | 'calendario' | 'fechaLimite'; valor: string | number | null }
  | { op: 'restriccion'; id: string; tipo: TipoRestriccion | null; fecha: number | null }
  | { op: 'predecesoras'; id: string; texto: string }
  | { op: 'vinculo'; accion: 'crear' | 'editar'; pred: string; suc: string; tipo: TipoRelacion; desfase: number; transcurrido?: boolean }
  | { op: 'vinculo'; accion: 'borrar'; pred: string; suc: string }
  | { op: 'insertar'; despuesDe: string | null; tipo: 'tarea' | 'hito' }
  | { op: 'borrar'; id: string }
  | { op: 'nivel'; id: string; delta: 1 | -1 }
  | { op: 'hito'; id: string }
  | { op: 'mover'; id: string; delta: 1 | -1 };

export type ResultadoEdicion =
  | { ok: true; cambios: CambioHoja[]; hojas: Record<string, MatrizHoja | undefined>; lectura: LecturaCronograma; descripcion: string; seleccion?: string }
  | { ok: false; error: string };

type Libro = Record<string, unknown[][]>;

/** Aplica los cambios a una copia de las hojas (los mismos que hará Excel). */
export function aplicarCambios(hojas: Readonly<Record<string, MatrizHoja | undefined>>, cambios: readonly CambioHoja[]): Record<string, MatrizHoja | undefined> {
  const out: Record<string, MatrizHoja | undefined> = { ...hojas };
  const copiadas = new Set<string>();
  for (const c of cambios) {
    if (!copiadas.has(c.hoja)) {
      out[c.hoja] = (hojas[c.hoja] ?? []).map((f) => [...f]);
      copiadas.add(c.hoja);
    }
    const m = out[c.hoja] as unknown[][];
    if (c.op === 'celda') {
      while (m.length <= c.fila) m.push([]);
      (m[c.fila] as unknown[])[c.col] = c.valor;
    } else if (c.op === 'insertar') {
      while (m.length < c.fila) m.push([]);
      m.splice(c.fila, 0, [...c.valores]);
    } else {
      m.splice(c.fila, 1);
    }
  }
  return out;
}

/** Los cambios que deshacen otros (en orden inverso). */
export function invertirCambios(cambios: readonly CambioHoja[]): CambioHoja[] {
  return [...cambios].reverse().map((c): CambioHoja => {
    if (c.op === 'celda') return { ...c, valor: c.antes, antes: c.valor };
    if (c.op === 'insertar') return { hoja: c.hoja, op: 'borrar', fila: c.fila, antes: c.valores };
    return { hoja: c.hoja, op: 'insertar', fila: c.fila, valores: c.antes };
  });
}

/** Registra los cambios mientras edita una copia de las hojas. */
class Editor {
  readonly libro: Libro;
  readonly cambios: CambioHoja[] = [];
  constructor(hojas: Readonly<Record<string, MatrizHoja | undefined>>) {
    this.libro = Object.fromEntries(Object.entries(hojas).filter(([, m]) => m).map(([k, m]) => [k, (m as MatrizHoja).map((f) => [...f])]));
  }
  hoja(nombre: string): unknown[][] {
    return (this.libro[nombre] ??= []);
  }
  celda(hoja: string, fila: number, col: number, valor: unknown): void {
    const m = this.hoja(hoja);
    const antes = m[fila]?.[col] ?? null;
    const v = valor === '' || valor === undefined ? null : valor;
    if (antes === v || (vacio(antes) && vacio(v))) return;
    while (m.length <= fila) m.push([]);
    (m[fila] as unknown[])[col] = v;
    this.cambios.push({ hoja, op: 'celda', fila, col, valor: v, antes });
  }
  insertar(hoja: string, fila: number, valores: unknown[]): void {
    const m = this.hoja(hoja);
    while (m.length < fila) m.push([]);
    m.splice(fila, 0, [...valores]);
    this.cambios.push({ hoja, op: 'insertar', fila, valores: [...valores] });
  }
  borrar(hoja: string, fila: number): void {
    const m = this.hoja(hoja);
    const antes = [...(m[fila] ?? [])];
    m.splice(fila, 1);
    this.cambios.push({ hoja, op: 'borrar', fila, antes });
  }
  /** Columna por su encabezado (como la lectura: exacto o que empiece igual); la crea al final si falta. */
  col(hoja: string, nombre: string, crear = true): number {
    const m = this.hoja(hoja);
    const enc = m[0] ?? [];
    const ne = normalizar(nombre);
    const corta = ne.split(' (')[0] as string;
    let c = enc.findIndex((h) => normalizar(h) === ne);
    if (c < 0) c = enc.findIndex((h) => !vacio(h) && normalizar(h).startsWith(corta));
    if (c >= 0 || !crear) return c;
    let fin = 0;
    while (fin < enc.length && !vacio(enc[fin])) fin++;
    this.celda(hoja, 0, fin, nombre);
    return fin;
  }
  /** La fila (índice) de una actividad por su ID, o −1. */
  filaDe(id: string): number {
    const m = this.hoja(H.actividades);
    const c = this.col(H.actividades, 'ID', false);
    const n = normalizar(id);
    for (let f = 1; f < m.length; f++) if (normalizar(m[f]?.[c]) === n) return f;
    return -1;
  }
}

function vacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

const texto = (v: unknown) => (vacio(v) ? '' : String(v).trim());

/** Aplica una operación, valida el libro resultante y devuelve los cambios. */
export function aplicarOperacion(hojas: Readonly<Record<string, MatrizHoja | undefined>>, op: OperacionGantt): ResultadoEdicion {
  if (!hojas[H.actividades]) return { ok: false, error: `Falta la hoja «${H.actividades}».` };
  const e = new Editor(hojas);
  const A = H.actividades;
  const R = H.relaciones;
  const cA = (n: string) => e.col(A, n);
  let descripcion = '';
  let seleccion: string | undefined;
  const fila = 'id' in op ? e.filaDe(op.id) : -1;
  if ('id' in op && fila < 0) return { ok: false, error: `La actividad «${op.id}» no está en la hoja ${A}.` };
  const tipoDe = (f: number) => normalizar(e.hoja(A)[f]?.[cA('Tipo')]);

  switch (op.op) {
    case 'campo': {
      if (op.campo === 'nombre') {
        if (!texto(op.valor)) return { ok: false, error: 'El nombre no puede quedar vacío.' };
        e.celda(A, fila, cA('Nombre'), texto(op.valor));
      } else if (op.campo === 'duracion') {
        if (tipoDe(fila).startsWith('resumen')) return { ok: false, error: 'La duración de un resumen sale de sus hijas: edite las de ellas.' };
        const d = typeof op.valor === 'number' ? op.valor : Number(String(op.valor ?? '').replace(',', '.'));
        if (!Number.isFinite(d) || d < 0) return { ok: false, error: 'La duración tiene que ser un número mayor o igual que 0.' };
        e.celda(A, fila, cA('Duración (días)'), d);
        // Duración 0 es un hito; un hito con duración pasa a tarea.
        if (d === 0) e.celda(A, fila, cA('Tipo'), 'Hito');
        else if (tipoDe(fila).startsWith('hito')) e.celda(A, fila, cA('Tipo'), 'Tarea');
      } else if (op.campo === 'calendario') {
        e.celda(A, fila, cA('Calendario'), texto(op.valor) || null);
      } else {
        e.celda(A, fila, cA('Fecha límite'), op.valor === null || op.valor === '' ? null : op.valor);
      }
      descripcion = `${etiquetaCampo(op.campo)} de ${op.id}`;
      break;
    }
    case 'restriccion': {
      if (op.tipo !== null && op.fecha === null) return { ok: false, error: 'La restricción necesita una fecha.' };
      e.celda(A, fila, cA('Restricción'), op.tipo ? NOMBRE_RESTRICCION[op.tipo] : null);
      e.celda(A, fila, cA('Fecha de la restricción'), op.tipo ? op.fecha : null);
      descripcion = op.tipo ? `«${NOMBRE_RESTRICCION[op.tipo]}» en ${op.id}` : `Quitar la restricción de ${op.id}`;
      break;
    }
    case 'predecesoras': {
      const l = leerPredecesoras(op.texto);
      if (!l.ok) return { ok: false, error: l.error };
      const actuales = filasRelacion(e, (_p, s) => normalizar(s) === normalizar(op.id));
      // Se reescriben en las mismas filas y lo que sobra se borra o se añade.
      const nuevas = l.predecesoras;
      for (let k = 0; k < Math.max(actuales.length, nuevas.length); k++) {
        const p = nuevas[k];
        if (k < actuales.length && p) escribirRelacion(e, actuales[k] as number, p.id, op.id, p.tipo, p.desfase, p.transcurrido === true);
        else if (p) escribirRelacion(e, null, p.id, op.id, p.tipo, p.desfase, p.transcurrido === true);
      }
      for (const f of actuales.slice(nuevas.length).reverse()) e.borrar(R, f);
      descripcion = `Predecesoras de ${op.id}`;
      break;
    }
    case 'vinculo': {
      if (normalizar(op.pred) === normalizar(op.suc)) return { ok: false, error: 'Una actividad no puede vincularse consigo misma.' };
      for (const id of [op.pred, op.suc]) if (e.filaDe(id) < 0) return { ok: false, error: `La actividad «${id}» no existe.` };
      const misma = filasRelacion(e, (p, s) => normalizar(p) === normalizar(op.pred) && normalizar(s) === normalizar(op.suc));
      if (op.accion === 'crear') {
        if (misma.length) return { ok: false, error: `Ya existe un vínculo de ${op.pred} a ${op.suc}: edítelo en lugar de crear otro.` };
        escribirRelacion(e, null, op.pred, op.suc, op.tipo, op.desfase, op.transcurrido === true);
        descripcion = `Vínculo ${op.pred} → ${op.suc}`;
      } else if (op.accion === 'editar') {
        if (!misma.length) return { ok: false, error: `No hay un vínculo de ${op.pred} a ${op.suc}.` };
        escribirRelacion(e, misma[0] as number, op.pred, op.suc, op.tipo, op.desfase, op.transcurrido === true);
        descripcion = `Vínculo ${op.pred} → ${op.suc}`;
      } else {
        if (!misma.length) return { ok: false, error: `No hay un vínculo de ${op.pred} a ${op.suc}.` };
        for (const f of [...misma].reverse()) e.borrar(R, f);
        descripcion = `Borrar el vínculo ${op.pred} → ${op.suc}`;
      }
      break;
    }
    case 'insertar': {
      const m = e.hoja(A);
      const cid = cA('ID');
      const ids = new Set(m.slice(1).map((f) => normalizar(f?.[cid])));
      let k = 1;
      while (ids.has(normalizar(`N${k}`))) k++;
      const id = `N${k}`;
      const despues = op.despuesDe === null ? ultimaFila(m) : e.filaDe(op.despuesDe);
      if (despues < 0) return { ok: false, error: `La actividad «${op.despuesDe}» no existe.` };
      // Con el nivel de la de arriba (si es un resumen, como su primera hija).
      const wbsArriba = texto(m[despues]?.[cA('WBS')]);
      const nivel = despues === 0 ? 1 : nivelDeWbs(wbsArriba) + (normalizar(m[despues]?.[cA('Tipo')]).startsWith('resumen') ? 1 : 0);
      const valores: unknown[] = [];
      valores[cid] = id;
      valores[cA('Nombre')] = op.tipo === 'hito' ? 'Nuevo hito' : 'Nueva actividad';
      valores[cA('Tipo')] = op.tipo === 'hito' ? 'Hito' : 'Tarea';
      valores[cA('Duración (días)')] = op.tipo === 'hito' ? 0 : 5;
      e.insertar(A, despues + 1, valores);
      renumerar(e, new Map([[despues + 1, nivel]]));
      descripcion = `Insertar ${id}`;
      seleccion = id;
      break;
    }
    case 'borrar': {
      const id = op.id;
      for (const f of filasRelacion(e, (p, s) => normalizar(p) === normalizar(id) || normalizar(s) === normalizar(id)).reverse()) e.borrar(R, f);
      // Lo que cuelga de ella en las demás hojas (también se recupera al deshacer).
      const colgantes = [[H.incertidumbre, ['Actividad o grupo']], [H.impactos, ['Actividad']], [H.correlaciones, ['Elemento A', 'Elemento B']]] as const;
      for (const [hoja, cols] of colgantes) {
        const m = e.libro[hoja];
        if (!m) continue;
        const cs = cols.map((c) => e.col(hoja, c, false)).filter((c) => c >= 0);
        for (let f = m.length - 1; f >= 1; f--) if (cs.some((c) => normalizar(m[f]?.[c]) === normalizar(id))) e.borrar(hoja, f);
      }
      // Sus partidas de costo no se pierden: pasan a todo el proyecto.
      let partidas = 0;
      const mc = e.libro[H.costos];
      const cc = mc ? e.col(H.costos, 'Actividad', false) : -1;
      if (mc && cc >= 0) {
        for (let f = 1; f < mc.length; f++) if (normalizar(mc[f]?.[cc]) === normalizar(id)) { e.celda(H.costos, f, cc, null); partidas++; }
      }
      // Y se quita de las listas (miembros de un grupo de correlación, actividades de una rama).
      for (const [hoja, col] of [[H.correlaciones, 'Miembros'], [H.ramas, 'Actividades']] as const) {
        const m = e.libro[hoja];
        const c = m ? e.col(hoja, col, false) : -1;
        if (!m || c < 0) continue;
        for (let f = 1; f < m.length; f++) {
          const partes = texto(m[f]?.[c]).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
          const quedan = partes.filter((x) => normalizar(x) !== normalizar(id));
          if (quedan.length !== partes.length) e.celda(hoja, f, c, quedan.join(', ') || null);
        }
      }
      e.borrar(A, e.filaDe(id));
      renumerar(e);
      descripcion = `Borrar ${id}${partidas ? ` (sus ${partidas === 1 ? 'partida de costo pasa' : `${partidas} partidas de costo pasan`} a todo el proyecto)` : ''}`;
      break;
    }
    case 'nivel': {
      const nivel = nivelDeWbs(texto(e.hoja(A)[fila]?.[cA('WBS')])) + op.delta;
      if (nivel < 1) return { ok: false, error: `${op.id} ya está en el primer nivel.` };
      renumerar(e, new Map([[fila, nivel]]));
      descripcion = op.delta > 0 ? `Aumentar la sangría de ${op.id}` : `Reducir la sangría de ${op.id}`;
      break;
    }
    case 'hito': {
      if (tipoDe(fila).startsWith('resumen')) return { ok: false, error: 'Un resumen no puede ser un hito.' };
      const esHito = tipoDe(fila).startsWith('hito');
      e.celda(A, fila, cA('Tipo'), esHito ? 'Tarea' : 'Hito');
      e.celda(A, fila, cA('Duración (días)'), esHito ? 1 : 0);
      descripcion = esHito ? `${op.id} pasa a tarea` : `${op.id} pasa a hito`;
      break;
    }
    case 'mover': {
      const m = e.hoja(A);
      const destino = fila + op.delta;
      if (destino < 1 || destino > ultimaFila(m)) return { ok: false, error: 'No se puede mover más allá.' };
      const filaValores = [...(m[fila] ?? [])];
      e.borrar(A, fila);
      e.insertar(A, destino, filaValores);
      renumerar(e);
      descripcion = `Mover ${op.id}`;
      seleccion = op.id;
      break;
    }
  }

  if (e.cambios.length === 0) return { ok: false, error: 'No cambia nada.' };
  const nuevas = e.libro as Record<string, MatrizHoja | undefined>;
  const antes = leerCronograma(hojas);
  const despues = leerCronograma(nuevas);
  const conocidos = new Set(antes.errores.map((x) => x.mensaje));
  const nuevo = despues.errores.find((x) => !conocidos.has(x.mensaje));
  if (nuevo) return { ok: false, error: nuevo.mensaje };
  if (despues.modelo) {
    try {
      compilarRed(despues.modelo.red);
    } catch (err) {
      if (err instanceof ErrorRed) return { ok: false, error: err.message };
      throw err;
    }
  }
  return { ok: true, cambios: e.cambios, hojas: nuevas, lectura: despues, descripcion, ...(seleccion ? { seleccion } : {}) };
}

function etiquetaCampo(c: 'nombre' | 'duracion' | 'calendario' | 'fechaLimite'): string {
  return c === 'nombre' ? 'Nombre' : c === 'duracion' ? 'Duración' : c === 'calendario' ? 'Calendario' : 'Fecha límite';
}

function ultimaFila(m: unknown[][]): number {
  let f = m.length - 1;
  while (f > 0 && (m[f] ?? []).every(vacio)) f--;
  return f;
}

/** Filas de Relaciones (índices) que cumplen la condición. */
function filasRelacion(e: Editor, si: (pred: string, suc: string) => boolean): number[] {
  const m = e.libro[H.relaciones];
  if (!m) return [];
  const cp = e.col(H.relaciones, 'Predecesora', false);
  const cs = e.col(H.relaciones, 'Sucesora', false);
  const out: number[] = [];
  for (let f = 1; f < m.length; f++) {
    const p = texto(m[f]?.[cp]);
    const s = texto(m[f]?.[cs]);
    if (p && s && si(p, s)) out.push(f);
  }
  return out;
}

/** Escribe una relación en una fila de Relaciones (o la añade al final). */
function escribirRelacion(e: Editor, fila: number | null, pred: string, suc: string, tipo: TipoRelacion, desfase: number, transcurrido: boolean): void {
  const R = H.relaciones;
  if (!e.libro[R] || e.hoja(R).length === 0) COLUMNAS.relaciones.forEach((n, c) => e.celda(R, 0, c, n));
  const f = fila ?? ultimaFila(e.hoja(R)) + 1;
  e.celda(R, f, e.col(R, 'Predecesora'), pred);
  e.celda(R, f, e.col(R, 'Sucesora'), suc);
  e.celda(R, f, e.col(R, 'Tipo'), tipo);
  e.celda(R, f, e.col(R, 'Desfase (días)'), desfase);
  e.celda(R, f, e.col(R, 'Unidad del desfase'), transcurrido ? 'Calendario' : desfase !== 0 ? 'Laborables' : null);
}

/**
 * Renumera la WBS de Actividades por el nivel de cada fila (con los niveles
 * nuevos de `cambiados`) y ajusta el tipo: la que tiene hijas pasa a
 * Resumen; un Resumen que se queda sin hijas, a Tarea de 1 día. Si la WBS
 * empezaba en 0 (el hito de inicio del ejemplo), sigue empezando en 0.
 */
function renumerar(e: Editor, cambiados: ReadonlyMap<number, number> = new Map()): void {
  const A = H.actividades;
  const m = e.hoja(A);
  const cw = e.col(A, 'WBS');
  const ct = e.col(A, 'Tipo');
  const cd = e.col(A, 'Duración (días)');
  const ult = ultimaFila(m);
  const filas: number[] = [];
  for (let f = 1; f <= ult; f++) if (!(m[f] ?? []).every(vacio)) filas.push(f);
  const niveles = filas.map((f) => cambiados.get(f) ?? nivelDeWbs(texto(m[f]?.[cw])));
  const primeraCero = filas.length > 0 && texto(m[filas[0] as number]?.[cw]) === '0';
  const contador: number[] = [];
  let previo = 0;
  const wbs = niveles.map((n0, k) => {
    const n = Math.max(1, Math.min(n0, previo + 1));
    contador.length = n;
    contador[n - 1] = (contador[n - 1] ?? (n === 1 && primeraCero && k === 0 ? -1 : 0)) + 1;
    for (let j = 0; j < n - 1; j++) if (contador[j] === undefined) contador[j] = 1;
    previo = n;
    return contador.slice(0, n).join('.');
  });
  filas.forEach((f, k) => e.celda(A, f, cw, wbs[k]));
  const p = padres(filas.map((f, k) => ({ id: String(f), wbs: wbs[k] as string, resumen: false })));
  const conHijas = new Set(p.filter((x) => x >= 0));
  filas.forEach((f, k) => {
    const t = normalizar(m[f]?.[ct]);
    if (conHijas.has(k) && !t.startsWith('resumen')) {
      e.celda(A, f, ct, 'Resumen');
      e.celda(A, f, cd, null);
    } else if (!conHijas.has(k) && t.startsWith('resumen')) {
      e.celda(A, f, ct, 'Tarea');
      e.celda(A, f, cd, 1);
    }
  });
}

/**
 * Huella de las hojas que toca una edición, para no deshacer a ciegas: si
 * alguien cambió esas hojas a mano en Excel después, los cambios guardados
 * (por número de fila) ya no corresponden y deshacer se niega.
 */
export function huellaHojas(hojas: Readonly<Record<string, MatrizHoja | undefined>>, nombres: Iterable<string>): string {
  const limpia = (m: MatrizHoja | undefined) => {
    const filas = (m ?? []).map((f) => {
      const r = f.map((v) => (vacio(v) ? null : v));
      while (r.length && r[r.length - 1] === null) r.pop();
      return r;
    });
    while (filas.length && (filas[filas.length - 1] as unknown[]).length === 0) filas.pop();
    return filas;
  };
  return JSON.stringify([...new Set(nombres)].sort().map((n) => [n, limpia(hojas[n])]));
}

export const hojasDe = (cambios: readonly CambioHoja[]): string[] => [...new Set(cambios.map((c) => c.hoja))];

interface Hecho {
  descripcion: string;
  cambios: CambioHoja[];
  /** Huellas de las hojas tocadas antes y después de la edición. */
  antes: string;
  despues: string;
}

/** Deshacer y rehacer de la sesión (decisión 2: Excel no deshace lo que escribe un complemento). */
export class HistorialGantt {
  private hechos: Hecho[] = [];
  private deshechos: Hecho[] = [];
  private readonly limite: number;
  constructor(limite = 100) {
    this.limite = limite;
  }
  registrar(descripcion: string, cambios: CambioHoja[], antes = '', despues = ''): void {
    this.hechos.push({ descripcion, cambios, antes, despues });
    if (this.hechos.length > this.limite) this.hechos.shift();
    this.deshechos = [];
  }
  /** Los cambios que deshacen la última edición; `huella`: cómo tienen que estar las hojas para poder aplicarlos. */
  verDeshacer(): { descripcion: string; cambios: CambioHoja[]; huella: string; hojas: string[] } | null {
    const h = this.hechos[this.hechos.length - 1];
    return h ? { descripcion: h.descripcion, cambios: invertirCambios(h.cambios), huella: h.despues, hojas: hojasDe(h.cambios) } : null;
  }
  verRehacer(): { descripcion: string; cambios: CambioHoja[]; huella: string; hojas: string[] } | null {
    const h = this.deshechos[this.deshechos.length - 1];
    return h ? { descripcion: h.descripcion, cambios: h.cambios, huella: h.antes, hojas: hojasDe(h.cambios) } : null;
  }
  /** Deshace (pasa la última edición a «rehacer») y devuelve sus cambios inversos. */
  deshacer(): { descripcion: string; cambios: CambioHoja[] } | null {
    const v = this.verDeshacer();
    const h = this.hechos.pop();
    if (!h || !v) return null;
    this.deshechos.push(h);
    return { descripcion: v.descripcion, cambios: v.cambios };
  }
  rehacer(): { descripcion: string; cambios: CambioHoja[] } | null {
    const h = this.deshechos.pop();
    if (!h) return null;
    this.hechos.push(h);
    return { descripcion: h.descripcion, cambios: h.cambios };
  }
  /** Olvida todo (las hojas cambiaron por fuera). */
  vaciar(): void {
    this.hechos = [];
    this.deshechos = [];
  }
  get puedeDeshacer(): string | null {
    return this.hechos[this.hechos.length - 1]?.descripcion ?? null;
  }
  get puedeRehacer(): string | null {
    return this.deshechos[this.deshechos.length - 1]?.descripcion ?? null;
  }
}
