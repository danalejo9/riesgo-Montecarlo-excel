/**
 * Chequeo de calidad del cronograma antes de simular (QRSA, Q1.6), inspirado
 * en los 14 puntos de la DCMA. Sin Office.js.
 *
 * Cada criterio sale con un semáforo y la lista de actividades afectadas. Un
 * ciclo **bloquea** (no hay red que calcular); lo demás advierte: un
 * cronograma con lógica incompleta da resultados de riesgo engañosos (una
 * actividad sin sucesora nunca empuja el fin, por más que se retrase), y
 * por eso se dice antes de simular.
 */

import { cpmDeterministico } from './cpm.ts';
import { incertidumbreDe, type ModeloCronograma } from './modelo.ts';
import { compilarRed, ErrorRed, RESTRICCIONES_DURAS } from './red.ts';

export type Semaforo = 'verde' | 'amarillo' | 'rojo';

export interface CriterioCalidad {
  id: string;
  criterio: string;
  estado: Semaforo;
  detalle: string;
  actividades: string[];
}

export interface ChequeoCalidad {
  criterios: CriterioCalidad[];
  /** Si hay algo que impide simular (un ciclo, una referencia rota). */
  bloquea: boolean;
}

/** Umbral de la DCMA para holguras y duraciones altas (días laborables). */
export const DIAS_UMBRAL = 44;

/** Umbrales configurables del chequeo (Gantt §8); por defecto, los de la DCMA. */
export interface UmbralesCalidad {
  /** Proporción máxima de actividades con lógica faltante. */
  logicaFaltante: number;
  /** Proporción máxima de relaciones con desfase positivo. */
  desfases: number;
  /** Proporción mínima de relaciones fin–comienzo. */
  relacionesFc: number;
  /** Proporción máxima de restricciones duras. */
  duras: number;
  /** Días laborables a partir de los que la holgura o la duración son «altas». */
  dias: number;
  /** Proporción máxima de holguras o duraciones altas. */
  proporcionDias: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesCalidad = {
  logicaFaltante: 0.05, desfases: 0.05, relacionesFc: 0.9, duras: 0.05, dias: DIAS_UMBRAL, proporcionDias: 0.05,
};

function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}

function lista(ids: string[], max = 12): string {
  return ids.length <= max ? ids.join(', ') : `${ids.slice(0, max).join(', ')} y ${ids.length - max} más`;
}

export function chequearCalidad(modelo: ModeloCronograma, umbrales: Partial<UmbralesCalidad> = {}): ChequeoCalidad {
  const U = { ...UMBRALES_POR_DEFECTO, ...umbrales };
  const acts = modelo.red.actividades;
  const criterios: CriterioCalidad[] = [];
  let red;
  try {
    red = compilarRed(modelo.red);
  } catch (e) {
    const ids = e instanceof ErrorRed ? [...e.actividades] : [];
    criterios.push({ id: 'logica', criterio: 'Red calculable (ciclos, referencias)', estado: 'rojo', detalle: (e as Error).message, actividades: ids });
    return { criterios, bloquea: true };
  }
  criterios.push({ id: 'logica', criterio: 'Red calculable (ciclos, referencias)', estado: 'verde', detalle: 'Sin ciclos y con todas las predecesoras existentes.', actividades: [] });

  const n = acts.length;
  const conSucesora = new Set<string>();
  for (const a of acts) for (const p of a.predecesoras) conSucesora.add(p.id);
  const primera = acts[0]?.id;
  const ultima = acts[n - 1]?.id;
  const sinPred = acts.filter((a) => a.predecesoras.length === 0 && a.id !== primera && a.duracion > 0).map((a) => a.id);
  const sinSuc = acts.filter((a) => !conSucesora.has(a.id) && a.id !== ultima && a.duracion > 0).map((a) => a.id);
  const abiertos = [...new Set([...sinPred, ...sinSuc])];
  criterios.push({
    id: 'extremos',
    criterio: 'Extremos abiertos (sin predecesora o sin sucesora)',
    estado: abiertos.length === 0 ? 'verde' : abiertos.length / n > U.logicaFaltante ? 'rojo' : 'amarillo',
    detalle: abiertos.length === 0
      ? 'Todas las actividades tienen predecesora y sucesora, salvo el inicio y el fin.'
      : `${sinPred.length ? `Sin predecesora: ${lista(sinPred)}. ` : ''}${sinSuc.length ? `Sin sucesora: ${lista(sinSuc)}. ` : ''}Una actividad sin sucesora no empuja el fin del proyecto aunque se retrase.`,
    actividades: abiertos,
  });

  const duras = acts.filter((a) => a.restriccion && RESTRICCIONES_DURAS.includes(a.restriccion.tipo)).map((a) => a.id);
  criterios.push({
    id: 'duras',
    criterio: 'Restricciones duras («debe comenzar / terminar el»)',
    estado: duras.length === 0 ? 'verde' : duras.length / n > U.duras ? 'rojo' : 'amarillo',
    detalle: duras.length === 0
      ? 'Ninguna.'
      : `${lista(duras)}: fijan la fecha y anulan la lógica, así que los retrasos no se propagan.${modelo.configuracion.ignorarRestriccionesDuras ? ' La simulación las ignora (Config).' : ' Considere ignorarlas en la simulación (Config).'}`,
    actividades: duras,
  });

  const rels = acts.flatMap((a) => a.predecesoras.map((p) => ({ suc: a.id, ...p })));
  const m = rels.length;
  const adelantos = rels.filter((r) => r.desfase < 0);
  criterios.push({
    id: 'adelantos',
    criterio: 'Desfases negativos (adelantos)',
    estado: adelantos.length === 0 ? 'verde' : 'amarillo',
    detalle: adelantos.length === 0 ? 'Ninguno.' : `${adelantos.map((r) => `${r.id} → ${r.suc} (${r.desfase})`).slice(0, 12).join(', ')}: un adelanto suele esconder una actividad que habría que partir.`,
    actividades: [...new Set(adelantos.map((r) => r.suc))],
  });
  const desfases = rels.filter((r) => r.desfase > 0);
  criterios.push({
    id: 'desfases',
    criterio: 'Desfases positivos (no más del 5 % de las relaciones)',
    estado: m === 0 || desfases.length / m <= U.desfases ? 'verde' : 'amarillo',
    detalle: m === 0 ? 'No hay relaciones.' : `${desfases.length} de ${m} relaciones (${pct(desfases.length / m)}) tienen desfase. Un desfase es una espera sin incertidumbre.`,
    actividades: [...new Set(desfases.map((r) => r.suc))],
  });
  const noFc = rels.filter((r) => r.tipo !== 'FC');
  criterios.push({
    id: 'fc',
    criterio: `Relaciones fin–comienzo (al menos el ${Math.round(U.relacionesFc * 100)} %)`,
    estado: m === 0 || (m - noFc.length) / m >= U.relacionesFc ? 'verde' : 'amarillo',
    detalle: m === 0 ? 'No hay relaciones.' : `${m - noFc.length} de ${m} relaciones (${pct((m - noFc.length) / m)}) son fin–comienzo.`,
    actividades: [...new Set(noFc.map((r) => r.suc))],
  });
  const cf = rels.filter((r) => r.tipo === 'CF');
  criterios.push({
    id: 'cf',
    criterio: 'Relaciones comienzo–fin (CF)',
    estado: cf.length === 0 ? 'verde' : 'amarillo',
    detalle: cf.length === 0 ? 'Ninguna.' : `${cf.map((r) => `${r.id} → ${r.suc}`).slice(0, 12).join(', ')}: son raras y confunden la ruta crítica; revise si son de verdad CF.`,
    actividades: [...new Set(cf.map((r) => r.suc))],
  });

  const det = cpmDeterministico(red, { ignorarDuras: modelo.configuracion.ignorarRestriccionesDuras });
  const holgadas = det.filas.filter((f) => f.holguraTotal > U.dias).map((f) => f.id);
  criterios.push({
    id: 'holgura',
    criterio: `Holgura total mayor de ${U.dias} días laborables`,
    estado: holgadas.length === 0 ? 'verde' : holgadas.length / n > U.proporcionDias ? 'rojo' : 'amarillo',
    detalle: holgadas.length === 0 ? 'Ninguna.' : `${lista(holgadas)}: tanta holgura suele ser lógica incompleta (falta una sucesora).`,
    actividades: holgadas,
  });
  const negativas = det.filas.filter((f) => f.holguraTotal < 0).map((f) => f.id);
  criterios.push({
    id: 'negativa',
    criterio: 'Holgura negativa',
    estado: negativas.length === 0 ? 'verde' : 'rojo',
    detalle: negativas.length === 0 ? 'Ninguna.' : `${lista(negativas)}: el cronograma ya no cumple una fecha límite (una restricción «no terminar después de» o «debe…»).`,
    actividades: negativas,
  });
  const largas = acts.filter((a) => a.duracion > U.dias).map((a) => a.id);
  criterios.push({
    id: 'largas',
    criterio: `Duraciones mayores de ${U.dias} días laborables`,
    estado: largas.length === 0 ? 'verde' : largas.length / n > U.proporcionDias ? 'rojo' : 'amarillo',
    detalle: largas.length === 0 ? 'Ninguna.' : `${lista(largas)}: una actividad tan larga esconde detalle; partirla da una red más fiel.`,
    actividades: largas,
  });

  const tareas = acts.filter((a) => a.duracion > 0);
  const sinInc = tareas.filter((a) => !incertidumbreDe(modelo, a.id)).map((a) => a.id);
  const fr = tareas.length ? sinInc.length / tareas.length : 0;
  criterios.push({
    id: 'incertidumbre',
    criterio: 'Actividades sin incertidumbre asignada',
    estado: sinInc.length === 0 ? 'verde' : fr > 0.2 ? 'rojo' : 'amarillo',
    detalle: sinInc.length === 0 ? 'Todas las tareas tienen una distribución.' : `${sinInc.length} de ${tareas.length} tareas (${pct(fr)}) con duración fija: ${lista(sinInc)}. Los resultados salen optimistas.`,
    actividades: sinInc,
  });

  const nCorr = (modelo.correlaciones?.length ?? 0) + (modelo.gruposCorrelacion?.length ?? 0);
  criterios.push({
    id: 'correlacion',
    criterio: 'Correlación entre duraciones o costos',
    estado: nCorr > 0 ? 'verde' : 'amarillo',
    detalle: nCorr > 0
      ? `${nCorr} ${nCorr === 1 ? 'correlación definida' : 'correlaciones definidas (pares y grupos)'}.`
      : 'No se define ninguna correlación (hoja Correlaciones): con duraciones independientes, los resultados salen optimistas.',
    actividades: [],
  });

  return { criterios, bloquea: false };
}
