/**
 * Los datos del informe PDF del cronograma (V3): lo que se imprime, ya
 * resumido para que quepa en la dirección de la página del informe (como el
 * de costos, `informeImprimible.ts`). Sin Office.js.
 */

import {
  vistaGantt, type ComparacionMitigacion, type Cronograma, type FilaCPM, type ImpactoRiesgo, type InformeSalud,
  type ResultadoSimulacionPlazo, type VistaGantt,
} from '../engine/cronograma/index.ts';
import type { PlantillaInforme } from './plantillaInforme.ts';

/** Barras del Gantt que caben en un informe; si hay más, las más críticas. */
export const GANTT_MAXIMO = 80;
const NUBE_MAXIMO = 400;

export interface DatosInformeCronograma {
  version: 1;
  tipo: 'cronograma';
  titulo: string;
  generado: string;
  libro?: string;
  plantilla: PlantillaInforme;
  determinista: { fin: number; dias: number; criticas: number; total: number; rutaCritica: string[]; fechaCorte?: number };
  salud?: InformeSalud;
  simulacion?: {
    escenario: 'antes' | 'despues';
    iteraciones: number;
    semilla: number;
    forma: string;
    hilos: number;
    cancelada: boolean;
    fechas: ResultadoSimulacionPlazo['fechas'];
    dias: ResultadoSimulacionPlazo['dias'];
    probDeterminista: number;
    narrativa: string[];
    curvaS: ResultadoSimulacionPlazo['curvaS'];
    histograma: ResultadoSimulacionPlazo['histograma'];
    diaCronograma: number;
    riesgos: Array<ImpactoRiesgo & { ocurrio: number }>;
    sinRiesgosP80?: number;
    costos?: {
      determinista: number; media: number; p10: number; p50: number; p80: number; p90: number;
      jclP80: number; jclPlan: number; conjunto80: { q: number; fecha: number; dias: number; costo: number } | null;
      /** [días laborables, costo] de una muestra de iteraciones, y las fechas de sus extremos. */
      nube: Array<[number, number]>;
      nubeDesde: number;
      nubeHasta: number;
    };
    actividades: Array<{ id: string; nombre: string; criticidad: number; finP50: number; finP80: number }>;
  };
  mitigacion?: {
    narrativa: string[];
    antes: { p80: number; costoP80?: number };
    despues: { p80: number; costoP80?: number };
    costoRespuestas: number;
    porRespuesta: ComparacionMitigacion['porRespuesta'];
  };
  gantt: VistaGantt & { truncado: boolean };
}

export function datosInformeCronograma(e: {
  cronograma: Cronograma;
  filas: readonly FilaCPM[];
  fechaFinProyecto: number;
  duracionProyecto: number;
  salud?: InformeSalud | null;
  simulado?: { r: ResultadoSimulacionPlazo; impacto?: { porRiesgo: ImpactoRiesgo[]; sinRiesgos: { p80: number } }; narrativa: string[]; hilos: number; escenario: 'antes' | 'despues' };
  comparacion?: { cmp: ComparacionMitigacion; narrativa: string[] };
  plantilla: PlantillaInforme;
  titulo?: string;
  libro?: string;
  ahora?: Date;
}): DatosInformeCronograma {
  const r = e.simulado?.r;
  const vista = vistaGantt(e.cronograma.actividades, e.filas, e.fechaFinProyecto, r, e.cronograma.fechaCorte);
  let barras = vista.barras;
  const truncado = barras.length > GANTT_MAXIMO;
  if (truncado) {
    const orden = [...barras].sort((a, b) => (b.criticidad ?? (b.critica ? 1 : 0)) - (a.criticidad ?? (a.critica ? 1 : 0)));
    const quedan = new Set(orden.slice(0, GANTT_MAXIMO).map((b) => b.id));
    barras = barras.filter((b) => quedan.has(b.id));
  }
  const criticas = e.filas.filter((f) => f.critica);
  const datos: DatosInformeCronograma = {
    version: 1,
    tipo: 'cronograma',
    titulo: e.plantilla.titulo.trim() || e.titulo || 'Análisis de riesgo del cronograma',
    generado: (e.ahora ?? new Date()).toISOString(),
    ...(e.libro ? { libro: e.libro } : {}),
    plantilla: e.plantilla,
    determinista: {
      fin: e.fechaFinProyecto,
      dias: e.duracionProyecto,
      criticas: criticas.length,
      total: e.filas.length,
      rutaCritica: criticas.map((f) => f.nombre),
      ...(e.cronograma.fechaCorte !== undefined ? { fechaCorte: e.cronograma.fechaCorte } : {}),
    },
    ...(e.salud ? { salud: e.salud } : {}),
    gantt: { ...vista, barras, enlaces: vista.enlaces.filter((x) => barras.some((b) => b.id === x.de) && barras.some((b) => b.id === x.a)), truncado },
  };
  if (r && e.simulado) {
    const s = e.simulado;
    const paso = Math.max(1, Math.floor(r.finProyecto.length / NUBE_MAXIMO));
    const nube: Array<[number, number]> = [];
    let min = Infinity;
    let max = -Infinity;
    if (r.costos) {
      for (let i = 0; i < r.finProyecto.length && nube.length < NUBE_MAXIMO; i += paso) {
        const f = r.finProyecto[i] as number;
        nube.push([Math.round(f * 100) / 100, Math.round(r.costos.porIteracion[i] as number)]);
        min = Math.min(min, f);
        max = Math.max(max, f);
      }
    }
    datos.simulacion = {
      escenario: s.escenario,
      iteraciones: r.iteraciones,
      semilla: r.semilla,
      forma: r.forma === 'pert' ? 'PERT' : 'triangular',
      hilos: s.hilos,
      cancelada: r.cancelada,
      fechas: r.fechas,
      dias: r.dias,
      probDeterminista: r.probDeterminista,
      narrativa: s.narrativa,
      curvaS: r.curvaS,
      histograma: r.histograma,
      diaCronograma: Math.max(0, Math.ceil(r.determinista.dias - 1e-9) - 1),
      riesgos: (s.impacto?.porRiesgo ?? []).map((x) => ({ ...x, ocurrio: r.riesgos.find((y) => y.id === x.id)?.ocurrio ?? NaN })),
      ...(s.impacto ? { sinRiesgosP80: s.impacto.sinRiesgos.p80 } : {}),
      ...(r.costos
        ? {
            costos: {
              determinista: r.costos.determinista, media: r.costos.media, p10: r.costos.p10, p50: r.costos.p50, p80: r.costos.p80, p90: r.costos.p90,
              jclP80: r.costos.jclP80, jclPlan: r.costos.jclPlan, conjunto80: r.costos.conjunto80,
              nube, nubeDesde: nube.length ? r.cal(min) : r.fechas.p10, nubeHasta: nube.length ? r.cal(max) : r.fechas.p90,
            },
          }
        : {}),
      actividades: [...r.actividades]
        .filter((a) => a.criticidad > 0)
        .sort((a, b) => b.criticidad - a.criticidad)
        .slice(0, 15)
        .map((a) => ({ id: a.id, nombre: a.nombre, criticidad: a.criticidad, finP50: a.fin.p50, finP80: a.fin.p80 })),
    };
  }
  if (e.comparacion) {
    const { cmp, narrativa } = e.comparacion;
    datos.mitigacion = {
      narrativa,
      antes: { p80: cmp.antes.fechas.p80, ...(cmp.antes.costos ? { costoP80: cmp.antes.costos.p80 } : {}) },
      despues: { p80: cmp.despues.fechas.p80, ...(cmp.despues.costos ? { costoP80: cmp.despues.costos.p80 } : {}) },
      costoRespuestas: cmp.costoRespuestas,
      porRespuesta: cmp.porRespuesta,
    };
  }
  return datos;
}
