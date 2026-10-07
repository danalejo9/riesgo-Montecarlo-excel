/**
 * La hoja `Resultados_Cronograma` (QRSA, Q1.5): supuestos, advertencias de
 * calidad, fin del proyecto e hitos con sus percentiles, tornado por
 * eliminación de riesgos, índices por actividad y convergencia. Sin
 * Office.js: arma la matriz de valores y formatos que `cronogramaLibro.ts`
 * escribe de una vez. Se regenera entera en cada simulación (nunca se edita
 * a mano).
 */

import {
  comparacionPrePost, confianzaConjunta, convergenciaP80, cronogramaAjustado, indicesActividades, NIVELES_RESERVA, reservaContingencia, resumirCosto, resumirHitosContractuales, resumirTiempo,
  type ChequeoCalidad, type ModeloCronograma, type ResumenTiempo, type SimulacionCronograma,
} from '../engine/cronograma/index.ts';
import { FORMATO_FECHA, type Celda } from './cronogramaHojas.ts';

export interface HojaResultados {
  valores: Celda[][];
  formatos: (string | null)[][];
  /** Filas (0-based) en negrita: títulos de sección y encabezados de tabla. */
  negritas: number[];
  /** Filas de título de sección (0-based), para destacarlas. */
  titulos: number[];
  /** Celdas con el semáforo de calidad: [fila, columna, estado]. */
  semaforos: [number, number, 'verde' | 'amarillo' | 'rojo'][];
  /** Rango de la curva S del fin (para el gráfico), en notación A1. */
  rangoCurva: string | null;
  /** Los gráficos de la derecha: rango de sus datos, título y tipo. */
  graficos: { rango: string; titulo: string; tipo: 'linea' | 'dispersion' }[];
}

const ANCHO = 9;
const PCT = '0.0%';
const DIAS = '0.0';
const MONEDA = '#,##0';

export interface DatosResultados {
  sim: SimulacionCronograma;
  modelo: ModeloCronograma;
  calidad: ChequeoCalidad;
  /** Número de serie de la fecha y hora de la corrida. */
  ahora: number;
  version: string;
}

export function resumenesDe(sim: SimulacionCronograma, modelo: ModeloCronograma): { fin: ResumenTiempo; hitos: ResumenTiempo[] } {
  const meta = modelo.configuracion.fechaMeta;
  const fin = resumirTiempo(sim.fin, sim.deterministico.fin, meta);
  const hitos = sim.hitos.map((h) => {
    const det = sim.deterministico.filas.find((f) => f.id === h.id)?.fin ?? NaN;
    return resumirTiempo(h, det);
  });
  return { fin, hitos };
}

export function hojaResultados(d: DatosResultados): HojaResultados {
  const { sim, modelo, calidad } = d;
  const cfg = modelo.configuracion;
  const valores: Celda[][] = [];
  const formatos: (string | null)[][] = [];
  const negritas: number[] = [];
  const titulos: number[] = [];
  const semaforos: HojaResultados['semaforos'] = [];
  const fila = (vals: Celda[], fmts: (string | null)[] = [], negrita = false) => {
    const v = [...vals];
    while (v.length < ANCHO) v.push(null);
    const f = [...fmts];
    while (f.length < ANCHO) f.push(null);
    if (negrita) negritas.push(valores.length);
    valores.push(v);
    formatos.push(f);
    return valores.length - 1;
  };
  const titulo = (t: string) => {
    fila([]);
    const i = fila([t], [], true);
    titulos.push(i);
  };

  const i0 = fila(['Resultados del cronograma'], [], true);
  titulos.push(i0);
  fila(['Hoja generada por el complemento en cada simulación: no la edite a mano.']);

  titulo('Supuestos de la corrida');
  fila(['Fecha de la corrida', d.ahora], [null, 'dd/mm/yyyy hh:mm']);
  fila(['Versión del complemento', d.version]);
  fila(['Fecha de inicio', modelo.red.inicio], [null, FORMATO_FECHA]);
  fila(['Calendario del proyecto', modelo.red.calendarioProyecto ?? modelo.red.calendarios[0]?.id ?? '']);
  fila(['Iteraciones', sim.iteraciones], [null, '#,##0']);
  fila(['Semilla', cfg.semilla]);
  fila(['Muestreo', cfg.metodo === 'lhs' ? 'Hipercubo latino' : 'Monte Carlo']);
  fila(['Duraciones simuladas', cfg.redondeo === 'entero' ? 'Redondeadas al día' : 'Con decimales']);
  fila(['Restricciones duras', cfg.ignorarRestriccionesDuras ? 'Ignoradas en la simulación' : 'Respetadas']);
  fila(['Clima probabilístico', modelo.clima ? `Sí: ${modelo.clima.afecta.length} actividades expuestas` : 'No']);
  fila(['Actividades / relaciones / riesgos', `${sim.red.n} / ${sim.red.relPred.length} / ${modelo.riesgos.length}`]);
  fila(['Tiempo de cálculo (s)', sim.milisegundos / 1000], [null, '0.00']);

  titulo('Advertencias de calidad del cronograma');
  const avisos = calidad.criterios.filter((c) => c.estado !== 'verde');
  if (avisos.length === 0) fila(['Todos los criterios en verde.']);
  else {
    fila(['Estado', 'Criterio', 'Detalle'], [], true);
    for (const c of avisos) {
      const i = fila([c.estado === 'rojo' ? 'Rojo' : 'Amarillo', c.criterio, c.detalle]);
      semaforos.push([i, 0, c.estado]);
    }
  }

  const { fin, hitos } = resumenesDe(sim, modelo);
  const bloqueTiempo = (r: ResumenTiempo, t: string) => {
    titulo(t);
    fila(['Fecha determinística (sin riesgos)', r.serieDeterministica], [null, FORMATO_FECHA]);
    fila(['Probabilidad de cumplirla', r.probabilidadDeterministica], [null, PCT]);
    if (r.probabilidadMeta !== null) {
      fila(['Fecha meta', cfg.fechaMeta ?? null], [null, FORMATO_FECHA]);
      fila(['Probabilidad de cumplir la meta', r.probabilidadMeta], [null, PCT]);
    }
    fila(['Media (días laborables)', r.media], [null, DIAS]);
    fila(['Desviación estándar (días)', r.desviacion], [null, DIAS]);
    fila(['Mínimo simulado', r.serieMinima, r.minimo], [null, FORMATO_FECHA, DIAS]);
    fila(['Máximo simulado', r.serieMaxima, r.maximo], [null, FORMATO_FECHA, DIAS]);
    fila(['Percentil', 'Fecha', 'Días laborables'], [], true);
    for (const p of r.percentiles) fila([`P${Math.round(p.p * 100)}`, p.serie, p.dias], [null, FORMATO_FECHA, DIAS]);
  };
  bloqueTiempo(fin, 'Fin del proyecto');
  for (const h of hitos) bloqueTiempo(h, `Hito: ${h.id} · ${h.nombre}`);

  // W1: hitos contractuales y multas.
  const contractuales = resumirHitosContractuales(sim);
  if (contractuales.length) {
    titulo('Hitos contractuales');
    fila(['Hito', 'Fecha contractual', 'Probabilidad de cumplir', 'Fin P50', 'Fin P80', 'Retraso P80 (días naturales)', 'Multa por día', 'Multa esperada', 'Multa P80'], [], true);
    for (const h of contractuales) {
      fila([`${h.id} · ${h.nombre}`, h.fecha, h.probabilidadCumplir, h.p50, h.p80, h.retrasoP80, h.multaDia, h.multaMedia, h.multaP80],
        [null, FORMATO_FECHA, PCT, FORMATO_FECHA, FORMATO_FECHA, '0', MONEDA, MONEDA, MONEDA]);
    }
    if (contractuales.some((h) => h.multaMedia !== null)) fila(['Las multas se suman al costo de cada iteración: están dentro de la contingencia y de la probabilidad conjunta.']);
  }

  titulo('Tornado por eliminación de riesgos');
  if (sim.eliminacion.length === 0) fila(['El cronograma no tiene riesgos activos.']);
  else {
    const conCosto = sim.costo !== null;
    const pc = Math.round(100 * (cfg.percentilContingencia ?? 0.8));
    fila(['Riesgo', 'Descripción', 'Ocurrió', 'Media sin él (días)', 'Baja la media', 'P80 sin él (días)', 'Baja el P80', ...(conCosto ? ['Baja el costo medio', `Baja el costo P${pc}`] : [])], [], true);
    for (const e of sim.eliminacion) {
      fila([e.id, e.nombre, e.ocurrencia, e.media, e.reduccionMedia, e.p80, e.reduccionP80, ...(conCosto ? [e.reduccionMediaCosto, e.reduccionP80Costo] : [])],
        [null, null, PCT, DIAS, DIAS, DIAS, DIAS, MONEDA, MONEDA]);
    }
    if (sim.sinRiesgos) {
      const mc = sim.costo ? sim.costo.reduce((a, b) => a + b, 0) / sim.costo.length : null;
      const p80c = sim.costo ? resumirCosto(sim.costo, sim.costoBase ?? 0, cfg.percentilContingencia).valorContingencia : null;
      fila(['Todos', 'Sin ningún riesgo (solo la incertidumbre de las duraciones)', null, sim.sinRiesgos.media, sim.media - sim.sinRiesgos.media, sim.sinRiesgos.p80, sim.p80 - sim.sinRiesgos.p80,
        ...(conCosto && mc !== null && sim.sinRiesgos.mediaCosto !== null && p80c !== null && sim.sinRiesgos.p80Costo !== null ? [mc - sim.sinRiesgos.mediaCosto, p80c - sim.sinRiesgos.p80Costo] : [])],
        [null, null, null, DIAS, DIAS, DIAS, DIAS, MONEDA, MONEDA]);
    }
  }

  if (sim.sinClima) {
    titulo('Clima (V8)');
    fila(['', 'Media (días)', 'P80 (días)'], [], true);
    fila(['Con el clima', sim.media, sim.p80], [null, DIAS, DIAS]);
    fila(['Sin el clima (con los riesgos)', sim.sinClima.media, sim.sinClima.p80], [null, DIAS, DIAS]);
    fila(['Lo que suma el clima', sim.media - sim.sinClima.media, sim.p80 - sim.sinClima.p80], [null, DIAS, DIAS]);
  }

  // Costo (Q2.1, Q2.3) y probabilidad conjunta (Q2.4).
  const rc = sim.costo && sim.costoBase !== null ? resumirCosto(sim.costo, sim.costoBase, cfg.percentilContingencia, cfg.costoMeta) : null;
  if (rc) {
    const mon = cfg.moneda ? ` (${cfg.moneda})` : '';
    titulo(`Costo del proyecto${mon}`);
    fila(['Costo base (valores base, sin riesgos)', rc.base], [null, MONEDA]);
    fila(['Probabilidad de no pasarse del costo base', rc.probabilidadBase], [null, PCT]);
    fila([`Contingencia: P${Math.round(rc.pContingencia * 100)} − costo base`, rc.contingencia], [null, MONEDA]);
    if (rc.probabilidadMeta !== null) {
      fila(['Costo meta', cfg.costoMeta ?? null], [null, MONEDA]);
      fila(['Probabilidad de cumplir el costo meta', rc.probabilidadMeta], [null, PCT]);
    }
    fila(['Media · desviación', rc.media, rc.desviacion], [null, MONEDA, MONEDA]);
    fila(['Mínimo · máximo simulados', rc.minimo, rc.maximo], [null, MONEDA, MONEDA]);
    fila(['Percentil', 'Costo'], [], true);
    for (const p of rc.percentiles) fila([`P${Math.round(p.p * 100)}`, p.valor], [null, MONEDA]);
    if (cfg.fechaMeta !== undefined && cfg.costoMeta !== undefined && sim.costo) {
      const j = confianzaConjunta(sim.fin.serie, sim.costo, cfg.fechaMeta, cfg.costoMeta);
      titulo('Confianza conjunta costo–plazo (JCL)');
      fila(['Cumplen la fecha meta y el costo meta a la vez', j.jcl], [null, PCT]);
      fila(['Solo la fecha meta · solo el costo meta', j.soloPlazo, j.soloCosto], [null, PCT, PCT]);
    }
  }

  // W2: reserva de contingencia y de dónde sale, en los tres niveles.
  if (sim.eliminacion.length || sim.sinRiesgos) {
    const reservas = NIVELES_RESERVA.map((p) => reservaContingencia(sim, p));
    const conCosto = reservas[0]?.costo !== null;
    const niv = NIVELES_RESERVA.map((p) => `P${Math.round(p * 100)}`);
    titulo('Reserva de contingencia y de dónde sale');
    fila(['Las partes suman la reserva: incertidumbre (sin riesgos), cada riesgo (las oportunidades restan) y, si queda, el efecto conjunto.']);
    fila(['', ...niv.map((n) => `Días ${n}`), ...(conCosto ? niv.map((n) => `Costo ${n}`) : [])], [], true);
    const filaNivel = (nombre: string, dias: (r: (typeof reservas)[number]) => number, costo: (r: (typeof reservas)[number]) => number | null, negrita = false) =>
      fila([nombre, ...reservas.map(dias), ...(conCosto ? reservas.map(costo) : [])], [null, DIAS, DIAS, DIAS, MONEDA, MONEDA, MONEDA], negrita);
    filaNivel('Plan (determinístico, costo base)', (r) => r.plan.dias, (r) => r.plan.costo);
    filaNivel('Objetivo (percentil)', (r) => r.objetivo.dias, (r) => r.objetivo.costo);
    filaNivel('Reserva', (r) => r.dias, (r) => r.costo, true);
    // Las partes de los tres niveles (el efecto conjunto puede salir solo en alguno).
    const ids = [...new Set(reservas.flatMap((r) => r.partes.map((x) => x.id)))];
    for (const id of ids) {
      const parte = (r: (typeof reservas)[number]) => r.partes.find((x) => x.id === id);
      const nombre = reservas.map(parte).find(Boolean)?.nombre ?? id;
      filaNivel(id === 'incertidumbre' || id === 'conjunto' ? nombre : `${id} · ${nombre}`, (r) => parte(r)?.dias ?? 0, (r) => parte(r)?.costo ?? 0);
    }
  }

  // Pre y post mitigación (Q2.5).
  const pp = comparacionPrePost(sim, cfg.fechaMeta, cfg.percentilContingencia);
  if (pp.length) {
    titulo('Pre y post mitigación (mismos números aleatorios)');
    fila(['Medida', 'Pre', 'Post', 'Gana la mitigación'], [], true);
    for (const r of pp) {
      const f = r.unidad === 'fecha' ? FORMATO_FECHA : r.unidad === 'costo' ? MONEDA : r.unidad === 'probabilidad' ? PCT : DIAS;
      fila([r.medida, r.pre, r.post, r.diferencia], [null, f, f, r.unidad === 'fecha' ? '0' : f]);
    }
    const mit = modelo.riesgos.reduce((a, r) => a + (r.costoMitigacion ?? 0), 0);
    if (mit > 0) fila(['Costo de la mitigación (incluido en el post)', mit], [null, MONEDA]);
  }

  // Rutas críticas más frecuentes (Q3.2).
  if (sim.rutas.length) {
    titulo('Rutas críticas más frecuentes');
    fila(['Iteraciones', 'Actividades críticas'], [], true);
    for (const r of sim.rutas) fila([r.proporcion, r.actividades.join(' → ')], [PCT]);
  }

  // Correlación lograda (Q2.2).
  if (sim.correlacionLograda.length) {
    titulo('Correlación pedida y lograda');
    fila(['Elemento A', 'Elemento B', 'Pedida', 'Aplicada (Higham)', 'Lograda'], [], true);
    for (const c of sim.correlacionLograda) fila([c.a, c.b, c.objetivo, c.aplicada, c.lograda], [null, null, '0.00', '0.00', '0.00']);
  }
  if (sim.avisos.length) {
    titulo('Avisos de la simulación');
    for (const a of sim.avisos) fila([a]);
  }

  // Cronograma ajustado por riesgo (Q3.3).
  const pAj = 0.8;
  titulo('Cronograma ajustado por riesgo (P50 y P80 de cada actividad)');
  fila(['ID', 'Actividad', 'Inicio base', 'Fin base', 'Inicio P50', 'Fin P50', 'Inicio P80', 'Fin P80', 'Corrimiento del fin (días)'], [], true);
  for (const x of cronogramaAjustado(sim, pAj)) {
    fila([x.id, x.nombre, x.inicioBase, x.finBase, x.inicioP50, x.finP50, x.inicioP, x.finP, x.desplazamiento],
      [null, null, FORMATO_FECHA, FORMATO_FECHA, FORMATO_FECHA, FORMATO_FECHA, FORMATO_FECHA, FORMATO_FECHA, '0']);
  }

  titulo('Índices por actividad');
  fila(['ID', 'Actividad', 'Criticidad', 'Cruciality', 'SSI', 'Duración media', 'Holgura (det.)', 'Inicio (det.)', 'Fin (det.)'], [], true);
  const det = new Map(sim.deterministico.filas.map((f) => [f.id, f]));
  for (const x of indicesActividades(sim)) {
    const f = det.get(x.id);
    fila([x.id, x.nombre, x.criticidad, x.cruciality, x.ssi, x.duracionMedia, x.holgura, f?.inicio ?? null, f?.fin ?? null],
      [null, null, PCT, '0.00', '0.00', DIAS, '0.##', FORMATO_FECHA, FORMATO_FECHA]);
  }

  titulo('Convergencia del P80 del fin (bloques de 500)');
  const conv = convergenciaP80(sim.fin.dias);
  if (conv.puntos.length < 2) fila(['Hacen falta al menos 1.000 iteraciones para ver la convergencia.']);
  else {
    fila([conv.convergio
      ? `Convergió: el P80 cambió ${(100 * (conv.ultimoCambio ?? 0)).toFixed(2)} % en el último bloque (criterio: menos de 0,5 %).`
      : `Aún no converge: el P80 cambió ${(100 * (conv.ultimoCambio ?? 0)).toFixed(2)} % en el último bloque; suba las iteraciones.`]);
    fila(['Iteraciones', 'P80 (días)'], [], true);
    for (const p of conv.puntos) fila([p.iteraciones, p.p80], ['#,##0', DIAS]);
  }

  // Los datos de los gráficos, a la derecha, de dos en dos columnas desde la K.
  const graficos: HojaResultados['graficos'] = [];
  const bloques: { titulo: string; enc: [string, string]; datos: [number, number][]; fmt: [string, string]; tipo: 'linea' | 'dispersion' }[] = [];
  if (fin.curvaS.length > 1) bloques.push({ titulo: 'Curva S: probabilidad de terminar a más tardar en cada fecha', enc: ['Fecha', 'Probabilidad acumulada'], datos: fin.curvaS, fmt: [FORMATO_FECHA, PCT], tipo: 'linea' });
  if (rc && rc.curvaS.length > 1) bloques.push({ titulo: 'Curva S del costo', enc: ['Costo', 'Probabilidad acumulada'], datos: rc.curvaS, fmt: [MONEDA, PCT], tipo: 'linea' });
  if (sim.costo && cfg.fechaMeta !== undefined && cfg.costoMeta !== undefined) {
    const j = confianzaConjunta(sim.fin.serie, sim.costo, cfg.fechaMeta, cfg.costoMeta, 1000);
    bloques.push({ titulo: 'Costo frente a fecha de fin (cada punto, una iteración)', enc: ['Fecha de fin', 'Costo'], datos: j.puntos, fmt: [FORMATO_FECHA, MONEDA], tipo: 'dispersion' });
  }
  const letra = (c: number) => (c < 26 ? String.fromCharCode(65 + c) : String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26)));
  bloques.forEach((b, k) => {
    const col = ANCHO + 1 + 3 * k;
    const filas = [[b.titulo, null], b.enc, ...b.datos] as Celda[][];
    filas.forEach((par, i) => {
      while (valores.length <= i + 2) fila([]);
      const v = valores[i + 2] as Celda[];
      const f = formatos[i + 2] as (string | null)[];
      while (v.length < col + 2) {
        v.push(null);
        f.push(null);
      }
      v[col] = par[0] as Celda;
      v[col + 1] = par[1] as Celda;
      if (i >= 2) { f[col] = b.fmt[0]; f[col + 1] = b.fmt[1]; }
    });
    graficos.push({ rango: `${letra(col)}4:${letra(col + 1)}${b.datos.length + 4}`, titulo: b.titulo, tipo: b.tipo });
  });
  // Toda fila tiene que tener el mismo ancho.
  const ancho = Math.max(...valores.map((v) => v.length));
  for (let r = 0; r < valores.length; r++) {
    while ((valores[r] as Celda[]).length < ancho) {
      (valores[r] as Celda[]).push(null);
      (formatos[r] as (string | null)[]).push(null);
    }
  }
  const rangoCurva = graficos[0]?.tipo === 'linea' && fin.curvaS.length > 1 ? (graficos[0]?.rango ?? null) : null;
  return { valores, formatos, negritas, titulos, semaforos, rangoCurva, graficos };
}
