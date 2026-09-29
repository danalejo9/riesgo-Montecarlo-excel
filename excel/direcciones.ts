/**
 * Resolver una dirección de texto (`Hoja1!B7`, `'Mi hoja'!B7`, `B7`) al rango
 * de Office.js correspondiente.
 *
 * Parece trivial y no lo es: el nombre de una hoja puede llevar espacios, y
 * entonces Excel lo escribe entre comillas simples, duplicando las comillas
 * que el propio nombre contenga (`'Caja de Ana''s'!A1`). Partir por `!` a lo
 * bruto rompe con el primer libro real que tenga una hoja llamada
 * "Flujo de caja".
 *
 * Una dirección sin hoja se resuelve contra la hoja activa, que es lo que
 * hace Excel cuando el usuario escribe `B7` en un cuadro de diálogo.
 */

import { claveDeReferencia } from '../engine/graph/index.ts';

export interface DireccionPartida {
  /** `undefined` si la dirección no nombraba hoja. */
  hoja?: string;
  /** La parte A1 (`B7`, `B7:D9`). */
  rango: string;
}

/**
 * Parte `Hoja!Rango` respetando las comillas simples. Se busca el **último**
 * `!` fuera de comillas: el nombre de una hoja no puede contener `!`, así que
 * cualquier `!` sin comillar es el separador.
 */
export function partirDireccion(direccion: string): DireccionPartida {
  const texto = direccion.trim();
  let enComillas = false;
  let corte = -1;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "'") {
      // Dos comillas seguidas dentro de un nombre comillado son una comilla
      // literal, no el fin del nombre.
      if (enComillas && texto[i + 1] === "'") {
        i++;
        continue;
      }
      enComillas = !enComillas;
    } else if (c === '!' && !enComillas) {
      corte = i;
    }
  }

  if (corte < 0) return { rango: texto };

  let hoja = texto.slice(0, corte).trim();
  if (hoja.startsWith("'") && hoja.endsWith("'") && hoja.length >= 2) {
    hoja = hoja.slice(1, -1).replace(/''/g, "'");
  }

  return { hoja, rango: texto.slice(corte + 1).trim() };
}

/** Escribe una dirección completa, comillando la hoja solo si hace falta. */
export function componerDireccion(hoja: string, rango: string): string {
  const necesitaComillas = /[^A-Za-z0-9_.]/.test(hoja);
  const nombre = necesitaComillas ? `'${hoja.replace(/'/g, "''")}'` : hoja;
  return `${nombre}!${rango}`;
}

/**
 * Una dirección es "directa" si nombra una celda por su letra y su número
 * (`B7`, `Hoja1!$B$7`). Lo que no lo sea es un nombre definido (`Tasa_IVA`) y
 * hay que preguntarle a Excel dónde está.
 */
export function esDireccionDirecta(direccion: string): boolean {
  return REF_CELDA.test(partirDireccion(direccion).rango);
}

const REF_CELDA = /^\$?[A-Za-z]{1,3}\$?[0-9]{1,7}$/;

/**
 * La clave que usa el grafo del motor (`Hoja!B7`) a partir de una dirección de
 * Excel.
 *
 * Normaliza los `$` de las referencias absolutas: `Hoja1!$B$7` y `Hoja1!B7`
 * son la misma celda, y si el modelo guardara una forma y el libro devolviera
 * la otra, el motor buscaría una celda que no existe.
 *
 * Devuelve `undefined` si la dirección no nombra una sola celda —un rango, un
 * nombre definido— en vez de lanzar: quien llama tiene que decidir si eso es
 * un error del usuario o algo que preguntarle a Excel.
 */
export function claveDesdeDireccion(direccion: string, hojaActiva?: string): string | undefined {
  const { hoja, rango } = partirDireccion(direccion);
  const destino = hoja ?? hojaActiva;
  if (destino === undefined || !REF_CELDA.test(rango)) return undefined;
  return claveDeReferencia(destino, rango);
}

/** La clave canónica de una dirección, para comparar «Modelo!$C$32» con «Modelo!C32» (E6). */
export function claveComparable(direccion: string): string | undefined {
  return claveDesdeDireccion(direccion.replace(/\$/g, ''));
}

/** Las celdas de `Hoja!D28:H28`, de izquierda a derecha y de arriba abajo. */
export function celdasDelRango(direccion: string): string[] {
  const { hoja, rango } = partirDireccion(direccion);
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7}):\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(rango);
  if (!m) return [];
  const letras = (n: number): string => (n <= 0 ? '' : letras(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)));
  const col = (l: string) => [...l.toUpperCase()].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0);
  const [c1, c2] = [col(m[1] as string), col(m[3] as string)].sort((a, b) => a - b) as [number, number];
  const [f1, f2] = [Number(m[2]), Number(m[4])].sort((a, b) => a - b) as [number, number];
  const out: string[] = [];
  for (let f = f1; f <= f2; f++) for (let c = c1; c <= c2; c++) { const celda = `${letras(c)}${f}`; out.push(hoja ? componerDireccion(hoja, celda) : celda); }
  return out;
}
