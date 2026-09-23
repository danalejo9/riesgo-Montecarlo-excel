#!/usr/bin/env python3
"""
Genera la **sexta tanda** del libro de fidelidad: el resto del Nivel 1.

    python3 tests/fixtures/generar-tanda6.py

`MAX.SI.CONJUNTO`, `MIN.SI.CONJUNTO`, `SI.CONJUNTO`, `CAMBIAR`, `BUSCAR` y las
funciones de calendario: `DIAS360`, `FRAC.AÑO`, `SIFECHA`, `DIA.LAB`,
`DIAS.LAB` y `FECHANUMERO`.

Las de calendario son las que más casos llevan porque son las que tienen
**convenciones**: el último día de febrero, los días 31 y los años bisiestos
son justo donde el método estadounidense, el europeo y las cinco bases de
`FRAC.AÑO` dan números distintos. Escribirlas de memoria da resultados
plausibles y equivocados; este libro dice cuáles.

Las funciones posteriores a 2007 van con el prefijo `_xlfn.` en la fórmula,
que es como Excel las guarda en el archivo: sin él, Excel no las reconoce al
abrir (lección de la segunda tanda, con `SI.ND` y `DIAS`).

`FECHANUMERO` depende del idioma (día/mes o mes/día, nombres de meses), así
que este libro **solo vale calculado por un Excel en español**, como la quinta.

Formato: el de siempre (A=id … F=notas). Datos auxiliares en H:Q.
"""

from openpyxl import Workbook
from openpyxl.styles import Font

wb = Workbook()
hoja = wb.active
hoja.title = "Fidelidad"

# Idénticos a AUXILIARES en tests/unit/fidelidadTanda6.test.ts.
AUXILIARES = {
    # Notas (H) y grados (I): el ejemplo de MAX.SI.CONJUNTO de Microsoft.
    "H2": 89, "H3": 93, "H4": 96, "H5": 85, "H6": 91, "H7": 88,
    "I2": 1, "I3": 2, "I4": 2, "I5": 3, "I6": 1, "I7": 1,
    # Frecuencias (J) y colores (K): el ejemplo de BUSCAR de Microsoft.
    "J2": 4.14, "J3": 4.19, "J4": 5.17, "J5": 5.77, "J6": 6.39,
    "K2": "rojo", "K3": "naranja", "K4": "amarillo", "K5": "verde", "K6": "azul",
    # Festivos (L): 22-nov-2012, 4-dic-2012, 21-ene-2013, como números de serie.
    "L2": 41235, "L3": 41247, "L4": 41295,
    # Matriz más ancha que alta para BUSCAR (N2:Q3).
    "N2": "a", "O2": "b", "P2": "c", "Q2": "d",
    "N3": 1, "O3": 2, "P3": 3, "Q3": 4,
}
for ref, valor in AUXILIARES.items():
    hoja[ref] = valor
hoja["H1"] = "auxiliares"

F = "DATE"  # para que las fechas de las fórmulas se lean de un vistazo

CASOS = [
    # --- MAX.SI.CONJUNTO / MIN.SI.CONJUNTO ---
    ("T6-001", "maxsi", "Máximo entre las filas del grado 1", '_xlfn.MAXIFS(H2:H7,I2:I7,1)', "91 (Microsoft)"),
    ("T6-002", "maxsi", "Mínimo entre las filas del grado 1", '_xlfn.MINIFS(H2:H7,I2:I7,1)', "88 (Microsoft)"),
    ("T6-003", "maxsi", "Sin coincidencias: ¿0 o error?", '_xlfn.MAXIFS(H2:H7,I2:I7,9)', "A VERIFICAR"),
    ("T6-004", "maxsi", "Dos criterios", '_xlfn.MAXIFS(H2:H7,I2:I7,">1",H2:H7,"<95")', ""),
    ("T6-005", "maxsi", "Criterio de distinto", '_xlfn.MINIFS(H2:H7,I2:I7,"<>2")', ""),

    # --- SI.CONJUNTO ---
    ("T6-006", "si.conjunto", "La primera condición cierta gana", '_xlfn.IFS(H2>90,"A",H2>80,"B",TRUE,"C")', ""),
    ("T6-007", "si.conjunto", "Ninguna condición cierta", '_xlfn.IFS(H2>95,"A")', "A VERIFICAR"),
    ("T6-008", "si.conjunto", "Una condición con error antes de la cierta", '_xlfn.IFS(1/0>1,"A",TRUE,"B")', "A VERIFICAR"),
    ("T6-009", "si.conjunto", "Falso y luego cierto", '_xlfn.IFS(FALSE,1,TRUE,"x")', ""),

    # --- CAMBIAR ---
    ("T6-010", "cambiar", "Coincide el segundo valor", '_xlfn.SWITCH(I3,1,"uno",2,"dos","otro")', ""),
    ("T6-011", "cambiar", "Sin coincidencia, con valor por defecto", '_xlfn.SWITCH(9,1,"uno","otro")', ""),
    ("T6-012", "cambiar", "Sin coincidencia ni valor por defecto", '_xlfn.SWITCH(9,1,"uno")', "A VERIFICAR"),
    ("T6-013", "cambiar", "Texto con distintas mayúsculas", '_xlfn.SWITCH("ABC","abc",1,0)', "A VERIFICAR"),
    ("T6-014", "cambiar", "La expresión es un error", '_xlfn.SWITCH(1/0,1,"a","b")', "A VERIFICAR"),

    # --- BUSCAR ---
    ("T6-015", "buscar", "Coincidencia exacta en el vector", 'LOOKUP(4.19,J2:J6,K2:K6)', "naranja (Microsoft)"),
    ("T6-016", "buscar", "Entre dos valores: el menor", 'LOOKUP(5,J2:J6,K2:K6)', "naranja (Microsoft)"),
    ("T6-017", "buscar", "Por encima del último", 'LOOKUP(7.66,J2:J6,K2:K6)', "azul (Microsoft)"),
    ("T6-018", "buscar", "Por debajo del primero", 'LOOKUP(0,J2:J6,K2:K6)', "#N/A (Microsoft)"),
    ("T6-019", "buscar", "Sin vector de resultado", 'LOOKUP(5,J2:J6)', ""),
    ("T6-020", "buscar", "Matriz más ancha que alta: busca en la 1.ª fila", 'LOOKUP("c",N2:Q3)', "3 (Microsoft)"),
    ("T6-021", "buscar", "Matriz más alta que ancha: busca en la 1.ª columna", 'LOOKUP(5.5,J2:K6)', ""),
    ("T6-022", "buscar", "Lista desordenada", 'LOOKUP(90,H2:H7,I2:I7)', "A VERIFICAR: Excel busca en binario"),

    # --- DIAS360 ---
    ("T6-023", "dias360", "Del 30-ene al 31-dic", f'DAYS360({F}(2011,1,30),{F}(2011,12,31))', "330 (Microsoft)"),
    ("T6-024", "dias360", "Del 29-feb bisiesto al 31-mar", f'DAYS360({F}(2024,2,29),{F}(2024,3,31))', "A VERIFICAR"),
    ("T6-025", "dias360", "Del 31-ene al 29-feb bisiesto", f'DAYS360({F}(2024,1,31),{F}(2024,2,29))', "A VERIFICAR"),
    ("T6-026", "dias360", "Del 28-feb bisiesto (no es fin de mes) al 31-mar", f'DAYS360({F}(2024,2,28),{F}(2024,3,31))', "A VERIFICAR"),
    ("T6-027", "dias360", "Del 28-feb no bisiesto (fin de mes) al 31-mar", f'DAYS360({F}(2023,2,28),{F}(2023,3,31))', "A VERIFICAR"),
    ("T6-028", "dias360", "Del 29-feb al 28-feb siguiente (dos fines de febrero)", f'DAYS360({F}(2024,2,29),{F}(2025,2,28))', "A VERIFICAR"),
    ("T6-029", "dias360", "Europeo: del 31-ene al 31-mar", f'DAYS360({F}(2024,1,31),{F}(2024,3,31),TRUE)', ""),
    ("T6-030", "dias360", "Europeo: del 29-feb al 31-mar", f'DAYS360({F}(2024,2,29),{F}(2024,3,31),TRUE)', "A VERIFICAR"),
    ("T6-031", "dias360", "Fin anterior al inicio", f'DAYS360({F}(2024,3,31),{F}(2024,1,15))', ""),

    # --- FRAC.AÑO ---
    ("T6-032", "frac.año", "Base 0 (30/360 EE. UU.)", f'YEARFRAC({F}(2012,1,1),{F}(2012,7,30))', "0,58055556 (Microsoft)"),
    ("T6-033", "frac.año", "Base 1 (real/real)", f'YEARFRAC({F}(2012,1,1),{F}(2012,7,30),1)', "0,57650273 (Microsoft)"),
    ("T6-034", "frac.año", "Base 2 (real/360)", f'YEARFRAC({F}(2012,1,1),{F}(2012,7,30),2)', ""),
    ("T6-035", "frac.año", "Base 3 (real/365)", f'YEARFRAC({F}(2012,1,1),{F}(2012,7,30),3)', "0,57808219 (Microsoft)"),
    ("T6-036", "frac.año", "Base 4 (30/360 europeo)", f'YEARFRAC({F}(2012,1,31),{F}(2012,7,31),4)', ""),
    ("T6-037", "frac.año", "Base 1 atravesando varios años", f'YEARFRAC({F}(2023,6,15),{F}(2025,3,1),1)', "A VERIFICAR"),
    ("T6-038", "frac.año", "Base 0 de fin de febrero a fin de febrero", f'YEARFRAC({F}(2024,2,29),{F}(2025,2,28),0)', "A VERIFICAR"),
    ("T6-039", "frac.año", "Base 1 dentro de un año bisiesto", f'YEARFRAC({F}(2024,1,1),{F}(2024,12,31),1)', "A VERIFICAR"),
    ("T6-040", "frac.año", "Base 1 de un 1-mar a otro que cruza un 29-feb", f'YEARFRAC({F}(2023,3,1),{F}(2024,3,1),1)', "A VERIFICAR"),
    ("T6-041", "frac.año", "Fechas al revés: sale positivo", f'YEARFRAC({F}(2012,7,30),{F}(2012,1,1))', ""),
    ("T6-042", "frac.año", "Base inválida", f'YEARFRAC({F}(2012,1,1),{F}(2012,7,30),5)', ""),

    # --- SIFECHA ---
    ("T6-043", "sifecha", "Años completos", f'DATEDIF({F}(2001,1,1),{F}(2003,1,1),"Y")', "2 (Microsoft)"),
    ("T6-044", "sifecha", "Días", f'DATEDIF({F}(2001,6,1),{F}(2002,8,15),"D")', "440 (Microsoft)"),
    ("T6-045", "sifecha", "Días sin contar los años", f'DATEDIF({F}(2001,6,1),{F}(2002,8,15),"YD")', "75 (Microsoft)"),
    ("T6-046", "sifecha", "Meses completos desde un 31", f'DATEDIF({F}(2024,1,31),{F}(2024,3,30),"M")', "A VERIFICAR"),
    ("T6-047", "sifecha", "MD desde un 31 (Microsoft avisa de que falla)", f'DATEDIF({F}(2024,1,31),{F}(2024,3,1),"MD")', "A VERIFICAR"),
    ("T6-048", "sifecha", "Meses sin contar los años", f'DATEDIF({F}(2024,1,15),{F}(2025,3,20),"YM")', ""),
    ("T6-049", "sifecha", "Inicio posterior al fin", f'DATEDIF({F}(2003,1,1),{F}(2001,1,1),"Y")', "#NUM! (Microsoft)"),
    ("T6-050", "sifecha", "Unidad en minúsculas", f'DATEDIF({F}(2001,1,1),{F}(2003,1,1),"y")', "A VERIFICAR"),

    # --- DIAS.LAB ---
    ("T6-051", "dias.lab", "Laborables de oct-2012 a mar-2013", f'NETWORKDAYS({F}(2012,10,1),{F}(2013,3,1))', "110 (Microsoft)"),
    ("T6-052", "dias.lab", "Los mismos, con tres festivos", f'NETWORKDAYS({F}(2012,10,1),{F}(2013,3,1),L2:L4)', "107 (Microsoft)"),
    ("T6-053", "dias.lab", "Fechas al revés", f'NETWORKDAYS({F}(2013,3,1),{F}(2012,10,1))', "A VERIFICAR"),
    ("T6-054", "dias.lab", "Un sábado consigo mismo", f'NETWORKDAYS({F}(2026,9,26),{F}(2026,9,26))', ""),

    # --- DIA.LAB ---
    ("T6-055", "dia.lab", "151 laborables desde el 1-oct-2008", f'WORKDAY({F}(2008,10,1),151)', "39933 (Microsoft)"),
    ("T6-056", "dia.lab", "Cinco laborables saltando un festivo", f'WORKDAY({F}(2012,11,20),5,L2:L4)', ""),
    ("T6-057", "dia.lab", "Un laborable hacia atrás desde un lunes", f'WORKDAY({F}(2024,2,5),-1)', ""),
    ("T6-058", "dia.lab", "Un laborable desde un sábado", f'WORKDAY({F}(2026,9,26),1)', ""),
    ("T6-059", "dia.lab", "Cero laborables desde un sábado", f'WORKDAY({F}(2026,9,26),0)', "A VERIFICAR"),

    # --- FECHANUMERO ---
    ("T6-060", "fechanumero", "Formato ISO", 'DATEVALUE("2011-08-22")', ""),
    ("T6-061", "fechanumero", "Día/mes/año en español", 'DATEVALUE("22/8/2011")', ""),
    ("T6-062", "fechanumero", "Año con dos cifras", 'DATEVALUE("22/8/11")', "A VERIFICAR"),
    ("T6-063", "fechanumero", "Mes abreviado en español", 'DATEVALUE("22-ago-2011")', "A VERIFICAR"),
    ("T6-064", "fechanumero", "Mes con nombre completo", 'DATEVALUE("22 agosto 2011")', "A VERIFICAR"),
    ("T6-065", "fechanumero", "Un 31 de febrero", 'DATEVALUE("31/2/2024")', "A VERIFICAR"),
    ("T6-066", "fechanumero", "Un texto que no es fecha", 'DATEVALUE("mañana")', ""),
    ("T6-067", "fechanumero", "Con la hora detrás", 'DATEVALUE("22/8/2011 18:30")', "A VERIFICAR"),

    # --- TEXTO: la regla de las letras, pendiente de la quinta tanda ---
    ("T6-068", "texto", "Letras sin escapar en el formato", 'TEXT(5,"0 kg")', "A VERIFICAR"),
    ("T6-069", "texto", "Las mismas letras escapadas", 'TEXT(5,"0 \\k\\g")', ""),
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
    ruta = os.environ.get("TANDA6_MOTOR", "")
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
    destino = "tests/fixtures/fidelidad-tanda6.xlsx"
    wb.save(destino)
    print(f"Escrito {destino} con {len(CASOS)} casos.")
