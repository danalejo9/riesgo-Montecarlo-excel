/**
 * Sexta tanda del libro de fidelidad: **el resto del Nivel 1** —`MAX.SI` y
 * `MIN.SI.CONJUNTO`, `SI.CONJUNTO`, `CAMBIAR`, `BUSCAR` y las funciones de
 * calendario, con sus bordes de fin de febrero, días 31 y bisiestos—.
 *
 * `FECHANUMERO` depende del idioma, así que se evalúa en español, como la
 * quinta. Ver `tests/fixtures/generar-tanda6.py`.
 */
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  errorEn, numeroEn, textoEn, tipoEn, ERROR, LOGICO, NUMERO, TEXTO, type Columna,
} from '../../engine/values/columna.ts';
import {
  establecerRegional, regionalDesdeIdioma, restablecerRegional,
} from '../../engine/values/regional.ts';
import { leerCasosFidelidad, type CasoFidelidad } from '../helpers/leerFidelidad.ts';

const RUTA_FIXTURE = fileURLToPath(new URL('../fixtures/fidelidad-tanda6.xlsx', import.meta.url));
const HOJA = 'Fidelidad';
const CLAVE_FORMULA = claveDeReferencia(HOJA, 'E2');

/** Casos que no se pueden comparar todavía, por id y con el motivo. Nunca en silencio. */
const PENDIENTES: Record<string, string> = {};

/**
 * Los datos auxiliares, **idénticos a los del generador**: notas y grados
 * (H:I), frecuencias y colores (J:K), festivos (L) y una matriz ancha (N2:Q3).
 */
const AUXILIARES: Record<string, string> = {
  H2: '89', H3: '93', H4: '96', H5: '85', H6: '91', H7: '88',
  I2: '1', I3: '2', I4: '2', I5: '3', I6: '1', I7: '1',
  J2: '4.14', J3: '4.19', J4: '5.17', J5: '5.77', J6: '6.39',
  K2: '"rojo"', K3: '"naranja"', K4: '"amarillo"', K5: '"verde"', K6: '"azul"',
  L2: '41235', L3: '41247', L4: '41295', // festivos: 22-nov-2012, 4-dic-2012, 21-ene-2013
  N2: '"a"', O2: '"b"', P2: '"c"', Q2: '"d"',
  N3: '1', O3: '2', P3: '3', Q3: '4',
};

function construirModeloDeCaso(formula: string) {
  const celdas: FormulaCelda[] = [{ hoja: HOJA, col: 5, fila: 2, formula }]; // col 5 = E
  for (const [ref, valor] of Object.entries(AUXILIARES)) {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
    celdas.push({ hoja: HOJA, col, fila: Number(m[2]), formula: valor });
  }
  return construirGrafo(celdas).grafo;
}

function sinCalcular(casos: CasoFidelidad[]): boolean {
  return casos.every((c) => !c.calculado);
}

/**
 * El libro lo calculó el Excel **en español** del usuario, así que el motor
 * tiene que calcular con la misma configuración regional para que la
 * comparación sea justa. Sin esto, los casos que convierten números a texto o
 * al revés compararían dos configuraciones distintas y no dos motores.
 */
beforeAll(() => establecerRegional(regionalDesdeIdioma('es-ES', { decimal: ',', miles: '.' })));
afterAll(() => restablecerRegional());

describe('libro de fidelidad, sexta tanda (tests/fixtures/fidelidad-tanda6.xlsx)', () => {
  const casos = leerCasosFidelidad(RUTA_FIXTURE);
  const enEspera = sinCalcular(casos);

  it('el libro trae la tanda completa de casos', () => {
    expect(casos.length).toBeGreaterThanOrEqual(69);
  });

  it('todos los ids de PENDIENTES existen de verdad en el libro', () => {
    const ids = new Set(casos.map((c) => c.id));
    for (const id of Object.keys(PENDIENTES)) expect(ids.has(id)).toBe(true);
  });

  if (enEspera) {
    it.skip(
      'EN ESPERA: el libro no ha pasado todavía por Excel. Ábrelo en Excel real, ' +
        'deja que calcule, guárdalo, y estos casos se activan solos.',
      () => {},
    );
    return;
  }

  it('los datos auxiliares del libro coinciden con los que usa el motor', () => {
    const grafo = construirModeloDeCaso('SUM(H2:H7)+SUM(L2:L4)');
    const r = evaluarModelo(grafo, new Map(), [CLAVE_FORMULA], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(numeroEn(r.valores.get(CLAVE_FORMULA) as Columna, 0)).toBe(542 + 123777);
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
      const r = evaluarModelo(grafo, new Map(), [CLAVE_FORMULA], 1);

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const c = r.valores.get(CLAVE_FORMULA) as Columna;

      switch (caso.valorEsperado.tipo) {
        case 'numero':
          expect(tipoEn(c, 0)).toBe(NUMERO);
          expect(numeroEn(c, 0)).toBeCloseTo(caso.valorEsperado.valor, 9);
          break;
        case 'booleano':
          expect(tipoEn(c, 0)).toBe(LOGICO);
          expect(numeroEn(c, 0)).toBe(caso.valorEsperado.valor ? 1 : 0);
          break;
        case 'texto':
          expect(tipoEn(c, 0)).toBe(TEXTO);
          expect(textoEn(c, 0)).toBe(caso.valorEsperado.valor);
          break;
        case 'error':
          expect(tipoEn(c, 0)).toBe(ERROR);
          expect(errorEn(c, 0)).toBe(caso.valorEsperado.codigo);
          break;
      }
    });
  }
});
