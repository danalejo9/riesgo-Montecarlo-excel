/** W1: hitos contractuales y multas por retraso, en el motor y en el libro. */
import { describe, expect, it } from 'vitest';
import { multaDe, resumirHitosContractuales, simularCronograma, type ActividadRed } from '../../engine/cronograma/index.ts';
import { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA as H } from '../../excel/cronogramaHojas.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { INICIO_2027, modelo } from '../helpers/cronogramas.ts';

const fc = (id: string) => ({ id, tipo: 'FC' as const, desfase: 0 });
const red: ActividadRed[] = [
  { id: 'A', nombre: 'Obra', duracion: 10, predecesoras: [] },
  { id: 'H', nombre: 'Entrega', duracion: 0, predecesoras: [fc('A')] },
];

describe('multa de un hito', () => {
  it('días naturales de retraso × multa, con tope; sin retraso o sin multa, 0', () => {
    const h = { actividad: 'H', fecha: 100, multaDia: 10, tope: 45 };
    expect(multaDe(h, 100)).toBe(0);
    expect(multaDe(h, 99)).toBe(0);
    expect(multaDe(h, 103)).toBe(30);
    expect(multaDe(h, 120)).toBe(45);
    expect(multaDe({ actividad: 'H', fecha: 100 }, 130)).toBe(0);
  });
});

describe('hitos contractuales en la simulación', () => {
  it('un retraso seguro paga su multa en cada iteración y en el costo base', async () => {
    const base = modelo(red, [], [], { iteraciones: 50 });
    const det = (await simularCronograma(base)).deterministico.filas.find((f) => f.id === 'H')!.fin;
    const sim = await simularCronograma({ ...base, hitosContractuales: [{ actividad: 'H', fecha: det - 3, multaDia: 1000, tope: 2500 }] });
    expect(sim.costoBase).toBe(2500);
    expect([...(sim.costo as Float64Array)].every((c) => c === 2500)).toBe(true);
    const [r] = resumirHitosContractuales(sim);
    expect(r?.probabilidadCumplir).toBe(0);
    expect(r?.retrasoP80).toBe(3);
    expect(r?.multaMedia).toBe(2500);
  });

  it('con incertidumbre: la probabilidad de cumplir y la multa esperada salen de las iteraciones', async () => {
    const m = modelo(red, [{ actividad: 'A', distribucion: { tipo: 'triangular', min: 8, moda: 10, max: 20 } }], [], { iteraciones: 4000 });
    const det = (await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 10 } })).deterministico.filas.find((f) => f.id === 'H')!.fin;
    const hito = { actividad: 'H', fecha: det, multaDia: 100 };
    const sim = await simularCronograma({ ...m, hitosContractuales: [hito] });
    const c = sim.contractuales[0]!;
    const cumple = [...c.serie].filter((f) => f <= det).length / c.serie.length;
    const media = [...c.serie].reduce((s, f) => s + multaDe(hito, f), 0) / c.serie.length;
    const [r] = resumirHitosContractuales(sim);
    expect(r?.probabilidadCumplir).toBeCloseTo(cumple, 10);
    expect(r?.multaMedia).toBeCloseTo(media, 6);
    expect(cumple).toBeGreaterThan(0.1);
    expect(cumple).toBeLessThan(0.6);
    // La multa es todo el costo: la media del costo es la multa esperada.
    expect((sim.costo as Float64Array).reduce((s, x) => s + x, 0) / 4000).toBeCloseTo(media, 6);
  });

  it('sin multa, el hito se sigue pero no crea costos', async () => {
    const sim = await simularCronograma({ ...modelo(red, [], [], { iteraciones: 20 }), hitosContractuales: [{ actividad: 'H', fecha: INICIO_2027 + 60 }] });
    expect(sim.costo).toBeNull();
    expect(resumirHitosContractuales(sim)[0]?.probabilidadCumplir).toBe(1);
  });

  it('un hito que no existe es un error con su hoja', async () => {
    await expect(simularCronograma({ ...modelo(red), hitosContractuales: [{ actividad: 'ZZ', fecha: 1 }] })).rejects.toThrow(/Hitos.*ZZ/);
  });
});

describe('hoja Hitos_Contrato', () => {
  const libro = () => Object.fromEntries(hojasNuevasCronograma(serieDeFecha(2027, 1, 4)).map((h) => [h.nombre, h.valores.map((f) => [...f])]));

  it('el ejemplo trae la entrega con su multa, y entra en el costo', async () => {
    const r = leerCronograma(libro());
    expect(r.errores).toEqual([]);
    expect(r.modelo?.hitosContractuales).toEqual([{ actividad: 'L', fecha: serieDeFecha(2027, 1, 4) + 392, multaDia: 4_000_000, tope: 280_000_000 }]);
    const m = r.modelo!;
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 1000 } });
    const [h] = resumirHitosContractuales(sim);
    expect(h?.id).toBe('L');
    expect(h!.probabilidadCumplir).toBeGreaterThan(0);
    expect(h!.probabilidadCumplir).toBeLessThan(1);
    expect(h!.multaP80).toBeLessThanOrEqual(280_000_000);
  });

  it('señala un hito que no existe, uno resumen, una fecha mala y una multa negativa', () => {
    const l = libro();
    (l[H.hitosContrato] as unknown[][]).push(['ZZ', 47000], ['S2', 47000], ['K', 'mañana'], ['M', 47000, -5]);
    const r = leerCronograma(l);
    expect(r.errores.map((e) => `${e.hoja}!${e.columna}${e.fila}`)).toEqual(['Hitos_Contrato!A3', 'Hitos_Contrato!A4', 'Hitos_Contrato!B5', 'Hitos_Contrato!C6']);
    expect(r.errores[1]?.mensaje).toMatch(/resumen/);
  });
});
