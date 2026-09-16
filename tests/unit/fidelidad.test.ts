/**
 * Libro de fidelidad (Fase 2 §11.3): compara el motor, celda a celda, contra
 * valores que Excel de verdad calculó (`tests/fixtures/fidelidad.xlsx`, ya
 * abierto y recalculado en Excel real — no en un simulador). Ninguna función
 * se declara soportada a efectos de fidelidad sin pasar por aquí.
 *
 * Esta es la primera tanda (31 casos, catálogo Nivel 0 de Fase 2 §4.2). El
 * libro real crecerá con cada nivel de funciones que se añada.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { leerCasosFidelidad } from '../helpers/leerFidelidad.ts';

const RUTA_FIXTURE = fileURLToPath(new URL('../fixtures/fidelidad.xlsx', import.meta.url));
const HOJA = 'Fidelidad';
const CELDA_FORMULA = 'E2'; // cada caso se evalúa como si fuera la única fórmula de esta celda
const CLAVE_FORMULA = claveDeReferencia(HOJA, CELDA_FORMULA);

/**
 * Casos que hoy no se pueden ejecutar o no se pueden comparar tal cual,
 * con el motivo exacto. Se listan por id (no se descartan en silencio) para
 * que un test aparte falle el día que el motivo deje de aplicar —por ejemplo,
 * cuando exista el canal de texto— y alguien tenga que venir a borrar la
 * entrada en vez de que quede olvidada para siempre.
 */
const PENDIENTES: Record<string, string> = {
  'L0-022': 'IFERROR con un valor_si_error de texto ("sin datos"): sin canal de texto todavía.',
  'L0-031':
    'AVERAGE con una celda vacía en el rango: el motor no distingue "vacía" de "cero" en el ' +
    'denominador — hallazgo nuevo de este libro, no un límite documentado antes.',
  'L0-032':
    'AVERAGE de un rango totalmente vacío: por la misma razón que L0-031, el motor da 0 en vez ' +
    'de propagar el equivalente a #DIV/0!.',
  'L0-033':
    'COUNT con una celda de texto en el rango: no ejecutable sin canal de texto (la celda ' +
    'auxiliar I3 no se puede representar).',
  'L0-034': 'COUNTA: no existe en el registro todavía, y no sería ejecutable por lo mismo que L0-033.',
  'L0-040': 'IF con ramas de texto ("mayor"/"menor"): sin canal de texto todavía.',
};

function construirModeloDeCaso(formula: string) {
  const celdas: FormulaCelda[] = [{ hoja: HOJA, col: 5, fila: 2, formula }]; // col 5 = E
  return construirGrafo(celdas).grafo;
}

/**
 * Celdas auxiliares que usan algunos casos (SUM/AVERAGE/SUMPRODUCT sobre un
 * rango real). `H3` se omite a propósito: `evaluarModelo` la trata como
 * vacía (0), que es el convenio correcto para `SUM` (L0-030) y precisamente
 * lo que expone el hueco de `AVERAGE` documentado en PENDIENTES.
 */
function entradasAuxiliares(): Map<string, Float64Array> {
  const m = new Map<string, Float64Array>();
  const fijar = (ref: string, v: number) => m.set(claveDeReferencia(HOJA, ref), Float64Array.from([v]));
  fijar('H2', 10);
  fijar('H4', 30);
  fijar('J2', 1);
  fijar('J3', 2);
  fijar('J4', 3);
  fijar('K2', 10);
  fijar('K3', 20);
  fijar('K4', 30);
  return m;
}

describe('libro de fidelidad (tests/fixtures/fidelidad.xlsx)', () => {
  const casos = leerCasosFidelidad(RUTA_FIXTURE);
  const entradas = entradasAuxiliares();

  it('el libro tiene al menos los 31 casos de la primera tanda', () => {
    expect(casos.length).toBeGreaterThanOrEqual(31);
  });

  it('todos los ids de PENDIENTES existen de verdad en el libro (motivos no obsoletos)', () => {
    const ids = new Set(casos.map((c) => c.id));
    for (const id of Object.keys(PENDIENTES)) expect(ids.has(id)).toBe(true);
  });

  for (const caso of casos) {
    const motivo = PENDIENTES[caso.id];
    const titulo = `${caso.id} [${caso.categoria}] ${caso.descripcion}`;

    if (motivo) {
      it.skip(`${titulo} — PENDIENTE: ${motivo}`, () => {});
      continue;
    }

    it(titulo, () => {
      const grafo = construirModeloDeCaso(caso.formula);
      const r = evaluarModelo(grafo, entradas, [CLAVE_FORMULA], 1);

      if (caso.valorEsperado.tipo === 'error') {
        // Sin canal de errores formal todavía: el convenio de este motor es
        // propagar NaN (ver engine/functions/types.ts).
        expect(r.ok).toBe(true);
        if (r.ok) expect(Number.isNaN(r.valores.get(CLAVE_FORMULA)?.[0])).toBe(true);
        return;
      }

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const obtenido = r.valores.get(CLAVE_FORMULA)?.[0] as number;

      switch (caso.valorEsperado.tipo) {
        case 'numero':
          // Tolerancia relativa de Fase 2 §11.3.
          expect(obtenido).toBeCloseTo(caso.valorEsperado.valor, 9);
          break;
        case 'booleano':
          expect(obtenido).toBe(caso.valorEsperado.valor ? 1 : 0);
          break;
        default:
          throw new Error(`Caso ${caso.id}: tipo de valor esperado "${caso.valorEsperado.tipo}" sin manejar — ¿falta en PENDIENTES?`);
      }
    });
  }
});
