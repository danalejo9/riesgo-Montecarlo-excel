/**
 * V5: seguimiento en el tiempo. Instantáneas de la simulación en la hoja
 * «Cronograma (seguimiento)», ida y vuelta, una por fecha de corte, y la
 * tendencia en palabras; con el libro de pruebas, del corte inicial al de
 * «Avance (prueba)».
 */
import { describe, expect, it } from 'vitest';

import {
  agregarInstantanea, hojaSeguimiento, instantaneaDe, leerCronograma, leerRiesgosPlazo, leerSeguimiento, serieLocal, simularPlazo, tendencia,
  OPCIONES_PLAZO_POR_DEFECTO, HOJA_SEGUIMIENTO, type Cronograma, type Instantanea,
} from '../../engine/cronograma/index.ts';
import { datosInformeCronograma } from '../../excel/informeCronograma.ts';
import { plantillaPorDefecto } from '../../excel/plantillaInforme.ts';
import { calcularCPM } from '../../engine/cronograma/cpm.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const hoja = (n: string) => leerHojaComoMatriz(LIBRO, n) as unknown[][];

/** El libro con la fecha de corte dada y, si se pide, el avance de «Avance (prueba)» copiado. */
function libro(corte: number, conAvance: boolean): Cronograma {
  const actividades = hoja('Actividades').map((f) => [...f]);
  const calendario = hoja('Calendario').map((f) => [...f]);
  if (conAvance) {
    const avance = hoja('Avance (prueba)');
    const encAct = actividades[2] as string[];
    const encAv = avance[3] as string[];
    for (const fila of avance.slice(4).filter((f) => f[0] !== '')) {
      const destino = actividades.find((f) => f[0] === fila[0]) as unknown[];
      // Sin la fecha límite de la fachada: su holgura negativa pone la salud en rojo y el panel no deja simular.
      encAv.slice(1).forEach((nombre, j) => {
        if (fila[j + 1] !== '' && nombre !== 'Terminar no después de') destino[encAct.indexOf(nombre)] = fila[j + 1];
      });
    }
  }
  (calendario[1] as unknown[])[1] = corte;
  const l = leerCronograma(actividades, calendario);
  if (!l.cronograma) throw new Error(l.problemas.map((p) => p.mensaje).join());
  return l.cronograma;
}

const INICIO = 46_419; // 01/02/2027
const CORTE_AVANCE = hoja('Avance (prueba)')[1]![1] as number; // 15/03/2027
const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 10_000 };

function inst(referencia: number, p80: number, extra: Partial<Instantanea> = {}): Instantanea {
  return {
    referencia, fechaCorte: referencia, guardada: referencia + 0.5, escenario: 'antes', iteraciones: 1000,
    finCronograma: p80 - 20, p50: p80 - 10, p80, p90: p80 + 5, probCumplir: 0.1, reservaDias: 15, ...extra,
  };
}

describe('instantáneas (V5)', () => {
  it('serieLocal: fecha y hora locales como número de serie de Excel', () => {
    expect(serieLocal(new Date(2027, 1, 1, 12, 0))).toBe(INICIO + 0.5);
  });

  it('la hoja va y vuelve igual (con la nota del usuario), ordenada por fecha de referencia', () => {
    const lista = [inst(INICIO + 60, 46_650, { nota: 'Tras el invierno', costoP50: 1e6, costoP80: 1.2e6, jcl: 0.7 }), inst(INICIO, 46_620)];
    const h = hojaSeguimiento(lista);
    expect(h.nombre).toBe(HOJA_SEGUIMIENTO);
    const vuelta = leerSeguimiento(h.valores);
    expect(vuelta).toEqual([...lista].sort((a, b) => a.referencia - b.referencia));
    expect(leerSeguimiento(undefined)).toEqual([]);
    expect(leerSeguimiento([['otra cosa']])).toEqual([]);
  });

  it('el gráfico de tendencia sale con dos o más: tres series con encabezado, fechas en los ejes', () => {
    expect(hojaSeguimiento([inst(INICIO, 46_620)]).graficos).toBeUndefined();
    const g = hojaSeguimiento([inst(INICIO, 46_620), inst(INICIO + 30, 46_625)]).graficos![0]!;
    expect(g).toMatchObject({ fila: 2, col: 0, filas: 3, series: 3, encabezado: true, tipo: 'lineas', formatoX: 'dd/mm/yyyy' });
    // Las columnas del gráfico son las cuatro primeras: referencia, fin del cronograma, P50, P80.
    expect(hojaSeguimiento([]).valores[2]!.slice(0, 4)).toEqual(['Fecha de referencia', 'Fin del cronograma', 'P50', 'P80']);
  });

  it('una por fecha de corte y escenario: el mismo corte reemplaza (y conserva la nota); sin corte, se añade', () => {
    const a = inst(INICIO, 46_620, { nota: 'Base' });
    let r = agregarInstantanea([a], inst(INICIO, 46_630));
    expect(r.reemplazada).toBe(true);
    expect(r.lista).toEqual([{ ...inst(INICIO, 46_630), nota: 'Base' }]);
    r = agregarInstantanea(r.lista, inst(INICIO, 46_610, { escenario: 'despues' }));
    expect(r.reemplazada).toBe(false);
    expect(r.lista).toHaveLength(2);
    const { fechaCorte: _sin, ...sinCorte } = inst(INICIO - 5, 46_600);
    void _sin;
    r = agregarInstantanea(r.lista, sinCorte);
    expect(r.reemplazada).toBe(false);
    expect(r.lista[0]).toEqual(sinCorte);
  });

  it('la tendencia en palabras: P80, probabilidad, costo y la racha', () => {
    expect(tendencia([inst(INICIO, 46_620)])).toEqual([]);
    const l = [
      inst(INICIO, 46_600),
      inst(INICIO + 30, 46_605),
      inst(INICIO + 60, 46_612, { costoP80: 1_000_000 }),
      inst(INICIO + 90, 46_620, { probCumplir: 0.04, costoP80: 1_050_000 }),
    ];
    expect(tendencia(l)).toEqual([
      'Desde el corte del 02/04/2027, el P80 se ha retrasado 8 días de calendario: del 13/08/2027 al 21/08/2027.',
      'La probabilidad de cumplir el cronograma bajó del 10 % al 4 %.',
      'El P80 del costo subió US$ 50.000, a US$ 1.050.000.',
      'Es la 3.ª instantánea seguida en que el P80 se retrasa: 20 días en total desde el 01/02/2027.',
    ]);
    expect(tendencia([inst(INICIO, 46_600), inst(INICIO + 30, 46_600)])[0]).toBe('Desde el corte del 01/02/2027, el P80 no se ha movido (01/08/2027).');
  });
});

describe('seguimiento con el libro de pruebas (V5)', () => {
  it('del corte inicial al de «Avance (prueba)»: dos instantáneas y su tendencia', async () => {
    const riesgos = (c: Cronograma) => leerRiesgosPlazo(hoja('Riesgos de plazo'), c.actividades).riesgos;
    const c1 = libro(INICIO, false);
    const r1 = await simularPlazo(c1, riesgos(c1), op);
    // Un corte en el inicio, sin avance, no cambia nada.
    const base = libro(INICIO, false);
    const sinCorte = { ...base, fechaCorte: undefined };
    expect((await simularPlazo(sinCorte, riesgos(base), op)).fechas).toEqual(r1.fechas);
    const c2 = libro(CORTE_AVANCE, true);
    const r2 = await simularPlazo(c2, riesgos(c2), op);
    let lista = agregarInstantanea([], instantaneaDe(r1, { fechaCorte: INICIO, escenario: 'antes', ahora: INICIO + 0.4 })).lista;
    lista = agregarInstantanea(lista, instantaneaDe(r2, { fechaCorte: CORTE_AVANCE, escenario: 'antes', ahora: CORTE_AVANCE + 0.4 })).lista;
    expect(lista.map((x) => x.p80)).toEqual([r1.fechas.p80, r2.fechas.p80]);
    expect(lista[1]!.reservaDias).toBe(r2.dias.p80 - Math.ceil(r2.determinista.dias - 1e-9));
    expect(lista[1]!.costoP80).toBe(r2.costos!.p80);
    const t = tendencia(lista);
    expect(t[0]).toMatch(/^Desde el corte del 01\/02\/2027, el P80 se ha (retrasado|adelantado) \d+ días de calendario/);
    // Y va al informe PDF.
    const cpm = calcularCPM(c2);
    if (!cpm.ok) throw new Error('cpm');
    const d = datosInformeCronograma({
      cronograma: c2, filas: cpm.filas, fechaFinProyecto: cpm.fechaFinProyecto, duracionProyecto: cpm.duracionProyecto,
      seguimiento: lista, plantilla: plantillaPorDefecto(),
    });
    expect(d.seguimiento).toEqual({ instantaneas: lista, tendencia: t });
  });
});
