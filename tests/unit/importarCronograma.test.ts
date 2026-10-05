/**
 * Importar MS Project XML y Primavera P6 XER (QRSA Q2.7 y Q3.1): los
 * cronogramas de referencia, importados y calculados, tienen que dar las
 * fechas esperadas, día por día.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importarCronograma, hojasImportadas, resumenImportacion, calendarioXer, leerXml } from '../../excel/importarCronograma.ts';
import { leerCronograma } from '../../excel/cronogramaHojas.ts';
import { compilarRed, cpmDeterministico } from '../../engine/cronograma/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';

const DIR = new URL('../fixtures/qrsa/', import.meta.url);
const serie = (iso: string) => { const [a, m, d] = iso.split('-').map(Number) as [number, number, number]; return serieDeFecha(a, m, d); };

function comprobar(archivo: string, esperado: string, codificacion: BufferEncoding = 'utf8') {
  const imp = importarCronograma(readFileSync(new URL(archivo, DIR)).toString(codificacion));
  const hojas = Object.fromEntries(hojasImportadas(imp).map((h) => [h.nombre, h.valores]));
  const lectura = leerCronograma(hojas);
  expect(lectura.errores).toEqual([]);
  const r = cpmDeterministico(compilarRed(lectura.modelo!.red));
  const filas = readFileSync(new URL(esperado, DIR), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  for (const [id, , , inicio, fin, holgura] of filas) {
    const nombre = `${id}`;
    const f = r.filas.find((x) => x.nombre.startsWith(`${nombre} ·`) || x.id === nombre);
    expect({ id, inicio: f?.inicio, fin: f?.fin, holgura: f?.holguraTotal }).toEqual({ id, inicio: serie(inicio as string), fin: serie(fin as string), holgura: Number(holgura) });
  }
  return imp;
}

describe('importar MS Project XML', () => {
  it('R1, R2 y R3 dan las fechas de referencia (R3 con festivos y desfase en días calendario)', () => {
    const r1 = comprobar('R1-simple.xml', 'R1-simple-esperado.csv');
    expect(resumenImportacion(r1)).toEqual({ actividades: 6, hitos: 1, resumenes: 0, relaciones: 7, calendarios: 1 });
    comprobar('R2-relaciones.xml', 'R2-relaciones-esperado.csv');
    const r3 = comprobar('R3-calendario.xml', 'R3-calendario-esperado.csv');
    expect(r3.calendarios[0]?.festivos.length).toBe(36);
    expect(r3.relaciones.find((x) => x.calendario)).toMatchObject({ predecesora: '5', sucesora: '6', desfase: 7 });
  });

  it('lee entidades y espacios de nombres', () => {
    const x = leerXml('<?xml version="1.0"?><p:Project xmlns:p="x"><Name>Obra &amp; vía</Name><!-- c --><Vacío/></p:Project>');
    expect(x.hijos[0]?.nombre).toBe('Project');
    expect(x.hijos[0]?.hijos[0]?.texto).toBe('Obra & vía');
  });

  it('un archivo que no es un cronograma se rechaza con un mensaje claro', () => {
    expect(() => importarCronograma('hola')).toThrow(/MS Project o un XER/);
    expect(() => importarCronograma('<html></html>')).toThrow(/MS Project/);
  });
});

describe('importar Primavera P6 XER', () => {
  it('R1 y R2 dan las fechas de referencia', () => {
    const r1 = comprobar('R1-simple.xer', 'R1-simple-esperado.csv', 'latin1');
    expect(r1.formato).toBe('Primavera P6 XER');
    comprobar('R2-relaciones.xer', 'R2-relaciones-esperado.csv', 'latin1');
  });

  it('el calendario de P6: días laborables y excepciones', () => {
    const c = calendarioXer('X', '(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|17:00)())))(0||3()())(0||4()((0||0(s|08:00|f|17:00)())))(0||5()((0||0(s|08:00|f|17:00)())))(0||6()((0||0(s|08:00|f|17:00)())))(0||7()((0||0(s|08:00|f|12:00)())))))(0||Exceptions()((0||0(d|46388)())(0||1(d|46400)((0||0(s|08:00|f|12:00)())))))))');
    expect(c.laborables).toEqual([true, false, true, true, true, true, false]);
    expect(c.festivos).toEqual([46388]);
    expect(c.trabajados).toEqual([46400]);
  });
});

describe('informe ejecutivo y CSV del cronograma (Q3.7)', () => {
  it('arma los datos del informe y el CSV de las iteraciones', async () => {
    const { hojasNuevasCronograma } = await import('../../excel/cronogramaHojas.ts');
    const { simularCronograma, chequearCalidad } = await import('../../engine/cronograma/index.ts');
    const { datosInformeCronograma, csvIteraciones } = await import('../../excel/informeCronograma.ts');
    const m = leerCronograma(Object.fromEntries(hojasNuevasCronograma(serie('2027-01-04')).map((h) => [h.nombre, h.valores]))).modelo!;
    const modelo = { ...m, configuracion: { ...m.configuracion, iteraciones: 500 } };
    const sim = await simularCronograma(modelo);
    const d = datosInformeCronograma(sim, modelo, chequearCalidad(modelo), '0.8.0', new Date(Date.UTC(2026, 9, 5)));
    expect(d.costo?.contingencia).toBeGreaterThan(0);
    expect(d.jcl?.jcl).toBeGreaterThan(0);
    expect(d.prePost.length).toBeGreaterThan(4);
    expect(d.riesgos.map((r) => r.id)).toHaveLength(4);
    expect(d.fin.curvaS.length).toBeLessThanOrEqual(201);
    const csv = csvIteraciones(sim).split('\r\n');
    expect(csv[0]).toMatch(/^\uFEFFIteración;Fin \(días\);Fin \(fecha\);Costo;M \(fecha\);Duración INI/);
    expect(csv).toHaveLength(502);
  });
});
