/**
 * `TEXTO`, en español y en inglés. La cadena de formato se lee con los
 * separadores del libro y el resultado sale con ellos: en español
 * `TEXTO(1234,5;"#.##0,00")` es "1.234,50".
 *
 * Lo que aquí se afirma **no está verificado contra Excel**: va en la quinta
 * tanda del libro de fidelidad, sobre todo las abreviaturas de meses y días,
 * que Excel toma de Windows y aquí salen de una tabla.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo } from '../../engine/graph/index.ts';
import { errorEn, textoEn, tipoEn, ERROR, TEXTO, type Columna } from '../../engine/values/columna.ts';
import { establecerRegional, regionalDesdeIdioma, restablecerRegional } from '../../engine/values/regional.ts';

const k = claveDeReferencia('Hoja1', 'Z1');
const ES = regionalDesdeIdioma('es-ES', { decimal: ',', miles: '.' });

function evaluar(formula: string): Columna {
  const g = construirGrafo([{ hoja: 'Hoja1', col: 26, fila: 1, formula }]).grafo;
  const r = evaluarModelo(g, new Map(), [k], 1);
  if (!r.ok) throw new Error(r.error.motivo);
  return r.valores.get(k) as Columna;
}

function texto(formula: string): string | undefined {
  const c = evaluar(formula);
  expect(tipoEn(c, 0), formula).toBe(TEXTO);
  return textoEn(c, 0);
}

afterEach(() => restablecerRegional());

describe('TEXTO en español: la cadena y el resultado con coma decimal', () => {
  it('miles con punto y decimales con coma', () => {
    establecerRegional(ES);
    expect(texto('TEXT(1234.5,"#.##0,00")')).toBe('1.234,50');
    expect(texto('TEXT(1234567,"#.##0")')).toBe('1.234.567');
  });

  it('ceros forzados y marcadores opcionales', () => {
    establecerRegional(ES);
    expect(texto('TEXT(5,"000")')).toBe('005');
    expect(texto('TEXT(1.5,"0,00")')).toBe('1,50');
    expect(texto('TEXT(1.5,"#,##")')).toBe('1,5');
    expect(texto('TEXT(0.5,"#,00")')).toBe(',50');
  });

  it('redondea alejándose de cero en el empate, como Excel', () => {
    establecerRegional(ES);
    expect(texto('TEXT(2.5,"0")')).toBe('3');
    expect(texto('TEXT(-2.5,"0")')).toBe('-3');
    expect(texto('TEXT(1.005,"0,00")')).toBe('1,01');
  });

  it('porcentaje', () => {
    establecerRegional(ES);
    expect(texto('TEXT(0.256,"0%")')).toBe('26%');
    expect(texto('TEXT(0.256,"0,0%")')).toBe('25,6%');
  });

  it('un separador de miles al final escala entre mil', () => {
    establecerRegional(ES);
    expect(texto('TEXT(1234567,"#.##0.")')).toBe('1.235');
    expect(texto('TEXT(1234567,"0,0..")')).toBe('1,2');
  });

  it('texto literal, entre comillas o escapado, y símbolos sueltos', () => {
    establecerRegional(ES);
    expect(texto('TEXT(1500,"#.##0 €")')).toBe('1.500 €');
    expect(texto('TEXT(3,"0"" uds""")')).toBe('3 uds');
  });

  it('secciones: positivo; negativo; cero', () => {
    establecerRegional(ES);
    expect(texto('TEXT(-5,"0;(0);cero")')).toBe('(5)');
    expect(texto('TEXT(0,"0;(0);""cero""")')).toBe('cero');
    expect(texto('TEXT(-5,"0")')).toBe('-5');
  });

  it('un negativo que redondea a cero no lleva signo', () => {
    establecerRegional(ES);
    expect(texto('TEXT(-0.001,"0")')).toBe('0');
  });

  it('los colores se ignoran; las condiciones no se soportan', () => {
    establecerRegional(ES);
    expect(texto('TEXT(-5,"0;[Rojo]-0")')).toBe('-5');
    const c = evaluar('TEXT(5,"[>=10]0;0")');
    expect(tipoEn(c, 0)).toBe(ERROR);
    expect(errorEn(c, 0)).toBe('#VALUE!');
  });

  it('notación científica', () => {
    establecerRegional(ES);
    expect(texto('TEXT(12345,"0,00E+00")')).toBe('1,23E+04');
    expect(texto('TEXT(0.00012,"0,0E+00")')).toBe('1,2E-04');
  });

  it('aaaa es el nombre del día, no el año, y aa se escribe tal cual (T5-024, T5-025)', () => {
    establecerRegional(ES);
    // 46288 es el 23 de septiembre de 2026, miércoles. Este test afirmaba que
    // aaaa era el año en español; el Excel del usuario dijo que no.
    expect(texto('TEXT(46288,"dd/mm/aaaa")')).toBe('23/09/miércoles');
    expect(texto('TEXT(46288,"aaa")')).toBe('mié');
    expect(texto('TEXT(46288,"d-m-aa")')).toBe('23-9-aa');
    expect(texto('TEXT(46288,"dddd d \\d\\e mmmm")')).toBe('miércoles 23 de septiembre');
    expect(texto('TEXT(46288,"mmm")')).toBe('sep');
  });

  it('una letra que no es un código invalida el formato (T5-023)', () => {
    establecerRegional(ES);
    const c = evaluar('TEXT(1.5,"Estándar")');
    expect(tipoEn(c, 0)).toBe(ERROR);
    expect(errorEn(c, 0)).toBe('#VALUE!');
    // Ojo: la regla "letra suelta = error" se dedujo de este único caso. Si
    // Excel acepta alguna letra sin comillas en un formato numérico
    // (`"0 kg"`), esto está mal: va en la próxima tanda de fidelidad.
  });

  it('el año se escribe con y también en español', () => {
    establecerRegional(ES);
    expect(texto('TEXT(46288,"yyyy-mm-dd")')).toBe('2026-09-23');
  });

  it('horas, minutos y segundos: la m después de una h es minuto', () => {
    establecerRegional(ES);
    // 0,75 del día son las 18:00.
    expect(texto('TEXT(46288.75,"hh:mm")')).toBe('18:00');
    expect(texto('TEXT(46288.5104166667,"h:mm:ss")')).toBe('12:15:00');
    // En español, "p. m." con un espacio duro en medio (T5-034).
    expect(texto('TEXT(46288.75,"h AM/PM")')).toBe('6 p.\u00a0m.');
  });

  it('un texto pasa tal cual, salvo que haya cuarta sección', () => {
    establecerRegional(ES);
    expect(texto('TEXT("abc","0")')).toBe('abc');
    expect(texto('TEXT("abc","0;0;0;""→""@")')).toBe('→abc');
  });
});

describe('TEXTO en inglés', () => {
  it('la misma cantidad, con los separadores al revés', () => {
    expect(texto('TEXT(1234.5,"#,##0.00")')).toBe('1,234.50');
    expect(texto('TEXT(46288,"dddd, mmmm d, yyyy")')).toBe('Wednesday, September 23, 2026');
    expect(texto('TEXT(46288.75,"h AM/PM")')).toBe('6 PM');
  });
});
