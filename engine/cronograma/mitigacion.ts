/**
 * Mitigación antes y después (V1). Con los mismos números aleatorios, se
 * simula el proyecto con los riesgos tal como están («antes») y con las
 * respuestas aplicadas («después»: los valores «después» de cada riesgo, más
 * lo que cuestan las respuestas, que se pagan ocurra o no el riesgo). Y cada
 * respuesta por separado: cuántos días de P80 ahorra, cuánto baja el P80 del
 * costo y cuánto devuelve por cada unidad que cuesta.
 *
 * Es lo que convierte el análisis en una decisión: qué respuestas valen la
 * pena y cuáles no.
 */

import { costoRespuestas, riesgosDespues, tieneMitigacion, type RiesgoPlazo } from './riesgos.ts';
import { simularPlazo, type OpcionesSimulacionPlazo, type ResultadoSimulacionPlazo } from './simulacion.ts';
import type { Cronograma } from './tipos.ts';

type Simular = (c: Cronograma, r: readonly RiesgoPlazo[], o: OpcionesSimulacionPlazo) => Promise<ResultadoSimulacionPlazo>;

export interface EfectoRespuesta {
  id: string;
  nombre: string;
  respuesta: string;
  responsable?: string;
  costoRespuesta: number;
  /** Días laborables que adelanta el P80 del plazo. */
  diasP80: number;
  diasP50: number;
  /** Cuánto baja el P80 del costo sin contar lo que cuesta la respuesta (si hay costos). */
  ahorroCostoP80?: number;
  /** `ahorroCostoP80 / costoRespuesta`: más de 1, la respuesta se paga sola. */
  retorno?: number;
}

export interface ComparacionMitigacion {
  antes: ResultadoSimulacionPlazo;
  despues: ResultadoSimulacionPlazo;
  costoRespuestas: number;
  porRespuesta: EfectoRespuesta[];
}

/** El cronograma y los riesgos «después» (todas las respuestas, o solo la de `solo`). */
export function escenarioDespues(c: Cronograma, riesgos: readonly RiesgoPlazo[], solo?: string): { cronograma: Cronograma; riesgos: RiesgoPlazo[] } {
  const extra = costoRespuestas(riesgos, solo);
  return {
    cronograma: extra > 0 ? { ...c, costoAdicional: (c.costoAdicional ?? 0) + extra } : c,
    riesgos: riesgosDespues(riesgos, solo),
  };
}

export async function compararMitigacion(
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
  op: OpcionesSimulacionPlazo,
  simular: Simular = simularPlazo,
  antesYa?: ResultadoSimulacionPlazo,
): Promise<ComparacionMitigacion> {
  const opciones = { ...op, alAvanzar: undefined };
  const conRespuesta = riesgos.filter(tieneMitigacion);
  const total = conRespuesta.length + 2;
  let hechas = 0;
  const avanzar = () => op.alAvanzar?.(++hechas, total);

  const antes = antesYa ?? (await simular(c, riesgos, opciones));
  avanzar();
  const todo = escenarioDespues(c, riesgos);
  const despues = await simular(todo.cronograma, todo.riesgos, opciones);
  avanzar();

  const porRespuesta: EfectoRespuesta[] = [];
  for (const r of conRespuesta) {
    if (op.debeCancelar?.()) break;
    const e = escenarioDespues(c, riesgos, r.id);
    const s = await simular(e.cronograma, e.riesgos, opciones);
    const costoR = r.costoRespuesta ?? 0;
    const efecto: EfectoRespuesta = {
      id: r.id,
      nombre: r.nombre,
      respuesta: r.respuesta ?? '',
      ...(r.responsable ? { responsable: r.responsable } : {}),
      costoRespuesta: costoR,
      diasP80: antes.dias.p80 - s.dias.p80,
      diasP50: antes.dias.p50 - s.dias.p50,
    };
    if (antes.costos && s.costos) {
      // El P80 del costo «después» ya incluye lo que cuesta la respuesta: se suma para ver el ahorro bruto.
      efecto.ahorroCostoP80 = antes.costos.p80 - (s.costos.p80 - costoR);
      if (costoR > 0) efecto.retorno = efecto.ahorroCostoP80 / costoR;
    }
    porRespuesta.push(efecto);
    avanzar();
  }
  porRespuesta.sort((a, b) => (b.retorno ?? -Infinity) - (a.retorno ?? -Infinity) || b.diasP80 - a.diasP80);
  return { antes, despues, costoRespuestas: costoRespuestas(riesgos), porRespuesta };
}
