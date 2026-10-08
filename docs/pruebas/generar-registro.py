#!/usr/bin/env python3
"""
Genera docs/pruebas/registro-pruebas.xlsx a partir de docs/GUIA_PRUEBAS_EXCEL.md:
una fila por prueba (código, bloque, libro, pasos y lo esperado, copiados de la
guía) con columnas para anotar el resultado. Así el registro y la guía dicen
siempre lo mismo.

    python3 docs/pruebas/generar-registro.py

Una prueba empieza en un párrafo «**CÓDIGO. Título.**» (o «- **CÓDIGO.**») y
llega hasta la prueba siguiente o el siguiente título de sección.
"""

import re
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = Path(__file__).resolve().parents[2]
GUIA = RAIZ / 'docs' / 'GUIA_PRUEBAS_EXCEL.md'
SALIDA = RAIZ / 'docs' / 'pruebas' / 'registro-pruebas.xlsx'

INICIO = re.compile(r'^(?:- )?\*\*([A-Z]{1,2}\d+[a-z]?)\.(\*\*)?\s*(.*)$')
TITULO_SECCION = re.compile(r'^#{2,3} ')

# El orden de la ronda (paso 4 de la guía) y el libro de cada bloque.
BLOQUES = [
    ('P', '01. Preparación (P0)', 'Cualquier libro'),
    ('A', '02. A · Lo básico (hoja «Modelo»)', 'aurora-A.xlsx (copia de aurora-base.xlsx)'),
    ('B', '03. B · Configuración', 'aurora-A.xlsx (sigue)'),
    ('C', '04. C · Proyecto, informe PDF y hoja volcada', 'aurora-A.xlsx (sigue)'),
    ('D', '05. D · Escenarios', 'aurora-A.xlsx (sigue)'),
    ('E', '05. E · Ajustar a datos', 'aurora-A.xlsx (sigue)'),
    ('K', '06. K · Mismos números al repetir', 'aurora-A.xlsx (sigue)'),
    ('N', '07. N · Etapa 2 (runtime, cinta, explorador, funciones)', 'aurora-A.xlsx (sigue)'),
    ('V', '08. V3 y V4 · Comparar y asistente', 'aurora-A.xlsx (sigue)'),
    ('R', '09. R1–R4 · Correlaciones, P80, percentiles, compatible', 'aurora-A.xlsx (sigue)'),
    ('F', '10. F · Funciones RIESGO (hoja «Pruebas»)', 'aurora-F.xlsx (copia nueva de aurora-base.xlsx)'),
    ('G', '10. G · LET, matrices y derrame', 'aurora-F.xlsx (sigue)'),
    ('H', '11. H · Modo compatible', 'aurora-H.xlsx (copia nueva de aurora-base.xlsx)'),
    ('T', '11. T · Variables de texto (hoja «Zonas»)', 'aurora-H.xlsx (sigue)'),
    ('J', '12. J · Compartir el libro', 'aurora-J.xlsx (copia nueva de aurora-base.xlsx)'),
    ('Q', '13. Q5–Q26 · Riesgo del cronograma', 'cronograma-Q.xlsx (copia de cronograma-base.xlsx)'),
    ('GT1', '14. GT1–GT18 · Gantt', 'cronograma-GT1.xlsx (copia de cronograma-base.xlsx)'),
    ('GT19', '15. GT19–GT30 · Gantt: avance, líneas base, exportar', 'cronograma-GT19.xlsx (copia de cronograma-base.xlsx)'),
    ('GT31', '16. GT31–GT40 · Arreglos, editores, resultados', 'cronograma-GT31.xlsx (copia de cronograma-base.xlsx)'),
    ('GT41', '17. GT41–GT55 · Lo traído al unir las ramas', 'cronograma-GT41.xlsx (copia de cronograma-base.xlsx)'),
    ('I', '18. I · Libros de fidelidad', 'Copias de tests\\fixtures\\fidelidad-*.xlsx'),
    ('W', '19. W · Excel para la Web (opcional)', 'Copia de aurora-base.xlsx en OneDrive'),
    ('QPL', '20. Q1–Q4 · ProjectLibre (opcional, sin Excel)', 'tests\\fixtures\\qrsa\\*.xml en ProjectLibre'),
]
ORDEN = {clave: i for i, (clave, _, _) in enumerate(BLOQUES)}
NOMBRE = {clave: nombre for clave, nombre, _ in BLOQUES}
LIBRO = {clave: libro for clave, _, libro in BLOQUES}

# Pruebas con un libro distinto del de su bloque.
LIBRO_PROPIO = {
    'Q5': 'Libro nuevo en blanco (como el paso 3b)',
    'Q6': 'Libro nuevo en blanco (como el paso 3b)',
    'Q7': 'El libro de Q6 (o cronograma-base.xlsx)',
    'Q24': 'cronograma-Q.xlsx + tests\\fixtures\\qrsa\\R2-relaciones.xml y R3-calendario.xml',
    'Q25': 'Libro nuevo en blanco + tests\\fixtures\\qrsa\\R1-simple.xer',
    'Q26': 'Un libro de cronograma de antes del 05/10 (si tienes)',
    'GT29': 'Libro nuevo en blanco + el XML exportado en GT28',
    'GT30': 'Un cronograma grande tuyo (si tienes)',
    'GT41': 'Libro nuevo en blanco → ejemplo «Vía»; guárdalo como cronograma-via.xlsx',
    'GT45': 'cronograma-GT41.xlsx y cronograma-via.xlsx (de GT41)',
    'GT55': 'PowerShell, en la carpeta del proyecto',
    'N30': 'Tus propios libros',
    'N31': 'Tus propios libros',
    'N33': 'Copia de tests\\fixtures\\fidelidad-lambda.xlsx',
    'I1': 'Copia de tests\\fixtures\\fidelidad-tanda7.xlsx',
    'I2': 'Copia de tests\\fixtures\\fidelidad-tanda8.xlsx',
    'I3': 'Copia de tests\\fixtures\\fidelidad-lambda.xlsx',
}


def bloque_de(codigo: str) -> str:
    letra = re.match(r'[A-Z]+', codigo).group(0)
    n = int(re.search(r'\d+', codigo).group(0))
    if letra == 'GT':
        return 'GT1' if n <= 18 else 'GT19' if n <= 30 else 'GT31' if n <= 40 else 'GT41'
    if letra == 'Q':
        return 'QPL' if n <= 4 else 'Q'
    return letra


def limpiar(texto: str) -> str:
    """Markdown → texto plano legible en una celda."""
    lineas = []
    for l in texto.splitlines():
        s = l.rstrip()
        if re.match(r'^\s*\|?\s*:?-{3,}', s):
            continue  # separador de tabla
        if s.strip().startswith('|'):
            celdas = [c.strip() for c in s.strip().strip('|').split('|')]
            s = '- ' + ' · '.join(c for c in celdas if c)
        s = re.sub(r'\*\*(.+?)\*\*', r'\1', s)
        s = re.sub(r'`([^`]*)`', r'\1', s)
        s = s.replace('**', '')
        if s.strip().startswith('```'):
            continue
        lineas.append(s)
    out = '\n'.join(lineas)
    out = re.sub(r'\n{3,}', '\n\n', out)
    # Une las líneas cortadas del mismo párrafo; respeta listas y párrafos.
    partes = []
    for parrafo in out.split('\n\n'):
        ls = parrafo.split('\n')
        actual = ''
        for x in ls:
            if re.match(r'^\s*([-•]|\d+\.)\s', x) or not actual:
                if actual:
                    partes.append(actual)
                actual = x.strip() if not re.match(r'^\s*([-•]|\d+\.)\s', x) else x.rstrip()
            else:
                actual += ' ' + x.strip()
        if actual:
            partes.append(actual)
        partes.append('')
    return '\n'.join(partes).strip()


def separar(texto: str) -> tuple[str, str]:
    """Pasos y lo esperado: todo desde el primer «Esperado» es lo esperado."""
    # Con pasos numerados, lo esperado va dentro de cada paso: no se parte.
    if re.search(r'(?m)^\s*\d+\.\s', texto):
        return texto, '(Lo esperado va en cada paso numerado.)'
    m = re.search(r'(?:^|\n|[.:]\s)(Esperado)', texto)
    if not m:
        return texto, '(Lo esperado está en los pasos.)'
    k = m.start(1)
    return texto[:k].rstrip(' -:\n'), texto[k:].strip()


def leer_pruebas():
    lineas = GUIA.read_text(encoding='utf-8').splitlines()
    pruebas, actual = [], None
    for linea in lineas:
        m = INICIO.match(linea)
        if m and not linea.startswith('>'):
            if actual:
                pruebas.append(actual)
            codigo, solo_codigo, resto = m.group(1), m.group(2), m.group(3)
            titulo = ''
            # «**A1. Título.** texto»: el título va en negrita con el código.
            t = None if solo_codigo else re.match(r'^(.*?)\*\*\s*(.*)$', resto)
            if t:
                titulo, resto = t.group(1).strip().rstrip('.'), t.group(2)
            actual = {'codigo': codigo, 'titulo': titulo, 'lineas': [resto]}
            continue
        if actual and (TITULO_SECCION.match(linea) or linea.strip() == '---'):
            pruebas.append(actual)
            actual = None
            continue
        if actual:
            actual['lineas'].append(linea)
    if actual:
        pruebas.append(actual)
    vistos = set()
    filas = []
    for p in pruebas:
        if p['codigo'] in vistos:
            continue
        vistos.add(p['codigo'])
        texto = limpiar('\n'.join(p['lineas']))
        pasos, esperado = separar(texto)
        if not pasos:
            pasos = f"{limpiar(p['titulo'])}."
        titulo = limpiar(p['titulo']) or re.split(r'(?<=[.:])\s', pasos or esperado, maxsplit=1)[0][:90]
        b = bloque_de(p['codigo'])
        filas.append({
            'codigo': p['codigo'], 'bloque': b, 'titulo': titulo, 'pasos': pasos, 'esperado': esperado,
            'libro': LIBRO_PROPIO.get(p['codigo'], LIBRO[b]),
        })
    clave = lambda f: (ORDEN[f['bloque']], re.match(r'[A-Z]+', f['codigo']).group(0), int(re.search(r'\d+', f['codigo']).group(0)), f['codigo'])
    return sorted(filas, key=clave)


AZUL = PatternFill('solid', fgColor='1F4E78')
GRIS = PatternFill('solid', fgColor='F2F2F2')
BLANCO = Font(color='FFFFFF', bold=True)
NEGRITA = Font(bold=True)
FINO = Side(style='thin', color='BFBFBF')
BORDE = Border(left=FINO, right=FINO, top=FINO, bottom=FINO)
ARRIBA = Alignment(wrap_text=True, vertical='top')


def hoja_instrucciones(wb):
    ws = wb.active
    ws.title = 'Instrucciones'
    texto = [
        ('Registro de la ronda completa de pruebas (08/10, tras unir las ramas en main)', True),
        ('', False),
        ('Cómo usarlo', True),
        ('1. Antes de empezar, haz los pasos 1 a 3 de docs\\GUIA_PRUEBAS_EXCEL.md (pasar a main, arranque limpio, preparar aurora-base.xlsx y cronograma-base.xlsx).', False),
        ('2. Ve a la hoja «Pruebas». Sigue las filas en orden (columna Orden). La columna «Libro» dice qué archivo abrir; «Pasos» y «Esperado» están copiados de la guía.', False),
        ('3. En «Resultado» elige OK, Falla, No aplica o Pendiente. Si es Falla, escribe en «Qué ves» lo que sale y guarda una captura con el código en el nombre (por ejemplo GT21.png).', False),
        ('4. La hoja «Resumen» cuenta los resultados por bloque. Filtra la hoja Pruebas por Bloque o por Resultado con las flechas del encabezado.', False),
        ('5. Al final de cada día, guarda y mándame este archivo con las capturas.', False),
        ('', False),
        ('Los libros', True),
        ('aurora-base.xlsx: copia de ejemplos\\demo-proyecto-aurora.xlsx con «Rellenar las hojas de prueba» (Diagnóstico). No se toca: para cada bloque, una copia (aurora-A.xlsx, aurora-D.xlsx…).', False),
        ('cronograma-base.xlsx: libro en blanco → Cronograma → Crear libro de cronograma (Obra) con Config!B2 = 04/01/2027, Config!B9 = 31/01/2028 y Hitos_Contrato!B2 = 31/01/2028. No se toca: una copia por bloque (cronograma-Q.xlsx, cronograma-GT1.xlsx…).', False),
        ('Para copiar, en PowerShell: Copy-Item "$HOME\\Desktop\\aurora-base.xlsx" "$HOME\\Desktop\\aurora-A.xlsx"', False),
        ('tests\\fixtures\\qrsa\\: R1-simple.xml, R2-relaciones.xml, R3-calendario.xml, R1-simple.xer (importar y ProjectLibre).', False),
        ('tests\\fixtures\\: fidelidad-tanda7.xlsx, fidelidad-tanda8.xlsx, fidelidad-lambda.xlsx (bloque I y N33): ábrelos como copias.', False),
        ('', False),
        ('Este archivo se genera desde la guía con: python3 docs/pruebas/generar-registro.py', False),
    ]
    for i, (t, negrita) in enumerate(texto, start=1):
        c = ws.cell(row=i, column=1, value=t)
        c.alignment = Alignment(wrap_text=True, vertical='top')
        if negrita:
            c.font = Font(bold=True, size=13 if i == 1 else 11)
    ws.column_dimensions['A'].width = 140


def hoja_pruebas(wb, filas):
    ws = wb.create_sheet('Pruebas')
    enc = ['Orden', 'Bloque', 'Código', 'Prueba', 'Libro', 'Pasos', 'Esperado', 'Resultado', 'Qué ves / notas', 'Captura', 'Fecha']
    anchos = [7, 30, 8, 30, 30, 70, 60, 12, 40, 14, 12]
    ws.append(enc)
    for i, f in enumerate(filas, start=1):
        ws.append([i, NOMBRE[f['bloque']], f['codigo'], f['titulo'], f['libro'], f['pasos'], f['esperado'], 'Pendiente', None, None, None])
    for j, w in enumerate(anchos, start=1):
        ws.column_dimensions[get_column_letter(j)].width = w
    for c in ws[1]:
        c.fill, c.font, c.alignment, c.border = AZUL, BLANCO, Alignment(wrap_text=True, vertical='center'), BORDE
    for fila in ws.iter_rows(min_row=2):
        for c in fila:
            c.alignment, c.border = ARRIBA, BORDE
        fila[2].font = NEGRITA
    ultima = ws.max_row
    ws.freeze_panes = 'D2'
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_title_rows = '1:1'
    ws.auto_filter.ref = f'A1:K{ultima}'
    dv = DataValidation(type='list', formula1='"OK,Falla,No aplica,Pendiente"', allow_blank=True)
    dv.error, dv.errorTitle = 'Elige OK, Falla, No aplica o Pendiente', 'Resultado'
    ws.add_data_validation(dv)
    dv.add(f'H2:H{ultima}')
    fecha = DataValidation(type='date', operator='greaterThan', formula1='45000', allow_blank=True)
    ws.add_data_validation(fecha)
    fecha.add(f'K2:K{ultima}')
    for c in ws[f'K2:K{ultima}']:
        c[0].number_format = 'dd/mm/yyyy'
    colores = {'OK': 'C6EFCE', 'Falla': 'FFC7CE', 'No aplica': 'D9D9D9', 'Pendiente': 'FFF2CC'}
    for valor, color in colores.items():
        ws.conditional_formatting.add(f'H2:H{ultima}', FormulaRule(formula=[f'$H2="{valor}"'], fill=PatternFill('solid', fgColor=color)))
    ws.conditional_formatting.add(f'A2:G{ultima}', FormulaRule(formula=['$H2="Falla"'], fill=PatternFill('solid', fgColor='FCE4E4')))
    return ultima


def hoja_resumen(wb, ultima):
    ws = wb.create_sheet('Resumen')
    enc = ['Bloque', 'Pruebas', 'OK', 'Falla', 'No aplica', 'Pendiente', '% hecho']
    ws.append(enc)
    rango = lambda col: f'Pruebas!${col}$2:${col}${ultima}'
    for i, (_, nombre, _) in enumerate(BLOQUES, start=2):
        ws.append([
            nombre,
            f'=COUNTIF({rango("B")},A{i})',
            f'=COUNTIFS({rango("B")},A{i},{rango("H")},"OK")',
            f'=COUNTIFS({rango("B")},A{i},{rango("H")},"Falla")',
            f'=COUNTIFS({rango("B")},A{i},{rango("H")},"No aplica")',
            f'=COUNTIFS({rango("B")},A{i},{rango("H")},"Pendiente")',
            f'=IF(B{i}=0,"",1-F{i}/B{i})',
        ])
    n = len(BLOQUES) + 1
    t = n + 1
    ws.append(['Total'] + [f'=SUM({get_column_letter(j)}2:{get_column_letter(j)}{n})' for j in range(2, 7)] + [f'=IF(B{t}=0,"",1-F{t}/B{t})'])
    for c in ws[1]:
        c.fill, c.font, c.border = AZUL, BLANCO, BORDE
    for fila in ws.iter_rows(min_row=2, max_row=t):
        for c in fila:
            c.border = BORDE
        fila[6].number_format = '0%'
    for c in ws[t]:
        c.font, c.fill = NEGRITA, GRIS
    for j, w in enumerate([58, 10, 8, 8, 10, 11, 9], start=1):
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.freeze_panes = 'A2'


def main():
    filas = leer_pruebas()
    wb = Workbook()
    hoja_instrucciones(wb)
    ultima = hoja_pruebas(wb, filas)
    hoja_resumen(wb, ultima)
    wb.active = 1
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    wb.save(SALIDA)
    por = {}
    for f in filas:
        por[f['bloque']] = por.get(f['bloque'], 0) + 1
    print(f'{len(filas)} pruebas → {SALIDA.relative_to(RAIZ)}')
    for clave, nombre, _ in BLOQUES:
        print(f'  {nombre}: {por.get(clave, 0)}')


if __name__ == '__main__':
    main()
