/**
 * Lectura superficial de fórmulas de Excel: qué funciones invocan y a qué
 * celdas se refieren.
 *
 * Esto NO es el parser del motor (eso es E2, y produce un AST evaluable). Aquí
 * solo hace falta un tokenizador suficientemente fiel para contar funciones sin
 * confundirse con nombres definidos, texto entrecomillado o referencias. La
 * distinción importa: `LOG10(A1)` es una función y `LOG10` a secas sería un
 * nombre definido; un escáner ingenuo a base de expresiones regulares cuenta
 * mal ambos casos.
 */

export interface ReferenciaCelda {
  hoja?: string;
  /** Referencia A1 sin los `$`, en mayúsculas. */
  celda: string;
}

export interface ReferenciaRango {
  hoja?: string;
  desde: string;
  hasta: string;
}

export interface LecturaFormula {
  /** Nombres de función tal como aparecen, en orden de aparición y con repeticiones. */
  funciones: string[];
  celdas: ReferenciaCelda[];
  rangos: ReferenciaRango[];
  /** Nombres definidos u otros identificadores que no son funciones ni referencias. */
  nombres: string[];
  /** Referencia a otro libro: `[1]Hoja1!A1`. */
  referenciaExterna: boolean;
  /** Referencia estructurada de tabla: `Tabla1[Importe]`. */
  referenciaEstructurada: boolean;
  /** Operador de derrame `A1#`, señal de matriz dinámica. */
  derrame: boolean;
}

const RE_CELDA = /^\$?([A-Z]{1,3})\$?([0-9]{1,7})$/;

function esReferenciaCelda(palabra: string): boolean {
  return RE_CELDA.test(palabra.toUpperCase());
}

function limpiar(celda: string): string {
  return celda.replace(/\$/g, '').toUpperCase();
}

function esCaracterDePalabra(c: string): boolean {
  return /[A-Za-z0-9_.$\\?]/.test(c);
}

/**
 * Tokeniza la fórmula y clasifica cada identificador según lo que le sigue.
 *
 * `texto` puede venir con o sin el `=` inicial.
 */
export function leerFormula(texto: string): LecturaFormula {
  const out: LecturaFormula = {
    funciones: [],
    celdas: [],
    rangos: [],
    nombres: [],
    referenciaExterna: false,
    referenciaEstructurada: false,
    derrame: false,
  };

  const s = texto.startsWith('=') ? texto.slice(1) : texto;
  let i = 0;

  /** Referencia pendiente de saber si es el inicio de un rango `A1:B2`. */
  let pendiente: { hoja?: string; celda: string } | null = null;

  const volcarPendiente = () => {
    if (pendiente) {
      out.celdas.push(
        pendiente.hoja === undefined
          ? { celda: pendiente.celda }
          : { hoja: pendiente.hoja, celda: pendiente.celda },
      );
      pendiente = null;
    }
  };

  while (i < s.length) {
    const c = s[i] as string;

    // Texto literal: "" escapa una comilla dentro de la cadena.
    if (c === '"') {
      i++;
      while (i < s.length) {
        if (s[i] === '"') {
          if (s[i + 1] === '"') i += 2;
          else { i++; break; }
        } else i++;
      }
      volcarPendiente();
      continue;
    }

    // Nombre de hoja entrecomillado: 'Mi hoja'!A1 o '[1]Mi hoja'!A1
    if (c === "'") {
      i++;
      let hoja = '';
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") { hoja += "'"; i += 2; }
          else { i++; break; }
        } else hoja += s[i++];
      }
      if (hoja.startsWith('[')) out.referenciaExterna = true;
      if (s[i] === '!') {
        i++;
        const palabra = leerPalabra(s, i);
        i += palabra.length;
        if (esReferenciaCelda(palabra)) {
          volcarPendiente();
          pendiente = { hoja, celda: limpiar(palabra) };
        }
      }
      continue;
    }

    // Referencia externa o estructurada: [1]Hoja1!A1, Tabla1[Importe]
    if (c === '[') {
      let prof = 0;
      const inicio = i;
      while (i < s.length) {
        if (s[i] === '[') prof++;
        else if (s[i] === ']') { prof--; if (prof === 0) { i++; break; } }
        i++;
      }
      // `[1]` pegado al inicio de una referencia es un libro externo; el resto
      // (precedido de un nombre) es una referencia estructurada de tabla.
      const anterior = inicio > 0 ? (s[inicio - 1] as string) : '';
      if (/[A-Za-z0-9_]/.test(anterior)) out.referenciaEstructurada = true;
      else out.referenciaExterna = true;
      continue;
    }

    if (esCaracterDePalabra(c)) {
      const palabra = leerPalabra(s, i);
      i += palabra.length;

      // Prefijo de hoja sin comillas: Hoja1!A1
      if (s[i] === '!') {
        i++;
        const ref = leerPalabra(s, i);
        i += ref.length;
        if (esReferenciaCelda(ref)) {
          volcarPendiente();
          pendiente = { hoja: palabra, celda: limpiar(ref) };
        }
        continue;
      }

      // Identificador seguido de paréntesis: es una llamada a función.
      if (siguienteNoBlanco(s, i) === '(') {
        volcarPendiente();
        out.funciones.push(palabra);
        continue;
      }

      if (esReferenciaCelda(palabra)) {
        volcarPendiente();
        pendiente = { celda: limpiar(palabra) };
        continue;
      }

      volcarPendiente();
      if (!/^\$?[0-9.]+$/.test(palabra)) out.nombres.push(palabra);
      continue;
    }

    if (c === ':' && pendiente) {
      // Cierre de rango: la referencia pendiente era el extremo izquierdo.
      i++;
      let hoja2: string | undefined;
      if (siguienteNoBlanco(s, i) === "'") {
        // 'Hoja'!B2 como extremo derecho; se ignora la hoja del segundo extremo,
        // que en Excel debe coincidir con la del primero.
        while (i < s.length && s[i] !== "'") i++;
        i++;
        hoja2 = '';
        while (i < s.length && s[i] !== "'") i++;
        i++;
        if (s[i] === '!') i++;
      }
      void hoja2;
      const palabra = leerPalabra(s, i);
      i += palabra.length;
      if (esReferenciaCelda(palabra)) {
        const hoja = pendiente.hoja;
        out.rangos.push(
          hoja === undefined
            ? { desde: pendiente.celda, hasta: limpiar(palabra) }
            : { hoja, desde: pendiente.celda, hasta: limpiar(palabra) },
        );
        pendiente = null;
      } else {
        volcarPendiente();
      }
      continue;
    }

    if (c === '#' && pendiente) {
      out.derrame = true;
      volcarPendiente();
      i++;
      continue;
    }

    volcarPendiente();
    i++;
  }

  volcarPendiente();
  return out;
}

function leerPalabra(s: string, desde: number): string {
  let j = desde;
  while (j < s.length && esCaracterDePalabra(s[j] as string)) j++;
  return s.slice(desde, j);
}

function siguienteNoBlanco(s: string, desde: number): string {
  let j = desde;
  while (j < s.length && /\s/.test(s[j] as string)) j++;
  return j < s.length ? (s[j] as string) : '';
}

/** Convierte `AB` en su índice de columna (1 = A). */
export function columnaAIndice(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Parte `BC12` en columna y fila. */
export function partirCelda(ref: string): { col: number; fila: number } | null {
  const m = RE_CELDA.exec(ref.toUpperCase());
  if (!m) return null;
  return { col: columnaAIndice(m[1] as string), fila: Number(m[2]) };
}
