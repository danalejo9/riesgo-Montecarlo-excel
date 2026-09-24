/**
 * Informe de compatibilidad **desde dentro de Excel**, sobre el libro abierto.
 *
 * El escáner de E1 (`scanner/`) contesta la misma pregunta leyendo el `.xlsx`
 * desde el disco. Este lo hace a través de Office.js, sobre lo que hay abierto
 * en pantalla. Los dos caminos son independientes —distinto origen de datos,
 * distinto lector— y **tienen que coincidir**: si el mismo libro da resultados
 * distintos por una vía y por otra, uno de los dos está mal, y saberlo vale
 * más que cualquier test que yo pueda escribir.
 *
 * Reutiliza el parser y el registro del motor en vez de reimplementar la
 * clasificación, que es justo la deriva que ya se coló tres veces entre el
 * catálogo del escáner y lo que el motor sabe hacer de verdad.
 */

import { funcionSoportada } from '../engine/functions/registry.ts';
import type { FormulaCelda } from '../engine/graph/index.ts';
import { parsear, recorrer, type Nodo } from '../engine/parser/index.ts';

export interface UsoDeFuncion {
  nombre: string;
  veces: number;
  /** Una celda donde aparece, para poder ir a mirarla. */
  ejemplo: string;
  soportada: boolean;
}

export interface InformeCompatibilidad {
  formulasAnalizadas: number;
  /** Fórmulas que el parser no entendió: un problema del motor, no del libro. */
  formulasConErrorDeSintaxis: number;
  ejemplosDeErrorDeSintaxis: string[];
  funciones: UsoDeFuncion[];
  /** Las que el motor no sabe evaluar hoy, ordenadas por uso. */
  noSoportadas: UsoDeFuncion[];
  /** Fórmulas que solo usan funciones soportadas. */
  formulasEvaluables: number;
  cobertura: number;
}

export function analizarCompatibilidad(formulas: readonly FormulaCelda[]): InformeCompatibilidad {
  const usos = new Map<string, UsoDeFuncion>();
  const ejemplosDeErrorDeSintaxis: string[] = [];
  let formulasConErrorDeSintaxis = 0;
  let formulasEvaluables = 0;

  for (const celda of formulas) {
    const donde = `${celda.hoja}!${referencia(celda.col, celda.fila)}`;
    const r = parsear(celda.formula);

    if (!r.ok) {
      formulasConErrorDeSintaxis++;
      if (ejemplosDeErrorDeSintaxis.length < 10) {
        ejemplosDeErrorDeSintaxis.push(`${donde}: ${celda.formula}`);
      }
      continue;
    }

    let todasSoportadas = true;
    recorrer(r.ast, (nodo: Nodo) => {
      if (nodo.tipo !== 'funcion') return;

      const nombre = nodo.nombre.toUpperCase();
      const soportada = funcionSoportada(nombre);
      if (!soportada) todasSoportadas = false;

      const previo = usos.get(nombre);
      if (previo) previo.veces++;
      else usos.set(nombre, { nombre, veces: 1, ejemplo: donde, soportada });
    });

    if (todasSoportadas) formulasEvaluables++;
  }

  const funciones = [...usos.values()].sort(
    (a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre),
  );

  const analizadas = formulas.length;
  return {
    formulasAnalizadas: analizadas,
    formulasConErrorDeSintaxis,
    ejemplosDeErrorDeSintaxis,
    funciones,
    noSoportadas: funciones.filter((f) => !f.soportada),
    formulasEvaluables,
    cobertura: analizadas === 0 ? 0 : Math.round((formulasEvaluables / analizadas) * 1000) / 10,
  };
}

/** `(3, 9)` -> `C9`. */
function referencia(col: number, fila: number): string {
  let n = col;
  let letras = '';
  while (n > 0) {
    letras = String.fromCharCode(65 + ((n - 1) % 26)) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return `${letras || 'A'}${fila}`;
}
