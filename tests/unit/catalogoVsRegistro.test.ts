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

import { REGISTRO } from '../../engine/functions/registry.ts';
import { NIVEL_0, NIVEL_1, NIVEL_2, NO_SOPORTADAS } from '../../scanner/catalog.ts';

const implementadas = new Set(Object.keys(REGISTRO));

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
      // Fecha: 900 usos en Caso_practico.xlsx.
      'DATE', 'DAY', 'DAYS', 'EDATE', 'EOMONTH', 'MONTH', 'WEEKDAY', 'YEAR',
      // Financieras.
      'IRR', 'NPV',
    ].sort());
  });

  it('las búsquedas de Nivel 1 siguen sin implementar, y el escáner debe decirlo', () => {
    // BUSCARV, INDICE y COINCIDIR son el siguiente bloque grande. Mientras no
    // existan, un libro que las use no corre: el escáner lo marca como
    // "pendiente", no como compatible.
    for (const f of ['VLOOKUP', 'INDEX', 'MATCH', 'XLOOKUP']) {
      expect(implementadas.has(f)).toBe(false);
    }
  });

  it('nada clasificado como Nivel 2 o no soportado está implementado a escondidas', () => {
    // Si una función de Nivel 2 se implementa, hay que subirla de nivel para
    // que el escáner deje de contarla como bloqueante.
    expect([...NIVEL_2].filter((f) => implementadas.has(f))).toEqual([]);
    expect([...NO_SOPORTADAS].filter((f) => implementadas.has(f))).toEqual([]);
  });

  it('todo lo implementado está clasificado en alguna parte del catálogo', () => {
    const sinClasificar = [...implementadas].filter(
      (f) => !NIVEL_0.has(f) && !NIVEL_1.has(f) && !NIVEL_2.has(f) && !NO_SOPORTADAS.has(f),
    );
    expect(sinClasificar).toEqual([]);
  });
});
