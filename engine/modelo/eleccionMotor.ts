/**
 * Qué motor puede con este modelo: el rápido, o hay que meter a Excel en el
 * bucle.
 *
 * Es la decisión híbrida de Fase 2 §4, y su valor está en **decirlo antes**.
 * Sin esto, un libro con una función que falta se descubre a mitad de la
 * primera iteración, con un mensaje de fallo; con esto, al pulsar Simular el
 * usuario lee "tu modelo usa FRAC.AÑO en Flujo!D12, que el motor rápido no
 * conoce: se puede simular con Excel en el bucle, tardará unos 4 min".
 *
 * ---
 *
 * **Se comprueba exactamente lo que el evaluador rechaza, ni más ni menos.**
 * Las cinco causas están en el `switch` de `engine/compiler/evaluate.ts` y
 * son las cinco de `MotivoIncompatible`. Predecir de más sería mandar al modo
 * lento a quien no lo necesita; predecir de menos, prometer una simulación que
 * va a fallar. Si el evaluador gana o pierde una capacidad, este archivo tiene
 * que cambiar con él — el test `eleccionMotor.test.ts` cubre las cinco contra
 * el evaluador de verdad, para que no se separen en silencio.
 *
 * **Se miran las celdas necesarias, no solo las que dependen de una entrada.**
 * Una celda constante también se evalúa (una vez, no `n`), así que una función
 * que falte en una constante bloquea igual al motor rápido.
 */
import { clausuraDependencias, subgrafoRelevante } from '../graph/subgraph.ts';
import type { Grafo } from '../graph/graph.ts';
import { funcionSoportada } from '../functions/registry.ts';
import { recorrer, type Nodo } from '../parser/ast.ts';
import type { MotorSimulacion } from './riskModel.ts';

export type MotivoIncompatible =
  | { tipo: 'funcion'; clave: string; nombre: string }
  | { tipo: 'matricial'; clave: string }
  | { tipo: 'nombre'; clave: string; nombre: string }
  | { tipo: 'matriz'; clave: string }
  | { tipo: 'no-soportado'; clave: string; motivo: string }
  | { tipo: 'sintaxis'; clave: string; motivo: string };

export interface EleccionMotor {
  /** El motor con el que se va a simular de verdad. */
  motor: 'fast' | 'compatible';
  /** Por qué el rápido no sirve. Vacío si sirve. */
  motivos: MotivoIncompatible[];
  /**
   * Salidas que no dependen de ninguna entrada: su valor va a ser el mismo en
   * el millón de iteraciones. No impide simular, pero casi siempre significa
   * que el usuario marcó la celda equivocada, y callárselo es dejarle mirar un
   * histograma de una sola barra sin saber por qué.
   */
  salidasConstantes: string[];
  /** Entradas o salidas que no existen en el libro leído. */
  celdasDesconocidas: string[];
  /** Cuántas celdas hay que calcular para las salidas pedidas. */
  celdasNecesarias: number;
}

/**
 * `preferencia` es lo que el usuario pidió en `RiskModel.settings.engine`.
 * `'auto'` decide aquí; `'fast'` y `'compatible'` mandan.
 *
 * Forzar `'fast'` con motivos pendientes **no los oculta**: se devuelven
 * igual, y el panel debe enseñarlos. Es la diferencia entre "el usuario sabe
 * lo que hace" y "el usuario no se entera de que va a fallar".
 */
export function elegirMotor(
  grafo: Grafo,
  entradas: readonly string[],
  salidas: readonly string[],
  preferencia: MotorSimulacion = 'auto',
): EleccionMotor {
  const celdasDesconocidas = [...entradas, ...salidas].filter((c) => !grafo.nodos.has(c));

  // Las entradas inciertas cortan el recorrido: lo que haya en su fórmula (una
  // `RIESGO.NORMAL(…)` del propio complemento, por ejemplo) no se evalúa nunca.
  const conjuntoEntradas = new Set(entradas);
  const necesarias = clausuraDependencias(grafo, salidas, conjuntoEntradas);
  const relevante = subgrafoRelevante(grafo, entradas, salidas);
  const salidasConstantes = salidas.filter((s) => grafo.nodos.has(s) && !relevante.has(s));

  const motivos: MotivoIncompatible[] = [];
  for (const clave of necesarias) {
    if (conjuntoEntradas.has(clave)) continue;
    const nodo = grafo.nodos.get(clave);
    if (!nodo) continue;

    if (nodo.errorParseo) {
      motivos.push({ tipo: 'sintaxis', clave, motivo: nodo.errorParseo.mensaje });
      continue;
    }
    if (!nodo.ast) continue; // celda sin fórmula: un valor, nada que evaluar

    recorrer(nodo.ast, (n: Nodo) => {
      switch (n.tipo) {
        case 'funcion':
          if (!funcionSoportada(n.nombre)) motivos.push({ tipo: 'funcion', clave, nombre: n.nombre });
          break;
        case 'binaria':
          // `A1:A3*B1:B3` exige semántica de matrices. Mismo criterio que el
          // evaluador, palabra por palabra.
          if (n.izq.tipo === 'rango' || n.der.tipo === 'rango') motivos.push({ tipo: 'matricial', clave });
          break;
        case 'nombre':
          motivos.push({ tipo: 'nombre', clave, nombre: n.nombre });
          break;
        case 'matriz':
          motivos.push({ tipo: 'matriz', clave });
          break;
        case 'no-soportado':
          motivos.push({ tipo: 'no-soportado', clave, motivo: n.motivo });
          break;
        default:
          break;
      }
    });
  }

  const puedeElRapido = motivos.length === 0;
  const motor = preferencia === 'auto' ? (puedeElRapido ? 'fast' : 'compatible') : preferencia;

  return {
    motor,
    motivos: dedupe(motivos),
    salidasConstantes,
    celdasDesconocidas,
    celdasNecesarias: necesarias.size,
  };
}

/**
 * La misma función que falta en 300 celdas es **un** motivo, no 300. Se
 * conserva la primera celda donde aparece, que es la que el usuario va a ir a
 * mirar, y el orden de aparición.
 */
function dedupe(motivos: readonly MotivoIncompatible[]): MotivoIncompatible[] {
  const vistos = new Map<string, MotivoIncompatible>();
  for (const m of motivos) {
    const firma = m.tipo === 'funcion' || m.tipo === 'nombre' ? `${m.tipo}:${m.nombre}` : `${m.tipo}:${m.clave}`;
    if (!vistos.has(firma)) vistos.set(firma, m);
  }
  return [...vistos.values()];
}

/** El motivo en las palabras que va a leer el usuario, no en las del motor. */
export function describirMotivo(m: MotivoIncompatible): string {
  switch (m.tipo) {
    case 'funcion':
      return `${m.clave} usa ${m.nombre}, que el motor rápido no conoce todavía.`;
    case 'matricial':
      return `${m.clave} opera con rangos enteros (fórmula matricial), que el motor rápido no implementa.`;
    case 'nombre':
      return `${m.clave} usa el nombre definido ${m.nombre}, que el motor rápido no resuelve todavía.`;
    case 'matriz':
      return `${m.clave} contiene una constante matricial, que el motor rápido no implementa.`;
    case 'no-soportado':
      return `${m.clave}: ${m.motivo}`;
    case 'sintaxis':
      return `${m.clave} no se pudo interpretar: ${m.motivo}`;
  }
}
