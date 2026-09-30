import { describe, expect, it } from 'vitest';

import { indiceDeTextos, nombreSugerido, nombreUnico } from '../../excel/nombreSugerido.ts';

describe('nombreSugerido (E5)', () => {
  it('el texto de la izquierda: «Precio unitario» y no «Modelo!C5»', () => {
    expect(nombreSugerido('Modelo!C5', ['Precio unitario'])).toBe('Precio unitario');
  });

  it('salta las vacías y limpia espacios y dos puntos', () => {
    expect(nombreSugerido('Modelo!D5', ['', null, '  Tasa  de descuento: '])).toBe('Tasa de descuento');
  });

  it('con números en medio (tabla por años) añade la celda para distinguirla', () => {
    expect(nombreSugerido('Modelo!H28', [532494, 393884, 401622, 406186, 408000, -1200000, 'Flujo de caja libre']))
      .toBe('Flujo de caja libre (H28)');
  });

  it('un número escrito como texto no es una etiqueta', () => {
    expect(nombreSugerido('Hoja1!C3', ['2.024', 'Ventas'])).toBe('Ventas (C3)');
  });

  it('sin texto a la izquierda usa el de arriba; sin ninguno, la referencia', () => {
    expect(nombreSugerido('Hoja1!B2', [], ['Unidades'])).toBe('Unidades');
    expect(nombreSugerido('Hoja1!B2', [5], [7])).toBe('Hoja1!B2');
  });

  it('corta las etiquetas muy largas', () => {
    const n = nombreSugerido('Hoja1!B2', ['x'.repeat(100)]);
    expect(n.length).toBe(60);
    expect(n.endsWith('…')).toBe(true);
  });
});

describe('nombreUnico', () => {
  it('si otra celda ya se llama igual, se añade la celda', () => {
    expect(nombreUnico('Ventas', 'Hoja1!C9', ['Ventas'])).toBe('Ventas (C9)');
    expect(nombreUnico('Ventas', 'Hoja1!C9', ['Costes'])).toBe('Ventas');
  });
});

describe('indiceDeTextos (entradas RIESGO nombradas con el libro leído)', () => {
  it('encuentra la etiqueta de la izquierda en los valores del libro', () => {
    const t = indiceDeTextos([
      { hoja: 'Pruebas', col: 2, fila: 5, tipo: 'texto', texto: 'Demanda' },
      { hoja: 'Pruebas', col: 2, fila: 6, tipo: 'texto', texto: 'Precio' },
    ]);
    expect(t.nombre('Pruebas!C5', 'Pruebas', 3, 5)).toBe('Demanda');
    expect(t.nombre('Pruebas!C6', 'Pruebas', 3, 6)).toBe('Precio');
    expect(t.nombre('Otra!C6', 'Otra', 3, 6)).toBe('Otra!C6');
  });
});
