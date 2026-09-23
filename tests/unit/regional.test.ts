/**
 * La configuración regional, probada contra lo que respondió el Excel es-ES del
 * usuario en la cuarta tanda del libro de fidelidad: un decimal se escribe
 * `"1,5"`, `VALOR("1234.5")` es `#¡VALOR!` y un lógico es `"VERDADERO"`.
 *
 * Cada test fija la configuración y la restablece al terminar: es un ajuste de
 * módulo, y dejarlo puesto contaminaría a los tests que vengan detrás.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  errorEn, numeroEn, textoEn, tipoEn, ERROR, NUMERO, TEXTO, type Columna,
} from '../../engine/values/columna.ts';
import { numeroDeTexto, textoDeNumero } from '../../engine/values/coercion.ts';
import {
  establecerRegional, regionalDesdeIdioma, restablecerRegional, REGIONAL_NEUTRA,
} from '../../engine/values/regional.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);
const ES = regionalDesdeIdioma('es-ES', { decimal: ',', miles: '.' });

function evaluar(formula: string): Columna {
  const celdas: FormulaCelda[] = [{ hoja: H, col: 26, fila: 1, formula }];
  const r = evaluarModelo(construirGrafo(celdas).grafo, new Map(), [k('Z1')], 1);
  if (!r.ok) throw new Error(r.error.motivo);
  return r.valores.get(k('Z1')) as Columna;
}

afterEach(() => restablecerRegional());

describe('por omisión, nada cambia', () => {
  it('la configuración neutra es la de siempre: punto decimal y TRUE', () => {
    expect(textoDeNumero(1.5)).toBe('1.5');
    expect(numeroDeTexto('1.5')).toBe(1.5);
  });
});

describe('en español, lo que respondió el Excel del usuario', () => {
  it('T4-013: un decimal convertido a texto lleva coma', () => {
    establecerRegional(ES);
    const c = evaluar('LEFT(1.5,3)');
    expect(tipoEn(c, 0)).toBe(TEXTO);
    expect(textoEn(c, 0)).toBe('1,5');
  });

  it('N1-049: y al concatenar también', () => {
    establecerRegional(ES);
    expect(textoEn(evaluar('1.5&""'), 0)).toBe('1,5');
  });

  it('T4-052: VALOR("1234.5") es #¡VALOR!, porque el punto separa miles', () => {
    establecerRegional(ES);
    const c = evaluar('VALUE("1234.5")');
    expect(tipoEn(c, 0)).toBe(ERROR);
    expect(errorEn(c, 0)).toBe('#VALUE!');
  });

  it('T4-072: un lógico escrito como texto es VERDADERO', () => {
    establecerRegional(ES);
    expect(textoEn(evaluar('UPPER(TRUE)'), 0)).toBe('VERDADERO');
  });
});

describe('leer números en español', () => {
  it('la coma es el decimal', () => {
    establecerRegional(ES);
    expect(numeroDeTexto('1,5')).toBe(1.5);
    expect(numeroDeTexto('-0,25')).toBe(-0.25);
  });

  it('el punto separa miles, pero solo bien agrupado', () => {
    establecerRegional(ES);
    expect(numeroDeTexto('1.234,5')).toBe(1234.5);
    expect(numeroDeTexto('1.234.567')).toBe(1234567);
    // Mal agrupados: no son números. Ser permisivo convertiría en número lo
    // que Excel rechaza, y un número equivocado no se ve; un error, sí.
    expect(numeroDeTexto('12.34')).toBeUndefined();
    expect(numeroDeTexto('1.2345')).toBeUndefined();
    expect(numeroDeTexto('1234.5')).toBeUndefined();
  });

  it('un separador de miles en la parte decimal nunca vale', () => {
    establecerRegional(ES);
    expect(numeroDeTexto('1,23.4')).toBeUndefined();
  });

  it('dos comas decimales no son un número', () => {
    establecerRegional(ES);
    expect(numeroDeTexto('1,2,3')).toBeUndefined();
  });

  it('un texto con coma decimal se suma sin más', () => {
    establecerRegional(ES);
    const c = evaluar('"1,5"+1');
    expect(tipoEn(c, 0)).toBe(NUMERO);
    expect(numeroEn(c, 0)).toBe(2.5);
  });

  it('VALOR.NUMERO sin separadores usa los de la configuración', () => {
    establecerRegional(ES);
    expect(numeroEn(evaluar('NUMBERVALUE("1.234,5")'), 0)).toBe(1234.5);
  });

  it('SI acepta "VERDADERO" como condición', () => {
    establecerRegional(ES);
    expect(numeroEn(evaluar('IF("VERDADERO",1,2)'), 0)).toBe(1);
  });
});

describe('en inglés, los miles con coma también se leen', () => {
  it('"1,234.5" es 1234,5 con la configuración neutra', () => {
    expect(numeroDeTexto('1,234.5')).toBe(1234.5);
    expect(numeroDeTexto('1,23')).toBeUndefined();
  });
});

describe('regionalDesdeIdioma', () => {
  it('prefiere los separadores que da Excel', () => {
    // Un usuario en español que ha puesto el punto como decimal a mano.
    const r = regionalDesdeIdioma('es-ES', { decimal: '.', miles: ',' });
    expect(r.decimal).toBe('.');
    expect(r.verdadero).toBe('VERDADERO');
  });

  it('sin separadores, los deduce del idioma', () => {
    expect(regionalDesdeIdioma('es-ES').decimal).toBe(',');
    expect(regionalDesdeIdioma('es-MX').decimal).toBe('.');
    expect(regionalDesdeIdioma('en-US').decimal).toBe('.');
    expect(regionalDesdeIdioma('fr-FR').verdadero).toBe('VRAI');
  });

  it('un idioma desconocido usa los nombres en inglés', () => {
    expect(regionalDesdeIdioma('xx-YY').verdadero).toBe('TRUE');
  });

  it('nunca produce el mismo separador para decimal y miles', () => {
    const r = regionalDesdeIdioma('es-ES', { decimal: ',', miles: ',' });
    expect(r.decimal).not.toBe(r.miles);
  });
});

describe('establecerRegional', () => {
  it('rechaza una configuración incoherente', () => {
    expect(() => establecerRegional({ ...REGIONAL_NEUTRA, miles: '.' })).toThrow(/incoherente/);
  });
});
