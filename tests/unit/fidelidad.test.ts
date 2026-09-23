/**
 * Libro de fidelidad (Fase 2 §11.3): compara el motor, celda a celda, contra
 * valores que Excel de verdad calculó (`tests/fixtures/fidelidad.xlsx`, ya
 * abierto y recalculado en Excel real — no en un simulador). Ninguna función
 * se declara soportada a efectos de fidelidad sin pasar por aquí.
 *
 * Esta es la primera tanda (31 casos, catálogo Nivel 0 de Fase 2 §4.2). El
 * libro real crecerá con cada nivel de funciones que se añada.
 *
 * **Los 31 casos se comparan ahora sin excepciones.** Hasta el canal de
 * valores había seis que no se podían ni ejecutar ni comparar (texto, celdas
 * vacías frente a ceros, errores tipados); quedaban listados por id en el
 * diccionario `PENDIENTES` para que no se perdieran. Ese diccionario se
 * conserva vacío a propósito: es el sitio donde documentar el próximo hueco
 * que aparezca.
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
import { leerCasosFidelidad } from '../helpers/leerFidelidad.ts';

const RUTA_FIXTURE = fileURLToPath(new URL('../fixtures/fidelidad.xlsx', import.meta.url));
const HOJA = 'Fidelidad';
const CELDA_FORMULA = 'E2'; // cada caso se evalúa como si fuera la única fórmula de esta celda
const CLAVE_FORMULA = claveDeReferencia(HOJA, CELDA_FORMULA);

/**
 * Casos que hoy no se pueden ejecutar o comparar tal cual, con el motivo
 * exacto. Se listan por id —nunca se descartan en silencio— y el test de
 * coherencia de abajo falla si un id deja de existir en el libro, para que
 * nadie herede un motivo obsoleto.
 */
const PENDIENTES: Record<string, string> = {};

/**
 * Celdas auxiliares que usan algunos casos, declaradas como fórmulas para que
 * pasen por el mismo camino que cualquier otra celda del modelo.
 *
 * Las ausencias son deliberadas y son parte de lo que se comprueba: `H3` está
 * vacía (caso L0-031, que `PROMEDIO` no debe contar en el denominador),
 * `H10:H12` están todas vacías (L0-032, `#¡DIV/0!`) e `I4` está vacía
 * (L0-033 y L0-034, la diferencia entre `CONTAR` y `CONTARA`).
 */
const AUXILIARES: Record<string, string> = {
  H2: '10',
  H4: '30',
  I2: '42',
  I3: '"texto"', // la celda de texto que antes no se podía representar
  J2: '1', J3: '2', J4: '3',
  K2: '10', K3: '20', K4: '30',
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

/**
 * El libro lo calculó el Excel **en español** del usuario, así que el motor
 * tiene que calcular con la misma configuración regional para que la
 * comparación sea justa. Sin esto, los casos que convierten números a texto o
 * al revés compararían dos configuraciones distintas y no dos motores.
 */
beforeAll(() => establecerRegional(regionalDesdeIdioma('es-ES', { decimal: ',', miles: '.' })));
afterAll(() => restablecerRegional());

describe('libro de fidelidad (tests/fixtures/fidelidad.xlsx)', () => {
  const casos = leerCasosFidelidad(RUTA_FIXTURE);

  it('el libro tiene al menos los 31 casos de la primera tanda', () => {
    expect(casos.length).toBeGreaterThanOrEqual(31);
  });

  it('todos los casos traen el valor que Excel calculó, no una celda en blanco', () => {
    // Sin esto, un libro que nadie hubiera abierto en Excel se leería con
    // ceros y los casos que valen 0 pasarían solos, dando por verificada una
    // batería que no ha comparado nada.
    expect(casos.filter((c) => !c.calculado).map((c) => c.id)).toEqual([]);
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
      const r = evaluarModelo(grafo, new Map(), [CLAVE_FORMULA], 1);

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const c = r.valores.get(CLAVE_FORMULA) as Columna;

      switch (caso.valorEsperado.tipo) {
        case 'numero':
          expect(tipoEn(c, 0)).toBe(NUMERO);
          // Tolerancia relativa de Fase 2 §11.3.
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
          // Ya no basta con "algo falló": se compara el código exacto que
          // Excel escribió en la celda.
          expect(tipoEn(c, 0)).toBe(ERROR);
          expect(errorEn(c, 0)).toBe(caso.valorEsperado.codigo);
          break;
      }
    });
  }
});
