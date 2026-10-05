#!/usr/bin/env python3
"""
Q0 del bloque QRSA: los tres cronogramas de referencia para validar el motor
de ruta crítica sin MS Project.

    python3 tests/fixtures/qrsa/generar-referencias.py

Escribe en esta carpeta, para cada cronograma:
- `R<n>-<nombre>.xml`: el cronograma en formato MS Project XML (MSPDI), que
  ProjectLibre abre y recalcula (se escribe sin fechas de tareas, solo el
  inicio del proyecto, para que las calcule él).
- `R<n>-<nombre>-esperado.csv`: las fechas y holguras que da **este** cálculo
  en Python, escrito aparte del motor del complemento (validación 2 del plan).
- `R<n>-<nombre>-red.json`: la misma red en un formato sencillo, para que las
  pruebas del motor (`tests/unit/cronogramaReferencias.test.ts`) la lean sin
  pasar por el XML.

Reglas (decididas con el usuario el 05/10, `docs/QRSA_PLAN.md`):
- Días laborables de lunes a viernes, con festivos de Colombia en R3.
- Una actividad de d días que empieza el día laborable s termina al final
  del día laborable s+d−1 (un hito, d = 0, empieza y termina en s).
- Relaciones FC, CC, FF y CF con desfase en días laborables (también
  negativo); en R3, un desfase en días calendario (el curado del concreto).
- «No comenzar antes de» (SNET) mueve el inicio; «no terminar después de»
  (FNLT) solo cambia la holgura (puede quedar negativa).
"""

from __future__ import annotations

import csv
import json
import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import escape

AQUI = Path(__file__).parent
INICIO = dt.date(2027, 1, 4)  # lunes


# ---------------------------------------------------------------- festivos
def pascua(anio: int) -> dt.date:
    """Domingo de Pascua (algoritmo gregoriano anónimo)."""
    a, b, c = anio % 19, anio // 100, anio % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = (h + l - 7 * m + 114) % 31 + 1
    return dt.date(anio, mes, dia)


def al_lunes(f: dt.date) -> dt.date:
    """Ley Emiliani (Ley 51 de 1983): el festivo pasa al lunes siguiente."""
    return f + dt.timedelta(days=(7 - f.weekday()) % 7)


def festivos_colombia(anio: int) -> dict[dt.date, str]:
    p = pascua(anio)
    d = dt.timedelta
    lista = [
        (dt.date(anio, 1, 1), 'Año Nuevo'),
        (al_lunes(dt.date(anio, 1, 6)), 'Reyes Magos'),
        (al_lunes(dt.date(anio, 3, 19)), 'San José'),
        (p - d(days=3), 'Jueves Santo'),
        (p - d(days=2), 'Viernes Santo'),
        (dt.date(anio, 5, 1), 'Día del Trabajo'),
        (p + d(days=43), 'Ascensión del Señor'),
        (p + d(days=64), 'Corpus Christi'),
        (p + d(days=71), 'Sagrado Corazón'),
        (al_lunes(dt.date(anio, 6, 29)), 'San Pedro y San Pablo'),
        (dt.date(anio, 7, 20), 'Independencia'),
        (dt.date(anio, 8, 7), 'Batalla de Boyacá'),
        (al_lunes(dt.date(anio, 8, 15)), 'Asunción de la Virgen'),
        (al_lunes(dt.date(anio, 10, 12)), 'Día de la Raza'),
        (al_lunes(dt.date(anio, 11, 1)), 'Todos los Santos'),
        (al_lunes(dt.date(anio, 11, 11)), 'Independencia de Cartagena'),
        (dt.date(anio, 12, 8), 'Inmaculada Concepción'),
        (dt.date(anio, 12, 25), 'Navidad'),
    ]
    # Dos festivos pueden caer el mismo día (el 01/07/2030, Sagrado Corazón y
    # San Pedro): es un solo día libre, con los dos nombres.
    fs: dict[dt.date, str] = {}
    for f, n in lista:
        fs[f] = f'{fs[f]} · {n}' if f in fs else n
    return dict(sorted(fs.items()))


# ---------------------------------------------------------------- calendario
class Calendario:
    """Días laborables numerados desde el inicio del proyecto (índice 0)."""

    def __init__(self, inicio: dt.date, festivos: set[dt.date], dias: int = 1500):
        self.dias: list[dt.date] = []
        f = inicio - dt.timedelta(days=400)  # también hacia atrás (desfases negativos)
        fin = inicio + dt.timedelta(days=dias)
        while f <= fin:
            if f.weekday() < 5 and f not in festivos:
                self.dias.append(f)
            f += dt.timedelta(days=1)
        self.cero = self.dias.index(self.primero_desde(inicio, absoluto=True))

    def primero_desde(self, f: dt.date, absoluto: bool = False):
        for x in self.dias:
            if x >= f:
                return x if absoluto else self.dias.index(x) - self.cero
        raise ValueError(f)

    def fecha(self, i: int) -> dt.date:
        return self.dias[i + self.cero]


# ---------------------------------------------------------------- red
@dataclass
class Rel:
    pred: str
    tipo: str  # FC, CC, FF, CF
    desfase: int = 0
    calendario: bool = False  # desfase en días calendario (solo FC)


@dataclass
class Act:
    id: str
    nombre: str
    dur: int
    rels: list[Rel] = field(default_factory=list)
    snet: dt.date | None = None
    fnlt: dt.date | None = None


def cpm(acts: list[Act], cal: Calendario):
    """Ida y vuelta. Índices de día laborable; inicio = primer día, fin_excl = día siguiente al último."""
    por = {a.id: a for a in acts}
    es: dict[str, int] = {}
    ef: dict[str, int] = {}
    for a in acts:  # las listas van ya en orden topológico
        ini = 0
        for r in a.rels:
            p = por[r.pred]
            if r.tipo == 'FC':
                if r.calendario:
                    # Desde la medianoche tras el último día laborable de la
                    # predecesora (un hito cuenta como el final del día anterior).
                    borde = cal.fecha(ef[p.id] - 1) + dt.timedelta(days=1)
                    ini = max(ini, cal.primero_desde(borde + dt.timedelta(days=r.desfase)))
                else:
                    ini = max(ini, ef[p.id] + r.desfase)
            elif r.tipo == 'CC':
                ini = max(ini, es[p.id] + r.desfase)
            elif r.tipo == 'FF':
                ini = max(ini, ef[p.id] + r.desfase - a.dur)
            elif r.tipo == 'CF':
                ini = max(ini, es[p.id] + r.desfase - a.dur)
        if a.snet:
            ini = max(ini, cal.primero_desde(a.snet))
        es[a.id], ef[a.id] = ini, ini + a.dur
    fin = max(ef.values())
    lf: dict[str, int] = {}
    ls: dict[str, int] = {}
    for a in reversed(acts):
        tarde = fin
        for s in acts:
            for r in s.rels:
                if r.pred != a.id:
                    continue
                if r.tipo == 'FC':
                    if r.calendario:
                        # Inverso del desfase calendario: el último fin que aún permite empezar en ls[s].
                        x = ef[a.id]
                        while True:
                            borde = cal.fecha(x) + dt.timedelta(days=1)
                            if cal.primero_desde(borde + dt.timedelta(days=r.desfase)) > ls[s.id]:
                                break
                            x += 1
                        while x > 0 and cal.primero_desde(cal.fecha(x - 1) + dt.timedelta(days=1 + r.desfase)) > ls[s.id]:
                            x -= 1
                        tarde = min(tarde, x)
                    else:
                        tarde = min(tarde, ls[s.id] - r.desfase)
                elif r.tipo == 'CC':
                    tarde = min(tarde, ls[s.id] - r.desfase + a.dur)
                elif r.tipo == 'FF':
                    tarde = min(tarde, lf[s.id] - r.desfase)
                elif r.tipo == 'CF':
                    tarde = min(tarde, lf[s.id] - r.desfase + a.dur)
        if a.fnlt:
            tarde = min(tarde, cal.primero_desde(a.fnlt + dt.timedelta(days=1)))
        lf[a.id], ls[a.id] = tarde, tarde - a.dur
    return {a.id: (es[a.id], ef[a.id], ls[a.id] - es[a.id]) for a in acts}


# ---------------------------------------------------------------- los tres cronogramas
R1 = ('R1-simple', 'Red simple, solo fin-comienzo', set(), [
    Act('A', 'Replanteo', 3),
    Act('B', 'Excavación', 4, [Rel('A', 'FC')]),
    Act('C', 'Pedido de acero', 2, [Rel('A', 'FC')]),
    Act('D', 'Cimentación', 5, [Rel('B', 'FC')]),
    Act('E', 'Figurado de acero', 3, [Rel('C', 'FC')]),
    Act('F', 'Columnas', 2, [Rel('D', 'FC'), Rel('E', 'FC')]),
    Act('M', 'Fin de obra gris', 0, [Rel('F', 'FC')]),
])

R2 = ('R2-relaciones', 'Las cuatro relaciones, desfases y restricciones', set(), [
    Act('A', 'Movimiento de tierras', 10),
    Act('B', 'Instalación de tubería', 8, [Rel('A', 'CC', 3)]),
    Act('C', 'Relleno de zanja', 6, [Rel('B', 'FF', 2)]),
    Act('D', 'Inspección de tubería', 2, [Rel('B', 'FC', -1)]),
    Act('E', 'Pavimento', 7, [Rel('C', 'FC'), Rel('D', 'FC', 2)]),
    Act('F', 'Señalización', 3, [Rel('E', 'CF', 5)]),
    Act('G', 'Interventoría de cierre', 4, [Rel('E', 'FC')], snet=dt.date(2027, 2, 22)),
    Act('H', 'Entrega a la comunidad', 0, [Rel('F', 'FC'), Rel('G', 'FC')], fnlt=dt.date(2027, 2, 24)),
])

FEST = set(festivos_colombia(2027)) | set(festivos_colombia(2028))
R3 = ('R3-calendario', 'Calendario con festivos de Colombia y desfase en días calendario', FEST, [
    Act('A', 'Diseño y estudios', 25),
    Act('B', 'Licencia de construcción', 45, [Rel('A', 'FC')]),
    Act('C', 'Adecuación del terreno', 14, [Rel('A', 'FC')]),
    Act('D', 'Cimentación', 25, [Rel('B', 'FC'), Rel('C', 'FC')]),
    Act('E', 'Estructura (vaciado)', 50, [Rel('D', 'FC')]),
    Act('F', 'Desencofrado', 5, [Rel('E', 'FC', 7, calendario=True)]),
    Act('G', 'Instalaciones', 30, [Rel('F', 'FC')]),
    Act('H', 'Mampostería y fachada', 35, [Rel('F', 'CC', 5)]),
    Act('I', 'Acabados', 30, [Rel('G', 'FC'), Rel('H', 'FC')]),
    Act('J', 'Entrega', 0, [Rel('I', 'FC')]),
])

TIPO_MSPDI = {'FF': 0, 'FC': 1, 'CF': 2, 'CC': 3}
MIN_DIA = 480


def mspdi(nombre: str, titulo: str, festivos: set[dt.date], acts: list[Act]) -> str:
    uid = {a.id: i + 1 for i, a in enumerate(acts)}
    horas = '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>' \
            '<WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>'
    dias = ''.join(
        f'<WeekDay><DayType>{t}</DayType><DayWorking>{1 if 2 <= t <= 6 else 0}</DayWorking>{horas if 2 <= t <= 6 else ""}</WeekDay>'
        for t in range(1, 8))
    excepciones = ''.join(
        f'<WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>{f}T00:00:00</FromDate>'
        f'<ToDate>{f}T23:59:00</ToDate></TimePeriod></WeekDay>' for f in sorted(festivos))
    tareas = [f'<Task><UID>0</UID><ID>0</ID><Name>{escape(titulo)}</Name><Summary>1</Summary><OutlineLevel>0</OutlineLevel></Task>']
    for a in acts:
        vinculos = ''
        for r in a.rels:
            lag = r.desfase * (24 * 60 if r.calendario else MIN_DIA) * 10  # décimas de minuto
            vinculos += (f'<PredecessorLink><PredecessorUID>{uid[r.pred]}</PredecessorUID><Type>{TIPO_MSPDI[r.tipo]}</Type>'
                         f'<CrossProject>0</CrossProject><LinkLag>{lag}</LinkLag><LagFormat>{8 if r.calendario else 7}</LagFormat></PredecessorLink>')
        restriccion = ''
        if a.snet:
            restriccion = f'<ConstraintType>4</ConstraintType><ConstraintDate>{a.snet}T08:00:00</ConstraintDate>'
        elif a.fnlt:
            restriccion = f'<ConstraintType>7</ConstraintType><ConstraintDate>{a.fnlt}T17:00:00</ConstraintDate>'
        tareas.append(
            f'<Task><UID>{uid[a.id]}</UID><ID>{uid[a.id]}</ID><Name>{escape(a.id + " · " + a.nombre)}</Name>'
            f'<Manual>0</Manual><OutlineLevel>1</OutlineLevel><Duration>PT{a.dur * 8}H0M0S</Duration><DurationFormat>7</DurationFormat>'
            f'<Milestone>{1 if a.dur == 0 else 0}</Milestone>{restriccion}{vinculos}</Task>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Project xmlns="http://schemas.microsoft.com/project">'
        f'<Name>{escape(nombre)}</Name><Title>{escape(titulo)}</Title>'
        f'<ScheduleFromStart>1</ScheduleFromStart><StartDate>{INICIO}T08:00:00</StartDate>'
        '<CalendarUID>1</CalendarUID><DefaultStartTime>08:00:00</DefaultStartTime><DefaultFinishTime>17:00:00</DefaultFinishTime>'
        f'<MinutesPerDay>{MIN_DIA}</MinutesPerDay><MinutesPerWeek>{MIN_DIA * 5}</MinutesPerWeek><DaysPerMonth>20</DaysPerMonth>'
        '<Calendars><Calendar><UID>1</UID><Name>Lunes a viernes (Colombia)</Name><IsBaseCalendar>1</IsBaseCalendar>'
        f'<WeekDays>{dias}{excepciones}</WeekDays></Calendar></Calendars>'
        f'<Tasks>{"".join(tareas)}</Tasks></Project>\n')


def escribir(nombre, titulo, festivos, acts):
    cal = Calendario(INICIO, festivos)
    r = cpm(acts, cal)
    (AQUI / f'{nombre}.xml').write_text(mspdi(nombre, titulo, festivos, acts), encoding='utf-8')
    with open(AQUI / f'{nombre}-esperado.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['id', 'actividad', 'duracion', 'inicio', 'fin', 'holgura_total', 'critica'])
        for a in acts:
            es, ef, hol = r[a.id]
            fin = cal.fecha(es) if a.dur == 0 else cal.fecha(ef - 1)
            w.writerow([a.id, a.nombre, a.dur, cal.fecha(es).isoformat(), fin.isoformat(), hol, 'sí' if hol <= 0 else 'no'])
    red = {
        'nombre': nombre, 'inicio': INICIO.isoformat(), 'festivos': sorted(f.isoformat() for f in festivos),
        'actividades': [{
            'id': a.id, 'nombre': a.nombre, 'duracion': a.dur,
            **({'snet': a.snet.isoformat()} if a.snet else {}), **({'fnlt': a.fnlt.isoformat()} if a.fnlt else {}),
            'predecesoras': [{'id': r.pred, 'tipo': r.tipo, 'desfase': r.desfase, **({'calendario': True} if r.calendario else {})} for r in a.rels],
        } for a in acts],
    }
    (AQUI / f'{nombre}-red.json').write_text(json.dumps(red, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return cal, r


if __name__ == '__main__':
    with open(AQUI / 'festivos-colombia.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['fecha', 'festivo'])
        for anio in (2026, 2027, 2028, 2029, 2030):
            for d, n in festivos_colombia(anio).items():
                w.writerow([d.isoformat(), n])
    for nombre, titulo, festivos, acts in (R1, R2, R3):
        cal, r = escribir(nombre, titulo, festivos, acts)
        fin = max(ef for _, ef, _ in r.values())
        print(f'{nombre}: {len(acts)} actividades, fin {cal.fecha(fin - 1)} ({fin} días laborables)')
