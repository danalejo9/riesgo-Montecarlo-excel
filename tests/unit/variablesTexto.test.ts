/**
 * Variables de texto (T1, T2, T6): una entrada que vale «Norte», «Sur» o
 * «Este» con sus probabilidades, fórmulas del libro que la usan, y salidas
 * de texto y de sí/no contadas por frecuencia.
 */
import { describe, expect, it } from 'vitest';

import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { modeloVacio, prepararEntradas, problemaDeDistribucion, resumirDistribucion } from '../../engine/modelo/index.ts';
import { establecerRegional, regionalDesdeIdioma, restablecerRegional } from '../../engine/values/regional.ts';

const H = 'Hoja1';
const k = (ref: string) => claveDeReferencia(H, ref);

function celdas(formulas: Record<string, string>): FormulaCelda[] {
  return Object.entries(formulas).map(([ref, formula]) => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    const col = [...(m[1] as string)].reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
    return { hoja: H, col, fila: Number(m[2]), formula };
  });
}

async function simular(n = 20_000, retener = 0) {
  const f = celdas({
    A1: '"Norte"',
    B1: 'IF(A1="Norte",100,IF(A1="Sur",60,20))', // numérica que depende del texto
    C1: 'A1&" (zona)"',                          // salida de texto
    D1: 'B1>50',                                 // salida de sí/no
  });
  const { grafo } = construirGrafo(f);
  const m = modeloVacio();
  m.inputs.push({
    id: 'in_z', name: 'Zona', ref: 'A1',
    dist: { type: 'categorical', categories: ['Norte', 'Sur', 'Este'], weights: [2, 5, 3] },
    correlations: [],
  });
  m.settings.iterations = n;
  const prep = prepararEntradas(m, (ref) => k(ref), 11);
  if (!prep.ok) throw new Error(prep.errores.join());
  const c = compilarPlan(grafo, new Set([k('A1')]), [k('B1'), k('C1'), k('D1')]);
  if (!c.ok) throw new Error(c.error.motivo);
  const r = await simularPorBloques(grafo, c.plan, prep.entradas, 11, n, { retenerMuestra: retener, bloquesMinimos: 16 });
  if (!r.ok) throw new Error(r.error.motivo);
  return r;
}

describe('entradas de texto (T1)', () => {
  it('la distribución categórica se valida y se resume', () => {
    expect(problemaDeDistribucion({ type: 'categorical', categories: ['A', 'B'], weights: [1, 1] })).toBeNull();
    expect(problemaDeDistribucion({ type: 'categorical', categories: ['A', 'A'], weights: [1, 1] })).toMatch(/repetidas/);
    expect(problemaDeDistribucion({ type: 'categorical', categories: ['A', 'B'], weights: [1] })).toMatch(/un peso por categoría/);
    expect(resumirDistribucion({ type: 'categorical', categories: ['Norte', 'Sur'], weights: [1, 1] })).toBe('Categórica (Norte, Sur)');
  });

  it('el libro calcula con el texto: la media de la numérica sigue las probabilidades', async () => {
    const r = await simular();
    // 0,2·100 + 0,5·60 + 0,3·20 = 56
    expect(r.porSalida.get(k('B1'))?.welford.media).toBeCloseTo(56, 0);
  });

  it('no se puede correlacionar una entrada de texto', () => {
    const m = modeloVacio();
    m.inputs.push(
      { id: 'a', name: 'Zona', ref: 'A1', dist: { type: 'categorical', categories: ['N', 'S'], weights: [1, 1] }, correlations: [{ with: 'b', coefficient: 0.5 }] },
      { id: 'b', name: 'Precio', ref: 'A2', dist: { type: 'normal', mean: 1, stdDev: 1 }, correlations: [{ with: 'a', coefficient: 0.5 }] },
    );
    const p = prepararEntradas(m, (ref) => k(ref), 1);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.errores[0]).toMatch(/entrada de texto/);
  });
});

describe('salidas de texto y de sí/no (T2, T6)', () => {
  it('frecuencias de la salida de texto', async () => {
    const r = await simular();
    const c = r.porSalida.get(k('C1'));
    const total = Object.values(c?.categorias ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBe(20_000);
    expect((c?.categorias?.['Sur (zona)'] ?? 0) / total).toBeCloseTo(0.5, 1);
    expect((c?.categorias?.['Norte (zona)'] ?? 0) / total).toBeCloseTo(0.2, 1);
    expect(c?.noNumericas).toBe(20_000); // no son números: fuera de media y percentiles
  });

  it('la de sí/no cuenta como categoría y como 1/0 (su media es la probabilidad)', async () => {
    establecerRegional(regionalDesdeIdioma('es-ES', { decimal: ',', miles: '.' }));
    try {
      const r = await simular();
      const d = r.porSalida.get(k('D1'));
      // VERDADERO cuando B1 > 50: Norte y Sur, 0,7.
      expect(d?.welford.media).toBeCloseTo(0.7, 1);
      const total = Object.values(d?.categorias ?? {}).reduce((a, b) => a + b, 0);
      expect((d?.categorias?.['VERDADERO'] ?? 0) / total).toBeCloseTo(0.7, 1);
    } finally {
      restablecerRegional();
    }
  });

  it('retiene el valor de texto de cada iteración, alineado con la muestra', async () => {
    const r = await simular(5_000, 1_000);
    const c = r.porSalida.get(k('C1'));
    const b = r.porSalida.get(k('B1'));
    expect(c?.muestraTexto).toHaveLength(1_000);
    for (let i = 0; i < 1_000; i++) {
      const esperado = { 'Norte (zona)': 100, 'Sur (zona)': 60, 'Este (zona)': 20 }[c?.muestraTexto?.[i] as string];
      expect(b?.muestra?.[i]).toBe(esperado);
    }
  });

  it('una salida numérica no lleva recuento de categorías', async () => {
    const r = await simular();
    expect(r.porSalida.get(k('B1'))?.categorias).toBeUndefined();
  });
});

describe('análisis de texto (T3)', async () => {
  const { analisisDeTexto, esSalidaDeTexto, probabilidadDeValor, frecuenciasDe } = await import('../../excel/analisisTexto.ts');
  const { lecturaDeTexto } = await import('../../excel/lectura.ts');

  // Precio (numérico) decide la zona: con precio alto sale «Caro».
  const n = 2_000;
  const precio = Float64Array.from({ length: n }, (_, i) => i);
  const zonaIdx = Float64Array.from({ length: n }, (_, i) => i % 3);
  const texto = Array.from({ length: n }, (_, i) => (i >= n / 2 ? 'Caro' : 'Barato'));
  const ventas = Float64Array.from({ length: n }, (_, i) => [100, 60, 20][i % 3] as number);
  const m = modeloVacio();
  m.inputs.push(
    { id: 'p', name: 'Precio', ref: 'A1', dist: { type: 'uniform', min: 0, max: 1 }, correlations: [] },
    { id: 'z', name: 'Zona', ref: 'A2', dist: { type: 'categorical', categories: ['Norte', 'Sur', 'Este'], weights: [1, 1, 1] }, correlations: [] },
  );
  const muestras = new Map<string, ArrayLike<number>>([['A1', precio], ['A2', zonaIdx]]);

  it('frecuencias, qué entradas deciden y lectura en palabras', () => {
    const a = analisisDeTexto(m, ['A1', 'A2'], muestras, { categorias: { Caro: 1000, Barato: 1000 }, muestraTexto: texto });
    expect(a.categorias?.map((c) => c.valor).sort()).toEqual(['Barato', 'Caro']);
    const caro = a.decisivas?.find((d) => d.valor === 'Caro');
    expect(caro?.filas[0]?.nombre).toBe('Precio'); // la de texto no entra
    expect(caro?.filas[0]?.bajo).toBe(0);
    expect(caro?.filas[0]?.alto).toBe(1);
    const frases = lecturaDeTexto({ nombre: 'Gama', categorias: a.categorias ?? [], valorDeInteres: 'Caro', decisivas: a.decisivas ?? [] });
    expect(frases.join(' ')).toContain('Lo que más decide que salga «Caro» es Precio');
  });

  it('cruce: la salida numérica en cada categoría de la entrada de texto', () => {
    const a = analisisDeTexto(m, ['A1', 'A2'], muestras, { muestra: ventas });
    const zona = a.porCategoria?.find((x) => x.nombre === 'Zona');
    expect(zona?.filas.map((f) => [f.categoria, f.media])).toEqual([['Norte', 100], ['Sur', 60], ['Este', 20]]);
    expect(zona?.filas[0]?.proporcion).toBeCloseTo(1 / 3, 2);
  });

  it('salida de texto frente a numérica con algún texto; probabilidad de un valor', () => {
    const f = frecuenciasDe({ Sí: 70, No: 30 });
    expect(esSalidaDeTexto({ categorias: f, resumen: { n: 100 } })).toBe(true);
    expect(esSalidaDeTexto({ categorias: [{ valor: 'x', conteo: 3, proporcion: 1 }], resumen: { n: 100 } })).toBe(false);
    expect(probabilidadDeValor(f, 'No')).toBe(0.3);
    expect(probabilidadDeValor(f, 'Quizá')).toBe(0);
  });
});

describe('modo compatible con textos (T1, T2, T6)', async () => {
  const { simularCompatible } = await import('../../engine/compatible/index.ts');

  it('cuenta textos y lógicos de las salidas, y los lógicos también como 1/0', async () => {
    let i = 0;
    const libro = {
      async calcularIteracion(v: readonly number[]) {
        i++;
        const zona = ['Norte', 'Sur'][Math.round(v[0] as number)] as string;
        return [zona, zona === 'Norte', 7] as const;
      },
    };
    const muestras = Float64Array.from({ length: 100 }, (_, k) => (k < 30 ? 0 : 1));
    const r = await simularCompatible({
      libro, entradas: [{ direccion: 'A1', muestras, categorias: ['Norte', 'Sur'] }], salidas: ['B1', 'C1', 'D1'], iteraciones: 100, retenerMuestra: 50,
    });
    if (!r.ok) throw new Error(r.error.motivo);
    expect(i).toBe(100);
    expect(r.porSalida.get('B1')?.categorias).toEqual({ Norte: 30, Sur: 70 });
    expect(r.porSalida.get('B1')?.noNumericas).toBe(100);
    expect(r.porSalida.get('B1')?.muestraTexto?.slice(28, 32)).toEqual(['Norte', 'Norte', 'Sur', 'Sur']);
    expect(r.porSalida.get('C1')?.welford.media).toBeCloseTo(0.3, 10);
    expect(Object.values(r.porSalida.get('C1')?.categorias ?? {}).reduce((a, b) => a + b, 0)).toBe(100);
    expect(r.porSalida.get('D1')?.categorias).toBeUndefined();
  });
});

describe('RIESGO.CATEGORIA (T4)', async () => {
  const { leerFuncionRiesgo } = await import('../../engine/modelo/index.ts');
  const { lectorDeLibro } = await import('../../excel/lectorRangos.ts');
  const { planificarCompartir } = await import('../../excel/compartirPuro.ts');
  const { metadatosFunciones } = await import('../../engine/modelo/metadatosFunciones.ts');

  it('con listas escritas en la fórmula; fuera de la simulación, el más probable', () => {
    const r = leerFuncionRiesgo('=RIESGO.CATEGORIA({"Norte";"Sur";"Este"},{20;50;30})') // como la guarda Excel: comas entre argumentos;
    expect(r).toMatchObject({ ok: true, id: 'CATEGORIA', media: 'Sur', spec: { type: 'categorical', categories: ['Norte', 'Sur', 'Este'], weights: [20, 50, 30] } });
  });

  it('con rangos de la hoja, leídos del libro', () => {
    const valores = [
      { hoja: 'Pruebas', col: 5, fila: 13, tipo: 'texto' as const, texto: 'Norte' },
      { hoja: 'Pruebas', col: 5, fila: 14, tipo: 'texto' as const, texto: 'Sur' },
      { hoja: 'Pruebas', col: 6, fila: 13, tipo: 'numero' as const, numero: 0.3 },
      { hoja: 'Pruebas', col: 6, fila: 14, tipo: 'numero' as const, numero: 0.7 },
    ];
    const r = leerFuncionRiesgo('RIESGO.CATEGORIA(E13:E14,F13:F14)', lectorDeLibro(valores, 'Pruebas'));
    expect(r).toMatchObject({ ok: true, media: 'Sur', spec: { categories: ['Norte', 'Sur'], weights: [0.3, 0.7] } });
    // Preparar para compartir deja en la celda el texto más probable.
    const plan = planificarCompartir([{ hoja: 'Pruebas', col: 3, fila: 16, formula: 'RIESGO.CATEGORIA(E13:E14,F13:F14)' }], valores);
    expect(plan.conversiones[0]?.valorBase).toBe('Sur');
  });

  it('errores claros', () => {
    expect(leerFuncionRiesgo('RIESGO.CATEGORIA({"A";"B"},{1})')).toMatchObject({ ok: false });
    expect(leerFuncionRiesgo('RIESGO.CATEGORIA(E1:E2,F1:F2)')).toMatchObject({ ok: false }); // sin libro no hay rangos
  });

  it('va en los metadatos de las funciones de Excel, devolviendo texto', () => {
    const f = (metadatosFunciones() as { functions: { id: string; result: { type: string } }[] }).functions.find((x) => x.id === 'CATEGORIA');
    expect(f?.result.type).toBe('string');
  });
});
