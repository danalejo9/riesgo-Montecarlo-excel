/**
 * Avisos de coherencia (H6) y trazado de dependencias (H7), con el grafo del
 * libro ya construido. Sin Office.js.
 *
 * - Una entrada que no afecta a ninguna salida suele ser un error de conexión
 *   (la fórmula de la salida no la usa): se simula para nada.
 * - Una distribución que da negativos en una celda que hoy vale más de cero
 *   (unidades, precios, plazos) suele ser una normal demasiado ancha.
 * - El camino de cada entrada a cada salida, celda a celda, para ver por dónde
 *   pasa su efecto (o por qué no llega).
 */

import { construirDesdeDescriptor } from '../engine/distributions/index.ts';
import type { Grafo } from '../engine/graph/index.ts';
import { toDescriptor, type EntradaRiskModel } from '../engine/modelo/index.ts';
import { NUMERO } from '../engine/values/columna.ts';

/** Probabilidad de negativo a partir de la que se avisa. */
const UMBRAL_NEGATIVOS = 0.01;

export interface TrazaEntrada {
  entrada: string;
  /** Por cada salida a la que llega, el camino más corto (celdas legibles, de la entrada a la salida). */
  salidas: { salida: string; camino: string[] }[];
}

export function avisosDeCoherencia(
  grafo: Grafo,
  entradas: readonly EntradaRiskModel[],
  clavesEntrada: readonly string[],
  clavesSalida: readonly string[],
  legible: (clave: string) => string,
): string[] {
  const avisos: string[] = [];
  const necesarias = new Set<string>();
  // Lo que necesitan las salidas, sin cruzar las entradas (su fórmula no cuenta: la sustituye la distribución).
  const alcanza = (raices: Iterable<string>, alto: ReadonlySet<string>) => {
    const pila = [...raices];
    while (pila.length > 0) {
      const c = pila.pop() as string;
      if (necesarias.has(c)) continue;
      necesarias.add(c);
      if (alto.has(c)) continue;
      for (const d of grafo.dependencias.get(c) ?? []) pila.push(d);
    }
  };
  alcanza(clavesSalida, new Set(clavesEntrada));

  entradas.forEach((e, i) => {
    const clave = clavesEntrada[i];
    if (!clave || clave.startsWith('\u0001')) return; // las virtuales (B7) viven dentro de una fórmula
    if (!necesarias.has(clave)) {
      avisos.push(`La entrada «${e.name}» (${legible(clave)}) no afecta a ninguna salida: ninguna fórmula de las salidas la usa.`);
      return;
    }
    const nodo = grafo.nodos.get(clave);
    const actual = nodo && !nodo.ast && nodo.valor?.tipo === NUMERO ? nodo.valor.numero : undefined;
    if (actual !== undefined && actual > 0 && e.dist.type !== 'categorical') {
      try {
        const p = construirDesdeDescriptor(toDescriptor(e.dist)).cdf(0);
        if (p > UMBRAL_NEGATIVOS) {
          avisos.push(`La entrada «${e.name}» (${legible(clave)}) vale hoy ${actual.toLocaleString('es-ES')}, pero su distribución da negativos el ${(p * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % de las veces. Si no puede ser negativa, acótala en 0 o usa una distribución positiva.`);
        }
      } catch {
        // una distribución que no se construye ya la rechaza la preparación
      }
    }
  });
  return avisos;
}

/** El camino más corto de cada entrada a cada salida por las celdas que dependen de ella (H7). */
export function trazarDependencias(
  grafo: Grafo,
  entradas: readonly EntradaRiskModel[],
  clavesEntrada: readonly string[],
  salidas: readonly { nombre: string; clave: string }[],
  legible: (clave: string) => string,
  maxLargo = 12,
): TrazaEntrada[] {
  const porClave = new Map(salidas.map((s) => [s.clave, s.nombre] as const));
  return entradas.map((e, i) => {
    const origen = clavesEntrada[i] as string;
    const previo = new Map<string, string | null>([[origen, null]]);
    const cola = [origen];
    // Anchura: la primera vez que se llega a una celda es por el camino más corto.
    for (let k = 0; k < cola.length; k++) {
      const c = cola[k] as string;
      for (const d of grafo.dependientes.get(c) ?? []) {
        if (previo.has(d)) continue;
        previo.set(d, c);
        cola.push(d);
      }
    }
    const trazas: TrazaEntrada['salidas'] = [];
    for (const [clave, nombre] of porClave) {
      if (!previo.has(clave) || clave === origen) continue;
      const camino: string[] = [];
      for (let c: string | null = clave; c !== null; c = previo.get(c) ?? null) camino.unshift(c);
      const visibles = camino.filter((c) => !c.startsWith('\u0001')).map(legible);
      trazas.push({ salida: nombre, camino: visibles.length > maxLargo ? [...visibles.slice(0, 3), '…', ...visibles.slice(-3)] : visibles });
    }
    return { entrada: e.name, salidas: trazas };
  });
}
