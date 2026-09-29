/**
 * Los **nombres definidos** del libro (Administrador de nombres), leídos para
 * que el parser los resuelva (ver `let.ts`): una constante (`R_GAS`), una
 * celda o un rango (`TC_CO2` = `Datos!$B$2`) o una `LAMBDA` (`PR_P`).
 *
 * Un nombre puede ser del libro o de una hoja; en una hoja, el suyo tapa al
 * del libro. Excel no distingue mayúsculas en los nombres.
 *
 * Se dejan fuera (y la celda que los use irá al modo compatible, como hasta
 * ahora) los que no se entienden y los que tienen **referencias relativas**
 * (`=Hoja1!A1` sin `$`): esos dependen de la celda activa al crearlos y el
 * motor no la conoce.
 */

import type { Nodo } from './ast.ts';
import type { NombresDefinidos } from './let.ts';
import { tokenizar } from './lexer.ts';
import { parsearSinExpandir } from './parse.ts';

export interface DefinicionNombre {
  nombre: string;
  /** La fórmula, con o sin `=` delante. */
  formula: string;
  /** La hoja, si el nombre es de una hoja y no del libro. */
  hoja?: string;
}

export interface NombresDelLibro {
  libro: ReadonlyMap<string, Nodo>;
  /** Por hoja (tal como se llama la hoja), los nombres de esa hoja. */
  hojas: ReadonlyMap<string, ReadonlyMap<string, Nodo>>;
  /** Los que se dejaron fuera, con el motivo, para el diagnóstico. */
  descartados: string[];
}

export function leerNombresDefinidos(definiciones: readonly DefinicionNombre[]): NombresDelLibro {
  const libro = new Map<string, Nodo>();
  const hojas = new Map<string, Map<string, Nodo>>();
  const descartados: string[] = [];
  for (const d of definiciones) {
    const formula = d.formula.startsWith('=') ? d.formula.slice(1) : d.formula;
    if (/^_xlnm\./i.test(d.nombre) || formula.trim() === '') continue;
    let relativa = false;
    try {
      relativa = tokenizar(formula).some((t) => t.t === 'ref' && !/^\$[A-Za-z]{1,3}\$\d+$/.test(t.texto));
    } catch {
      // lo dirá el parser
    }
    if (relativa) {
      descartados.push(`${d.nombre}: tiene referencias relativas (sin $)`);
      continue;
    }
    const r = parsearSinExpandir(formula);
    if (!r.ok) {
      descartados.push(`${d.nombre}: ${r.error.mensaje}`);
      continue;
    }
    const destino = d.hoja === undefined ? libro : (hojas.get(d.hoja) ?? hojas.set(d.hoja, new Map()).get(d.hoja) as Map<string, Nodo>);
    destino.set(d.nombre.toUpperCase(), r.ast);
  }
  return { libro, hojas, descartados };
}

/** Los nombres que ve una fórmula de `hoja`: los del libro y, encima, los de la hoja. */
export function nombresDeHoja(n: NombresDelLibro | undefined, hoja: string): NombresDefinidos | undefined {
  if (!n) return undefined;
  const propios = n.hojas.get(hoja);
  if (!propios || propios.size === 0) return n.libro.size > 0 ? n.libro : undefined;
  return new Map([...n.libro, ...propios]);
}
