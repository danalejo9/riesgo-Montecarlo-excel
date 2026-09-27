/**
 * Las entradas que el libro declara con funciones `RIESGO.*`, convertidas en
 * entradas del modelo para esta simulación. Sin Office.js.
 *
 * Se suman a las del panel sin tocar el modelo guardado: la fuente de verdad
 * de una entrada `RIESGO.*` es la celda, y si alguien cambia la fórmula la
 * siguiente simulación ya lo ve. Si una celda está a la vez en el panel y con
 * una función `RIESGO.*`, **manda el panel** (es una decisión explícita del
 * usuario) y se avisa.
 *
 * Solo cuentan las celdas de las que depende alguna salida: una `RIESGO.*`
 * suelta en una hoja que no afecta a nada no debe llenar el tornado de ceros.
 */

import { clausuraDependencias, type FormulaCelda, type Grafo } from '../engine/graph/index.ts';
import { claveCelda } from '../engine/parser/ast.ts';
import { leerFuncionRiesgo, mencionaRiesgo, type EntradaRiskModel } from '../engine/modelo/index.ts';

export interface EntradasDeFunciones {
  entradas: EntradaRiskModel[];
  claves: string[];
  /** Celdas con `RIESGO.*` que no se pueden usar, con el motivo. */
  errores: string[];
  /** Celdas que están en el panel y además tienen `RIESGO.*`: se usa el panel. */
  duplicadas: string[];
}

export function entradasDeFunciones(
  formulas: readonly FormulaCelda[],
  grafo: Grafo,
  clavesEntradaPanel: readonly string[],
  clavesSalida: readonly string[],
): EntradasDeFunciones {
  const out: EntradasDeFunciones = { entradas: [], claves: [], errores: [], duplicadas: [] };
  const candidatas = formulas.filter((f) => mencionaRiesgo(f.formula));
  if (candidatas.length === 0) return out;

  const necesarias = clausuraDependencias(grafo, clavesSalida);
  const delPanel = new Set(clavesEntradaPanel);

  for (const f of candidatas) {
    const clave = claveCelda(f.hoja, f.col, f.fila);
    if (!necesarias.has(clave)) continue;
    if (delPanel.has(clave)) {
      out.duplicadas.push(clave);
      continue;
    }
    const r = leerFuncionRiesgo(f.formula);
    if (!r.ok) {
      out.errores.push(`${clave}: ${r.motivo}`);
      continue;
    }
    out.entradas.push({ id: `rf_${clave}`, name: clave, ref: clave, dist: r.spec, correlations: [] });
    out.claves.push(clave);
  }
  return out;
}

/**
 * El resolvedor de referencias ampliado con las celdas `RIESGO.*`.
 *
 * El del panel (`cargarResolverRef`) solo conoce las referencias que se le
 * pidieron antes de leer el libro; las entradas de funciones se descubren
 * después, y su `ref` ya es la clave canónica de la celda. Sin esto,
 * preparar la simulación fallaba con «Referencia sin resolver» en cuanto una
 * salida dependía de una `RIESGO.*` (primera prueba en Excel, 27/09).
 */
export function resolverConFunciones(
  resolver: (ref: string) => string,
  deFunciones: Pick<EntradasDeFunciones, 'claves'>,
): (ref: string) => string {
  if (deFunciones.claves.length === 0) return resolver;
  const propias = new Set(deFunciones.claves);
  return (ref) => (propias.has(ref) ? ref : resolver(ref));
}
