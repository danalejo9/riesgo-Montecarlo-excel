#!/usr/bin/env python3
"""
Genera la **quinta tanda** del libro de fidelidad: `TEXTO`.

    python3 tests/fixtures/generar-tanda5.py

Es una tanda corta y dedicada porque `TEXTO` depende de la configuración
regional por cuatro sitios —la cadena de formato, los separadores del
resultado, los códigos de fecha traducidos y los nombres de meses y días— y es
imposible acertar esos cuatro a la vez sin preguntarle a un Excel en español.

**Las cadenas de formato están escritas en español**, como las escribiría el
usuario: `"#.##0,00"` y no `"#,##0.00"`, `"dd/mm/aaaa"` y no `"dd/mm/yyyy"`.
Excel las guarda tal cual en el archivo y las interpreta con los separadores
del idioma en que se abren, así que este libro **solo vale calculado por un
Excel en español**. Abierto en uno inglés daría otra cosa, y eso no sería un
fallo del motor.

Los casos marcados "A VERIFICAR" son los que no puedo saber sin Excel:
cómo abrevia los meses (¿"sep" o "sept"?), qué pone en lugar de AM/PM, si
acepta los códigos en inglés dentro de un libro español, y cómo se llama el
formato General en español.

Formato: el de siempre (A=id … F=notas). Datos auxiliares: H2 es una fecha
(23-sep-2026, miércoles, como número de serie) y H3 un importe.
"""

from openpyxl import Workbook
from openpyxl.styles import Font

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"

AUXILIARES = {
    "H1": "auxiliares",
    "H2": 46288,        # 23 de septiembre de 2026, miércoles
    "H3": 1234.5,
    "H4": 46288.75,     # el mismo día a las 18:00
}
for ref, valor in AUXILIARES.items():
    hoja[ref] = valor

CASOS = [
    # --- Números ---
    ("T5-001", "numero", "Miles con punto y dos decimales con coma", 'TEXT(H3,"#.##0,00")', 'motor: "1.234,50"'),
    ("T5-002", "numero", "Miles sin decimales", 'TEXT(1234567,"#.##0")', 'motor: "1.234.567"'),
    ("T5-003", "numero", "Ceros forzados a la izquierda", 'TEXT(5,"000")', 'motor: "005"'),
    ("T5-004", "numero", "Dos decimales forzados", 'TEXT(1.5,"0,00")', 'motor: "1,50"'),
    ("T5-005", "numero", "Decimales opcionales: no enseña ceros de más", 'TEXT(1.5,"#,##")', 'A VERIFICAR. motor: "1,5"'),
    ("T5-006", "numero", "Sin cero entero forzado", 'TEXT(0.5,"#,00")', 'A VERIFICAR. motor: ",50"'),
    ("T5-007", "numero", "Redondeo del 2,5 a entero", 'TEXT(2.5,"0")', 'motor: "3"'),
    ("T5-008", "numero", "Redondeo del -2,5 a entero", 'TEXT(-2.5,"0")', 'motor: "-3"'),
    ("T5-009", "numero", "Redondeo del 1,005 a dos decimales (trampa binaria)", 'TEXT(1.005,"0,00")',
     'A VERIFICAR. motor: "1,01"'),
    ("T5-010", "numero", "Porcentaje entero", 'TEXT(0.256,"0%")', 'motor: "26%"'),
    ("T5-011", "numero", "Porcentaje con un decimal", 'TEXT(0.256,"0,0%")', 'motor: "25,6%"'),
    ("T5-012", "numero", "Un punto final escala entre mil", 'TEXT(1234567,"#.##0.")', 'A VERIFICAR. motor: "1.235"'),
    ("T5-013", "numero", "Dos puntos tras los decimales escalan entre un millón", 'TEXT(1234567,"0,0..")',
     'A VERIFICAR. motor: "1,2"'),
    ("T5-014", "numero", "Símbolo de euro detrás", 'TEXT(1500,"#.##0 €")', 'motor: "1.500 €"'),
    ("T5-015", "numero", "Texto literal entre comillas", 'TEXT(3,"0"" uds""")', 'motor: "3 uds"'),
    ("T5-016", "numero", "Sección de negativos entre paréntesis", 'TEXT(-5,"0;(0)")', 'motor: "(5)"'),
    ("T5-017", "numero", "Sección de cero", 'TEXT(0,"0;(0);""cero""")', 'motor: "cero"'),
    ("T5-018", "numero", "Una sola sección con un negativo: pone el signo", 'TEXT(-5,"0")', 'motor: "-5"'),
    ("T5-019", "numero", "Un negativo que redondea a cero", 'TEXT(-0.001,"0")', 'A VERIFICAR. motor: "0"'),
    ("T5-020", "numero", "Un color se ignora", 'TEXT(-5,"0;[Rojo]-0")', 'A VERIFICAR. motor: "-5"'),
    ("T5-021", "numero", "Notación científica", 'TEXT(12345,"0,00E+00")', 'motor: "1,23E+04"'),
    ("T5-022", "numero", "Notación científica con exponente negativo", 'TEXT(0.00012,"0,0E+00")', 'motor: "1,2E-04"'),
    ("T5-023", "numero", "El formato General en español: ¿Estándar?", 'TEXT(1.5,"Estándar")',
     'A VERIFICAR. motor: "1,5"'),

    # --- Fechas ---
    ("T5-024", "fecha", "Fecha con el año en español", 'TEXT(H2,"dd/mm/aaaa")', 'motor: "23/09/2026"'),
    ("T5-025", "fecha", "Día y mes sin cero, año con dos cifras", 'TEXT(H2,"d-m-aa")', 'motor: "23-9-26"'),
    ("T5-026", "fecha", "Nombre del día", 'TEXT(H2,"dddd")', 'motor: "miércoles"'),
    ("T5-027", "fecha", "Día abreviado", 'TEXT(H2,"ddd")', 'A VERIFICAR. motor: "mié"'),
    ("T5-028", "fecha", "Nombre del mes", 'TEXT(H2,"mmmm")', 'motor: "septiembre"'),
    ("T5-029", "fecha", "Mes abreviado: ¿sep o sept?", 'TEXT(H2,"mmm")', 'A VERIFICAR. motor: "sep"'),
    ("T5-030", "fecha", "Fecha larga con texto escapado", 'TEXT(H2,"dddd d \\d\\e mmmm")',
     'motor: "miércoles 23 de septiembre"'),
    ("T5-031", "fecha", "Los códigos en inglés dentro de un libro español", 'TEXT(H2,"yyyy-mm-dd")',
     'A VERIFICAR. motor: "2026-09-23"'),

    # --- Horas ---
    ("T5-032", "hora", "Horas y minutos: la m tras la h es minuto", 'TEXT(H4,"hh:mm")', 'motor: "18:00"'),
    ("T5-033", "hora", "Horas, minutos y segundos", 'TEXT(46288.5104166667,"h:mm:ss")', 'motor: "12:15:00"'),
    ("T5-034", "hora", "Reloj de 12 horas: ¿qué escribe en vez de AM/PM?", 'TEXT(H4,"h AM/PM")',
     'A VERIFICAR. motor: "6 PM"'),

    # --- Texto ---
    ("T5-035", "texto", "Un texto pasa tal cual", 'TEXT("abc","0")', 'motor: "abc"'),
    ("T5-036", "texto", "Un texto con cuarta sección", 'TEXT("abc","0;0;0;""→""@")', 'A VERIFICAR. motor: "→abc"'),
]

hoja["A1"] = "id"
hoja["B1"] = "categoria"
hoja["C1"] = "descripcion"
hoja["D1"] = "formula (texto)"
hoja["E1"] = "resultado de Excel"
hoja["F1"] = "notas"
for celda in ("A1", "B1", "C1", "D1", "E1", "F1", "H1"):
    hoja[celda].font = Font(bold=True)

for i, (id_, categoria, descripcion, formula, notas) in enumerate(CASOS, start=2):
    hoja[f"A{i}"] = id_
    hoja[f"B{i}"] = categoria
    hoja[f"C{i}"] = descripcion
    hoja[f"D{i}"] = formula
    hoja[f"E{i}"] = f"={formula}"
    hoja[f"F{i}"] = notas

for columna, ancho in [("A", 9), ("B", 10), ("C", 58), ("D", 40), ("E", 26), ("F", 50)]:
    hoja.column_dimensions[columna].width = ancho

wb.calculation.fullCalcOnLoad = True
destino = "tests/fixtures/fidelidad-tanda5.xlsx"
wb.save(destino)
print(f"Escrito {destino} con {len(CASOS)} casos.")
