/**
 * Los metadatos que Excel necesita para registrar las funciones `RIESGO.*`
 * (`funciones.json`), **generados del catálogo del motor**: si se añade una
 * función a `FUNCIONES_RIESGO`, aparece en Excel sin tocar nada más, y no
 * puede quedar una descrita en Excel que el motor no sepa simular.
 */

import { FUNCION_CATEGORIA, FUNCION_DISCRETA, FUNCION_EMPIRICA, FUNCION_TRUNCAR, FUNCIONES_RESULTADO, FUNCIONES_RIESGO } from './funcionesRiesgo.ts';

/** Lo que enseñan fuera de la simulación (B2). */
const FUERA = 'Fuera de la simulación devuelve la media, u otro valor fijo o uno al azar según el modo del libro.';

/**
 * Volátiles (B2): en el modo «Aleatorio» cada recálculo (F9) tiene que
 * sortear otra vez, y al cambiar de modo basta un recálculo para que todas
 * enseñen lo nuevo. Las de resultados (B6) no: valen lo mismo hasta que se
 * vuelve a simular. Con su propia dirección (B1b): durante una simulación con
 * Excel en el bucle, la función de una celda que conserva su fórmula devuelve
 * el sorteo que le toca.
 */
const VOLATIL = { volatile: true, requiresAddress: true };

export function metadatosFunciones(): object {
  return {
    functions: (FUNCIONES_RIESGO.map((f) => ({
      id: f.id,
      name: f.id,
      description: `${f.descripcion} ${FUERA}`,
      result: { type: 'number', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: f.parametros.map((p) => ({
        name: p.nombre,
        description: p.descripcion,
        type: 'number',
        dimensionality: 'scalar',
      })),
    })) as object[]).concat(([{
      id: FUNCION_CATEGORIA.id,
      name: FUNCION_CATEGORIA.id,
      description: `${FUNCION_CATEGORIA.descripcion} Fuera de la simulación devuelve el valor más probable (o uno al azar en el modo Aleatorio).`,
      result: { type: 'string', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: FUNCION_CATEGORIA.parametros.map((p) => ({
        name: p.nombre,
        description: p.descripcion,
        type: 'any',
        dimensionality: 'matrix',
      })),
    }, {
      id: FUNCION_DISCRETA.id,
      name: FUNCION_DISCRETA.id,
      description: `${FUNCION_DISCRETA.descripcion} ${FUERA}`,
      result: { type: 'number', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: FUNCION_DISCRETA.parametros.map((p) => ({
        name: p.nombre,
        description: p.descripcion,
        type: 'any',
        dimensionality: 'matrix',
      })),
    }, {
      id: FUNCION_EMPIRICA.id,
      name: FUNCION_EMPIRICA.id,
      description: `${FUNCION_EMPIRICA.descripcion} ${FUERA}`,
      result: { type: 'number', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: FUNCION_EMPIRICA.parametros.map((p) => ({
        name: p.nombre,
        description: p.descripcion,
        type: 'any',
        dimensionality: 'matrix',
      })),
    }, {
      id: FUNCION_TRUNCAR.id,
      name: FUNCION_TRUNCAR.id,
      description: `${FUNCION_TRUNCAR.descripcion} Fuera de la simulación devuelve el valor de la función interior, dentro de los límites.`,
      result: { type: 'number', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: FUNCION_TRUNCAR.parametros.map((p) => ({
        name: p.nombre,
        description: p.descripcion,
        type: 'number',
        dimensionality: 'scalar',
      })),
    }] as object[]).concat(FUNCIONES_RESULTADO.map((f) => ({
      // B6: traen a la hoja los resultados de la última simulación. Excel les
      // pasa la dirección de la celda (no solo su valor) para saber de qué
      // salida se habla.
      id: f.id,
      name: f.id,
      description: f.descripcion,
      result: { type: 'number', dimensionality: 'scalar' },
      // La propia celda también (B1): si dice «simula primero», el panel la
      // refresca en cuanto tiene resultados.
      options: { requiresParameterAddresses: true, requiresAddress: true },
      parameters: f.parametros.map((p, i) => ({
        name: p.nombre,
        description: p.descripcion,
        type: 'any',
        dimensionality: 'scalar',
        ...(f.id === 'PROB' && i === 2 ? { optional: true } : {}),
      })),
    })))),
  };
}
