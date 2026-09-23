/**
 * Tercera tanda del libro de fidelidad: **financieras, búsquedas y fechas**.
 *
 * Es la tanda que cubre lo que el usuario va a usar de verdad —dijo que usaría
 * la TIR y el VAN— y lo que estaba implementado con menos respaldo: varias de
 * estas funciones se resuelven **numéricamente**, y ahí Excel tiene convenios
 * propios que no están escritos en ninguna parte con la precisión necesaria
 * (cuántas iteraciones intenta antes de rendirse, qué raíz elige cuando hay
 * más de una, qué signo lleva un pago al principio del periodo).
 *
 * Que los tests unitarios pasen solo demuestra que el motor hace lo que yo
 * creí. **Ya pasó dos veces** que eso no bastara: el criterio `"<>"` contra
 * una celda vacía (caso N1-011) y el signo de `PAGOINT`/`PAGOPRIN`, que el
 * test unitario daba por bueno porque comprobaba una identidad —`PAGOINT +
 * PAGOPRIN = PAGO`— que se cumplía con los dos términos mal.
 *
 * **Cómo se regenera y se completa** (ver `tests/fixtures/generar-nivel2.py`):
 *
 *   1. `python3 tests/fixtures/generar-nivel2.py` escribe el `.xlsx` con las
 *      fórmulas pero sin valores.
 *   2. Alguien lo abre en **Excel de verdad**, deja que calcule y lo guarda.
 *   3. A partir de ahí este test compara contra lo que Excel grabó.
 *
 * Mientras el paso 2 no haya ocurrido, los casos quedan en espera con un
 * mensaje que lo dice. No se marcan como aprobados: un test que pasa porque no
 * comprueba nada es peor que uno que falta.
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

const RUTA_FIXTURE = fileURLToPath(new URL('../fixtures/fidelidad-nivel2.xlsx', import.meta.url));
const HOJA = 'Fidelidad';
const CELDA_FORMULA = 'E2';
const CLAVE_FORMULA = claveDeReferencia(HOJA, CELDA_FORMULA);

/**
 * Casos que no se pueden comparar todavía, por id y con el motivo. Igual que
 * en las tandas anteriores: nunca se descarta uno en silencio.
 */
const PENDIENTES: Record<string, string> = {
  'N2-076':
    'No verificado por un defecto del generador, no del motor: `DIAS` (DAYS) es de Excel 2013 y ' +
    'en el XML va con el prefijo `_xlfn.`, que el generador no puso. Excel la tomó por una ' +
    'función definida por el usuario y devolvió #¿NOMBRE?. Es la segunda vez que pasa —antes con ' +
    '`SI.ND`— y la lección es que la lista de funciones que necesitan prefijo es más larga de lo ' +
    'que parece y solo se descubre probándolas. Corregido en el generador; se verifica en la ' +
    'próxima tanda. El riesgo real es bajo: `DIAS` es una resta de números de serie.',
};

/**
 * Cuántos decimales se exigen. Las financieras iterativas no pueden compararse
 * al último bit: Excel y el motor llegan a la misma raíz por caminos distintos
 * y con criterios de parada distintos. Seis decimales sobre una tasa es una
 * millonésima de punto porcentual — si la diferencia es mayor, no es redondeo.
 */
const DECIMALES = 6;

/**
 * Los datos auxiliares sobre los que operan los casos. **Tienen que ser
 * idénticos a los del generador** (`tests/fixtures/generar-nivel2.py`).
 *
 * Las fechas van como número de serie a propósito: así el libro no depende de
 * la configuración regional de fechas de la máquina que lo abra, que es
 * exactamente la clase de diferencia que esta batería existe para detectar y
 * no para sufrir.
 */
const AUXILIARES: Record<string, string> = {
  // Flujo de caja de un proyecto: una inversión y cinco cobros.
  H2: '-10000', H3: '2500', H4: '3500', H5: '4500', H6: '3000', H7: '2000',
  // Sus fechas: 2026-01-01, 2026-04-01, 2026-07-01, 2027-01-01, 2027-07-01, 2028-01-01.
  I2: '46023', I3: '46113', I4: '46204', I5: '46388', I6: '46569', I7: '46753',
  // Un flujo con dos cambios de signo: más de una TIR matemática.
  J2: '-1000', J3: '5000', J4: '-6000', J5: '2000',
  // Tabla de tarifas por tramo, ordenada.
  K2: '0', K3: '100', K4: '500', K5: '1000', K6: '5000',
  L2: '"F"', L3: '"E"', L4: '"D"', L5: '"C"', L6: '"B"',
  M2: '0.05', M3: '0.08', M4: '0.10', M5: '0.12', M6: '0.15',
  // La misma tabla, desordenada.
  O2: '500', O3: '100', O4: '5000', O5: '0', O6: '1000',
  P2: '0.10', P3: '0.08', P4: '0.15', P5: '0.05', P6: '0.12',
  // Y en horizontal, para BUSCARH.
  R2: '0', S2: '100', T2: '500', U2: '1000', V2: '5000',
  R3: '0.05', S3: '0.08', T3: '0.10', U3: '0.12', V3: '0.15',
  // Un rango numérico con un hueco: X3 está vacía a propósito.
  X2: '5', X4: '7', X5: '5',
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

/**
 * El libro lo calculó el Excel **en español** del usuario, así que el motor
 * tiene que calcular con la misma configuración regional para que la
 * comparación sea justa. Sin esto, los casos que convierten números a texto o
 * al revés compararían dos configuraciones distintas y no dos motores.
 */
beforeAll(() => establecerRegional(regionalDesdeIdioma('es-ES', { decimal: ',', miles: '.' })));
afterAll(() => restablecerRegional());

describe('libro de fidelidad, Nivel 2 (tests/fixtures/fidelidad-nivel2.xlsx)', () => {
  const casos = leerCasosFidelidad(RUTA_FIXTURE);
  const enEspera = sinCalcular(casos);

  it('el libro trae la tanda completa de casos', () => {
    expect(casos.length).toBeGreaterThanOrEqual(86);
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
    const grafo = construirModeloDeCaso('SUM(H2:H7)*1000+SUM(K2:K6)+SUM(M2:M6)*100');
    const r = evaluarModelo(grafo, new Map(), [CLAVE_FORMULA], 1);
    expect(r.ok).toBe(true);
    if (r.ok) expect(numeroEn(r.valores.get(CLAVE_FORMULA) as Columna, 0)).toBeCloseTo(5506650, 6);
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
          expect(numeroEn(c, 0)).toBeCloseTo(caso.valorEsperado.valor, DECIMALES);
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
