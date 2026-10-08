/**
 * Las cifras que la guía de pruebas (docs/GUIA_PRUEBAS_EXCEL.md, bloques Q y
 * GT) da como «esperado» para el libro de cronograma del ejemplo, con inicio
 * 04/01/2027 y meta 31/01/2028. Si un cambio del motor o del ejemplo las
 * mueve, esta prueba falla y hay que actualizar la guía a la vez.
 */
import { describe, expect, it } from 'vitest';
import {
  compararEscenarios, comparacionPrePost, confianzaConjunta, narrativaCronograma, reservaContingencia, resumirCosto,
  resumirHitosContractuales, resumirTiempo, simularCronograma, type SimulacionCronograma,
} from '../../engine/cronograma/index.ts';
import { HOJAS_CRONOGRAMA as H, hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { leerEscenarios } from '../../excel/escenariosCronograma.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INI = serieDeFecha(2027, 1, 4);
const META = serieDeFecha(2028, 1, 31);
type Libro = Record<string, unknown[][]>;
const libro = (): Libro => Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
const modelo = (l: Libro) => {
  const lec = leerCronograma(l as never);
  expect(lec.errores).toEqual([]);
  return lec.modelo!;
};
const percentil = (s: ReturnType<typeof resumirTiempo>, p: number) => s.percentiles.find((x) => Math.abs(x.p - p) < 1e-9)!.serie;

async function simular(l: Libro): Promise<{ sim: SimulacionCronograma; m: ReturnType<typeof modelo> }> {
  const m = modelo(l);
  return { sim: await simularCronograma(m), m };
}

describe('guía de pruebas: el ejemplo de cronograma', () => {
  it('Q6 y Q7: dieciséis hojas, y la meta y el hito contractual el 31/01/2028', () => {
    const l = libro();
    expect(Object.keys(l)).toHaveLength(16);
    expect(l[H.config]![1]).toEqual(['Fecha de inicio', INI, expect.any(String)]);
    expect(l[H.config]![8]![1]).toBe(META);
    expect(l[H.hitosContrato]![1]!.slice(0, 4)).toEqual(['L', META, 4_000_000, 280_000_000]);
  });

  it('Q9, Q15, GT42, GT43 y GT44: las cifras de la simulación base', async () => {
    const { sim, m } = await simular(libro());
    const cfg = m.configuracion;
    const fin = resumirTiempo(sim.fin, sim.deterministico.fin, cfg.fechaMeta);
    expect(fin.serieDeterministica).toBe(serieDeFecha(2027, 11, 22));
    expect(fin.probabilidadDeterministica).toBeCloseTo(0.0508, 4);
    expect(fin.probabilidadMeta).toBeCloseTo(0.653, 3);
    expect(percentil(fin, 0.5)).toBe(serieDeFecha(2028, 1, 18));
    expect(percentil(fin, 0.8)).toBe(serieDeFecha(2028, 2, 16));
    expect([Math.round(fin.media), fin.desviacion.toFixed(1)]).toEqual([257, '24.8']);

    const rc = resumirCosto(sim.costo!, sim.costoBase!, cfg.percentilContingencia, cfg.costoMeta);
    expect(Math.round(rc.base)).toBe(5_034_578_244);
    expect(Math.round(rc.valorContingencia)).toBe(5_656_960_508);
    expect(Math.round(rc.contingencia)).toBe(622_382_263);
    expect(rc.probabilidadMeta).toBeCloseTo(0.747, 3);
    expect(confianzaConjunta(sim.fin.serie, sim.costo!, cfg.fechaMeta!, cfg.costoMeta!, 1200).jcl).toBeCloseTo(0.586, 3);

    expect(sim.eliminacion.map((e) => [e.id, e.reduccionP80])).toEqual([['R1', 8], ['R2', 6], ['R3', 3], ['R4', 0]]);
    expect(sim.sinRiesgos!.p80).toBeCloseTo(260.2, 6);
    expect(percentil(resumirTiempo(sim.hitos[0]!, 0), 0.8)).toBe(serieDeFecha(2027, 12, 20));
    expect(sim.rutas[0]!.proporcion).toBeCloseTo(0.628, 3);

    // Q15: antes y después de mitigar.
    const pp = Object.fromEntries(comparacionPrePost(sim, cfg.fechaMeta, cfg.percentilContingencia).map((f) => [f.medida, f]));
    expect([pp['Fin: P80 (fecha)']!.pre, pp['Fin: P80 (fecha)']!.post]).toEqual([serieDeFecha(2028, 2, 16), serieDeFecha(2028, 2, 4)]);
    expect(pp['Probabilidad de cumplir la fecha meta']!.post).toBeCloseTo(0.761, 3);
    expect(pp['Costo: media (con la mitigación)']!.post).toBeGreaterThan(pp['Costo: media (con la mitigación)']!.pre);
    expect(pp['Costo: P80']!.post).toBeLessThan(pp['Costo: P80']!.pre);

    // GT42: el hito contractual.
    const [h] = resumirHitosContractuales(sim);
    expect([h!.id, h!.probabilidadCumplir, h!.p80, h!.retrasoP80, h!.multaMedia]).toEqual(['L', 0.6392, serieDeFecha(2028, 2, 17), 17, 35_268_800]);

    // GT43: la reserva.
    expect(reservaContingencia(sim, 0.5).dias).toBe(39);
    expect(reservaContingencia(sim, 0.9).dias).toBe(72);
    const r80 = reservaContingencia(sim, 0.8);
    expect(r80.dias).toBe(60);
    expect(r80.partes.map((p) => [p.id, Math.round(p.dias)])).toEqual([['incertidumbre', 42], ['R1', 8], ['R2', 6], ['R3', 3], ['R4', 0]]);

    // GT44: en pocas palabras.
    const frases = narrativaCronograma(sim, m).join('\n');
    expect(frases).toContain('Hay un 80 % de probabilidad de terminar el 16/02/2028 o antes');
    expect(frases).toContain('La fecha meta (31/01/2028) se cumple en el 65 % de las iteraciones');
    expect(frases).toContain('hace falta una reserva de 60 días laborables');
    expect(frases).toContain('El riesgo que más pesa es «Lluvias fuertes durante la estructura»');
  });

  it('Q12: la estructura de lunes a viernes mueve la fecha determinística al 03/12/2027', async () => {
    const l = libro();
    l[H.actividades]![8]![5] = 'Lunes a viernes';
    const { sim } = await simular(l);
    expect(sim.deterministico.fin).toBe(serieDeFecha(2027, 12, 3));
  });

  it('Q16: un millón más por día de administración', async () => {
    const l = libro();
    l[H.costos]![1]![4] = 3_500_000;
    let { sim } = await simular(l);
    expect(Math.round(sim.costoBase!)).toBe(5_252_578_244);
    for (const c of [7, 8, 9]) l[H.costos]![1]![c] = (l[H.costos]![1]![c] as number) + 1_000_000;
    const segunda = await simular(l);
    sim = segunda.sim;
    const m = segunda.m;
    expect(Math.round(sim.costoBase!)).toBe(5_252_578_244);
    expect(resumirCosto(sim.costo!, sim.costoBase!, 0.8, m.configuracion.costoMeta).probabilidadMeta).toBeCloseTo(0.417, 3);
  });

  it('Q17: tres correlaciones imposibles se corrigen y se avisa', async () => {
    const l = libro();
    l[H.correlaciones]!.push(['D', 'E', 0.9], ['E', 'H', 0.9], ['D', 'H', -0.9]);
    const { sim } = await simular(l);
    expect(sim.avisos).toHaveLength(4);
    expect(sim.avisos[0]).toBe('La correlación entre D y E está dos veces (0,5 y 0,9); se usa 0,9.');
    expect(sim.avisos[3]).toContain('se usó la matriz posible más cercana (Higham): el coeficiente que más cambió, 0,4');
    const de = sim.correlacionLograda.find((c) => c.a === 'D' && c.b === 'E')!;
    expect([de.objetivo, Number(de.aplicada.toFixed(2))]).toEqual([0.9, 0.5]);
  });

  it('Q20 y GT37: la rama de la licencia', async () => {
    const l = libro();
    l[H.ramas]!.push(['Licencia', 'Trámite normal', 0.7, 'B'], ['Licencia', 'Ya aprobada', 0.3, 'C']);
    const { sim, m } = await simular(l);
    const fin = resumirTiempo(sim.fin, sim.deterministico.fin, m.configuracion.fechaMeta);
    expect([percentil(fin, 0.5), percentil(fin, 0.8)]).toEqual([serieDeFecha(2027, 12, 27), serieDeFecha(2028, 2, 7)]);
    expect(fin.probabilidadMeta).toBeCloseTo(0.752, 3);
    l[H.ramas]![2]![2] = 0.4;
    expect(leerCronograma(l as never).errores.map((e) => e.mensaje)).toEqual(['Las opciones de la rama «Licencia» suman 110 %; tienen que sumar 100 %']);
  });

  it('Q21: iteraciones automáticas, con coma decimal en el aviso', async () => {
    const l = libro();
    l[H.config]![3]![1] = 'Automático';
    const { sim } = await simular(l);
    expect(sim.iteraciones).toBe(2000);
    expect(sim.avisos[0]).toBe('Iteraciones automáticas: el P80 se estabilizó con 2.000 iteraciones (cambió 0,36 % en el último bloque).');
  });

  it('GT36: R3 al 30 %', async () => {
    const l = libro();
    l[H.riesgos]![3]![6] = 0.3;
    const { sim, m } = await simular(l);
    const fin = resumirTiempo(sim.fin, sim.deterministico.fin, m.configuracion.fechaMeta);
    expect([percentil(fin, 0.5), percentil(fin, 0.8)]).toEqual([serieDeFecha(2028, 1, 24), serieDeFecha(2028, 2, 23)]);
    expect(fin.probabilidadMeta).toBeCloseTo(0.584, 3);
  });

  it('GT47: el clima de mayo a julio sobre la estructura', async () => {
    const l = libro();
    for (const f of l[H.clima]!) if (['Mayo', 'Junio', 'Julio'].includes(String(f[0]))) { f[1] = 2; f[2] = 4; f[3] = 8; }
    l[H.clima]![1]![5] = 'E';
    const { sim } = await simular(l);
    expect(sim.p80 - sim.sinClima!.p80).toBe(2);
    expect(sim.sinClima!.p80).toBe(278);
    expect((sim.media - sim.sinClima!.media).toFixed(2)).toBe('4.64');
  });

  it('GT48: los escenarios de la hoja', async () => {
    const l = libro();
    const m = modelo(l);
    const e = leerEscenarios(l[H.escenarios] as never, m);
    expect(e.errores).toEqual([]);
    const c = await compararEscenarios(m, e.escenarios);
    const por = Object.fromEntries(c.escenarios.map((x) => [x.nombre, x]));
    expect(por['Trabajar los sábados']!.adelantoP80).toBe(54);
    expect(por['Trabajar los sábados']!.probMeta).toBeCloseTo(0.972, 3);
    expect(por['Acelerar la estructura']!.adelantoP80).toBe(13);
    expect(por['Sin el riesgo de la licencia']!.adelantoP80).toBe(8);
  });
});
