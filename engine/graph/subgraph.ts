/**
 * Recorte del grafo a lo que importa para una simulación concreta.
 *
 * Hay dos preguntas distintas y este módulo responde a las dos por separado,
 * a propósito, porque confundirlas produce errores de diseño:
 *
 * 1. **"¿Qué hay que calcular para obtener las salidas?"** — la clausura de
 *    dependencias de las salidas. Incluye TODO lo necesario: celdas que
 *    dependen de las entradas inciertas y también celdas puramente
 *    constantes (una tabla de tarifas fija, por ejemplo). Esto es lo que el
 *    compilador necesita para construir el plan de ejecución (Fase 2 §3).
 *
 * 2. **"¿Qué celdas concretas conectan una entrada con una salida?"** — la
 *    intersección entre "alcanzable desde alguna entrada" y "puede alcanzar
 *    alguna salida". Esto es lo que necesita el informe de compatibilidad
 *    (Fase 2 §4.1): una celda que no está en este subgrafo, aunque tenga una
 *    función rarísima, no le importa a la simulación si no está en el camino
 *    de ninguna entrada incierta.
 *
 * La distinción tiene una consecuencia de diseño importante para el
 * compilador (pendiente, no implementada aquí): una celda que SÍ está en la
 * clausura de las salidas pero NO en el subgrafo entrada-salida es constante
 * a lo largo de toda la simulación. No hace falta que el motor sepa
 * vectorizar su función — basta con evaluarla una vez, escalar. Es el
 * "constant folding" del que habla Fase 2 §4.2 con el ejemplo del BUSCARV
 * sobre una tabla de tarifas fija.
 */

import type { Grafo } from './graph.ts';

/**
 * Clausura hacia atrás: todo lo que hace falta conocer para calcular `raices`.
 *
 * `detenerEn` son celdas que se incluyen pero **por las que no se sigue
 * bajando**: las entradas inciertas. Su valor lo pone la simulación, así que
 * lo que hubiera en su fórmula —una `RIESGO.NORMAL(…)`, o cualquier otra
 * cosa— y las celdas de las que depende no hacen falta para nada.
 */
export function clausuraDependencias(
  grafo: Grafo,
  raices: Iterable<string>,
  detenerEn?: ReadonlySet<string>,
): Set<string> {
  return alcanzables(grafo.dependencias, raices, detenerEn);
}

/** Clausura hacia adelante: todo lo que depende, directa o indirectamente, de `raices`. */
export function clausuraDependientes(grafo: Grafo, raices: Iterable<string>): Set<string> {
  return alcanzables(grafo.dependientes, raices);
}

/**
 * Celdas en algún camino entre al menos una entrada y al menos una salida.
 *
 * Nota: si una celda de salida no depende, ni directa ni transitivamente, de
 * ninguna entrada, esa salida es constante durante toda la simulación
 * (siempre da el mismo valor); no aparecerá conectada a ninguna entrada y por
 * tanto no formará parte del subgrafo. Eso no es un error del cálculo — es
 * información real sobre el modelo que conviene mostrar al usuario ("esta
 * salida no depende de las entradas definidas").
 */
export function subgrafoRelevante(
  grafo: Grafo,
  entradas: Iterable<string>,
  salidas: Iterable<string>,
): Set<string> {
  // Alcanzable desde una entrada, siguiendo "quién depende de mí" (hacia
  // adelante): todo lo que una entrada puede llegar a afectar. Cada
  // clausura incluye trivialmente su propia raíz, así que una entrada que
  // sea a la vez una salida (camino de longitud cero) ya queda cubierta sin
  // caso especial.
  const listaEntradas = [...entradas];
  const afectadoPorEntradas = clausuraDependientes(grafo, listaEntradas);

  // Lo que hace falta para calcular las salidas (hacia atrás). Por la misma
  // razón, una salida que no dependa de ninguna entrada no debe forzarse a
  // entrar: si no aparece en la intersección, es que es constante frente a
  // esas entradas, y eso es justo lo que se le quiere poder decir al usuario.
  const necesarioParaSalidas = clausuraDependencias(grafo, salidas, new Set(listaEntradas));

  const relevante = new Set<string>();
  for (const clave of necesarioParaSalidas) {
    if (afectadoPorEntradas.has(clave)) relevante.add(clave);
  }

  return relevante;
}

function alcanzables(
  adyacencia: Map<string, Set<string>>,
  raices: Iterable<string>,
  detenerEn?: ReadonlySet<string>,
): Set<string> {
  const visto = new Set<string>();
  const pila: string[] = [...raices];

  while (pila.length > 0) {
    const actual = pila.pop() as string;
    if (visto.has(actual)) continue;
    visto.add(actual);
    if (detenerEn?.has(actual)) continue;
    for (const vecino of adyacencia.get(actual) ?? []) {
      if (!visto.has(vecino)) pila.push(vecino);
    }
  }

  return visto;
}
