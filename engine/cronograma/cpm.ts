/**
 * Método del camino crítico (CPM) determinista — P1.
 *
 * Pasada hacia adelante (inicio y fin tempranos), pasada hacia atrás (inicio
 * y fin tardíos) y holgura total, con las cuatro relaciones y retardos, en
 * días laborables del calendario del proyecto (`calendario.ts`).
 *
 * Reglas, para una relación de `p` (predecesora) a `s` (sucesora) con
 * retardo `r`:
 *
 * | Tipo | Adelante: IT(s) ≥ … | Atrás: FT(p) ≤ … |
 * |---|---|---|
 * | FS | FT(p) + r | IT(s) − r |
 * | SS | IT(p) + r | IT(s) − r + d(p) |
 * | FF | FT(p) + r − d(s) | FT(s) − r |
 * | SF | IT(p) + r − d(s) | FT(s) − r + d(p) |
 *
 * (IT = inicio temprano/tardío, FT = fin; d = duración.) Ninguna actividad
 * empieza antes del índice 0 (el inicio del proyecto) ni antes de su «inicio
 * no antes de». La pasada atrás parte del fin del proyecto (el mayor fin
 * temprano), como MS Project sin fecha límite.
 *
 * Una predecesora que no existe o un ciclo no se «arreglan»: se devuelven
 * como errores y no hay fechas. Calcular con una red rota daría fechas
 * precisas y falsas, que es justo lo que el chequeo de salud quiere evitar.
 */

import { IndiceLaborable } from './calendario.ts';
import { duracionEfectiva, parametrosRed, type EstadoAvance } from './red.ts';
import type { Actividad, Cronograma, ProblemaCronograma } from './tipos.ts';

export interface FilaCPM {
  id: string;
  nombre: string;
  duracion: number;
  /** En índices de día laborable (0 = primer día del proyecto). */
  inicioTemprano: number;
  finTemprano: number;
  inicioTardio: number;
  finTardio: number;
  holguraTotal: number;
  critica: boolean;
  /** Las mismas, como fechas de Excel (número de serie). */
  fechaInicio: number;
  fechaFin: number;
  fechaInicioTardio: number;
  fechaFinTardio: number;
  estado: EstadoAvance;
}

export type ResultadoCPM =
  | {
      ok: true;
      filas: FilaCPM[];
      /** Días laborables del proyecto (fin temprano máximo). */
      duracionProyecto: number;
      fechaInicioProyecto: number;
      fechaFinProyecto: number;
      /** IDs en orden topológico. */
      orden: string[];
      avisos: ProblemaCronograma[];
    }
  | { ok: false; problemas: ProblemaCronograma[] };

/** Tolerancia para decidir que una holgura es cero (duraciones fraccionarias). */
const EPS = 1e-9;

/**
 * Orden topológico (Kahn). Devuelve los índices ordenados, o los IDs que
 * quedan en ciclos. `preds[i]` son los índices de las predecesoras de `i`.
 */
export function ordenTopologico(n: number, preds: readonly (readonly number[])[]): { orden: number[]; enCiclo: number[] } {
  const grado = new Array<number>(n).fill(0);
  const sucs: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (const p of preds[i] as number[]) {
      grado[i] = (grado[i] as number) + 1;
      (sucs[p] as number[]).push(i);
    }
  }
  const cola: number[] = [];
  for (let i = 0; i < n; i++) if (grado[i] === 0) cola.push(i);
  const orden: number[] = [];
  for (let k = 0; k < cola.length; k++) {
    const i = cola[k] as number;
    orden.push(i);
    for (const s of sucs[i] as number[]) {
      grado[s] = (grado[s] as number) - 1;
      if (grado[s] === 0) cola.push(s);
    }
  }
  const enCiclo: number[] = [];
  if (orden.length < n) {
    // Lo que queda son los ciclos **y todo lo que cuelga de ellos**. Para
    // nombrar solo los ciclos, se podan hacia atrás las que no tienen
    // ninguna sucesora entre las que quedan.
    const queda = new Set<number>();
    for (let i = 0; i < n; i++) if ((grado[i] as number) > 0) queda.add(i);
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const i of queda) {
        if (!(sucs[i] as number[]).some((s) => queda.has(s))) {
          queda.delete(i);
          cambio = true;
        }
      }
    }
    enCiclo.push(...[...queda].sort((a, b) => a - b));
  }
  return { orden, enCiclo };
}

/** Comprueba IDs y predecesoras y devuelve los índices de las predecesoras de cada actividad. */
export function resolverRed(actividades: readonly Actividad[]):
  { ok: true; preds: number[][] } | { ok: false; problemas: ProblemaCronograma[] } {
  const problemas: ProblemaCronograma[] = [];
  const indice = new Map<string, number>();
  actividades.forEach((a, i) => {
    if (indice.has(a.id)) {
      problemas.push({ gravedad: 'error', actividad: a.id, fila: a.fila, mensaje: `El ID «${a.id}» está repetido` });
    } else indice.set(a.id, i);
  });
  const preds = actividades.map((a) => {
    const lista: number[] = [];
    for (const r of a.predecesoras) {
      const j = indice.get(r.predecesora);
      if (j === undefined) {
        problemas.push({
          gravedad: 'error', actividad: a.id, fila: a.fila,
          mensaje: `«${a.id}» tiene como predecesora «${r.predecesora}», que no existe`,
        });
      } else if (a.id === r.predecesora) {
        problemas.push({ gravedad: 'error', actividad: a.id, fila: a.fila, mensaje: `«${a.id}» es predecesora de sí misma` });
      } else lista.push(j);
    }
    return lista;
  });
  return problemas.length > 0 ? { ok: false, problemas } : { ok: true, preds };
}

export function calcularCPM(c: Cronograma): ResultadoCPM {
  const acts = c.actividades;
  const n = acts.length;
  if (n === 0) return { ok: false, problemas: [{ gravedad: 'error', mensaje: 'El cronograma no tiene actividades' }] };

  const red = resolverRed(acts);
  if (!red.ok) return red;
  const { orden, enCiclo } = ordenTopologico(n, red.preds);
  if (enCiclo.length > 0) {
    const ids = enCiclo.map((i) => (acts[i] as Actividad).id);
    return {
      ok: false,
      problemas: [{
        gravedad: 'error',
        mensaje: `Hay una dependencia circular entre: ${ids.join(', ')}. Una actividad no puede depender, directa o indirectamente, de sí misma`,
      }],
    };
  }

  const cal = new IndiceLaborable(c.calendario, c.inicio);
  const indice = new Map(acts.map((a, i) => [a.id, i]));
  const red2 = parametrosRed(c, cal);
  const dur = acts.map((a, i) => duracionEfectiva(red2, i, a.duracion));
  const it = new Float64Array(n);
  const ft = new Float64Array(n);

  // Adelante.
  for (const s of orden) {
    const a = acts[s] as Actividad;
    const d = dur[s] as number;
    let inicio = red2.minInicio[s] as number;
    if (!red2.sinLogica[s]) {
      for (const r of a.predecesoras) {
        const p = indice.get(r.predecesora) as number;
        let v: number;
        switch (r.tipo) {
          case 'FS': v = (ft[p] as number) + r.retardo; break;
          case 'SS': v = (it[p] as number) + r.retardo; break;
          case 'FF': v = (ft[p] as number) + r.retardo - d; break;
          case 'SF': v = (it[p] as number) + r.retardo - d; break;
        }
        if (v > inicio) inicio = v;
      }
      inicio = Math.max(inicio, (red2.minFin[s] as number) - d);
    }
    it[s] = inicio;
    ft[s] = inicio + d;
  }

  let finProyecto = 0;
  for (let i = 0; i < n; i++) if ((ft[i] as number) > finProyecto) finProyecto = ft[i] as number;

  // Atrás: las sucesoras de cada actividad.
  const sucs: Array<Array<{ s: number; tipo: string; retardo: number }>> = Array.from({ length: n }, () => []);
  acts.forEach((a, s) => {
    for (const r of a.predecesoras) (sucs[indice.get(r.predecesora) as number] as Array<{ s: number; tipo: string; retardo: number }>).push({ s, tipo: r.tipo, retardo: r.retardo });
  });
  const itT = new Float64Array(n);
  const ftT = new Float64Array(n);
  for (let k = orden.length - 1; k >= 0; k--) {
    const p = orden[k] as number;
    const d = dur[p] as number;
    let fin = finProyecto;
    for (const { s, tipo, retardo } of sucs[p] as Array<{ s: number; tipo: string; retardo: number }>) {
      let v: number;
      switch (tipo) {
        case 'FS': v = (itT[s] as number) - retardo; break;
        case 'SS': v = (itT[s] as number) - retardo + d; break;
        case 'FF': v = (ftT[s] as number) - retardo; break;
        default: v = (ftT[s] as number) - retardo + d; break; // SF
      }
      if (v < fin) fin = v;
    }
    fin = Math.min(fin, red2.maxFin[p] as number, (red2.maxInicio[p] as number) + d);
    ftT[p] = fin;
    itT[p] = fin - d;
  }

  const avisos: ProblemaCronograma[] = [];
  const filas: FilaCPM[] = acts.map((a, i) => {
    const d = dur[i] as number;
    const estado = red2.estado[i] as EstadoAvance;
    const holgura = (itT[i] as number) - (it[i] as number);
    if (holgura < -EPS && estado !== 'terminada') {
      avisos.push({ gravedad: 'aviso', actividad: a.id, fila: a.fila, mensaje: `«${a.id}» tiene holgura negativa (${redondear(holgura)} días)` });
    }
    // Una actividad terminada ni es crítica ni tiene holgura: ya no se puede mover.
    const hecha = estado === 'terminada';
    return {
      id: a.id,
      nombre: a.nombre,
      duracion: a.duracion,
      inicioTemprano: it[i] as number,
      finTemprano: ft[i] as number,
      inicioTardio: hecha ? (it[i] as number) : (itT[i] as number),
      finTardio: hecha ? (ft[i] as number) : (ftT[i] as number),
      holguraTotal: hecha || Math.abs(holgura) < EPS ? 0 : holgura,
      critica: !hecha && holgura < EPS,
      fechaInicio: cal.fechaInicio(it[i] as number, d),
      fechaFin: cal.fechaFin(ft[i] as number, d),
      fechaInicioTardio: cal.fechaInicio(Math.max(0, hecha ? (it[i] as number) : (itT[i] as number)), d),
      fechaFinTardio: cal.fechaFin(hecha ? (ft[i] as number) : (ftT[i] as number), d),
      estado,
    };
  });

  return {
    ok: true,
    filas,
    duracionProyecto: finProyecto,
    fechaInicioProyecto: cal.fechaDeIndice(0),
    fechaFinProyecto: cal.fechaFin(finProyecto, finProyecto === 0 ? 0 : 1),
    orden: orden.map((i) => (acts[i] as Actividad).id),
    avisos,
  };
}

function redondear(x: number): number {
  return Math.round(x * 100) / 100;
}
