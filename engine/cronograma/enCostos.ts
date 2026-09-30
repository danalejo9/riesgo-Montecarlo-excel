/**
 * W5: el cronograma dentro del modelo de costos, con `RIESGO.CRONOGRAMA`.
 *
 * `=RIESGO.CRONOGRAMA("H3"; "fecha")` en una celda del modelo de costos vale,
 * en cada iteración de la simulación de costos, la fecha de fin del hito H3
 * **en esa misma iteración** de la simulación del cronograma. Así un costo que
 * depende del tiempo (indirectos, reajustes, multas, intereses) y el plazo
 * salen del mismo escenario, y la confianza conjunta (JCL) con cualquier
 * salida del modelo de costos es la de verdad, no la de dos simulaciones
 * independientes. Hasta ahora el plazo llegaba al modelo de costos con
 * `RIESGO.EMPIRICA` sobre la hoja «Plazo simulado»: la misma forma, pero sin
 * la relación iteración a iteración.
 *
 * El cronograma se simula aparte, con la **misma semilla** y tantas
 * iteraciones como el modelo de costos; la iteración `i` de los costos toma la
 * `i` del cronograma. Las iteraciones del cronograma se numeran globalmente
 * (ver `simularTramo`), así que pedir más (una tanda más del modo automático)
 * solo añade las que faltan: las primeras no cambian.
 *
 * Sin Office.js: el adaptador lee las hojas y le pasa aquí el cronograma.
 */

import { calcularCPM } from './cpm.ts';
import { multaDe, type HitoContractual } from './hitos.ts';
import { leerCronograma } from './lectorTabla.ts';
import { leerRiesgosPlazo, riesgosActivos, type RiesgoPlazo } from './riesgos.ts';
import {
  bloquePlazo, combinarAcumuladores, diaFin, nuevoAcumulador, planDe, prepararPlazo, simularTramo,
  type AcumuladorPlazo, type FormaDuracion, type PlazoPreparado,
} from './simulacion.ts';
import type { Cronograma } from './tipos.ts';
import { normalizarTexto, NOMBRES_PROYECTO, type MedidaCronograma, type PlanCronogramaPublicado } from './planPublicado.ts';

export { MEDIDAS_CRONOGRAMA, medidaDe, type MedidaCronograma } from './planPublicado.ts';

const sinTildes = normalizarTexto;
const PROYECTO = NOMBRES_PROYECTO;

export interface PedidoCronograma {
  /** Lo que se escribió: un ID o un nombre de actividad; vacío o «Proyecto» para el fin del proyecto. */
  hito: string;
  medida: MedidaCronograma;
}

/** La clave de un pedido: el mismo hito escrito con otras mayúsculas es el mismo. */
export function clavePedido(x: PedidoCronograma): string {
  const h = sinTildes(x.hito);
  return `${PROYECTO.has(h) ? '' : h}|${x.medida}`;
}

type Destino = { tipo: 'proyecto' } | { tipo: 'actividad'; a: number; contractual?: HitoContractual };

/** A qué actividad se refiere `hito`: primero por ID, luego por nombre (si no se repite). */
export function buscarHito(c: Cronograma, hito: string): Destino | string {
  const h = sinTildes(hito);
  if (PROYECTO.has(h)) return { tipo: 'proyecto' };
  let a = c.actividades.findIndex((x) => sinTildes(x.id) === h);
  if (a < 0) {
    const porNombre = c.actividades.flatMap((x, i) => (sinTildes(x.nombre) === h ? [i] : []));
    if (porNombre.length > 1) return `hay ${porNombre.length} actividades llamadas «${hito}»: usa su ID`;
    a = porNombre[0] ?? -1;
  }
  if (a < 0) return `no hay ninguna actividad con el ID o el nombre «${hito}» en la hoja «Actividades»`;
  const act = c.actividades[a] as Cronograma['actividades'][number];
  const contractual = (c.hitos ?? []).find((x) => x.id === act.id);
  return { tipo: 'actividad', a, ...(contractual ? { contractual } : {}) };
}

interface Resuelto {
  pedido: PedidoCronograma;
  destino: Destino;
  /** Índice en `p.seguir` (solo actividades). */
  j: number;
}

export interface FuenteCronograma {
  /** Iteraciones del cronograma simuladas hasta ahora. */
  readonly hechas: number;
  /**
   * Simula las iteraciones que falten hasta `n`. `false` si se canceló antes
   * de llegar (lo simulado se conserva).
   */
  asegurar(n: number, op?: { ceder?: () => Promise<void>; debeCancelar?: () => boolean }): Promise<boolean>;
  /** Las `n` primeras muestras de un pedido (`n` ≤ `hechas`). */
  muestras(pedido: PedidoCronograma, n: number): Float64Array;
  /** El valor del pedido en el plan (duraciones de la hoja, sin riesgos). */
  plan(pedido: PedidoCronograma): number;
}

export type CreacionFuente = { ok: true; fuente: FuenteCronograma } | { ok: false; errores: string[] };

/**
 * Prepara la simulación del cronograma para los pedidos de las fórmulas.
 * Comprueba cada pedido (que el hito exista, que la medida tenga sentido)
 * antes de simular nada.
 */
export function crearFuenteCronograma(
  c: Cronograma,
  riesgos: readonly RiesgoPlazo[],
  pedidos: readonly PedidoCronograma[],
  op: { semilla: number; forma: FormaDuracion },
): CreacionFuente {
  const p: PlazoPreparado = prepararPlazo(c, riesgos, op);
  const errores: string[] = [];
  const seguir: number[] = [];
  const resueltos = new Map<string, Resuelto>();
  for (const pedido of pedidos) {
    const clave = clavePedido(pedido);
    if (resueltos.has(clave)) continue;
    const destino = buscarHito(c, pedido.hito);
    const nombre = `RIESGO.CRONOGRAMA("${pedido.hito}"; "${pedido.medida}")`;
    if (typeof destino === 'string') {
      errores.push(`${nombre}: ${destino}.`);
      continue;
    }
    if (destino.tipo === 'actividad' && (p.condicional[destino.a] as number) >= 0) {
      errores.push(`${nombre}: «${pedido.hito}» es la rama de un riesgo (solo existe cuando el riesgo ocurre); usa la actividad que la sigue.`);
      continue;
    }
    if (pedido.medida === 'costo' && destino.tipo !== 'proyecto') {
      errores.push(`${nombre}: el costo es del proyecto entero; escribe RIESGO.CRONOGRAMA("Proyecto"; "costo").`);
      continue;
    }
    if (pedido.medida === 'costo' && !p.hayCostos) {
      errores.push(`${nombre}: el cronograma no tiene costos (columnas de costo en «Actividades» o costo de los riesgos).`);
      continue;
    }
    if ((pedido.medida === 'retraso' || pedido.medida === 'multa') && (destino.tipo !== 'actividad' || !destino.contractual)) {
      errores.push(`${nombre}: el retraso y la multa se miden contra una fecha contractual; pon «${pedido.hito}» en la hoja «Hitos».`);
      continue;
    }
    let j = -1;
    if (destino.tipo === 'actividad') {
      j = seguir.indexOf(destino.a);
      if (j < 0) j = seguir.push(destino.a) - 1;
    }
    resueltos.set(clave, { pedido, destino, j });
  }
  if (errores.length > 0) return { ok: false, errores };
  p.seguir = seguir;

  let acc: AcumuladorPlazo = nuevoAcumulador(p);
  let fin = new Float64Array(0);
  let costo = new Float64Array(0);
  let seguidas: Float64Array[] = seguir.map(() => new Float64Array(0));
  const cache = new Map<string, Float64Array>();
  const plan = planDe(p);

  /** Junta los tramos simulados en arreglos seguidos, por iteración. */
  const reunir = () => {
    const N = acc.hechas;
    fin = new Float64Array(N);
    costo = p.hayCostos ? new Float64Array(N) : new Float64Array(0);
    seguidas = seguir.map(() => new Float64Array(N));
    for (const t of acc.tramos) {
      const largo = t.fin.length;
      fin.set(t.fin, t.desde);
      if (t.costo && costo.length > 0) costo.set(t.costo, t.desde);
      if (t.seguidas) seguidas.forEach((s, j) => s.set((t.seguidas as Float64Array).subarray(j * largo, (j + 1) * largo), t.desde));
    }
    cache.clear();
  };

  const valor = (r: Resuelto, f: number): number => {
    const fecha = p.cal.fechaDeIndice(diaFin(f));
    switch (r.pedido.medida) {
      case 'fecha': return fecha;
      case 'dias': return diaFin(f) + 1;
      case 'retraso': return Math.max(0, Math.floor(fecha) - (r.destino as { contractual: HitoContractual }).contractual.fecha);
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
      return acc.hechas;
    },
    async asegurar(n, o = {}) {
      const N = Math.max(0, Math.floor(n));
      if (N <= acc.hechas) return true;
      const B = bloquePlazo(p.n);
      const nuevo = nuevoAcumulador(p);
      let completo = true;
      for (let i0 = acc.hechas; i0 < N; i0 += B) {
        if (o.debeCancelar?.()) {
          completo = false;
          break;
        }
        simularTramo(p, nuevo, i0, Math.min(N, i0 + B));
        if (o.ceder) await o.ceder();
      }
      acc = combinarAcumuladores(p, [acc, nuevo]);
      reunir();
      return completo;
    },
    muestras(pedido, n) {
      if (n > acc.hechas) throw new Error(`RIESGO.CRONOGRAMA: se pidieron ${n} iteraciones y hay ${acc.hechas}`);
      const clave = clavePedido(pedido);
      let x = cache.get(clave);
      if (!x) {
        const r = resuelto(pedido);
        if (r.pedido.medida === 'costo') x = costo;
        else {
          const f = r.destino.tipo === 'proyecto' ? fin : (seguidas[r.j] as Float64Array);
          x = Float64Array.from(f, (v) => valor(r, v));
        }
        cache.set(clave, x);
      }
      return x.subarray(0, n);
    },
    plan(pedido) {
      const r = resuelto(pedido);
      if (r.pedido.medida === 'costo') return plan.costo ?? NaN;
      return valor(r, r.destino.tipo === 'proyecto' ? plan.fin : (plan.ef[r.destino.a] as number));
    },
  };
  return { ok: true, fuente };
}

/** Los valores de las hojas del cronograma, tal cual los lee el adaptador. */
export interface HojasCronograma {
  actividades?: unknown[][];
  calendario?: unknown[][];
  riesgos?: unknown[][];
  calendarios?: unknown[][];
  clima?: unknown[][];
  hitos?: unknown[][];
}

/**
 * Lo mismo que hace el panel Cronograma antes de simular (leer, calcular el
 * CPM, leer los riesgos activos), y la fuente para los pedidos. Los errores,
 * en palabras del usuario y con la hoja y la fila si las hay.
 */
export function fuenteDesdeHojas(
  hojas: HojasCronograma,
  pedidos: readonly PedidoCronograma[],
  op: { semilla: number; forma: FormaDuracion },
): CreacionFuente {
  const conDonde = (x: { mensaje: string; hoja?: string; fila?: number }) => (x.hoja ? `${x.hoja}${x.fila ? `, fila ${x.fila}` : ''}: ${x.mensaje}` : x.mensaje);
  if (!hojas.actividades) return { ok: false, errores: ['RIESGO.CRONOGRAMA: el libro no tiene la hoja «Actividades» (créala desde el panel Cronograma).'] };
  const lectura = leerCronograma(hojas.actividades, hojas.calendario, hojas.calendarios, hojas.clima, hojas.hitos);
  const cron = lectura.cronograma;
  const errores = lectura.problemas.filter((x) => x.gravedad === 'error');
  if (!cron || errores.length > 0) return { ok: false, errores: ['El cronograma del libro tiene errores (RIESGO.CRONOGRAMA):', ...errores.map(conDonde)] };
  const cpm = calcularCPM(cron);
  if (!cpm.ok) return { ok: false, errores: ['El cronograma del libro no se puede calcular (RIESGO.CRONOGRAMA):', ...cpm.problemas.map(conDonde)] };
  const riesgos = leerRiesgosPlazo(hojas.riesgos, cron.actividades);
  const malos = riesgos.problemas.filter((x) => x.gravedad === 'error');
  if (malos.length > 0) return { ok: false, errores: ['Los riesgos de plazo tienen errores (RIESGO.CRONOGRAMA):', ...malos.map(conDonde)] };
  return crearFuenteCronograma(cron, riesgosActivos(riesgos.riesgos), pedidos, op);
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
export function publicarPlan(c: Cronograma): PlanCronogramaPublicado {
  const pedidos: PedidoCronograma[] = [];
  const nombres: Record<string, string> = {};
  const repetidos = new Set<string>();
  for (const a of c.actividades) {
    pedidos.push({ hito: a.id, medida: 'fecha' }, { hito: a.id, medida: 'dias' });
    if ((c.hitos ?? []).some((h) => h.id === a.id)) pedidos.push({ hito: a.id, medida: 'retraso' }, { hito: a.id, medida: 'multa' });
    const n = sinTildes(a.nombre);
    if (n in nombres) repetidos.add(n);
    else nombres[n] = sinTildes(a.id);
  }
  for (const n of repetidos) delete nombres[n];
  pedidos.push({ hito: '', medida: 'fecha' }, { hito: '', medida: 'dias' });
  const conCosto = crearFuenteCronograma(c, [], [...pedidos, { hito: '', medida: 'costo' }], { semilla: 1, forma: 'pert' });
  const creada = conCosto.ok ? conCosto : crearFuenteCronograma(c, [], pedidos, { semilla: 1, forma: 'pert' });
  const valores: Record<string, number> = {};
  if (creada.ok) {
    for (const x of [...pedidos, ...(conCosto.ok ? [{ hito: '', medida: 'costo' as MedidaCronograma }] : [])]) {
      // Las ramas de los riesgos no son hitos que se puedan pedir.
      try {
        valores[clavePedido(x)] = creada.fuente.plan(x);
      } catch {
        /* pedido no preparado */
      }
    }
  }
  return { version: 1, valores, nombres };
}
