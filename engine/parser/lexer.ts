/**
 * Tokenizador de fórmulas de Excel.
 *
 * Trabaja sobre la forma **en-US** de la fórmula: `SUM(A1,B1)`, con coma como
 * separador de argumentos. Es lo que devuelve `range.formulas` de Office.js y
 * lo que guarda el propio `.xlsx`, independientemente del idioma con el que el
 * usuario escribiera la fórmula. Así el motor no depende de la configuración
 * regional: un libro en es-ES y otro en en-US producen exactamente los mismos
 * tokens.
 */

export type TipoToken =
  | 'num' | 'txt' | 'err' | 'ref' | 'nombre' | 'func'
  | 'op' | '(' | ')' | '{' | '}' | ',' | ';' | '%'
  | 'no-soportado' | 'fin';

export interface Token {
  t: TipoToken;
  pos: number;
  /** Texto original del token. */
  texto: string;
  /** Valor numérico ya convertido, solo en `num`. */
  num?: number;
  /** Contenido ya desescapado, solo en `txt`. */
  cadena?: string;
  /** Hoja cualificada, en `ref` y `nombre`. */
  hoja?: string;
  /** Motivo, solo en `no-soportado`. */
  motivo?: string;
}

const ERRORES = [
  '#DIV/0!', '#N/A', '#NAME?', '#NULL!', '#NUM!', '#REF!', '#VALUE!',
  '#SPILL!', '#CALC!', '#GETTING_DATA',
];

const RE_REF = /^\$?[A-Z]{1,3}\$?[0-9]{1,7}$/;

export function esReferencia(texto: string): boolean {
  return RE_REF.test(texto.toUpperCase());
}

export function tokenizar(entrada: string): Token[] {
  const s = entrada.startsWith('=') ? entrada.slice(1) : entrada;
  const desplazamiento = entrada.startsWith('=') ? 1 : 0;
  const tokens: Token[] = [];
  let i = 0;

  const empujar = (t: Omit<Token, 'pos'> & { pos?: number }, pos: number) =>
    tokens.push({ ...t, pos: pos + desplazamiento } as Token);

  while (i < s.length) {
    const inicio = i;
    const c = s[i] as string;

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      // El espacio es el operador de intersección de Excel (`A1:A5 B1:B5`).
      // No se soporta: al ignorarlo, una intersección real acaba dando un error
      // de sintaxis, que es justo lo que queremos que pase (queda marcada como
      // no evaluable en lugar de calcularse mal en silencio).
      i++;
      continue;
    }

    // --- Texto literal ---
    if (c === '"') {
      i++;
      let valor = '';
      let cerrada = false;
      while (i < s.length) {
        if (s[i] === '"') {
          if (s[i + 1] === '"') { valor += '"'; i += 2; }
          else { i++; cerrada = true; break; }
        } else valor += s[i++];
      }
      if (!cerrada) {
        empujar({ t: 'no-soportado', texto: s.slice(inicio), motivo: 'Cadena de texto sin cerrar' }, inicio);
        break;
      }
      empujar({ t: 'txt', texto: s.slice(inicio, i), cadena: valor }, inicio);
      continue;
    }

    // --- Nombre de hoja entrecomillado: 'Mi hoja'!A1 ---
    if (c === "'") {
      i++;
      let hoja = '';
      while (i < s.length) {
        if (s[i] === "'") {
          if (s[i + 1] === "'") { hoja += "'"; i += 2; }
          else { i++; break; }
        } else hoja += s[i++];
      }
      if (s[i] !== '!') {
        empujar({ t: 'no-soportado', texto: hoja, motivo: 'Nombre entrecomillado sin referencia' }, inicio);
        continue;
      }
      i++;
      if (hoja.startsWith('[')) {
        const resto = leerPalabra(s, i);
        i += resto.length;
        empujar({ t: 'no-soportado', texto: `'${hoja}'!${resto}`, motivo: 'Referencia a otro libro' }, inicio);
        continue;
      }
      const palabra = leerPalabra(s, i);
      i += palabra.length;
      empujar(
        esReferencia(palabra)
          ? { t: 'ref', texto: palabra, hoja }
          : { t: 'nombre', texto: palabra, hoja },
        inicio,
      );
      continue;
    }

    // --- Error literal: #REF!, #N/A, ... ---
    if (c === '#') {
      const resto = s.slice(i).toUpperCase();
      const encontrado = ERRORES.find((e) => resto.startsWith(e));
      if (encontrado) {
        empujar({ t: 'err', texto: encontrado }, inicio);
        i += encontrado.length;
        continue;
      }
      // `A1#` (derrame de matriz dinámica) llega aquí: el `A1` ya se emitió.
      empujar({ t: 'no-soportado', texto: '#', motivo: 'Matriz dinámica (operador de derrame)' }, inicio);
      i++;
      continue;
    }

    // --- Referencia externa o estructurada ---
    if (c === '[') {
      let prof = 0;
      while (i < s.length) {
        if (s[i] === '[') prof++;
        else if (s[i] === ']') { prof--; if (prof === 0) { i++; break; } }
        i++;
      }
      const resto = leerPalabra(s, i);
      i += resto.length;
      if (s[i] === '!') { i++; i += leerPalabra(s, i).length; }
      empujar({ t: 'no-soportado', texto: s.slice(inicio, i), motivo: 'Referencia a otro libro' }, inicio);
      continue;
    }

    // --- Número ---
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
      while (i < s.length && /[0-9]/.test(s[i] as string)) i++;
      if (s[i] === '.') { i++; while (i < s.length && /[0-9]/.test(s[i] as string)) i++; }
      if (s[i] === 'e' || s[i] === 'E') {
        const guardado = i;
        i++;
        if (s[i] === '+' || s[i] === '-') i++;
        if (/[0-9]/.test(s[i] ?? '')) { while (i < s.length && /[0-9]/.test(s[i] as string)) i++; }
        else i = guardado;
      }
      const texto = s.slice(inicio, i);
      empujar({ t: 'num', texto, num: Number(texto) }, inicio);
      continue;
    }

    // --- Identificadores: funciones, referencias, nombres definidos ---
    if (/[A-Za-z_\\$]/.test(c)) {
      const palabra = leerPalabra(s, i);
      i += palabra.length;

      // Prefijo de hoja sin comillas: Hoja1!A1
      if (s[i] === '!') {
        i++;
        const resto = leerPalabra(s, i);
        i += resto.length;
        empujar(
          esReferencia(resto)
            ? { t: 'ref', texto: resto, hoja: palabra }
            : { t: 'nombre', texto: resto, hoja: palabra },
          inicio,
        );
        continue;
      }

      // Referencia estructurada de tabla: Tabla1[Importe]
      if (s[i] === '[') {
        let prof = 0;
        while (i < s.length) {
          if (s[i] === '[') prof++;
          else if (s[i] === ']') { prof--; if (prof === 0) { i++; break; } }
          i++;
        }
        empujar(
          { t: 'no-soportado', texto: s.slice(inicio, i), motivo: 'Referencia estructurada de tabla' },
          inicio,
        );
        continue;
      }

      if (siguienteNoBlanco(s, i) === '(') {
        empujar({ t: 'func', texto: palabra }, inicio);
        continue;
      }

      empujar(esReferencia(palabra) ? { t: 'ref', texto: palabra } : { t: 'nombre', texto: palabra }, inicio);
      continue;
    }

    // --- Operadores y signos de puntuación ---
    const dos = s.slice(i, i + 2);
    if (dos === '<=' || dos === '>=' || dos === '<>') {
      empujar({ t: 'op', texto: dos }, inicio);
      i += 2;
      continue;
    }
    if ('+-*/^&=<>:'.includes(c)) {
      empujar({ t: 'op', texto: c }, inicio);
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '{' || c === '}' || c === ',' || c === ';' || c === '%') {
      empujar({ t: c as TipoToken, texto: c }, inicio);
      i++;
      continue;
    }

    empujar({ t: 'no-soportado', texto: c, motivo: `Carácter inesperado "${c}"` }, inicio);
    i++;
  }

  tokens.push({ t: 'fin', texto: '', pos: s.length + desplazamiento });
  return tokens;
}

function leerPalabra(s: string, desde: number): string {
  let j = desde;
  while (j < s.length && /[A-Za-z0-9_.$\\?]/.test(s[j] as string)) j++;
  return s.slice(desde, j);
}

function siguienteNoBlanco(s: string, desde: number): string {
  let j = desde;
  while (j < s.length && /\s/.test(s[j] as string)) j++;
  return j < s.length ? (s[j] as string) : '';
}
