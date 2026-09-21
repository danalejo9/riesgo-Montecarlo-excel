#!/usr/bin/env python3
"""
Genera la segunda tanda del libro de fidelidad (Fase 2 §11.3): el Nivel 1 de
funciones de criterio, las funciones de tipo y el operador de concatenación.

El archivo que produce **no sirve todavía**: sale con las fórmulas escritas
pero sin valores. Solo vale después de abrirlo en Excel de verdad, dejar que
calcule y guardarlo — y ese valor cacheado es la referencia contra la que se
compara el motor. Un simulador no sirve: la gracia de esta batería es que la
autoridad sea Excel y no nosotros.

    python3 tests/fixtures/generar-nivel1.py

Está en el repositorio, y no es un script suelto, por lo mismo que el
benchmark: si hay que regenerar o ampliar la tanda, tiene que poder hacerse
igual que la primera vez.

Formato que espera `tests/helpers/leerFidelidad.ts`, una fila por caso desde
la 2: A=id, B=categoría, C=descripción, D=la fórmula como texto (informativa),
E=la fórmula de verdad (de donde se lee el valor que Excel calculó), F=notas.

Las columnas M a Q, filas 2 a 8, son los datos auxiliares sobre los que operan
los casos. Tienen que coincidir **exactamente** con el diccionario AUXILIARES
de `tests/unit/fidelidadNivel1.test.ts`; si se toca una, hay que tocar la otra.
"""

from openpyxl import Workbook
from openpyxl.styles import Font

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"

# --- Datos auxiliares -----------------------------------------------------
#
# Un fragmento de presupuesto con las trampas puestas a propósito: una
# categoría escrita con mayúscula distinta (M6), una celda de categoría vacía
# pero con importe (M7/N7), una categoría que empieza igual que otra para los
# comodines (M8), un error de verdad en medio de un rango (P3) y un asterisco
# literal (Q2).

AUXILIARES = [
    # fila, M (categoría), N (importe), O (cantidad), P (con error), Q (comodín)
    (2, "obra",        1000, 5, 10,     "*"),
    (3, "suministro",  2000, 2, "=1/0", "a*b"),
    (4, "obra",        1500, 8, 20,     "texto"),
    (5, "transporte",   500, 1, None,   None),
    (6, "Obra",         300, 3, None,   None),
    (7, None,           700, 4, None,   None),  # M7 vacía a propósito
    (8, "obra civil",   900, 6, None,   None),
]

for fila, m, n, o, p, q in AUXILIARES:
    if m is not None:
        hoja[f"M{fila}"] = m
    hoja[f"N{fila}"] = n
    hoja[f"O{fila}"] = o
    if p is not None:
        hoja[f"P{fila}"] = p
    if q is not None:
        hoja[f"Q{fila}"] = q

hoja["M1"] = "categoría"
hoja["N1"] = "importe"
hoja["O1"] = "cantidad"
hoja["P1"] = "con error"
hoja["Q1"] = "comodines"

# --- Casos ----------------------------------------------------------------
#
# (id, categoría, descripción, fórmula, notas)
#
# En "notas" va lo que el motor calcula hoy, para poder comparar de un vistazo
# al recibir el libro de vuelta. Donde pone "A VERIFICAR" es un caso cuyo
# comportamiento está implementado según la documentación de Microsoft pero
# que nadie ha comprobado contra Excel: son la razón de ser de esta tanda.

CASOS = [
    # --- Criterios numéricos ---
    ("N1-001", "criterio-numerico", "SUMAR.SI con mayor que", 'SUMIF(N2:N8,">1000")', "motor: 3500"),
    ("N1-002", "criterio-numerico", "SUMAR.SI con menor o igual", 'SUMIF(N2:N8,"<=700")', "motor: 1500"),
    ("N1-003", "criterio-numerico", "SUMAR.SI con distinto de", 'SUMIF(N2:N8,"<>1000")', "motor: 5900"),
    ("N1-004", "criterio-numerico", "CONTAR.SI con mayor que", 'COUNTIF(N2:N8,">1000")', "motor: 2"),
    ("N1-005", "criterio-numerico", "CONTAR.SI con un número suelto como criterio", "COUNTIF(O2:O8,5)", "motor: 1"),
    ("N1-006", "criterio-numerico", "PROMEDIO.SI con mayor que", 'AVERAGEIF(N2:N8,">500")', "motor: 1220"),

    # --- Criterios de texto ---
    ("N1-007", "criterio-texto", "SUMAR.SI con rango de suma aparte; el texto no distingue mayúsculas",
     'SUMIF(M2:M8,"obra",N2:N8)', "motor: 2800 (incluye 'Obra' de M6)"),
    ("N1-008", "criterio-texto", "CONTAR.SI de texto, sin distinguir mayúsculas",
     'COUNTIF(M2:M8,"obra")', "motor: 3"),
    ("N1-009", "criterio-texto", "SUMAR.SI con comodín de cola",
     'SUMIF(M2:M8,"obra*",N2:N8)', "motor: 3700 (suma también 'obra civil')"),
    ("N1-010", "criterio-texto", "CONTAR.SI con comodín de un solo carácter",
     'COUNTIF(M2:M8,"?bra")', "motor: 3"),
    ("N1-011", "criterio-texto", "SUMAR.SI con distinto de un texto — ¿entra la fila de categoría vacía?",
     'SUMIF(M2:M8,"<>obra",N2:N8)', "A VERIFICAR. motor: 4100 (incluye la fila 7, de categoría vacía)"),
    ("N1-012", "criterio-texto", "SUMAR.SI sin rango de suma sobre un rango de texto",
     'SUMIF(M2:M8,"obra")', "A VERIFICAR. motor: 0 (el rango sumado es texto)"),

    # --- Criterios sobre vacío ---
    ("N1-013", "criterio-vacio", "CONTAR.SI de celdas vacías", 'COUNTIF(M2:M8,"")', "A VERIFICAR. motor: 1"),
    ("N1-014", "criterio-vacio", "CONTAR.SI de celdas no vacías", 'COUNTIF(M2:M8,"<>")', "A VERIFICAR. motor: 6"),
    ("N1-015", "criterio-vacio", "SUMAR.SI sobre las filas de categoría vacía",
     'SUMIF(M2:M8,"",N2:N8)', "A VERIFICAR. motor: 700"),
    ("N1-016", "criterio-vacio", "CONTAR.SI de vacías en un rango que no tiene ninguna",
     'COUNTIF(N2:N8,"")', "motor: 0"),

    # --- Varios criterios ---
    ("N1-017", "criterio-conjunto", "SUMAR.SI.CONJUNTO con dos criterios (el rango de suma va primero)",
     'SUMIFS(N2:N8,M2:M8,"obra",O2:O8,">4")', "motor: 2500"),
    ("N1-018", "criterio-conjunto", "CONTAR.SI.CONJUNTO con dos criterios",
     'COUNTIFS(M2:M8,"obra",O2:O8,">4")', "motor: 2"),
    ("N1-019", "criterio-conjunto", "PROMEDIO.SI.CONJUNTO con un criterio",
     'AVERAGEIFS(N2:N8,M2:M8,"obra")', "motor: 933,333..."),
    ("N1-020", "criterio-conjunto", "CONTAR.SI.CONJUNTO con dos criterios numéricos",
     'COUNTIFS(N2:N8,">500",O2:O8,"<6")', "motor: 3"),
    ("N1-021", "criterio-conjunto", "SUMAR.SI.CONJUNTO sin ninguna coincidencia",
     'SUMIFS(N2:N8,M2:M8,"noexiste")', "motor: 0"),
    ("N1-022", "criterio-conjunto", "PROMEDIO.SI.CONJUNTO sin ninguna coincidencia",
     'AVERAGEIFS(N2:N8,M2:M8,"noexiste")', "motor: #¡DIV/0!"),

    # --- Errores dentro del rango ---
    ("N1-023", "criterio-error", "CONTAR.SI sobre un rango que contiene un error",
     'COUNTIF(P2:P4,">0")', "A VERIFICAR. motor: 2 (ignora el error de P3)"),
    ("N1-024", "criterio-error", "SUMAR.SI sobre un rango que contiene un error",
     'SUMIF(P2:P4,">0")', "A VERIFICAR. motor: 30 (el error no coincide, así que no se propaga)"),

    # --- Comodín escapado ---
    ("N1-025", "criterio-texto", "CONTAR.SI buscando un asterisco literal con ~",
     'COUNTIF(Q2:Q4,"~*")', "A VERIFICAR. motor: 1 (solo Q2, que es exactamente '*')"),
    ("N1-026", "criterio-texto", "CONTAR.SI con comodín sin escapar sobre los mismos datos",
     'COUNTIF(Q2:Q4,"*")', "A VERIFICAR. motor: 3 (cualquier texto)"),

    # --- Redondeo a múltiplos (Nivel 0 recién implementado) ---
    ("N1-027", "redondeo", "REDOND.MULT al múltiplo más cercano", "MROUND(17,5)", "motor: 15"),
    ("N1-028", "redondeo", "REDOND.MULT con ambos argumentos negativos", "MROUND(-17,-5)", "motor: -15"),
    ("N1-029", "redondeo", "MULTIPLO.SUPERIOR de un negativo redondea HACIA cero",
     "CEILING(-2.5,1)", "A VERIFICAR. motor: -2"),
    ("N1-030", "redondeo", "MULTIPLO.INFERIOR de un negativo se aleja de cero",
     "FLOOR(-2.5,1)", "A VERIFICAR. motor: -3"),
    ("N1-031", "redondeo", "MULTIPLO.SUPERIOR de un positivo", "CEILING(2.5,1)", "motor: 3"),
    ("N1-032", "redondeo", "MULTIPLO.SUPERIOR con múltiplo negativo y valor negativo",
     "CEILING(-2.5,-1)", "A VERIFICAR. motor: -3"),

    # --- Estadísticos de orden (Nivel 0 recién implementado) ---
    ("N1-033", "estadistico", "SUMA.CUADRADOS", "SUMSQ(3,4)", "motor: 25"),
    ("N1-034", "estadistico", "PERCENTIL inclusivo al 90 %", "PERCENTILE(N2:N8,0.9)", "motor: 1700"),
    ("N1-035", "estadistico", "CUARTIL primer cuartil", "QUARTILE(N2:N8,1)", "motor: 600"),
    ("N1-036", "estadistico", "K.ESIMO.MAYOR, el segundo", "LARGE(N2:N8,2)", "motor: 1500"),
    ("N1-037", "estadistico", "K.ESIMO.MENOR, el segundo", "SMALL(N2:N8,2)", "motor: 500"),
    ("N1-038", "estadistico", "PERCENTIL con k fuera de rango", "PERCENTILE(N2:N8,1.5)", "motor: #¡NUM!"),

    # --- Funciones de tipo ---
    ("N1-039", "tipo", "ESBLANCO sobre una celda de verdad vacía", "ISBLANK(M7)", "motor: VERDADERO"),
    ("N1-040", "tipo", "ESBLANCO sobre una celda con valor", "ISBLANK(N7)", "motor: FALSO"),
    ("N1-041", "tipo", "ESTEXTO", "ISTEXT(M2)", "motor: VERDADERO"),
    ("N1-042", "tipo", "ESNUMERO", "ISNUMBER(N2)", "motor: VERDADERO"),
    ("N1-043", "tipo", "ESERROR sobre una división por cero", "ISERROR(P3)", "motor: VERDADERO"),
    ("N1-044", "tipo", "ESERR distingue #N/A del resto de errores", "ISERR(P3)", "motor: VERDADERO"),
    ("N1-045", "tipo", "CONTAR.BLANCO sobre el rango de categorías", "COUNTBLANK(M2:M8)", "motor: 1"),
    ("N1-046", "tipo", "SI.ND atrapa #N/A", 'IFNA(NA(),"ok")', 'motor: el texto "ok"'),

    # --- Concatenación y comparación de texto ---
    ("N1-047", "texto", "Concatenación con &", '"a"&"b"', 'motor: "ab"'),
    ("N1-048", "texto", "Un número concatenado se convierte a texto en formato General",
     'N2&""', 'A VERIFICAR. motor: "1000"'),
    ("N1-049", "texto", "Un decimal concatenado — ¿coma o punto en un Excel es-ES?",
     '1.5&""', 'A VERIFICAR. motor: "1.5". Si Excel devuelve "1,5", el motor necesita configuración regional'),
    ("N1-050", "texto", "La comparación de texto no distingue mayúsculas",
     'M2="OBRA"', "motor: VERDADERO"),
]

hoja["A1"] = "id"
hoja["B1"] = "categoria"
hoja["C1"] = "descripcion"
hoja["D1"] = "formula (texto)"
hoja["E1"] = "resultado de Excel"
hoja["F1"] = "notas"
for celda in ("A1", "B1", "C1", "D1", "E1", "F1", "M1", "N1", "O1", "P1", "Q1"):
    hoja[celda].font = Font(bold=True)

for i, (id_, categoria, descripcion, formula, notas) in enumerate(CASOS, start=2):
    hoja[f"A{i}"] = id_
    hoja[f"B{i}"] = categoria
    hoja[f"C{i}"] = descripcion
    hoja[f"D{i}"] = formula          # como texto, sin "=": informativo
    hoja[f"E{i}"] = f"={formula}"    # la de verdad
    hoja[f"F{i}"] = notas

for columna, ancho in [("A", 9), ("B", 19), ("C", 58), ("D", 34), ("E", 16), ("F", 62)]:
    hoja.column_dimensions[columna].width = ancho

# Que Excel recalcule al abrir, para que el usuario no tenga que forzarlo.
wb.calculation.fullCalcOnLoad = True

destino = "tests/fixtures/fidelidad-nivel1.xlsx"
wb.save(destino)
print(f"Escrito {destino} con {len(CASOS)} casos y {len(AUXILIARES)} filas auxiliares.")
print("Ahora hay que abrirlo en Excel de verdad, dejar que calcule y guardarlo.")
