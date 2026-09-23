/**
 * Cuarta tanda del libro de fidelidad: **el Nivel 2 de texto, `SUBTOTALES` y
 * `AGREGAR`**, más el `DIAS` que quedó pendiente de la tercera.
 *
 * Las funciones de texto parecen triviales y no lo son: `NOMPROPIO` pone
 * mayúscula después de un dígito, `ESPACIOS` no toca el espacio duro, `HALLAR`
 * no encuentra con `#¡VALOR!` y no con `#N/A`. Están implementadas según la
 * documentación, que en tres tandas seguidas ha resultado no bastar.
 *
 * **Cómo se completa** (ver `tests/fixtures/generar-tanda4.py`): se abre el
 * `.xlsx` en Excel de verdad, se deja calcular, se guarda, y estos casos se
 * activan solos. Hasta entonces quedan en espera, no aprobados.
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

const RUTA_FIXTURE = fileURLToPath(new URL('../fixtures/fidelidad-tanda4.xlsx', import.meta.url));
const HOJA = 'Fidelidad';
const CLAVE_FORMULA = claveDeReferencia(HOJA, 'E2');

/**
 * Casos que no se pueden comparar todavía, por id y con el motivo. Nunca en
 * silencio.
 *
 * Vacía. Los tres sondeos de configuración regional que se pusieron aquí a
 * propósito (T4-013, T4-052, T4-072) estuvieron en esta lista hasta que el
 * motor aprendió a calcular con los separadores del libro; ahora pasan.
 */
const PENDIENTES: Record<string, string> = {};

/**
 * Los datos auxiliares, **idénticos a los del generador**. Los que son fórmulas
 * (los subtotales intermedios, los errores, el texto vacío) van como fórmula,
 * porque eso son: un `=""` no es una celda vacía, y un `SUBTOTALES` intermedio
 * tiene que ser una fórmula para que el total general sepa ignorarlo.
 */
const AUXILIARES: Record<string, string> = {
  H2: '"presupuesto de OBRA"',
  H3: '"  mucho    espacio  "',
  H4: `"o'neil"`,
  H5: '"2nd"',
  I2: '"a"', J2: '"b"',
  I3: '"c"', J3: '"d"',
  K2: '"a"', /* K3 vacía a propósito */ K4: '"c"', K5: '""',
  M2: '100', M3: '200', M4: 'SUBTOTAL(9,M2:M3)',
  M5: '50', M6: '25', M7: 'SUBTOTAL(9,M5:M6)',
  O2: '10', O3: '1/0', O4: '30',
  Q2: '1', Q3: '2', Q4: '3', Q5: '4', Q6: '1/0',
  S2: '3', S3: '5', S4: '5', S5: '3',
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

describe('libro de fidelidad, cuarta tanda (tests/fixtures/fidelidad-tanda4.xlsx)', () => {
  const casos = leerCasosFidelidad(RUTA_FIXTURE);
  const enEspera = sinCalcular(casos);

  it('el libro trae la tanda completa de casos', () => {
    expect(casos.length).toBeGreaterThanOrEqual(90);
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
    const grafo = construirModeloDeCaso('M2+M3+M5+M6+Q2+Q3+Q4+Q5');
    const r = evaluarModelo(grafo, new Map(), [CLAVE_FORMULA], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(numeroEn(r.valores.get(CLAVE_FORMULA) as Columna, 0)).toBe(385);
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
