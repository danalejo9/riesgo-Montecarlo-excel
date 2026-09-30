#!/usr/bin/env python3
"""
Genera el libro de prueba de **LAMBDA** (F1 del plan): la ecuación de estado
de **Peng-Robinson** escrita con funciones LAMBDA de tres formas.

    python3 tests/fixtures/generar-lambda.py

Escribe `tests/fixtures/fidelidad-lambda.xlsx` con dos hojas:

- **Fidelidad**: el formato de siempre (A=id … F=notas), un caso por fila,
  para comparar el motor con lo que calcula Excel. Datos auxiliares en H:I.
- **PengRobinson**: un modelo pequeño para simular. La temperatura y el
  volumen molar del CO2 son las entradas inciertas; la presión sale de la
  misma ecuación calculada con una LAMBDA con nombre, con una LAMBDA dentro
  de LET y con una LAMBDA invocada en la propia celda. Las tres tienen que
  dar lo mismo, en Excel y en la simulación.

Peng-Robinson (presión en bar, volumen en L/mol, temperatura en K):

    P = R·T/(v − b) − a·α(T) / (v² + 2·b·v − b²)
    a = 0,45724·R²·Tc²/Pc        b = 0,07780·R·Tc/Pc
    α = [1 + κ·(1 − √(T/Tc))]²   κ = 0,37464 + 1,54226·ω − 0,26992·ω²

Las LAMBDA con nombre van en el Administrador de nombres (nombres definidos
del libro) y se llaman unas a otras: `PR_P` usa `PR_A`, `PR_B` y `PR_ALFA`, y
`PR_ALFA` usa `PR_KAPPA`. También hay nombres que no son LAMBDA: una
constante (`R_GAS`) y tres celdas con nombre (`TC_CO2`, `PC_CO2`, `W_CO2`).

En el archivo, `LAMBDA` y `LET` se guardan como `_xlfn.LAMBDA` / `_xlfn.LET`
y sus parámetros con el prefijo `_xlpm.`; aquí se escriben limpios y
`archivo()` pone los prefijos.

Los valores de la columna «Python» se calculan aquí mismo, sin Excel, y son
los que usan las pruebas del motor (`tests/unit/lambda.test.ts`).
"""

import math
import re

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.formula import ArrayFormula

# Los nombres que son parámetros de LAMBDA o de LET en este libro.
PARAMETROS = {"x", "y", "a", "b", "f", "g", "k", "T", "v", "Tc", "Pc", "w", "R", "kappa", "alfa", "n", "r"}


def archivo(formula: str) -> str:
    """La fórmula como se guarda en el .xlsx: con `_xlfn.` y `_xlpm.`."""
    partes = re.split(r'("(?:[^"]|"")*")', formula)  # sin tocar los textos
    fuera = []
    for i, p in enumerate(partes):
        if i % 2 == 1:
            fuera.append(p)
            continue
        p = re.sub(r"\b(LAMBDA|LET)\(", r"_xlfn.\1(", p)
        p = re.sub(r"(?<![\w.!$])([A-Za-z_][A-Za-z0-9_]*)(?![\w(!])",
                   lambda m: f"_xlpm.{m.group(1)}" if m.group(1) in PARAMETROS else m.group(1), p)
        # Una LAMBDA guardada en LET se invoca como función: `f(7)`.
        p = re.sub(r"(?<![\w.])([A-Za-z_][A-Za-z0-9_]*)\(",
                   lambda m: f"_xlpm.{m.group(1)}(" if m.group(1) in PARAMETROS else m.group(0), p)
        fuera.append(p)
    return "".join(fuera)


# --- Los datos: CO2 a 310 K y 0,5 L/mol -----------------------------------
R_GAS = 0.08314462618  # L·bar/(mol·K)
TC, PC, W = 304.13, 73.77, 0.2239
T0, V0 = 310, 0.5

# Idénticos a AUXILIARES en tests/unit/fidelidadLambda.test.ts.
AUXILIARES = {"H2": T0, "H3": V0, "I2": TC, "I3": PC, "I4": W}


def kappa(w): return 0.37464 + 1.54226 * w - 0.26992 * w ** 2
def alfa(T, Tc, w): return (1 + kappa(w) * (1 - math.sqrt(T / Tc))) ** 2
def pr_a(Tc, Pc): return 0.45724 * R_GAS ** 2 * Tc ** 2 / Pc
def pr_b(Tc, Pc): return 0.0778 * R_GAS * Tc / Pc


def pr_p(T, v, Tc=TC, Pc=PC, w=W):
    a, b = pr_a(Tc, Pc), pr_b(Tc, Pc)
    return R_GAS * T / (v - b) - a * alfa(T, Tc, w) / (v ** 2 + 2 * b * v - b ** 2)


def pr_z(T, v, Tc=TC, Pc=PC, w=W): return pr_p(T, v, Tc, Pc, w) * v / (R_GAS * T)


# --- Los nombres del libro (Administrador de nombres) ----------------------
NOMBRES = {
    "R_GAS": "0.08314462618",
    "TC_CO2": "Fidelidad!$I$2",
    "PC_CO2": "Fidelidad!$I$3",
    "W_CO2": "Fidelidad!$I$4",
    "PR_KAPPA": "LAMBDA(w,0.37464+1.54226*w-0.26992*w^2)",
    "PR_ALFA": "LAMBDA(T,Tc,w,(1+PR_KAPPA(w)*(1-SQRT(T/Tc)))^2)",
    "PR_A": "LAMBDA(Tc,Pc,0.45724*R_GAS^2*Tc^2/Pc)",
    "PR_B": "LAMBDA(Tc,Pc,0.0778*R_GAS*Tc/Pc)",
    "PR_P": "LAMBDA(T,v,Tc,Pc,w,LET(a,PR_A(Tc,Pc),b,PR_B(Tc,Pc),R_GAS*T/(v-b)-a*PR_ALFA(T,Tc,w)/(v^2+2*b*v-b^2)))",
    "PR_Z": "LAMBDA(T,v,Tc,Pc,w,PR_P(T,v,Tc,Pc,w)*v/(R_GAS*T))",
    # Recursiva: el motor no la desarrolla (manda la celda al modo compatible).
    "FACTREC": "LAMBDA(n,IF(n<=1,1,n*FACTREC(n-1)))",
}

# Peng-Robinson entera en una celda, sin nombres: LET con una LAMBDA dentro.
PR_LET = ("LET(R,0.08314462618,Tc,I2,Pc,I3,w,I4,"
          "kappa,LAMBDA(w,0.37464+1.54226*w-0.26992*w^2),"
          "alfa,LAMBDA(T,(1+kappa(w)*(1-SQRT(T/Tc)))^2),"
          "a,0.45724*R^2*Tc^2/Pc,b,0.0778*R*Tc/Pc,"
          "R*H2/(H3-b)-a*alfa(H2)/(H3^2+2*b*H3-b^2))")

# Y como una LAMBDA invocada en la celda, en otro estado (350 K, 0,3 L/mol).
PR_INLINE = ("LAMBDA(T,v,LET(R,0.08314462618,Tc,I2,Pc,I3,w,I4,"
             "kappa,0.37464+1.54226*w-0.26992*w^2,a,0.45724*R^2*Tc^2/Pc,b,0.0778*R*Tc/Pc,"
             "R*T/(v-b)-a*(1+kappa*(1-SQRT(T/Tc)))^2/(v^2+2*b*v-b^2)))(350,0.3)")

CASOS = [
    ("L-001", "en línea", "LAMBDA invocada en la celda", "LAMBDA(x,x^2+1)(3)", 10),
    ("L-002", "en línea", "Dos parámetros", "LAMBDA(a,b,a*b-a)(4,5)", 16),
    ("L-003", "let", "LAMBDA guardada en LET, llamada dos veces", "LET(f,LAMBDA(x,2*x),f(7)+f(1))", 16),
    ("L-004", "let", "La LAMBDA usa un nombre anterior del LET", "LET(k,10,g,LAMBDA(x,x+k),g(5))", 15),
    ("L-005", "en línea", "Celdas como argumentos", "LAMBDA(x,y,x/y)(H2,H3)", T0 / V0),
    ("L-006", "ámbito", "El parámetro tapa el nombre del LET", "LET(x,1,LAMBDA(x,x*100)(2))", 200),
    ("L-007", "nombres", "Nombre que es una constante", "R_GAS*1000", R_GAS * 1000),
    ("L-008", "nombres", "Nombres que son celdas", "TC_CO2/PC_CO2", TC / PC),
    ("L-009", "con nombre", "PR_KAPPA(ω)", "PR_KAPPA(W_CO2)", kappa(W)),
    ("L-010", "con nombre", "PR_ALFA llama a PR_KAPPA", "PR_ALFA(H2,TC_CO2,W_CO2)", alfa(T0, TC, W)),
    ("L-011", "con nombre", "PR_A (usa R_GAS)", "PR_A(TC_CO2,PC_CO2)", pr_a(TC, PC)),
    ("L-012", "con nombre", "PR_B", "PR_B(TC_CO2,PC_CO2)", pr_b(TC, PC)),
    ("L-013", "con nombre", "Presión de Peng-Robinson (bar)", "PR_P(H2,H3,TC_CO2,PC_CO2,W_CO2)", pr_p(T0, V0)),
    ("L-014", "con nombre", "Factor de compresibilidad Z", "PR_Z(H2,H3,TC_CO2,PC_CO2,W_CO2)", pr_z(T0, V0)),
    ("L-015", "let", "Peng-Robinson entera con LET y LAMBDA", PR_LET, pr_p(T0, V0)),
    ("L-016", "en línea", "Peng-Robinson en línea a 350 K y 0,3 L/mol", PR_INLINE, pr_p(350, 0.3)),
    ("L-017", "con nombre", "Diferencia con el gas ideal", "PR_P(H2,H3,TC_CO2,PC_CO2,W_CO2)-R_GAS*H2/H3", pr_p(T0, V0) - R_GAS * T0 / V0),
    ("L-018", "con nombre", "Una LAMBDA con nombre como argumento de otra función", "ROUND(PR_P(H2,H3,I2,I3,I4),2)", round(pr_p(T0, V0), 2)),
    ("L-019", "matriz", "LAMBDA sobre un rango, dentro de SUMA", "SUM(LAMBDA(r,r*2)(I2:I4))", 2 * (TC + PC + W)),
    ("L-020", "errores", "Menos argumentos de los que pide", "PR_KAPPA()", "A VERIFICAR: #VALUE!"),
    ("L-021", "errores", "Más argumentos de los que pide", "LAMBDA(x,x)(1,2)", "A VERIFICAR: #VALUE!"),
    ("L-022", "errores", "LAMBDA sin invocar", "LAMBDA(x,x)", "A VERIFICAR: #CALC!"),
    ("L-023", "recursiva", "LAMBDA con nombre recursiva (factorial)", "FACTREC(5)", 120),
]

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"
for ref, valor in AUXILIARES.items():
    hoja[ref] = valor
hoja["H1"] = "T (K) · v (L/mol)"
hoja["I1"] = "Tc · Pc · ω (CO2)"

for col, titulo in zip("ABCDEFG", ["id", "categoria", "descripcion", "formula (texto)", "resultado de Excel", "notas", ""]):
    if titulo:
        hoja[f"{col}1"] = titulo
        hoja[f"{col}1"].font = Font(bold=True)

for i, (id_, categoria, descripcion, formula, esperado) in enumerate(CASOS, start=2):
    hoja[f"A{i}"] = id_
    hoja[f"B{i}"] = categoria
    hoja[f"C{i}"] = descripcion
    hoja[f"D{i}"] = formula
    if categoria == "matriz":
        hoja[f"E{i}"] = ArrayFormula(f"E{i}", f"={archivo(formula)}")
    else:
        hoja[f"E{i}"] = f"={archivo(formula)}"
    hoja[f"F{i}"] = esperado if isinstance(esperado, str) else f"Python: {esperado:.12g}"

for columna, ancho in [("A", 8), ("B", 11), ("C", 46), ("D", 60), ("E", 18), ("F", 30), ("H", 18), ("I", 18)]:
    hoja.column_dimensions[columna].width = ancho

# --- Hoja de simulación ----------------------------------------------------
pr = wb.create_sheet("PengRobinson")
pr["A1"] = "Peng-Robinson con LAMBDA: presión del CO2 con temperatura y volumen inciertos"
pr["A1"].font = Font(bold=True, size=13)
pr["A2"] = ("Escribe las funciones RIESGO de la guía en B8 y B9 (o márcalas como entradas en el panel). "
            "B11, B12 y B13 son la misma presión calculada de tres formas: tienen que coincidir.")
FILAS = [
    (4, "Temperatura crítica Tc (K)", TC, None),
    (5, "Presión crítica Pc (bar)", PC, None),
    (6, "Factor acéntrico ω", W, None),
    (8, "Temperatura T (K) — incierta", T0, None),
    (9, "Volumen molar v (L/mol) — incierto", V0, None),
    (11, "P con LAMBDA con nombre (bar)", "=PR_P(B8,B9,B4,B5,B6)", pr_p(T0, V0)),
    (12, "P con LAMBDA dentro de LET (bar)",
     "=" + PR_LET.replace("I2", "B4").replace("I3", "B5").replace("I4", "B6").replace("H2", "B8").replace("H3", "B9"),
     pr_p(T0, V0)),
    (13, "P con LAMBDA en la celda (bar)",
     "=" + PR_INLINE.replace("I2", "B4").replace("I3", "B5").replace("I4", "B6").replace("(350,0.3)", "(B8,B9)"),
     pr_p(T0, V0)),
    (14, "Factor de compresibilidad Z", "=PR_Z(B8,B9,B4,B5,B6)", pr_z(T0, V0)),
    (15, "P como gas ideal (bar)", "=R_GAS*B8/B9", R_GAS * T0 / V0),
    (16, "Desviación del gas ideal (%)", "=B11/B15-1", pr_p(T0, V0) / (R_GAS * T0 / V0) - 1),
]
pr["A3"], pr["B3"], pr["C3"] = "Dato", "Valor", "Python (sin incertidumbre)"
for c in ("A3", "B3", "C3"):
    pr[c].font = Font(bold=True)
for fila, etiqueta, valor, python in FILAS:
    pr[f"A{fila}"] = etiqueta
    pr[f"B{fila}"] = archivo(valor) if isinstance(valor, str) else valor
    if isinstance(valor, str):
        pr[f"B{fila}"] = "=" + archivo(valor[1:])
    if python is not None:
        pr[f"C{fila}"] = python
pr["B16"].number_format = "0.0%"
pr["C16"].number_format = "0.0%"
for c in ("B11", "B12", "B13", "B14", "B15", "C11", "C12", "C13", "C14", "C15"):
    pr[c].number_format = "0.000"
pr.column_dimensions["A"].width = 38
pr.column_dimensions["B"].width = 16
pr.column_dimensions["C"].width = 26

for nombre, formula in NOMBRES.items():
    wb.defined_names[nombre] = DefinedName(nombre, attr_text=archivo(formula))

if __name__ == "__main__":
    import sys
    if "--casos" in sys.argv:
        import json
        print(json.dumps({
            "nombres": NOMBRES,
            "casos": [{"id": c[0], "formula": c[3], "python": c[4]} for c in CASOS if not isinstance(c[4], str)],
        }, indent=1))
        sys.exit(0)
    wb.calculation.fullCalcOnLoad = True
    destino = "tests/fixtures/fidelidad-lambda.xlsx"
    wb.save(destino)
    print(f"Escrito {destino} con {len(CASOS)} casos, {len(NOMBRES)} nombres y la hoja PengRobinson.")
