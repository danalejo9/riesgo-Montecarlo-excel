/**
 * Grafo de dependencias entre celdas.
 *
 * El nodo es una celda (`hoja!ref`), no una fórmula: una celda con valor
 * constante también es un nodo, aunque no tenga fórmula ni dependa de nada.
 * Esto simplifica el resto del motor porque toda referencia que aparece en una
 * fórmula resuelve a un nodo, exista o no ese nodo en el mapa de fórmulas.
 *
 * Las aristas van de una celda a las celdas de las que depende (sus
 * "precedentes" en la terminología de Excel). `dependenciasDe(x)` son los
 * nodos que hay que conocer antes de calcular `x`.
 */

import { claveCelda, columnaDeLetras, recorrer, type Nodo, type RefCelda, type RefRango } from '../parser/ast.ts';
import type { ValorEscalar } from '../values/columna.ts';
import { parsear } from '../parser/parse.ts';

export interface FormulaCelda {
  hoja: string;
  col: number;
  fila: number;
  formula: string;
}

/**
 * Una celda con valor pero sin fórmula: los datos del modelo.
 *
 * Son mayoría en cualquier libro real y **no son un detalle**: sin ellas, una
 * fórmula que multiplique por la celda de al lado multiplica por vacío. El
 * lector de Excel las separa de las fórmulas (`ValorEstatico`) y entran aquí.
 */
export interface ValorCelda {
  hoja: string;
  col: number;
  fila: number;
  valor: ValorEscalar;
}

export interface NodoGrafo {
  clave: string;
  hoja: string;
  col: number;
  fila: number;
  /** `undefined` si la celda no tiene fórmula (es una entrada/constante). */
  ast?: Nodo;
  /**
   * El valor de una celda sin fórmula. `undefined` en una celda con fórmula,
   * y también en una celda de verdad vacía — que no es lo mismo que un cero,
   * y por eso se distingue.
   */
  valor?: ValorEscalar;
  /** Error de parseo de esta celda, si lo hubo. */
  errorParseo?: { mensaje: string; pos: number };
}

export interface Grafo {
  nodos: Map<string, NodoGrafo>;
  /** clave -> claves de las que depende (sus precedentes). */
  dependencias: Map<string, Set<string>>;
  /** clave -> claves que dependen de ella (sus dependientes). Inverso del anterior. */
  dependientes: Map<string, Set<string>>;
}

/** Límite de celdas que se expanden de un rango al construir aristas. */
const LIMITE_EXPANSION_RANGO = 100_000;

export interface ConstruccionGrafo {
  grafo: Grafo;
  /** Rangos que no se expandieron por ser demasiado anchos (columna entera, etc.). */
  rangosNoExpandidos: number;
}

export function construirGrafo(
  celdas: FormulaCelda[],
  valores: readonly ValorCelda[] = [],
): ConstruccionGrafo {
  const nodos = new Map<string, NodoGrafo>();
  const dependencias = new Map<string, Set<string>>();
  const dependientes = new Map<string, Set<string>>();
  let rangosNoExpandidos = 0;

  const obtenerNodo = (clave: string, hoja: string, col: number, fila: number): NodoGrafo => {
    let n = nodos.get(clave);
    if (!n) {
      n = { clave, hoja, col, fila };
      nodos.set(clave, n);
      dependencias.set(clave, new Set());
      dependientes.set(clave, new Set());
    }
    return n;
  };

  const agregarArista = (desde: string, hacia: string) => {
    if (desde === hacia) return; // autorreferencia: no es una dependencia real
    (dependencias.get(desde) as Set<string>).add(hacia);
    (dependientes.get(hacia) as Set<string>).add(desde);
  };

  // Primera pasada: crear todos los nodos con fórmula y parsear.
  for (const c of celdas) {
    const clave = claveCelda(c.hoja, c.col, c.fila);
    const nodo = obtenerNodo(clave, c.hoja, c.col, c.fila);
    const r = parsear(c.formula);
    if (r.ok) {
      nodo.ast = r.ast;
    } else {
      nodo.errorParseo = r.error;
    }
  }

  // Los valores sin fórmula. Van después de las fórmulas y antes de las
  // aristas: una celda puede aparecer en las dos listas si el libro está mal
  // leído, y en ese caso manda la fórmula — un valor es el resultado de
  // calcularla, no un dato independiente.
  for (const v of valores) {
    const clave = claveCelda(v.hoja, v.col, v.fila);
    const nodo = obtenerNodo(clave, v.hoja, v.col, v.fila);
    if (nodo.ast || nodo.errorParseo) continue;
    nodo.valor = v.valor;
  }

  // Segunda pasada: recorrer cada AST y crear las aristas de dependencia.
  for (const c of celdas) {
    const clave = claveCelda(c.hoja, c.col, c.fila);
    const nodo = nodos.get(clave) as NodoGrafo;
    if (!nodo.ast) continue;
    rangosNoExpandidos += referenciasDe(nodo.ast, c.hoja, (destino, hoja, col, fila) => {
      obtenerNodo(destino, hoja, col, fila);
      agregarArista(clave, destino);
    });
  }

  return { grafo: { nodos, dependencias, dependientes }, rangosNoExpandidos };
}

/**
 * Recorre las referencias de un AST y llama a `alEncontrar` con cada celda a
 * la que apunta (los rangos, expandidos). Devuelve cuántos rangos no se
 * expandieron por abiertos o demasiado anchos.
 */
export function referenciasDe(
  ast: Nodo,
  hojaActual: string,
  alEncontrar: (clave: string, hoja: string, col: number, fila: number) => void,
): number {
  let noExpandidos = 0;
  recorrer(ast, (n) => {
    if (n.tipo === 'celda') {
      const ref: RefCelda = n.ref;
      const hoja = ref.hoja ?? hojaActual;
      alEncontrar(claveCelda(hoja, ref.col, ref.fila), hoja, ref.col, ref.fila);
    } else if (n.tipo === 'rango') {
      const ref: RefRango = n.ref;
      const hoja = ref.hoja ?? hojaActual;
      // Rango abierto (columna o fila entera): no se expande, cuenta como
      // "no expandido" para que quien dimensione el motor lo sepa.
      if (ref.col1 === null || ref.fila1 === null || ref.col2 === null || ref.fila2 === null) {
        noExpandidos++;
        return;
      }
      const ancho = ref.col2 - ref.col1 + 1;
      const alto = ref.fila2 - ref.fila1 + 1;
      if (ancho * alto > LIMITE_EXPANSION_RANGO) {
        noExpandidos++;
        return;
      }
      for (let col = ref.col1; col <= ref.col2; col++) {
        for (let fila = ref.fila1; fila <= ref.fila2; fila++) {
          alEncontrar(claveCelda(hoja, col, fila), hoja, col, fila);
        }
      }
    }
  });
  return noExpandidos;
}

/**
 * Cambia la fórmula (ya parseada) de una celda del grafo y rehace sus aristas.
 * Lo usan las funciones RIESGO (B6, B7): una llamada se sustituye por una
 * constante o por una celda virtual antes de simular. Las celdas a las que
 * apunte la fórmula nueva y no existan se crean vacías, como al construir.
 */
export function reemplazarAst(grafo: Grafo, clave: string, ast: Nodo | undefined): void {
  const nodo = grafo.nodos.get(clave);
  if (!nodo) throw new Error(`reemplazarAst: ${clave} no está en el grafo`);
  for (const d of grafo.dependencias.get(clave) ?? []) grafo.dependientes.get(d)?.delete(clave);
  grafo.dependencias.set(clave, new Set());
  delete nodo.errorParseo;
  if (ast === undefined) {
    delete nodo.ast;
    return;
  }
  nodo.ast = ast;
  referenciasDe(ast, nodo.hoja, (destino, hoja, col, fila) => {
    if (destino === clave) return;
    if (!grafo.nodos.has(destino)) {
      grafo.nodos.set(destino, { clave: destino, hoja, col, fila });
      grafo.dependencias.set(destino, new Set());
      grafo.dependientes.set(destino, new Set());
    }
    (grafo.dependencias.get(clave) as Set<string>).add(destino);
    (grafo.dependientes.get(destino) as Set<string>).add(clave);
  });
}

/** Construye la clave de celda a partir de letras de columna, para conveniencia de tests. */
export function claveDeReferencia(hoja: string, ref: string): string {
  const m = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/.exec(ref);
  if (!m) throw new Error(`Referencia inválida: ${ref}`);
  return claveCelda(hoja, columnaDeLetras(m[1] as string), Number(m[2]));
}
