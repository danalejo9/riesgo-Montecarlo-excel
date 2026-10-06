/**
 * Editores en ventana (06/10, pedido del usuario): calendarios, riesgos con
 * sus impactos y ramas, como formularios en vez de filas. Las hojas siguen
 * siendo la verdad: el editor lee las hojas, el usuario cambia el
 * formulario y al guardar se reescribe el bloque de la hoja (un cambio
 * «rango», que se puede deshacer). Sin Office.js.
 *
 * Antes de escribir se valida con el mismo lector que usa la simulación
 * (`leerCronograma` sobre las hojas ya cambiadas): lo que la hoja no
 * aceptaría, el editor tampoco.
 */

import {
  COLUMNA_EXCEPCIONES, COLUMNAS, ETIQUETAS_CONFIG, HOJAS_CRONOGRAMA as H, fechaDeCelda, leerCronograma, normalizar, numero, proporcion, siNo, texto,
  type ErrorHoja, type MatrizHoja,
} from './cronogramaHojas.ts';
import { aplicarCambios, type CambioHoja } from './edicionGantt.ts';
import { festivosColombia } from '../engine/cronograma/festivos.ts';

type Hojas = Readonly<Record<string, MatrizHoja | undefined>>;

// ------------------------------------------------------------- tipos

export interface CalendarioEditable {
  nombre: string;
  /** El nombre que tenía en la hoja (para renombrar también donde se usa); vacío si es nuevo. */
  original: string;
  /** Lunes (0) a domingo (6). */
  laborables: boolean[];
}

export interface ExcepcionEditable {
  fecha: number;
  descripcion: string;
  /** Vacío: todos los calendarios. */
  calendario: string;
  tipo: 'Festivo' | 'Laborable';
}

export interface DatosCalendarios {
  calendarios: CalendarioEditable[];
  excepciones: ExcepcionEditable[];
}

export interface ImpactoEditable {
  actividad: string;
  distribucion: string;
  min: number | null;
  mp: number | null;
  max: number | null;
  costoMin: number | null;
  costoMp: number | null;
  costoMax: number | null;
}

export interface RiesgoEditable {
  id: string;
  descripcion: string;
  causa: string;
  consecuencia: string;
  dueno: string;
  categoria: string;
  /** 0 a 1. */
  probabilidad: number | null;
  estado: string;
  probabilidadPost: number | null;
  impactoPost: number | null;
  costoMitigacion: number | null;
  modo: string;
  impactos: ImpactoEditable[];
}

export interface OpcionEditable {
  nombre: string;
  /** 0 a 1. */
  probabilidad: number | null;
  /** IDs separados por comas. */
  actividades: string;
}

export interface RamaEditable {
  nombre: string;
  opciones: OpcionEditable[];
}

/** Lo que la ventana necesita para los tres editores. */
export interface DatosEditores {
  calendarios: DatosCalendarios;
  riesgos: RiesgoEditable[];
  ramas: RamaEditable[];
  /** Para elegir actividades y saber qué calendario usa cada una. */
  actividades: { id: string; nombre: string; calendario: string }[];
  calendarioProyecto: string;
}

export type PedidoGuardar =
  | { tipo: 'calendarios'; datos: DatosCalendarios }
  | { tipo: 'riesgos'; datos: RiesgoEditable[] }
  | { tipo: 'ramas'; datos: RamaEditable[] };

// ------------------------------------------------------------- lectura

const DIAS = COLUMNAS.calendarios.slice(1);

function columnas(m: MatrizHoja | undefined, esperadas: readonly string[], desde = 0): Map<string, number> {
  const enc = m?.[0] ?? [];
  const col = new Map<string, number>();
  esperadas.forEach((e, k) => {
    const ne = normalizar(e);
    const i = enc.findIndex((h, j) => j >= desde && normalizar(h) === ne);
    col.set(ne, i >= 0 ? i : desde + k);
  });
  return col;
}

function filasCon(m: MatrizHoja | undefined, cols: number[]): (readonly unknown[])[] {
  if (!m) return [];
  return m.slice(1).filter((f) => cols.some((c) => texto(f[c]) !== ''));
}

export function leerEditores(hojas: Hojas): DatosEditores {
  // Calendarios.
  const mc = hojas[H.calendario];
  const cc = columnas(mc, COLUMNAS.calendarios);
  const ic = (k: string) => cc.get(normalizar(k)) as number;
  const calendarios = filasCon(mc, [ic('Calendario')]).map((f): CalendarioEditable => {
    const nombre = texto(f[ic('Calendario')]);
    return { nombre, original: nombre, laborables: DIAS.map((d) => siNo(f[ic(d)], false)) };
  });
  const ce = columnas(mc, COLUMNAS.excepciones, COLUMNA_EXCEPCIONES);
  const ie = (k: string) => ce.get(normalizar(k)) as number;
  const excepciones: ExcepcionEditable[] = [];
  for (const f of filasCon(mc, [ie('Fecha'), ie('Descripción')])) {
    const fecha = fechaDeCelda(f[ie('Fecha')]);
    if (fecha === null) continue;
    excepciones.push({
      fecha, descripcion: texto(f[ie('Descripción')]), calendario: texto(f[ie('Calendario')]),
      tipo: normalizar(f[ie('Tipo')]).startsWith('laborable') ? 'Laborable' : 'Festivo',
    });
  }
  excepciones.sort((a, b) => a.fecha - b.fecha);

  // Riesgos e impactos.
  const mr = hojas[H.riesgos];
  const cr = columnas(mr, COLUMNAS.riesgos);
  const ir = (k: string) => cr.get(normalizar(k)) as number;
  const riesgos = filasCon(mr, [ir('ID')]).map((f): RiesgoEditable => ({
    id: texto(f[ir('ID')]), descripcion: texto(f[ir('Descripción')]), causa: texto(f[ir('Causa')]), consecuencia: texto(f[ir('Consecuencia')]),
    dueno: texto(f[ir('Dueño')]), categoria: texto(f[ir('Categoría')]), probabilidad: proporcion(f[ir('Probabilidad')]),
    estado: texto(f[ir('Estado')]) || 'Activo', probabilidadPost: proporcion(f[ir('Probabilidad post')]),
    impactoPost: proporcion(f[ir('% del impacto post')]), costoMitigacion: numero(f[ir('Costo de mitigación')]),
    modo: texto(f[ir('Modo')]) || 'Extiende actividades', impactos: [],
  }));
  const mi = hojas[H.impactos];
  const ci = columnas(mi, COLUMNAS.impactos);
  const ii = (k: string) => ci.get(normalizar(k)) as number;
  for (const f of filasCon(mi, [ii('Riesgo'), ii('Actividad')])) {
    const r = riesgos.find((x) => normalizar(x.id) === normalizar(f[ii('Riesgo')]));
    if (!r) continue;
    r.impactos.push({
      actividad: texto(f[ii('Actividad')]), distribucion: texto(f[ii('Distribución')]) || 'Triangular',
      min: numero(f[ii('Mínimo (días)')]), mp: numero(f[ii('Más probable (días)')]), max: numero(f[ii('Máximo (días)')]),
      costoMin: numero(f[ii('Costo mínimo')]), costoMp: numero(f[ii('Costo más probable')]), costoMax: numero(f[ii('Costo máximo')]),
    });
  }

  // Ramas.
  const mb = hojas[H.ramas];
  const cb = columnas(mb, COLUMNAS.ramas);
  const ib = (k: string) => cb.get(normalizar(k)) as number;
  const ramas: RamaEditable[] = [];
  for (const f of filasCon(mb, [ib('Rama'), ib('Opción')])) {
    const nombre = texto(f[ib('Rama')]);
    let r = ramas.find((x) => normalizar(x.nombre) === normalizar(nombre));
    if (!r) ramas.push((r = { nombre, opciones: [] }));
    r.opciones.push({ nombre: texto(f[ib('Opción')]), probabilidad: proporcion(f[ib('Probabilidad')]), actividades: texto(f[ib('Actividades')]) });
  }

  // Actividades (para elegir) y calendario del proyecto.
  const ma = hojas[H.actividades];
  const ca = columnas(ma, COLUMNAS.actividades);
  const ia = (k: string) => ca.get(normalizar(k)) as number;
  const actividades = filasCon(ma, [ia('ID')])
    .filter((f) => !normalizar(f[ia('Tipo')]).startsWith('resumen'))
    .map((f) => ({ id: texto(f[ia('ID')]), nombre: texto(f[ia('Nombre')]), calendario: texto(f[ia('Calendario')]) }));
  const cfg = (hojas[H.config] ?? []).find((f) => normalizar(f[0]) === normalizar(ETIQUETAS_CONFIG.calendario));
  return { calendarios: { calendarios, excepciones }, riesgos, ramas, actividades, calendarioProyecto: texto(cfg?.[1]) || (calendarios[0]?.nombre ?? '') };
}

// ------------------------------------------------------------- escritura

/** El último índice de fila (desde 0) con algo en esas columnas. */
function altoDe(m: MatrizHoja | undefined, desde: number, ancho: number): number {
  if (!m) return 0;
  let n = 0;
  m.forEach((f, i) => {
    for (let j = desde; j < desde + ancho; j++) if (texto(f[j]) !== '') { n = i + 1; break; }
  });
  return n;
}

/** Reescribe un bloque entero (encabezado incluido), borrando lo que sobre. */
function bloque(hoja: string, m: MatrizHoja | undefined, col: number, encabezado: readonly string[], filas: unknown[][], formatos?: Record<number, string>): CambioHoja {
  const ancho = encabezado.length;
  const alto = Math.max(altoDe(m, col, ancho), filas.length + 1);
  const antes = Array.from({ length: alto }, (_, i) => Array.from({ length: ancho }, (_, j) => m?.[i]?.[col + j] ?? null));
  const valores = Array.from({ length: alto }, (_, i) => (i === 0 ? [...encabezado] : Array.from({ length: ancho }, (_, j) => filas[i - 1]?.[j] ?? null)));
  return { hoja, op: 'rango', fila: 0, col, valores, antes, ...(formatos ? { formatos } : {}) };
}

const siNoTexto = (b: boolean) => (b ? 'Sí' : 'No');
const vacioANull = (s: string) => (s.trim() === '' ? null : s.trim());

/**
 * Los cambios de un guardado. Al renombrar un calendario se renombra
 * también en Actividades (columna Calendario), en Config (Calendario del
 * proyecto) y en las excepciones.
 */
export function cambiosDe(hojas: Hojas, pedido: PedidoGuardar): CambioHoja[] {
  if (pedido.tipo === 'calendarios') {
    const { calendarios, excepciones } = pedido.datos;
    const renombre = new Map<string, string>();
    for (const c of calendarios) if (c.original && normalizar(c.original) !== normalizar(c.nombre)) renombre.set(normalizar(c.original), c.nombre.trim());
    const nuevoNombre = (n: string) => renombre.get(normalizar(n)) ?? n;
    const mc = hojas[H.calendario];
    const cambios: CambioHoja[] = [
      bloque(H.calendario, mc, 0, COLUMNAS.calendarios, calendarios.map((c) => [c.nombre.trim(), ...c.laborables.map(siNoTexto)])),
      bloque(H.calendario, mc, COLUMNA_EXCEPCIONES, COLUMNAS.excepciones,
        [...excepciones].sort((a, b) => a.fecha - b.fecha).map((e) => [e.fecha, vacioANull(e.descripcion), vacioANull(nuevoNombre(e.calendario)), e.tipo]), { 0: 'dd/mm/yyyy' }),
    ];
    if (renombre.size) {
      const ma = hojas[H.actividades];
      const k = columnas(ma, COLUMNAS.actividades).get(normalizar('Calendario')) as number;
      ma?.forEach((f, i) => {
        if (i === 0) return;
        const n = renombre.get(normalizar(f[k]));
        if (n !== undefined) cambios.push({ hoja: H.actividades, op: 'celda', fila: i, col: k, valor: n, antes: f[k] ?? null });
      });
      const mf = hojas[H.config];
      mf?.forEach((f, i) => {
        if (normalizar(f[0]) !== normalizar(ETIQUETAS_CONFIG.calendario)) return;
        const n = renombre.get(normalizar(f[1]));
        if (n !== undefined) cambios.push({ hoja: H.config, op: 'celda', fila: i, col: 1, valor: n, antes: f[1] ?? null });
      });
    }
    return cambios;
  }
  if (pedido.tipo === 'riesgos') {
    const riesgos = pedido.datos;
    return [
      bloque(H.riesgos, hojas[H.riesgos], 0, COLUMNAS.riesgos, riesgos.map((r) => [
        r.id.trim(), vacioANull(r.descripcion), vacioANull(r.causa), vacioANull(r.consecuencia), vacioANull(r.dueno), vacioANull(r.categoria),
        r.probabilidad, r.estado, r.probabilidadPost, r.impactoPost, r.costoMitigacion, r.modo,
      ]), { 6: '0%', 8: '0%', 9: '0%', 10: '#,##0' }),
      bloque(H.impactos, hojas[H.impactos], 0, COLUMNAS.impactos, riesgos.flatMap((r) => r.impactos.map((i) => [
        r.id.trim(), i.actividad.trim(), i.distribucion, i.min, i.mp, i.max, i.costoMin, i.costoMp, i.costoMax,
      ])), { 6: '#,##0', 7: '#,##0', 8: '#,##0' }),
    ];
  }
  return [
    bloque(H.ramas, hojas[H.ramas], 0, COLUMNAS.ramas, pedido.datos.flatMap((r) => r.opciones.map((o) => [
      r.nombre.trim(), o.nombre.trim(), o.probabilidad, vacioANull(o.actividades),
    ])), { 2: '0%' }),
  ];
}

// ------------------------------------------------------------- validación

/** Lo que el editor comprueba antes de mandar (respuesta inmediata en la ventana). */
export function revisarPedido(pedido: PedidoGuardar, actividades: readonly string[]): string[] {
  const e: string[] = [];
  const existe = new Set(actividades.map(normalizar));
  const repetidos = (nombres: string[], que: string) => {
    const vistos = new Set<string>();
    for (const n of nombres) {
      const k = normalizar(n);
      if (!k) e.push(`Falta el nombre de ${que}.`);
      else if (vistos.has(k)) e.push(`«${n}» está repetido.`);
      vistos.add(k);
    }
  };
  const entre01 = (x: number | null, que: string) => {
    if (x !== null && (x < 0 || x > 1)) e.push(`${que}: tiene que estar entre 0 % y 100 %.`);
  };
  if (pedido.tipo === 'calendarios') {
    const { calendarios, excepciones } = pedido.datos;
    if (!calendarios.length) e.push('Hace falta al menos un calendario.');
    repetidos(calendarios.map((c) => c.nombre), 'un calendario');
    for (const c of calendarios) if (!c.laborables.some(Boolean)) e.push(`«${c.nombre}» no tiene ningún día laborable.`);
    const nombres = new Set(calendarios.flatMap((c) => [normalizar(c.nombre), normalizar(c.original)]));
    for (const x of excepciones) if (x.calendario && !nombres.has(normalizar(x.calendario))) e.push(`La excepción del ${x.fecha} es del calendario «${x.calendario}», que no existe.`);
  } else if (pedido.tipo === 'riesgos') {
    repetidos(pedido.datos.map((r) => r.id), 'un riesgo (ID)');
    for (const r of pedido.datos) {
      if (r.probabilidad === null) e.push(`${r.id}: falta la probabilidad.`);
      entre01(r.probabilidad, `${r.id}, probabilidad`);
      entre01(r.probabilidadPost, `${r.id}, probabilidad post`);
      for (const i of r.impactos) {
        if (!existe.has(normalizar(i.actividad))) e.push(`${r.id}: la actividad «${i.actividad}» no existe.`);
        const v = [i.min, i.mp, i.max].filter((x): x is number => x !== null);
        if (i.distribucion !== 'Fija' && v.length === 3 && !(v[0]! <= v[1]! && v[1]! <= v[2]!)) e.push(`${r.id} en ${i.actividad}: mínimo ≤ más probable ≤ máximo.`);
      }
    }
  } else {
    repetidos(pedido.datos.map((r) => r.nombre), 'una rama');
    for (const r of pedido.datos) {
      if (r.opciones.length < 2) e.push(`«${r.nombre}» necesita al menos dos opciones.`);
      const suma = r.opciones.reduce((s, o) => s + (o.probabilidad ?? 0), 0);
      if (Math.abs(suma - 1) > 0.005) e.push(`Las opciones de «${r.nombre}» suman ${Math.round(suma * 1000) / 10} %; tienen que sumar 100 %.`);
      for (const o of r.opciones) {
        for (const id of o.actividades.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
          if (!existe.has(normalizar(id))) e.push(`«${r.nombre}» · «${o.nombre}»: la actividad «${id}» no existe.`);
        }
      }
    }
  }
  return [...new Set(e)];
}

/**
 * Lo que el lector de las hojas diría tras guardar: los errores nuevos, en
 * cualquier hoja (quitar un calendario que usa una actividad da el error en
 * Actividades).
 */
export function erroresTrasGuardar(hojas: Hojas, cambios: readonly CambioHoja[]): ErrorHoja[] {
  const antes = new Set(leerCronograma(hojas).errores.map((x) => `${x.hoja}|${x.mensaje}`));
  return leerCronograma(aplicarCambios(hojas, cambios)).errores.filter((x) => !antes.has(`${x.hoja}|${x.mensaje}`));
}

/** Los festivos de Colombia de esos años como excepciones (sin repetir las que ya hay). */
export function anadirFestivosColombia(excepciones: readonly ExcepcionEditable[], desde: number, hasta: number): ExcepcionEditable[] {
  const hay = new Set(excepciones.filter((e) => !e.calendario).map((e) => e.fecha));
  const nuevas: ExcepcionEditable[] = [];
  for (let a = desde; a <= hasta; a++) {
    for (const f of festivosColombia(a)) if (!hay.has(f.dia)) nuevas.push({ fecha: f.dia, descripcion: f.nombre, calendario: '', tipo: 'Festivo' });
  }
  return [...excepciones, ...nuevas].sort((a, b) => a.fecha - b.fecha);
}

/** Calendarios que no se pueden quitar porque los usan actividades o Config. */
export function calendariosEnUso(datos: DatosEditores): Map<string, string[]> {
  const uso = new Map<string, string[]>();
  const anotar = (cal: string, quien: string) => {
    const k = normalizar(cal);
    if (!k) return;
    uso.set(k, [...(uso.get(k) ?? []), quien]);
  };
  for (const a of datos.actividades) anotar(a.calendario, a.id);
  anotar(datos.calendarioProyecto, 'Config (calendario del proyecto)');
  return uso;
}
