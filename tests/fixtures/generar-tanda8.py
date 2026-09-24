#!/usr/bin/env python3
"""
Genera la **octava tanda** del libro de fidelidad: matrices.

    python3 tests/fixtures/generar-tanda8.py

Operaciones entre rangos dentro de funciones, las matriciales clásicas
(`SUMA(SI(…))`) y las funciones de matrices dinámicas (`FILTRAR`, `ORDENAR`,
`ORDENARPOR`, `UNICOS`, `SECUENCIA`, `TRANSPONER`, `MMULT`, `MINVERSA`),
siempre dentro de una función que las consuma, que es lo que el motor rápido
admite.

Cada fórmula se escribe como **fórmula matricial** (la de Ctrl+Mayús+Intro):
un archivo escrito sin los metadatos de las matrices dinámicas se abre en
modo antiguo, y ahí `SUMA(A2:A5*B2:B5)` sin marcar como matricial daría otra
cosa. Marcada, Excel la evalúa como matriz en cualquier versión. Las
funciones dinámicas necesitan Excel 365 o 2021.

Formato: el de siempre (A=id … F=notas). Datos auxiliares en H:J.
"""

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.worksheet.formula import ArrayFormula

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"

# Idénticos a AUXILIARES en tests/unit/fidelidadTanda8.test.ts.
AUXILIARES = {
    "H2": 1, "H3": 2, "H4": 3, "H5": 4,
    "I2": 10, "I3": 20, "I4": 30, "I5": 40,
    "J2": "rojo", "J3": "azul", "J4": "Rojo", "J5": "verde", "J6": "azul",
}
for ref, valor in AUXILIARES.items():
    hoja[ref] = valor
hoja["H1"] = "auxiliares"

X = "_xlfn._xlws."   # FILTRAR, ORDENAR, ORDENARPOR
D = "_xlfn."         # UNICOS, SECUENCIA

CASOS = [
    ("T8-001", "rangos", "SUMA de un producto de rangos", "SUM(H2:H5*I2:I5)", ""),
    ("T8-002", "rangos", "SUMAPRODUCTO con condición", "SUMPRODUCT((H2:H5>2)*I2:I5)", ""),
    ("T8-003", "rangos", "SUMA(SI(…)) clásica", "SUM(IF(H2:H5>2,I2:I5))", ""),
    ("T8-004", "rangos", "MAX(SI(…))", "MAX(IF(H2:H5<3,I2:I5))", ""),
    ("T8-005", "rangos", "Rango entre un escalar", "SUM(I2:I5/10)", ""),
    ("T8-006", "rangos", "Constante matricial por 2", "SUM({1,2,3}*2)", ""),
    ("T8-007", "rangos", "Fila por columna (difusión)", "SUM({1,2}*{10;20})", "A VERIFICAR"),
    ("T8-008", "rangos", "Rangos de distinto largo", "SUM(H2:H5*{1;2})", "A VERIFICAR: #N/A en las que sobran"),
    ("T8-009", "rangos", "SI con texto dentro de CONTARA", "COUNTA(IF(J2:J6=\"azul\",J2:J6,\"\"))", "A VERIFICAR"),
    ("T8-010", "filtrar", "SUMA de FILTRAR", f"SUM({X}FILTER(I2:I5,H2:H5>2))", ""),
    ("T8-011", "filtrar", "CONTARA de FILTRAR", f"COUNTA({X}FILTER(I2:I5,H2:H5>1))", ""),
    ("T8-012", "filtrar", "FILTRAR sin resultados", f"SUM({X}FILTER(I2:I5,H2:H5>9))", "A VERIFICAR: #CALC!"),
    ("T8-013", "filtrar", "FILTRAR sin resultados con si_vacío", f"SUM({X}FILTER(I2:I5,H2:H5>9,0))", ""),
    ("T8-014", "filtrar", "La primera fila que pasa", f"INDEX({X}FILTER(I2:I5,H2:H5>2),1)", ""),
    ("T8-015", "filtrar", "Dos condiciones multiplicadas", f"SUM({X}FILTER(I2:I5,(H2:H5>1)*(H2:H5<4)))", ""),
    ("T8-016", "ordenar", "El mayor con ORDENAR descendente", f"INDEX({X}SORT(I2:I5,1,-1),1)", ""),
    ("T8-017", "ordenar", "ORDENARPOR por otra columna", f"INDEX({X}SORTBY(I2:I5,H2:H5,-1),2)", ""),
    ("T8-018", "ordenar", "ORDENAR texto", f"INDEX({X}SORT(J2:J6),1)", "A VERIFICAR"),
    ("T8-019", "unicos", "UNICOS sin distinguir mayúsculas", f"COUNTA({D}UNIQUE(J2:J6))", "A VERIFICAR"),
    ("T8-020", "unicos", "UNICOS exactamente una vez", f"COUNTA({D}UNIQUE(J2:J6,FALSE,TRUE))", "A VERIFICAR"),
    ("T8-021", "secuencia", "SUMA de SECUENCIA(10)", f"SUM({D}SEQUENCE(10))", ""),
    ("T8-022", "secuencia", "SECUENCIA con inicio y paso", f"SUM({D}SEQUENCE(2,3,0,2))", ""),
    ("T8-023", "transponer", "TRANSPONER una columna", "INDEX(TRANSPOSE(H2:H5),1,2)", ""),
    ("T8-024", "mmult", "MMULT", "SUM(MMULT({1,2;3,4},{1;1}))", ""),
    ("T8-025", "minversa", "MINVERSA", "INDEX(MINVERSE({2,0;0,4}),2,2)", ""),
    ("T8-026", "minversa", "MINVERSA de una singular", "SUM(MINVERSE({1,2;2,4}))", ""),
    ("T8-027", "mezcla", "SUMA de ORDENAR de FILTRAR", f"INDEX({X}SORT({X}FILTER(I2:I5,H2:H5>1),1,-1),1)", ""),
]

hoja["A1"] = "id"
hoja["B1"] = "categoria"
hoja["C1"] = "descripcion"
hoja["D1"] = "formula (texto)"
hoja["E1"] = "resultado de Excel"
hoja["F1"] = "notas"
for celda in ("A1", "B1", "C1", "D1", "E1", "F1", "H1"):
    hoja[celda].font = Font(bold=True)

MOTOR = {}
try:
    import json, os
    # Lo que da el motor, para anotarlo en las notas antes de mandar el libro.
    ruta = os.environ.get("TANDA8_MOTOR", "")
    if ruta and os.path.exists(ruta):
        MOTOR = json.load(open(ruta, encoding="utf-8"))
except Exception:
    MOTOR = {}

for i, (id_, categoria, descripcion, formula, notas) in enumerate(CASOS, start=2):
    hoja[f"A{i}"] = id_
    hoja[f"B{i}"] = categoria
    hoja[f"C{i}"] = descripcion
    hoja[f"D{i}"] = formula.replace("_xlfn.", "")
    hoja[f"E{i}"] = ArrayFormula(f"E{i}", f"={formula}")
    motor = MOTOR.get(id_)
    hoja[f"F{i}"] = ". ".join(x for x in (notas, f"motor: {motor}" if motor else "") if x)

for columna, ancho in [("A", 9), ("B", 12), ("C", 52), ("D", 52), ("E", 20), ("F", 44)]:
    hoja.column_dimensions[columna].width = ancho

if __name__ == "__main__":
    import sys
    if "--casos" in sys.argv:
        import json
        print(json.dumps([{"id": c[0], "formula": c[3]} for c in CASOS]))
        sys.exit(0)
    wb.calculation.fullCalcOnLoad = True
    destino = "tests/fixtures/fidelidad-tanda8.xlsx"
    wb.save(destino)
    print(f"Escrito {destino} con {len(CASOS)} casos.")
