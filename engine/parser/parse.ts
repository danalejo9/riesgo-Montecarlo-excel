/**
 * Parser de fórmulas de Excel (precedencia por escalada).
 *
 * Dos decisiones que conviene tener presentes al leer el código:
 *
 * 1. **No lanza excepciones hacia fuera.** Devuelve `{ ok: false, error }`. Una
 *    fórmula que no se puede parsear no es un fallo del programa: es una celda
 *    que el motor rápido no podrá evaluar y que hay que reportar al usuario con
 *    su posición exacta. El ejecutor procesa miles de celdas y no puede
 *    detenerse en la primera rara.
 *
 * 2. **Lo no soportado se representa, no se descarta.** Una referencia a otro
 *    libro produce un nodo `no-soportado` con su motivo, en lugar de un error
 *    de sintaxis. Así el informe de compatibilidad puede decir "esta celda usa
 *    una referencia externa" en vez de "no se entiende esta fórmula".
 */

import {
  columnaDeLetras,
  type Nodo,
  type OpBinario,
  type RefCelda,
  type RefRango,
} from './ast.ts';
import { tokenizar, type Token } from './lexer.ts';

export interface ErrorSintaxis {
  mensaje: string;
  pos: number;
}

export type ResultadoParseo =
  | { ok: true; ast: Nodo }
  | { ok: false; error: ErrorSintaxis };

/** Precedencia de los operadores binarios. Todos asocian por la izquierda. */
const PRECEDENCIA: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '<=': 1, '>': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

const MAX_COLUMNA = 16384; // XFD
const MAX_FILA = 1048576;

class Fallo extends Error {
  readonly pos: number;

  constructor(pos: number, mensaje: string) {
    super(mensaje);
    this.pos = pos;
  }
}

export function parsear(formula: string): ResultadoParseo {
  try {
    const p = new Parser(tokenizar(formula));
    const ast = p.expresion(0);
    p.esperarFin();
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof Fallo) return { ok: false, error: { mensaje: e.message, pos: e.pos } };
    throw e;
  }
}

class Parser {
  private i = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private get actual(): Token {
    return this.tokens[this.i] as Token;
  }

  private avanzar(): Token {
    return this.tokens[this.i++] as Token;
  }

  esperarFin(): void {
    if (this.actual.t !== 'fin') {
      throw new Fallo(this.actual.pos, `Sobra "${this.actual.texto}" al final de la fórmula`);
    }
  }

  /** Escalada de precedencia sobre los operadores binarios. */
  expresion(minimo: number): Nodo {
    let izq = this.unaria();

    for (;;) {
      const t = this.actual;
      if (t.t !== 'op') break;
      const prec = PRECEDENCIA[t.texto];
      if (prec === undefined || prec < minimo) break;

      this.avanzar();
      const der = this.expresion(prec + 1);
      izq = { tipo: 'binaria', op: t.texto as OpBinario, izq, der, pos: t.pos };
    }

    return izq;
  }

  /**
   * Unario.
   *
   * En Excel el menos unario se aplica antes que la potencia: `-2^2` vale 4, no
   * −4. Por eso `unaria` está por encima de `^` en el descenso y el operando de
   * `^` se lee con `unaria`.
   */
  private unaria(): Nodo {
    const t = this.actual;
    if (t.t === 'op' && (t.texto === '-' || t.texto === '+')) {
      this.avanzar();
      return { tipo: 'unaria', op: t.texto, arg: this.unaria(), pos: t.pos };
    }
    return this.posfijo();
  }

  /** Porcentaje: `50%`. Es el operador que más se pega al operando. */
  private posfijo(): Nodo {
    let n = this.rango();

    for (;;) {
      const t = this.actual;

      if (t.t === '%') {
        this.avanzar();
        n = { tipo: 'porcentaje', arg: n, pos: t.pos };
        continue;
      }

      // `A1#` — el derrame de una matriz dinámica. El lexer emite la celda y
      // luego el `#` suelto; aquí se absorbe para que la celda entera quede
      // marcada como no soportada en vez de dar un error de sintaxis.
      if (t.t === 'no-soportado' && t.texto === '#') {
        this.avanzar();
        n = {
          tipo: 'no-soportado',
          motivo: t.motivo ?? 'Matriz dinámica',
          texto: '#',
          pos: t.pos,
        };
        continue;
      }

      return n;
    }
  }

  /** Operador de rango `:`, el de mayor precedencia de todos. */
  private rango(): Nodo {
    let izq = this.primaria();

    while (this.actual.t === 'op' && this.actual.texto === ':') {
      const t = this.avanzar();
      const der = this.primaria();
      izq = this.combinarRango(izq, der, t.pos);
    }

    return izq;
  }

  private combinarRango(izq: Nodo, der: Nodo, pos: number): Nodo {
    // A1:B5
    if (izq.tipo === 'celda' && der.tipo === 'celda') {
      const ref: RefRango = {
        col1: Math.min(izq.ref.col, der.ref.col),
        fila1: Math.min(izq.ref.fila, der.ref.fila),
        col2: Math.max(izq.ref.col, der.ref.col),
        fila2: Math.max(izq.ref.fila, der.ref.fila),
      };
      if (izq.ref.hoja !== undefined) ref.hoja = izq.ref.hoja;
      return { tipo: 'rango', ref, pos };
    }

    // A:C — columnas enteras. El lexer las ve como dos nombres.
    if (izq.tipo === 'nombre' && der.tipo === 'nombre' &&
        esLetrasDeColumna(izq.nombre) && esLetrasDeColumna(der.nombre)) {
      const c1 = columnaDeLetras(izq.nombre);
      const c2 = columnaDeLetras(der.nombre);
      const ref: RefRango = {
        col1: Math.min(c1, c2), fila1: null, col2: Math.max(c1, c2), fila2: null,
      };
      if (izq.hoja !== undefined) ref.hoja = izq.hoja;
      return { tipo: 'rango', ref, pos };
    }

    // 3:7 — filas enteras.
    if (izq.tipo === 'numero' && der.tipo === 'numero' &&
        esFilaEntera(izq.valor) && esFilaEntera(der.valor)) {
      return {
        tipo: 'rango',
        ref: {
          col1: null,
          fila1: Math.min(izq.valor, der.valor),
          col2: null,
          fila2: Math.max(izq.valor, der.valor),
        },
        pos,
      };
    }

    // OFFSET(...):A1, nombre:nombre, etc. Excel lo admite; el motor no.
    return {
      tipo: 'no-soportado',
      motivo: 'Rango construido dinámicamente',
      texto: ':',
      pos,
    };
  }

  private primaria(): Nodo {
    const t = this.avanzar();

    switch (t.t) {
      case 'num':
        return { tipo: 'numero', valor: t.num as number, pos: t.pos };

      case 'txt':
        return { tipo: 'texto', valor: t.cadena as string, pos: t.pos };

      case 'err':
        return { tipo: 'error', valor: t.texto as never, pos: t.pos };

      case 'ref':
        return { tipo: 'celda', ref: refDeTexto(t.texto, t.hoja, t.pos), pos: t.pos };

      case 'nombre': {
        const mayus = t.texto.toUpperCase();
        if (mayus === 'TRUE' || mayus === 'FALSE') {
          return { tipo: 'logico', valor: mayus === 'TRUE', pos: t.pos };
        }
        const n: Nodo = { tipo: 'nombre', nombre: t.texto, pos: t.pos };
        if (t.hoja !== undefined) (n as { hoja?: string }).hoja = t.hoja;
        return n;
      }

      case 'func':
        return this.llamada(t);

      case '(': {
        const dentro = this.expresion(0);
        if (this.actual.t === ',') {
          // (A1:A5,C1:C5) es la unión de rangos de Excel.
          let t2: Token = this.actual;
          while (t2.t !== ')' && t2.t !== 'fin') { this.avanzar(); t2 = this.actual; }
          this.consumir(')');
          return { tipo: 'no-soportado', motivo: 'Unión de rangos', texto: '(…,…)', pos: t.pos };
        }
        this.consumir(')');
        return dentro;
      }

      case '{':
        return this.matriz(t);

      case 'no-soportado':
        return {
          tipo: 'no-soportado',
          motivo: t.motivo ?? 'Construcción no soportada',
          texto: t.texto,
          pos: t.pos,
        };

      case 'op':
        throw new Fallo(t.pos, `Falta un operando antes de "${t.texto}"`);

      case 'fin':
        throw new Fallo(t.pos, 'La fórmula termina antes de tiempo');

      default:
        throw new Fallo(t.pos, `No se esperaba "${t.texto}"`);
    }
  }

  private llamada(nombre: Token): Nodo {
    this.consumir('(');
    const args: Nodo[] = [];

    if (this.actual.t === ')') {
      this.avanzar();
      return { tipo: 'funcion', nombre: nombre.texto, args, pos: nombre.pos };
    }

    for (;;) {
      // Argumento omitido: IF(A1,,0) y también el hueco final de IF(A1,0,).
      const antes: Token = this.actual;
      if (antes.t === ',' || antes.t === ')') {
        args.push({ tipo: 'vacio', pos: antes.pos });
      } else {
        args.push(this.expresion(0));
      }

      const sep: Token = this.actual;
      if (sep.t === ',') { this.avanzar(); continue; }
      if (sep.t === ')') { this.avanzar(); break; }

      throw new Fallo(
        sep.pos,
        `Se esperaba "," o ")" en los argumentos de ${nombre.texto}`,
      );
    }

    return { tipo: 'funcion', nombre: nombre.texto, args, pos: nombre.pos };
  }

  /** Constante matricial: {1,2;3,4}. La coma separa columnas y el `;` filas. */
  private matriz(apertura: Token): Nodo {
    const filas: Nodo[][] = [];
    let fila: Nodo[] = [];

    if (this.actual.t === '}') {
      this.avanzar();
      return { tipo: 'matriz', filas: [], pos: apertura.pos };
    }

    for (;;) {
      fila.push(this.expresion(0));

      const sep: Token = this.actual;
      if (sep.t === ',') { this.avanzar(); continue; }
      if (sep.t === ';') { this.avanzar(); filas.push(fila); fila = []; continue; }
      if (sep.t === '}') { this.avanzar(); filas.push(fila); break; }

      throw new Fallo(sep.pos, 'Constante matricial mal formada');
    }

    const ancho = filas[0]?.length ?? 0;
    if (filas.some((f) => f.length !== ancho)) {
      throw new Fallo(apertura.pos, 'Las filas de la constante matricial tienen distinto tamaño');
    }

    return { tipo: 'matriz', filas, pos: apertura.pos };
  }

  private consumir(tipo: Token['t']): void {
    const t: Token = this.actual;
    if (t.t !== tipo) {
      throw new Fallo(t.pos, `Se esperaba "${tipo}" y hay "${t.texto || 'fin'}"`);
    }
    this.avanzar();
  }
}

function refDeTexto(texto: string, hoja: string | undefined, pos: number): RefCelda {
  const m = /^\$?([A-Z]{1,3})\$?([0-9]{1,7})$/.exec(texto.toUpperCase());
  if (!m) throw new Fallo(pos, `Referencia no válida: ${texto}`);

  const col = columnaDeLetras(m[1] as string);
  const fila = Number(m[2]);
  if (col > MAX_COLUMNA || fila > MAX_FILA || fila < 1) {
    throw new Fallo(pos, `Referencia fuera de la hoja: ${texto}`);
  }

  return hoja === undefined ? { col, fila } : { hoja, col, fila };
}

function esLetrasDeColumna(texto: string): boolean {
  return /^[A-Za-z]{1,3}$/.test(texto) && columnaDeLetras(texto) <= MAX_COLUMNA;
}

function esFilaEntera(valor: number): boolean {
  return Number.isInteger(valor) && valor >= 1 && valor <= MAX_FILA;
}
