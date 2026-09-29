/**
 * El modo del libro (B2) en memoria, compartido por el panel y las funciones
 * `RIESGO.*` a través de `globalThis` (runtime compartido, B1: son la misma
 * página pero dos paquetes). Sin Office.js: va también en `funciones.js`.
 */

import { MODO_POR_DEFECTO, type ModoLibro } from '../engine/modelo/valorFijo.ts';

interface Compartido {
  __riesgoModoLibro?: ModoLibro;
}
const compartido = globalThis as unknown as Compartido;

export function modoLibroEnMemoria(): ModoLibro {
  return compartido.__riesgoModoLibro ?? MODO_POR_DEFECTO;
}

export function ponerModoLibroEnMemoria(m: ModoLibro): void {
  compartido.__riesgoModoLibro = m;
}
