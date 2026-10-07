/**
 * W5: el cronograma dentro del modelo de costos, con `RIESGO.CRONOGRAMA`.
 *
 * `=RIESGO.CRONOGRAMA("H3"; "fecha")` en una celda del modelo de costos vale,
 * en cada iteración de la simulación de costos, la fecha de fin del hito H3
 * **en esa misma iteración** de la simulación del cronograma. Así un costo que
 * depende del tiempo (indirectos, reajustes, multas, intereses) y el plazo
 * salen del mismo escenario, y la confianza conjunta (JCL) con cualquier
 * salida del modelo de costos es la de verdad, no la de dos simulaciones
 * independientes.
 *
 * El cronograma se simula aparte, con la **semilla** del modelo de costos y
 * tantas iteraciones como él; la iteración `i` de los costos toma la `i` del
 * cronograma. Si el modelo de costos repite con más iteraciones (hasta la
 * precisión), el cronograma se vuelve a simular con esas.
 *
 * Medidas: `fecha` (número de serie del fin), `dias` (días laborables desde
 * el inicio, en el calendario del proyecto), `retraso` (días naturales sobre
 * la fecha contractual, hoja Hitos_Contrato), `multa` (la del contrato) y
 * `costo` (del proyecto entero). Sin Office.js: el adaptador lee las hojas.
 */

import { calendarioProyecto, cpmDeterministico } from './cpm.ts';
import { compilarRed } from './red.ts';
import { multaDe, tieneCostos, type HitoContractual, type ModeloCronograma } from './modelo.ts';
import { simularCronograma, type SimulacionCronograma } from './simulacion.ts';
import { normalizarTexto, NOMBRES_PROYECTO, type MedidaCronograma, type PlanCronogramaPublicado } from './planPublicado.ts';

export { MEDIDAS_CRONOGRAMA, medidaDe, type MedidaCronograma } from './planPublicado.ts';

export interface PedidoCronograma {
  /** Lo que se escribió: un ID o un nombre de actividad; vacío o «Proyecto» para el fin del proyecto. */
  hito: string;
  medida: MedidaCronograma;
}

/** La clave de un pedido: el mismo hito escrito con otras mayúsculas es el mismo. */
export function clavePedido(x: PedidoCronograma): string {
  const h = normalizarTexto(x.hito);
  return `${NOMBRES_PROYECTO.has(h) ? '' : h}|${x.medida}`;
}

type Destino = { tipo: 'proyecto' } | { tipo: 'actividad'; id: string; contractual?: HitoContractual };

/** A qué actividad se refiere `hito`: primero por ID, luego por nombre (si no se repite). */
export function buscarHito(m: ModeloCronograma, hito: string): Destino | string {
  const h = normalizarTexto(hito);
  if (NOMBRES_PROYECTO.has(h)) return { tipo: 'proyecto' };
  const acts = m.red.actividades;
  let a = acts.find((x) => normalizarTexto(x.id) === h);
  if (!a) {
    const porNombre = acts.filter((x) => normalizarTexto(x.nombre) === h);
    if (porNombre.length > 1) return `hay ${porNombre.length} actividades llamadas «${hito}»: use su ID`;
    a = porNombre[0];
  }
  if (!a) return `no hay ninguna actividad con el ID o el nombre «${hito}» en la hoja Actividades`;
  const contractual = (m.hitosContractuales ?? []).find((x) => x.actividad === a.id);
  return { tipo: 'actividad', id: a.id, ...(contractual ? { contractual } : {}) };
}

export interface FuenteCronograma {
  /** Iteraciones del cronograma simuladas ahora. */
  readonly hechas: number;
  /** Simula con exactamente `n` iteraciones si no lo estaba. `false` si se canceló. */
  asegurar(n: number, op?: OpcionesFuente): Promise<boolean>;
  /** Las muestras de un pedido, una por iteración (`n` = `hechas`). */
  muestras(pedido: PedidoCronograma, n: number): Float64Array;
  /** El valor del pedido en el plan (duraciones de la hoja, sin riesgos). */
  plan(pedido: PedidoCronograma): number;
}

/** Cancelar: con una señal o preguntando cada 500 iteraciones (como el modelo de costos). */
export interface OpcionesFuente {
  senal?: AbortSignal;
  debeCancelar?: () => boolean;
}

export type CreacionFuente = { ok: true; fuente: FuenteCronograma } | { ok: false; errores: string[] };

interface Resuelto {
  pedido: PedidoCronograma;
  destino: Destino;
}

/**
 * Prepara la simulación del cronograma para los pedidos de las fórmulas.
 * Comprueba cada pedido (que el hito exista, que la medida tenga sentido)
 * antes de simular nada.
 */
export function crearFuenteCronograma(modelo: ModeloCronograma, pedidos: readonly PedidoCronograma[], op: { semilla: number }): CreacionFuente {
  const errores: string[] = [];
  const resueltos = new Map<string, Resuelto>();
  const enRamas = new Set((modelo.ramas ?? []).flatMap((r) => r.opciones.flatMap((o) => o.actividades)));
  const conCostos = tieneCostos(modelo);
  for (const pedido of pedidos) {
    const clave = clavePedido(pedido);
    if (resueltos.has(clave)) continue;
    const destino = buscarHito(modelo, pedido.hito);
    const nombre = `RIESGO.CRONOGRAMA("${pedido.hito}"; "${pedido.medida}")`;
    if (typeof destino === 'string') { errores.push(`${nombre}: ${destino}.`); continue; }
    if (destino.tipo === 'actividad' && enRamas.has(destino.id)) {
      errores.push(`${nombre}: «${pedido.hito}» está en una rama (solo existe en algunas iteraciones); use la actividad que la sigue.`);
      continue;
    }
    if (pedido.medida === 'costo' && destino.tipo !== 'proyecto') { errores.push(`${nombre}: el costo es del proyecto entero; escriba RIESGO.CRONOGRAMA("Proyecto"; "costo").`); continue; }
    if (pedido.medida === 'costo' && !conCostos) { errores.push(`${nombre}: el cronograma no tiene costos (hoja Costos, costos de los riesgos o multas).`); continue; }
    if ((pedido.medida === 'retraso' || pedido.medida === 'multa') && (destino.tipo !== 'actividad' || !destino.contractual)) {
      errores.push(`${nombre}: el retraso y la multa se miden contra una fecha contractual; ponga «${pedido.hito}» en la hoja Hitos_Contrato.`);
      continue;
    }
    resueltos.set(clave, { pedido, destino });
  }
  if (errores.length > 0) return { ok: false, errores };

  const seguir = [...new Set([...resueltos.values()].flatMap((r) => (r.destino.tipo === 'actividad' ? [r.destino.id] : [])))];
  const red = compilarRed(modelo.red);
  const cp = calendarioProyecto(red);
  const cuentaInicio = cp.cuenta(red.inicio);
  const det = cpmDeterministico(red, { ignorarDuras: modelo.configuracion.ignorarRestriccionesDuras });
  let sim: SimulacionCronograma | null = null;
  let costoBase: number | null = null;
  const cache = new Map<string, Float64Array>();

  const valor = (r: Resuelto, fecha: number, dias: number): number => {
    switch (r.pedido.medida) {
      case 'fecha': return fecha;
      case 'dias': return dias;
      case 'retraso': return Math.max(0, Math.floor(fecha) - Math.floor((r.destino as { contractual: HitoContractual }).contractual.fecha));
      case 'multa': return multaDe((r.destino as { contractual: HitoContractual }).contractual, fecha);
      default: return NaN;
    }
  };
  const resuelto = (pedido: PedidoCronograma): Resuelto => {
    const r = resueltos.get(clavePedido(pedido));
    if (!r) throw new Error(`RIESGO.CRONOGRAMA: pedido no preparado (${pedido.hito}; ${pedido.medida})`);
    return r;
  };

  const fuente: FuenteCronograma = {
    get hechas() {
      return sim?.iteraciones ?? 0;
    },
    async asegurar(n, o = {}) {
      const N = Math.max(2, Math.floor(n));
      if (sim && sim.iteraciones === N) return true;
      if (o.senal?.aborted || o.debeCancelar?.()) return false;
      const control = new AbortController();
      o.senal?.addEventListener('abort', () => control.abort());
      try {
        sim = await simularCronograma({
          ...modelo,
          configuracion: { ...modelo.configuracion, iteraciones: N, iteracionesAutomaticas: false, semilla: op.semilla, hitos: seguir },
        }, { soloPrincipal: true, senal: control.signal, progreso: () => { if (o.debeCancelar?.()) control.abort(); } });
      } catch (e) {
        if ((e as Error).name === 'SimulacionCancelada') return false;
        throw e;
      }
      costoBase = sim.costoBase;
      cache.clear();
      return true;
    },
    muestras(pedido, n) {
      if (!sim || n !== sim.iteraciones) throw new Error(`RIESGO.CRONOGRAMA: se pidieron ${n} iteraciones y hay ${sim?.iteraciones ?? 0}`);
      const clave = clavePedido(pedido);
      let x = cache.get(clave);
      if (!x) {
        const r = resuelto(pedido);
        if (r.pedido.medida === 'costo') x = Float64Array.from(sim.costo as Float64Array);
        else if (r.destino.tipo === 'proyecto') {
          const { serie, dias } = sim.fin;
          x = Float64Array.from(serie, (f, i) => valor(r, f, dias[i] as number));
        } else {
          const id = r.destino.id;
          const h = sim.hitos.find((y) => y.id === id) as SimulacionCronograma['hitos'][number];
          x = Float64Array.from(h.serie, (f, i) => valor(r, f, h.dias[i] as number));
        }
        cache.set(clave, x);
      }
      return x;
    },
    plan(pedido) {
      const r = resuelto(pedido);
      if (r.pedido.medida === 'costo') return costoBase ?? NaN;
      if (r.destino.tipo === 'proyecto') return valor(r, det.fin, det.duracion);
      const a = red.indice.get(r.destino.id) as number;
      const f = det.filas[a] as (typeof det.filas)[number];
      // Días laborables del proyecto hasta el final de su último día (un hito: hasta su comienzo).
      const dias = cp.cuenta(cp.instante(f.fin) + (f.duracion > 0 ? 1 : 0)) - cuentaInicio;
      return valor(r, f.fin, dias);
    },
  };
  return { ok: true, fuente };
}

/**
 * Una distribución discreta que resume una muestra (hasta 200 cuantiles), para
 * lo que el complemento enseña de la entrada fuera de la simulación: el tipo,
 * el histograma del panel, «Preparar para compartir». La simulación no la usa:
 * toma las muestras de la fuente tal cual, iteración a iteración.
 */
export function resumenDeMuestra(x: Float64Array): { values: number[]; weights: number[]; media: number } {
  const ord = Float64Array.from(x).sort();
  const m = Math.min(200, ord.length);
  const cuenta = new Map<number, number>();
  for (let i = 0; i < m; i++) {
    const v = ord[Math.min(ord.length - 1, Math.floor(((i + 0.5) / m) * ord.length))] as number;
    cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  }
  const values = [...cuenta.keys()].sort((a, b) => a - b);
  let suma = 0;
  for (const v of x) suma += v;
  return { values, weights: values.map((v) => cuenta.get(v) as number), media: x.length > 0 ? suma / x.length : NaN };
}

/**
 * Los valores del plan de cada actividad y del proyecto, para lo que enseña
 * `RIESGO.CRONOGRAMA` fuera de la simulación (`planPublicado.ts`).
 */
export async function publicarPlan(modelo: ModeloCronograma): Promise<PlanCronogramaPublicado> {
  const pedidos: PedidoCronograma[] = [];
  const nombres: Record<string, string> = {};
  const repetidos = new Set<string>();
  const enRamas = new Set((modelo.ramas ?? []).flatMap((r) => r.opciones.flatMap((o) => o.actividades)));
  for (const a of modelo.red.actividades) {
    if (enRamas.has(a.id)) continue;
    pedidos.push({ hito: a.id, medida: 'fecha' }, { hito: a.id, medida: 'dias' });
    if ((modelo.hitosContractuales ?? []).some((h) => h.actividad === a.id)) pedidos.push({ hito: a.id, medida: 'retraso' }, { hito: a.id, medida: 'multa' });
    const n = normalizarTexto(a.nombre);
    if (n in nombres) repetidos.add(n);
    else nombres[n] = normalizarTexto(a.id);
  }
  for (const n of repetidos) delete nombres[n];
  pedidos.push({ hito: '', medida: 'fecha' }, { hito: '', medida: 'dias' });
  if (tieneCostos(modelo)) pedidos.push({ hito: '', medida: 'costo' });
  const valores: Record<string, number> = {};
  const creada = crearFuenteCronograma(modelo, pedidos, { semilla: modelo.configuracion.semilla });
  if (creada.ok) {
    // El costo base sale de preparar la simulación: basta con dos iteraciones.
    if (tieneCostos(modelo)) await creada.fuente.asegurar(2);
    for (const x of pedidos) valores[clavePedido(x)] = creada.fuente.plan(x);
  }
  return { version: 1, valores, nombres };
}
