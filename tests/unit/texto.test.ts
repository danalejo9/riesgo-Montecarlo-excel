/**
 * Las funciones de texto, probadas **a través del motor completo**: fórmula →
 * parser → grafo → evaluador. Así se prueba también que el parser las
 * reconoce y que los rangos llegan con su forma, que es donde se esconden los
 * errores de orden (`CONCAT` recorre por filas; el motor aplana por columnas).
 *
 * Lo que aquí se afirma es lo que dice la documentación de Microsoft y lo que
 * sé de Excel. **No está verificado contra Excel**: eso lo hace la cuarta tanda
 * del libro de fidelidad. La historia de este proyecto dice que alguna de estas
 * afirmaciones está mal; el libro dirá cuál.
 */
import { describe, expect, it } from 'vitest';

import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import {
  errorEn, esInvariante, numeroEn, textoEn, tipoEn, ERROR, LOGICO, NUMERO, TEXTO, type Columna,
} from '../../engine/values/columna.ts';

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

/** Evalúa `formula` en Z1 con los datos dados, y devuelve el valor. */
function evaluar(formula: string, datos: Record<string, string> = {}): Columna {
  const g = grafoDe({ ...datos, Z1: formula });
  const r = evaluarModelo(g, new Map(), [k('Z1')], 1);
  if (!r.ok) throw new Error(r.error.motivo);
  return r.valores.get(k('Z1')) as Columna;
}

function texto(formula: string, datos?: Record<string, string>): string | undefined {
  const c = evaluar(formula, datos);
  expect(tipoEn(c, 0)).toBe(TEXTO);
  return textoEn(c, 0);
}

function numero(formula: string, datos?: Record<string, string>): number {
  const c = evaluar(formula, datos);
  expect(tipoEn(c, 0)).toBe(NUMERO);
  return numeroEn(c, 0);
}

function fallo(formula: string, datos?: Record<string, string>): string | undefined {
  const c = evaluar(formula, datos);
  expect(tipoEn(c, 0)).toBe(ERROR);
  return errorEn(c, 0);
}

describe('LARGO, IZQUIERDA, DERECHA, EXTRAE', () => {
  it('cuentan y recortan caracteres', () => {
    expect(numero('LEN("hola")')).toBe(4);
    expect(texto('LEFT("Presupuesto",3)')).toBe('Pre');
    expect(texto('RIGHT("Presupuesto",5)')).toBe('uesto');
    expect(texto('MID("Presupuesto",4,3)')).toBe('sup');
  });

  it('IZQUIERDA y DERECHA toman 1 carácter por omisión', () => {
    expect(texto('LEFT("abc")')).toBe('a');
    expect(texto('RIGHT("abc")')).toBe('c');
  });

  it('pedir más de lo que hay devuelve el texto entero, no un error', () => {
    expect(texto('LEFT("abc",10)')).toBe('abc');
    expect(texto('MID("abc",2,10)')).toBe('bc');
  });

  it('EXTRAE más allá del final da el texto vacío; antes del principio, error', () => {
    expect(texto('MID("abc",5,2)')).toBe('');
    expect(fallo('MID("abc",0,2)')).toBe('#VALUE!');
  });

  it('una longitud negativa es #¡VALOR!', () => {
    expect(fallo('LEFT("abc",-1)')).toBe('#VALUE!');
  });

  it('un número se trata como su texto en formato General', () => {
    expect(numero('LEN(A1)', { A1: '1234' })).toBe(4);
    expect(texto('LEFT(A1,2)', { A1: '1234' })).toBe('12');
  });

  it('una celda vacía es el texto vacío', () => {
    expect(numero('LEN(A1)')).toBe(0);
  });

  it('un error se propaga', () => {
    expect(fallo('LEN(1/0)')).toBe('#DIV/0!');
  });
});

describe('MAYUSC, MINUSC, NOMPROPIO, ESPACIOS', () => {
  it('cambian mayúsculas, también con tildes', () => {
    expect(texto('UPPER("año")')).toBe('AÑO');
    expect(texto('LOWER("ÁRBOL")')).toBe('árbol');
  });

  it('NOMPROPIO pone mayúscula tras cualquier cosa que no sea una letra', () => {
    expect(texto('PROPER("presupuesto de OBRA")')).toBe('Presupuesto De Obra');
    expect(texto('PROPER("o\'neil")')).toBe("O'Neil");
    // La rareza: tras un dígito también. Hay que reproducirla, no corregirla.
    expect(texto('PROPER("2nd")')).toBe('2Nd');
  });

  it('ESPACIOS deja un solo espacio entre palabras y ninguno en los extremos', () => {
    expect(texto('TRIM("  mucho    espacio  ")')).toBe('mucho espacio');
  });

  it('ESPACIOS no toca el espacio duro, como Excel', () => {
    expect(texto('TRIM(CHAR(160)&"x")')).toBe('\u00A0x');
  });
});

describe('CONCATENAR, CONCAT, UNIRCADENAS', () => {
  it('CONCATENAR une valores sueltos', () => {
    expect(texto('CONCATENATE("Año ",A1)', { A1: '2026' })).toBe('Año 2026');
  });

  it('CONCATENAR con un rango de varias celdas es #¡VALOR!', () => {
    expect(fallo('CONCATENATE(A1:A2)', { A1: '"a"', A2: '"b"' })).toBe('#VALUE!');
  });

  it('CONCAT recorre un rango por filas, no por columnas', () => {
    // A1=a B1=b / A2=c B2=d. Por filas: abcd. Por columnas (el aplanado del
    // motor) saldría acbd, que es plausible y está mal.
    const datos = { A1: '"a"', B1: '"b"', A2: '"c"', B2: '"d"' };
    expect(texto('CONCAT(A1:B2)', datos)).toBe('abcd');
  });

  it('UNIRCADENAS pone el delimitador y puede ignorar las vacías', () => {
    const datos = { A1: '"a"', A3: '"c"', A4: '""' }; // A2 vacía, A4 texto vacío
    expect(texto('TEXTJOIN(", ",TRUE,A1:A4)', datos)).toBe('a, c');
    expect(texto('TEXTJOIN(", ",FALSE,A1:A4)', datos)).toBe('a, , c, ');
  });

  it('un error en cualquiera de las partes se propaga', () => {
    expect(fallo('CONCAT("a",1/0)')).toBe('#DIV/0!');
  });
});

describe('ENCONTRAR, HALLAR, SUSTITUIR, REEMPLAZAR, REPETIR', () => {
  it('ENCONTRAR distingue mayúsculas; HALLAR no', () => {
    expect(fallo('FIND("A","banana")')).toBe('#VALUE!');
    expect(numero('SEARCH("A","banana")')).toBe(2);
  });

  it('la posición cuenta desde el principio, aunque se empiece a buscar después', () => {
    expect(numero('FIND("a","banana",3)')).toBe(4);
  });

  it('no encontrar es #¡VALOR!, no #N/A', () => {
    expect(fallo('SEARCH("z","banana")')).toBe('#VALUE!');
  });

  it('HALLAR entiende los comodines, y ~ los escapa', () => {
    expect(numero('SEARCH("n?n","banana")')).toBe(3);
    expect(numero('SEARCH("b*n","abanana")')).toBe(2);
    expect(numero('SEARCH("~*","a*b")')).toBe(2);
  });

  it('buscar el texto vacío devuelve la posición de inicio', () => {
    expect(numero('FIND("","abc")')).toBe(1);
    expect(numero('FIND("","abc",3)')).toBe(3);
  });

  it('SUSTITUIR cambia todas las ocurrencias, o solo la pedida', () => {
    expect(texto('SUBSTITUTE("a-b-c","-","/")')).toBe('a/b/c');
    expect(texto('SUBSTITUTE("a-b-c","-","/",2)')).toBe('a-b/c');
    expect(texto('SUBSTITUTE("a-b-c","-","/",9)')).toBe('a-b-c');
  });

  it('SUSTITUIR distingue mayúsculas', () => {
    expect(texto('SUBSTITUTE("Aa","a","x")')).toBe('Ax');
  });

  it('REEMPLAZAR trabaja por posición', () => {
    expect(texto('REPLACE("2025-01",1,4,"2026")')).toBe('2026-01');
  });

  it('REPETIR', () => {
    expect(texto('REPT("ab",3)')).toBe('ababab');
    expect(fallo('REPT("ab",-1)')).toBe('#VALUE!');
  });
});

describe('CARACTER, CODIGO, IGUAL', () => {
  it('CARACTER usa la página de Windows: el 128 es el euro', () => {
    expect(texto('CHAR(65)')).toBe('A');
    expect(texto('CHAR(128)')).toBe('€');
    expect(fallo('CHAR(0)')).toBe('#VALUE!');
    expect(fallo('CHAR(256)')).toBe('#VALUE!');
  });

  it('CODIGO es su inverso, y 63 para lo que Windows no puede escribir', () => {
    expect(numero('CODE("A")')).toBe(65);
    expect(numero('CODE("€")')).toBe(128);
    expect(numero('CODE("ñ")')).toBe(241);
    expect(numero('CODE("→")')).toBe(63);
    expect(fallo('CODE("")')).toBe('#VALUE!');
  });

  it('IGUAL distingue mayúsculas, a diferencia de =', () => {
    const c = evaluar('EXACT("Obra","obra")');
    expect(tipoEn(c, 0)).toBe(LOGICO);
    expect(numeroEn(c, 0)).toBe(0);
  });
});

describe('VALOR y VALOR.NUMERO', () => {
  it('VALOR convierte un número escrito como texto', () => {
    expect(numero('VALUE("1234.5")')).toBe(1234.5);
    expect(numero('VALUE("15%")')).toBeCloseTo(0.15, 12);
  });

  it('VALOR del texto vacío es #¡VALOR!, aunque ""+0 sea 0', () => {
    expect(fallo('VALUE("")')).toBe('#VALUE!');
    expect(numero('""+0')).toBe(0);
  });

  it('VALOR.NUMERO con separadores explícitos no depende de ninguna configuración', () => {
    expect(numero('NUMBERVALUE("1.234,5",",",".")')).toBe(1234.5);
    expect(numero('NUMBERVALUE("2 500")')).toBe(2500);
    expect(numero('NUMBERVALUE("50%%")')).toBeCloseTo(0.005, 12);
    expect(numero('NUMBERVALUE("")')).toBe(0);
  });

  it('VALOR.NUMERO rechaza los separadores de miles después del decimal', () => {
    expect(fallo('NUMBERVALUE("1,5.3",",",".")')).toBe('#VALUE!');
    expect(fallo('NUMBERVALUE("1,5",",",",")')).toBe('#VALUE!');
  });
});

describe('TIPO, N, T, HIPERVINCULO', () => {
  it('TIPO no propaga el error: lo clasifica', () => {
    expect(numero('TYPE(5)')).toBe(1);
    expect(numero('TYPE("a")')).toBe(2);
    expect(numero('TYPE(TRUE)')).toBe(4);
    expect(numero('TYPE(1/0)')).toBe(16);
    expect(numero('TYPE(A1)')).toBe(1); // vacía
    expect(numero('TYPE(A1:A2)', { A1: '1', A2: '2' })).toBe(64);
  });

  it('N y T', () => {
    expect(numero('N(TRUE)')).toBe(1);
    expect(numero('N("7")')).toBe(0);
    expect(texto('T("x")')).toBe('x');
    expect(texto('T(5)')).toBe('');
    expect(fallo('N(1/0)')).toBe('#DIV/0!');
  });

  it('HIPERVINCULO vale el nombre que se enseña, o el enlace si no hay nombre', () => {
    expect(texto('HYPERLINK("https://x.es","Informe")')).toBe('Informe');
    expect(texto('HYPERLINK("https://x.es")')).toBe('https://x.es');
  });
});

describe('el atajo de lo invariante', () => {
  it('una etiqueta constante se calcula una vez, no un millón', () => {
    const g = grafoDe({ Z1: 'CONCAT("Año ",A1)', A1: '2026' });
    const r = evaluarModelo(g, new Map(), [k('Z1')], 1000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.valores.get(k('Z1')) as Columna;
    // Constante: una sola cadena compartida por las mil iteraciones.
    expect(esInvariante(c)).toBe(true);
    expect(textoEn(c, 999)).toBe('Año 2026');
  });

  it('un texto que depende de una entrada sí cambia en cada iteración', () => {
    const g = grafoDe({ Z1: 'LEFT(A1,1)' });
    const entradas = new Map([[k('A1'), Float64Array.from([1, 2, 3])]]);
    const r = evaluarModelo(g, entradas, [k('Z1')], 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.valores.get(k('Z1')) as Columna;
    expect([0, 1, 2].map((i) => textoEn(c, i))).toEqual(['1', '2', '3']);
  });
});
