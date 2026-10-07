/** V5: seguimiento en el tiempo (instantáneas en la hoja Seguimiento). */
import { describe, expect, it } from 'vitest';
import { simularCronograma } from '../../engine/cronograma/index.ts';
import { ETIQUETAS_CONFIG, hojasNuevasCronograma, leerCronograma, HOJAS_CRONOGRAMA as H } from '../../excel/cronogramaHojas.ts';
import { agregarInstantanea, guardarEnSeguimiento, instantaneasDe, leerSeguimiento, tendencia, type Instantanea } from '../../excel/seguimientoCronograma.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
import { aplicarCambios } from '../helpers/aplicarCambios.ts';

const INICIO = serieDeFecha(2027, 1, 4);
const libro = () => Object.fromEntries(hojasNuevasCronograma(INICIO).map((h) => [h.nombre, h.valores.map((f) => [...f])])) as Record<string, unknown[][]>;

function conCorte(l: Record<string, unknown[][]>, corte: number): void {
  const fila = l[H.config]!.find((f) => f[0] === ETIQUETAS_CONFIG.corte)!;
  fila[1] = corte;
}

const inst = (referencia: number, p80: number, extra: Partial<Instantanea> = {}): Instantanea => ({
  referencia, fechaCorte: referencia, guardada: referencia, escenario: 'antes', iteraciones: 1000, finCronograma: p80 - 30,
  p50: p80 - 10, p80, p90: p80 + 5, probCumplir: 0.1, reservaDias: 20, ...extra,
});

describe('instantáneas', () => {
  it('de una simulación del ejemplo: antes y después de mitigar, con la fecha de corte', async () => {
    const l = libro();
    conCorte(l, INICIO + 10);
    const m = leerCronograma(l).modelo!;
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 500 } });
    const [a, d] = instantaneasDe(sim, m, INICIO + 12.5);
    expect(a).toMatchObject({ escenario: 'antes', referencia: INICIO + 10, fechaCorte: INICIO + 10, guardada: INICIO + 12.5, iteraciones: 500 });
    expect(a!.p50).toBeLessThanOrEqual(a!.p80);
    expect(a!.p80).toBeLessThanOrEqual(a!.p90);
    expect(a!.costoP80).toBeGreaterThan(0);
    expect(a!.probMeta).toBeGreaterThan(0);
    expect(d?.escenario).toBe('despues');
  });

  it('se guardan en la hoja y se vuelven a leer; con el mismo corte se reemplaza y la nota se conserva', () => {
    const l = libro();
    const g1 = guardarEnSeguimiento(l[H.seguimiento], [inst(INICIO + 30, INICIO + 400)]);
    aplicarCambios(l, g1.cambios);
    l[H.seguimiento]![1]![15] = 'Llegó la licencia';
    const g2 = guardarEnSeguimiento(l[H.seguimiento], [inst(INICIO + 30, INICIO + 410), inst(INICIO + 60, INICIO + 415)]);
    expect(g2.reemplazadas).toBe(1);
    aplicarCambios(l, g2.cambios);
    const lista = leerSeguimiento(l[H.seguimiento]);
    expect(lista.map((x) => [x.referencia - INICIO, x.p80 - INICIO, x.nota ?? ''])).toEqual([[30, 410, 'Llegó la licencia'], [60, 415, '']]);
  });

  it('sin fecha de corte, cada guardado es una fila nueva', () => {
    const sin = (r: number) => { const x = inst(r, r + 300); delete x.fechaCorte; return x; };
    const a = agregarInstantanea([], sin(INICIO));
    const b = agregarInstantanea(a.lista, sin(INICIO));
    expect(b.reemplazada).toBe(false);
    expect(b.lista).toHaveLength(2);
  });
});

describe('tendencia', () => {
  it('compara con el corte anterior y cuenta la racha', () => {
    const l = [inst(INICIO, INICIO + 300), inst(INICIO + 30, INICIO + 305), inst(INICIO + 60, INICIO + 312, { probCumplir: 0.05 }), inst(INICIO + 90, INICIO + 320, { probCumplir: 0.02 })];
    const t = tendencia(l);
    expect(t[0]).toMatch(/el P80 se ha retrasado 8 días de calendario/);
    expect(t[1]).toMatch(/bajó del 5 % al 2 %/);
    expect(t.at(-1)).toMatch(/Es la 3\.ª instantánea seguida en que el P80 se retrasa: 20 días en total/);
    expect(tendencia(l.slice(0, 1))).toEqual([]);
  });
});
