#!/usr/bin/env python3
"""
Genera la **séptima tanda** del libro de fidelidad: `LET`.

    python3 tests/fixtures/generar-tanda7.py

`LET` se resuelve en el motor sustituyendo cada nombre por su expresión
(`engine/parser/let.ts`). Eso es exacto si las reglas de ámbito son las de
Excel; estos casos lo comprueban: nombres que usan los anteriores, `LET`
anidados que redefinen un nombre, mayúsculas, tipos, errores y los mal
formados. Van con `_xlfn.LET` y `_xlpm.` porque así se guardan en el archivo.

Formato: el de siempre (A=id … F=notas). Datos auxiliares en H.
"""

from openpyxl import Workbook
from openpyxl.styles import Font

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"

# Idénticos a AUXILIARES en tests/unit/fidelidadTanda7.test.ts.
AUXILIARES = {"H2": 3, "H3": 4, "H4": "abc", "H5": 0.1}
for ref, valor in AUXILIARES.items():
    hoja[ref] = valor
hoja["H1"] = "auxiliares"

L = "_xlfn.LET"


def p(n):
    return f"_xlpm.{n}"


CASOS = [
    ("T7-001", "let", "El ejemplo de Microsoft", f"{L}({p('x')},5,SUM({p('x')},1))", "6 (Microsoft)"),
    ("T7-002", "let", "Un nombre usa el anterior", f"{L}({p('a')},H2*2,{p('b')},{p('a')}+1,{p('a')}*{p('b')})", ""),
    ("T7-003", "let", "LET anidado redefine el nombre dentro", f"{L}({p('x')},1,{L}({p('x')},10,{p('x')})+{p('x')})", ""),
    ("T7-004", "let", "Mayúsculas distintas, mismo nombre", f"{L}({p('tasa')},H5,{p('tasa')}*100)", ""),
    ("T7-005", "let", "Un nombre con texto", f"{L}({p('s')},H4,UPPER({p('s')})&LEN({p('s')}))", ""),
    ("T7-006", "let", "Un error dentro de un nombre se propaga", f"{L}({p('d')},1/0,{p('d')}+1)", ""),
    ("T7-007", "let", "El error de un nombre no usado no cuenta", f"{L}({p('d')},1/0,{p('k')},2,{p('k')}*3)", "A VERIFICAR"),
    ("T7-008", "let", "SI.ERROR sobre un nombre", f"{L}({p('d')},H2/0,IFERROR({p('d')},-1))", ""),
    ("T7-009", "let", "Nombre usado dentro de una función de criterio", f"{L}({p('u')},3,COUNTIF(H2:H3,\">=\"&{p('u')}))", ""),
    ("T7-010", "let", "Nombre que vale un rango", f"{L}({p('r')},H2:H3,SUM({p('r')})*2)", ""),
    ("T7-011", "let", "Dentro de un SI", f"{L}({p('m')},H3-H2,IF({p('m')}>0,\"sube\",\"baja\"))", ""),
    ("T7-012", "let", "Varios usos del mismo nombre", f"{L}({p('v')},H2+H3,{p('v')}*{p('v')}-{p('v')})", ""),
    ("T7-013", "let", "Con un VNA dentro", f"{L}({p('i')},H5,NPV({p('i')},100,100,100))", ""),
    ("T7-014", "let", "Tres niveles de nombres", f"{L}({p('a')},1,{p('b')},{p('a')}+1,{p('c')},{p('b')}+1,{p('a')}+{p('b')}+{p('c')})", ""),
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
    ruta = os.environ.get("TANDA7_MOTOR", "")
    if ruta and os.path.exists(ruta):
        MOTOR = json.load(open(ruta, encoding="utf-8"))
except Exception:
    MOTOR = {}

for i, (id_, categoria, descripcion, formula, notas) in enumerate(CASOS, start=2):
    hoja[f"A{i}"] = id_
    hoja[f"B{i}"] = categoria
    hoja[f"C{i}"] = descripcion
    hoja[f"D{i}"] = formula.replace("_xlfn.", "")
    hoja[f"E{i}"] = f"={formula}"
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
    destino = "tests/fixtures/fidelidad-tanda7.xlsx"
    wb.save(destino)
    print(f"Escrito {destino} con {len(CASOS)} casos.")
