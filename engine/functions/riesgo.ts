/**
 * La función interna con la que el motor rápido muestrea una distribución
 * `RIESGO.*` cuyos parámetros cambian en cada iteración (B7):
 * `=RIESGO.NORMAL(C4; 10)` con C4 aleatoria, o `=1+RIESGO.NORMAL(…)`.
 *
 * El usuario nunca la escribe: `riesgoEnGrafo.ts` reescribe la fórmula antes
 * de simular y pone en su lugar
 *
 *     _RIESGO.CUANTIL(u; "NORMAL"; C4; 10)
 *
 * donde `u` es una celda virtual con un uniforme (0,1) que se muestrea como
 * cualquier entrada (Monte Carlo o hipercubo, con la semilla de siempre). Aquí
 * se pasa por el cuantil de la distribución con los parámetros de esa
 * iteración: es la transformada inversa de siempre, solo que la distribución
 * cambia de fila en fila. Así la reproducibilidad y el hipercubo no cambian.
 *
 * Para `RIESGO.TRUNCAR(RIESGO.NORMAL(…); mín; máx)` el identificador es
 * `"TRUNCAR:NORMAL"` y los dos primeros parámetros son los límites.
 *
 * Unos parámetros inválidos en una iteración (una desviación negativa) dan
 * `#NUM!` en esa iteración, como haría `DISTR.NORM.INV` en Excel.
 */

import { construirDesdeDescriptor, type Distribution } from '../distributions/index.ts';
import { construirSpecRiesgo } from '../modelo/funcionesRiesgo.ts';
import { toDescriptor, type DistributionSpec } from '../modelo/distributionSchema.ts';
import { coercionNumerica, coercionTexto } from '../values/coercion.ts';
import { crearConstructor, type Columna } from '../values/columna.ts';
import type { ErrorExcel } from '../parser/ast.ts';
import type { FuncionExcel } from './types.ts';

/** El nombre con el que la reescritura la llama. Empieza por `_` para que nadie la escriba. */
export const NOMBRE_CUANTIL = '_RIESGO.CUANTIL';

export const RIESGO_CUANTIL: FuncionExcel = (args, n) => {
  const b = crearConstructor(n);
  const [argU, argId, ...params] = args;
  const cu = argU?.columnas[0];
  const cid = argId?.columnas[0];
  if (!cu || !cid) {
    for (let i = 0; i < n; i++) b.ponerError(i, '#VALUE!');
    return b.terminar();
  }
  const [externo, interno] = coercionTexto(cid, 0).split(':');
  const truncar = externo === 'TRUNCAR';
  const idDist = truncar ? interno : externo;
  const columnas = params.map((p) => p.columnas[0] as Columna);

  // Una caché de una sola entrada: con parámetros que no cambian (o cambian
  // poco) no se reconstruye la distribución en cada fila.
  let firma = '';
  let dist: Distribution | string | null = null;
  const valores: number[] = new Array(columnas.length);

  for (let i = 0; i < n; i++) {
    let error: ErrorExcel | null = null;
    for (let k = 0; k < columnas.length; k++) {
      const v = coercionNumerica(columnas[k] as Columna, i);
      if (typeof v === 'string') {
        error = v;
        break;
      }
      valores[k] = v;
    }
    if (error) {
      b.ponerError(i, error);
      continue;
    }
    const f = valores.join('|');
    if (f !== firma || dist === null) {
      firma = f;
      dist = construir(idDist ?? '', truncar, valores);
    }
    if (typeof dist === 'string') {
      b.ponerError(i, '#NUM!');
      continue;
    }
    const u = coercionNumerica(cu, i);
    if (typeof u === 'string') {
      b.ponerError(i, u);
      continue;
    }
    const x = dist.quantile(u);
    if (Number.isFinite(x)) b.ponerNumero(i, x);
    else b.ponerError(i, '#NUM!');
  }
  return b.terminar();
};

function construir(id: string, truncar: boolean, valores: readonly number[]): Distribution | string {
  const [min, max, ...resto] = truncar ? valores : [undefined, undefined, ...valores];
  const spec = construirSpecRiesgo(id, resto as number[]);
  if (typeof spec === 'string') return spec;
  const conLimites: DistributionSpec = truncar ? { ...spec, truncate: { min: min as number, max: max as number } } : spec;
  try {
    return construirDesdeDescriptor(toDescriptor(conLimites));
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
