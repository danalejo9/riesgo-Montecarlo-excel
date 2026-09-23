/**
 * Agrupa las correlaciones declaradas en `EntradaRiskModel.correlations` en
 * componentes conexas, cada una con su matriz de correlación lista para
 * `engine/sampling/correlate.ts` (Iman–Conover).
 *
 * Por qué agrupar y no aplicar Iman–Conover a la matriz completa del modelo:
 * Fase 2 §8 es explícita — con D11 (cientos de variables) eso sería inviable
 * en memoria, e innecesario: las variables sin correlación declarada son
 * independientes por definición. Cada grupo se resuelve por separado, y solo
 * las variables que de verdad participan en uno pagan el costo de reordenar.
 */
import { esDefinidaPositiva } from '../sampling/correlate.ts';
import type { EntradaRiskModel } from './riskModel.ts';

export interface GrupoCorrelacionado {
  ids: string[];
  /** Matriz alineada con `ids`: `matriz[i][j]` es la correlación entre `ids[i]` e `ids[j]`. */
  matriz: number[][];
}

export type ResultadoAgrupacion =
  | { ok: true; grupos: GrupoCorrelacionado[] }
  | { ok: false; errores: string[] };

export function agruparCorrelaciones(entradas: readonly EntradaRiskModel[]): ResultadoAgrupacion {
  const errores: string[] = [];

  // Componentes conexas por unión-búsqueda: dos entradas quedan en el mismo
  // grupo si hay una correlación declarada entre ellas, directa o a través
  // de otras.
  const padre = new Map<string, string>();
  const raiz = (id: string): string => {
    let r = id;
    while (padre.get(r) && padre.get(r) !== r) r = padre.get(r) as string;
    padre.set(id, r);
    return r;
  };
  const unir = (a: string, b: string): void => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre.set(ra, rb);
  };

  for (const e of entradas) padre.set(e.id, e.id);
  for (const e of entradas) for (const c of e.correlations) unir(e.id, c.with);

  const porGrupo = new Map<string, string[]>();
  for (const e of entradas) {
    const r = raiz(e.id);
    if (!porGrupo.has(r)) porGrupo.set(r, []);
    (porGrupo.get(r) as string[]).push(e.id);
  }

  const entradaPorId = new Map(entradas.map((e) => [e.id, e] as const));
  const grupos: GrupoCorrelacionado[] = [];

  for (const ids of porGrupo.values()) {
    if (ids.length < 2) continue; // sin correlaciones declaradas: no es un grupo

    const indice = new Map(ids.map((id, i) => [id, i] as const));
    const matriz: number[][] = ids.map((_, i) => ids.map((_, j) => (i === j ? 1 : 0)));
    const declarados = new Map<string, number>(); // "i,j" (i<j) -> coeficiente ya fijado

    for (const id of ids) {
      const entrada = entradaPorId.get(id) as EntradaRiskModel;
      for (const corr of entrada.correlations) {
        const i = indice.get(id) as number;
        const j = indice.get(corr.with);
        if (j === undefined) continue; // ya reportado por validarRiskModel

        const clave = i < j ? `${i},${j}` : `${j},${i}`;
        const previo = declarados.get(clave);
        if (previo !== undefined && previo !== corr.coefficient) {
          errores.push(
            `Correlación contradictoria entre "${id}" y "${corr.with}": declarada dos veces con valores distintos (${previo} y ${corr.coefficient}).`,
          );
          continue;
        }
        declarados.set(clave, corr.coefficient);
        (matriz[i] as number[])[j] = corr.coefficient;
        (matriz[j] as number[])[i] = corr.coefficient;
      }
    }

    // Una matriz simétrica con unos en la diagonal no describe siempre una
    // correlación posible: "A y B van juntos, B y C van juntos, y A y C van al
    // revés" no puede existir. Sin esta comprobación, la contradicción sale a
    // mitad de la simulación como una excepción de Cholesky; aquí sale antes
    // de empezar, nombrando a los implicados.
    if (!esDefinidaPositiva(matriz)) {
      errores.push(
        `Las correlaciones entre ${ids.map((id) => `"${id}"`).join(', ')} no pueden darse a la vez: ` +
          'son contradictorias entre sí. Revisa los coeficientes — por ejemplo, si A va con B y B va ' +
          'con C, A y C no pueden ir al revés con la misma fuerza.',
      );
      continue;
    }

    grupos.push({ ids, matriz });
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, grupos };
}
