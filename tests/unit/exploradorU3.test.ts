/**
 * U3.1 y U3.2: lo que enseña el explorador de distribución de cada celda, y
 * que la cinta y las acciones registradas coinciden.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { estadoMenuIteraciones, ITERACIONES_CINTA } from '../../excel/cinta.ts';
import { codificarJson, decodificarJson } from '../../excel/codificacion.ts';
import { CUANTILES_EXPLORADOR, estadisticasDe, vistaDeCelda, vistaPorDefecto } from '../../excel/explorador.ts';
import type { SimulacionCompletada } from '../../excel/informe.ts';

const muestra = Float64Array.from({ length: 10_000 }, (_, i) => i / 100); // 0 … 99,99, uniforme
const RESULTADO = {
  ok: true, motor: 'fast', iteracionesCompletadas: 10_000, cancelada: false, milisegundos: 10,
  eleccion: { motor: 'fast', motivos: [], salidasConstantes: [], celdasDesconocidas: [], celdasNecesarias: 3 },
  lectura: { hojas: 1, hojasVisibles: 1, celdasRecorridas: 3, celdasConContenido: 3, formulas: 1, sincronizaciones: 1, milisegundos: 1 },
  salidas: [
    { id: 'txt', nombre: 'Gama', ref: 'Hoja1!B9', noNumericas: 0, resumen: { n: 0, media: NaN, desviacion: NaN, min: NaN, max: NaN, percentiles: {}, percentilesAproximados: true }, cdf: [], categorias: [{ valor: 'Alta', conteo: 1, proporcion: 1 }] },
    {
      id: 'van', nombre: 'VAN', ref: 'Hoja1!$B$10', noNumericas: 0,
      resumen: { n: 10_000, media: 49.995, desviacion: 28.87, min: 0, max: 99.99, percentiles: { p50: 50 }, percentilesAproximados: true },
      cdf: [{ x: 0, p: 0 }, { x: 99.99, p: 1 }], histograma: [{ x0: 0, x1: 50, conteo: 5000 }, { x0: 50, x1: 100, conteo: 5000 }],
      muestraOrdenada: muestra,
    },
  ],
  entradas: [{
    id: 'in_p', nombre: 'Precio', ref: 'Hoja1!B2', distribucion: 'Uniforme(0; 100)', n: 10_000, media: 50, desviacion: 28.9, min: 0, max: 99.99,
    percentiles: { p5: 5, p50: 50, p95: 95 }, histograma: [{ x0: 0, x1: 100, conteo: 10_000 }], cdf: [],
  }],
  iteraciones: { n: 10_000, entradas: [{ id: 'in_p', nombre: 'Precio', ref: 'Hoja1!B2', valores: muestra }], salidas: [] },
} as unknown as SimulacionCompletada;

describe('explorador de distribución (U3.1)', () => {
  it('una salida: su histograma, sus estadísticas y una muestra corta para los delimitadores', () => {
    const r = vistaDeCelda('hoja1!b10', RESULTADO, new Map([['van', { value: 10, direction: 'below' as const }]]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vista).toMatchObject({ tipo: 'salida', titulo: 'VAN', umbral: { valor: 10, sentido: 'below' } });
    expect(r.vista.muestra.length).toBe(CUANTILES_EXPLORADOR);
    expect(r.vista.estadisticas.media).toBe(49.995);
    // p5 y p95 de una uniforme 0–100.
    expect(r.vista.estadisticas.percentiles[1]).toBeCloseTo(5, 0);
    expect(r.vista.estadisticas.percentiles[7]).toBeCloseTo(95, 0);
  });

  it('una entrada: lo que se muestreó, con su distribución en palabras y percentiles de la muestra', () => {
    const r = vistaDeCelda('Hoja1!B2', RESULTADO);
    expect(r.ok && r.vista.tipo).toBe('entrada');
    if (r.ok) {
      expect(r.vista.distribucion).toBe('Uniforme(0; 100)');
      expect(r.vista.estadisticas.percentiles).toHaveLength(9);
    }
  });

  it('lo que no se puede enseñar lo dice', () => {
    expect(vistaDeCelda('Hoja1!Z1', RESULTADO)).toMatchObject({ ok: false, motivo: expect.stringMatching(/no es una entrada ni una salida/) });
    expect(vistaDeCelda('Hoja1!B9', RESULTADO)).toMatchObject({ ok: false, motivo: expect.stringMatching(/texto/) });
    expect(vistaDeCelda('Hoja1!B2', null)).toMatchObject({ ok: false, motivo: expect.stringMatching(/simula/) });
  });

  it('sin celda que sirva, abre con la primera salida numérica', () => {
    const r = vistaPorDefecto(RESULTADO);
    expect(r.ok && r.vista.titulo).toBe('VAN');
  });

  it('estadísticas de una muestra', () => {
    const e = estadisticasDe(Float64Array.from([1, 2, 3, 4, 5]));
    expect(e).toMatchObject({ n: 5, media: 3, min: 1, max: 5 });
    expect(e.desviacion).toBeCloseTo(Math.sqrt(2.5), 12);
  });

  it('viaja en la URL, comprimida, y cabe', async () => {
    const r = vistaDeCelda('Hoja1!B10', RESULTADO);
    const codigo = await codificarJson(r.ok ? { vista: r.vista } : {});
    expect(codigo).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codigo.length).toBeLessThan(8000);
    expect(await decodificarJson(codigo)).toEqual(JSON.parse(JSON.stringify(r.ok ? { vista: r.vista } : {})));
  });
});

describe('la cinta reorganizada (U3.2)', () => {
  const manifiesto = readFileSync(resolve(__dirname, '../../manifest.xml'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const main = readFileSync(resolve(__dirname, '../../ui/main.tsx'), 'utf8');
  const acciones = readFileSync(resolve(__dirname, '../../ui/acciones.ts'), 'utf8');

  it('la opción activa del menú de iteraciones queda desactivada', () => {
    expect(estadoMenuIteraciones(10000)).toEqual(ITERACIONES_CINTA.map((k) => ({ id: `iter${k}`, enabled: k !== 10000 })));
    for (const k of ITERACIONES_CINTA) expect(manifiesto).toContain(`<Item id="iter${k}">`);
  });

  it('cada acción del manifiesto está registrada en el panel', () => {
    const funciones = [...manifiesto.matchAll(/<FunctionName>([^<]+)<\/FunctionName>/g)].map((m) => m[1] as string);
    expect(funciones.length).toBeGreaterThan(25);
    const registradas = (f: string) =>
      acciones.includes(`${f}:`) || main.includes(`${f}:`) ||
      (/^iteraciones\d+$/.test(f) && main.includes('`iteraciones${n}`')) ||
      (/^ejemplo[A-Z]/.test(f) && main.includes('`ejemplo${'));
    expect(funciones.filter((f) => !registradas(f))).toEqual([]);
  });

  it('los grupos, en orden', () => {
    const grupos = [...manifiesto.matchAll(/<Group id="([^"]+)">/g)].map((m) => m[1]);
    expect(grupos).toEqual(['GrupoPrincipal', 'GrupoAcciones', 'GrupoSimulacion', 'GrupoModo', 'GrupoAnalisis', 'GrupoInformes', 'GrupoAyuda']);
  });
});

describe('catálogo visual (U3.3)', () => {
  it('cada distribución del catálogo está en un grupo, y solo en uno, con su forma', async () => {
    const { CATALOGO_DISTRIBUCIONES, GRUPOS_CATALOGO, vistaPrevia } = await import('../../engine/modelo/index.ts');
    const agrupadas = GRUPOS_CATALOGO.flatMap((g) => g.tipos);
    expect([...agrupadas].sort()).toEqual(CATALOGO_DISTRIBUCIONES.map((d) => d.tipo).sort());
    expect(new Set(agrupadas).size).toBe(agrupadas.length);
    for (const d of CATALOGO_DISTRIBUCIONES) expect(vistaPrevia(d.porDefecto), d.tipo).not.toBeNull();
  });
});
