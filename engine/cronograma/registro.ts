/**
 * Registro de riesgos completo del cronograma (V10): cada riesgo con su
 * estado, dueño y próxima revisión, y su lugar en la **matriz de
 * probabilidad e impacto** 5 × 5 con zonas de color, la de cualquier plan de
 * gestión de riesgos. Sin Office.js.
 *
 * - Probabilidad: niveles 1–5 por tramos (≤ 10 %, ≤ 30 %, ≤ 50 %, ≤ 70 %, más).
 * - Impacto: el nivel que diga el usuario («Impacto cualitativo») o, si no,
 *   el que sale de la simulación: lo que el riesgo aporta al P80 del plazo
 *   (en % de la duración) y del costo (en % del costo base), el mayor de los
 *   dos (≤ 0,5 %, ≤ 2 %, ≤ 5 %, ≤ 10 %, más). Sin simulación, una estimación
 *   gruesa: los días que suma de media si ocurre frente a la duración.
 * - Zona por puntaje (probabilidad × impacto): 15 o más, roja; 8–14, naranja;
 *   4–7, amarilla; menos, verde.
 *
 * Las **oportunidades** (solo acortan o ahorran) van en su propia matriz, con
 * su escala (alta, media, baja, mínima): su impacto es lo que se gana. La
 * matriz consolidada es la doble del PMBOK: amenazas a la izquierda (impacto
 * 1 → 5) y oportunidades a la derecha (5 → 1).
 */

import type { DistribucionDuracion, ModeloCronograma } from './modelo.ts';
import { valorTipico } from './modelo.ts';
import type { SimulacionCronograma } from './simulacion.ts';

/** Un riesgo tal como está en la hoja Riesgos (también los cerrados). */
export interface RiesgoRegistro {
  id: string;
  nombre: string;
  dueno?: string;
  categoria?: string;
  /** Tal como lo escribió el usuario: «Activo», «En seguimiento», «Cerrado»… */
  estado: string;
  probabilidad: number | null;
  /** Número de serie de la próxima revisión. */
  proximaRevision?: number;
  /** Nivel 1–5 que da el usuario (manda sobre el calculado). */
  impactoCualitativo?: number;
}

export type Zona = 'roja' | 'naranja' | 'amarilla' | 'verde';
export type ZonaOportunidad = 'alta' | 'media' | 'baja' | 'mínima';
export type Clase = 'amenaza' | 'oportunidad';

export const COLORES_ZONA: Record<Zona, string> = { roja: '#E34948', naranja: '#F39C45', amarilla: '#F7DC6F', verde: '#7DC98F' };
export const COLORES_OPORTUNIDAD: Record<ZonaOportunidad, string> = { alta: '#4F8FDB', media: '#8DB8EC', baja: '#C3DAF5', mínima: '#E6F0FB' };

export const nivelProbabilidadRegistro = (p: number) => (p <= 0.1 ? 1 : p <= 0.3 ? 2 : p <= 0.5 ? 3 : p <= 0.7 ? 4 : 5);
const nivelPorFraccion = (x: number) => (x <= 0.005 ? 1 : x <= 0.02 ? 2 : x <= 0.05 ? 3 : x <= 0.1 ? 4 : 5);
export const zonaDe = (puntaje: number): Zona => (puntaje >= 15 ? 'roja' : puntaje >= 8 ? 'naranja' : puntaje >= 4 ? 'amarilla' : 'verde');
export const zonaOportunidadDe = (puntaje: number): ZonaOportunidad => (puntaje >= 15 ? 'alta' : puntaje >= 8 ? 'media' : puntaje >= 4 ? 'baja' : 'mínima');
/** El color de una casilla (o de un puntaje) según sea de amenaza o de oportunidad. */
export const colorDe = (clase: Clase, puntaje: number) => (clase === 'oportunidad' ? COLORES_OPORTUNIDAD[zonaOportunidadDe(puntaje)] : COLORES_ZONA[zonaDe(puntaje)]);

export interface FilaRegistro {
  id: string;
  nombre: string;
  dueno?: string;
  categoria?: string;
  estado: string;
  cerrado: boolean;
  proximaRevision?: number;
  /** La revisión ya pasó y el riesgo no está cerrado. */
  vencida: boolean;
  probabilidad: number | null;
  nivelP: number;
  nivelI: number;
  /** De dónde sale el nivel de impacto. */
  origenImpacto: 'usuario' | 'simulación' | 'estimación' | 'sin impacto';
  puntaje: number;
  clase: Clase;
  zona: Zona | ZonaOportunidad;
  /** Lo que aporta al P80 del plazo (días) y del costo, si hay simulación. */
  diasP80: number | null;
  costoP80: number | null;
}

export interface Registro {
  filas: FilaRegistro[];
  /** `matriz[p - 1][i - 1]`: los ids de las amenazas no cerradas en esa casilla. */
  matriz: string[][][];
  matrizOportunidades: string[][][];
  vencidas: number;
}

/** Las casillas de la matriz consolidada, de izquierda a derecha: amenazas I1…I5 y oportunidades I5…I1 (la doble del PMBOK). */
export const COLUMNAS_CONSOLIDADA: readonly { clase: Clase; i: number }[] = [
  ...[1, 2, 3, 4, 5].map((i) => ({ clase: 'amenaza' as const, i })),
  ...[5, 4, 3, 2, 1].map((i) => ({ clase: 'oportunidad' as const, i })),
];

const esCerrado = (estado: string) => /^cerrad/i.test(estado.trim());

/** ¿Solo acorta o ahorra? (nada que alargue ni cueste). */
function oportunidadDe(modelo: ModeloCronograma, id: string): boolean | null {
  const r = modelo.riesgos.find((x) => x.id === id);
  if (!r || r.impactos.length === 0) return null;
  const t = (d?: DistribucionDuracion) => (d ? valorTipico(d) : 0);
  const algoMalo = r.impactos.some((i) => t(i.dias) > 0 || t(i.costo) > 0);
  const algoBueno = r.impactos.some((i) => t(i.dias) < 0 || t(i.costo) < 0);
  return !algoMalo && algoBueno;
}

export function evaluarRegistro(riesgos: readonly RiesgoRegistro[], modelo: ModeloCronograma, sim: SimulacionCronograma | null, hoy: number): Registro {
  const duracion = sim ? sim.deterministico.duracion : Math.max(1, ...modelo.red.actividades.map((a) => a.duracion));
  const costo = sim?.costoBase ?? null;
  const porId = new Map((sim?.eliminacion ?? []).map((e) => [e.id, e]));
  const filas: FilaRegistro[] = riesgos.map((r) => {
    const cerrado = esCerrado(r.estado);
    const op = oportunidadDe(modelo, r.id);
    const clase: Clase = op ? 'oportunidad' : 'amenaza';
    const signo = clase === 'oportunidad' ? -1 : 1;
    const e = porId.get(r.id);
    let nivelI = 1;
    let origen: FilaRegistro['origenImpacto'] = 'sin impacto';
    if (r.impactoCualitativo !== undefined) {
      nivelI = Math.min(5, Math.max(1, Math.round(Math.abs(r.impactoCualitativo))));
      origen = 'usuario';
    } else if (e) {
      const t = duracion > 0 ? Math.max(0, signo * e.reduccionP80) / duracion : 0;
      const c = costo && e.reduccionP80Costo !== null ? Math.max(0, signo * e.reduccionP80Costo) / costo : 0;
      nivelI = nivelPorFraccion(Math.max(t, c));
      origen = 'simulación';
    } else {
      const m = modelo.riesgos.find((x) => x.id === r.id);
      if (m) {
        const dias = m.impactos.reduce((s, i) => s + (i.dias ? valorTipico(i.dias) : 0), 0);
        nivelI = nivelPorFraccion(Math.max(0, signo * dias) / Math.max(1, duracion));
        origen = 'estimación';
      }
    }
    const nivelP = r.probabilidad === null ? 1 : nivelProbabilidadRegistro(r.probabilidad);
    const puntaje = nivelP * nivelI;
    return {
      id: r.id, nombre: r.nombre, estado: r.estado || 'Activo', cerrado,
      ...(r.dueno ? { dueno: r.dueno } : {}), ...(r.categoria ? { categoria: r.categoria } : {}),
      ...(r.proximaRevision !== undefined ? { proximaRevision: r.proximaRevision } : {}),
      vencida: !cerrado && r.proximaRevision !== undefined && r.proximaRevision < Math.floor(hoy),
      probabilidad: r.probabilidad, nivelP, nivelI, origenImpacto: origen, puntaje, clase,
      zona: clase === 'oportunidad' ? zonaOportunidadDe(puntaje) : zonaDe(puntaje),
      diasP80: e ? e.reduccionP80 : null,
      costoP80: e ? e.reduccionP80Costo : null,
    };
  });
  // Primero las amenazas abiertas y luego las oportunidades, de mayor a menor puntaje; los cerrados al final.
  filas.sort((a, b) => Number(a.cerrado) - Number(b.cerrado) || Number(a.clase === 'oportunidad') - Number(b.clase === 'oportunidad')
    || b.puntaje - a.puntaje || Math.abs(b.diasP80 ?? 0) - Math.abs(a.diasP80 ?? 0));
  const vacia = () => Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => [] as string[]));
  const matriz = vacia();
  const matrizOportunidades = vacia();
  for (const f of filas) {
    if (f.cerrado) continue;
    ((f.clase === 'oportunidad' ? matrizOportunidades : matriz)[f.nivelP - 1] as string[][])[f.nivelI - 1]!.push(f.id);
  }
  return { filas, matriz, matrizOportunidades, vencidas: filas.filter((f) => f.vencida).length };
}
