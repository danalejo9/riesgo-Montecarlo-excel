import { describe, expect, it } from 'vitest';

import { analizar } from '../../scanner/analyze.ts';
import { clasificar, normalizar } from '../../scanner/catalog.ts';
import { veredicto } from '../../scanner/format.ts';
import { leerLibro } from '../../scanner/xlsx.ts';
import { construirXlsx, type CeldaFixture, type LibroFixture } from '../helpers/xlsxFixture.ts';

function escanear(libro: LibroFixture) {
  return analizar('fixture.xlsx', leerLibro(construirXlsx(libro)));
}

describe('catalogo', () => {
  it('clasifica por nivel', () => {
    expect(clasificar('SUM')).toBe('n0');
    expect(clasificar('VLOOKUP')).toBe('n1');
    expect(clasificar('SUBTOTAL')).toBe('n2');
    expect(clasificar('RAND')).toBe('no-soportada');
    expect(clasificar('MiMacroVBA')).toBe('desconocida');
  });

  it('normaliza los prefijos que añade Excel', () => {
    expect(normalizar('_xlfn.XLOOKUP')).toBe('XLOOKUP');
    expect(normalizar('@SUM')).toBe('SUM');
    expect(clasificar('_xlfn.XLOOKUP')).toBe('n1');
  });
});

describe('lectura del .xlsx', () => {
  it('lee hojas, fórmulas y su ubicación', () => {
    const inf = escanear({
      hojas: [
        { nombre: 'Presupuesto', celdas: [{ ref: 'A1', valor: '10' }, { ref: 'B1', formula: 'SUM(A1:A9)' }] },
        { nombre: 'Costes', celdas: [{ ref: 'C3', formula: 'Presupuesto!B1*2' }] },
      ],
    });

    expect(inf.hojas).toBe(2);
    expect(inf.formulas).toBe(2);
    expect(inf.celdasConContenido).toBe(3);
  });

  it('lee nombres de hoja con espacios y acentos', () => {
    const inf = escanear({
      hojas: [{ nombre: 'Análisis de márgenes', celdas: [{ ref: 'A1', formula: 'SUM(B1:B2)' }] }],
    });
    expect(inf.formulas).toBe(1);
  });

  it('desescapa las entidades XML de las fórmulas', () => {
    // Excel guarda `IF(A1<B1,...)` como `IF(A1&lt;B1,...)`.
    const inf = escanear({
      hojas: [{ nombre: 'H', celdas: [{ ref: 'A1', formula: 'IF(A1<B1,"a & b","")' }] }],
    });
    expect(inf.funciones.map((f) => f.nombre)).toEqual(['IF']);
  });

  it('expande las fórmulas compartidas usando el texto de la maestra', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'B1', formula: 'ROUND(A1*2,2)', compartida: { si: '0', maestra: true, rango: 'B1:B3' } },
          { ref: 'B2', compartida: { si: '0', maestra: false } },
          { ref: 'B3', compartida: { si: '0', maestra: false } },
        ],
      }],
    });

    expect(inf.formulas).toBe(3);
    expect(inf.formulasCompartidas).toBe(2);
    expect(inf.funciones.find((f) => f.nombre === 'ROUND')?.veces).toBe(3);
  });

  it('detecta VBA, Power Query, tablas, enlaces externos y nombres definidos', () => {
    const inf = escanear({
      hojas: [{ nombre: 'H', celdas: [{ ref: 'A1', formula: 'SUM(B1:B2)' }] }],
      nombresDefinidos: ['TASA_IVA', 'Margen'],
      tablas: 3,
      vba: true,
      powerQuery: true,
      enlacesExternos: 2,
    });

    expect(inf.tieneVba).toBe(true);
    expect(inf.tienePowerQuery).toBe(true);
    expect(inf.tablas).toBe(3);
    expect(inf.enlacesExternos).toBe(2);
    expect(inf.nombresDefinidos).toBe(2);
  });
});

describe('cobertura', () => {
  it('da 100 % en un modelo puramente aritmético', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', formula: 'B1*C1' },
          { ref: 'A2', formula: 'ROUND(SUM(B1:B9)*1.21,2)' },
          { ref: 'A3', formula: 'IF(A1>0,A2,0)' },
        ],
      }],
    });

    expect(inf.coberturaN0).toBe(100);
    expect(inf.coberturaN0N1).toBe(100);
    expect(veredicto(inf)).toBe('compatible');
    expect(inf.bloqueantes).toEqual([]);
  });

  it('separa lo que necesita Nivel 1 de lo que cubre Nivel 0', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', formula: 'SUM(B1:B9)' },
          { ref: 'A2', formula: 'VLOOKUP(C1,Tarifas!A:B,2,FALSE)' },
          { ref: 'A3', formula: 'SUM(D1:D9)' },
          { ref: 'A4', formula: 'SUM(E1:E9)' },
        ],
      }],
    });

    expect(inf.coberturaN0).toBe(75);
    expect(inf.coberturaN0N1).toBe(100);

    // El catálogo cubre BUSCARV, pero el motor todavía no la implementa, así
    // que el libro NO corre hoy. Decir "compatible" aquí sería la respuesta
    // tranquilizadora y falsa que este escáner existe para evitar: pasó de
    // verdad con `Caso_practico.xlsx`, que usaba FIN.MES, MES, AÑO y TIR
    // (ya implementadas; BUSCARV sigue pendiente).
    expect(veredicto(inf)).toBe('pendiente');
    expect(inf.pendientes.map((f) => f.nombre)).toEqual(['VLOOKUP']);
    expect(inf.bloqueantes).toEqual([]); // no es un bloqueo: es trabajo pendiente
  });

  it('distingue lo pendiente de implementar de lo que no correrá nunca', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', formula: 'SUM(B1:B9)' },        // implementada
          { ref: 'A2', formula: 'YEARFRAC(C1,C2)' },     // Nivel 1, sin implementar
          { ref: 'A3', formula: 'INDIRECT("A"&1)' },    // no soportada por diseño
        ],
      }],
    });

    expect(inf.pendientes.map((f) => f.nombre)).toEqual(['YEARFRAC']);
    expect(inf.bloqueantes.map((f) => f.nombre)).toEqual(['INDIRECT']);
    // Un bloqueante pesa más que un pendiente: no basta con esperar.
    expect(veredicto(inf)).not.toBe('pendiente');
  });

  it('una fórmula matricial impide el verde aunque sus funciones estén soportadas', () => {
    // El motor no implementa semántica de matrices: `SUMA(A1:A2*B1:B2)` falla
    // aunque SUMA esté soportada. Verificado contra el evaluador, no supuesto.
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', formula: 'SUM(B1:B9)' },
          { ref: 'A2', formula: 'SUM(B1:B2*C1:C2)', matricial: true },
        ],
      }],
    });

    expect(inf.bloqueantes).toEqual([]);
    expect(inf.pendientes).toEqual([]);
    expect(inf.formulasMatriciales).toBe(1);
    expect(veredicto(inf)).toBe('matricial');
    expect(inf.celdasMatriciales).toEqual(['H!A2']);
  });

  it('señala la celda y la función exactas que bloquean', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'Presupuesto',
        celdas: [
          { ref: 'H42', formula: 'SUBTOTAL(9,H5:H41)' },
          { ref: 'J17', formula: 'INDIRECT("A"&B1)' },
          { ref: 'C8', formula: 'MiMacroVBA(B8)' },
          { ref: 'A1', formula: 'SUM(B1:B2)' },
        ],
      }],
    });

    const nombres = inf.bloqueantes.map((b) => b.nombre).sort();
    expect(nombres).toEqual(['INDIRECT', 'MIMACROVBA', 'SUBTOTAL']);

    const subtotal = inf.bloqueantes.find((b) => b.nombre === 'SUBTOTAL');
    expect(subtotal?.ejemplo).toBe('Presupuesto!H42');
    expect(subtotal?.nivel).toBe('n2');
    expect(inf.bloqueantes.find((b) => b.nombre === 'INDIRECT')?.nivel).toBe('no-soportada');
    expect(inf.bloqueantes.find((b) => b.nombre === 'MIMACROVBA')?.nivel).toBe('desconocida');

    expect(inf.coberturaN0N1).toBe(25);
    expect(veredicto(inf)).toBe('incompatible');
  });

  it('cuenta las funciones propias del complemento como soportadas', () => {
    // Una celda con =RISK.NORMAL(...) declara una entrada: no es un obstáculo.
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', formula: 'RISK.NORMAL(1000,50)' },
          { ref: 'A2', formula: 'RIESGO.TRIANGULAR(1,2,3)' },
        ],
      }],
    });

    expect(inf.coberturaN0N1).toBe(100);
    expect(inf.bloqueantes).toEqual([]);
  });

  it('cuenta las celdas volátiles', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', formula: 'TODAY()' },
          { ref: 'A2', formula: 'OFFSET(B1,1,0)' },
          { ref: 'A3', formula: 'SUM(C1:C2)' },
        ],
      }],
    });

    expect(inf.celdasVolatiles).toBe(2);
  });

  it('no declara compatible un libro con una sola celda bloqueante', () => {
    // Regresión: con un umbral por porcentaje, 1 bloqueante entre 1.000
    // fórmulas daba "99,9 % compatible", que es tranquilizador y falso. Basta
    // una celda en el camino entrada->salida para tumbar el motor rápido.
    const celdas: CeldaFixture[] = [{ ref: 'Z1', formula: 'SUBTOTAL(9,A1:A2)' }];
    for (let f = 1; f <= 1000; f++) celdas.push({ ref: `A${f}`, formula: `B${f}*2` });

    const inf = escanear({ hojas: [{ nombre: 'H', celdas }] });

    expect(inf.coberturaN0N1).toBeGreaterThan(99);
    expect(veredicto(inf)).not.toBe('compatible');
    expect(inf.bloqueantes.map((b) => b.nombre)).toEqual(['SUBTOTAL']);
  });

  it('un libro sin fórmulas no rompe los porcentajes', () => {
    const inf = escanear({ hojas: [{ nombre: 'H', celdas: [{ ref: 'A1', valor: '5' }] }] });
    expect(inf.formulas).toBe(0);
    expect(inf.coberturaN0N1).toBe(0);
    expect(inf.referenciasPorFormula).toBe(0);
    expect(veredicto(inf)).toBe('compatible');
  });
});

describe('profundidad del grafo', () => {
  it('mide una cadena encadenada celda a celda', () => {
    // A1 <- A2 <- A3 <- A4: profundidad 3 desde A4.
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', valor: '1' },
          { ref: 'A2', formula: 'A1*2' },
          { ref: 'A3', formula: 'A2*2' },
          { ref: 'A4', formula: 'A3*2' },
        ],
      }],
    });

    // A2 no depende de ninguna otra fórmula (A1 es un valor), así que la
    // cadena de fórmulas es A2 -> A3 -> A4.
    expect(inf.profundidad).toBe(2);
  });

  it('sigue las dependencias a través de rangos', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'B1', formula: 'A1*2' },
          { ref: 'B2', formula: 'A2*2' },
          { ref: 'C1', formula: 'SUM(B1:B2)' },
          { ref: 'D1', formula: 'C1+1' },
        ],
      }],
    });

    expect(inf.profundidad).toBe(2);
  });

  it('no se cuelga con una referencia circular', () => {
    const inf = escanear({
      hojas: [{
        nombre: 'H',
        celdas: [
          { ref: 'A1', formula: 'A2+1' },
          { ref: 'A2', formula: 'A1+1' },
        ],
      }],
    });

    expect(inf.profundidad).toBeGreaterThanOrEqual(1);
  });

  it('aguanta una cadena larga sin desbordar la pila', () => {
    // El recorrido es iterativo justamente por esto: 20.000 fórmulas
    // encadenadas es algo normal en un presupuesto por filas.
    const celdas: CeldaFixture[] = [{ ref: 'A1', valor: '1' }];
    for (let f = 2; f <= 20000; f++) celdas.push({ ref: `A${f}`, formula: `A${f - 1}*1.01` });

    const inf = escanear({ hojas: [{ nombre: 'H', celdas }] });
    expect(inf.profundidad).toBe(19998);
  });
});
