/**
 * El resultado de la simulación del cronograma en palabras, con reglas
 * locales (sin IA externa: nada del libro sale del equipo). Es lo que se lee
 * en una reunión; las cifras están en la hoja de resultados. Sin Office.js.
 */

import { textoFecha } from '../modelo/fechas.ts';
import { confianzaConjunta, convergenciasDe, indicesActividades, resumirHitosContractuales, resumirTiempo } from './analisis.ts';
import type { ModeloCronograma } from './modelo.ts';
import { reservaContingencia } from './reserva.ts';
import type { SimulacionCronograma } from './simulacion.ts';

const pct = (x: number) => (x > 0 && x < 0.01 ? 'menos del 1 %' : x < 1 && x > 0.99 ? 'más del 99 %' : `${Math.round(x * 100)} %`);
const diasL = (x: number) => {
  const k = Math.round(x);
  return `${k.toLocaleString('es-CO')} ${k === 1 ? 'día laborable' : 'días laborables'}`;
};

/** Las actividades de las ramas (Q3.4): ahí no tiene sentido hablar de convergencia. */
export function actividadesDeRamas(modelo: ModeloCronograma): Set<string> {
  return new Set((modelo.ramas ?? []).flatMap((r) => r.opciones.flatMap((o) => o.actividades)));
}

export function narrativaCronograma(sim: SimulacionCronograma, modelo: ModeloCronograma): string[] {
  const out: string[] = [];
  const cfg = modelo.configuracion;
  const mon = cfg.moneda ? ` ${cfg.moneda}` : '';
  const dinero = (x: number) => `${Math.round(x).toLocaleString('es-CO')}${mon}`;
  const fin = resumirTiempo(sim.fin, sim.deterministico.fin, cfg.fechaMeta);
  const p = (q: number) => fin.percentiles.find((x) => Math.abs(x.p - q) < 1e-9) as { serie: number; dias: number };
  out.push(`Hay un 80 % de probabilidad de terminar el ${textoFecha(p(0.8).serie)} o antes (${diasL(p(0.8).dias)}); la mitad de las iteraciones termina hacia el ${textoFecha(p(0.5).serie)}.`);

  const conv = convergenciasDe(sim, actividadesDeRamas(modelo));
  const det = fin.probabilidadDeterministica;
  if (det < 0.5) {
    let frase = `La fecha del cronograma (${textoFecha(fin.serieDeterministica)}) ${det < 0.01 ? 'casi nunca se cumple (menos del 1 % de las iteraciones)' : `solo se cumple en el ${pct(det)} de las iteraciones`}`;
    if (conv.some((c) => c.sesgo >= 0.05)) frase += ': parte de la diferencia viene de las convergencias, donde varias rutas se juntan y basta con que una se retrase';
    out.push(`${frase}.`);
  } else {
    out.push(`La fecha del cronograma (${textoFecha(fin.serieDeterministica)}) se cumple en el ${pct(det)} de las iteraciones.`);
  }
  if (fin.probabilidadMeta !== null && cfg.fechaMeta !== undefined) {
    out.push(`La fecha meta (${textoFecha(cfg.fechaMeta)}) se cumple en el ${pct(fin.probabilidadMeta)} de las iteraciones.`);
  }
  const reserva = reservaContingencia(sim, 0.8);
  if (reserva.dias > 0.5) out.push(`Para comprometer una fecha con un 80 % de confianza hace falta una reserva de ${diasL(reserva.dias)} sobre el cronograma.`);

  // W1: los hitos contractuales más comprometidos y las multas.
  const hitos = resumirHitosContractuales(sim);
  for (const h of [...hitos].sort((a, b) => a.probabilidadCumplir - b.probabilidadCumplir).slice(0, 3)) {
    const margen = h.retrasoP80 > 0 ? `${h.retrasoP80} ${h.retrasoP80 === 1 ? 'día' : 'días'} después` : 'a tiempo';
    out.push(`El hito «${h.nombre}» cumple su fecha contractual (${textoFecha(h.fecha)}) en el ${pct(h.probabilidadCumplir)} de las iteraciones; su P80 es el ${textoFecha(h.p80)}, ${margen}.`);
  }
  const conMulta = hitos.filter((h) => h.multaMedia !== null && h.multaMedia > 0);
  if (conMulta.length) {
    const media = conMulta.reduce((s, h) => s + (h.multaMedia as number), 0);
    out.push(`Las multas por retraso suman de media ${dinero(media)} (ya incluidas en el costo).`);
  }

  // W4: la convergencia que más retrasa, con sus números.
  const c = conv[0];
  if (c && c.sesgo >= 0.05) {
    const ps = c.ramas.map((x) => x.probATiempo);
    const [lo, hi] = [Math.min(...ps), Math.max(...ps)];
    const rango = Math.round(lo * 100) === Math.round(hi * 100) ? pct(lo) : `${Math.round(lo * 100)}–${pct(hi)}`;
    out.push(`En «${c.nombre}» se juntan ${c.ramas.length} rutas: cada una llega a tiempo (${textoFecha(c.inicioPlan)}) en el ${rango} de las iteraciones, pero ${c.ramas.length === 2 ? 'las dos' : `las ${c.ramas.length}`} a la vez solo en el ${pct(c.probATiempo)}. Es el sesgo de convergencia: basta con que una se retrase.`);
  }

  if (sim.sinClima && sim.p80 - sim.sinClima.p80 >= 0.5) out.push(`El clima suma ${diasL(sim.p80 - sim.sinClima.p80)} al P80.`);

  const principal = sim.eliminacion.find((e) => e.reduccionP80 > 0);
  if (principal) out.push(`El riesgo que más pesa es «${principal.nombre}»: sin él, el P80 se adelantaría ${diasL(principal.reduccionP80)}.`);

  const clave = indicesActividades(sim)
    .filter((a) => a.criticidad > 0.2 && a.cruciality > 0 && !sim.riesgoInsertado[sim.red.indice.get(a.id) ?? -1])
    .sort((a, b) => b.criticidad * b.cruciality - a.criticidad * a.cruciality)[0];
  if (clave) out.push(`La actividad que más mueve la fecha de fin es «${clave.nombre}» (crítica en el ${pct(clave.criticidad)} de las iteraciones).`);

  if (sim.costo && sim.costoBase !== null) {
    const o = Float64Array.from(sim.costo).sort();
    const c80 = o[Math.min(o.length - 1, Math.ceil(0.8 * o.length) - 1)] as number;
    let frase = `El costo tiene un 80 % de probabilidad de no pasar de ${dinero(c80)} (el cronograma lo estima en ${dinero(sim.costoBase)})`;
    const j = confianzaConjunta(sim.fin.serie, sim.costo, p(0.8).serie, c80, 1);
    frase += `; cumplir a la vez el P80 del plazo y el del costo solo ocurre en el ${pct(j.jcl)} de las iteraciones`;
    out.push(`${frase}.`);
  }
  return out;
}
