#!/usr/bin/env python3
"""
Genera la **tercera tanda** del libro de fidelidad: financieras, búsquedas,
fechas y los casos que la segunda tanda dejó sin verificar.

Es la tanda que más falta hacía. Las financieras estructuradas (`TIR`, `VNA`,
`TASA`, `TIR.NO.PER`, `PAGOINT`/`PAGOPRIN`) y las búsquedas (`BUSCARV`,
`INDICE`, `COINCIDIR`, `BUSCARX`) están implementadas **según la documentación
de Microsoft y sin verificar contra Excel**. Varias se resuelven numéricamente,
y ahí Excel tiene convenios propios —cuántas iteraciones intenta antes de
rendirse, qué raíz elige cuando hay más de una, qué signo lleva un pago al
principio del periodo— que no están escritos en ninguna parte con la precisión
que hace falta. La única autoridad es Excel.

    python3 tests/fixtures/generar-nivel2.py

El archivo que produce **no sirve todavía**: sale con las fórmulas escritas
pero sin valores. Solo vale después de abrirlo en Excel de verdad, dejar que
calcule y guardarlo. Hasta entonces, `tests/unit/fidelidadNivel2.test.ts` deja
los casos en espera con un mensaje que lo dice, en vez de darlos por buenos.

Formato que espera `tests/helpers/leerFidelidad.ts`, una fila por caso desde
la 2: A=id, B=categoría, C=descripción, D=la fórmula como texto (informativa),
E=la fórmula de verdad (de donde se lee el valor que Excel calculó), F=notas.

Los datos auxiliares van de la columna H a la X y tienen que coincidir
**exactamente** con el diccionario AUXILIARES de
`tests/unit/fidelidadNivel2.test.ts`; si se toca uno, hay que tocar el otro.

**Las fechas van como número de serie, no como fecha con formato.** Excel las
acepta igual en `TIR.NO.PER` y `VNA.NO.PER`, y así el libro no depende de la
configuración regional de fechas de la máquina que lo abra — que es
exactamente la clase de diferencia que esta batería existe para detectar, no
para sufrir.
"""

from openpyxl import Workbook
from openpyxl.styles import Font

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"

# --- Datos auxiliares -----------------------------------------------------

AUXILIARES = {
    # Flujo de caja de un proyecto normal: una inversión y cinco cobros.
    "H1": "flujo", "H2": -10000, "H3": 2500, "H4": 3500, "H5": 4500, "H6": 3000, "H7": 2000,

    # Las fechas de esos flujos, como número de serie (ver el docstring).
    # 2026-01-01, 2026-04-01, 2026-07-01, 2027-01-01, 2027-07-01, 2028-01-01.
    "I1": "fecha", "I2": 46023, "I3": 46113, "I4": 46204, "I5": 46388, "I6": 46569, "I7": 46753,

    # Un flujo con dos cambios de signo: tiene más de una TIR matemática, y
    # cuál devuelve Excel es justo lo que no se puede deducir de la
    # documentación.
    "J1": "flujo raro", "J2": -1000, "J3": 5000, "J4": -6000, "J5": 2000,

    # Tabla de tarifas por tramo, ordenada: lo que espera una BUSCARV aproximada.
    "K1": "desde", "K2": 0, "K3": 100, "K4": 500, "K5": 1000, "K6": 5000,
    "L1": "letra", "L2": "F", "L3": "E", "L4": "D", "L5": "C", "L6": "B",
    "M1": "tarifa", "M2": 0.05, "M3": 0.08, "M4": 0.10, "M5": 0.12, "M6": 0.15,

    # La misma tabla desordenada. Excel no avisa de esto y devuelve cualquier
    # cosa con coherencia interna; el motor la imita recorriendo linealmente.
    "O1": "desde (desordenada)", "O2": 500, "O3": 100, "O4": 5000, "O5": 0, "O6": 1000,
    "P1": "tarifa", "P2": 0.10, "P3": 0.08, "P4": 0.15, "P5": 0.05, "P6": 0.12,

    # La tabla de tarifas puesta en horizontal, para BUSCARH.
    "R2": 0, "S2": 100, "T2": 500, "U2": 1000, "V2": 5000,
    "R3": 0.05, "S3": 0.08, "T3": 0.10, "U3": 0.12, "V3": 0.15,

    # Un rango numérico con un hueco en medio: el caso que la segunda tanda
    # dejó abierto ("<>5" contra una celda vacía).
    "X1": "con hueco", "X2": 5, "X4": 7, "X5": 5,  # X3 vacía a propósito
}

for ref, valor in AUXILIARES.items():
    hoja[ref] = valor

# --- Casos ----------------------------------------------------------------
#
# (id, categoría, descripción, fórmula, notas)
#
# En "notas" va lo que calcula el motor hoy, para poder comparar de un vistazo
# al recibir el libro. "A VERIFICAR" marca un caso cuyo comportamiento está
# implementado según la documentación pero que nadie ha comprobado contra
# Excel: son la razón de ser de esta tanda, no un adorno.

CASOS = [
    # --- TIR y VAN: lo que el usuario va a usar seguro --------------------
    ("N2-001", "tir", "TIR de un flujo normal", "IRR(H2:H7)", "A VERIFICAR. motor: 0,170721"),
    ("N2-002", "tir", "TIR con estimación inicial alta", "IRR(H2:H7,0.5)",
     "A VERIFICAR. Debería dar lo mismo que N2-001: la estimación no cambia la raíz, solo el camino"),
    ("N2-003", "tir", "TIR con estimación inicial negativa", "IRR(H2:H7,-0.5)", "A VERIFICAR"),
    ("N2-004", "tir", "TIR de un flujo todo positivo: no hay raíz", "IRR(H3:H7)",
     "A VERIFICAR. motor: #¡NUM!"),
    ("N2-005", "tir", "TIR de un flujo con dos cambios de signo: hay más de una raíz matemática",
     "IRR(J2:J5)", "A VERIFICAR. motor: 0 (el flujo suma cero, así que la tasa 0 es una raíz válida). Cuál devuelve Excel no está documentado"),
    ("N2-006", "tir", "TIR del flujo raro con otra estimación: ¿cambia la raíz?", "IRR(J2:J5,0.8)",
     "A VERIFICAR. motor: 2,4142 — distinto de N2-005. Con dos raíces, la TIR depende de la estimación, y hay que imitar la de Excel"),

    ("N2-007", "van", "VNA descontando desde el periodo 1 y sumando la inversión aparte",
     "NPV(0.1,H3:H7)+H2", "motor: 1837,089. Es la forma correcta de calcular un VAN"),
    ("N2-008", "van", "VNA metiendo el periodo 0 dentro: Excel lo descuenta un periodo",
     "NPV(0.1,H2:H7)", "A VERIFICAR. motor: el de N2-007 dividido por 1,1"),
    ("N2-009", "van", "VNA con tasa 0: es la suma", "NPV(0,H2:H7)", "motor: 5500"),
    ("N2-010", "van", "VNA con tasa negativa", "NPV(-0.05,H2:H7)", "A VERIFICAR"),
    ("N2-011", "van", "VNA con un solo flujo", "NPV(0.1,100)", "motor: 90,9091"),

    ("N2-012", "van", "VNA.NO.PER con fechas reales", "XNPV(0.1,H2:H7,I2:I7)",
     "A VERIFICAR. El motor usa 365 días por año; Excel también, pero conviene confirmarlo"),
    ("N2-013", "tir", "TIR.NO.PER con fechas reales", "XIRR(H2:H7,I2:I7)", "A VERIFICAR"),
    ("N2-014", "tir", "TIR.NO.PER con estimación inicial", "XIRR(H2:H7,I2:I7,0.2)",
     "A VERIFICAR. Debería coincidir con N2-013"),

    # --- Préstamos: PAGO y su descomposición ------------------------------
    ("N2-015", "prestamo", "PAGO de una hipoteca a 30 años", "PMT(0.05/12,360,200000)",
     "motor: -1073,643 (negativo: es un pago)"),
    ("N2-016", "prestamo", "PAGO con pagos al principio del periodo (tipo 1)",
     "PMT(0.05/12,360,200000,0,1)", "A VERIFICAR. motor: el de N2-015 dividido por (1+i)"),
    ("N2-017", "prestamo", "PAGO con valor futuro distinto de cero",
     "PMT(0.05/12,360,200000,50000)", "A VERIFICAR"),
    ("N2-018", "prestamo", "PAGO con tasa cero: reparto lineal", "PMT(0,10,1000)", "motor: -100"),
    ("N2-019", "prestamo", "VA de una renta", "PV(0.05,10,-1000)", "motor: 7721,735"),
    ("N2-020", "prestamo", "VF de una renta", "FV(0.05,10,-1000)", "motor: 12577,893"),
    ("N2-021", "prestamo", "VF con pagos al principio (tipo 1)", "FV(0.05,10,-1000,0,1)",
     "A VERIFICAR. motor: el de N2-020 por (1+i)"),
    ("N2-022", "prestamo", "NPER: cuántos periodos hacen falta", "NPER(0.05,-1000,8000)",
     "A VERIFICAR. motor: 10,4698"),
    ("N2-023", "prestamo", "NPER con tasa cero", "NPER(0,-1000,8000)", "motor: 8"),

    ("N2-024", "prestamo", "TASA: la incógnita es el interés, y se resuelve iterando",
     "RATE(10,-1000,8000)", "A VERIFICAR. Excel se rinde a las 20 iteraciones; el motor es más tenaz"),
    ("N2-025", "prestamo", "TASA con estimación inicial", "RATE(10,-1000,8000,0,0,0.2)",
     "A VERIFICAR. ¿Cambia el resultado respecto a N2-024?"),
    ("N2-026", "prestamo", "TASA de un caso que no converge", "RATE(3,-100,1000)",
     "A VERIFICAR. motor: -0,4244. Se espera que Excel dé #¡NUM!: se rinde a las 20 iteraciones y el motor es más tenaz. Es la divergencia que hay que medir, no un fallo"),

    ("N2-027", "prestamo", "PAGOINT del primer periodo", "IPMT(0.05/12,1,360,200000)",
     "motor: -833,33 (el interés del primer mes)"),
    ("N2-028", "prestamo", "PAGOPRIN del primer periodo", "PPMT(0.05/12,1,360,200000)",
     "motor: -240,3099"),
    ("N2-029", "prestamo", "PAGOINT del último periodo", "IPMT(0.05/12,360,360,200000)",
     "A VERIFICAR"),
    ("N2-030", "prestamo", "PAGOINT con pagos al principio (tipo 1) — el convenio de signos",
     "IPMT(0.05/12,1,360,200000,0,1)",
     "A VERIFICAR. Con tipo 1 el primer periodo no devenga interés: Excel devuelve 0"),
    ("N2-031", "prestamo", "PAGOPRIN con pagos al principio (tipo 1)",
     "PPMT(0.05/12,1,360,200000,0,1)", "A VERIFICAR"),
    ("N2-032", "prestamo", "PAGOINT del segundo periodo con tipo 1",
     "IPMT(0.05/12,2,360,200000,0,1)", "A VERIFICAR"),
    ("N2-033", "prestamo", "La identidad que tiene que cumplirse: PAGOINT + PAGOPRIN = PAGO",
     "IPMT(0.05/12,7,360,200000)+PPMT(0.05/12,7,360,200000)-PMT(0.05/12,360,200000)",
     "motor: 0. Si Excel no da 0, uno de los tres está mal"),

    # --- Búsquedas verticales ---------------------------------------------
    ("N2-034", "busqueda", "BUSCARV exacta que encuentra", "VLOOKUP(500,K2:M6,3,FALSE)", "motor: 0,1"),
    ("N2-035", "busqueda", "BUSCARV exacta que no encuentra", "VLOOKUP(700,K2:M6,3,FALSE)",
     "motor: #N/A"),
    ("N2-036", "busqueda", "BUSCARV aproximada sobre tabla ordenada: coge el tramo de abajo",
     "VLOOKUP(700,K2:M6,3,TRUE)", "motor: 0,1 (el tramo que empieza en 500)"),
    ("N2-037", "busqueda", "BUSCARV aproximada por debajo del primer tramo",
     "VLOOKUP(-5,K2:M6,3,TRUE)", "motor: #N/A"),
    ("N2-038", "busqueda", "BUSCARV sin el cuarto argumento: por omisión es aproximada",
     "VLOOKUP(700,K2:M6,3)", "motor: 0,1"),
    ("N2-039", "busqueda", "BUSCARV aproximada sobre tabla DESORDENADA — el caso que más me preocupa",
     "VLOOKUP(700,O2:P6,2,TRUE)",
     "A VERIFICAR. Excel no avisa y devuelve algo con coherencia interna; el motor recorre "
     "linealmente para imitarlo, pero nadie lo ha comprobado"),
    ("N2-040", "busqueda", "BUSCARV aproximada desordenada, otro valor", "VLOOKUP(2000,O2:P6,2,TRUE)",
     "A VERIFICAR"),
    ("N2-041", "busqueda", "BUSCARV de texto, sin distinguir mayúsculas",
     'VLOOKUP("d",L2:M6,2,FALSE)', "A VERIFICAR. motor: 0,1"),
    ("N2-042", "busqueda", "BUSCARV exacta con comodín",
     'VLOOKUP("?",L2:M6,2,FALSE)', "A VERIFICAR. Excel admite comodines en modo exacto"),
    ("N2-043", "busqueda", "BUSCARV con columna fuera de la tabla", "VLOOKUP(500,K2:M6,9,FALSE)",
     "motor: #¡REF!"),
    ("N2-044", "busqueda", "BUSCARV con columna 0", "VLOOKUP(500,K2:M6,0,FALSE)",
     "A VERIFICAR. motor: #¡VALOR!"),

    # --- Búsquedas horizontales y por posición ----------------------------
    ("N2-045", "busqueda", "BUSCARH exacta", "HLOOKUP(1000,R2:V3,2,FALSE)", "motor: 0,12"),
    ("N2-046", "busqueda", "BUSCARH aproximada", "HLOOKUP(700,R2:V3,2,TRUE)", "motor: 0,1"),
    ("N2-047", "busqueda", "INDICE sobre una columna", "INDEX(M2:M6,4)", "motor: 0,12"),
    ("N2-048", "busqueda", "INDICE sobre un rango de dos dimensiones", "INDEX(K2:M6,2,3)",
     "motor: 0,08. Ojo: el aplanado es por columnas, equivocarlo da una tabla transpuesta"),
    ("N2-049", "busqueda", "INDICE fuera de rango", "INDEX(M2:M6,9)", "motor: #¡REF!"),
    ("N2-050", "busqueda", "COINCIDIR exacta", "MATCH(500,K2:K6,0)", "motor: 3"),
    ("N2-051", "busqueda", "COINCIDIR exacta que no encuentra", "MATCH(700,K2:K6,0)", "motor: #N/A"),
    ("N2-052", "busqueda", "COINCIDIR aproximada ascendente", "MATCH(700,K2:K6,1)", "motor: 3"),
    ("N2-053", "busqueda", "COINCIDIR descendente sobre datos ascendentes", "MATCH(700,K2:K6,-1)",
     "A VERIFICAR. El modo -1 espera datos descendentes; aquí están al revés"),
    ("N2-054", "busqueda", "COINCIDIR de texto con comodín", 'MATCH("*",L2:L6,0)',
     "A VERIFICAR. motor: 1"),
    ("N2-055", "busqueda", "INDICE + COINCIDIR, la pareja clásica",
     "INDEX(M2:M6,MATCH(1000,K2:K6,0))", "motor: 0,12"),

    # --- BUSCARX y COINCIDIRX (llevan el prefijo _xlfn en el XML) ---------
    ("N2-056", "busqueda", "BUSCARX exacta", "_xlfn.XLOOKUP(500,K2:K6,M2:M6)", "motor: 0,1"),
    ("N2-057", "busqueda", "BUSCARX que no encuentra, con valor por defecto",
     '_xlfn.XLOOKUP(700,K2:K6,M2:M6,"sin tarifa")', 'motor: el texto "sin tarifa"'),
    ("N2-058", "busqueda", "BUSCARX que no encuentra y sin valor por defecto",
     "_xlfn.XLOOKUP(700,K2:K6,M2:M6)", "motor: #N/A"),
    ("N2-059", "busqueda", "BUSCARX con modo -1: el siguiente más pequeño",
     "_xlfn.XLOOKUP(700,K2:K6,M2:M6,,-1)", "A VERIFICAR. motor: 0,1"),
    ("N2-060", "busqueda", "BUSCARX con modo 1: el siguiente más grande",
     "_xlfn.XLOOKUP(700,K2:K6,M2:M6,,1)", "A VERIFICAR. motor: 0,12"),
    ("N2-061", "busqueda", "BUSCARX buscando desde el final",
     "_xlfn.XLOOKUP(0,K2:K6,M2:M6,,0,-1)", "A VERIFICAR. motor: 0,05"),
    ("N2-062", "busqueda", "COINCIDIRX exacta", "_xlfn.XMATCH(1000,K2:K6)", "motor: 4"),
    ("N2-063", "busqueda", "COINCIDIRX con modo -1", "_xlfn.XMATCH(700,K2:K6,-1)",
     "A VERIFICAR. motor: 3"),
    ("N2-085", "busqueda", "BUSCARX modo -1 sobre la tabla DESORDENADA",
     "_xlfn.XLOOKUP(700,O2:O6,P2:P6,,-1)",
     "A VERIFICAR. motor: 0,1. BUSCARX no exige orden con los modos -1 y 1 (solo con los "
     "binarios ±2), así que tiene que recorrer entera la lista y quedarse con el más cercano"),
    ("N2-086", "busqueda", "BUSCARX modo 1 sobre la tabla DESORDENADA",
     "_xlfn.XLOOKUP(700,O2:O6,P2:P6,,1)", "A VERIFICAR. motor: 0,12"),
    ("N2-064", "busqueda", "ELEGIR", 'CHOOSE(2,"a","b","c")', 'motor: "b"'),
    ("N2-065", "busqueda", "ELEGIR con índice fuera de rango", 'CHOOSE(9,"a","b")',
     "motor: #¡VALOR!"),

    # --- SI.ND, que se cayó en la tanda anterior por el prefijo -----------
    ("N2-066", "error", "SI.ND atrapa #N/A", '_xlfn.IFNA(NA(),"ok")',
     'motor: "ok". En la tanda anterior se escribió sin el prefijo _xlfn y Excel dio #¿NOMBRE?'),
    ("N2-067", "error", "SI.ND sobre una BUSCARV que falla",
     '_xlfn.IFNA(VLOOKUP(700,K2:M6,3,FALSE),"sin tarifa")', 'motor: "sin tarifa"'),
    ("N2-068", "error", "SI.ND no atrapa un error que no sea #N/A", '_xlfn.IFNA(1/0,"ok")',
     "motor: #¡DIV/0!"),
    ("N2-069", "error", "SI.ERROR sí lo atrapa", 'IFERROR(1/0,"ok")', 'motor: "ok"'),

    # --- El criterio numérico contra una celda vacía ----------------------
    ("N2-070", "criterio-vacio", "CONTAR.SI con distinto de un número, con una celda vacía en medio",
     'COUNTIF(X2:X5,"<>5")',
     "A VERIFICAR. motor: 2 (la vacía cuenta como distinta de 5, por coherencia con el caso de "
     "texto que Excel ya confirmó en N1-011)"),
    ("N2-071", "criterio-vacio", "SUMAR.SI con distinto de un número sobre el mismo rango",
     'SUMIF(X2:X5,"<>5")', "A VERIFICAR. motor: 7"),
    ("N2-072", "criterio-vacio", "CONTAR.SI de igual a un número, con el hueco en medio",
     "COUNTIF(X2:X5,5)", "motor: 2"),

    # --- Fechas ------------------------------------------------------------
    ("N2-073", "fecha", "FIN.MES un mes después del 31 de enero", "EOMONTH(DATE(2026,1,31),1)",
     "motor: 28/02/2026 como número de serie"),
    ("N2-074", "fecha", "FECHA.MES un mes después del 31 de enero", "EDATE(DATE(2026,1,31),1)",
     "A VERIFICAR. motor: 28/02/2026 (recorta al último día del mes)"),
    ("N2-075", "fecha", "FIN.MES hacia atrás", "EOMONTH(DATE(2026,3,15),-2)", "motor: 31/01/2026"),
    # `DIAS` (DAYS) es de Excel 2013, así que en el XML va con el prefijo
    # `_xlfn.`, igual que `SI.ND`. Sin él, Excel la toma por una función
    # definida por el usuario y devuelve #¿NOMBRE?. Pasó en la primera vuelta
    # de esta tanda, exactamente como había pasado con `SI.ND` en la anterior:
    # la lista de funciones que necesitan prefijo es más larga de lo que
    # parece, y solo se descubre probándolas.
    ("N2-076", "fecha", "DIAS entre dos fechas", "_xlfn.DAYS(DATE(2026,3,1),DATE(2026,2,1))",
     "motor: 28"),
    ("N2-077", "fecha", "DIASEM de un martes, convenio por omisión",
     "WEEKDAY(DATE(2026,9,22))", "motor: 3 (domingo = 1)"),
    ("N2-078", "fecha", "DIASEM con convenio 2 (lunes = 1)", "WEEKDAY(DATE(2026,9,22),2)",
     "A VERIFICAR. motor: 2"),
    ("N2-079", "fecha", "FECHA con mes 13: pasa al año siguiente", "DATE(2026,13,1)",
     "motor: 01/01/2027"),
    ("N2-080", "fecha", "FECHA con día 0: el último del mes anterior", "DATE(2026,1,0)",
     "A VERIFICAR. motor: 31/12/2025"),
    ("N2-081", "fecha", "FECHA con año de dos cifras: 24 es 1924, no 2024", "DATE(24,1,1)",
     "motor: 01/01/1924. Confirmado ya en un test unitario; aquí se fija contra Excel"),
    ("N2-082", "fecha", "AÑO de un número de serie", "YEAR(I2)", "motor: 2026"),
    ("N2-083", "fecha", "MES y DIA de un número de serie", "MONTH(I4)*100+DAY(I4)",
     "motor: 701 (1 de julio)"),
    ("N2-084", "fecha", "El día 60 de 1900 no existe: el error de año bisiesto que Excel conserva",
     "YEAR(60)*10000+MONTH(60)*100+DAY(60)",
     "A VERIFICAR. Excel dice 29/02/1900, que no existió. motor: 19000229"),
]

hoja["A1"] = "id"
hoja["B1"] = "categoria"
hoja["C1"] = "descripcion"
hoja["D1"] = "formula (texto)"
hoja["E1"] = "resultado de Excel"
hoja["F1"] = "notas"
for celda in ("A1", "B1", "C1", "D1", "E1", "F1", "H1", "I1", "J1", "K1", "L1", "M1", "O1", "P1", "X1"):
    hoja[celda].font = Font(bold=True)

for i, (id_, categoria, descripcion, formula, notas) in enumerate(CASOS, start=2):
    hoja[f"A{i}"] = id_
    hoja[f"B{i}"] = categoria
    hoja[f"C{i}"] = descripcion
    hoja[f"D{i}"] = formula          # como texto, sin "=": informativo
    hoja[f"E{i}"] = f"={formula}"    # la de verdad
    hoja[f"F{i}"] = notas

for columna, ancho in [("A", 9), ("B", 15), ("C", 62), ("D", 40), ("E", 18), ("F", 70)]:
    hoja.column_dimensions[columna].width = ancho

# Que Excel recalcule al abrir, para que el usuario no tenga que forzarlo.
wb.calculation.fullCalcOnLoad = True

destino = "tests/fixtures/fidelidad-nivel2.xlsx"
wb.save(destino)
print(f"Escrito {destino} con {len(CASOS)} casos.")
print("Ahora hay que abrirlo en Excel de verdad, dejar que calcule y guardarlo.")
