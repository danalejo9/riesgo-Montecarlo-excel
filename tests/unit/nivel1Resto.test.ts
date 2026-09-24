/**
 * El resto del Nivel 1: `MAX.SI.CONJUNTO`, `MIN.SI.CONJUNTO`, `SI.CONJUNTO`,
 * `CAMBIAR`, `BUSCAR` y las funciones de calendario (`DIAS360`, `FRAC.AÑO`,
 * `SIFECHA`, `DIA.LAB`, `DIAS.LAB`, `FECHANUMERO`).
 *
 * Probadas a través del motor completo, como las de texto. Los valores
 * esperados son **los ejemplos de la documentación de Microsoft**, que es lo
 * único que se puede afirmar sin haber pasado por Excel. Los bordes donde las
 * convenciones difieren (fin de febrero, días 31, bisiestos) los decide la
 * sexta tanda del libro de fidelidad, no este archivo.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  errorEn, numeroEn, textoEn, tipoEn, ERROR, NUMERO, TEXTO, type Columna,
} from '../../engine/values/columna.ts';
import {
  establecerRegional, regionalDesdeIdioma, restablecerRegional,
} from '../../engine/values/regional.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function grafoDe(formulas: Record<string, string>) {
  const celdas: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
  return construirGrafo(celdas).grafo;
}

function evaluar(formula: string, datos: Record<string, string> = {}): Columna {
  const g = grafoDe({ ...datos, Z1: formula });
  const r = evaluarModelo(g, new Map(), [k('Z1')], 1);
  if (!r.ok) throw new Error(r.error.motivo);
  return r.valores.get(k('Z1')) as Columna;
}

function numero(formula: string, datos?: Record<string, string>): number {
  const c = evaluar(formula, datos);
  expect(tipoEn(c, 0)).toBe(NUMERO);
  return numeroEn(c, 0);
}

function texto(formula: string, datos?: Record<string, string>): string | undefined {
  const c = evaluar(formula, datos);
  expect(tipoEn(c, 0)).toBe(TEXTO);
  return textoEn(c, 0);
}

function error(formula: string, datos?: Record<string, string>): string | undefined {
  const c = evaluar(formula, datos);
  expect(tipoEn(c, 0)).toBe(ERROR);
  return errorEn(c, 0);
}

afterEach(() => restablecerRegional());

describe('MAX.SI.CONJUNTO y MIN.SI.CONJUNTO', () => {
  // El ejemplo de la documentación: notas (A) y grados (B).
  const datos = {
    A1: '89', A2: '93', A3: '96', A4: '85', A5: '91', A6: '88',
    B1: '1', B2: '2', B3: '2', B4: '3', B5: '1', B6: '1',
  };

  it('toma el extremo solo entre las filas que cumplen', () => {
    expect(numero('MAXIFS(A1:A6,B1:B6,1)', datos)).toBe(91);
    expect(numero('MINIFS(A1:A6,B1:B6,1)', datos)).toBe(88);
    expect(numero('MAXIFS(A1:A6,B1:B6,">1",A1:A6,"<95")', datos)).toBe(93);
  });

  it('sin ninguna coincidencia devuelve 0, no un error', () => {
    expect(numero('MAXIFS(A1:A6,B1:B6,9)', datos)).toBe(0);
    expect(numero('MINIFS(A1:A6,B1:B6,9)', datos)).toBe(0);
  });

  it('se reconocen con el prefijo _xlfn. con el que llegan del XML', () => {
    expect(numero('_xlfn.MAXIFS(A1:A6,B1:B6,2)', datos)).toBe(96);
  });
});

describe('SI.CONJUNTO', () => {
  const f = 'IFS(A1>90,"A",A1>80,"B",A1>70,"C")';

  it('devuelve el valor de la primera condición que se cumple', () => {
    expect(texto(f, { A1: '95' })).toBe('A');
    expect(texto(f, { A1: '85' })).toBe('B');
  });

  it('si ninguna se cumple es #N/A', () => {
    expect(error(f, { A1: '10' })).toBe('#N/A');
  });

  it('VERDADERO al final hace de rama por defecto', () => {
    expect(texto('IFS(A1>90,"A",TRUE,"otro")', { A1: '10' })).toBe('otro');
  });

  it('una condición con error propaga el error', () => {
    expect(error('IFS(1/0>1,"A",TRUE,"B")')).toBe('#DIV/0!');
  });

  it('un número impar de argumentos no es válido', () => {
    expect(error('IFS(TRUE,"A",FALSE)')).toBe('#VALUE!');
  });
});

describe('CAMBIAR', () => {
  it('devuelve el resultado del primer valor que coincide', () => {
    expect(texto('SWITCH(2,1,"uno",2,"dos","otro")')).toBe('dos');
  });

  it('el argumento sobrante es el valor por defecto', () => {
    expect(texto('SWITCH(3,1,"uno",2,"dos","otro")')).toBe('otro');
  });

  it('sin coincidencia ni valor por defecto es #N/A', () => {
    expect(error('SWITCH(3,1,"uno",2,"dos")')).toBe('#N/A');
  });

  it('el texto se compara sin distinguir mayúsculas, como el operador =', () => {
    expect(numero('SWITCH("ABC","abc",1,0)')).toBe(1);
  });
});

describe('BUSCAR', () => {
  // El ejemplo de la documentación: frecuencias y colores.
  const vector = {
    A1: '4.14', A2: '4.19', A3: '5.17', A4: '5.77', A5: '6.39',
    B1: '"rojo"', B2: '"naranja"', B3: '"amarillo"', B4: '"verde"', B5: '"azul"',
  };

  it('forma vectorial: el mayor valor que no supera al buscado', () => {
    expect(texto('LOOKUP(4.19,A1:A5,B1:B5)', vector)).toBe('naranja');
    expect(texto('LOOKUP(5,A1:A5,B1:B5)', vector)).toBe('naranja');
    expect(texto('LOOKUP(7.66,A1:A5,B1:B5)', vector)).toBe('azul');
  });

  it('por debajo del primero es #N/A', () => {
    expect(error('LOOKUP(0,A1:A5,B1:B5)', vector)).toBe('#N/A');
  });

  it('sin vector de resultado devuelve del propio vector de búsqueda', () => {
    expect(numero('LOOKUP(5,A1:A5)', vector)).toBe(4.19);
  });

  it('el vector de resultado puede ser una fila aunque el de búsqueda sea columna', () => {
    const datos = { ...vector, D1: '10', E1: '20', F1: '30', G1: '40', H1: '50' };
    expect(numero('LOOKUP(5.2,A1:A5,D1:H1)', datos)).toBe(30);
  });

  it('forma matricial más ancha que alta: primera fila, devuelve la última', () => {
    const datos = {
      D1: '"a"', E1: '"b"', F1: '"c"', G1: '"d"',
      D2: '1', E2: '2', F2: '3', G2: '4',
    };
    expect(numero('LOOKUP("c",D1:G2)', datos)).toBe(3);
  });

  it('forma matricial más alta que ancha: primera columna, devuelve la última', () => {
    const datos = { D1: '"a"', D2: '"b"', D3: '"c"', E1: '1', E2: '2', E3: '3' };
    expect(numero('LOOKUP("bump",D1:E3)', datos)).toBe(2);
  });
});

describe('DIAS360', () => {
  it('el ejemplo de la documentación: del 30 de enero al 31 de diciembre', () => {
    expect(numero('DAYS360(DATE(2011,1,30),DATE(2011,12,31))')).toBe(330);
  });

  it('método europeo: un día 31 cuenta siempre como 30', () => {
    expect(numero('DAYS360(DATE(2011,1,31),DATE(2011,3,31),TRUE)')).toBe(60);
  });

  it('negativo si el fin es anterior al inicio', () => {
    expect(numero('DAYS360(DATE(2011,3,1),DATE(2011,1,1))')).toBe(-60);
  });
});

describe('FRAC.AÑO', () => {
  // El ejemplo de la documentación: del 1 de enero al 30 de julio de 2012.
  const f = (base: string) => `YEARFRAC(DATE(2012,1,1),DATE(2012,7,30)${base})`;

  it('base 0 (30/360 estadounidense), la predeterminada', () => {
    expect(numero(f(''))).toBeCloseTo(0.58055556, 8);
  });

  it('base 1 (real/real)', () => {
    expect(numero(f(',1'))).toBeCloseTo(0.57650273, 8);
  });

  it('base 3 (real/365)', () => {
    expect(numero(f(',3'))).toBeCloseTo(0.57808219, 8);
  });

  it('una base fuera de 0..4 es #¡NUM!', () => {
    expect(error(f(',5'))).toBe('#NUM!');
  });
});

describe('SIFECHA', () => {
  it('los ejemplos de la documentación', () => {
    expect(numero('DATEDIF(DATE(2001,1,1),DATE(2003,1,1),"Y")')).toBe(2);
    expect(numero('DATEDIF(DATE(2001,6,1),DATE(2002,8,15),"D")')).toBe(440);
    expect(numero('DATEDIF(DATE(2001,6,1),DATE(2002,8,15),"YD")')).toBe(75);
  });

  it('meses completos, sin contar el que no ha terminado', () => {
    expect(numero('DATEDIF(DATE(2024,1,31),DATE(2024,3,30),"M")')).toBe(1);
    expect(numero('DATEDIF(DATE(2024,1,15),DATE(2025,3,20),"YM")')).toBe(2);
  });

  it('inicio posterior al fin es #¡NUM!', () => {
    expect(error('DATEDIF(DATE(2003,1,1),DATE(2001,1,1),"Y")')).toBe('#NUM!');
  });

  it('una unidad desconocida es #¡NUM!', () => {
    expect(error('DATEDIF(DATE(2001,1,1),DATE(2003,1,1),"S")')).toBe('#NUM!');
  });
});

describe('DIAS.LAB y DIA.LAB', () => {
  // Los ejemplos de la documentación, con sus tres festivos.
  const festivos = {
    A1: 'DATE(2012,11,22)', A2: 'DATE(2012,12,4)', A3: 'DATE(2013,1,21)',
  };

  it('DIAS.LAB cuenta los laborables, con los dos extremos incluidos', () => {
    expect(numero('NETWORKDAYS(DATE(2012,10,1),DATE(2013,3,1))')).toBe(110);
    expect(numero('NETWORKDAYS(DATE(2012,10,1),DATE(2013,3,1),A1)', festivos)).toBe(109);
    expect(numero('NETWORKDAYS(DATE(2012,10,1),DATE(2013,3,1),A1:A3)', festivos)).toBe(107);
  });

  it('DIAS.LAB es negativo si las fechas van al revés', () => {
    expect(numero('NETWORKDAYS(DATE(2013,3,1),DATE(2012,10,1))')).toBe(-110);
  });

  it('DIA.LAB avanza saltando fines de semana y festivos', () => {
    const f = { A1: 'DATE(2008,11,26)', A2: 'DATE(2008,12,4)', A3: 'DATE(2009,1,21)' };
    expect(numero('WORKDAY(DATE(2008,10,1),151)')).toBe(39933); // 30/04/2009
    expect(numero('WORKDAY(DATE(2008,10,1),151,A1:A3)', f)).toBe(39938); // 05/05/2009
  });

  it('DIA.LAB con días negativos retrocede', () => {
    // Del lunes 5 de febrero de 2024, un laborable atrás es el viernes 2.
    expect(numero('WORKDAY(DATE(2024,2,5),-1)')).toBe(numero('DATE(2024,2,2)'));
  });
});

describe('FECHANUMERO', () => {
  it('el formato ISO se entiende en cualquier idioma', () => {
    expect(numero('DATEVALUE("2011-08-22")')).toBe(40777);
  });

  it('en inglés el mes va primero', () => {
    establecerRegional(regionalDesdeIdioma('en-US', { decimal: '.', miles: ',' }));
    expect(numero('DATEVALUE("8/22/2011")')).toBe(40777);
  });

  it('en español el día va primero', () => {
    establecerRegional(regionalDesdeIdioma('es-ES', { decimal: ',', miles: '.' }));
    expect(numero('DATEVALUE("22/8/2011")')).toBe(40777);
  });

  it('un texto que no es una fecha es #¡VALOR!', () => {
    expect(error('DATEVALUE("mañana")')).toBe('#VALUE!');
  });
});
