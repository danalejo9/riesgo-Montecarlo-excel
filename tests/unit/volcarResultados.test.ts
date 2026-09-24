/**
 * El contenido del informe se prueba sin Excel porque `construirInforme` es
 * datos puros: la parte que toca Office.js solo escribe esas filas y les pone
 * formato.
 *
 * Lo que de verdad hay que garantizar aquí no es el aspecto, es que **el
 * informe se baste a sí mismo**: quien abra el libro dentro de un año tiene
 * que poder saber de dónde salieron esos números sin preguntarle a nadie. Por
 * eso se comprueba que estén el modelo, la semilla y el motor, y no solo los
 * resultados.
 */
import { describe, expect, it } from 'vitest';

import type { ModeloRiesgo } from '../../engine/modelo/index.ts';
import { construirInforme, type SimulacionCompletada } from '../../excel/informe.ts';

const MODELO: ModeloRiesgo = {
  schema: 1,
  inputs: [
    {
      id: 'in_a',
      name: 'Precio unitario',
      ref: 'Modelo!C5',
      dist: { type: 'triangular', min: 105, mode: 120, max: 140 },
      correlations: [{ with: 'in_b', coefficient: -0.5 }],
    },
    {
      id: 'in_b',
      name: 'Unidades',
      ref: 'Modelo!C6',
      dist: { type: 'normal', mean: 20000, stdDev: 1500 },
      correlations: [{ with: 'in_a', coefficient: -0.5 }],
    },
  ],
  outputs: [{ id: 'out_van', name: 'VAN', ref: 'Modelo!C32' }],
  settings: { iterations: 10_000, seed: 12345, sampling: 'monte-carlo', engine: 'auto' },
};

const RESULTADO: SimulacionCompletada = {
  ok: true,
  motor: 'fast',
  eleccion: { motor: 'fast', motivos: [], salidasConstantes: [], celdasDesconocidas: [], celdasNecesarias: 70 },
  iteracionesCompletadas: 10_000,
  cancelada: false,
  milisegundos: 394,
  lectura: {
    hojas: 2, hojasVisibles: 2, celdasRecorridas: 184, celdasConContenido: 184,
    formulas: 61, sincronizaciones: 2, milisegundos: 120,
  },
  salidas: [
    {
      id: 'out_van',
      nombre: 'VAN',
      ref: 'Modelo!C32',
      noNumericas: 12,
      resumen: {
        n: 9988, media: 260614, desviacion: 550065, min: -1794155, max: 2401483,
        percentiles: { p1: -1055720, p5: -664113, p50: 253345, p95: 1180684, p99: 1555828 },
        percentilesAproximados: true,
      },
      cdf: [
        { x: -1178777, p: 0.005 },
        { x: 253345, p: 0.5 },
        { x: 1689079, p: 0.995 },
      ],
    },
  ],
};

/** Todo el informe como un solo texto, para buscar dentro sin pelearse con índices. */
function comoTexto(): string {
  return construirInforme(MODELO, RESULTADO)
    .filas.map((f) => f.join('\t'))
    .join('\n');
}

describe('construirInforme', () => {
  it('deja constancia de cómo se calculó, no solo del resultado', () => {
    const texto = comoTexto();
    expect(texto).toContain('Rápido (en memoria)');
    expect(texto).toContain('12345'); // la semilla: sin ella no se puede reproducir
    expect(texto).toContain('Monte Carlo');
    expect(texto).toContain('10000');
  });

  it('incluye el modelo entero, con las distribuciones y las correlaciones', () => {
    const texto = comoTexto();
    expect(texto).toContain('Precio unitario');
    expect(texto).toContain('Modelo!C5');
    expect(texto).toContain('Triangular(105; 120; 140)');
    expect(texto).toContain('Normal(20000; 1500)');
    // La correlación, por el nombre de la otra entrada y no por su id interno.
    expect(texto).toContain('Unidades: -0.5');
    expect(texto).not.toContain('in_b: -0.5');
  });

  it('enseña los estadísticos y los percentiles de cada salida', () => {
    const texto = comoTexto();
    expect(texto).toContain('SALIDA: VAN (Modelo!C32)');
    expect(texto).toContain('260614');
    expect(texto).toContain('p95');
  });

  it('dice cuántas iteraciones no dieron número, en vez de callarlo', () => {
    const texto = comoTexto();
    expect(texto).toContain('Iteraciones sin valor numérico');
    expect(texto).toContain('12');
  });

  it('escribe la curva como datos, para que el gráfico sea de Excel', () => {
    const informe = construirInforme(MODELO, RESULTADO);
    expect(informe.curvas).toHaveLength(1);
    const curva = informe.curvas[0];
    expect(curva?.nombre).toBe('VAN');
    // La cabecera más los tres puntos.
    expect(curva?.puntos).toBe(4);

    const cabecera = informe.filas[curva?.filaInicio as number];
    expect(cabecera).toEqual(['Valor', 'Probabilidad acumulada']);
    expect(informe.filas[(curva?.filaInicio as number) + 1]).toEqual([-1178777, 0.005]);
  });

  it('las filas de título apuntan a filas que existen y tienen texto', () => {
    const informe = construirInforme(MODELO, RESULTADO);
    expect(informe.titulos.length).toBeGreaterThan(3);
    for (const i of informe.titulos) {
      expect(typeof informe.filas[i]?.[0]).toBe('string');
      expect(String(informe.filas[i]?.[0]).length).toBeGreaterThan(0);
    }
  });

  it('una simulación cancelada lo dice', () => {
    const informe = construirInforme(MODELO, { ...RESULTADO, cancelada: true });
    expect(informe.filas.map((f) => f.join(' ')).join('\n')).toContain('canceló');
  });

  it('con el motor compatible lo nombra, para que nadie compare peras con manzanas', () => {
    const informe = construirInforme(MODELO, { ...RESULTADO, motor: 'compatible' });
    expect(informe.filas.map((f) => f.join(' ')).join('\n')).toContain('Excel en el bucle');
  });
});
