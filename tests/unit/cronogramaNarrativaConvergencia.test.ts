/** W4 (sesgo de convergencia) y el resultado en palabras. */
import { describe, expect, it } from 'vitest';
import { convergenciasDe, narrativaCronograma, simularCronograma, type ActividadRed, type RiesgoCronograma } from '../../engine/cronograma/index.ts';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { hojaResultados } from '../../excel/cronogramaResultados.ts';
import { chequearCalidad } from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { modelo } from '../helpers/cronogramas.ts';

const fc = (id: string) => ({ id, tipo: 'FC' as const, desfase: 0 });
// Dos rutas paralelas de 10 días que se juntan en el hito M.
const red: ActividadRed[] = [
  { id: 'A', nombre: 'Ruta A', duracion: 10, predecesoras: [] },
  { id: 'B', nombre: 'Ruta B', duracion: 10, predecesoras: [] },
  { id: 'M', nombre: 'Se juntan', duracion: 0, predecesoras: [fc('A'), fc('B')] },
  { id: 'C', nombre: 'Después', duracion: 5, predecesoras: [fc('M')] },
];
const riesgo = (id: string, act: string, p: number): RiesgoCronograma => ({ id, nombre: id, probabilidad: p, impactos: [{ actividad: act, dias: { tipo: 'fija', valor: 3 } }] });

describe('sesgo de convergencia', () => {
  it('con riesgos independientes, la convergencia llega a tiempo en el producto de las rutas', async () => {
    const sim = await simularCronograma(modelo(red, [], [riesgo('RA', 'A', 0.3), riesgo('RB', 'B', 0.3)], { iteraciones: 4000, metodo: 'monte-carlo' }));
    const [c] = convergenciasDe(sim);
    expect(c?.id).toBe('M');
    expect(c?.ramas.map((r) => r.id)).toEqual(['A', 'B']);
    for (const r of c!.ramas) expect(r.probATiempo).toBeCloseTo(0.7, 1);
    expect(c!.probATiempo).toBeCloseTo(0.49, 1);
    expect(c!.probATiempo).toBeCloseTo(c!.probProducto, 1);
    expect(c!.sesgo).toBeGreaterThan(0.15);
  });

  it('con un riesgo común a las dos rutas no hay sesgo: llegan o se retrasan juntas', async () => {
    const comun: RiesgoCronograma = { id: 'R', nombre: 'R', probabilidad: 0.3, impactos: [{ actividad: 'A', dias: { tipo: 'fija', valor: 3 } }, { actividad: 'B', dias: { tipo: 'fija', valor: 3 } }] };
    const sim = await simularCronograma(modelo(red, [], [comun], { iteraciones: 2000 }));
    const [c] = convergenciasDe(sim);
    expect(c!.probATiempo).toBeCloseTo(c!.ramas[0]!.probATiempo, 10);
    expect(c!.sesgo).toBe(0);
    expect(c!.probProducto).toBeLessThan(c!.probATiempo);
  });

  it('el resumen en palabras cuenta la convergencia, el riesgo que más pesa y la reserva', async () => {
    // Con 15 % cada uno, ninguno basta para mover el P80 por sí solo… salvo quitando el otro.
    const m = modelo(red, [], [riesgo('RA', 'A', 0.15), riesgo('RB', 'B', 0.15)], { iteraciones: 2000 });
    const sim = await simularCronograma(m);
    const t = narrativaCronograma(sim, m).join(' ');
    expect(t).toMatch(/Hay un 80 % de probabilidad de terminar el \d\d\/\d\d\/2027/);
    expect(t).toMatch(/En «Se juntan» se juntan 2 rutas/);
    expect(t).toMatch(/sesgo de convergencia/);
    expect(t).toMatch(/reserva de 3 días laborables/);
    expect(t).toMatch(/El riesgo que más pesa es «R[AB]»/);
  });
});

describe('el ejemplo del libro', () => {
  it('la hoja de resultados trae el resumen en palabras', async () => {
    const m = leerCronograma(Object.fromEntries(hojasNuevasCronograma(serieDeFecha(2027, 1, 4)).map((h) => [h.nombre, h.valores.map((f) => [...f])]))).modelo!;
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 1000 } });
    const h = hojaResultados({ sim, modelo: m, calidad: chequearCalidad(m), ahora: 47000, version: 'x' });
    const textos = h.valores.map((f) => String(f[0] ?? ''));
    const i = textos.indexOf('En palabras');
    expect(i).toBeGreaterThan(0);
    expect(textos[i + 1]).toMatch(/^Hay un 80 %/);
    // La entrega tiene multa: el resumen la cuenta.
    expect(narrativaCronograma(sim, m).some((x) => x.startsWith('Las multas por retraso'))).toBe(true);
    expect(new Set(h.valores.map((v) => v.length)).size).toBe(1);
  });
});
