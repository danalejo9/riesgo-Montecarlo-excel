/**
 * Las formas que devuelve el lector del libro, sin Office.js.
 *
 * Están separadas de `lectorLibro.ts` por la misma razón que `direcciones.ts`
 * lo está de `rangos.ts`: en cuanto un archivo nombra un tipo del espacio
 * `Excel`, deja de poder compilarse con el proyecto del motor, y entonces
 * ningún test puede importar nada que dependa de él ni de lejos. Los tipos son
 * datos; no necesitan Office para existir.
 */

import type { FormulaCelda } from '../engine/graph/index.ts';

/** Qué se ha encontrado en una celda que no es una fórmula. */
export interface ValorEstatico {
  hoja: string;
  col: number;
  fila: number;
  /** El tipo tal como lo clasifica Excel, ya traducido. */
  tipo: 'numero' | 'texto' | 'logico' | 'error';
  numero?: number;
  texto?: string;
}

export interface LibroLeido {
  /** Las celdas con fórmula, listas para `construirGrafo`. */
  formulas: FormulaCelda[];
  /** Las celdas con valor pero sin fórmula: las constantes del modelo. */
  valores: ValorEstatico[];
  estadisticas: EstadisticasLectura;
}

export interface EstadisticasLectura {
  hojas: number;
  hojasVisibles: number;
  /** Celdas recorridas, incluidas las vacías dentro del rango usado. */
  celdasRecorridas: number;
  celdasConContenido: number;
  formulas: number;
  /** Cuántas veces se ha ido y vuelto al proceso de Excel. */
  sincronizaciones: number;
  milisegundos: number;
}

export interface OpcionesLectura {
  /** Incluir las hojas ocultas. Por omisión no: rara vez son parte del modelo. */
  incluirOcultas?: boolean;
  /** Se llama tras cada lote, para poder enseñar progreso en un libro grande. */
  progreso?: (hojasLeidas: number, hojasTotales: number) => void;
}
