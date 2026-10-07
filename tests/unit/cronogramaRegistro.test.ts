/** V10: registro de riesgos completo del cronograma. */
import { describe, expect, it } from 'vitest';
import { chequearCalidad, colorDe, evaluarRegistro, simularCronograma, zonaDe, zonaOportunidadDe } from '../../engine/cronograma/index.ts';
import { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA as H } from '../../excel/cronogramaHojas.ts';
import { hojaResultados } from '../../excel/cronogramaResultados.ts';
import { cambiosDe, leerEditores } from '../../excel/editoresCronograma.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INICIO = serieDeFecha(2027, 1, 4);
const libro = () => Object.fromEntries(hojasNuevasCronograma(INICIO).map((h) => [h.nombre, h.valores.map((f) => [...f])]));

describe('zonas', () => {
  it('por puntaje, para amenazas y oportunidades', () => {
    expect([1, 4, 8, 15, 25].map(zonaDe)).toEqual(['verde', 'amarilla', 'naranja', 'roja', 'roja']);
    expect([1, 4, 8, 15].map(zonaOportunidadDe)).toEqual(['mínima', 'baja', 'media', 'alta']);
    expect(colorDe('amenaza', 20)).not.toBe(colorDe('oportunidad', 20));
  });
});

describe('registro del ejemplo', () => {
  it('lee también los cerrados, la próxima revisión y el impacto cualitativo', () => {
    const l = libro();
    const r = l[H.riesgos] as unknown[][];
    r[3]![7] = 'Cerrado';
    r[1]![13] = 5;
    const lectura = leerCronograma(l);
    expect(lectura.errores).toEqual([]);
    expect(lectura.modelo?.riesgos.map((x) => x.id)).toEqual(['R1', 'R2', 'R4']);
    expect(lectura.registro?.map((x) => [x.id, x.estado])).toEqual([['R1', 'Activo'], ['R2', 'En seguimiento'], ['R3', 'Cerrado'], ['R4', 'Activo']]);
    expect(lectura.registro?.[0]).toMatchObject({ dueno: 'Residente de obra', proximaRevision: INICIO + 30, impactoCualitativo: 5 });
  });

  it('con la simulación: impacto por lo que aporta al P80, oportunidades aparte, revisiones vencidas y cerrados al final', async () => {
    const l = libro();
    (l[H.riesgos] as unknown[][])[3]![7] = 'Cerrado';
    const lectura = leerCronograma(l);
    const m = lectura.modelo!;
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 1000 } });
    // Hoy: 20 días después del inicio; R2 (revisión a los 14) está vencida.
    const reg = evaluarRegistro(lectura.registro!, m, sim, INICIO + 20);
    expect(reg.vencidas).toBe(1);
    expect(reg.filas.find((f) => f.id === 'R2')?.vencida).toBe(true);
    expect(reg.filas.at(-1)?.id).toBe('R3');
    const r4 = reg.filas.find((f) => f.id === 'R4')!;
    expect(r4.clase).toBe('oportunidad');
    expect(reg.matrizOportunidades.flat(2)).toEqual(['R4']);
    const r1 = reg.filas.find((f) => f.id === 'R1')!;
    expect(r1.origenImpacto).toBe('simulación');
    expect(r1.nivelP).toBe(3);
    expect(r1.nivelI).toBeGreaterThanOrEqual(2);
    expect(r1.puntaje).toBe(r1.nivelP * r1.nivelI);
    // El cerrado no está en las matrices.
    expect(reg.matriz.flat(2)).not.toContain('R3');
    // En la hoja de resultados.
    const h = hojaResultados({ sim, modelo: m, calidad: chequearCalidad(m), ahora: INICIO + 20, version: 'x', registro: lectura.registro });
    const textos = h.valores.map((f) => String(f[0] ?? ''));
    expect(textos).toContain('Registro de riesgos');
    expect(textos).toContain('Un riesgo tiene la revisión vencida.');
  });

  it('un impacto cualitativo fuera de 1–5 o una revisión que no es fecha son errores', () => {
    const l = libro();
    const r = l[H.riesgos] as unknown[][];
    r[1]![13] = 7;
    r[2]![12] = 'pronto';
    expect(leerCronograma(l).errores.map((e) => `${e.columna}${e.fila}`)).toEqual(['N2', 'M3']);
  });

  it('el editor de riesgos conserva la revisión y el impacto cualitativo al guardar', () => {
    const l = libro();
    (l[H.riesgos] as unknown[][])[1]![13] = 4;
    const datos = leerEditores(l);
    const [bloque] = cambiosDe(l, { tipo: 'riesgos', datos: datos.riesgos });
    const fila = (bloque as { valores: unknown[][] }).valores[1]!;
    expect(fila[12]).toBe(INICIO + 30);
    expect(fila[13]).toBe(4);
  });
});
