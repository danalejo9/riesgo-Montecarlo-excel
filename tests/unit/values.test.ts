import { describe, expect, it } from 'vitest';

import {
  coercionLogica,
  coercionNumerica,
  coercionTexto,
  compararEn,
  compararTexto,
  numeroDeTexto,
  textoDeNumero,
} from '../../engine/values/coercion.ts';
import {
  comoVectorNumerico,
  crearConstructor,
  errorConstante,
  errorEn,
  largoDe,
  logicoConstante,
  numeroConstante,
  numeroEn,
  textoConstante,
  textoEn,
  tipoEn,
  vacioConstante,
  vectorNumerico,
  ERROR,
  LOGICO,
  NUMERO,
  TEXTO,
  VACIO,
} from '../../engine/values/columna.ts';

describe('formas de Columna', () => {
  it('un vector numérico expone su Float64Array por el camino rápido', () => {
    const c = vectorNumerico(Float64Array.from([1, 2, 3]));
    expect(largoDe(c)).toBe(3);
    expect(tipoEn(c, 1)).toBe(NUMERO);
    expect(numeroEn(c, 1)).toBe(2);
    expect(comoVectorNumerico(c)).toBeInstanceOf(Float64Array);
  });

  it('un vector lógico NO se ofrece por el camino rápido numérico', () => {
    // SUMA no suma un VERDADERO que esté en un rango; tratarlo como 1 en el
    // camino rápido daría un resultado distinto al de Excel.
    const c = logicoConstante(true, 4);
    expect(tipoEn(c, 0)).toBe(LOGICO);
    expect(numeroEn(c, 0)).toBe(1);
    expect(comoVectorNumerico(c)).toBeNull();
  });

  it('el texto, el vacío y el error se guardan como constante, sin N copias', () => {
    const t = textoConstante('cemento', 1_000_000);
    expect(t.forma).toBe('constante');
    expect(largoDe(t)).toBe(1_000_000);
    expect(textoEn(t, 999_999)).toBe('cemento');

    const v = vacioConstante(10);
    expect(tipoEn(v, 3)).toBe(VACIO);
    expect(numeroEn(v, 3)).toBeNaN();

    const e = errorConstante('#DIV/0!', 10);
    expect(tipoEn(e, 0)).toBe(ERROR);
    expect(errorEn(e, 0)).toBe('#DIV/0!');
  });

  it('un número constante se guarda como vector, no como constante', () => {
    // Invariante del modelo: una sola forma para decir "esto es un número".
    expect(numeroConstante(7, 5).forma).toBe('vector');
  });
});

describe('ConstructorColumna', () => {
  it('colapsa a vector numérico cuando todas las ramas fueron números', () => {
    const b = crearConstructor(3);
    b.ponerNumero(0, 10);
    b.ponerNumero(1, 20);
    b.ponerNumero(2, 30);
    const c = b.terminar();

    expect(c.forma).toBe('vector');
    expect(comoVectorNumerico(c)).not.toBeNull();
    expect(numeroEn(c, 2)).toBe(30);
  });

  it('colapsa a constante cuando todo el contenido es el mismo texto', () => {
    const b = crearConstructor(3);
    for (let i = 0; i < 3; i++) b.ponerTexto(i, 'alto');
    const c = b.terminar();

    expect(c.forma).toBe('constante');
    expect(textoEn(c, 1)).toBe('alto');
  });

  it('se queda mixta si el mismo tipo trae contenidos distintos', () => {
    const b = crearConstructor(2);
    b.ponerTexto(0, 'alto');
    b.ponerTexto(1, 'bajo');
    const c = b.terminar();

    expect(c.forma).toBe('mixta');
    expect(textoEn(c, 0)).toBe('alto');
    expect(textoEn(c, 1)).toBe('bajo');
  });

  it('se queda mixta cuando el tipo varía por iteración — el caso de SI(A1>10;"alto";5)', () => {
    const b = crearConstructor(3);
    b.ponerTexto(0, 'alto');
    b.ponerNumero(1, 5);
    b.ponerError(2, '#N/A');
    const c = b.terminar();

    expect(c.forma).toBe('mixta');
    expect(tipoEn(c, 0)).toBe(TEXTO);
    expect(textoEn(c, 0)).toBe('alto');
    expect(tipoEn(c, 1)).toBe(NUMERO);
    expect(numeroEn(c, 1)).toBe(5);
    expect(tipoEn(c, 2)).toBe(ERROR);
    expect(errorEn(c, 2)).toBe('#N/A');
    // Un valor de otro tipo no contamina los accesores de los demás.
    expect(textoEn(c, 1)).toBeUndefined();
    expect(errorEn(c, 0)).toBeUndefined();
  });

  it('colapsa a vacío cuando todas las iteraciones quedaron vacías', () => {
    const b = crearConstructor(4);
    for (let i = 0; i < 4; i++) b.ponerVacio(i);
    expect(b.terminar().forma).toBe('constante');
    expect(tipoEn(b.terminar(), 0)).toBe(VACIO);
  });
});

describe('coercionNumerica', () => {
  it('vacío vale 0 en aritmética', () => {
    expect(coercionNumerica(vacioConstante(1), 0)).toBe(0);
  });

  it('lógico vale 1 o 0', () => {
    expect(coercionNumerica(logicoConstante(true, 1), 0)).toBe(1);
    expect(coercionNumerica(logicoConstante(false, 1), 0)).toBe(0);
  });

  it('el texto numérico se convierte; el que no lo es da #¡VALOR!', () => {
    expect(coercionNumerica(textoConstante('5', 1), 0)).toBe(5);
    expect(coercionNumerica(textoConstante('  -2.5  ', 1), 0)).toBe(-2.5);
    expect(coercionNumerica(textoConstante('cemento', 1), 0)).toBe('#VALUE!');
  });

  it('un error se propaga con su código, no se convierte en NaN', () => {
    expect(coercionNumerica(errorConstante('#DIV/0!', 1), 0)).toBe('#DIV/0!');
  });
});

describe('numeroDeTexto', () => {
  it('acepta lo que Excel acepta', () => {
    expect(numeroDeTexto('42')).toBe(42);
    expect(numeroDeTexto(' 3.5 ')).toBe(3.5);
    expect(numeroDeTexto('+7')).toBe(7);
    expect(numeroDeTexto('-0.5')).toBe(-0.5);
    expect(numeroDeTexto('1e3')).toBe(1000);
    expect(numeroDeTexto('.5')).toBe(0.5);
    expect(numeroDeTexto('50%')).toBe(0.5);
    expect(numeroDeTexto('')).toBe(0);
  });

  it('rechaza lo que JavaScript aceptaría pero Excel no', () => {
    expect(numeroDeTexto('0x10')).toBeUndefined();
    expect(numeroDeTexto('Infinity')).toBeUndefined();
    expect(numeroDeTexto('1,5')).toBeUndefined(); // límite documentado: sin configuración regional
    expect(numeroDeTexto('12 34')).toBeUndefined();
    expect(numeroDeTexto('cemento')).toBeUndefined();
  });
});

describe('textoDeNumero', () => {
  it('no deja ceros de relleno ni notación innecesaria', () => {
    expect(textoDeNumero(42)).toBe('42');
    expect(textoDeNumero(1.5)).toBe('1.5');
    expect(textoDeNumero(-0.25)).toBe('-0.25');
    expect(textoDeNumero(0)).toBe('0');
  });
});

describe('coercionTexto', () => {
  it('convierte cada tipo a su forma textual', () => {
    expect(coercionTexto(textoConstante('hola', 1), 0)).toBe('hola');
    expect(coercionTexto(numeroConstante(1.5, 1), 0)).toBe('1.5');
    expect(coercionTexto(logicoConstante(true, 1), 0)).toBe('TRUE');
    expect(coercionTexto(vacioConstante(1), 0)).toBe('');
  });
});

describe('coercionLogica', () => {
  it('sigue las reglas de condición de Excel', () => {
    expect(coercionLogica(numeroConstante(3, 1), 0)).toBe(true);
    expect(coercionLogica(numeroConstante(0, 1), 0)).toBe(false);
    expect(coercionLogica(vacioConstante(1), 0)).toBe(false);
    expect(coercionLogica(textoConstante('VERDADERO', 1), 0)).toBe(true);
    expect(coercionLogica(textoConstante('false', 1), 0)).toBe(false);
    expect(coercionLogica(textoConstante('cemento', 1), 0)).toBe('#VALUE!');
    expect(coercionLogica(errorConstante('#N/A', 1), 0)).toBe('#N/A');
  });
});

describe('compararEn', () => {
  const en = (a: ReturnType<typeof numeroConstante>, b: ReturnType<typeof numeroConstante>) => compararEn(a, b, 0);

  it('compara números entre sí', () => {
    expect(en(numeroConstante(1, 1), numeroConstante(2, 1))).toBe(-1);
    expect(en(numeroConstante(2, 1), numeroConstante(2, 1))).toBe(0);
    expect(en(numeroConstante(3, 1), numeroConstante(2, 1))).toBe(1);
  });

  it('ordena número < texto < lógico, como Excel', () => {
    expect(en(numeroConstante(1e9, 1), textoConstante('a', 1))).toBe(-1);
    expect(en(textoConstante('z', 1), logicoConstante(false, 1))).toBe(-1);
  });

  it('el texto se compara sin distinguir mayúsculas', () => {
    expect(en(textoConstante('Cemento', 1), textoConstante('CEMENTO', 1))).toBe(0);
    expect(compararTexto('a', 'B')).toBe(-1);
  });

  it('un vacío adopta el tipo del otro operando: es a la vez =0 y =""', () => {
    expect(en(vacioConstante(1), numeroConstante(0, 1))).toBe(0);
    expect(en(vacioConstante(1), textoConstante('', 1))).toBe(0);
    expect(en(vacioConstante(1), logicoConstante(false, 1))).toBe(0);
    expect(en(vacioConstante(1), vacioConstante(1))).toBe(0);
    expect(en(vacioConstante(1), numeroConstante(5, 1))).toBe(-1);
  });

  it('un error en cualquiera de los dos lados se propaga', () => {
    expect(en(errorConstante('#N/A', 1), numeroConstante(1, 1))).toBe('#N/A');
    expect(en(numeroConstante(1, 1), errorConstante('#REF!', 1))).toBe('#REF!');
  });
});
