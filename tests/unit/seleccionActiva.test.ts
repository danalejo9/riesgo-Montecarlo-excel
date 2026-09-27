import { describe, expect, it } from 'vitest';

import { claveComparable } from '../../excel/direcciones.ts';

describe('claveComparable (E6: saltar a la salida seleccionada en la hoja)', () => {
  it('la dirección con $ y la referencia del modelo son la misma celda', () => {
    expect(claveComparable('Modelo!$C$32')).toBe(claveComparable('Modelo!C32'));
    expect(claveComparable("'Con Refi'!E47")).toBe(claveComparable("'Con Refi'!$E$47"));
  });

  it('celdas distintas no coinciden', () => {
    expect(claveComparable('Modelo!C32')).not.toBe(claveComparable('Modelo!C33'));
    expect(claveComparable('Modelo!C32')).not.toBe(claveComparable('Pruebas!C32'));
  });
});
