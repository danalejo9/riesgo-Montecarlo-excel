/**
 * El resumen ejecutivo del cronograma (QRSA, Q3.7), listo para imprimir o
 * guardar como PDF: supuestos, advertencias de calidad, fin y costo con sus
 * percentiles, JCL, pre/post, top 10 de riesgos y de actividades críticas.
 * Sin Office.js: arma los datos (pequeños: curvas de hasta 200 puntos) que
 * la página `ui/informeCronograma.html` lee de la dirección, comprimidos.
 */

import type { DatosGantt } from './gantt.ts';
import {
  comparacionPrePost, confianzaConjunta, indicesActividades, resumirCosto, resumirHitosContractuales, resumirTiempo,
  type ChequeoCalidad, type CriterioCalidad, type FilaPrePost, type ModeloCronograma, type ResumenHitoContractual, type SimulacionCronograma,
} from '../engine/cronograma/index.ts';
import { codificarJson, decodificarJson } from './codificacion.ts';
import { textoFecha } from '../engine/modelo/fechas.ts';

export interface DatosInformeCronograma {
  version: 1;
  generado: string;
  complemento: string;
  moneda: string;
  supuestos: [string, string][];
  advertencias: Pick<CriterioCalidad, 'criterio' | 'estado' | 'detalle'>[];
  fin: {
    deterministica: number;
    probabilidadDeterministica: number;
    fechaMeta: number | null;
    probabilidadMeta: number | null;
    media: number;
    desviacion: number;
    percentiles: { p: number; serie: number; dias: number }[];
    curvaS: [number, number][];
    curvaSPost: [number, number][] | null;
  };
  costo: {
    base: number;
    contingencia: number;
    pContingencia: number;
    probabilidadBase: number;
    costoMeta: number | null;
    probabilidadMeta: number | null;
    media: number;
    percentiles: { p: number; valor: number }[];
    curvaS: [number, number][];
  } | null;
  jcl: { jcl: number; soloPlazo: number; soloCosto: number } | null;
  prePost: FilaPrePost[];
  riesgos: { id: string; nombre: string; ocurrencia: number; reduccionP80: number; reduccionP80Costo: number | null }[];
  criticas: { id: string; nombre: string; criticidad: number; ssi: number }[];
  rutas: { proporcion: number; actividades: string[] }[];
  /** W1: hitos contractuales (opcional: los informes guardados antes no lo traen). */
  contractuales?: ResumenHitoContractual[];
  avisos: string[];
  /** V6 (07/10): el cronograma para dibujar el Gantt con las fechas de fin posibles. */
  gantt?: DatosGantt;
}

function reducir(curva: [number, number][], max = 200): [number, number][] {
  if (curva.length <= max) return curva;
  const paso = curva.length / max;
  const r: [number, number][] = [];
  for (let k = 0; k < max; k++) r.push(curva[Math.floor(k * paso)] as [number, number]);
  r.push(curva[curva.length - 1] as [number, number]);
  return r;
}

export function datosInformeCronograma(sim: SimulacionCronograma, modelo: ModeloCronograma, calidad: ChequeoCalidad, version: string, ahora = new Date(), gantt?: DatosGantt): DatosInformeCronograma {
  const cfg = modelo.configuracion;
  const fin = resumirTiempo(sim.fin, sim.deterministico.fin, cfg.fechaMeta);
  const post = sim.post ? resumirTiempo(sim.post.fin, sim.deterministico.fin, cfg.fechaMeta) : null;
  const rc = sim.costo && sim.costoBase !== null ? resumirCosto(sim.costo, sim.costoBase, cfg.percentilContingencia, cfg.costoMeta) : null;
  const j = sim.costo && cfg.fechaMeta !== undefined && cfg.costoMeta !== undefined ? confianzaConjunta(sim.fin.serie, sim.costo, cfg.fechaMeta, cfg.costoMeta, 1) : null;
  return {
    version: 1,
    ...(gantt ? { gantt } : {}),
    generado: ahora.toISOString(),
    complemento: version,
    moneda: cfg.moneda ?? '',
    supuestos: [
      ['Fecha de inicio', textoFecha(modelo.red.inicio)],
      ['Actividades · relaciones · riesgos', `${modelo.red.actividades.length} · ${modelo.red.actividades.reduce((s, a) => s + a.predecesoras.length, 0)} · ${modelo.riesgos.length}`],
      ['Iteraciones', sim.iteraciones.toLocaleString('es-CO')],
      ['Semilla', String(cfg.semilla)],
      ['Muestreo', cfg.metodo === 'lhs' ? 'Hipercubo latino' : 'Monte Carlo'],
      ['Duraciones simuladas', cfg.redondeo === 'entero' ? 'Redondeadas al día' : 'Con decimales'],
      ['Restricciones duras', cfg.ignorarRestriccionesDuras ? 'Ignoradas' : 'Respetadas'],
      ['Correlaciones', String((modelo.correlaciones?.length ?? 0) + (modelo.gruposCorrelacion?.length ?? 0))],
      ['Versión del complemento', version],
    ],
    advertencias: calidad.criterios.filter((c) => c.estado !== 'verde').map((c) => ({ criterio: c.criterio, estado: c.estado, detalle: c.detalle })),
    fin: {
      deterministica: fin.serieDeterministica,
      probabilidadDeterministica: fin.probabilidadDeterministica,
      fechaMeta: cfg.fechaMeta ?? null,
      probabilidadMeta: fin.probabilidadMeta,
      media: fin.media,
      desviacion: fin.desviacion,
      percentiles: fin.percentiles,
      curvaS: reducir(fin.curvaS),
      curvaSPost: post ? reducir(post.curvaS) : null,
    },
    costo: rc ? {
      base: rc.base, contingencia: rc.contingencia, pContingencia: rc.pContingencia, probabilidadBase: rc.probabilidadBase,
      costoMeta: cfg.costoMeta ?? null, probabilidadMeta: rc.probabilidadMeta, media: rc.media, percentiles: rc.percentiles, curvaS: reducir(rc.curvaS),
    } : null,
    jcl: j ? { jcl: j.jcl, soloPlazo: j.soloPlazo, soloCosto: j.soloCosto } : null,
    prePost: comparacionPrePost(sim, cfg.fechaMeta, cfg.percentilContingencia),
    riesgos: sim.eliminacion.slice(0, 10).map((e) => ({ id: e.id, nombre: e.nombre, ocurrencia: e.ocurrencia, reduccionP80: e.reduccionP80, reduccionP80Costo: e.reduccionP80Costo })),
    criticas: indicesActividades(sim).filter((x) => !sim.riesgoInsertado[sim.red.indice.get(x.id) ?? -1]).slice(0, 10).map((x) => ({ id: x.id, nombre: x.nombre, criticidad: x.criticidad, ssi: x.ssi })),
    rutas: sim.rutas,
    ...(sim.contractuales.length ? { contractuales: resumirHitosContractuales(sim) } : {}),
    avisos: sim.avisos,
  };
}

export function codificarInformeCronograma(d: DatosInformeCronograma): Promise<string> {
  return codificarJson(d);
}

export async function decodificarInformeCronograma(codigo: string): Promise<DatosInformeCronograma | null> {
  const d = (await decodificarJson(codigo)) as DatosInformeCronograma | null;
  return d && d.version === 1 && Array.isArray(d.supuestos) ? d : null;
}

/** Las iteraciones en CSV (separador «;» y coma decimal, como lo abre Excel en español). */
export function csvIteraciones(sim: SimulacionCronograma): string {
  const n = sim.iteraciones;
  const cab = ['Iteración', 'Fin (días)', 'Fin (fecha)', ...(sim.costo ? ['Costo'] : []), ...sim.hitos.map((h) => `${h.id} (fecha)`), ...sim.red.ids.map((id) => `Duración ${id}`)];
  const num = (x: number) => String(Math.round(x * 1000) / 1000).replace('.', ',');
  const lineas = [cab.join(';')];
  for (let i = 0; i < n; i++) {
    const fila = [String(i + 1), num(sim.fin.dias[i] as number), textoFecha(sim.fin.serie[i] as number)];
    if (sim.costo) fila.push(num(sim.costo[i] as number));
    for (const h of sim.hitos) fila.push(textoFecha(h.serie[i] as number));
    for (const d of sim.duraciones) fila.push(num(d[i] as number));
    lineas.push(fila.join(';'));
  }
  return `\uFEFF${lineas.join('\r\n')}\r\n`;
}
