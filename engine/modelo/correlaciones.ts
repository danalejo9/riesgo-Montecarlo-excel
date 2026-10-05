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
import { correlacionMasCercana } from '../sampling/higham.ts';
import type { EntradaRiskModel } from './riskModel.ts';

export interface GrupoCorrelacionado {
  ids: string[];
  /** Matriz alineada con `ids`: `matriz[i][j]` es la correlación entre `ids[i]` e `ids[j]`. */
  matriz: number[][];
}

/** Una matriz imposible que se corrigió (Higham): lo pedido y lo que se usa, por pareja declarada. */
export interface AjusteCorrelacion {
  ids: string[];
  cambioMaximo: number;
  pares: { a: string; b: string; pedida: number; usada: number }[];
  /** En una frase, con los ids entre comillas (el panel los cambia por los nombres). */
  aviso: string;
}

export type ResultadoAgrupacion =
  | { ok: true; grupos: GrupoCorrelacionado[]; ajustes: AjusteCorrelacion[] }
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
  const ajustes: AjusteCorrelacion[] = [];

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
    // revés" no puede existir. Antes se rechazaba; ahora se usa la matriz
    // posible más cercana (Higham), como el análisis de cronograma, y se dice
    // cuánto cambió cada coeficiente para que el usuario decida si le sirve.
    if (!esDefinidaPositiva(matriz)) {
      const h = correlacionMasCercana(matriz);
      const pares: AjusteCorrelacion['pares'] = [];
      for (const clave of declarados.keys()) {
        const [i, j] = clave.split(',').map(Number) as [number, number];
        pares.push({ a: ids[i] as string, b: ids[j] as string, pedida: (matriz[i] as number[])[j] as number, usada: (h.matriz[i] as number[])[j] as number });
      }
      const red = (x: number) => Math.round(x * 100) / 100;
      ajustes.push({
        ids,
        cambioMaximo: h.cambioMaximo,
        pares,
        aviso:
          `Las correlaciones entre ${ids.map((id) => `"${id}"`).join(', ')} no pueden darse a la vez (son contradictorias): ` +
          `se usa la combinación posible más cercana — ${pares.filter((p) => red(p.pedida) !== red(p.usada)).map((p) => `"${p.a}"–"${p.b}" ${fmt(p.pedida)} → ${fmt(p.usada)}`).join(', ') || 'cambios menores de 0,01'}. ` +
          'Si no te sirve, revisa los coeficientes.',
      });
      grupos.push({ ids, matriz: h.matriz });
      continue;
    }

    grupos.push({ ids, matriz });
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, grupos, ajustes };
}

function fmt(x: number): string {
  return x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
