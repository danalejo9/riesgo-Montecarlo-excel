/**
 * W5: `RIESGO.CRONOGRAMA` en el modelo de costos. La fuente del cronograma
 * (misma semilla, iteración a iteración, ampliable por tandas), los errores,
 * el valor del plan y todo el camino del modelo de costos contra la
 * referencia en Python («Costos con plazo (prueba)» → «Esperado (costos con
 * plazo)»).
 */
import { describe, expect, it } from 'vitest';

import {
  CALENDARIO_ESTANDAR, clavePedido, crearFuenteCronograma, diaFin, fuenteDesdeHojas, leerCronograma, leerPlanPublicado, leerRiesgosPlazo, medidaDe,
  multaDe, publicarPlan, resumenDeMuestra, riesgosActivos, simularPlazo, valorDelPlan, OPCIONES_PLAZO_POR_DEFECTO, type Cronograma, type HojasCronograma,
} from '../../engine/cronograma/index.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { metadatosFunciones } from '../../engine/modelo/metadatosFunciones.ts';
import { enlazarCronograma, recolectorDePedidos } from '../../excel/cronogramaEnCostos.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';
import { planificarCompartir } from '../../excel/compartirPuro.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];
const hojas: HojasCronograma = {
  actividades: hoja('Actividades'), calendario: hoja('Calendario'), riesgos: hoja('Riesgos de plazo'), hitos: hoja('Hitos (prueba)'),
};
const cron = leerCronograma(hojas.actividades, hojas.calendario, undefined, undefined, hojas.hitos).cronograma as Cronograma;
const riesgos = riesgosActivos(leerRiesgosPlazo(hojas.riesgos, cron.actividades).riesgos);
const SEMILLA = OPCIONES_PLAZO_POR_DEFECTO.semilla;
const op = { semilla: SEMILLA, forma: OPCIONES_PLAZO_POR_DEFECTO.forma };

function fuente(pedidos: Parameters<typeof crearFuenteCronograma>[2]) {
  const r = crearFuenteCronograma(cron, riesgos, pedidos, op);
  if (!r.ok) throw new Error(r.errores.join('; '));
  return r.fuente;
}

describe('la fuente del cronograma (W5)', () => {
  it('el proyecto: las mismas iteraciones que la simulación del panel, en el mismo orden', async () => {
    const n = 3000;
    const f = fuente([{ hito: 'Proyecto', medida: 'dias' }, { hito: '', medida: 'fecha' }, { hito: 'fin', medida: 'costo' }]);
    await f.asegurar(n);
    const panel = await simularPlazo(cron, riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: n });
    expect(Array.from(f.muestras({ hito: 'Proyecto', medida: 'dias' }, n))).toEqual(Array.from(panel.finProyecto, (x) => diaFin(x) + 1));
    expect(Array.from(f.muestras({ hito: '', medida: 'fecha' }, n))).toEqual(Array.from(panel.finProyecto, (x) => panel.cal(x)));
    expect(Array.from(f.muestras({ hito: 'fin', medida: 'costo' }, n))).toEqual(Array.from(panel.costos!.porIteracion));
  });

  it('un hito: su fecha, sus días, su retraso y su multa salen de su fin en cada iteración', async () => {
    const n = 2000;
    const f = fuente(['fecha', 'dias', 'retraso', 'multa'].map((m) => ({ hito: '19', medida: m as 'fecha' })));
    await f.asegurar(n);
    const h = cron.hitos!.find((x) => x.id === '19')!;
    const fecha = f.muestras({ hito: '19', medida: 'fecha' }, n);
    const retraso = f.muestras({ hito: '19', medida: 'retraso' }, n);
    const multa = f.muestras({ hito: '19', medida: 'multa' }, n);
    for (let i = 0; i < n; i++) {
      expect(retraso[i]).toBe(Math.max(0, (fecha[i] as number) - h.fecha));
      expect(multa[i]).toBe(multaDe(h, fecha[i] as number));
    }
    // La entrega (19) es la última actividad: su fin es el del proyecto.
    const g = fuente([{ hito: 'Entrega al cliente', medida: 'dias' }, { hito: 'proyecto', medida: 'dias' }]);
    await g.asegurar(n);
    expect(Array.from(g.muestras({ hito: 'Entrega al cliente', medida: 'dias' }, n))).toEqual(Array.from(g.muestras({ hito: 'proyecto', medida: 'dias' }, n)));
  });

  it('pedir más iteraciones (otra tanda) no cambia las primeras', async () => {
    const pedido = { hito: '13', medida: 'fecha' as const };
    const a = fuente([pedido]);
    await a.asegurar(700);
    const primeras = Array.from(a.muestras(pedido, 700));
    await a.asegurar(2500);
    const b = fuente([pedido]);
    await b.asegurar(2500);
    expect(Array.from(a.muestras(pedido, 700))).toEqual(primeras);
    expect(Array.from(a.muestras(pedido, 2500))).toEqual(Array.from(b.muestras(pedido, 2500)));
    // Cancelar deja lo hecho.
    expect(await a.asegurar(9000, { debeCancelar: () => true })).toBe(false);
    expect(a.hechas).toBe(2500);
  });

  it('errores claros antes de simular nada', () => {
    const r = crearFuenteCronograma(cron, riesgos, [
      { hito: '99', medida: 'fecha' }, { hito: '13', medida: 'costo' }, { hito: '5', medida: 'multa' }, { hito: 'Proyecto', medida: 'retraso' },
    ], op);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errores).toEqual([
      expect.stringContaining('no hay ninguna actividad con el ID o el nombre «99»'),
      expect.stringContaining('el costo es del proyecto entero'),
      expect.stringContaining('pon «5» en la hoja «Hitos»'),
      expect.stringContaining('pon «Proyecto» en la hoja «Hitos»'),
    ]);
    const sinCostos: Cronograma = {
      inicio: 46_419, calendario: CALENDARIO_ESTANDAR,
      actividades: [{ id: 'A', nombre: 'Uno', duracion: 5, predecesoras: [] }, { id: 'B', nombre: 'Uno', duracion: 2, predecesoras: [] }],
    };
    const s = crearFuenteCronograma(sinCostos, [], [{ hito: '', medida: 'costo' }, { hito: 'uno', medida: 'fecha' }], op);
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

  it('las hojas con errores no se simulan', () => {
    const r = fuenteDesdeHojas({ ...hojas, actividades: undefined }, [{ hito: '', medida: 'fecha' }], op);
    expect(!r.ok && r.errores[0]).toContain('no tiene la hoja «Actividades»');
  });
});

describe('el valor del plan, fuera de la simulación (W5)', () => {
  const plan = leerPlanPublicado(JSON.stringify(publicarPlan(cron)));

  it('las fechas del CPM y el costo del plan', () => {
    const f = fuente([{ hito: '', medida: 'fecha' }, { hito: '19', medida: 'multa' }, { hito: '', medida: 'costo' }]);
    expect(valorDelPlan(plan, 'Proyecto', 'fecha')).toBe(46_584); // 16/07/2027, «Esperado»
    expect(valorDelPlan(plan, '', 'dias')).toBe(118);
    expect(valorDelPlan(plan, 'Entrega al cliente', 'fecha')).toBe(46_584);
    expect(valorDelPlan(plan, '19', 'multa')).toBe(0);
    expect(valorDelPlan(plan, '', 'costo')).toBe(f.plan({ hito: '', medida: 'costo' }));
    expect(valorDelPlan(plan, '19', 'retraso')).toBe(0);
  });

  it('o por qué no lo hay', () => {
    expect(valorDelPlan(null, '19', 'fecha')).toContain('Calcula el cronograma');
    expect(valorDelPlan(plan, '99', 'fecha')).toContain('«99»');
    expect(valorDelPlan(plan, '5', 'multa')).toContain('fecha contractual');
    expect(valorDelPlan(plan, '5', 'peso')).toContain('no existe');
  });

  it('la función existe en Excel, con la medida y el valor fijo opcionales', () => {
    const m = metadatosFunciones() as { functions: { id: string; parameters: { optional?: boolean }[]; options?: { volatile?: boolean } }[] };
    const f = m.functions.find((x) => x.id === 'CRONOGRAMA')!;
    expect(f.parameters.map((p) => p.optional ?? false)).toEqual([false, true, true]);
    expect(f.options?.volatile).toBe(true);
  });
});

// El modelo de costos de «Costos con plazo (prueba)», con todo el camino del panel sin Excel.
const H = 'Costos';
const k = (ref: string) => claveDeReferencia(H, ref);
const FORMULAS: Record<string, string> = {
  B3: 'RIESGO.TRIANGULAR(900000,1000000,1250000)',
  B4: 'RIESGO.CRONOGRAMA("Proyecto","dias")',
  B5: 'B4*1500',
  B6: 'RIESGO.CRONOGRAMA("19","multa")',
  B7: 'RIESGO.CRONOGRAMA("19","fecha")',
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
  expect([...d.cronograma.values()]).toEqual([
    { hito: 'Proyecto', medida: 'dias' }, { hito: '19', medida: 'multa' }, { hito: '19', medida: 'fecha' },
  ]);
  aplicarReescrituras(grafo, d);
  const base = modeloVacio();
  const modelo = {
    ...base, inputs: d.entradas, outputs: [{ id: 't', name: 'Costo total', ref: k('B8') }, { id: 'f', name: 'Entrega', ref: k('B7') }],
    settings: { ...base.settings, iterations: n, seed: SEMILLA },
  };
  const fijas = await e.enlace.fijas(d.cronograma, n);
  if (!fijas) throw new Error('cancelada');
  // Para ver que la relación importa: el cronograma corrido una iteración respecto a los costos.
  if (desalinear) for (const [id, x] of fijas) fijas.set(id, Float64Array.from(x, (_, i) => x[(i + 1) % n] as number));
  const p = prepararEntradas(modelo, resolverConFunciones((ref) => ref, d), SEMILLA, fijas);
  if (!p.ok) throw new Error(p.errores.join('; '));
  const c = compilarPlan(grafo, new Set(d.claves), salidas);
  if (!c.ok) throw new Error(c.error.motivo);
  const r = await simularPorBloques(grafo, c.plan, p.entradas, SEMILLA, n, { retenerMuestra: n });
  if (!r.ok) throw new Error(r.error.motivo);
  return { total: r.porSalida.get(k('B8'))!.muestra!, fecha: r.porSalida.get(k('B7'))!.muestra!, fijas, d, enlace: e.enlace };
}

function estadisticas(total: Float64Array, fecha: Float64Array, dias: Float64Array) {
  const n = total.length;
  const cuantil = (x: Float64Array, q: number) => Float64Array.from(x).sort()[Math.max(1, Math.ceil(q * n - 1e-9)) - 1] as number;
  const t80 = cuantil(total, 0.8);
  const fc = cron.hitos!.find((h) => h.id === '19')!.fecha;
  let conjunta = 0;
  for (let i = 0; i < n; i++) if ((total[i] as number) <= t80 && (fecha[i] as number) <= fc) conjunta++;
  const media = (x: Float64Array) => x.reduce((a, b) => a + b, 0) / n;
  const md = media(dias);
  const mt = media(total);
  let cov = 0;
  let vd = 0;
  let vt = 0;
  for (let i = 0; i < n; i++) {
    cov += ((dias[i] as number) - md) * ((total[i] as number) - mt);
    vd += ((dias[i] as number) - md) ** 2;
    vt += ((total[i] as number) - mt) ** 2;
  }
  return { media: mt, p80: t80, fechaP80: cuantil(fecha, 0.8), conjunta: conjunta / n, correlacion: cov / Math.sqrt(vd * vt) };
}

describe('RIESGO.CRONOGRAMA en el modelo de costos (W5)', () => {
  const N = 20_000;
  const e = hoja('Esperado (costos con plazo)');
  const valor = (nombre: string) => e.find((f) => typeof f[0] === 'string' && (f[0] as string).startsWith(nombre))![1] as number;

  it('coincide con la referencia en Python (dinero ±2 %, fechas ±1 día, probabilidad ±3 puntos, correlación ±0,05)', async () => {
    const r = await simularCostos(N);
    const s = estadisticas(r.total, r.fecha, r.enlace.fuente.muestras({ hito: 'Proyecto', medida: 'dias' }, N));
    expect(Math.abs(s.media / valor('Costo total: media') - 1)).toBeLessThan(0.02);
    expect(Math.abs(s.p80 / valor('Costo total: P80') - 1)).toBeLessThan(0.02);
    expect(Math.abs(s.fechaP80 - valor('Fecha de entrega (19): P80'))).toBeLessThanOrEqual(1);
    expect(Math.abs(s.conjunta - valor('Conjunta'))).toBeLessThan(0.03);
    expect(Math.abs(s.correlacion - valor('Correlación'))).toBeLessThan(0.05);
    // La fecha de la celda es la del cronograma en esa misma iteración.
    const fechas = r.fijas.get([...r.d.cronograma].find(([, x]) => x.medida === 'fecha')![0])!;
    expect(Array.from(r.fecha)).toEqual(Array.from(fechas));
  }, 60_000);

  it('sin la relación iteración a iteración, la correlación desaparece', async () => {
    const r = await simularCostos(N, true);
    // Los días del cronograma de cada iteración, contra un costo que se calculó con los de otra.
    const s = estadisticas(r.total, r.fecha, r.enlace.fuente.muestras({ hito: 'Proyecto', medida: 'dias' }, N));
    expect(Math.abs(s.correlacion)).toBeLessThan(0.05);
    expect(valor('Correlación')).toBeGreaterThan(0.25);
  }, 60_000);

  it('fuera de la simulación, la entrada se describe con un resumen de sus muestras', async () => {
    const r = await simularCostos(2000);
    const entrada = r.d.entradas.find((x) => x.ref === k('B4'))!;
    const dias = r.enlace.fuente.muestras({ hito: 'Proyecto', medida: 'dias' }, 2000);
    expect(entrada.dist).toMatchObject({ type: 'discrete' });
    const { values, weights } = entrada.dist as { values: number[]; weights: number[] };
    expect(weights.reduce((x, y) => x + y, 0)).toBe(200);
    expect(values[0]).toBeGreaterThanOrEqual(Math.min(...dias));
    expect(values[values.length - 1]).toBeLessThanOrEqual(Math.max(...dias));
  });

  it('una correlación declarada con una entrada del cronograma es un error', () => {
    const base = modeloVacio();
    const modelo = {
      ...base,
      inputs: [
        { id: 'a', name: 'Días', ref: 'X!A1', dist: { type: 'uniform' as const, min: 0, max: 1 }, correlations: [{ with: 'b', coefficient: 0.5 }] },
        { id: 'b', name: 'Otra', ref: 'X!A2', dist: { type: 'uniform' as const, min: 0, max: 1 }, correlations: [{ with: 'a', coefficient: 0.5 }] },
      ],
      settings: { ...base.settings, iterations: 10 },
    };
    const p = prepararEntradas(modelo, (r) => r, 1, new Map([['a', new Float64Array(10)]]));
    expect(!p.ok && p.errores[0]).toContain('sale del cronograma');
    const corta = prepararEntradas({ ...modelo, inputs: modelo.inputs.map((x) => ({ ...x, correlations: [] })) }, (r) => r, 1, new Map([['a', new Float64Array(5)]]));
    expect(!corta.ok && corta.errores[0]).toContain('hacen falta 10');
  });
});

describe('«Preparar para compartir» con RIESGO.CRONOGRAMA (W5)', () => {
  it('la celda se queda con su valor (sin el complemento no hay cronograma que simular)', () => {
    const plan = planificarCompartir([
      { hoja: 'C', col: 2, fila: 1, formula: 'RIESGO.CRONOGRAMA("19","fecha")' },
      { hoja: 'C', col: 2, fila: 2, formula: '1500*RIESGO.CRONOGRAMA("Proyecto","dias")' },
      { hoja: 'C', col: 2, fila: 3, formula: 'RIESGO.NORMAL(100,-5)' },
    ]);
    expect(plan.congelar.map((c) => c.direccion).sort()).toEqual(['C!B1', 'C!B2']);
    expect(plan.noConvertibles).toEqual([expect.stringContaining('C!B3')]);
    expect(plan.conversiones).toEqual([]);
  });
});

