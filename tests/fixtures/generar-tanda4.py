#!/usr/bin/env python3
"""
Genera la **cuarta tanda** del libro de fidelidad: el Nivel 2 de texto,
`SUBTOTALES` y `AGREGAR`, y el `DIAS` que quedó pendiente de la tercera.

    python3 tests/fixtures/generar-tanda4.py

Igual que las anteriores: el archivo sale con las fórmulas y sin valores, y
solo sirve después de abrirlo en Excel de verdad, dejar que calcule y
guardarlo. `tests/unit/fidelidadTanda4.test.ts` lo deja en espera hasta
entonces.

Las funciones de texto parecen triviales y no lo son: `NOMPROPIO` pone
mayúscula después de un dígito, `ESPACIOS` no toca el espacio duro, `HALLAR`
devuelve `#¡VALOR!` y no `#N/A`, `CARACTER(128)` depende de la página de
códigos de Windows. Todo eso está implementado según la documentación, que es
exactamente lo que en tres tandas seguidas ha resultado no bastar.

**Tres casos sondean la configuración regional a propósito** (T4-013, T4-052,
T4-072): convertir un decimal a texto, leer "1234.5" como número y escribir un
lógico como texto. En un Excel en español se espera que den distinto que el
motor, que todavía no recibe esa configuración. No son fallos a esconder: son
la medida de cuánto trabajo pendiente hay ahí.

Formato que espera `tests/helpers/leerFidelidad.ts`: una fila por caso desde la
2, A=id, B=categoría, C=descripción, D=fórmula como texto, E=fórmula de verdad,
F=notas. Los datos auxiliares van de la H a la S y tienen que coincidir con el
diccionario AUXILIARES del test.
"""

from openpyxl import Workbook
from openpyxl.styles import Font

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"

# --- Datos auxiliares -----------------------------------------------------

AUXILIARES = {
    # Textos con trampa para NOMPROPIO y ESPACIOS.
    "H1": "textos",
    "H2": "presupuesto de OBRA",
    "H3": "  mucho    espacio  ",
    "H4": "o'neil",
    "H5": "2nd",

    # Un rango de 2x2 para comprobar que CONCAT recorre por filas.
    "I2": "a", "J2": "b",
    "I3": "c", "J3": "d",

    # Para UNIRCADENAS: una celda vacía (K3) y un texto vacío de verdad (K5).
    "K1": "unir",
    "K2": "a", "K4": "c", "K5": '=""',

    # Un presupuesto con subtotales por capítulo: el patrón de SUBTOTALES.
    "M1": "presupuesto",
    "M2": 100, "M3": 200, "M4": "=SUBTOTAL(9,M2:M3)",
    "M5": 50, "M6": 25, "M7": "=SUBTOTAL(9,M5:M6)",

    # Un rango con un error en medio, para AGREGAR con y sin ignorar errores.
    "O1": "con error",
    "O2": 10, "O3": "=1/0", "O4": 30,

    # Para las funciones de AGREGAR con k.
    "Q1": "con k",
    "Q2": 1, "Q3": 2, "Q4": 3, "Q5": 4, "Q6": "=1/0",

    # Dos modas empatadas: Excel devuelve la que aparece antes.
    "S1": "moda",
    "S2": 3, "S3": 5, "S4": 5, "S5": 3,
}

for ref, valor in AUXILIARES.items():
    hoja[ref] = valor

# --- Casos ----------------------------------------------------------------
#
# (id, categoría, descripción, fórmula, notas)
#
# Las funciones posteriores a 2007 van con su prefijo `_xlfn.`: CONCAT,
# UNIRCADENAS (TEXTJOIN), VALOR.NUMERO (NUMBERVALUE), AGREGAR (AGGREGATE) y
# DIAS (DAYS). Sin él, Excel las toma por funciones del usuario y devuelve
# #¿NOMBRE?; ya pasó con SI.ND en la segunda tanda y con DIAS en la tercera.

CASOS = [
    # --- Longitud y extracción ---
    ("T4-001", "extraer", "LARGO de un texto", 'LEN("hola")', "motor: 4"),
    ("T4-002", "extraer", "LARGO de un número: cuenta su formato General", "LEN(1234)", "motor: 4"),
    ("T4-003", "extraer", "LARGO del texto vacío", 'LEN("")', "motor: 0"),
    ("T4-004", "extraer", "IZQUIERDA", 'LEFT("Presupuesto",3)', 'motor: "Pre"'),
    ("T4-005", "extraer", "IZQUIERDA sin longitud: un carácter", 'LEFT("abc")', 'motor: "a"'),
    ("T4-006", "extraer", "IZQUIERDA pidiendo más de lo que hay", 'LEFT("abc",10)', 'motor: "abc"'),
    ("T4-007", "extraer", "IZQUIERDA con longitud negativa", 'LEFT("abc",-1)', "motor: #¡VALOR!"),
    ("T4-008", "extraer", "DERECHA", 'RIGHT("Presupuesto",5)', 'motor: "uesto"'),
    ("T4-009", "extraer", "EXTRAE", 'MID("Presupuesto",4,3)', 'motor: "sup"'),
    ("T4-010", "extraer", "EXTRAE empezando más allá del final", 'MID("abc",5,2)',
     'A VERIFICAR. motor: el texto vacío, no un error'),
    ("T4-011", "extraer", "EXTRAE empezando en 0", 'MID("abc",0,2)', "motor: #¡VALOR!"),
    ("T4-012", "extraer", "IZQUIERDA de un número entero", "LEFT(1234,2)", 'motor: "12"'),
    ("T4-013", "regional", "IZQUIERDA de un decimal — ¿coma o punto?", "LEFT(1.5,3)",
     'A VERIFICAR (configuración regional). motor: "1.5"; un Excel en español debería dar "1,5"'),

    # --- Mayúsculas y espacios ---
    ("T4-014", "mayusculas", "MAYUSC con eñe", 'UPPER("año")', 'motor: "AÑO"'),
    ("T4-015", "mayusculas", "MINUSC con tilde", 'LOWER("ÁRBOL")', 'motor: "árbol"'),
    ("T4-016", "mayusculas", "NOMPROPIO de una frase", "PROPER(H2)", 'motor: "Presupuesto De Obra"'),
    ("T4-017", "mayusculas", "NOMPROPIO tras un apóstrofo", "PROPER(H4)", "motor: \"O'Neil\""),
    ("T4-018", "mayusculas", "NOMPROPIO tras un dígito — la rareza conocida", "PROPER(H5)",
     'A VERIFICAR. motor: "2Nd"'),
    ("T4-019", "espacios", "ESPACIOS", "TRIM(H3)", 'motor: "mucho espacio"'),
    ("T4-020", "espacios", "ESPACIOS no quita el espacio duro (carácter 160)",
     'LEN(TRIM(CHAR(160)&"x"))', "A VERIFICAR. motor: 2"),

    # --- Concatenar ---
    ("T4-021", "concatenar", "CONCATENAR un texto y un número", 'CONCATENATE("Año ",2026)', 'motor: "Año 2026"'),
    ("T4-022", "concatenar", "CONCAT de un rango 2x2: ¿por filas o por columnas?", "_xlfn.CONCAT(I2:J3)",
     'A VERIFICAR. motor: "abcd" (por filas)'),
    ("T4-023", "concatenar", "UNIRCADENAS ignorando vacías (incluido el texto vacío)",
     '_xlfn.TEXTJOIN(", ",TRUE,K2:K5)', 'A VERIFICAR. motor: "a, c"'),
    ("T4-024", "concatenar", "UNIRCADENAS sin ignorar vacías",
     '_xlfn.TEXTJOIN(", ",FALSE,K2:K5)', 'motor: "a, , c, "'),
    ("T4-025", "concatenar", "CONCAT con un error en medio", '_xlfn.CONCAT("a",1/0)', "motor: #¡DIV/0!"),

    # --- Buscar ---
    ("T4-026", "buscar", "ENCONTRAR distingue mayúsculas", 'FIND("A","banana")', "motor: #¡VALOR!"),
    ("T4-027", "buscar", "HALLAR no las distingue", 'SEARCH("A","banana")', "motor: 2"),
    ("T4-028", "buscar", "ENCONTRAR desde la posición 3: la posición cuenta desde el principio",
     'FIND("a","banana",3)', "motor: 4"),
    ("T4-029", "buscar", "HALLAR con ?", 'SEARCH("n?n","banana")', "motor: 3"),
    ("T4-030", "buscar", "HALLAR con *", 'SEARCH("b*n","abanana")', "motor: 2"),
    ("T4-031", "buscar", "HALLAR un asterisco literal con ~", 'SEARCH("~*","a*b")', "motor: 2"),
    ("T4-032", "buscar", "ENCONTRAR el texto vacío", 'FIND("","abc")', "A VERIFICAR. motor: 1"),
    ("T4-033", "buscar", "ENCONTRAR el texto vacío desde la 3", 'FIND("","abc",3)', "A VERIFICAR. motor: 3"),
    ("T4-034", "buscar", "ENCONTRAR desde más allá del final", 'FIND("","abc",5)', "A VERIFICAR. motor: #¡VALOR!"),

    # --- Sustituir y reemplazar ---
    ("T4-035", "sustituir", "SUSTITUIR todas", 'SUBSTITUTE("a-b-c","-","/")', 'motor: "a/b/c"'),
    ("T4-036", "sustituir", "SUSTITUIR solo la segunda", 'SUBSTITUTE("a-b-c","-","/",2)', 'motor: "a-b/c"'),
    ("T4-037", "sustituir", "SUSTITUIR una ocurrencia que no existe", 'SUBSTITUTE("a-b-c","-","/",9)',
     'motor: "a-b-c"'),
    ("T4-038", "sustituir", "SUSTITUIR distingue mayúsculas", 'SUBSTITUTE("Aa","a","x")', 'motor: "Ax"'),
    ("T4-039", "sustituir", "REEMPLAZAR por posición", 'REPLACE("2025-01",1,4,"2026")', 'motor: "2026-01"'),
    ("T4-040", "sustituir", "REEMPLAZAR empezando más allá del final", 'REPLACE("abc",10,1,"Z")',
     'A VERIFICAR. motor: "abcZ"'),
    ("T4-041", "sustituir", "REPETIR", 'REPT("ab",3)', 'motor: "ababab"'),
    ("T4-042", "sustituir", "REPETIR un número negativo de veces", 'REPT("ab",-1)', "motor: #¡VALOR!"),

    # --- Caracteres ---
    ("T4-043", "caracter", "CARACTER(65)", "CHAR(65)", 'motor: "A"'),
    ("T4-044", "caracter", "CARACTER(128): página de códigos de Windows", "CHAR(128)", 'A VERIFICAR. motor: "€"'),
    ("T4-045", "caracter", "CARACTER fuera de 1-255", "CHAR(256)", "motor: #¡VALOR!"),
    ("T4-046", "caracter", "CODIGO de una letra", 'CODE("A")', "motor: 65"),
    ("T4-047", "caracter", "CODIGO del euro", 'CODE("€")', "A VERIFICAR. motor: 128"),
    ("T4-048", "caracter", "CODIGO de la eñe", 'CODE("ñ")', "motor: 241"),
    ("T4-049", "caracter", "CODIGO del texto vacío", 'CODE("")', "motor: #¡VALOR!"),
    ("T4-050", "caracter", "IGUAL distingue mayúsculas", 'EXACT("Obra","obra")', "motor: FALSO"),
    ("T4-051", "caracter", "IGUAL de un número y su texto", 'EXACT(1,"1")', "motor: VERDADERO"),

    # --- De texto a número ---
    ("T4-052", "regional", 'VALOR("1234.5") — ¿qué es el punto en un Excel en español?', 'VALUE("1234.5")',
     "A VERIFICAR (configuración regional). motor: 1234,5"),
    ("T4-053", "convertir", "VALOR de un porcentaje", 'VALUE("15%")', "motor: 0,15"),
    ("T4-054", "convertir", "VALOR del texto vacío", 'VALUE("")', "A VERIFICAR. motor: #¡VALOR!"),
    ("T4-055", "convertir", "VALOR de un texto que no es número", 'VALUE("abc")', "motor: #¡VALOR!"),
    ("T4-056", "convertir", "VALOR de un lógico", "VALUE(TRUE)", "A VERIFICAR. motor: #¡VALOR!"),
    ("T4-057", "convertir", "VALOR.NUMERO con coma decimal y punto de miles",
     '_xlfn.NUMBERVALUE("1.234,5",",",".")', "motor: 1234,5"),
    ("T4-058", "convertir", "VALOR.NUMERO ignora los espacios", '_xlfn.NUMBERVALUE("2 500",".",",")', "motor: 2500"),
    ("T4-059", "convertir", "VALOR.NUMERO con dos %", '_xlfn.NUMBERVALUE("50%%",".",",")', "A VERIFICAR. motor: 0,005"),
    ("T4-060", "convertir", "VALOR.NUMERO del texto vacío", '_xlfn.NUMBERVALUE("",".",",")', "A VERIFICAR. motor: 0"),
    ("T4-061", "convertir", "VALOR.NUMERO con miles después del decimal",
     '_xlfn.NUMBERVALUE("1,5.3",",",".")', "motor: #¡VALOR!"),

    # --- Tipo y conversiones triviales ---
    ("T4-062", "tipo", "TIPO de un número", "TYPE(5)", "motor: 1"),
    ("T4-063", "tipo", "TIPO de un texto", 'TYPE("a")', "motor: 2"),
    ("T4-064", "tipo", "TIPO de un lógico", "TYPE(TRUE)", "motor: 4"),
    ("T4-065", "tipo", "TIPO de un error: no lo propaga, lo clasifica", "TYPE(1/0)", "motor: 16"),
    ("T4-066", "tipo", "TIPO de una celda vacía", "TYPE(Z99)", "A VERIFICAR. motor: 1"),
    ("T4-067", "tipo", "N de un lógico", "N(TRUE)", "motor: 1"),
    ("T4-068", "tipo", "N de un texto numérico", 'N("7")', "motor: 0"),
    ("T4-069", "tipo", "T de un número", "T(5)", "motor: el texto vacío"),
    ("T4-070", "tipo", "T de un texto", 'T("x")', 'motor: "x"'),
    ("T4-071", "tipo", "HIPERVINCULO vale el nombre que enseña",
     'HYPERLINK("https://example.com","Informe")', 'motor: "Informe"'),
    ("T4-072", "regional", "MAYUSC de un lógico — ¿TRUE o VERDADERO?", "UPPER(TRUE)",
     'A VERIFICAR (configuración regional). motor: "TRUE"; un Excel en español debería dar "VERDADERO"'),

    # --- SUBTOTALES y AGREGAR ---
    ("T4-073", "subtotal", "SUBTOTALES del total general ignora los subtotales intermedios",
     "SUBTOTAL(9,M2:M7)", "motor: 375 (y no 750)"),
    ("T4-074", "subtotal", "SUMA sobre el mismo rango sí cuenta dos veces", "SUM(M2:M7)", "motor: 750"),
    ("T4-075", "subtotal", "SUBTOTALES(109) sin filas ocultas es igual que 9", "SUBTOTAL(109,M2:M7)", "motor: 375"),
    ("T4-076", "subtotal", "SUBTOTALES(1): el promedio", "SUBTOTAL(1,M2:M3)", "motor: 150"),
    ("T4-077", "subtotal", "SUBTOTALES propaga un error del rango", "SUBTOTAL(9,O2:O4)", "motor: #¡DIV/0!"),
    ("T4-078", "agregar", "AGREGAR suma ignorando errores (opción 6)", "_xlfn.AGGREGATE(9,6,O2:O4)", "motor: 40"),
    ("T4-079", "agregar", "AGREGAR promedia ignorando errores", "_xlfn.AGGREGATE(1,6,O2:O4)", "motor: 20"),
    ("T4-080", "agregar", "AGREGAR con la opción 4 no ignora nada", "_xlfn.AGGREGATE(9,4,O2:O4)", "motor: #¡DIV/0!"),
    ("T4-081", "agregar", "AGREGAR con la opción 0 ignora los subtotales", "_xlfn.AGGREGATE(9,0,M2:M7)", "motor: 375"),
    ("T4-082", "agregar", "AGREGAR con la opción 4 los cuenta", "_xlfn.AGGREGATE(9,4,M2:M7)", "A VERIFICAR. motor: 750"),
    ("T4-083", "agregar", "AGREGAR 14: el mayor", "_xlfn.AGGREGATE(14,6,Q2:Q6,1)", "motor: 4"),
    ("T4-084", "agregar", "AGREGAR 15: el segundo menor", "_xlfn.AGGREGATE(15,6,Q2:Q6,2)", "motor: 2"),
    ("T4-085", "agregar", "AGREGAR 16: percentil inclusivo", "_xlfn.AGGREGATE(16,6,Q2:Q6,0.5)", "motor: 2,5"),
    ("T4-086", "agregar", "AGREGAR 17: primer cuartil", "_xlfn.AGGREGATE(17,6,Q2:Q6,1)", "motor: 1,75"),
    ("T4-087", "agregar", "AGREGAR 18: percentil exclusivo fuera de alcance", "_xlfn.AGGREGATE(18,6,Q2:Q4,0.1)",
     "A VERIFICAR. motor: #¡NUM!"),
    ("T4-088", "agregar", "AGREGAR 13: la moda, con dos empatadas", "_xlfn.AGGREGATE(13,6,S2:S5)",
     "A VERIFICAR. motor: 3 (la que aparece antes)"),
    ("T4-089", "agregar", "AGREGAR con una opción inválida", "_xlfn.AGGREGATE(9,8,O2:O4)", "A VERIFICAR. motor: #¡VALOR!"),

    # --- Pendiente de la tercera tanda ---
    ("T4-090", "fecha", "DIAS, ahora con su prefijo _xlfn", "_xlfn.DAYS(DATE(2026,3,1),DATE(2026,2,1))",
     "motor: 28. En la tercera tanda dio #¿NOMBRE? por faltar el prefijo"),
]

hoja["A1"] = "id"
hoja["B1"] = "categoria"
hoja["C1"] = "descripcion"
hoja["D1"] = "formula (texto)"
hoja["E1"] = "resultado de Excel"
hoja["F1"] = "notas"
for celda in ("A1", "B1", "C1", "D1", "E1", "F1", "H1", "K1", "M1", "O1", "Q1", "S1"):
    hoja[celda].font = Font(bold=True)

for i, (id_, categoria, descripcion, formula, notas) in enumerate(CASOS, start=2):
    hoja[f"A{i}"] = id_
    hoja[f"B{i}"] = categoria
    hoja[f"C{i}"] = descripcion
    hoja[f"D{i}"] = formula
    hoja[f"E{i}"] = f"={formula}"
    hoja[f"F{i}"] = notas

for columna, ancho in [("A", 9), ("B", 12), ("C", 62), ("D", 44), ("E", 18), ("F", 70)]:
    hoja.column_dimensions[columna].width = ancho

wb.calculation.fullCalcOnLoad = True

destino = "tests/fixtures/fidelidad-tanda4.xlsx"
wb.save(destino)
print(f"Escrito {destino} con {len(CASOS)} casos.")
