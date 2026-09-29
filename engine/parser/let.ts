/**
 * `LET`, `LAMBDA` y los **nombres definidos** del libro, resueltos **al
 * parsear**, sustituyendo cada nombre por su expresión.
 *
 * `LET` no calcula nada: pone nombre a una subexpresión para no repetirla.
 * Como ninguna función del motor tiene efectos secundarios (las volátiles,
 * `ALEATORIO` y compañía, ya mandan al modo compatible), escribir
 * `LET(x; A1*2; x+x)` es exactamente lo mismo que `(A1*2)+(A1*2)`. Resolverlo
 * aquí tiene una ventaja grande: **ni el grafo, ni la elección de motor, ni
 * los dos evaluadores tienen que saber que `LET` existe**. Las dependencias de
 * la celda salen solas del árbol ya expandido.
 *
 * `LAMBDA` (F1) es lo mismo con parámetros: `LAMBDA(x; x^2+1)(3)` es `3^2+1`.
 * Se admite de las tres formas en que se escribe en Excel:
 * - **invocada en la celda**: `LAMBDA(x; y; x/y)(A1; A2)`;
 * - **guardada en un `LET`**: `LET(f; LAMBDA(x; 2*x); f(7)+f(1))`;
 * - **con nombre** (Administrador de nombres): `PR_P(T; v; …)`, que puede
 *   llamar a otras con nombre.
 * Una `LAMBDA` puede recibir otra como argumento y ve los nombres del `LET`
 * donde se escribió (no los del sitio donde se llama), como en Excel.
 *
 * Los **nombres definidos** que no son `LAMBDA` (una constante, una celda, un
 * rango) se sustituyen igual, por su fórmula: `R_GAS*1000`, `TC_CO2/PC_CO2`.
 *
 * Las reglas de ámbito de Excel, que son las de cualquier lenguaje:
 * - cada valor puede usar los nombres definidos **antes** que él, no después;
 * - un `LET` o una `LAMBDA` dentro de otro puede redefinir un nombre, y
 *   dentro manda el suyo (también sobre los nombres del libro);
 * - un nombre que no está en ningún `LET` ni en el libro se queda como está
 *   (y la celda irá al modo compatible, como siempre).
 *
 * En el XML de un `.xlsx` los parámetros llegan como `_xlpm.x` y las funciones
 * como `_xlfn.LET` / `_xlfn.LAMBDA`; Office.js los da ya limpios. Se aceptan
 * las dos formas.
 *
 * **Lo que no se desarrolla** (la celda va al modo compatible con el motivo
 * dicho, en vez de dar un número distinto del de Excel):
 * - una `LAMBDA` **recursiva** (una con nombre que se llama a sí misma): al
 *   sustituir no se evalúa el `SI` que la para, así que no acabaría nunca;
 * - una `LAMBDA` que no se invoca, o que se pasa a `MAP`, `REDUCE`… (no hay
 *   todavía funciones que las usen en el motor);
 * - un valor con una **función RIESGO** que el `LET` o la `LAMBDA` usan más
 *   de una vez: en Excel la función se calcula una vez y el valor se reutiliza;
 *   copiada, serían dos sorteos independientes. Con la función en otra celda
 *   (lo habitual) no hay problema: se copia la referencia.
 *
 * **Límite conocido**: la sustitución copia la expresión en cada uso, y una
 * cadena de nombres que se usan dos veces cada uno crece de forma exponencial
 * (`a`, `b = a+a`, `c = b+b`…). Más allá de `NODOS_MAXIMOS` se renuncia y la
 * celda va al modo compatible con el motivo dicho, en vez de colgar el panel.
 * Ningún `LET` escrito a mano por una persona se acerca.
 */

import { recorrer, type Nodo } from './ast.ts';

export const NODOS_MAXIMOS = 20_000;
/** Llamadas a LAMBDA anidadas antes de darla por recursiva. */
export const PROFUNDIDAD_MAXIMA = 64;

/** Nombre interno del nodo de `expresión(args)`: `LAMBDA(x; x)(3)`. Nunca sale del parser. */
export const INVOCAR = '\u0001INVOCAR';

/**
 * Los nombres definidos que ve una fórmula, por nombre en mayúsculas: los del
 * libro y, encima, los de su hoja. El árbol de cada uno, sin expandir.
 */
export type NombresDefinidos = ReadonlyMap<string, Nodo>;

const normalizarFuncion = (n: string) => n.replace(/^_xlfn\./i, '').toUpperCase();
const normalizarNombre = (n: string) => n.replace(/^_xlpm\./i, '').toUpperCase();

/** Una LAMBDA ya leída: sus parámetros, su cuerpo y los nombres que veía donde se escribió. */
interface Cierre {
  cierre: true;
  params: string[];
  cuerpo: Nodo;
  ambito: Ambito;
}
type Valor = Nodo | Cierre;
type Ambito = ReadonlyMap<string, Valor>;

const esCierre = (v: Valor | undefined): v is Cierre => v !== undefined && 'cierre' in v;

class Renuncia extends Error {
  readonly motivo: string;
  readonly texto: string;

  constructor(motivo: string, texto: string) {
    super(motivo);
    this.motivo = motivo;
    this.texto = texto;
  }
}

const esRiesgo = (nombre: string) => /^(?:_xludf\.)?(?:RIESGO|RISK)\./i.test(nombre);

export function expandirLet(raiz: Nodo, nombres: NombresDefinidos = new Map()): Nodo {
  let nodos = 0;
  let cambiado = false;
  let profundidad = 0;
  /** Nombres del libro que se están resolviendo (para no entrar en bucle). */
  const resolviendo = new Set<string>();

  const contarNodos = (extra: number) => {
    nodos += extra;
    if (nodos > NODOS_MAXIMOS) {
      throw new Renuncia(`LET o LAMBDA demasiado grande para resolverla (más de ${NODOS_MAXIMOS} nodos al expandir)`, 'LET');
    }
  };

  /** Un nombre del libro, si no lo tapa un LET o una LAMBDA. */
  const delLibro = (nombre: string, ambito: Ambito): Nodo | undefined =>
    ambito.has(nombre) ? undefined : nombres.get(nombre);

  const cierreDe = (nodo: Extract<Nodo, { tipo: 'funcion' }>, ambito: Ambito): Cierre => {
    const args = nodo.args;
    if (args.length < 1) throw new Renuncia('LAMBDA necesita al menos el cálculo', 'LAMBDA');
    const params: string[] = [];
    for (let i = 0; i < args.length - 1; i++) {
      const p = args[i] as Nodo;
      if (p.tipo !== 'nombre' || p.hoja !== undefined) {
        throw new Renuncia(`el argumento ${i + 1} de LAMBDA tiene que ser un nombre`, 'LAMBDA');
      }
      params.push(normalizarNombre(p.nombre));
    }
    return { cierre: true, params, cuerpo: args[args.length - 1] as Nodo, ambito };
  };

  /**
   * Lo que vale una expresión que puede ser una LAMBDA (el valor de un LET o
   * el argumento de una llamada): el cierre si lo es, el árbol expandido si no.
   */
  const valorDe = (nodo: Nodo, ambito: Ambito): Valor => {
    if (nodo.tipo === 'funcion' && normalizarFuncion(nodo.nombre) === 'LAMBDA') {
      cambiado = true;
      return cierreDe(nodo, ambito);
    }
    if (nodo.tipo === 'nombre' && nodo.hoja === undefined) {
      const clave = normalizarNombre(nodo.nombre);
      const v = ambito.get(clave);
      if (esCierre(v)) return v;
      const libro = delLibro(clave, ambito);
      if (libro) {
        cambiado = true;
        return conNombreDelLibro(clave, () => valorDe(libro, new Map()));
      }
    }
    return visitar(nodo, ambito);
  };

  const conNombreDelLibro = <T>(clave: string, f: () => T): T => {
    if (resolviendo.has(clave)) {
      throw new Renuncia(`el nombre ${clave} se define a partir de sí mismo`, clave);
    }
    resolviendo.add(clave);
    try {
      return f();
    } finally {
      resolviendo.delete(clave);
    }
  };

  const aplicar = (c: Cierre, args: readonly Nodo[], ambito: Ambito, nodo: Nodo, texto: string): Nodo => {
    if (args.length !== c.params.length) {
      // Excel: #¡VALOR! si sobran o faltan argumentos.
      return { tipo: 'error', valor: '#VALUE!', pos: nodo.pos };
    }
    if (++profundidad > PROFUNDIDAD_MAXIMA) {
      throw new Renuncia(`${texto}: LAMBDA recursiva (se llama a sí misma); el motor rápido no la desarrolla`, texto);
    }
    try {
      const interior = new Map(c.ambito);
      c.params.forEach((p, i) => interior.set(p, valorDe(args[i] as Nodo, ambito)));
      return visitar(c.cuerpo, interior);
    } finally {
      profundidad--;
    }
  };

  const visitar = (nodo: Nodo, ambito: Ambito): Nodo => {
    contarNodos(1);
    switch (nodo.tipo) {
      case 'nombre': {
        if (nodo.hoja !== undefined) return nodo;
        const clave = normalizarNombre(nodo.nombre);
        const valor = ambito.get(clave);
        if (esCierre(valor)) throw new Renuncia(`${clave} es una LAMBDA y aquí no se invoca`, clave);
        if (valor) {
          contarNodos(contar(valor));
          return valor;
        }
        const libro = delLibro(clave, ambito);
        if (!libro) return nodo;
        cambiado = true;
        return conNombreDelLibro(clave, () => {
          const v = valorDe(libro, new Map());
          if (esCierre(v)) throw new Renuncia(`${clave} es una LAMBDA y aquí no se invoca`, clave);
          return v;
        });
      }
      case 'funcion': {
        const nombre = normalizarFuncion(nodo.nombre);
        if (nombre === 'LET') {
          cambiado = true;
          return expandirUno(nodo, ambito);
        }
        if (nombre === 'LAMBDA') {
          throw new Renuncia('LAMBDA sin invocar, o pasada a una función (MAP, REDUCE…) que el motor rápido todavía no tiene', 'LAMBDA');
        }
        if (nombre === INVOCAR) {
          cambiado = true;
          const [destino, ...args] = nodo.args as [Nodo, ...Nodo[]];
          const f = valorDe(destino, ambito);
          if (!esCierre(f)) throw new Renuncia('solo se puede invocar una LAMBDA: expresión(argumentos)', '(…)');
          return aplicar(f, args, ambito, nodo, 'LAMBDA');
        }
        // `f(3)` con `f` una LAMBDA del LET, o `PR_P(…)` con nombre en el libro.
        const clave = normalizarNombre(nodo.nombre);
        const local = ambito.get(clave);
        if (esCierre(local)) {
          cambiado = true;
          return aplicar(local, nodo.args, ambito, nodo, clave);
        }
        if (local !== undefined) throw new Renuncia(`${clave} no es una LAMBDA y se usa como función`, clave);
        const libro = delLibro(clave, ambito);
        if (libro) {
          const v = conNombreDelLibro(clave, () => valorDe(libro, new Map()));
          if (!esCierre(v)) throw new Renuncia(`el nombre ${clave} no es una LAMBDA y se usa como función`, clave);
          cambiado = true;
          return aplicar(v, nodo.args, ambito, nodo, clave);
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

  const expandirUno = (nodo: Extract<Nodo, { tipo: 'funcion' }>, exterior: Ambito): Nodo => {
    const args = nodo.args;
    if (args.length < 3 || args.length % 2 === 0) {
      throw new Renuncia('LET necesita parejas nombre–valor y un cálculo final', 'LET');
    }
    const ambito = new Map(exterior);
    for (let i = 0; i + 1 < args.length - 1; i += 2) {
      const nombre = args[i] as Nodo;
      if (nombre.tipo !== 'nombre' || nombre.hoja !== undefined) {
        throw new Renuncia(`el argumento ${i + 1} de LET tiene que ser un nombre`, 'LET');
      }
      // El valor se expande con el ámbito que hay **hasta aquí**: un nombre
      // no puede usarse en su propia definición ni en las anteriores.
      ambito.set(normalizarNombre(nombre.nombre), valorDe(args[i + 1] as Nodo, ambito));
    }
    return visitar(args[args.length - 1] as Nodo, ambito);
  };

  try {
    const resultado = visitar(raiz, new Map());
    if (!cambiado) return raiz;
    riesgoRepetido(resultado);
    return resultado;
  } catch (e) {
    if (e instanceof Renuncia) {
      return { tipo: 'no-soportado', motivo: e.motivo, texto: e.texto, pos: raiz.pos };
    }
    throw e;
  }
}

/**
 * La sustitución reutiliza el mismo objeto en cada uso de un nombre: si una
 * llamada RIESGO aparece dos veces **siendo el mismo objeto**, es un valor que
 * Excel calcularía una vez y aquí serían dos sorteos. Se renuncia.
 */
function riesgoRepetido(raiz: Nodo): void {
  const vistas = new Set<Nodo>();
  recorrer(raiz, (n) => {
    if (n.tipo !== 'funcion' || !esRiesgo(n.nombre)) return;
    if (vistas.has(n)) {
      throw new Renuncia(
        'un LET o una LAMBDA usa varias veces un valor con una función RIESGO (serían sorteos distintos): pon la función RIESGO en otra celda',
        n.nombre,
      );
    }
    vistas.add(n);
  });
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
