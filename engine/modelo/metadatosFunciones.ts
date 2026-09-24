/**
 * Los metadatos que Excel necesita para registrar las funciones `RIESGO.*`
 * (`funciones.json`), **generados del catálogo del motor**: si se añade una
 * función a `FUNCIONES_RIESGO`, aparece en Excel sin tocar nada más, y no
 * puede quedar una descrita en Excel que el motor no sepa simular.
 */

import { FUNCIONES_RIESGO } from './funcionesRiesgo.ts';

export function metadatosFunciones(): object {
  return {
    functions: FUNCIONES_RIESGO.map((f) => ({
      id: f.id,
      name: f.id,
      description: `${f.descripcion} Fuera de la simulación devuelve la media.`,
      result: { type: 'number', dimensionality: 'scalar' },
      parameters: f.parametros.map((p) => ({
        name: p.nombre,
        description: p.descripcion,
        type: 'number',
        dimensionality: 'scalar',
      })),
    })),
  };
}
