/**
 * P4: importar cronogramas de MS Project (XML) y Primavera P6 (XER). Los
 * archivos de ejemplo los genera `ejemplos/generar-cronograma.py` con las
 * fechas de la hoja «Esperado» como las del programa de origen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  calcularCPM, calendarioDeClndr, hojaActividadesDe, hojaCalendarioDe, importarCronograma, leerCronograma, leerMspdi, leerXer,
  textoRelacion, verificarContraFuente,
} from '../../engine/cronograma/index.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';

const LIBRO = 'ejemplos/demo-cronograma.xlsx';
const archivo = (n: string) => new Uint8Array(readFileSync(`ejemplos/${n}`));
const esperado = leerHojaComoMatriz(LIBRO, 'Esperado') as unknown[][];
const filasEsperadas = esperado.slice(5).filter((f) => f[0] !== '');

describe('MS Project (XML)', () => {
  const imp = importarCronograma('demo-cronograma.xml', archivo('demo-cronograma.xml'));

  it('traduce tareas, relaciones, calendario, restricciones y la categoría del campo personalizado', () => {
    expect(imp.fuente).toBe('MS Project');
    expect(imp.proyecto).toBe('Centro comunitario');
    expect(imp.avisos).toEqual([]);
    const a = imp.cronograma.actividades;
    expect(a).toHaveLength(20);
    const por = (id: string) => a.find((x) => x.id === id)!;
    expect(por('8').predecesoras.map(textoRelacion)).toEqual(['3FC+5']);
    expect(por('10').predecesoras.map(textoRelacion)).toEqual(['7CC+10']);
    expect(por('12').predecesoras.map(textoRelacion)).toEqual(['7FC-5']);
    expect(por('16').predecesoras.map(textoRelacion)).toEqual(['10FF+3', '11FF+3']);
    expect(por('20').predecesoras.map(textoRelacion)).toEqual(['19CF']);
    expect(por('19').duracion).toBe(0);
    expect(por('7')).toMatchObject({ duracion: 30, categoria: 'Obra gris' });
    expect(por('17').inicioNoAntesDe).toBeDefined();
    expect(imp.cronograma.calendario.festivos.size).toBe(5);
  });

  it('nuestro CPM da las mismas fechas que MS Project y que «Esperado»', () => {
    const v = verificarContraFuente(imp);
    expect(v).toMatchObject({ total: 20, coinciden: 20, diferencias: [] });
    const r = calcularCPM(imp.cronograma);
    if (!r.ok) throw new Error('cpm');
    for (const f of filasEsperadas) {
      const x = r.filas.find((y) => y.id === f[0])!;
      expect([x.fechaInicio, x.fechaFin]).toEqual([f[3], f[4]]);
    }
  });

  it('escrito en las hojas y vuelto a leer, es el mismo cronograma', () => {
    const lectura = leerCronograma(hojaActividadesDe(imp.cronograma, 'x').valores, hojaCalendarioDe(imp.cronograma).valores);
    expect(lectura.problemas).toEqual([]);
    const a = lectura.cronograma!;
    expect(a.inicio).toBe(imp.cronograma.inicio);
    expect([...a.calendario.festivos]).toEqual([...imp.cronograma.calendario.festivos].sort((x, y) => x - y));
    expect(a.actividades.map((x) => ({ ...x, fila: undefined }))).toEqual(imp.cronograma.actividades.map((x) => ({ ...x, fila: undefined })));
  });

  it('tareas de resumen: sus relaciones pasan a las hijas y dan la categoría', () => {
    const xml = `<Project><StartDate>2027-02-01T08:00:00</StartDate><MinutesPerDay>480</MinutesPerDay><Tasks>
      <Task><UID>1</UID><ID>1</ID><Name>Diseño</Name><OutlineLevel>1</OutlineLevel><Summary>0</Summary><Duration>PT40H0M0S</Duration></Task>
      <Task><UID>2</UID><ID>2</ID><Name>Obra</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
        <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
      <Task><UID>3</UID><ID>3</ID><Name>Cimientos</Name><OutlineLevel>2</OutlineLevel><Summary>0</Summary><Duration>PT80H0M0S</Duration></Task>
      <Task><UID>4</UID><ID>4</ID><Name>Muros</Name><OutlineLevel>2</OutlineLevel><Summary>0</Summary><Duration>PT24H0M0S</Duration>
        <PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type><LinkLag>2400</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
      <Task><UID>5</UID><ID>5</ID><Name>Entrega</Name><OutlineLevel>1</OutlineLevel><Summary>0</Summary><Milestone>1</Milestone><Duration>PT0H0M0S</Duration>
        <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
    </Tasks></Project>`;
    const imp2 = leerMspdi(xml);
    const por = (id: string) => imp2.cronograma.actividades.find((x) => x.id === id)!;
    expect(imp2.cronograma.actividades.map((x) => x.id)).toEqual(['1', '3', '4', '5']);
    expect(por('3').predecesoras.map(textoRelacion)).toEqual(['1']);
    expect(por('4').predecesoras.map(textoRelacion).sort()).toEqual(['1', '3FC+0.5']);
    expect(por('5').predecesoras.map(textoRelacion).sort()).toEqual(['3', '4']);
    expect(por('4').categoria).toBe('Obra');
    expect(imp2.avisos[0]).toContain('tareas de resumen');
  });

  it('avance, fecha de estado y restricciones de Project', () => {
    const xml = `<Project><StartDate>2027-02-01T08:00:00</StartDate><StatusDate>2027-02-15T17:00:00</StatusDate><Tasks>
      <Task><UID>1</UID><ID>1</ID><Name>A</Name><OutlineLevel>1</OutlineLevel><Duration>PT40H0M0S</Duration>
        <ActualStart>2027-02-01T08:00:00</ActualStart><ActualFinish>2027-02-08T17:00:00</ActualFinish></Task>
      <Task><UID>2</UID><ID>2</ID><Name>B</Name><OutlineLevel>1</OutlineLevel><Duration>PT80H0M0S</Duration>
        <ActualStart>2027-02-09T08:00:00</ActualStart><RemainingDuration>PT32H0M0S</RemainingDuration><ConstraintType>7</ConstraintType>
        <ConstraintDate>2027-03-01T17:00:00</ConstraintDate></Task>
      <Task><UID>3</UID><ID>3</ID><Name>C</Name><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration><ConstraintType>1</ConstraintType>
        <Deadline>2027-03-05T17:00:00</Deadline></Task>
    </Tasks></Project>`;
    const imp2 = leerMspdi(xml);
    const [a, b, c] = imp2.cronograma.actividades;
    expect(imp2.cronograma.fechaCorte).toBeDefined();
    expect(a).toMatchObject({ finReal: expect.any(Number), inicioReal: expect.any(Number) });
    expect(b).toMatchObject({ inicioReal: expect.any(Number), restante: 4, terminarNoDespuesDe: expect.any(Number) });
    expect(c!.terminarNoDespuesDe).toBeDefined();
    expect(imp2.avisos.join()).toContain('lo más tarde posible');
  });
});

describe('Primavera P6 (XER)', () => {
  const imp = importarCronograma('demo-cronograma.xer', archivo('demo-cronograma.xer'));

  it('traduce actividades (código como ID), relaciones, calendario de clndr_data y WBS como categoría', () => {
    expect(imp.fuente).toBe('Primavera P6');
    expect(imp.proyecto).toBe('CENTRO-COM');
    expect(imp.avisos).toEqual([]);
    const por = (id: string) => imp.cronograma.actividades.find((x) => x.id === id)!;
    expect(por('A80').predecesoras.map(textoRelacion)).toEqual(['A30FC+5']);
    expect(por('A160').predecesoras.map(textoRelacion)).toEqual(['A100FF+3', 'A110FF+3']);
    expect(por('A70')).toMatchObject({ duracion: 30, categoria: 'Obra gris' });
    expect(imp.cronograma.calendario.laborables).toEqual([false, true, true, true, true, true, false]);
    expect(imp.cronograma.calendario.festivos.size).toBe(5);
  });

  it('nuestro CPM da las mismas fechas que P6', () => {
    expect(verificarContraFuente(imp)).toMatchObject({ total: 20, coinciden: 20 });
    const r = calcularCPM(imp.cronograma);
    if (!r.ok) throw new Error('cpm');
    expect(r.fechaFinProyecto).toBe(esperado[1]![1]);
  });

  it('clndr_data: días con periodos, excepciones no laborables y laborables', () => {
    const c = calendarioDeClndr('(0||CalendarData()(\x7f\x7f  (0||DaysOfWeek()(\x7f\x7f    (0||1()())\x7f\x7f    (0||2()(\x7f\x7f      (0||0(s|07:00|f|17:00)())))\x7f\x7f    (0||7()(\x7f\x7f      (0||0(s|08:00|f|12:00)())))))\x7f\x7f  (0||Exceptions()(\x7f\x7f    (0||0(d|46000)())\x7f\x7f    (0||1(d|46001)(\x7f\x7f      (0||0(s|08:00|f|12:00)())))))))');
    expect(c.laborables).toEqual([false, true, false, false, false, false, true]);
    expect(c.festivos).toEqual([46000]);
  });

  it('avance, LOE, varios proyectos y restricciones de P6', () => {
    const xer = ['ERMHDR\t19.12', '%T\tPROJECT', '%F\tproj_id\tproj_short_name\tplan_start_date\tlast_recalc_date',
      '%R\t1\tGRANDE\t2027-02-01 08:00\t2027-02-15 08:00', '%R\t2\tOTRO\t2027-02-01 08:00\t',
      '%T\tTASK', '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_drtn_hr_cnt\tremain_drtn_hr_cnt\tact_start_date\tact_end_date\tcstr_type\tcstr_date',
      '%R\t10\t1\tA\tHecha\tTT_Task\tTK_Complete\t40\t0\t2027-02-01 08:00\t2027-02-05 17:00\t\t',
      '%R\t11\t1\tB\tEn curso\tTT_Task\tTK_Active\t80\t24\t2027-02-08 08:00\t\tCS_MEOB\t2027-03-01 17:00',
      '%R\t12\t1\tC\tGestión\tTT_LOE\tTK_NotStart\t80\t80\t\t\t\t',
      '%R\t20\t2\tZ\tDel otro\tTT_Task\tTK_NotStart\t8\t8\t\t\t\t',
      '%T\tTASKPRED', '%F\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt', '%R\t11\t10\tPR_FS\t0', '%R\t11\t20\tPR_FS\t0', '%E'].join('\r\n');
    const imp2 = leerXer(xer);
    expect(imp2.proyecto).toBe('GRANDE');
    expect(imp2.cronograma.actividades.map((x) => x.id)).toEqual(['A', 'B']);
    expect(imp2.cronograma.fechaCorte).toBeDefined();
    expect(imp2.cronograma.actividades[1]).toMatchObject({ restante: 3, inicioReal: expect.any(Number), terminarNoDespuesDe: expect.any(Number) });
    const avisos = imp2.avisos.join(' | ');
    expect(avisos).toContain('2 proyectos');
    expect(avisos).toContain('otros proyectos');
    expect(avisos).toContain('nivel de esfuerzo');
  });
});

describe('elegir el lector', () => {
  it('.mpp: explica cómo guardarlo como XML; lo desconocido, error claro', () => {
    expect(() => importarCronograma('obra.mpp', new Uint8Array([1, 2, 3]))).toThrow(/Guardar como/);
    expect(() => importarCronograma('notas.txt', new TextEncoder().encode('hola'))).toThrow(/No se reconoce/);
  });
  it('un XER en Windows-1252 se lee con sus tildes', () => {
    const texto = 'ERMHDR\t19.12\r\n%T\tTASK\r\n%F\ttask_id\tproj_id\ttask_code\ttask_name\ttarget_drtn_hr_cnt\r\n%R\t1\t1\tA\tCimentación\t8\r\n%E';
    const bytes = Uint8Array.from([...texto].map((c) => (c === 'ó' ? 0xf3 : c.charCodeAt(0))));
    const imp = importarCronograma('p6.xer', bytes);
    expect(imp.cronograma.actividades[0]!.nombre).toBe('Cimentación');
  });
});
