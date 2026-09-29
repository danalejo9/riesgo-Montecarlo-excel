/**
 * El registro de riesgos (T8): cada `RIESGO.EVENTO(p; impacto)` del libro con
 * su probabilidad, su impacto y lo que aporta de media al total (el «valor
 * monetario esperado» de la gestión de riesgos: p × impacto medio). Sin
 * Office.js.
 *
 * Se calcula de las distribuciones, no de la muestra: el valor esperado de
 * cada riesgo es exacto y no depende de las iteraciones. Lo que pesa cada
 * riesgo en una salida concreta lo dice el tornado (sus entradas «ocurre» e
 * «impacto»).
 */

import { construirDesdeDescriptor } from '../engine/distributions/index.ts';
import type { Grafo } from '../engine/graph/index.ts';
import { resumirDistribucion, toDescriptor, type EntradaRiskModel, PREFIJO_FUNCION } from '../engine/modelo/index.ts';
import { claveCelda, type Nodo } from '../engine/parser/ast.ts';
import { NUMERO } from '../engine/values/columna.ts';

export interface FilaRiesgo {
  /** La celda del riesgo, legible: `Riesgos!C5`. */
  celda: string;
  nombre: string;
  /** `null` si la probabilidad cambia en cada iteración (depende de otra celda aleatoria). */
  probabilidad: number | null;
  /** El impacto en palabras: «Triangular(10; 20; 50)» o «5.000». */
  impacto: string;
  impactoMedio: number | null;
  impactoDesviacion: number | null;
  /** p × impacto medio. */
  valorEsperado: number | null;
  /** Desviación de lo que aporta el riesgo (ocurra o no). */
  desviacion: number | null;
}

export function registroDeRiesgos(
  d: { eventos: readonly string[]; entradas: readonly EntradaRiskModel[]; celdaDeEntrada: ReadonlyMap<string, string> },
  grafo: Grafo,
  legible: (clave: string) => string,
): FilaRiesgo[] {
  const filas: FilaRiesgo[] = [];
  for (const clave of d.eventos) {
    const deLaCelda = d.entradas.filter((e) => d.celdaDeEntrada.get(e.id) === clave);
    // Fuera del alcance de las salidas: el análisis no la usó.
    if (deLaCelda.length === 0) continue;
    const [ocurre, ...impactos] = deLaCelda as [EntradaRiskModel, ...EntradaRiskModel[]];
    const fija = (e: EntradaRiskModel) => e.id.startsWith(PREFIJO_FUNCION);
    const probabilidad = fija(ocurre) && ocurre.dist.type === 'bernoulli' ? ocurre.dist.p : null;
    const nombre = ocurre.name.replace(/ \(ocurre\)$/, '');

    let impacto = 'calculado en la hoja';
    let media: number | null = null;
    let desv: number | null = null;
    const unico = impactos.length === 1 ? impactos[0] : undefined;
    if (unico && fija(unico)) {
      try {
        const dist = construirDesdeDescriptor(toDescriptor(unico.dist));
        media = dist.mean();
        desv = Math.sqrt(dist.variance());
        impacto = resumirDistribucion(unico.dist);
      } catch {
        // sin momentos: se enseña sin valor esperado
      }
    } else if (impactos.length === 0) {
      const nodo = grafo.nodos.get(clave);
      const c = nodo?.ast?.tipo === 'binaria' ? constante(nodo.ast.der, nodo.hoja, grafo) : null;
      if (c !== null) {
        media = c;
        desv = 0;
        impacto = c.toLocaleString('es-ES');
      }
    } else {
      impacto = 'con parámetros que cambian';
    }
    const ve = probabilidad !== null && media !== null ? probabilidad * media : null;
    const varianza = probabilidad !== null && media !== null && desv !== null
      ? probabilidad * (desv * desv + media * media) - (probabilidad * media) ** 2
      : null;
    filas.push({
      celda: legible(clave),
      nombre,
      probabilidad,
      impacto,
      impactoMedio: media,
      impactoDesviacion: desv,
      valorEsperado: ve,
      desviacion: varianza === null ? null : Math.sqrt(Math.max(0, varianza)),
    });
  }
  // De más a menos valor esperado (en valor absoluto); los que no lo tienen, al final.
  const peso = (f: FilaRiesgo) => (f.valorEsperado === null ? -1 : Math.abs(f.valorEsperado));
  return filas.sort((a, b) => peso(b) - peso(a));
}

function constante(n: Nodo, hoja: string, grafo: Grafo): number | null {
  if (n.tipo === 'numero') return n.valor;
  if (n.tipo === 'unaria' && n.arg.tipo === 'numero') return n.op === '-' ? -n.arg.valor : n.arg.valor;
  if (n.tipo === 'celda') {
    const nodo = grafo.nodos.get(claveCelda(n.ref.hoja ?? hoja, n.ref.col, n.ref.fila));
    return nodo && !nodo.ast && nodo.valor?.tipo === NUMERO ? nodo.valor.numero : null;
  }
  return null;
}
