/**
 * Exportar el cronograma del Gantt (G3): MS Project XML (MSPDI, que también
 * abren ProjectLibre y Primavera) y CSV. Sin Office.js: entra la vista
 * calculada y sale el texto del archivo.
 *
 * El XML lleva lo que el complemento sabe: calendarios (días laborables y
 * festivos), actividades con su WBS y nivel de esquema, resúmenes, hitos,
 * duraciones, fechas calculadas, restricciones, fechas límite, avance real y
 * los vínculos con su tipo y desfase (en días laborables o transcurridos). Se
 * comprueba volviéndolo a importar con el propio importador.
 */

import { fechaDeSerie } from '../engine/modelo/fechas.ts';
import type { DatosGantt, VistaGantt } from './gantt.ts';

const MIN_DIA = 480;
const TIPO_MSPDI: Record<string, number> = { FF: 0, FC: 1, CF: 2, CC: 3 };
const RESTRICCION_MSPDI: Record<string, number> = { MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function iso(serie: number, hora: string): string {
  const { anio, mes, dia } = fechaDeSerie(serie);
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}T${hora}`;
}

const duracionIso = (dias: number) => `PT${Math.round(dias * 8 * 100) / 100}H0M0S`;

export function exportarMspdi(datos: DatosGantt, vista: VistaGantt, titulo = 'Cronograma'): string {
  const red = datos.modelo.red;
  const cals = red.calendarios;
  const uidCal = new Map(cals.map((c, i) => [c.id, i + 1]));
  const calProyecto = red.calendarioProyecto ?? cals[0]?.id ?? '';
  const actPorId = new Map(red.actividades.map((a) => [a.id, a]));
  const uidAct = new Map(vista.filas.map((f, i) => [f.id, i + 1]));
  const l: string[] = [];
  l.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  l.push('<Project xmlns="http://schemas.microsoft.com/project">');
  l.push(`  <Name>${esc(titulo)}</Name>`, `  <Title>${esc(titulo)}</Title>`);
  l.push(`  <StartDate>${iso(red.inicio, '08:00:00')}</StartDate>`, `  <FinishDate>${iso(vista.fin, '17:00:00')}</FinishDate>`);
  if (red.fechaCorte !== undefined) l.push(`  <StatusDate>${iso(red.fechaCorte, '17:00:00')}</StatusDate>`);
  l.push(`  <CalendarUID>${uidCal.get(calProyecto) ?? 1}</CalendarUID>`, `  <MinutesPerDay>${MIN_DIA}</MinutesPerDay>`, '  <MinutesPerWeek>2400</MinutesPerWeek>', '  <DaysPerMonth>20</DaysPerMonth>');
  l.push('  <Calendars>');
  cals.forEach((c, i) => {
    l.push('    <Calendar>', `      <UID>${i + 1}</UID>`, `      <Name>${esc(c.nombre ?? c.id)}</Name>`, '      <IsBaseCalendar>1</IsBaseCalendar>', '      <BaseCalendarUID>-1</BaseCalendarUID>', '      <WeekDays>');
    // DayType: 1 = domingo … 7 = sábado; `laborables` va de lunes (0) a domingo (6).
    for (let t = 1; t <= 7; t++) {
      const trabaja = c.laborables[(t + 5) % 7] === true;
      l.push('        <WeekDay>', `          <DayType>${t}</DayType>`, `          <DayWorking>${trabaja ? 1 : 0}</DayWorking>`);
      if (trabaja) l.push('          <WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>');
      l.push('        </WeekDay>');
    }
    l.push('      </WeekDays>');
    const excepciones = [...(c.festivos ?? []).map((f) => [f, 0] as const), ...(c.trabajados ?? []).map((f) => [f, 1] as const)];
    if (excepciones.length) {
      l.push('      <Exceptions>');
      for (const [f, trabaja] of excepciones) {
        l.push('        <Exception>', '          <EnteredByOccurrences>0</EnteredByOccurrences>', `          <TimePeriod><FromDate>${iso(f, '00:00:00')}</FromDate><ToDate>${iso(f, '23:59:00')}</ToDate></TimePeriod>`, '          <Occurrences>1</Occurrences>', `          <Name>${trabaja ? 'Laborable' : 'Festivo'}</Name>`, '          <Type>1</Type>', `          <DayWorking>${trabaja}</DayWorking>`, '        </Exception>');
      }
      l.push('      </Exceptions>');
    }
    l.push('    </Calendar>');
  });
  l.push('  </Calendars>', '  <Tasks>');
  vista.filas.forEach((f, i) => {
    const a = actPorId.get(f.id);
    const resumen = f.tipo === 'resumen';
    const hito = f.tipo === 'hito';
    l.push('    <Task>', `      <UID>${i + 1}</UID>`, `      <ID>${i + 1}</ID>`, `      <Name>${esc(f.nombre)}</Name>`);
    if (f.wbs) l.push(`      <WBS>${esc(f.wbs)}</WBS>`, `      <OutlineNumber>${esc(f.wbs)}</OutlineNumber>`);
    l.push(`      <OutlineLevel>${f.nivel}</OutlineLevel>`, `      <Summary>${resumen ? 1 : 0}</Summary>`, `      <Milestone>${hito ? 1 : 0}</Milestone>`);
    if (Number.isFinite(f.inicio)) {
      l.push(`      <Start>${iso(f.inicio, '08:00:00')}</Start>`, `      <Finish>${iso(f.fin, hito ? '08:00:00' : '17:00:00')}</Finish>`);
    }
    l.push(`      <Duration>${duracionIso(hito ? 0 : f.duracion ?? 0)}</Duration>`, '      <DurationFormat>7</DurationFormat>');
    if (a?.restriccion) l.push(`      <ConstraintType>${RESTRICCION_MSPDI[a.restriccion.tipo] ?? 0}</ConstraintType>`, `      <ConstraintDate>${iso(a.restriccion.fecha, '08:00:00')}</ConstraintDate>`);
    else l.push('      <ConstraintType>0</ConstraintType>');
    if (a?.fechaLimite !== undefined) l.push(`      <Deadline>${iso(a.fechaLimite, '17:00:00')}</Deadline>`);
    if (a?.calendario && a.calendario !== calProyecto) l.push(`      <CalendarUID>${uidCal.get(a.calendario) ?? -1}</CalendarUID>`);
    if (a?.avance?.inicioReal !== undefined) l.push(`      <ActualStart>${iso(a.avance.inicioReal, '08:00:00')}</ActualStart>`);
    if (a?.avance?.finReal !== undefined) l.push(`      <ActualFinish>${iso(a.avance.finReal, '17:00:00')}</ActualFinish>`);
    if (f.avance !== null && !resumen) l.push(`      <PercentComplete>${Math.round(f.avance * 100)}</PercentComplete>`);
    for (const p of a?.predecesoras ?? []) {
      const uid = uidAct.get(p.id);
      if (!uid) continue;
      // Desfase en décimas de minuto; formato 7 = días, 8 = días transcurridos.
      const minutos = p.transcurrido ? p.desfase * 1440 : p.desfase * MIN_DIA;
      l.push('      <PredecessorLink>', `        <PredecessorUID>${uid}</PredecessorUID>`, `        <Type>${TIPO_MSPDI[p.tipo] ?? 1}</Type>`, '        <CrossProject>0</CrossProject>', `        <LinkLag>${Math.round(minutos * 10)}</LinkLag>`, `        <LagFormat>${p.transcurrido ? 8 : 7}</LagFormat>`, '      </PredecessorLink>');
    }
    l.push('    </Task>');
  });
  l.push('  </Tasks>', '</Project>', '');
  return l.join('\n');
}

/** Una celda CSV (punto y coma, como lo abre Excel en español). */
function celda(v: string | number | null): string {
  if (v === null) return '';
  const t = typeof v === 'number' ? v.toLocaleString('es-ES', { maximumFractionDigits: 4, useGrouping: false }) : v;
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const fechaTexto = (s: number | null) => {
  if (s === null || !Number.isFinite(s)) return null;
  const { anio, mes, dia } = fechaDeSerie(s);
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${anio}`;
};

/** La tabla del Gantt en CSV, con BOM para que Excel lea los acentos. */
export function csvGantt(vista: VistaGantt): string {
  const enc = ['ID', 'WBS', 'Nombre', 'Tipo', 'Duración (días)', 'Comienzo', 'Fin', 'Comienzo tardío', 'Fin tardío', 'Holgura total', 'Holgura libre', 'Crítica',
    'Ruta de holgura', 'Predecesoras', 'Sucesoras', 'Restricción', 'Fecha de la restricción', 'Fecha límite', 'Estado', '% completado', 'Comienzo real', 'Fin real',
    'LB comienzo', 'LB fin', 'Variación (días)', 'P80 fin', 'Criticidad', 'P(cumplir el hito)'];
  const filas = vista.filas.map((f) => [
    f.id, f.wbs, f.nombre, f.tipo, f.duracion, fechaTexto(f.inicio), fechaTexto(f.fin), fechaTexto(f.inicioTardio), fechaTexto(f.finTardio),
    f.holguraTotal, f.holguraLibre, f.tipo === 'resumen' ? null : f.critica ? 'Sí' : 'No', f.rutaHolgura || null, f.predecesoras, f.sucesoras,
    f.restriccion, fechaTexto(f.fechaRestriccion), fechaTexto(f.fechaLimite), f.estado, f.avance === null ? null : Math.round(f.avance * 100),
    fechaTexto(f.inicioReal), fechaTexto(f.finReal), fechaTexto(f.lineaBase?.inicio ?? null), fechaTexto(f.lineaBase?.fin ?? null), f.variacion,
    fechaTexto(f.qrsa?.p80 ?? null), f.qrsa ? Math.round(f.qrsa.criticidad * 100) : null, f.probabilidadHito ? Math.round(f.probabilidadHito.p * 100) : null,
  ].map(celda).join(';'));
  return `\uFEFF${[enc.join(';'), ...filas].join('\r\n')}\r\n`;
}
