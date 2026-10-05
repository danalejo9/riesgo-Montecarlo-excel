/**
 * QRSA Q2 y Q3 en el motor: pruebas obligatorias 5 (correlación lograda) y 7
 * (costo por tiempo), corrección de Higham, factores por grupo, pre y post
 * mitigación, ramificación, riesgo como actividad, rutas críticas frecuentes,
 * escalamiento e iteraciones automáticas.
 */
import { describe, expect, it } from 'vitest';
import { simularCronograma, type ActividadRed } from '../../engine/cronograma/index.ts';
import { spearman } from '../../engine/stats/index.ts';
import { modelo } from '../helpers/cronogramas.ts';

const tri = (min: number, moda: number, max: number) => ({ tipo: 'triangular' as const, min, moda, max });
const fc = (id: string, desfase = 0) => ({ id, tipo: 'FC' as const, desfase });
const serie3: ActividadRed[] = [
  { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
  { id: 'B', nombre: 'B', duracion: 10, predecesoras: [fc('A')] },
  { id: 'C', nombre: 'C', duracion: 10, predecesoras: [fc('B')] },
];

describe('correlación (prueba 5)', () => {
  it('la correlación lograda queda a ±0,05 de la pedida, por pares y por grupo', async () => {
    const m = modelo(serie3, ['A', 'B', 'C'].map((actividad) => ({ actividad, distribucion: tri(8, 10, 16) })), [], { iteraciones: 5000, redondeo: 'decimal' });
    const sim = await simularCronograma({ ...m, gruposCorrelacion: [{ nombre: 'Obra', miembros: ['A', 'B', 'C'], rho: 0.6 }] });
    expect(sim.correlacionLograda).toHaveLength(3);
    for (const c of sim.correlacionLograda) expect(Math.abs(c.lograda - 0.6)).toBeLessThan(0.05);
    expect(spearman(sim.duraciones[0] as Float32Array, sim.duraciones[2] as Float32Array)).toBeCloseTo(0.6, 1);
    // Correlacionadas, la serie varía más que independientes.
    const indep = await simularCronograma(m);
    const desv = (v: Float64Array) => Math.sqrt(v.reduce((s, x) => s + (x - v.reduce((a, b) => a + b, 0) / v.length) ** 2, 0) / v.length);
    expect(desv(sim.fin.dias)).toBeGreaterThan(desv(indep.fin.dias) * 1.2);
  });

  it('una matriz imposible se corrige (Higham) y se avisa', async () => {
    const m = modelo(serie3, ['A', 'B', 'C'].map((actividad) => ({ actividad, distribucion: tri(8, 10, 16) })), [], { iteraciones: 2000 });
    const sim = await simularCronograma({ ...m, correlaciones: [{ a: 'A', b: 'B', rho: 0.9 }, { a: 'B', b: 'C', rho: 0.9 }, { a: 'A', b: 'C', rho: -0.9 }] });
    expect(sim.avisos.some((a) => a.includes('Higham'))).toBe(true);
    for (const c of sim.correlacionLograda) expect(Math.abs(c.lograda - c.aplicada)).toBeLessThan(0.05);
  });
});

describe('costos (prueba 7)', () => {
  it('un proyecto 10 días más largo cuesta la tarifa × 10 más', async () => {
    const base = (dias: number) => modelo([{ id: 'A', nombre: 'A', duracion: dias, predecesoras: [] }], [], [], { iteraciones: 10 });
    const costos = [
      { id: 'ADM', nombre: 'Administración', tipo: 'tiempo' as const, valor: 1_000_000 },
      { id: 'MAT', nombre: 'Materiales', tipo: 'fijo' as const, valor: 50_000_000 },
    ];
    const corto = await simularCronograma({ ...base(20), costos });
    const largo = await simularCronograma({ ...base(30), costos });
    expect(corto.costoBase).toBe(70_000_000);
    expect((largo.costo as Float64Array)[0]! - (corto.costo as Float64Array)[0]!).toBe(10_000_000);
  });

  it('por recurso, impactos de costo de los riesgos, escalamiento y mitigación', async () => {
    const m = modelo([
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 250, predecesoras: [fc('A')] },
    ], [], [{
      id: 'R', nombre: 'Multa', probabilidad: 1, impactos: [{ actividad: 'A', dias: { tipo: 'fija', valor: 5 }, costo: { tipo: 'fija', valor: 300 } }],
      probabilidadPost: 0, costoMitigacion: 100,
    }], { iteraciones: 10 });
    const sim = await simularCronograma({
      ...m,
      costos: [
        { id: 'GRUA', nombre: 'Grúa', tipo: 'recurso', actividad: 'A', valor: 10, unidades: 2 },
        { id: 'ESC', nombre: 'Insumos con escalamiento', tipo: 'fijo', actividad: 'B', valor: 1000, escalamiento: 0.1 },
      ],
    });
    // Base: grúa 2 × 10 × 10 = 200; insumos 1000 escalados a la mitad de B.
    expect(sim.costoBase).toBeGreaterThan(200 + 1000);
    // Con el riesgo: la grúa trabaja 15 días (300) y la multa suma 300.
    const c = (sim.costo as Float64Array)[0]!;
    expect(c - (sim.costoBase as number)).toBeGreaterThan(400 - 1);
    // Post: el riesgo no ocurre y se paga la mitigación.
    const post = (sim.post?.costo as Float64Array)[0]!;
    expect(post).toBeCloseTo((sim.costoBase as number) + 100, 6);
    expect(sim.post?.media).toBe(sim.deterministico.duracion);
    expect(sim.eliminacion[0]?.reduccionMediaCosto).toBeGreaterThan(399);
  });
});

describe('factores por grupo (Q2.6)', () => {
  it('una fila por WBS o por grupo vale para las actividades sin distribución propia', async () => {
    const m = modelo([
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 20, predecesoras: [] },
      { id: 'C', nombre: 'C', duracion: 30, predecesoras: [] },
    ], [
      { actividad: 'A', distribucion: { tipo: 'fija', valor: 11 } },
      { actividad: 'WBS 2', selector: { wbs: '2' }, distribucion: { tipo: 'fija', valor: 1.5 }, relativa: true },
      { actividad: 'Grupo Siembra', selector: { grupo: 'siembra' }, distribucion: { tipo: 'fija', valor: 2 }, relativa: true },
    ], [], { iteraciones: 5 });
    const sim = await simularCronograma({ ...m, info: [{ id: 'A', wbs: '2.1' }, { id: 'B', wbs: '2.2' }, { id: 'C', wbs: '3', grupo: 'Siembra' }] });
    expect([0, 1, 2].map((a) => (sim.duraciones[a] as Float32Array)[0])).toEqual([11, 30, 60]);
  });
});

describe('ramificación y riesgo como actividad (Q3.4)', () => {
  it('cada iteración sigue una sola opción de la rama', async () => {
    const m = modelo([
      { id: 'P', nombre: 'Permiso', duracion: 5, predecesoras: [] },
      { id: 'OK', nombre: 'Aprobado: obra directa', duracion: 10, predecesoras: [fc('P')] },
      { id: 'NO', nombre: 'Negado: ruta B', duracion: 40, predecesoras: [fc('P')] },
      { id: 'F', nombre: 'Fin', duracion: 0, predecesoras: [fc('OK'), fc('NO')] },
    ], [], [], { iteraciones: 4000 });
    const sim = await simularCronograma({ ...m, ramas: [{ rama: 'Permiso', opciones: [{ opcion: 'Aprobado', probabilidad: 0.7, actividades: ['OK'] }, { opcion: 'Negado', probabilidad: 0.3, actividades: ['NO'] }] }] });
    expect(new Set(sim.fin.dias)).toEqual(new Set([15, 45]));
    const largas = sim.fin.dias.filter((d) => d === 45).length / 4000;
    expect(largas).toBeCloseTo(0.3, 1);
    // El determinístico sigue la opción más probable.
    expect(sim.deterministico.duracion).toBe(15);
  });

  it('un riesgo insertado como actividad empuja a las sucesoras fin–comienzo', async () => {
    const m = modelo([
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 5, predecesoras: [fc('A')] },
    ], [], [{ id: 'R', nombre: 'Reproceso', probabilidad: 1, modo: 'actividad', impactos: [{ actividad: 'A', dias: { tipo: 'fija', valor: 3 } }] }], { iteraciones: 5 });
    const sim = await simularCronograma(m);
    expect(new Set(sim.fin.dias)).toEqual(new Set([18]));
    expect(sim.red.ids).toContain('R@A');
    expect(sim.riesgoInsertado[sim.red.indice.get('R@A') as number]).toBe(true);
    // La duración de A no cambió: el retraso es la actividad nueva.
    expect((sim.duraciones[0] as Float32Array)[0]).toBe(10);
    expect(sim.deterministico.duracion).toBe(15);
  });
});

describe('rutas críticas frecuentes, cronograma ajustado e iteraciones automáticas (Q3)', () => {
  it('reparte las iteraciones entre las dos rutas posibles', async () => {
    const m = modelo([
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 10, predecesoras: [] },
      { id: 'F', nombre: 'Fin', duracion: 0, predecesoras: [fc('A'), fc('B')] },
    ], [{ actividad: 'A', distribucion: tri(5, 10, 20) }, { actividad: 'B', distribucion: tri(5, 10, 20) }], [], { iteraciones: 3000, redondeo: 'decimal' });
    const sim = await simularCronograma(m);
    expect(sim.rutas.length).toBeGreaterThanOrEqual(2);
    expect(sim.rutas[0]!.proporcion + sim.rutas[1]!.proporcion).toBeGreaterThan(0.99);
    expect(sim.rutas.map((r) => r.actividades.join(' ')).sort().slice(0, 2)).toEqual(['A F', 'B F']);
    // Fechas por actividad, para el P80 de cada una.
    expect(sim.fechas.fin[0]).toHaveLength(3000);
  });

  it('con iteraciones automáticas para cuando el P80 se estabiliza', async () => {
    const m = modelo(serie3, ['A', 'B', 'C'].map((actividad) => ({ actividad, distribucion: tri(8, 10, 16) })), [], { iteracionesAutomaticas: true });
    const sim = await simularCronograma(m);
    expect([1000, 2000, 5000, 10000, 20000]).toContain(sim.iteraciones);
    expect(sim.avisos.some((a) => a.startsWith('Iteraciones automáticas'))).toBe(true);
  });
});

describe('análisis de Q2 y Q3', () => {
  it('contingencia de costo, JCL, cronograma ajustado y comparación pre/post', async () => {
    const { resumirCosto, confianzaConjunta, cronogramaAjustado, comparacionPrePost } = await import('../../engine/cronograma/index.ts');
    const m = modelo([
      { id: 'A', nombre: 'A', duracion: 10, predecesoras: [] },
      { id: 'B', nombre: 'B', duracion: 10, predecesoras: [fc('A')] },
    ], [{ actividad: 'A', distribucion: tri(8, 10, 15) }], [
      { id: 'R', nombre: 'R', probabilidad: 0.5, probabilidadPost: 0.1, costoMitigacion: 50, impactos: [{ actividad: 'B', dias: { tipo: 'fija', valor: 5 } }] },
    ], { iteraciones: 2000 });
    const sim = await simularCronograma({ ...m, costos: [{ id: 'ADM', nombre: 'Adm', tipo: 'tiempo', valor: 100 }] });
    const rc = resumirCosto(sim.costo!, sim.costoBase!, 0.8, 2500);
    expect(rc.base).toBe(2000);
    expect(rc.contingencia).toBeCloseTo(rc.valorContingencia - 2000, 9);
    expect(rc.contingencia).toBeGreaterThan(0);
    const j = confianzaConjunta(sim.fin.serie, sim.costo!, sim.deterministico.fin + 7, 2300);
    expect(j.jcl).toBeLessThanOrEqual(Math.min(j.soloPlazo, j.soloCosto));
    expect(j.puntos.length).toBeLessThanOrEqual(1500);
    const aj = cronogramaAjustado(sim);
    expect(aj[1]!.finP).toBeGreaterThanOrEqual(aj[1]!.finP50);
    expect(aj[1]!.desplazamiento).toBeGreaterThan(0);
    const pp = comparacionPrePost(sim, sim.deterministico.fin);
    expect(pp.find((f) => f.medida === 'Fin: media (días)')!.diferencia).toBeGreaterThan(1);
    expect(pp.find((f) => f.medida === 'Probabilidad de cumplir la fecha meta')!.diferencia).toBeGreaterThan(0);
  });
});
