/**
 * Las fórmulas que «Rellenar las hojas de prueba» escribe: el motor las
 * entiende, van a las celdas amarillas del generador y no pisan nada escrito.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parsear } from '../../engine/parser/index.ts';
import { FORMULAS_DE_PRUEBA, yaEscritas } from '../../excel/hojasPrueba.ts';

const generador = readFileSync(fileURLToPath(new URL('../../ejemplos/generar-demo.py', import.meta.url)), 'utf-8');

describe('hojas de prueba', () => {
  it('cada fórmula se entiende', () => {
    for (const f of FORMULAS_DE_PRUEBA) {
      const r = parsear(f.formula.slice(1));
      expect(r.ok, `${f.hoja}!${f.celda}`).toBe(true);
      if (r.ok) expect(r.ast.tipo, `${f.hoja}!${f.celda}`).not.toBe('no-soportado');
    }
  });

  it('cada fila de «Pruebas» es una de las que el generador deja para escribir', () => {
    for (const f of FORMULAS_DE_PRUEBA.filter((x) => x.hoja === 'Pruebas' && x.celda !== 'H13')) {
      const fila = Number(f.celda.slice(1));
      expect(generador, f.celda).toMatch(new RegExp(`\\(${fila},[^\\n]*escribe =`));
    }
    expect(generador).toContain('escribe =RIESGO.CATEGORIA(E5:E7;F5:F7)');
  });

  it('no pisa lo que ya está escrito', () => {
    const escritas = yaEscritas(FORMULAS_DE_PRUEBA, (h, c) => (h === 'Pruebas' && c === 'C5' ? '=RIESGO.NORMAL(1,1)' : ''));
    expect(escritas.map((f) => f.celda)).toEqual(['C5']);
  });
});
