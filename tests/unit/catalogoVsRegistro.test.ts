/**
 * El escáner (E1) le dice al usuario qué porcentaje de su libro puede correr
 * en el motor rápido. Esa promesa solo vale si el catálogo que usa para
 * clasificar coincide con lo que el motor **de verdad** sabe evaluar.
 *
 * Son dos listas escritas en sitios distintos y por motivos distintos —el
 * catálogo es el supuesto de Fase 2 §4.2; el registro es la implementación—,
 * así que se separan solas en cuanto alguien añade una función en un lado y no
 * en el otro. Ya pasó: el escáner contó como cubiertas diez funciones de Nivel
 * 0 que nadie había implementado, e informó como bloqueantes varias `ES*` que
 * sí existían. Un informe optimista es peor que no tener informe.
 *
 * Este test es el candado. Si falla, hay que implementar la función o moverla
 * de nivel — nunca silenciarlo.
 */
import { describe, expect, it } from 'vitest';

import { FORMAS_ESPECIALES, REGISTRO } from '../../engine/functions/registry.ts';
import { NIVEL_0, NIVEL_1, NIVEL_2, NO_SOPORTADAS } from '../../scanner/catalog.ts';

const implementadas = new Set([...Object.keys(REGISTRO), ...FORMAS_ESPECIALES]);

/**
 * Funciones que el catálogo promete y el motor todavía no tiene, con el
 * motivo de cada una. Hoy está vacía y ese es el estado deseable: añadirle una
 * entrada tiene que ser una decisión consciente y argumentada, no la forma
 * cómoda de callar este test.
 */
const PROMETIDAS_SIN_IMPLEMENTAR: Record<string, string> = {};

describe('el catálogo del escáner y el registro del motor no se han separado', () => {
  it('todo lo que el catálogo cuenta como Nivel 0 está implementado', () => {
    const faltan = [...NIVEL_0].filter(
      (f) => !implementadas.has(f) && !(f in PROMETIDAS_SIN_IMPLEMENTAR),
    );
    expect(faltan).toEqual([]);
  });

  it('el Nivel 1 implementado es exactamente el que se ha ido construyendo', () => {
    // Esta lista crece a propósito, y a mano: obliga a que añadir una función
    // sea una decisión visible en el diff y no un efecto colateral.
    const implementadasN1 = [...NIVEL_1].filter((f) => implementadas.has(f)).sort();
    expect(implementadasN1).toEqual([
      // Criterio: 3.183 usos en el libro real del usuario.
      'AVERAGEIF', 'AVERAGEIFS', 'COUNTIF', 'COUNTIFS', 'SUMIF', 'SUMIFS',
      'MAXIFS', 'MINIFS',
      // Condicionales sin anidar.
      'IFS', 'SWITCH',
      // Fecha: 900 usos en Caso_practico.xlsx.
      'DATE', 'DAY', 'DAYS', 'EDATE', 'EOMONTH', 'MONTH', 'WEEKDAY', 'YEAR',
      // Fecha con convenciones (bases, regla NASD, festivos), en calendario.ts.
      'DATEDIF', 'DATEVALUE', 'DAYS360', 'NETWORKDAYS', 'WORKDAY', 'YEARFRAC',
      // Búsquedas: no las pidió ningún libro concreto. Entraron porque están
      // en casi todos los modelos ajenos, que es el objetivo del producto.
      'CHOOSE', 'HLOOKUP', 'INDEX', 'LOOKUP', 'MATCH', 'VLOOKUP', 'XLOOKUP', 'XMATCH',
      // Financieras, incluidas las de amortización y las de flujos fechados.
      'FV', 'IPMT', 'IRR', 'NPER', 'NPV', 'PMT', 'PPMT', 'PV', 'RATE', 'XIRR', 'XNPV',
    ].sort());
  });

  it('lo que queda de Nivel 1 es lo que el escáner debe seguir marcando pendiente', () => {
    const pendientes = [...NIVEL_1].filter((f) => !implementadas.has(f)).sort();
    // DESREF es una referencia dinámica: devuelve un rango que depende de sus
    // argumentos. Con desplazamientos constantes se podría resolver al compilar;
    // con desplazamientos que cambian por iteración el grafo de dependencias ya
    // no es fijo, y eso es trabajo del modo compatible, no del motor rápido.
    expect(pendientes).toEqual(['OFFSET']);
  });

  it('el Nivel 2 implementado es exactamente el que se ha ido construyendo', () => {
    // El nivel del catálogo dice qué clase de función es, no si está hecha: el
    // escáner decide si bloquea preguntándole al registro. Esta lista, como la
    // del Nivel 1, crece a mano para que añadir una función se vea en el diff.
    const implementadasN2 = [...NIVEL_2].filter((f) => implementadas.has(f)).sort();
    expect(implementadasN2).toEqual([
      // Texto.
      'CHAR', 'CODE', 'CONCAT', 'CONCATENATE', 'EXACT', 'FIND', 'HYPERLINK', 'LEFT', 'LEN',
      'LOWER', 'MID', 'N', 'NUMBERVALUE', 'PROPER', 'REPLACE', 'REPT', 'RIGHT', 'SEARCH',
      'SUBSTITUTE', 'T', 'TEXT', 'TEXTJOIN', 'TRIM', 'TYPE', 'UPPER', 'VALUE',
      // Agregados que excluyen los subtotales intermedios.
      'AGGREGATE', 'SUBTOTAL',
      // Nombres locales y funciones anónimas: se resuelven al parsear (engine/parser/let.ts).
      'LAMBDA', 'LET',
      // Matriciales dinámicas, dentro de una función que las consuma
      // (engine/functions/matriciales.ts, compiler/usoMatricial.ts).
      'FILTER', 'MINVERSE', 'MMULT', 'SEQUENCE', 'SORT', 'SORTBY', 'TRANSPOSE', 'UNIQUE',
    ].sort());
  });

  it('lo que queda de Nivel 2 es lo que el escáner debe seguir marcando bloqueante', () => {
    const pendientes = [...NIVEL_2].filter((f) => !implementadas.has(f)).sort();
    expect(pendientes).toEqual([
      // Divide texto en varias celdas: solo tiene sentido derramando.
      'TEXTSPLIT',
      // Dependen de estructuras que el motor no lee: tablas dinámicas y el
      // texto de las fórmulas.
      'FORMULATEXT', 'GETPIVOTDATA',
    ].sort());
  });

  it('nada no soportado por diseño está implementado a escondidas', () => {
    expect([...NO_SOPORTADAS].filter((f) => implementadas.has(f))).toEqual([]);
  });

  it('todo lo implementado está clasificado en alguna parte del catálogo', () => {
    // Las internas (empiezan por `_`, como `_RIESGO.CUANTIL` de B7) las escribe
    // el propio motor al reescribir una fórmula: nunca aparecen en un libro.
    const sinClasificar = [...implementadas].filter(
      (f) => !f.startsWith('_') && !NIVEL_0.has(f) && !NIVEL_1.has(f) && !NIVEL_2.has(f) && !NO_SOPORTADAS.has(f),
    );
    expect(sinClasificar).toEqual([]);
  });
});
