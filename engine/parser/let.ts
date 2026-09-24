/**
 * `LET(nombre1; valor1; …; cálculo)`, resuelto **al parsear**, sustituyendo
 * cada nombre por su expresión.
 *
 * `LET` no calcula nada: pone nombre a una subexpresión para no repetirla.
 * Como ninguna función del motor tiene efectos secundarios (las volátiles,
 * `ALEATORIO` y compañía, ya mandan al modo compatible), escribir
 * `LET(x; A1*2; x+x)` es exactamente lo mismo que `(A1*2)+(A1*2)`. Resolverlo
 * aquí tiene una ventaja grande: **ni el grafo, ni la elección de motor, ni
 * los dos evaluadores tienen que saber que `LET` existe**. Las dependencias de
 * la celda salen solas del árbol ya expandido.
 *
 * Las reglas de ámbito de Excel, que son las de cualquier lenguaje:
 * - cada valor puede usar los nombres definidos **antes** que él, no después;
 * - un `LET` dentro de otro puede redefinir un nombre, y dentro manda el suyo;
 * - un nombre que no está en ningún `LET` sigue siendo un nombre definido del
 *   libro, como siempre.
 *
 * En el XML de un `.xlsx` los parámetros llegan como `_xlpm.x` y la función
 * como `_xlfn.LET`; Office.js los da ya limpios. Se aceptan las dos formas.
 *
 * **Límite conocido**: la sustitución copia la expresión en cada uso, y una
 * cadena de nombres que se usan dos veces cada uno crece de forma exponencial
 * (`a`, `b = a+a`, `c = b+b`…). Más allá de `NODOS_MAXIMOS` se renuncia y la
 * celda va al modo compatible con el motivo dicho, en vez de colgar el panel.
 * Ningún `LET` escrito a mano por una persona se acerca.
 */

import type { Nodo } from './ast.ts';

export const NODOS_MAXIMOS = 20_000;

const normalizarFuncion = (n: string) => n.replace(/^_xlfn\./i, '').toUpperCase();
const normalizarNombre = (n: string) => n.replace(/^_xlpm\./i, '').toUpperCase();

class Renuncia extends Error {}

export function expandirLet(raiz: Nodo): Nodo {
  let nodos = 0;
  let hayLet = false;

  const visitar = (nodo: Nodo, ambito: ReadonlyMap<string, Nodo>): Nodo => {
    if (++nodos > NODOS_MAXIMOS) throw new Renuncia();
    switch (nodo.tipo) {
      case 'nombre': {
        if (nodo.hoja !== undefined) return nodo;
        const valor = ambito.get(normalizarNombre(nodo.nombre));
        if (!valor) return nodo;
        nodos += contar(valor);
        if (nodos > NODOS_MAXIMOS) throw new Renuncia();
        return valor;
      }
      case 'funcion': {
        if (normalizarFuncion(nodo.nombre) === 'LET') {
          hayLet = true;
          return expandirUno(nodo, ambito);
        }
        return { ...nodo, args: nodo.args.map((a) => visitar(a, ambito)) };
      }
      case 'unaria':
      case 'porcentaje':
        return { ...nodo, arg: visitar(nodo.arg, ambito) };
      case 'binaria':
        return { ...nodo, izq: visitar(nodo.izq, ambito), der: visitar(nodo.der, ambito) };
      case 'matriz':
        return { ...nodo, filas: nodo.filas.map((f) => f.map((c) => visitar(c, ambito))) };
      default:
        return nodo;
    }
  };

  const expandirUno = (nodo: Extract<Nodo, { tipo: 'funcion' }>, exterior: ReadonlyMap<string, Nodo>): Nodo => {
    const args = nodo.args;
    if (args.length < 3 || args.length % 2 === 0) {
      return malFormado(nodo, 'LET necesita parejas nombre–valor y un cálculo final');
    }
    const ambito = new Map(exterior);
    for (let i = 0; i + 1 < args.length - 1; i += 2) {
      const nombre = args[i] as Nodo;
      if (nombre.tipo !== 'nombre' || nombre.hoja !== undefined) {
        return malFormado(nodo, `el argumento ${i + 1} de LET tiene que ser un nombre`);
      }
      // El valor se expande con el ámbito que hay **hasta aquí**: un nombre
      // no puede usarse en su propia definición ni en las anteriores.
      ambito.set(normalizarNombre(nombre.nombre), visitar(args[i + 1] as Nodo, ambito));
    }
    return visitar(args[args.length - 1] as Nodo, ambito);
  };

  try {
    const resultado = visitar(raiz, new Map());
    return hayLet ? resultado : raiz;
  } catch (e) {
    if (e instanceof Renuncia) {
      return {
        tipo: 'no-soportado',
        motivo: `LET demasiado grande para resolverlo (más de ${NODOS_MAXIMOS} nodos al expandir)`,
        texto: 'LET',
        pos: raiz.pos,
      };
    }
    throw e;
  }
}

function malFormado(nodo: Nodo, motivo: string): Nodo {
  return { tipo: 'no-soportado', motivo, texto: 'LET', pos: nodo.pos };
}

function contar(nodo: Nodo): number {
  let n = 0;
  const pila: Nodo[] = [nodo];
  while (pila.length > 0) {
    const x = pila.pop() as Nodo;
    n++;
    switch (x.tipo) {
      case 'funcion': pila.push(...x.args); break;
      case 'unaria': case 'porcentaje': pila.push(x.arg); break;
      case 'binaria': pila.push(x.izq, x.der); break;
      case 'matriz': for (const f of x.filas) pila.push(...f); break;
      default: break;
    }
  }
  return n;
}
