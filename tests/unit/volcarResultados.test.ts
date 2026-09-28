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

    // Los datos del gráfico van en su zona, a la derecha del cuerpo (C8).
    const grafico = informe.graficos.find((g) => g.tipo === 'linea');
    const col = grafico?.datos.col as number;
    const cabecera = informe.filas[curva?.filaInicio as number]?.slice(col, col + 2);
    expect(cabecera).toEqual(['Valor', 'Probabilidad acumulada']);
    expect(informe.filas[(curva?.filaInicio as number) + 1]?.slice(col, col + 2)).toEqual([-1178777, 0.005]);
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

  it('la sensibilidad de cada salida va a la hoja, con la muestra usada', () => {
    const conSensibilidad: SimulacionCompletada = {
      ...RESULTADO,
      muestraSensibilidad: 10_000,
      salidas: RESULTADO.salidas.map((s) => ({
        ...s,
        sensibilidad: [
          { id: 'in_precio', nombre: 'Precio', ref: 'Modelo!C5', spearman: 0.81, peso: 0.7 },
          { id: 'in_coste', nombre: 'Coste', ref: 'Modelo!C6', spearman: -0.52, peso: 0.3 },
        ],
      })),
    };
    const texto = construirInforme(MODELO, conSensibilidad).filas.map((f) => f.join('\t')).join('\n');
    expect(texto).toContain('Qué la mueve: entrada\tCelda\tSpearman (ρ)');
    expect(texto).toContain('Precio\tModelo!C5\t0.81\t0.7');
    expect(texto).toContain('Coste\tModelo!C6\t-0.52\t0.3');
    expect(texto).toContain('sobre 10000 iteraciones');
  });

  it('sin sensibilidad no escribe una tabla vacía', () => {
    expect(comoTexto()).not.toContain('Qué la mueve');
  });

  it('escribe el histograma y el umbral guardado en el modelo', () => {
    const modelo = { ...MODELO, outputs: MODELO.outputs.map((o) => ({ ...o, threshold: { value: 0, direction: 'below' as const } })) };
    const resultado: SimulacionCompletada = {
      ...RESULTADO,
      salidas: RESULTADO.salidas.map((s) => ({
        ...s,
        muestraOrdenada: Float64Array.from([-2, -1, 1, 2]),
        histograma: [{ x0: -2, x1: 0, count: 2 }, { x0: 0, x1: 2, count: 2 }],
      })),
    };
    const informe = construirInforme(modelo, resultado);
    const texto = informe.filas.map((f) => f.join('\t')).join('\n');
    expect(texto).toContain('P(VAN < 0)\t0.5');
    expect(texto).toContain('Histograma: desde\tHasta\tTramo\tIteraciones');
    expect(texto).toContain('-2\t0\t-2 a 0\t2');
    expect(informe.histogramas).toEqual([{ nombre: 'VAN', filaInicio: expect.any(Number), barras: 3 }]);
  });

  it('los números llevan el formato de su celda de origen, o uno razonable (C8)', () => {
    const conFormato = construirInforme(MODELO, RESULTADO, { formatoDe: () => '#,##0 "€"' });
    expect(conFormato.formatos.some((f) => f.formato === '#,##0 "€"')).toBe(true);
    const sinFormato = construirInforme(MODELO, RESULTADO, { formatoDe: () => 'General' });
    expect(sinFormato.formatos.some((f) => f.formato === '#,##0')).toBe(true);
    // Una TIR sin formato conocido va en porcentaje.
    const tir = { ...RESULTADO, salidas: RESULTADO.salidas.map((x) => ({ ...x, nombre: 'TIR del proyecto', resumen: { ...x.resumen, media: 0.2, min: -0.4, max: 0.6 } })) };
    expect(construirInforme(MODELO, tir).formatos.some((f) => f.formato === '0.0%')).toBe(true);
  });

  it('una salida constante ocupa una línea, sin gráficos ni sensibilidad en cero (C8)', () => {
    const constante: SimulacionCompletada = {
      ...RESULTADO,
      eleccion: { ...RESULTADO.eleccion, salidasConstantes: ['Modelo!C32'] },
    };
    const informe = construirInforme(MODELO, constante);
    expect(informe.graficos).toHaveLength(0);
    expect(informe.filas.map((f) => f.join('\t')).join('\n')).toContain('Valor (no depende de ninguna entrada)');
  });

  it('los gráficos van a la derecha del cuerpo y no encima de sus datos', () => {
    const informe = construirInforme(MODELO, RESULTADO);
    for (const g of informe.graficos) {
      expect(g.desde.col).toBeGreaterThanOrEqual(6);
      expect(g.hasta.col).toBeLessThan(g.datos.col);
    }
    expect(informe.anchos[0]).toBeLessThanOrEqual(40);
  });
});
