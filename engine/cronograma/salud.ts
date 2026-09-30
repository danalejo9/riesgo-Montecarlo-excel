/**
 * Chequeo de salud del cronograma — P2. Inspirado en la evaluación de 14
 * puntos de la DCMA y en lo que Deltek Acumen hace antes de simular: un
 * Monte Carlo sobre una red mal construida da resultados precisos y falsos
 * («basura entra, basura sale»), así que se mira la red **antes**.
 *
 * Cada comprobación tiene un semáforo:
 * - **rojo**: la simulación no tendría sentido; se bloquea hasta corregirlo.
 * - **amarillo**: se puede simular, pero el resultado será menos fiable; se
 *   dice por qué y qué actividades lo causan.
 * - **verde**: bien.
 * - **info**: no es un defecto, pero conviene saberlo (p. ej. convergencias).
 *
 * Los umbrales son los de la DCMA cuando existen (5 % de lógica faltante,
 * 0 adelantos, 5 % de retardos, 90 % de relaciones FC, 5 % de holguras y
 * duraciones de más de 44 días laborables). Se aplican sobre las actividades
 * que no son hitos, salvo donde se dice.
 */

import type { FilaCPM } from './cpm.ts';
import type { Actividad } from './tipos.ts';

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'info';

export interface Comprobacion {
  codigo: string;
  titulo: string;
  estado: Semaforo;
  /** Una frase con la cifra: «2 de 18 actividades (11 %)». */
  detalle: string;
  /** Por qué importa para el riesgo del plazo, en lenguaje llano. */
  porque: string;
  /** IDs de las actividades implicadas (las primeras 50). */
  actividades: string[];
}

export interface InformeSalud {
  estado: Exclude<Semaforo, 'info'>;
  comprobaciones: Comprobacion[];
  /** `true` si hay algún rojo: el Monte Carlo no se deja lanzar. */
  bloquea: boolean;
}

/** Días laborables a partir de los que una duración o una holgura es «alta» (DCMA). */
export const DIAS_ALTO = 44;

const pct = (a: number, b: number) => (b === 0 ? 0 : a / b);
const textoPct = (a: number, b: number) => `${a} de ${b} (${Math.round(pct(a, b) * 100)} %)`;
const primeras = (ids: string[]) => ids.slice(0, 50);

/**
 * V6: los rangos que se estimaron con optimismo. Tres señales, sobre las
 * actividades con rango: estrechos (el ancho no llega al 15 % del más
 * probable), sesgados a acortar (más margen por debajo que por encima: en
 * la práctica las duraciones se alargan más de lo que se acortan) y todos
 * con el mismo porcentaje (se pusieron en bloque, no uno a uno: solo info).
 */
export const ANCHO_ESTRECHO = 0.15;

function optimismo(tareas: readonly Actividad[]): Comprobacion {
  const con = tareas.filter((a) => a.tresPuntos && a.tresPuntos.min < a.tresPuntos.max);
  const t = (a: Actividad) => a.tresPuntos as NonNullable<Actividad['tresPuntos']>;
  const estrechas = con.filter((a) => (t(a).max - t(a).min) / t(a).masProbable < ANCHO_ESTRECHO).map((a) => a.id);
  const optimistas = con.filter((a) => t(a).masProbable - t(a).min > t(a).max - t(a).masProbable + 1e-9).map((a) => a.id);
  const pcts = new Set(con.map((a) => `${Math.round(((t(a).masProbable - t(a).min) / t(a).masProbable) * 100)}/${Math.round(((t(a).max - t(a).masProbable) / t(a).masProbable) * 100)}`));
  const n = con.length;
  const malas = pct(estrechas.length, n) > 0.25 || pct(optimistas.length, n) > 0.25;
  const iguales = n >= 5 && pcts.size === 1;
  const partes: string[] = [];
  if (estrechas.length > 0) partes.push(`${textoPct(estrechas.length, n)} con un rango de menos del ${Math.round(ANCHO_ESTRECHO * 100)} %`);
  if (optimistas.length > 0) partes.push(`${textoPct(optimistas.length, n)} con más margen para acortarse que para alargarse`);
  if (iguales) partes.push(`todas con el mismo porcentaje (${[...pcts][0]?.replace('/', ' % por debajo, ')} % por encima)`);
  return {
    codigo: 'optimismo',
    titulo: 'Rangos realistas',
    estado: n === 0 ? 'verde' : malas ? 'amarillo' : iguales ? 'info' : 'verde',
    detalle: n === 0 ? 'No hay rangos que revisar.' : partes.length === 0 ? 'Sin señales de optimismo en los rangos.' : `${partes.join('; ')}.`,
    porque: 'Los rangos estimados suelen quedarse cortos y cargados hacia lo bueno (sesgo optimista): el P80 sale antes de lo que será. Un mismo porcentaje para todo indica que no se pensó cada actividad; úsalo como punto de partida y afínalo, o usa la biblioteca «Rangos por tipo».',
    actividades: primeras(malas ? [...new Set([...estrechas, ...optimistas])] : iguales ? con.map((a) => a.id) : []),
  };
}

export function revisarSalud(actividades: readonly Actividad[], filas: readonly FilaCPM[]): InformeSalud {
  const comps: Comprobacion[] = [];
  const tareas = actividades.filter((a) => a.duracion > 0);
  const nT = tareas.length;
  const relaciones = actividades.flatMap((a) => a.predecesoras.map((r) => ({ a, r })));
  const nR = relaciones.length;

  // Sucesoras de cada actividad.
  const sucesoras = new Map<string, number>();
  for (const { r } of relaciones) sucesoras.set(r.predecesora, (sucesoras.get(r.predecesora) ?? 0) + 1);

  // 1. Lógica faltante. Una actividad sin predecesoras es el arranque; una sin
  // sucesoras, el final. Se admite **una** de cada (la que empieza antes y la
  // que termina después); el resto son extremos abiertos.
  const sinPred = actividades.filter((a) => a.predecesoras.length === 0);
  const sinSuc = actividades.filter((a) => !sucesoras.has(a.id));
  const fila = new Map(filas.map((f) => [f.id, f]));
  const inicio = [...sinPred].sort((x, y) => (fila.get(x.id)?.inicioTemprano ?? 0) - (fila.get(y.id)?.inicioTemprano ?? 0))[0];
  const fin = [...sinSuc].sort((x, y) => (fila.get(y.id)?.finTemprano ?? 0) - (fila.get(x.id)?.finTemprano ?? 0))[0];
  const abiertos = [
    ...sinPred.filter((a) => a !== inicio).map((a) => a.id),
    ...sinSuc.filter((a) => a !== fin).map((a) => a.id),
  ];
  const unicos = [...new Set(abiertos)];
  comps.push({
    codigo: 'logica',
    titulo: 'Lógica completa',
    estado: unicos.length === 0 ? 'verde' : pct(unicos.length, actividades.length) > 0.05 ? 'rojo' : 'amarillo',
    detalle: unicos.length === 0
      ? 'Todas las actividades tienen predecesora y sucesora (salvo el inicio y el fin).'
      : `${textoPct(unicos.length, actividades.length)} actividades sin predecesora o sin sucesora.`,
    porque: 'Si una actividad se retrasa y no tiene sucesora, el retraso no llega al fin del proyecto: la simulación lo ignora y el resultado sale optimista.',
    actividades: primeras(unicos),
  });

  // 2. Adelantos (retardos negativos).
  const adelantos = relaciones.filter(({ r }) => r.retardo < 0).map(({ a }) => a.id);
  comps.push({
    codigo: 'adelantos',
    titulo: 'Sin adelantos (retardos negativos)',
    estado: adelantos.length === 0 ? 'verde' : 'amarillo',
    detalle: adelantos.length === 0 ? 'Ninguna relación con retardo negativo.' : `${adelantos.length} relaciones con retardo negativo.`,
    porque: 'Un adelanto dice que una actividad empieza antes de que termine otra, pero no qué parte del trabajo lo permite; es mejor partir la actividad o usar una relación CC.',
    actividades: primeras([...new Set(adelantos)]),
  });

  // 3. Retardos.
  const retardos = relaciones.filter(({ r }) => r.retardo > 0).map(({ a }) => a.id);
  comps.push({
    codigo: 'retardos',
    titulo: 'Pocos retardos',
    estado: pct(retardos.length, nR) > 0.05 ? 'amarillo' : 'verde',
    detalle: `${textoPct(retardos.length, nR)} relaciones con retardo.`,
    porque: 'Un retardo es tiempo fijo que la simulación no puede alargar ni acortar. Si esconde trabajo (curado, trámites), mejor como actividad con su incertidumbre.',
    actividades: primeras([...new Set(retardos)]),
  });

  // 4. Tipos de relación.
  const noFC = relaciones.filter(({ r }) => r.tipo !== 'FS');
  const cf = relaciones.filter(({ r }) => r.tipo === 'SF').map(({ a }) => a.id);
  comps.push({
    codigo: 'relaciones',
    titulo: 'Relaciones fin‑comienzo',
    estado: cf.length > 0 || pct(noFC.length, nR) > 0.1 ? 'amarillo' : 'verde',
    detalle: `${textoPct(nR - noFC.length, nR)} relaciones FC` + (cf.length > 0 ? `; ${cf.length} CF (comienzo‑fin).` : '.'),
    porque: 'Las relaciones CF son raras y casi siempre un error; demasiadas CC o FF hacen que el camino crítico salte de una actividad a otra de formas difíciles de seguir.',
    actividades: primeras([...new Set(cf.length > 0 ? cf : noFC.map(({ a }) => a.id))]),
  });

  // 5. Restricciones. Las que limitan las fechas tardías («no después de»)
  // son «duras» para la DCMA: no mueven la actividad, pero fijan un tope que
  // la lógica no justifica.
  const blandas = actividades.filter((a) => a.inicioNoAntesDe !== undefined || a.terminarNoAntesDe !== undefined).map((a) => a.id);
  const duras = actividades.filter((a) => a.inicioNoDespuesDe !== undefined || a.terminarNoDespuesDe !== undefined).map((a) => a.id);
  const restr = [...new Set([...duras, ...blandas])];
  comps.push({
    codigo: 'restricciones',
    titulo: 'Restricciones de fecha',
    estado: duras.length > 0 || pct(restr.length, actividades.length) > 0.05 ? 'amarillo' : restr.length > 0 ? 'info' : 'verde',
    detalle: restr.length === 0
      ? 'Ninguna.'
      : `${textoPct(restr.length, actividades.length)}: ${blandas.length} «no antes de» y ${duras.length} «no después de» (fechas límite).`,
    porque: 'Una restricción fija una fecha que no sale de la lógica: si la actividad podría empezar antes, la simulación no lo verá. Úsalas solo para fechas externas reales; una fecha límite que no se cumple deja holgura negativa.',
    actividades: primeras(restr),
  });

  // 6. Holgura negativa.
  const negativa = filas.filter((f) => f.holguraTotal < -1e-9).map((f) => f.id);
  comps.push({
    codigo: 'holgura-negativa',
    titulo: 'Sin holgura negativa',
    estado: negativa.length > 0 ? 'rojo' : 'verde',
    detalle: negativa.length === 0 ? 'Ninguna.' : `${negativa.length} actividades con holgura negativa.`,
    porque: 'Holgura negativa significa que el cronograma ya no cumple una restricción: la simulación partiría de un plan imposible.',
    actividades: primeras(negativa),
  });

  // 7. Holgura alta.
  const alta = filas.filter((f) => f.duracion > 0 && f.holguraTotal > DIAS_ALTO).map((f) => f.id);
  comps.push({
    codigo: 'holgura-alta',
    titulo: `Holgura de hasta ${DIAS_ALTO} días`,
    estado: pct(alta.length, nT) > 0.05 ? 'amarillo' : 'verde',
    detalle: `${textoPct(alta.length, nT)} actividades con más de ${DIAS_ALTO} días de holgura.`,
    porque: 'Una holgura muy grande suele indicar lógica que falta: la actividad «flota» y sus retrasos no afectan a nada en la simulación.',
    actividades: primeras(alta),
  });

  // 8. Duraciones largas.
  const largas = tareas.filter((a) => a.duracion > DIAS_ALTO).map((a) => a.id);
  comps.push({
    codigo: 'duracion-larga',
    titulo: `Duraciones de hasta ${DIAS_ALTO} días`,
    estado: pct(largas.length, nT) > 0.05 ? 'amarillo' : 'verde',
    detalle: `${textoPct(largas.length, nT)} actividades de más de ${DIAS_ALTO} días.`,
    porque: 'Las actividades largas esconden detalle: sus relaciones con otras quedan imprecisas y la simulación no puede ver solapes reales.',
    actividades: primeras(largas),
  });

  // 9. Incertidumbre asignada (para el Monte Carlo).
  const sinRango = tareas.filter((a) => !a.tresPuntos || a.tresPuntos.min === a.tresPuntos.max).map((a) => a.id);
  comps.push({
    codigo: 'incertidumbre',
    titulo: 'Incertidumbre en las duraciones',
    estado: sinRango.length === 0 ? 'verde' : pct(sinRango.length, nT) > 0.5 ? 'amarillo' : 'info',
    detalle: sinRango.length === 0
      ? 'Todas las actividades tienen mínimo y máximo.'
      : `${textoPct(sinRango.length, nT)} actividades sin mínimo ni máximo: en la simulación durarán siempre lo mismo.`,
    porque: 'Sin rango, una actividad no aporta incertidumbre: si son muchas, el resultado sale más seguro de lo que es.',
    actividades: primeras(sinRango),
  });

  // 9b. V6: rangos que delatan optimismo (o que no se estimaron uno a uno).
  comps.push(optimismo(tareas));

  // 10. Convergencias (merge bias).
  const conv = actividades.filter((a) => a.predecesoras.length >= 3).map((a) => a.id);
  comps.push({
    codigo: 'convergencias',
    titulo: 'Puntos de convergencia',
    estado: conv.length > 0 ? 'info' : 'verde',
    detalle: conv.length === 0 ? 'Ninguna actividad con tres o más predecesoras.' : `${conv.length} actividades con tres o más predecesoras.`,
    porque: 'Donde se juntan varias rutas, la actividad espera a la más lenta: basta con que una se retrase. Por eso el P80 cae después que la fecha del cronograma aunque cada ruta, por separado, parezca a tiempo.',
    actividades: primeras(conv),
  });

  const hayRojo = comps.some((c) => c.estado === 'rojo');
  const hayAmarillo = comps.some((c) => c.estado === 'amarillo');
  return { estado: hayRojo ? 'rojo' : hayAmarillo ? 'amarillo' : 'verde', comprobaciones: comps, bloquea: hayRojo };
}
