import { describe, expect, it } from 'vitest';

import { columnaAIndice, leerFormula, partirCelda } from '../../scanner/formula.ts';

const funciones = (f: string) => leerFormula(f).funciones;

describe('leerFormula — funciones', () => {
  it('reconoce llamadas simples y anidadas', () => {
    expect(funciones('=SUM(A1:A9)')).toEqual(['SUM']);
    expect(funciones('=IF(A1>0,ROUND(B1*C1,2),0)')).toEqual(['IF', 'ROUND']);
  });

  it('no confunde un nombre definido con una función', () => {
    // Sin el paréntesis no es una llamada. Un escáner a base de regex contaría
    // TASA_IVA o incluso LOG10 como funciones.
    const r = leerFormula('=B5*TASA_IVA');
    expect(r.funciones).toEqual([]);
    expect(r.nombres).toContain('TASA_IVA');
  });

  it('distingue LOG10 función de LOG10 referencia', () => {
    expect(funciones('=LOG10(A1)')).toEqual(['LOG10']);
    // LOG10 sin paréntesis parece la celda de la columna LOG, fila 10.
    expect(leerFormula('=LOG10').funciones).toEqual([]);
  });

  it('ignora lo que hay dentro de las cadenas de texto', () => {
    const r = leerFormula('=IF(A1="SUM(B1)","VLOOKUP(x)","")');
    expect(r.funciones).toEqual(['IF']);
  });

  it('respeta las comillas dobles escapadas dentro de una cadena', () => {
    expect(funciones('=IF(A1="dice ""SUM(1)"" aqui",MAX(B1:B2),0)')).toEqual(['IF', 'MAX']);
  });

  it('normaliza el prefijo _xlfn de las funciones modernas', () => {
    // Excel guarda XLOOKUP como _xlfn.XLOOKUP en el XML.
    expect(funciones('=_xlfn.XLOOKUP(A1,B:B,C:C)')).toEqual(['_xlfn.XLOOKUP']);
  });

  it('reconoce funciones con punto en el nombre', () => {
    expect(funciones('=STDEV.S(A1:A9)')).toEqual(['STDEV.S']);
    expect(funciones('=RISK.NORMAL(1000,50)')).toEqual(['RISK.NORMAL']);
  });

  it('admite espacios entre el nombre y el paréntesis', () => {
    expect(funciones('=SUM (A1:A9)')).toEqual(['SUM']);
  });
});

describe('leerFormula — referencias', () => {
  it('extrae celdas sueltas y rangos', () => {
    const r = leerFormula('=A1+SUM(B2:C4)');
    expect(r.celdas).toEqual([{ celda: 'A1' }]);
    expect(r.rangos).toEqual([{ desde: 'B2', hasta: 'C4' }]);
  });

  it('quita los signos de dólar de las referencias absolutas', () => {
    const r = leerFormula('=$A$1*$B2');
    expect(r.celdas.map((c) => c.celda)).toEqual(['A1', 'B2']);
  });

  it('reconoce la hoja, con y sin comillas', () => {
    expect(leerFormula('=Datos!A1').celdas).toEqual([{ hoja: 'Datos', celda: 'A1' }]);
    expect(leerFormula("='Costes 2026'!B7").celdas).toEqual([
      { hoja: 'Costes 2026', celda: 'B7' },
    ]);
  });

  it('marca las referencias a otros libros', () => {
    expect(leerFormula('=[1]Hoja1!A1').referenciaExterna).toBe(true);
    expect(leerFormula('=A1').referenciaExterna).toBe(false);
  });

  it('marca las referencias estructuradas de tabla', () => {
    const r = leerFormula('=SUM(Tabla1[Importe])');
    expect(r.referenciaEstructurada).toBe(true);
    expect(r.funciones).toEqual(['SUM']);
  });

  it('marca el operador de derrame de las matrices dinámicas', () => {
    expect(leerFormula('=SUM(A1#)').derrame).toBe(true);
  });
});

describe('utilidades de celda', () => {
  it('convierte letras de columna a índice', () => {
    expect(columnaAIndice('A')).toBe(1);
    expect(columnaAIndice('Z')).toBe(26);
    expect(columnaAIndice('AA')).toBe(27);
    expect(columnaAIndice('XFD')).toBe(16384); // última columna de Excel
  });

  it('parte una referencia en columna y fila', () => {
    expect(partirCelda('BC12')).toEqual({ col: 55, fila: 12 });
    expect(partirCelda('$A$1')).toEqual({ col: 1, fila: 1 });
    expect(partirCelda('no-es-una-celda')).toBeNull();
  });
});
