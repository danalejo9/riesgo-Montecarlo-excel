/**
 * Ejecuta un `Plan` ya compilado (`plan.ts`) sobre unas entradas y un número
 * de iteraciones concretos.
 *
 * Reutiliza `evaluarNodo` de `evaluate.ts` célula a célula — la semántica de
 * cada operador y función vive en un solo sitio; lo que este módulo añade es
 * **cuándo** llamarla: con `n=1` para una celda marcada `esConstante` en el
 * plan, con el `n` completo si no. Es el *constant folding* de Fase 2 §3.1
 * hecho ejecutable: una tabla de tarifas fija se calcula una vez, no `n`
 * veces, y solo se "difunde" (`fill`) a un buffer de `n` en el momento en que
 * de verdad hace falta — porque alguna celda no constante la consume o
 * porque es ella misma una salida pedida. El resto del tiempo vive como un
 * buffer de longitud 1.
 *
 * A diferencia de `evaluarModelo` (que devuelve el valor de **todas** las
 * celdas necesarias, pensado para depurar), esta función solo materializa a
 * longitud `n` las celdas pedidas en `salidas`: es el contrato que necesita
 * un consumidor real (la UI, `engine/stats/`), y es precisamente lo que
 * permite que el *constant folding* ahorre trabajo — difundir cada celda
 * intermedia igualmente volvería a pagar el coste que se quiere evitar.
 *
 * **Vida de buffers**: las celdas que ya no le hacen falta a nadie se borran
 * del mapa de valores en cuanto se procesan sus últimos consumidores, para
 * que el recolector de basura las libere. Esto no es todavía el *pool* de
 * buffers reutilizables de Fase 2 §3.1 (eso exige que el propio
 * `evaluarNodo` reciba un buffer de destino en vez de reservar uno nuevo
 * cada vez, un cambio más profundo que queda para el ejecutor por bloques);
 * es, sin embargo, una reducción real del pico de memoria en modelos con
 * muchas celdas intermedias — que es exactamente D11.
 */
import type { Grafo, NodoGrafo } from '../graph/graph.ts';
import type { Buffer } from '../values/buffer.ts';
import {
  desdeEscalar,
  vacioConstante,
  valorEn,
  vectorNumerico,
  type Columna,
} from '../values/columna.ts';
import { evaluarNodo } from './evaluate.ts';
import type { ErrorPlan, Plan } from './plan.ts';

export type ResultadoEjecucion =
  | { ok: true; valores: Map<string, Columna> }
  | { ok: false; error: ErrorPlan };

export function ejecutarPlan(
  grafo: Grafo,
  plan: Plan,
  entradas: Map<string, Buffer>,
  n: number,
): ResultadoEjecucion {
  const valores = new Map<string, Columna>();
  const salidasSet = new Set(plan.salidas);
  const enPlan = new Set(plan.orden);

  // Cuántos consumidores (dependientes o ser salida) le quedan por atender a
  // cada celda; al llegar a cero, su buffer puede borrarse del mapa.
  const usosPendientes = new Map<string, number>();
  for (const clave of plan.orden) {
    let usos = salidasSet.has(clave) ? 1 : 0;
    for (const dependiente of grafo.dependientes.get(clave) ?? []) {
      if (dependiente !== clave) usos++;
    }
    usosPendientes.set(clave, usos);
  }

  const consumir = (clave: string): void => {
    const restante = (usosPendientes.get(clave) ?? 1) - 1;
    usosPendientes.set(clave, restante);
    if (restante <= 0 && !salidasSet.has(clave)) valores.delete(clave);
  };

  for (const clave of plan.orden) {
    const provista = entradas.get(clave);
    if (provista) {
      if (provista.length !== n) {
        return {
          ok: false,
          error: { clave, motivo: `El buffer de entrada tiene ${provista.length} muestras y se esperaban ${n}` },
        };
      }
      valores.set(clave, vectorNumerico(provista));
      marcarConsumidas(grafo, clave, consumir);
      continue;
    }

    const nodo = grafo.nodos.get(clave) as NodoGrafo;
    if (nodo.errorParseo) {
      return { ok: false, error: { clave, motivo: `Error de sintaxis: ${nodo.errorParseo.mensaje}` } };
    }

    const constante = plan.esConstante.has(clave);
    const nLocal = constante ? 1 : n;

    let columna: Columna;
    if (!nodo.ast) {
      columna = vacioConstante(nLocal); // celda vacía: vacía, no cero
    } else {
      const r = evaluarNodo(nodo.ast, nodo.hoja, valores, nLocal);
      if (!r.ok) return { ok: false, error: { clave, motivo: r.motivo } };
      columna = r.columna;
    }

    if (constante && necesitaDifundirse(grafo, clave, plan, enPlan, salidasSet)) {
      columna = desdeEscalar(valorEn(columna, 0), n);
    }

    valores.set(clave, columna);
    marcarConsumidas(grafo, clave, consumir);
  }

  const resultado = new Map<string, Columna>();
  for (const clave of plan.salidas) {
    const c = valores.get(clave);
    if (!c) return { ok: false, error: { clave, motivo: 'Salida no calculada (no debería ocurrir)' } };
    resultado.set(clave, c);
  }
  return { ok: true, valores: resultado };
}

/**
 * Una constante se difunde a longitud `n` si es una salida pedida, o si
 * algún dependiente que de verdad forma parte de este plan no es constante.
 * (Un dependiente fuera del plan —una fórmula de otra parte del libro que no
 * hace falta para estas salidas— no cuenta: nunca se va a evaluar aquí.)
 */
function necesitaDifundirse(
  grafo: Grafo,
  clave: string,
  plan: Plan,
  enPlan: Set<string>,
  salidasSet: Set<string>,
): boolean {
  if (salidasSet.has(clave)) return true;
  for (const dependiente of grafo.dependientes.get(clave) ?? []) {
    if (enPlan.has(dependiente) && !plan.esConstante.has(dependiente)) return true;
  }
  return false;
}

/**
 * Tras calcular `clave`, sus dependencias directas pierden un consumidor;
 * las que llegan a cero se liberan del mapa (ver docstring del módulo).
 */
function marcarConsumidas(grafo: Grafo, clave: string, consumir: (clave: string) => void): void {
  for (const dependencia of grafo.dependencias.get(clave) ?? []) {
    if (dependencia !== clave) consumir(dependencia);
  }
}
