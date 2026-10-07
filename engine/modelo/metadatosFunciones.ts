/**
 * Los metadatos que Excel necesita para registrar las funciones `RIESGO.*`
 * (`funciones.json`), **generados del catálogo del motor**: si se añade una
 * función a `FUNCIONES_RIESGO`, aparece en Excel sin tocar nada más, y no
 * puede quedar una descrita en Excel que el motor no sepa simular.
 */

import {
  FUNCION_CATEGORIA, FUNCION_CORRELACION, FUNCION_CRONOGRAMA, FUNCION_DECISION, FUNCION_DISCRETA, FUNCION_EMPIRICA, FUNCION_HISTOGRAMA, FUNCION_EVENTO, FUNCION_SALIDA, FUNCION_TRUNCAR, FUNCIONES_RESULTADO, FUNCIONES_RIESGO,
} from './funcionesRiesgo.ts';

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
      // B5: mínimo y máximo, números; los pesos, una lista.
      id: FUNCION_HISTOGRAMA.id,
      name: FUNCION_HISTOGRAMA.id,
      description: `${FUNCION_HISTOGRAMA.descripcion} ${FUERA}`,
      result: { type: 'number', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: FUNCION_HISTOGRAMA.parametros.map((p, i) => ({
        name: p.nombre,
        description: p.descripcion,
        type: i === 2 ? 'any' : 'number',
        dimensionality: i === 2 ? 'matrix' : 'scalar',
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
    }))).concat([{
      // Resto de B6: declaran una salida o una correlación desde la fórmula.
      id: FUNCION_SALIDA.id,
      name: FUNCION_SALIDA.id,
      description: FUNCION_SALIDA.descripcion,
      result: { type: 'number', dimensionality: 'scalar' },
      parameters: FUNCION_SALIDA.parametros.map((p) => ({
        name: p.nombre, description: p.descripcion, type: 'any', dimensionality: 'scalar', optional: true,
      })),
    }, {
      id: FUNCION_CORRELACION.id,
      name: FUNCION_CORRELACION.id,
      description: FUNCION_CORRELACION.descripcion,
      result: { type: 'number', dimensionality: 'scalar' },
      parameters: FUNCION_CORRELACION.parametros.map((p, i) => ({
        name: p.nombre, description: p.descripcion, type: i === 2 ? 'number' : 'any', dimensionality: 'scalar',
      })),
    }, {
      // T8: un riesgo del registro (BERNOULLI × impacto).
      id: FUNCION_EVENTO.id,
      name: FUNCION_EVENTO.id,
      description: `${FUNCION_EVENTO.descripcion} ${FUERA}`,
      result: { type: 'number', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: FUNCION_EVENTO.parametros.map((p) => ({ name: p.nombre, description: p.descripcion, type: 'number', dimensionality: 'scalar' })),
    }, {
      // T9: una decisión; cada argumento, una opción (o un rango de opciones).
      id: FUNCION_DECISION.id,
      name: FUNCION_DECISION.id,
      description: FUNCION_DECISION.descripcion,
      result: { type: 'any', dimensionality: 'scalar' },
      parameters: FUNCION_DECISION.parametros.map((p) => ({ name: p.nombre, description: p.descripcion, type: 'any', dimensionality: 'matrix', repeating: true })),
    }, {
      // W5: el plazo del módulo Cronograma, iteración a iteración. Fuera de la simulación, el plan.
      id: FUNCION_CRONOGRAMA.id,
      name: FUNCION_CRONOGRAMA.id,
      description: `${FUNCION_CRONOGRAMA.descripcion} Fuera de la simulación devuelve el valor del plan (o el valor fijo).`,
      result: { type: 'number', dimensionality: 'scalar' },
      options: VOLATIL,
      parameters: FUNCION_CRONOGRAMA.parametros.map((p, i) => ({
        name: p.nombre, description: p.descripcion, type: i === 2 ? 'number' : 'any', dimensionality: 'scalar', ...(i > 0 ? { optional: true } : {}),
      })),
    }])),
  };
}
