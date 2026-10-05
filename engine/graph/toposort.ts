/**
 * Orden topológico y detección de ciclos.
 *
 * El ejecutor necesita calcular cada celda después de todas las celdas de las
 * que depende. Un orden topológico sobre las aristas "depende de" garantiza
 * eso si se recorre en el sentido correcto: aquí se devuelve el orden de
 * **evaluación** (primero las hojas del grafo, al final las celdas que
 * dependen de todo lo demás), no el orden de descubrimiento.
 *
 * Las referencias circulares que Excel permite con cálculo iterativo no son
 * evaluables por este motor (no hay noción de "iteración hasta converger"),
 * así que se detectan y se reportan con las celdas implicadas, en vez de
 * colgarse o dar un resultado arbitrario.
 */

import type { Grafo } from './graph.ts';

export interface OrdenTopologico {
  /** Claves en orden de evaluación: cada una aparece después de sus dependencias. */
  orden: string[];
  /** Claves que forman parte de al menos un ciclo. Vacío si no hay ninguno. */
  enCiclo: Set<string>;
}

export function ordenarTopologicamente(grafo: Grafo, raices?: Iterable<string>): OrdenTopologico {
  const nodos = raices ? new Set(raices) : new Set(grafo.nodos.keys());

  // 0 = sin visitar, 1 = en la pila (gris), 2 = resuelto (negro).
  const estado = new Map<string, 0 | 1 | 2>();
  const orden: string[] = [];
  const enCiclo = new Set<string>();

  for (const clave of nodos) if (!estado.has(clave)) estado.set(clave, 0);

  // DFS iterativo: una cadena de miles de celdas encadenadas por fila (normal
  // en un presupuesto) desbordaría la pila de llamadas recursiva.
  for (const raiz of nodos) {
    if (estado.get(raiz) === 2) continue;

    // Cada nivel de la pila guarda su iterador de vecinos: copiar la lista de
    // dependencias en cada paso hacía cuadrático el orden de una celda que
    // apunta a un rango grande (un BUSCARV sobre 200 celdas, F2).
    const pila: string[] = [raiz];
    const iteradores: Iterator<string>[] = [(grafo.dependencias.get(raiz) ?? new Set<string>()).values()];
    const enRuta = new Map<string, number>([[raiz, 0]]); // posición en la pila, para reconstruir un ciclo
    estado.set(raiz, 1);

    while (pila.length > 0) {
      const actual = pila[pila.length - 1] as string;
      const siguiente = (iteradores[iteradores.length - 1] as Iterator<string>).next();

      if (!siguiente.done) {
        const vecino = siguiente.value;
        const e = estado.get(vecino) ?? 0;

        if (e === 0) {
          estado.set(vecino, 1);
          enRuta.set(vecino, pila.length);
          pila.push(vecino);
          iteradores.push((grafo.dependencias.get(vecino) ?? new Set<string>()).values());
        } else if (e === 1) {
          // Encontramos un nodo gris: hay un ciclo. Marca todo el tramo de la
          // ruta actual desde ese nodo en adelante.
          const idx = enRuta.get(vecino) ?? 0;
          for (let i = idx; i < pila.length; i++) enCiclo.add(pila[i] as string);
          enCiclo.add(actual);
        }
        // Si e === 2 (ya resuelto), no hay nada que hacer: no es un ciclo.
        continue;
      }

      estado.set(actual, 2);
      orden.push(actual);
      pila.pop();
      iteradores.pop();
      enRuta.delete(actual);
    }
  }

  return { orden, enCiclo };
}
