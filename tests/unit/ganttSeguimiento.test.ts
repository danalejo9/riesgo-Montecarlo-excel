/** Gantt G3: seguimiento (fecha de corte, terminadas, en curso, lógica retenida o anulación por progreso). */
import { describe, expect, it } from 'vitest';
import { compilarRed, cpmDeterministico, LUNES_A_VIERNES, type ActividadRed, type DefinicionRed } from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const INI = serieDeFecha(2027, 1, 4); // lunes
const d = (dia: number, mes = 1) => serieDeFecha(2027, mes, dia);
const fc = (id: string) => ({ id, tipo: 'FC' as const, desfase: 0 });
const red = (acts: ActividadRed[], extra: Partial<DefinicionRed> = {}) =>
  compilarRed({ inicio: INI, calendarios: [{ id: 'c', laborables: LUNES_A_VIERNES }], actividades: acts, ...extra });
const fila = (r: ReturnType<typeof cpmDeterministico>, id: string) => r.filas.find((f) => f.id === id)!;

// A(5) → B(10) → C(5); D(3) en paralelo desde el inicio, → C.
const base: ActividadRed[] = [
  { id: 'A', nombre: 'A', duracion: 5, predecesoras: [] },
  { id: 'B', nombre: 'B', duracion: 10, predecesoras: [fc('A')] },
  { id: 'D', nombre: 'D', duracion: 3, predecesoras: [] },
  { id: 'C', nombre: 'C', duracion: 5, predecesoras: [fc('B'), fc('D')] },
];

describe('seguimiento (G3)', () => {
  it('sin avance ni fecha de corte, el cálculo de siempre', () => {
    const r = cpmDeterministico(red(base));
    expect([fila(r, 'A').inicio, fila(r, 'B').inicio, fila(r, 'C').fin]).toEqual([d(4), d(11), d(29)]);
  });

  it('terminada con sus fechas reales (aunque tardó más); la holgura no la vuelve crítica', () => {
    const acts = base.map((a) => (a.id === 'A' ? { ...a, avance: { inicioReal: d(4), finReal: d(12) } } : a));
    const r = cpmDeterministico(red(acts, { fechaCorte: d(13) }));
    const A = fila(r, 'A');
    expect([A.inicio, A.fin, A.duracion]).toEqual([d(4), d(12), 7]);
    expect(A.critica).toBe(false);
    // B empieza al día siguiente del fin real de A.
    expect(fila(r, 'B').inicio).toBe(d(13));
  });

  it('en curso: lo restante desde la fecha de corte; nada pendiente antes de la fecha de corte', () => {
    const acts = base.map((a) => (a.id === 'A' ? { ...a, avance: { inicioReal: d(4), finReal: d(8) } }
      : a.id === 'B' ? { ...a, avance: { inicioReal: d(11), restante: 6 } } : a));
    // Corte el lunes 18/01: B lleva una semana y le faltan 6 días: termina el 25/01.
    const r = cpmDeterministico(red(acts, { fechaCorte: d(18) }));
    const B = fila(r, 'B');
    expect([B.inicio, B.fin]).toEqual([d(11), d(25)]);
    // D no ha empezado: no puede empezar antes del corte aunque no tenga predecesoras.
    expect(fila(r, 'D').inicio).toBe(d(18));
    expect(fila(r, 'C').inicio).toBe(d(26));
    expect(B.critica).toBe(true);
  });

  it('el % completado da la duración restante', () => {
    const acts = base.map((a) => (a.id === 'A' ? { ...a, avance: { inicioReal: d(4), finReal: d(8) } }
      : a.id === 'B' ? { ...a, avance: { inicioReal: d(11), porcentaje: 0.4 } } : a));
    const r = cpmDeterministico(red(acts, { fechaCorte: d(18) }));
    // 10 × 60 % = 6 días desde el 18/01.
    expect(fila(r, 'B').fin).toBe(d(25));
  });

  it('lógica retenida frente a anulación por progreso (avance fuera de secuencia)', () => {
    // B empezó el 06/01 aunque A (su predecesora) aún no termina: A en curso con 4 días restantes al corte.
    const acts = base.map((a) => (a.id === 'A' ? { ...a, avance: { inicioReal: d(4), restante: 4 } }
      : a.id === 'B' ? { ...a, avance: { inicioReal: d(6), restante: 3 } } : a));
    const corte = d(11);
    const retenida = cpmDeterministico(red(acts, { fechaCorte: corte, logicaProgreso: 'retenida' }));
    const anulacion = cpmDeterministico(red(acts, { fechaCorte: corte, logicaProgreso: 'anulacion' }));
    // A termina el 14/01 (11, 12, 13, 14). Retenida: lo que falta de B (3 días) espera: 15, 18, 19.
    expect(fila(retenida, 'A').fin).toBe(d(14));
    expect(fila(retenida, 'B').fin).toBe(d(19));
    // Anulación: B sigue desde el corte: 11, 12, 13.
    expect(fila(anulacion, 'B').fin).toBe(d(13));
  });

  it('un fin real anterior al comienzo real es un error', () => {
    expect(() => red(base.map((a) => (a.id === 'A' ? { ...a, avance: { inicioReal: d(8), finReal: d(5) } } : a)))).toThrow(/anterior a su comienzo/);
  });
});

describe('seguimiento en las hojas, la vista y la edición', async () => {
  const { hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA: H, ETIQUETAS_CONFIG } = await import('../../excel/cronogramaHojas.ts');
  const { construirVista } = await import('../../excel/gantt.ts');
  const { aplicarOperacion } = await import('../../excel/edicionGantt.ts');
  const libro = () => Object.fromEntries(hojasNuevasCronograma(INI).map((h) => [h.nombre, h.valores.map((f) => [...f])])) as Record<string, unknown[][]>;
  const vista = (h: Record<string, unknown[][]>) => {
    const l = leerCronograma(h);
    expect(l.errores).toEqual([]);
    return construirVista({ version: 1, modelo: l.modelo!, orden: l.orden!, vinculosResumen: l.vinculosResumen! });
  };
  const editar = (h: Record<string, unknown[][]>, op: Parameters<typeof aplicarOperacion>[1]) => {
    const r = aplicarOperacion(h, op);
    if (!r.ok) throw new Error(r.error);
    return r.hojas as Record<string, unknown[][]>;
  };

  it('fecha de corte en Config, avance editado desde el Gantt y calidad de seguimiento', () => {
    let h = libro();
    const cfg = h[H.config]!;
    const fila = cfg.findIndex((f) => f[0] === ETIQUETAS_CONFIG.corte);
    cfg[fila]![1] = d(1, 3); // corte el 01/03/2027
    h = editar(h, { op: 'campo', id: 'INI', campo: 'finReal', valor: d(4) });
    h = editar(h, { op: 'campo', id: 'INI', campo: 'inicioReal', valor: d(4) });
    h = editar(h, { op: 'campo', id: 'A', campo: 'inicioReal', valor: d(4) });
    h = editar(h, { op: 'campo', id: 'A', campo: 'finReal', valor: d(12, 2) });
    h = editar(h, { op: 'campo', id: 'B', campo: 'inicioReal', valor: d(15, 2) });
    h = editar(h, { op: 'campo', id: 'B', campo: 'porcentaje', valor: 0.2 });
    const v = vista(h);
    expect(v.fechaCorte).toBe(d(1, 3));
    const A = v.filas.find((f) => f.id === 'A')!;
    const B = v.filas.find((f) => f.id === 'B')!;
    expect(A.estado).toBe('terminada');
    expect(A.fin).toBe(d(12, 2));
    expect(A.critica).toBe(false);
    expect(B.estado).toBe('en curso');
    expect(B.avance).toBeCloseTo(0.2);
    // Lo que falta de B: 45 × 80 % = 36 días laborables desde el 01/03.
    expect(B.restante).toBe(36);
    // C no ha empezado: no antes del corte.
    expect(v.filas.find((f) => f.id === 'C')!.inicio).toBeGreaterThanOrEqual(d(1, 3));
    expect(v.calidad.find((c) => c.id === 'fechas-invalidas')!.estado).toBe('verde');
    expect(v.calidad.find((c) => c.id === 'fuera-secuencia')!.estado).toBe('verde');
    // Las terminadas no cuentan como «holgura total mayor de 44 días».
    expect(v.calidad.find((c) => c.id === 'holgura')!.actividades).not.toContain('A');
    // El resumen S1 está en curso, con el avance ponderado por duración.
    const S1 = v.filas.find((f) => f.id === 'S1')!;
    expect(S1.estado).toBe('en curso');
    expect(S1.avance).toBeGreaterThan(0.3);
    // Un fin real después del corte se señala; avance fuera de secuencia también.
    const h2 = editar(h, { op: 'campo', id: 'D', campo: 'inicioReal', valor: d(20, 2) });
    const v2 = vista(editar(h2, { op: 'campo', id: 'C', campo: 'finReal', valor: d(10, 3) }));
    expect(v2.calidad.find((c) => c.id === 'fechas-invalidas')!.actividades).toEqual(['C']);
    expect(v2.calidad.find((c) => c.id === 'fuera-secuencia')!.actividades).toContain('D');
    expect(aplicarOperacion(h, { op: 'campo', id: 'B', campo: 'porcentaje', valor: 150 }).ok).toBe(false);
    expect(aplicarOperacion(h, { op: 'campo', id: 'S1', campo: 'porcentaje', valor: 0.5 }).ok).toBe(false);
  });
});
