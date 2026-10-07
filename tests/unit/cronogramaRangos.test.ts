/** V6: rellenar los rangos vacíos (biblioteca por tipo) y el aviso de rangos optimistas. */
import { describe, expect, it } from 'vitest';
import { BIBLIOTECA_RANGOS, chequearCalidad, tipoDe, type IncertidumbreActividad } from '../../engine/cronograma/index.ts';
import { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA as H, type MatrizHoja } from '../../excel/cronogramaHojas.ts';
import { leerRangosTipo, rellenarRangos } from '../../excel/rangosCronograma.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { modelo } from '../helpers/cronogramas.ts';

const libro = () => Object.fromEntries(hojasNuevasCronograma(serieDeFecha(2027, 1, 4)).map((h) => [h.nombre, h.valores.map((f) => [...f])])) as Record<string, unknown[][]>;

/** Aplica los cambios «rango» a la matriz, como lo haría Excel. */
function aplicar(l: Record<string, unknown[][]>, cambios: { hoja: string; op: string; fila?: number; col?: number; valores?: unknown[][] }[]): void {
  for (const c of cambios) {
    if (c.op !== 'rango') continue;
    const m = (l[c.hoja] ??= []);
    (c.valores ?? []).forEach((f, i) => {
      const fila = (m[(c.fila ?? 0) + i] ??= []);
      f.forEach((v, j) => { fila[(c.col ?? 0) + j] = v; });
    });
  }
}

describe('biblioteca de rangos', () => {
  it('reconoce el tipo por el grupo o por el nombre', () => {
    expect(tipoDe(BIBLIOTECA_RANGOS, '', 'Licencia de construcción')?.tipo).toBe('Trámites y permisos');
    expect(tipoDe(BIBLIOTECA_RANGOS, 'Instalaciones', 'Cualquier cosa')?.tipo).toBe('Instalaciones');
    expect(tipoDe(BIBLIOTECA_RANGOS, '', 'Reunión de arranque')).toBeUndefined();
  });

  it('el ejemplo trae la hoja Rangos_Tipo y se lee igual que la biblioteca', () => {
    const { tipos, problemas } = leerRangosTipo(libro()[H.rangosTipo] as MatrizHoja);
    expect(problemas).toEqual([]);
    expect(tipos.map((t) => [t.tipo, t.menos, t.mas])).toEqual(BIBLIOTECA_RANGOS.map((t) => [t.tipo, t.menos, t.mas]));
  });
});

describe('rellenar los rangos vacíos', () => {
  it('añade una fila por tarea sin rango (ni propio ni de grupo), con el tipo de la biblioteca', () => {
    const l = libro();
    // Sin incertidumbre (como tras importar).
    l[H.incertidumbre] = [l[H.incertidumbre]![0]!];
    // Una tarea terminada no se toca.
    const act = l[H.actividades]!;
    const fila = act.findIndex((f) => f[0] === 'A');
    act[fila]![11] = serieDeFecha(2027, 1, 4);
    act[fila]![12] = serieDeFecha(2027, 2, 8);
    const r = rellenarRangos(l);
    if (!r.ok) throw new Error(r.error);
    expect(r.creaBiblioteca).toBe(false);
    // Las 11 tareas menos la terminada.
    expect(r.actividades).toBe(10);
    expect(r.porTipo['Trámites y permisos']).toBe(1);
    aplicar(l, r.cambios);
    const m = leerCronograma(l).modelo!;
    expect(m.incertidumbre).toHaveLength(10);
    const b = m.incertidumbre.find((i) => i.actividad === 'B') as IncertidumbreActividad;
    expect(b).toMatchObject({ relativa: true, distribucion: { tipo: 'triangular', min: 0.9, moda: 1, max: 1.6 } });
    // Una segunda vez no añade nada.
    const r2 = rellenarRangos(l);
    expect(r2.ok && r2.actividades).toBe(0);
  });

  it('sin la hoja Rangos_Tipo, la crea con la biblioteca', () => {
    const l = libro();
    delete l[H.rangosTipo];
    l[H.incertidumbre] = [l[H.incertidumbre]![0]!];
    const r = rellenarRangos(l);
    expect(r.ok && r.creaBiblioteca).toBe(true);
    expect(r.ok && r.cambios[0]?.hoja).toBe(H.rangosTipo);
  });
});

describe('rangos optimistas en la calidad', () => {
  const red = Array.from({ length: 6 }, (_, i) => ({ id: `T${i}`, nombre: `T${i}`, duracion: 10, predecesoras: i ? [{ id: `T${i - 1}`, tipo: 'FC' as const, desfase: 0 }] : [] }));
  const criterio = (inc: IncertidumbreActividad[]) => chequearCalidad(modelo(red, inc)).criterios.find((c) => c.id === 'rangos');
  const tri = (min: number, moda: number, max: number) => ({ tipo: 'triangular' as const, min, moda, max });

  it('verde con rangos asimétricos hacia arriba y distintos', () => {
    expect(criterio(red.map((a, i) => ({ actividad: a.id, distribucion: tri(9, 10, 12 + i) })))?.estado).toBe('verde');
  });

  it('amarillo con rangos estrechos o con más margen para acortarse', () => {
    const c = criterio(red.map((a) => ({ actividad: a.id, distribucion: tri(7, 10, 11) })));
    expect(c?.estado).toBe('amarillo');
    expect(c?.detalle).toMatch(/más margen para acortarse/);
    expect(criterio(red.map((a) => ({ actividad: a.id, distribucion: tri(9.8, 10, 10.5) })))?.detalle).toMatch(/menos del 15 %/);
  });

  it('amarillo si todos llevan los mismos porcentajes (rellenados en bloque)', () => {
    const c = criterio(red.map((a) => ({ actividad: a.id, distribucion: tri(0.9, 1, 1.25), relativa: true })));
    expect(c?.estado).toBe('amarillo');
    expect(c?.detalle).toMatch(/mismos porcentajes \(−10 % y \+25 %\)/);
  });
});
