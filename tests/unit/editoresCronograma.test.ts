/** Editores en ventana (06/10): calendarios, riesgos e impactos, ramas. */
import { describe, expect, it } from 'vitest';
import { hojasNuevasCronograma, leerCronograma } from '../../excel/cronogramaHojas.ts';
import { aplicarCambios, invertirCambios } from '../../excel/edicionGantt.ts';
import { anadirFestivosColombia, calendariosEnUso, cambiosDe, erroresTrasGuardar, leerEditores, revisarPedido } from '../../excel/editoresCronograma.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { cpmDeterministico, compilarRed } from '../../engine/cronograma/index.ts';

const INI = serieDeFecha(2027, 1, 4);
type Libro = Record<string, unknown[][]>;
const libro = (): Libro => Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, h.valores.map((f) => [...f])]));
const fin = (h: Libro) => {
  const l = leerCronograma(h);
  expect(l.errores).toEqual([]);
  return cpmDeterministico(compilarRed(l.modelo!.red)).fin;
};

describe('leer los editores', () => {
  it('lee calendarios, festivos, riesgos con impactos y actividades del ejemplo', () => {
    const d = leerEditores(libro());
    expect(d.calendarios.calendarios.map((c) => c.nombre)).toEqual(['Lunes a viernes', 'Lunes a sábado']);
    expect(d.calendarios.calendarios[1]!.laborables).toEqual([true, true, true, true, true, true, false]);
    expect(d.calendarios.excepciones.find((e) => e.fecha === serieDeFecha(2027, 3, 22))?.descripcion).toBe('San José');
    expect(d.riesgos.map((r) => r.id)).toEqual(['R1', 'R2', 'R3', 'R4']);
    expect(d.riesgos[0]!.impactos.map((i) => i.actividad)).toEqual(['E', 'H']);
    expect(d.riesgos[0]!.probabilidad).toBe(0.35);
    expect(d.ramas).toEqual([]);
    expect(d.actividades.find((a) => a.id === 'E')?.calendario).toBe('Lunes a sábado');
    expect(d.actividades.some((a) => a.id === 'S1')).toBe(false);
    expect(calendariosEnUso(d).get('lunes a sabado')).toEqual(['E']);
  });
});

describe('guardar', () => {
  it('guardar sin cambiar nada deja el mismo cronograma', () => {
    const h = libro();
    const d = leerEditores(h);
    let g = h;
    for (const p of [{ tipo: 'calendarios', datos: d.calendarios }, { tipo: 'riesgos', datos: d.riesgos }, { tipo: 'ramas', datos: d.ramas }] as const) {
      g = aplicarCambios(g, cambiosDe(g, p)) as Libro;
    }
    expect(fin(g)).toBe(fin(h));
    expect(JSON.stringify(leerCronograma(g).modelo!.riesgos)).toBe(JSON.stringify(leerCronograma(h).modelo!.riesgos));
  });

  it('renombrar un calendario lo renombra en Actividades; deshacer lo devuelve', () => {
    const h = libro();
    const d = leerEditores(h);
    const cals = d.calendarios.calendarios.map((c) => (c.nombre === 'Lunes a sábado' ? { ...c, nombre: 'Seis días' } : c));
    const cambios = cambiosDe(h, { tipo: 'calendarios', datos: { ...d.calendarios, calendarios: cals } });
    expect(erroresTrasGuardar(h, cambios)).toEqual([]);
    const g = aplicarCambios(h, cambios) as Libro;
    expect(leerEditores(g).actividades.find((a) => a.id === 'E')?.calendario).toBe('Seis días');
    expect(fin(g)).toBe(fin(h));
    const vuelta = aplicarCambios(g, invertirCambios(cambios)) as Libro;
    expect(leerEditores(vuelta).calendarios.calendarios.map((c) => c.nombre)).toEqual(['Lunes a viernes', 'Lunes a sábado']);
  });

  it('quitar un calendario que usa una actividad da error antes de escribir', () => {
    const h = libro();
    const d = leerEditores(h);
    const cambios = cambiosDe(h, { tipo: 'calendarios', datos: { ...d.calendarios, calendarios: d.calendarios.calendarios.slice(0, 1) } });
    const e = erroresTrasGuardar(h, cambios);
    expect(e.length).toBeGreaterThan(0);
    expect(e[0]!.hoja).toBe('Actividades');
  });

  it('hacer laborable el sábado en «Lunes a viernes» adelanta el fin', () => {
    const h = libro();
    const d = leerEditores(h);
    const cals = d.calendarios.calendarios.map((c, i) => (i === 0 ? { ...c, laborables: [true, true, true, true, true, true, false] } : c));
    const g = aplicarCambios(h, cambiosDe(h, { tipo: 'calendarios', datos: { ...d.calendarios, calendarios: cals } })) as Libro;
    expect(fin(g)).toBeLessThan(fin(h));
  });

  it('añadir festivos de Colombia no repite los que ya están', () => {
    const d = leerEditores(libro());
    const n = d.calendarios.excepciones.length;
    expect(anadirFestivosColombia(d.calendarios.excepciones, 2027, 2028)).toHaveLength(n);
    expect(anadirFestivosColombia(d.calendarios.excepciones, 2040, 2040).length).toBe(n + 18);
  });

  it('riesgos: cambiar la probabilidad y añadir un impacto llega al modelo', () => {
    const h = libro();
    const d = leerEditores(h);
    const riesgos = d.riesgos.map((r) => (r.id === 'R3' ? { ...r, probabilidad: 0.3, impactos: [...r.impactos, { actividad: 'E', distribucion: 'Triangular', min: 2, mp: 3, max: 5, costoMin: null, costoMp: null, costoMax: null }] } : r));
    expect(revisarPedido({ tipo: 'riesgos', datos: riesgos }, d.actividades.map((a) => a.id))).toEqual([]);
    const g = aplicarCambios(h, cambiosDe(h, { tipo: 'riesgos', datos: riesgos })) as Libro;
    const r3 = leerCronograma(g).modelo!.riesgos.find((r) => r.id === 'R3')!;
    expect(r3.probabilidad).toBe(0.3);
    expect(r3.impactos.map((i) => i.actividad)).toEqual(['D', 'E']);
    // Quitar R4 borra su fila de Riesgos y la de Impactos.
    const sinR4 = aplicarCambios(h, cambiosDe(h, { tipo: 'riesgos', datos: d.riesgos.filter((r) => r.id !== 'R4') })) as Libro;
    expect(leerCronograma(sinR4).errores).toEqual([]);
    expect(leerCronograma(sinR4).modelo!.riesgos.map((r) => r.id)).toEqual(['R1', 'R2', 'R3']);
  });

  it('riesgos: lo que está mal se dice antes de mandar', () => {
    const d = leerEditores(libro());
    const mal = d.riesgos.map((r, i) => (i === 1 ? { ...r, id: 'R1', probabilidad: 1.5, impactos: [{ ...r.impactos[0]!, actividad: 'ZZ' }] } : r));
    const e = revisarPedido({ tipo: 'riesgos', datos: mal }, d.actividades.map((a) => a.id));
    expect(e).toContain('«R1» está repetido.');
    expect(e).toContain('R1, probabilidad: tiene que estar entre 0 % y 100 %.');
    expect(e).toContain('R1: la actividad «ZZ» no existe.');
  });

  it('ramas: se escriben y el modelo las lee; la suma tiene que dar 100 %', () => {
    const h = libro();
    const ids = leerEditores(h).actividades.map((a) => a.id);
    const ramas = [{ nombre: 'Licencia', opciones: [{ nombre: 'Trámite normal', probabilidad: 0.7, actividades: 'B' }, { nombre: 'Ya aprobada', probabilidad: 0.3, actividades: 'C' }] }];
    expect(revisarPedido({ tipo: 'ramas', datos: ramas }, ids)).toEqual([]);
    const g = aplicarCambios(h, cambiosDe(h, { tipo: 'ramas', datos: ramas })) as Libro;
    expect(leerCronograma(g).modelo!.ramas?.[0]?.opciones.map((o) => o.probabilidad)).toEqual([0.7, 0.3]);
    expect(leerEditores(g).ramas).toEqual(ramas);
    const mal = [{ ...ramas[0]!, opciones: [ramas[0]!.opciones[0]!, { ...ramas[0]!.opciones[1]!, probabilidad: 0.4 }] }];
    expect(revisarPedido({ tipo: 'ramas', datos: mal }, ids)).toEqual(['Las opciones de «Licencia» suman 110 %; tienen que sumar 100 %.']);
  });
});
