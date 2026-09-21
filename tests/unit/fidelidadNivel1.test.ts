/**
 * Segunda tanda del libro de fidelidad (Fase 2 §11.3): el **Nivel 1** de
 * funciones de criterio, las funciones de tipo, los estadísticos de orden y el
 * operador de concatenación.
 *
 * La primera tanda cubría el Nivel 0. Esta cubre lo que se implementó después
 * del canal de valores y que hoy está escrito **según la documentación de
 * Microsoft, sin verificar contra Excel**: que los tests unitarios pasen solo
 * demuestra que el motor hace lo que yo creí; no que haga lo que hace Excel.
 * Los casos marcados "A VERIFICAR" en la columna de notas del libro son
 * exactamente aquellos en los que no me fío de mi propia lectura.
 *
 * **Cómo se regenera y se completa** (ver `tests/fixtures/generar-nivel1.py`):
 *
 *   1. `python3 tests/fixtures/generar-nivel1.py` escribe el `.xlsx` con las
 *      fórmulas pero sin valores.
 *   2. Alguien lo abre en **Excel de verdad**, deja que calcule y lo guarda.
 *   3. A partir de ahí este test compara contra lo que Excel grabó.
 *
 * Mientras el paso 2 no haya ocurrido, el libro no tiene valores cacheados y
 * los casos quedan en espera con un mensaje que lo dice. No se marcan como
 * aprobados: un test que pasa porque no comprueba nada es peor que uno que
 * falta.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  errorEn, numeroEn, textoEn, tipoEn, ERROR, LOGICO, NUMERO, TEXTO, type Columna,
} from '../../engine/values/columna.ts';
import { leerCasosFidelidad, type CasoFidelidad } from '../helpers/leerFidelidad.ts';

const RUTA_FIXTURE = fileURLToPath(new URL('../fixtures/fidelidad-nivel1.xlsx', import.meta.url));
const HOJA = 'Fidelidad';
const CELDA_FORMULA = 'E2';
const CLAVE_FORMULA = claveDeReferencia(HOJA, CELDA_FORMULA);

/**
 * Casos que no se pueden comparar todavía, por id y con el motivo. Igual que
 * en la primera tanda: nunca se descarta uno en silencio.
 */
const PENDIENTES: Record<string, string> = {};

/**
 * Los datos auxiliares sobre los que operan los casos. **Tienen que ser
 * idénticos a los del generador** (`tests/fixtures/generar-nivel1.py`); si se
 * toca uno, hay que tocar el otro, y el test de coherencia de más abajo
 * comprueba que el libro los trae tal cual.
 *
 * Las trampas están puestas a propósito: `M6` escribe la categoría con otra
 * mayúscula, `M7` está vacía pero su fila tiene importe, `M8` empieza igual
 * que `M2` para los comodines, `P3` es un error de verdad en medio de un
 * rango y `Q2` es un asterisco literal.
 */
const AUXILIARES: Record<string, string> = {
  M2: '"obra"', M3: '"suministro"', M4: '"obra"', M5: '"transporte"',
  M6: '"Obra"', /* M7 vacía a propósito */ M8: '"obra civil"',
  N2: '1000', N3: '2000', N4: '1500', N5: '500', N6: '300', N7: '700', N8: '900',
  O2: '5', O3: '2', O4: '8', O5: '1', O6: '3', O7: '4', O8: '6',
  P2: '10', P3: '1/0', P4: '20',
  Q2: '"*"', Q3: '"a*b"', Q4: '"texto"',
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

/** Un libro recién generado trae las fórmulas pero ningún valor cacheado. */
function sinCalcular(casos: CasoFidelidad[]): boolean {
  return casos.every((c) => !c.calculado);
}

describe('libro de fidelidad, Nivel 1 (tests/fixtures/fidelidad-nivel1.xlsx)', () => {
  const casos = leerCasosFidelidad(RUTA_FIXTURE);
  const enEspera = sinCalcular(casos);

  it('el libro trae la tanda completa de casos', () => {
    expect(casos.length).toBeGreaterThanOrEqual(50);
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
    // Si alguien edita el .xlsx a mano y mueve una celda auxiliar, los casos
    // compararían contra otro modelo sin que nadie se entere.
    const grafo = construirModeloDeCaso('N2+N3+N4+N5+N6+N7+N8');
    const r = evaluarModelo(grafo, new Map(), [CLAVE_FORMULA], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(numeroEn(r.valores.get(CLAVE_FORMULA) as Columna, 0)).toBe(6900);
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
