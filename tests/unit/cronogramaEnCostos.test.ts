/**
 * W5: `RIESGO.CRONOGRAMA` en el modelo de costos. La fuente del cronograma
 * (misma semilla, iteración a iteración), los errores, el valor del plan y
 * todo el camino del modelo de costos sin Excel, sobre el libro de ejemplo.
 */
import { describe, expect, it } from 'vitest';

import {
  clavePedido, compilarRed, cpmDeterministico, crearFuenteCronograma, leerPlanPublicado, medidaDe, multaDe, publicarPlan, resumenDeMuestra, simularCronograma,
  valorDelPlan, type ModeloCronograma,
} from '../../engine/cronograma/index.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { metadatosFunciones } from '../../engine/modelo/metadatosFunciones.ts';
import { enlazarCronograma, recolectorDePedidos } from '../../excel/cronogramaEnCostos.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { planificarCompartir } from '../../excel/compartirPuro.ts';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { modelo as modeloDe } from '../helpers/cronogramas.ts';

const hojas = Object.fromEntries(hojasNuevasCronograma(serieDeFecha(2027, 1, 4)).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
const modelo = leerCronograma(hojas).modelo as ModeloCronograma;
const SEMILLA = 20_270_201;

function fuente(pedidos: Parameters<typeof crearFuenteCronograma>[1]) {
  const r = crearFuenteCronograma(modelo, pedidos, { semilla: SEMILLA });
  if (!r.ok) throw new Error(r.errores.join('; '));
  return r.fuente;
}

describe('la fuente del cronograma (W5)', () => {
  it('el proyecto: las mismas iteraciones que la simulación del panel con esa semilla, en el mismo orden', async () => {
    const n = 2000;
    const f = fuente([{ hito: 'Proyecto', medida: 'dias' }, { hito: '', medida: 'fecha' }, { hito: 'fin', medida: 'costo' }]);
    await f.asegurar(n);
    const panel = await simularCronograma({ ...modelo, configuracion: { ...modelo.configuracion, iteraciones: n, semilla: SEMILLA } });
    expect(Array.from(f.muestras({ hito: 'Proyecto', medida: 'dias' }, n))).toEqual(Array.from(panel.fin.dias));
    expect(Array.from(f.muestras({ hito: '', medida: 'fecha' }, n))).toEqual(Array.from(panel.fin.serie));
    expect(Array.from(f.muestras({ hito: 'fin', medida: 'costo' }, n))).toEqual(Array.from(panel.costo as Float64Array));
  });

  it('un hito: su fecha, su retraso y su multa salen de su fin en cada iteración', async () => {
    const n = 1500;
    const f = fuente(['fecha', 'dias', 'retraso', 'multa'].map((m) => ({ hito: 'L', medida: m as 'fecha' })));
    await f.asegurar(n);
    const h = modelo.hitosContractuales![0]!;
    const fecha = f.muestras({ hito: 'L', medida: 'fecha' }, n);
    const retraso = f.muestras({ hito: 'L', medida: 'retraso' }, n);
    const multa = f.muestras({ hito: 'L', medida: 'multa' }, n);
    for (let i = 0; i < n; i++) {
      expect(retraso[i]).toBe(Math.max(0, (fecha[i] as number) - h.fecha));
      expect(multa[i]).toBe(multaDe(h, fecha[i] as number));
    }
    expect(Math.max(...multa)).toBeGreaterThan(0);
    // Por nombre también.
    const g = fuente([{ hito: 'Entrega', medida: 'fecha' }]);
    await g.asegurar(n);
    expect(Array.from(g.muestras({ hito: 'Entrega', medida: 'fecha' }, n))).toEqual(Array.from(fecha));
  });

  it('cambiar las iteraciones vuelve a simular; cancelar no deja nada a medias', async () => {
    const pedido = { hito: 'M', medida: 'fecha' as const };
    const a = fuente([pedido]);
    await a.asegurar(700);
    expect(a.hechas).toBe(700);
    await a.asegurar(1200);
    expect(a.muestras(pedido, 1200)).toHaveLength(1200);
    expect(() => a.muestras(pedido, 700)).toThrow(/700/);
    expect(await a.asegurar(9000, { debeCancelar: () => true })).toBe(false);
    expect(a.hechas).toBe(1200);
  });

  it('errores claros antes de simular nada', () => {
    const r = crearFuenteCronograma(modelo, [
      { hito: 'ZZ', medida: 'fecha' }, { hito: 'E', medida: 'costo' }, { hito: 'E', medida: 'multa' }, { hito: 'Proyecto', medida: 'retraso' },
    ], { semilla: 1 });
    expect(!r.ok && r.errores).toEqual([
      expect.stringContaining('no hay ninguna actividad con el ID o el nombre «ZZ»'),
      expect.stringContaining('el costo es del proyecto entero'),
      expect.stringContaining('ponga «E» en la hoja Hitos_Contrato'),
      expect.stringContaining('ponga «Proyecto» en la hoja Hitos_Contrato'),
    ]);
    const sinCostos = modeloDe([{ id: 'A', nombre: 'Uno', duracion: 5, predecesoras: [] }, { id: 'B', nombre: 'Uno', duracion: 2, predecesoras: [] }]);
    const s = crearFuenteCronograma(sinCostos, [{ hito: '', medida: 'costo' }, { hito: 'uno', medida: 'fecha' }], { semilla: 1 });
    expect(!s.ok && s.errores).toEqual([expect.stringContaining('no tiene costos'), expect.stringContaining('hay 2 actividades llamadas «uno»')]);
  });

  it('las medidas se escriben con o sin tilde, en español o en inglés', () => {
    expect(['', 'Fecha', 'días', 'DURACIÓN', 'retraso', 'multa', 'costo', 'cost', 'penalty'].map(medidaDe))
      .toEqual(['fecha', 'fecha', 'dias', 'dias', 'retraso', 'multa', 'costo', 'costo', 'multa']);
    expect(medidaDe('peso')).toBeNull();
    expect(clavePedido({ hito: ' Proyecto ', medida: 'dias' })).toBe(clavePedido({ hito: '', medida: 'dias' }));
  });

  it('el resumen para el panel: pocos valores y la media de verdad', () => {
    const x = Float64Array.from({ length: 10_000 }, (_, i) => 100 + (i % 37));
    const r = resumenDeMuestra(x);
    expect(r.values.length).toBeLessThanOrEqual(200);
    expect(r.weights.reduce((a, b) => a + b, 0)).toBe(200);
    expect(r.media).toBeCloseTo(x.reduce((a, b) => a + b, 0) / x.length, 9);
  });

  it('un libro sin la hoja Actividades no se simula', async () => {
    const e = await enlazarCronograma([{ hito: '', medida: 'fecha' }], 1, 10, async () => ({}));
    expect(!e.ok && e.errores[0]).toContain('no tiene la hoja Actividades');
  });
});

describe('el valor del plan, fuera de la simulación (W5)', () => {
  it('las fechas y días del CPM, el retraso y la multa del plan, y el costo base', async () => {
    const plan = leerPlanPublicado(JSON.stringify(await publicarPlan(modelo)));
    const det = cpmDeterministico(compilarRed(modelo.red));
    expect(valorDelPlan(plan, 'Proyecto', 'fecha')).toBe(det.fin);
    expect(valorDelPlan(plan, '', 'dias')).toBe(det.duracion);
    expect(valorDelPlan(plan, 'Entrega', 'fecha')).toBe(det.filas.find((x) => x.id === 'L')!.fin);
    expect(valorDelPlan(plan, 'L', 'dias')).toBe(det.duracion);
    expect(valorDelPlan(plan, 'L', 'multa')).toBe(0);
    expect(valorDelPlan(plan, 'L', 'retraso')).toBe(0);
    const sim = await simularCronograma({ ...modelo, configuracion: { ...modelo.configuracion, iteraciones: 2 } }, { soloPrincipal: true });
    expect(valorDelPlan(plan, '', 'costo')).toBe(sim.costoBase);
  });

  it('o por qué no lo hay', async () => {
    const plan = leerPlanPublicado(JSON.stringify(await publicarPlan(modelo)));
    expect(valorDelPlan(null, 'L', 'fecha')).toContain('Calcula el cronograma');
    expect(valorDelPlan(plan, 'ZZ', 'fecha')).toContain('«ZZ»');
    expect(valorDelPlan(plan, 'E', 'multa')).toContain('fecha contractual');
    expect(valorDelPlan(plan, 'E', 'peso')).toContain('no existe');
  });

  it('la función existe en Excel, con la medida y el valor fijo opcionales', () => {
    const m = metadatosFunciones() as { functions: { id: string; parameters: { optional?: boolean }[]; options?: { volatile?: boolean } }[] };
    const f = m.functions.find((x) => x.id === 'CRONOGRAMA')!;
    expect(f.parameters.map((p) => p.optional ?? false)).toEqual([false, true, true]);
    expect(f.options?.volatile).toBe(true);
  });
});

// Un modelo de costos: imprevistos, administración por día del proyecto y la multa de la entrega.
const H = 'Costos';
const k = (ref: string) => claveDeReferencia(H, ref);
const FORMULAS: Record<string, string> = {
  B3: 'RIESGO.TRIANGULAR(900000,1000000,1250000)',
  B4: 'RIESGO.CRONOGRAMA("Proyecto","dias")',
  B5: 'B4*1500',
  B6: 'RIESGO.CRONOGRAMA("L","multa")',
  B7: 'RIESGO.CRONOGRAMA("L","fecha")',
  B8: 'B3+B5+B6',
};

async function simularCostos(n: number, desalinear = false) {
  const f: FormulaCelda[] = Object.entries(FORMULAS).map(([ref, formula]) => ({ hoja: H, col: 2, fila: Number(ref.slice(1)), formula }));
  const { grafo } = construirGrafo(f, []);
  const salidas = [k('B8'), k('B7')];
  const recolector = recolectorDePedidos();
  entradasDeFunciones(f, grafo, [], salidas, undefined, recolector.proveedor);
  const e = await enlazarCronograma(recolector.pedidos, SEMILLA, n, async () => hojas);
  if (!e.ok) throw new Error(e.errores.join('; '));
  const d = entradasDeFunciones(f, grafo, [], salidas, undefined, e.enlace.proveedor);
  if (d.errores.length > 0) throw new Error(d.errores.join('; '));
  expect([...d.cronograma.values()]).toEqual([{ hito: 'Proyecto', medida: 'dias' }, { hito: 'L', medida: 'multa' }, { hito: 'L', medida: 'fecha' }]);
  aplicarReescrituras(grafo, d);
  const base = modeloVacio();
  const m = {
    ...base, inputs: d.entradas, outputs: [{ id: 't', name: 'Costo total', ref: k('B8') }, { id: 'f', name: 'Entrega', ref: k('B7') }],
    settings: { ...base.settings, iterations: n, seed: SEMILLA },
  };
  const fijas = await e.enlace.fijas(d.cronograma, n);
  if (!fijas) throw new Error('cancelada');
  // Para ver que la relación importa: el cronograma corrido una iteración respecto a los costos.
  if (desalinear) for (const [id, x] of fijas) fijas.set(id, Float64Array.from(x, (_, i) => x[(i + 1) % n] as number));
  const p = prepararEntradas(m, resolverConFunciones((ref) => ref, d), SEMILLA, fijas);
  if (!p.ok) throw new Error(p.errores.join('; '));
  const c = compilarPlan(grafo, new Set(d.claves), salidas);
  if (!c.ok) throw new Error(c.error.motivo);
  const r = await simularPorBloques(grafo, c.plan, p.entradas, SEMILLA, n, { retenerMuestra: n });
  if (!r.ok) throw new Error(r.error.motivo);
  return { total: r.porSalida.get(k('B8'))!.muestra!, fecha: r.porSalida.get(k('B7'))!.muestra!, fijas, d, enlace: e.enlace };
}

function correlacion(a: Float64Array, b: Float64Array): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let c = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    c += ((a[i] as number) - ma) * ((b[i] as number) - mb);
    va += ((a[i] as number) - ma) ** 2;
    vb += ((b[i] as number) - mb) ** 2;
  }
  return c / Math.sqrt(va * vb);
}

describe('RIESGO.CRONOGRAMA en el modelo de costos (W5)', () => {
  const N = 4000;

  it('cada iteración del costo usa la misma iteración del cronograma', async () => {
    const r = await simularCostos(N);
    const dias = r.enlace.fuente.muestras({ hito: 'Proyecto', medida: 'dias' }, N);
    const multa = r.enlace.fuente.muestras({ hito: 'L', medida: 'multa' }, N);
    // La fecha de la celda es la del cronograma en esa misma iteración.
    expect(Array.from(r.fecha)).toEqual(Array.from(r.enlace.fuente.muestras({ hito: 'L', medida: 'fecha' }, N)));
    // El total menos los imprevistos es exactamente 1.500 por día más la multa de esa iteración.
    const B3 = Float64Array.from(r.total, (t, i) => t - 1500 * (dias[i] as number) - (multa[i] as number));
    expect(Math.min(...B3)).toBeGreaterThanOrEqual(900000 - 1e-6);
    expect(Math.max(...B3)).toBeLessThanOrEqual(1250000 + 1e-6);
    // Plazo y costo se mueven juntos.
    expect(correlacion(dias, r.total)).toBeGreaterThan(0.5);
  }, 60_000);

  it('sin la relación iteración a iteración, la correlación desaparece', async () => {
    const r = await simularCostos(N, true);
    const dias = r.enlace.fuente.muestras({ hito: 'Proyecto', medida: 'dias' }, N);
    expect(Math.abs(correlacion(dias, r.total))).toBeLessThan(0.1);
  }, 60_000);

  it('fuera de la simulación, la entrada se describe con un resumen de sus muestras', async () => {
    const r = await simularCostos(1000);
    const entrada = r.d.entradas.find((x) => x.ref === k('B4'))!;
    const dias = r.enlace.fuente.muestras({ hito: 'Proyecto', medida: 'dias' }, 1000);
    expect(entrada.dist).toMatchObject({ type: 'discrete' });
    const { values, weights } = entrada.dist as { values: number[]; weights: number[] };
    expect(weights.reduce((x, y) => x + y, 0)).toBe(200);
    expect(values[0]).toBeGreaterThanOrEqual(Math.min(...dias));
    expect(values[values.length - 1]).toBeLessThanOrEqual(Math.max(...dias));
  });

  it('una correlación declarada con una entrada del cronograma es un error', () => {
    const base = modeloVacio();
    const m = {
      ...base,
      inputs: [
        { id: 'a', name: 'Días', ref: 'X!A1', dist: { type: 'uniform' as const, min: 0, max: 1 }, correlations: [{ with: 'b', coefficient: 0.5 }] },
        { id: 'b', name: 'Otra', ref: 'X!A2', dist: { type: 'uniform' as const, min: 0, max: 1 }, correlations: [{ with: 'a', coefficient: 0.5 }] },
      ],
      settings: { ...base.settings, iterations: 10 },
    };
    const p = prepararEntradas(m, (r) => r, 1, new Map([['a', new Float64Array(10)]]));
    expect(!p.ok && p.errores[0]).toContain('sale del cronograma');
    const corta = prepararEntradas({ ...m, inputs: m.inputs.map((x) => ({ ...x, correlations: [] })) }, (r) => r, 1, new Map([['a', new Float64Array(5)]]));
    expect(!corta.ok && corta.errores[0]).toContain('hacen falta 10');
  });
});

describe('«Preparar para compartir» con RIESGO.CRONOGRAMA (W5)', () => {
  it('la celda se queda con su valor (sin el complemento no hay cronograma que simular)', () => {
    const plan = planificarCompartir([
      { hoja: 'C', col: 2, fila: 1, formula: 'RIESGO.CRONOGRAMA("L","fecha")' },
      { hoja: 'C', col: 2, fila: 2, formula: '1500*RIESGO.CRONOGRAMA("Proyecto","dias")' },
      { hoja: 'C', col: 2, fila: 3, formula: 'RIESGO.NORMAL(100,-5)' },
    ]);
    expect(plan.congelar.map((c) => c.direccion).sort()).toEqual(['C!B1', 'C!B2']);
    expect(plan.noConvertibles).toEqual([expect.stringContaining('C!B3')]);
    expect(plan.conversiones).toEqual([]);
  });
});
