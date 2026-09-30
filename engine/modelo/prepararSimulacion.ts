/**
 * Convierte un `ModeloRiesgo` ya validado en las `DefinicionEntrada[]` que
 * espera `engine/executor/`, aplicando la correlación declarada.
 *
 * No sabe nada de Excel: `resolverRef` traduce cada rango con nombre a la
 * clave de celda concreta que usa el resto del motor — es responsabilidad
 * del adaptador de Office.js (Fase 3, E3), inyectada aquí como una función
 * para que este módulo siga siendo puro y testeable en Node.
 *
 * Los grupos correlacionados (`agruparCorrelaciones`) no pueden generarse
 * perezosos por bloques: Iman–Conover necesita reordenar el buffer completo
 * de cada variable del grupo, así que se materializan enteros aquí, igual
 * que ya le pasa a LHS en `engine/executor/entradas.ts`. Las variables sin
 * correlación declarada quedan como definiciones perezosas — el ejecutor por
 * bloques decide si puede generarlas por tramos (Monte Carlo) o no (LHS).
 *
 * **El flujo aleatorio de cada entrada va ligado a su celda**, no a su id.
 * El id se genera nuevo cada vez que se marca una celda, así que antes quitar
 * y volver a marcar la misma entrada cambiaba los números con la misma
 * semilla. Ahora `Modelo!C5` con la semilla 12345 da siempre la misma
 * secuencia, se marque cuando se marque y se llame como se llame. (Cambia si
 * la celda cambia de sitio o la hoja de nombre: es otra celda.)
 */
import { construirDesdeDescriptor } from '../distributions/index.ts';
import type { DefinicionEntrada } from '../executor/entradas.ts';
import { correlacionarImanConover, muestrearLHS, muestrearMonteCarlo } from '../sampling/index.ts';
import { agruparCorrelaciones } from './correlaciones.ts';
import { categoriasDe, toDescriptor } from './distributionSchema.ts';
import type { EntradaRiskModel, ModeloRiesgo } from './riskModel.ts';

export type ResultadoPreparacion =
  | { ok: true; entradas: DefinicionEntrada[] }
  | { ok: false; errores: string[] };

export function prepararEntradas(
  modelo: ModeloRiesgo,
  resolverRef: (ref: string) => string,
  seed: number,
  /**
   * W5: entradas cuyas muestras ya vienen dadas, por id (las de
   * `RIESGO.CRONOGRAMA`, que salen de la simulación del cronograma). Cada una
   * con al menos `iterations` valores; se usan los primeros, en orden.
   */
  fijas?: ReadonlyMap<string, Float64Array>,
): ResultadoPreparacion {
  const agrupacion = agruparCorrelaciones(modelo.inputs);
  if (!agrupacion.ok) return agrupacion;

  const n = modelo.settings.iterations;
  const porId = new Map(modelo.inputs.map((e) => [e.id, e] as const));
  /** La clave del flujo aleatorio: la celda, en su forma canónica. */
  const flujo = (e: EntradaRiskModel) => resolverRef(e.ref);
  const enGrupo = new Set(agrupacion.grupos.flatMap((g) => g.ids));
  const definiciones: DefinicionEntrada[] = [];

  for (const entrada of modelo.inputs) {
    const fija = fijas?.get(entrada.id);
    if (fija) {
      if (enGrupo.has(entrada.id)) {
        return { ok: false, errores: [`«${entrada.name}» sale del cronograma: su relación con las demás ya la da la simulación, no se le puede poner una correlación.`] };
      }
      if (fija.length < n) return { ok: false, errores: [`«${entrada.name}»: el cronograma dio ${fija.length} iteraciones y hacen falta ${n}.`] };
      definiciones.push({ tipo: 'buffer', clave: resolverRef(entrada.ref), buffer: fija.subarray(0, n) });
      continue;
    }
    if (enGrupo.has(entrada.id)) continue;
    definiciones.push({
      tipo: 'distribucion',
      clave: resolverRef(entrada.ref),
      id: flujo(entrada),
      distribucion: toDescriptor(entrada.dist),
      metodo: modelo.settings.sampling,
      ...(categoriasDe(entrada.dist) ? { categorias: categoriasDe(entrada.dist) } : {}),
    });
  }

  for (const grupo of agrupacion.grupos) {
    const entradasGrupo = grupo.ids.map((id) => porId.get(id) as EntradaRiskModel);
    // Una correlación de rangos con una lista de textos no significa nada: el
    // orden de las categorías es arbitrario (T1).
    const deTexto = entradasGrupo.find((e) => e.dist.type === 'categorical');
    if (deTexto) {
      return { ok: false, errores: [`«${deTexto.name}» es una entrada de texto: no se puede correlacionar con otras.`] };
    }
    const buffers = entradasGrupo.map((entrada) => {
      const dist = construirDesdeDescriptor(toDescriptor(entrada.dist));
      return modelo.settings.sampling === 'lhs'
        ? muestrearLHS(dist, flujo(entrada), seed, n)
        : muestrearMonteCarlo(dist, flujo(entrada), seed, n);
    });

    const correlacionados = correlacionarImanConover(buffers, grupo.matriz, seed, entradasGrupo.map(flujo).join('|'));

    grupo.ids.forEach((id, i) => {
      const entrada = porId.get(id) as EntradaRiskModel;
      definiciones.push({
        tipo: 'buffer',
        clave: resolverRef(entrada.ref),
        buffer: correlacionados[i] as Float64Array,
      });
    });
  }

  return { ok: true, entradas: definiciones };
}
