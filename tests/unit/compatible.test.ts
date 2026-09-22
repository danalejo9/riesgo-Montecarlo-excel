/**
 * El modo compatible se prueba **sin Excel**: `LibroCalculable` existe
 * precisamente para eso. Los libros de mentira de aquí abajo hacen lo que
 * hará Office.js —recibir entradas, "calcular", devolver salidas— y permiten
 * comprobar el bucle, la cancelación, el ritmo medido y el conteo de
 * iteraciones no numéricas en milisegundos y en cualquier máquina.
 */
import { describe, expect, it } from 'vitest';

import { convieneAvisar, medirRitmo, simularCompatible, tiempoEstimado } from '../../engine/compatible/index.ts';
import type { EntradaCompatible, LibroCalculable } from '../../engine/compatible/index.ts';
import { cuantilTDigest } from '../../engine/stats/tdigest.ts';

function entrada(direccion: string, valores: number[]): EntradaCompatible {
  return { direccion, muestras: Float64Array.from(valores) };
}

/** Un libro que aplica `formula` a las entradas de cada iteración. */
function libroDe(formula: (v: readonly number[]) => number[]): LibroCalculable & { llamadas: number } {
  return {
    llamadas: 0,
    async calcularIteracion(v) {
      this.llamadas += 1;
      // Se copia: el bucle reutiliza el mismo array de entrada en cada
      // iteración, y un adaptador que se lo quedara vería basura después.
      return formula([...v]);
    },
  };
}

describe('simularCompatible', () => {
  it('recorre todas las iteraciones y acumula estadísticas por salida', async () => {
    const libro = libroDe(([x]) => [(x as number) * 2, (x as number) + 100]);

    const r = await simularCompatible({
      libro,
      entradas: [entrada('Hoja1!A1', [1, 2, 3, 4])],
      salidas: ['Hoja1!B1', 'Hoja1!B2'],
      iteraciones: 4,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(libro.llamadas).toBe(4);
    expect(r.iteracionesCompletadas).toBe(4);
    expect(r.cancelada).toBe(false);

    const b1 = r.porSalida.get('Hoja1!B1');
    expect(b1?.welford.n).toBe(4);
    expect(b1?.welford.media).toBeCloseTo(5, 12); // media de 2,4,6,8
    expect(b1?.welford.min).toBe(2);
    expect(b1?.welford.max).toBe(8);
    expect(b1?.noNumericas).toBe(0);

    expect(r.porSalida.get('Hoja1!B2')?.welford.media).toBeCloseTo(102.5, 12);
  });

  it('escribe en cada iteración la muestra que le corresponde, por entrada', async () => {
    const vistas: number[][] = [];
    const libro: LibroCalculable = {
      async calcularIteracion(v) {
        vistas.push([...v]);
        return [0];
      },
    };

    await simularCompatible({
      libro,
      entradas: [entrada('A1', [10, 20, 30]), entrada('A2', [-1, -2, -3])],
      salidas: ['B1'],
      iteraciones: 3,
    });

    expect(vistas).toEqual([
      [10, -1],
      [20, -2],
      [30, -3],
    ]);
  });

  it('cuenta las iteraciones no numéricas en vez de envenenar las estadísticas', async () => {
    // Una salida que "da error" en dos de cinco iteraciones, como haría una
    // celda con #¡DIV/0! que el adaptador no puede convertir a número.
    const libro = libroDe(([x]) => [(x as number) === 3 || (x as number) === 5 ? NaN : (x as number)]);

    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', [1, 2, 3, 4, 5])],
      salidas: ['B1'],
      iteraciones: 5,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.porSalida.get('B1');
    expect(s?.noNumericas).toBe(2);
    expect(s?.welford.n).toBe(3);
    expect(s?.welford.media).toBeCloseTo((1 + 2 + 4) / 3, 12);
    expect(Number.isNaN(s?.welford.media as number)).toBe(false);
  });

  it('un infinito también cuenta como no numérico', async () => {
    const libro = libroDe(() => [Infinity]);
    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', [1, 2])],
      salidas: ['B1'],
      iteraciones: 2,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.porSalida.get('B1')?.noNumericas).toBe(2);
    expect(r.porSalida.get('B1')?.welford.n).toBe(0);
  });

  it('cancela a mitad y devuelve lo acumulado hasta ahí', async () => {
    let hechas = 0;
    const libro: LibroCalculable = {
      async calcularIteracion(v) {
        hechas += 1;
        return [v[0] as number];
      },
    };

    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', Array.from({ length: 100 }, (_, i) => i))],
      salidas: ['B1'],
      iteraciones: 100,
      cadaCuantas: 1,
      debeCancelar: () => hechas >= 10,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cancelada).toBe(true);
    expect(r.iteracionesCompletadas).toBe(10);
    expect(r.porSalida.get('B1')?.welford.n).toBe(10);
    expect(r.porSalida.get('B1')?.welford.max).toBe(9);
  });

  it('informa del progreso con un ritmo medido, no supuesto', async () => {
    const avances: Array<{ completadas: number; totales: number; ips: number }> = [];
    const libro = libroDe(([x]) => [x as number]);

    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', Array.from({ length: 50 }, (_, i) => i))],
      salidas: ['B1'],
      iteraciones: 50,
      cadaCuantas: 10,
      progreso: (a) => avances.push({ completadas: a.completadas, totales: a.totales, ips: a.iteracionesPorSegundo }),
    });

    expect(r.ok).toBe(true);
    // Cinco avisos durante el bucle (0, 10, 20, 30, 40) y uno final.
    expect(avances.map((a) => a.completadas)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(avances.every((a) => a.totales === 50)).toBe(true);
    // El primero no tiene con qué medir todavía: 0 es honesto, no un ritmo inventado.
    expect(avances[0]?.ips).toBe(0);
    expect(avances[avances.length - 1]?.ips).toBeGreaterThan(0);
  });

  it('el t-digest cubre el recorrido completo aunque se construya por tramos', async () => {
    // Más de 4096 iteraciones fuerza el cierre de al menos un tramo interno.
    const n = 10_000;
    const libro = libroDe(([x]) => [x as number]);

    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', Array.from({ length: n }, (_, i) => i + 1))],
      salidas: ['B1'],
      iteraciones: n,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.porSalida.get('B1');
    expect(s?.welford.n).toBe(n);
    expect(s?.welford.min).toBe(1);
    expect(s?.welford.max).toBe(n);
    expect(s?.digest.pesoTotal).toBe(n);
    // Mediana de 1..10000 = 5000,5; el t-digest es aproximado, no exacto.
    expect(cuantilTDigest(s?.digest as never, 0.5)).toBeCloseTo(5000.5, -2);
  });

  it('un fallo del libro corta y dice en qué iteración', async () => {
    let i = 0;
    const libro: LibroCalculable = {
      async calcularIteracion() {
        if (i++ === 3) throw new Error('RichApi.Error: la hoja no existe');
        return [1];
      },
    };

    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', [1, 2, 3, 4, 5])],
      salidas: ['B1'],
      iteraciones: 5,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.iteracion).toBe(3);
    expect(r.error.motivo).toContain('la hoja no existe');
  });

  it('un libro que devuelve menos salidas de las declaradas es un error, no un hueco', async () => {
    const libro = libroDe(() => [1]);

    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', [1])],
      salidas: ['B1', 'B2'],
      iteraciones: 1,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.motivo).toContain('se esperaban 2');
  });

  it('cero iteraciones no es un fallo: da salidas vacías', async () => {
    const libro = libroDe(() => [1]);
    const r = await simularCompatible({
      libro,
      entradas: [entrada('A1', [])],
      salidas: ['B1'],
      iteraciones: 0,
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.iteracionesCompletadas).toBe(0);
    expect(r.porSalida.get('B1')?.welford.n).toBe(0);
    expect(r.iteracionesPorSegundo).toBe(0);
  });
});

describe('medirRitmo', () => {
  it('corre iteraciones de verdad y sus resultados no cuentan', async () => {
    const libro = libroDe(([x]) => [x as number]);

    const medida = await medirRitmo(libro, [entrada('A1', [1, 2, 3])], 3);
    expect(libro.llamadas).toBe(3);
    expect(medida.iteracionesPorSegundo).toBeGreaterThan(0);
    expect(medida.msPorIteracion).toBeGreaterThanOrEqual(0);
  });

  it('da la vuelta a las muestras si se piden más pruebas que muestras hay', async () => {
    const vistas: number[] = [];
    const libro: LibroCalculable = {
      async calcularIteracion(v) {
        vistas.push(v[0] as number);
        return [0];
      },
    };

    await medirRitmo(libro, [entrada('A1', [7, 8])], 5);
    expect(vistas).toEqual([7, 8, 7, 8, 7]);
  });
});

describe('tiempoEstimado', () => {
  it('segundos, minutos y horas según la escala', () => {
    expect(tiempoEstimado(100, 500)).toBe('5 s');
    expect(tiempoEstimado(10, 1_200)).toBe('2 min');
    expect(tiempoEstimado(10, 36_000)).toBe('1 h');
    expect(tiempoEstimado(10, 54_000)).toBe('1 h 30 min');
  });

  it('nunca dice "0 s" de algo que va a tardar', () => {
    expect(tiempoEstimado(1000, 1)).toBe('1 s');
  });

  it('sin ritmo medido dice que no lo sabe, en vez de inventarlo', () => {
    expect(tiempoEstimado(0, 1000)).toBe('desconocido');
    expect(tiempoEstimado(100, 0)).toBe('desconocido');
  });

  it('el caso que motiva todo esto: un millón de iteraciones en modo compatible', () => {
    // ~93 iteraciones/s es el orden de magnitud que midió la auditoría.
    expect(tiempoEstimado(93, 1_000_000)).toBe('2 h 59 min');
    expect(convieneAvisar(93, 1_000_000)).toBe(true);
  });

  it('no avisa de una espera corta', () => {
    expect(convieneAvisar(100, 1_000)).toBe(false);
    expect(convieneAvisar(0, 1_000)).toBe(false);
  });
});
