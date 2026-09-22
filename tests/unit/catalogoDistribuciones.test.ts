/**
 * El catálogo del escáner y el registro de funciones se separaron tres veces
 * en silencio, y cada vez el informe de compatibilidad mintió. Este test es
 * para que no vuelva a pasar con las distribuciones: si alguien añade una a
 * `DistributionSpec` y no la describe, el panel no sabría pintarla — y lo que
 * es peor, el usuario la elegiría de la lista y no vería ningún campo.
 */
import { describe, expect, it } from 'vitest';

import { construirDesdeDescriptor } from '../../engine/distributions/index.ts';
import {
  CATALOGO_DISTRIBUCIONES,
  describirDistribucion,
  resumirDistribucion,
} from '../../engine/modelo/catalogoDistribuciones.ts';
import { toDescriptor, type DistributionSpec } from '../../engine/modelo/distributionSchema.ts';

/**
 * La lista de tipos de `DistributionSpec`, escrita a mano porque un tipo de
 * TypeScript no existe en tiempo de ejecución. Es exactamente la clase de
 * lista que se queda atrás, así que el test de abajo la compara con el
 * catálogo **y** TypeScript la compara con el tipo: si falta una, no compila.
 */
const TIPOS: Array<DistributionSpec['type']> = [
  'normal',
  'lognormal',
  'uniform',
  'triangular',
  'pert',
  'beta',
  'gamma',
  'exponential',
  'weibull',
  'bernoulli',
  'binomial',
  'poisson',
  'discrete',
];

describe('catálogo de distribuciones', () => {
  it('describe todas las del esquema, y ninguna de más', () => {
    expect([...CATALOGO_DISTRIBUCIONES].map((d) => d.tipo).sort()).toEqual([...TIPOS].sort());
  });

  it('cada ejemplo por defecto es una distribución válida de verdad', () => {
    // No basta con que tenga la forma correcta: `construirDesdeDescriptor`
    // valida la semántica (min <= moda <= max, desviación > 0…), y un
    // ejemplo que no pase sería un error nada más elegir la distribución.
    for (const d of CATALOGO_DISTRIBUCIONES) {
      expect(() => construirDesdeDescriptor(toDescriptor(d.porDefecto)), d.nombre).not.toThrow();
    }
  });

  it('el ejemplo por defecto es del tipo que dice ser', () => {
    for (const d of CATALOGO_DISTRIBUCIONES) expect(d.porDefecto.type).toBe(d.tipo);
  });

  it('los parámetros descritos existen en el ejemplo por defecto', () => {
    for (const d of CATALOGO_DISTRIBUCIONES) {
      for (const p of d.parametros) {
        const valor = (d.porDefecto as unknown as Record<string, unknown>)[p.clave];
        // `lambda` de PERT es opcional y no está en el ejemplo: se admite.
        if (valor === undefined) continue;
        expect(typeof valor, `${d.nombre}.${p.clave}`).toBe('number');
      }
    }
  });

  it('todas tienen nombre y una frase de cuándo usarla', () => {
    for (const d of CATALOGO_DISTRIBUCIONES) {
      expect(d.nombre.length).toBeGreaterThan(0);
      expect(d.cuando.length).toBeGreaterThan(10);
    }
  });

  it('describirDistribucion encuentra cada tipo', () => {
    for (const tipo of TIPOS) expect(describirDistribucion(tipo)?.tipo).toBe(tipo);
  });
});

describe('resumirDistribucion', () => {
  it('cabe en una línea de la lista de entradas', () => {
    expect(resumirDistribucion({ type: 'triangular', min: 0, mode: 1, max: 2 })).toBe('Triangular(0; 1; 2)');
    expect(resumirDistribucion({ type: 'normal', mean: 100, stdDev: 15 })).toBe('Normal(100; 15)');
  });

  it('un parámetro opcional ausente no deja un hueco', () => {
    expect(resumirDistribucion({ type: 'pert', min: 0, mode: 1, max: 2 })).toBe('PERT(0; 1; 2)');
  });

  it('la discreta se resume por cuántos valores tiene, no listándolos', () => {
    expect(resumirDistribucion({ type: 'discrete', values: [1, 2, 3], weights: [1, 1, 1] })).toBe(
      'Discreta (3 valores)',
    );
  });
});
