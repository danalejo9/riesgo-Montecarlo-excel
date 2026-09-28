/**
 * B6: RIESGO.MEDIA, DESV, PERCENTIL, PROB, MIN y MAX — el almacén que publica
 * el panel, el cálculo de cada función y su sustitución en el grafo.
 */
import { describe, expect, it } from 'vitest';

import { claveDeReferencia, construirGrafo, type FormulaCelda, type ValorCelda } from '../../engine/graph/index.ts';
import { elegirMotor } from '../../engine/modelo/index.ts';
import { metadatosFunciones } from '../../engine/modelo/metadatosFunciones.ts';
import { evaluarModelo } from '../../engine/compiler/evaluate.ts';
import { NUMERO, numeroEn, tipoEn, errorEn } from '../../engine/values/columna.ts';
import type { SimulacionCompletada, ResultadoSalida } from '../../excel/informe.ts';
import {
  buscarSalida, construirAlmacen, cuantil, leerAlmacen, normalizarDireccion, probabilidadHasta, valorFuncionResultado,
} from '../../excel/resultadosEnHoja.ts';
import { celdasConFuncionesResultado, sustituirFuncionesResultado } from '../../excel/resultadosEnGrafo.ts';

/** Una salida con la muestra 1, 2, …, 1000 (media 500,5). */
function salidaNumerica(ref: string, clave: string): ResultadoSalida {
  const muestra = Float64Array.from({ length: 1000 }, (_, i) => i + 1);
  return {
    id: 's1', nombre: 'VAN al 11 %', ref, clave,
    resumen: { n: 1000, media: 500.5, desviacion: 288.67, min: 1, max: 1000, percentiles: {}, percentilesAproximados: true },
    cdf: [], noNumericas: 0, muestraOrdenada: muestra,
  } as ResultadoSalida;
}

function salidaTexto(): ResultadoSalida {
  return {
    id: 's2', nombre: 'Gama', ref: 'Zonas!C9', clave: 'Zonas!C9',
    resumen: { n: 0, media: NaN, desviacion: NaN, min: Infinity, max: -Infinity, percentiles: {}, percentilesAproximados: true },
    cdf: [], noNumericas: 1000,
    categorias: [{ valor: 'Media', conteo: 710, proporcion: 0.71 }, { valor: 'Baja', conteo: 170, proporcion: 0.17 }, { valor: 'Alta', conteo: 120, proporcion: 0.12 }],
  } as unknown as ResultadoSalida;
}

const simulacion = { ok: true, salidas: [salidaNumerica('VAN', 'Modelo!C32'), salidaTexto()] } as unknown as SimulacionCompletada;
const almacen = construirAlmacen(simulacion, new Date('2026-09-28T12:00:00Z'));

describe('normalizarDireccion', () => {
  it('quita libro, comillas y $ y pasa a mayúsculas', () => {
    expect(normalizarDireccion("'Mi hoja'!$C$5")).toBe('MI HOJA!C5');
    expect(normalizarDireccion('[Libro1]Modelo!C32')).toBe('MODELO!C32');
    expect(normalizarDireccion("'[Libro 1.xlsx]Mi hoja'!C5")).toBe('MI HOJA!C5');
    expect(normalizarDireccion("'O''Brien'!A1")).toBe("O'BRIEN!A1");
    expect(normalizarDireccion('c32')).toBe('C32');
  });
});

describe('el almacén', () => {
  it('guarda cada salida por su celda y por su referencia, y se vuelve a leer', () => {
    expect(Object.keys(almacen.salidas).sort()).toEqual(['MODELO!C32', 'VAN', 'ZONAS!C9']);
    expect(almacen.salidas['MODELO!C32']?.cuantiles).toHaveLength(1000);
    // En JSON, NaN (la media de la salida de texto) pasa a null.
    expect(leerAlmacen(JSON.stringify(almacen))).toEqual(JSON.parse(JSON.stringify(almacen)));
    expect(leerAlmacen('no es json')).toBeNull();
  });

  it('encuentra la salida por dirección, sin hoja si no hay duda, o por nombre', () => {
    expect(buscarSalida(almacen, '[Libro1]Modelo!$C$32')?.nombre).toBe('VAN al 11 %');
    expect(buscarSalida(almacen, 'C32')?.nombre).toBe('VAN al 11 %');
    expect(buscarSalida(almacen, undefined, 'van al 11 %')?.media).toBe(500.5);
    expect(buscarSalida(almacen, 'Modelo!Z99')).toBeNull();
    expect(buscarSalida(null, 'Modelo!C32')).toBeNull();
  });
});

describe('valorFuncionResultado', () => {
  const e = buscarSalida(almacen, 'Modelo!C32');
  const v = (id: string, ...args: unknown[]) => valorFuncionResultado(id, e, args);

  it('MEDIA, DESV, MIN y MAX', () => {
    expect(v('MEDIA')).toEqual({ ok: true, valor: 500.5 });
    expect(v('DESV')).toEqual({ ok: true, valor: 288.67 });
    expect(v('MIN')).toEqual({ ok: true, valor: 1 });
    expect(v('MAX')).toEqual({ ok: true, valor: 1000 });
  });

  it('PERCENTIL con p entre 0 y 1, o en tanto por ciento', () => {
    const p5 = v('PERCENTIL', 0.05);
    expect(p5.ok && p5.valor).toBeCloseTo(50.95, 1);
    expect(v('PERCENTIL', 5)).toEqual(p5);
    expect(v('PERCENTIL', 0)).toEqual({ ok: true, valor: 1 });
    expect(v('PERCENTIL', 1)).toEqual({ ok: true, valor: 1000 });
    expect(v('PERCENTIL', -1).ok).toBe(false);
    expect(v('PERCENTIL', 'hola').ok).toBe(false);
  });

  it('PROB por debajo y por encima de un umbral', () => {
    const debajo = v('PROB', 250);
    expect(debajo.ok && debajo.valor).toBeCloseTo(0.25, 2);
    const encima = v('PROB', 250, true);
    expect(encima.ok && encima.valor).toBeCloseTo(0.75, 2);
    expect(v('PROB', 0)).toEqual({ ok: true, valor: 0 });
    expect(v('PROB', 5000)).toEqual({ ok: true, valor: 1 });
  });

  it('en una salida de texto, PROB de un valor; MEDIA no tiene sentido', () => {
    const t = buscarSalida(almacen, 'Zonas!C9');
    expect(valorFuncionResultado('PROB', t, ['Alta'])).toEqual({ ok: true, valor: 0.12 });
    expect(valorFuncionResultado('PROB', t, ['alta', true])).toEqual({ ok: true, valor: 0.88 });
    expect(valorFuncionResultado('PROB', t, ['Otra'])).toEqual({ ok: true, valor: 0 });
    expect(valorFuncionResultado('MEDIA', t, [])).toMatchObject({ ok: false, error: 'valor' });
  });

  it('tras pasar por JSON, una salida de texto sigue reconociéndose', () => {
    const t = buscarSalida(leerAlmacen(JSON.stringify(almacen)), 'Zonas!C9');
    expect(valorFuncionResultado('MEDIA', t, [])).toMatchObject({ ok: false, error: 'valor' });
    expect(valorFuncionResultado('PROB', t, ['Media'])).toEqual({ ok: true, valor: 0.71 });
  });

  it('sin resultados de esa celda: #N/A con un mensaje que dice qué hacer', () => {
    expect(valorFuncionResultado('MEDIA', null, [])).toMatchObject({ ok: false, error: 'na', mensaje: expect.stringMatching(/simula/) });
  });

  it('cuantil y probabilidadHasta son inversas', () => {
    const q = [0, 10, 20, 30, 40];
    expect(cuantil(q, 0.3)).toBeCloseTo(12, 10);
    expect(probabilidadHasta(q, 12)).toBeCloseTo(0.3, 10);
  });
});

describe('en el grafo del motor', () => {
  const H = 'Modelo';
  const k = (r: string) => claveDeReferencia(H, r);
  const f = (ref: string, formula: string): FormulaCelda => {
    const m = /^([A-Z]+)([0-9]+)$/.exec(ref) as RegExpExecArray;
    return { hoja: H, col: (m[1] as string).charCodeAt(0) - 64, fila: Number(m[2]), formula };
  };

  it('una salida que usa RIESGO.MEDIA sigue en el motor rápido: la llamada vale lo de la simulación anterior', () => {
    const formulas = [f('C32', 'A1*2'), f('D1', 'C32-RIESGO.MEDIA(C32)'), f('D2', 'RIESGO.PERCENTIL(C32,0.05)')];
    const valores: ValorCelda[] = [{ hoja: H, col: 1, fila: 1, valor: { tipo: NUMERO, numero: 3 } }];
    const { grafo } = construirGrafo(formulas, valores);
    expect(elegirMotor(grafo, [k('A1')], [k('D1')]).motor).toBe('compatible');
    const celdas = celdasConFuncionesResultado(grafo);
    expect(celdas.sort()).toEqual([k('D1'), k('D2')]);
    sustituirFuncionesResultado(grafo, celdas, almacen);
    expect(elegirMotor(grafo, [k('A1')], [k('D1')]).motor).toBe('fast');
    const r = evaluarModelo(grafo, new Map(), [k('D1'), k('D2')], 1);
    if (!r.ok) throw new Error(r.error.motivo);
    expect(numeroEn(r.valores.get(k('D1'))!, 0)).toBeCloseTo(6 - 500.5, 10);
    expect(numeroEn(r.valores.get(k('D2'))!, 0)).toBeCloseTo(50.95, 1);
  });

  it('sin resultados publicados, la llamada es #N/A', () => {
    const { grafo } = construirGrafo([f('D1', 'RIESGO.MEDIA(C32)')]);
    sustituirFuncionesResultado(grafo, celdasConFuncionesResultado(grafo), null);
    const r = evaluarModelo(grafo, new Map(), [k('D1')], 1);
    if (!r.ok) throw new Error(r.error.motivo);
    const c = r.valores.get(k('D1'))!;
    expect(tipoEn(c, 0)).not.toBe(NUMERO);
    expect(errorEn(c, 0)).toBe('#N/A');
  });
});

describe('los metadatos para Excel', () => {
  it('las funciones de resultados piden la dirección de la celda', () => {
    const m = metadatosFunciones() as { functions: { id: string; options?: { requiresParameterAddresses?: boolean }; parameters: { optional?: boolean }[] }[] };
    const media = m.functions.find((x) => x.id === 'MEDIA');
    expect(media?.options?.requiresParameterAddresses).toBe(true);
    const prob = m.functions.find((x) => x.id === 'PROB');
    expect(prob?.parameters.map((p) => Boolean(p.optional))).toEqual([false, false, true]);
  });
});
