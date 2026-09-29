/**
 * Libro de fidelidad de **LAMBDA** (F1): Peng-Robinson con LAMBDA en la
 * celda, en LET y con nombre, y nombres definidos que son constantes y
 * celdas. Ver `tests/fixtures/generar-lambda.py`. Los mismos casos se prueban
 * contra Python en `lambda.test.ts`; aquí, contra lo que calcula Excel.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { leerNombresDefinidos } from '../../engine/parser/index.ts';
import { errorEn, numeroEn, tipoEn, ERROR, NUMERO, type Columna } from '../../engine/values/columna.ts';
import { leerCasosFidelidad, leerNombresDelLibro } from '../helpers/leerFidelidad.ts';

const RUTA_FIXTURE = fileURLToPath(new URL('../fixtures/fidelidad-lambda.xlsx', import.meta.url));
const HOJA = 'Fidelidad';
const CLAVE_FORMULA = claveDeReferencia(HOJA, 'E2');

/** Idénticos a AUXILIARES en el generador. */
const AUXILIARES: Record<string, string> = { H2: '310', H3: '0.5', I2: '304.13', I3: '73.77', I4: '0.2239' };

/** Casos que el motor rápido no desarrolla a propósito: tiene que negarse (y la celda va al modo compatible). */
const AL_COMPATIBLE: Record<string, string> = {
  'L-022': 'LAMBDA sin invocar',
  'L-023': 'LAMBDA recursiva',
};

const nombres = leerNombresDefinidos(leerNombresDelLibro(RUTA_FIXTURE));

function evaluar(formula: string) {
  const celdas: FormulaCelda[] = [{ hoja: HOJA, col: 5, fila: 2, formula }];
  for (const [ref, valor] of Object.entries(AUXILIARES)) {
    celdas.push({ hoja: HOJA, col: ref.charCodeAt(0) - 64, fila: Number(ref.slice(1)), formula: valor });
  }
  return evaluarModelo(construirGrafo(celdas, [], nombres).grafo, new Map(), [CLAVE_FORMULA], 1);
}

describe('libro de fidelidad de LAMBDA (tests/fixtures/fidelidad-lambda.xlsx)', () => {
  const casos = leerCasosFidelidad(RUTA_FIXTURE);

  it('el libro trae los casos y los once nombres', () => {
    expect(casos.length).toBeGreaterThanOrEqual(23);
    expect(nombres.libro.size).toBe(11);
    expect(nombres.descartados).toEqual([]);
  });

  it('lo que el motor no desarrolla lo dice, en vez de dar otro número', () => {
    for (const id of Object.keys(AL_COMPATIBLE)) {
      const caso = casos.find((c) => c.id === id);
      expect(caso, id).toBeDefined();
      expect(evaluar(caso?.formula ?? '').ok, id).toBe(false);
    }
  });

  it('las fórmulas tal como están en el archivo dan lo que calcula Python (columna F)', () => {
    let comparados = 0;
    for (const caso of casos) {
      const m = /^Python: (.+)$/.exec(caso.notas);
      if (!m || AL_COMPATIBLE[caso.id]) continue;
      const r = evaluar(caso.formula);
      expect(r.ok, caso.id).toBe(true);
      if (r.ok) expect(numeroEn(r.valores.get(CLAVE_FORMULA) as Columna, 0), caso.id).toBeCloseTo(Number(m[1]), 9);
      comparados++;
    }
    expect(comparados).toBe(19);
  });

  if (casos.every((c) => !c.calculado)) {
    it.skip(
      'EN ESPERA: el libro no ha pasado todavía por Excel. Ábrelo en Excel 365, ' +
        'deja que calcule, guárdalo, y estos casos se activan solos.',
      () => {},
    );
    return;
  }

  for (const caso of casos) {
    if (AL_COMPATIBLE[caso.id]) continue;
    it(`${caso.id} [${caso.categoria}] ${caso.descripcion}`, () => {
      const r = evaluar(caso.formula);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const c = r.valores.get(CLAVE_FORMULA) as Columna;
      if (caso.valorEsperado.tipo === 'numero') {
        expect(tipoEn(c, 0)).toBe(NUMERO);
        expect(numeroEn(c, 0)).toBeCloseTo(caso.valorEsperado.valor, 9);
      } else if (caso.valorEsperado.tipo === 'error') {
        expect(tipoEn(c, 0)).toBe(ERROR);
        expect(errorEn(c, 0)).toBe(caso.valorEsperado.codigo);
      } else {
        throw new Error(`Tipo inesperado en ${caso.id}: ${caso.valorEsperado.tipo}`);
      }
    });
  }
});
