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
