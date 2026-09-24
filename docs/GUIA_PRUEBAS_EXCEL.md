# Guía de pruebas en Excel

Paso a paso para probar el complemento en tu Excel con el libro de
demostración **`ejemplos/demo-proyecto-aurora.xlsx`**. Cada prueba tiene un
código (A1, A2…). Al terminar cada bloque, dime por cada código:

- **OK**, o
- **Falla** + qué ves (una captura ayuda mucho).

No hace falta hacerlas todas de una vez: se pueden repartir en varios días.

---

## 0. Preparación (una vez)

1. En la carpeta del proyecto: `git pull`.
2. `npm install` (por si hay dependencias nuevas).
3. `npm run stop` y después `npm start`. Esto recarga el complemento: sin
   ello no aparecen los botones nuevos ni las funciones `RIESGO`.
4. Abre `ejemplos/demo-proyecto-aurora.xlsx` **de nuevo** (el archivo ha
   cambiado: ahora tiene una hoja «Pruebas»).

**P0.** En la cinta, la pestaña **Riesgo** tiene cuatro botones: Modelo,
Resultados, Configuración y Diagnóstico.

---

## A. Lo básico, en la hoja «Modelo»

**A1. Valores base.** Sin tocar nada: `Modelo!C32` = 366.372 €,
`C33` = 22,1 %, `C34` = 942.185 €.

**A2. Marcar el modelo.** Botón **Modelo**. Marca como **entrada** C5, C6,
C7, C8 y C9 (selecciona la celda y pulsa «Añadir la selección como entrada»),
con las distribuciones de la hoja «Instrucciones». Marca como **salida** C32,
C33 y C34.
- Esperado: las entradas se pintan de amarillo y las salidas de verde.

**A3. Simular.** Pulsa **Simular** (10.000 iteraciones, motor automático).
- Esperado: en «Cómo se calculó» dice **Rápido (en memoria)**, tarda menos
  de 2 segundos y dice **«N hilos»** (N mayor que 1).
- VAN: mediana en torno a +255.000 €.

**A4. Umbral.** En la salida VAN: «Probabilidad de quedar **por debajo de**»
`0`, y pulsa Intro.
- Esperado: en torno a **30 %**. En el histograma, las barras a la
  izquierda del 0 salen en verde y las demás en gris.

**A5. Tornado («Qué la mueve más»).** Arriba deberían estar precio (C5) y
coste variable (C8). A la derecha de cada barra, un %; debajo, «Entre todas
explican el X % de la variación».

**A6. Araña («Qué pasa si cada entrada se mueve»).** Cuatro líneas de
colores; la del precio sube y la del coste variable baja. Al pasar el ratón
se lee un valor.

**A7. Precisión.** Debajo de las estadísticas: «✓ Iteraciones
suficientes…» (o, si no bastan, cuántas harían falta).

**A8. TIR sin valor.** En la TIR (C33), un aviso con unas pocas iteraciones
que «no dieron un número». Es correcto: en los escenarios muy malos la TIR
no existe.

---

## B. Configuración

**B1. Núcleos.** Pulsa **⚙** (junto a las pestañas). En «Núcleos para
calcular» elige **1 núcleo** y simula.
- Esperado: «Cómo se calculó» dice **un hilo**, y el panel **no se congela**
  mientras simula.
- Vuelve a **Automático**.

**B2. Iteraciones libres.** En «Otra cantidad» escribe `250.000`, pulsa
Intro y simula.
- Esperado: Iteraciones = 250.000.

**B3. Hasta alcanzar la precisión.** Iteraciones **10 mil**, margen
**± 0,5 %**, marca «Simular hasta alcanzar la precisión», tope **1 M**, y
simula.
- Esperado: «Simulado hasta ±0,5 % de precisión: 10.000 → … iteraciones».
- Al acabar, desmarca la casilla.

**B4. Botones de la cinta con el panel abierto.** Con el panel abierto,
pulsa en la cinta Resultados, luego Configuración, Diagnóstico y Modelo.
- Pregunta clave: **¿cambia de pestaña cada vez?** Si no cambia, dímelo:
  habría que hacerlo de otra forma.

---

## C. Guardar, comparar e informe

**C1. Escenarios.** En Resultados, «Comparar escenarios»: escribe `Base` y
pulsa **Fijar como referencia**. Ve a Modelo, abre la entrada C9 (costes
fijos) y sube el máximo a `600000`. Simula.
- Esperado: en cada salida, una tabla «Frente a «Base»» con las diferencias,
  y en la curva acumulada la de Base punteada.

**C2. Informe PDF.** En Resultados, **Informe PDF**.
- Esperado: se abre tu navegador con el informe. Pulsa «Imprimir o guardar
  como PDF» y guárdalo. **Mándame el PDF.**
- Si el navegador avisa de un certificado, dímelo.

**C3. Volcar a una hoja.** **Volcar a una hoja**.
- Esperado: hoja «Riesgo Monte Carlo» con las tablas (sensibilidad, araña,
  histograma) y dos gráficos por salida: curva acumulada e histograma.

**C4. Cerrar y reabrir.** Guarda (Ctrl+S), cierra el libro y ábrelo de nuevo.
Abre el panel.
- Esperado: el modelo sigue ahí y los **resultados también** (con la nota
  «Resultados guardados en el libro el…»); la referencia «Base» sigue fijada,
  y el umbral del VAN sigue escrito.

---

## D. Ajustar una distribución a datos

**D1.** En Modelo, abre la entrada C5 (precio). Pulsa **Ajustar a datos
históricos…**. Selecciona en la hoja «Pruebas» el rango **K5:K44** y pulsa
**Leer de la selección**.
- Esperado: «40 datos de Pruebas!K5:K44» y una tabla de distribuciones con
  **Lognormal** o **Gamma** arriba («mejor»), con la curva sobre los datos.
- Pulsa **Usar** en la primera: la distribución de C5 cambia a esa.

---

## E. Funciones RIESGO (hoja «Pruebas»)

Para esta parte, **empieza un modelo limpio**: quita del panel las entradas y
salidas de «Modelo» con la ✕ (o usa una copia del libro).

**E1.** En `Pruebas!C5` escribe `=RIESGO.NORMAL(1000;150)`.
- Esperado: al escribir `=RIES` Excel propone las funciones RIESGO. La celda
  vale **1.000** (fuera de la simulación enseña la media).

**E2.** En `C6` escribe `=RIESGO.TRIANGULAR(8;10;14)`.
- Esperado: C6 = **10,67**; C7 (ya escrita) = **10.666,67**.

**E3.** En el panel marca **solo C7 como salida**, sin ninguna entrada, y
simula.
- Esperado: motor rápido; en «Cómo se calculó», «Entradas con funciones
  RIESGO del libro: Pruebas!C5 … Pruebas!C6 …». Media de C7 en torno a
  **10.670**.

**E4. Error bien explicado.** En C5 escribe `=RIESGO.NORMAL(C12;150)` y
simula.
- Esperado: no simula y dice que los argumentos tienen que ser números
  escritos, nombrando **Pruebas!C5**. Después vuelve a poner
  `=RIESGO.NORMAL(1000;150)`.

---

## F. LET

**F1.** Añade `Pruebas!C10` como salida (ya tiene una fórmula con LET) y
simula.
- Esperado: motor rápido; media de C10 en torno a **4.270** (el 40 % de C7).

---

## G. Matrices

Escribe en la hoja «Pruebas» (con los nombres en español):

| Celda | Fórmula | Valor esperado |
|---|---|---|
| C13 | `=SUMA(FILTRAR(F13:F17;F13:F17>C12;0))` | 470 |
| C14 | `=SUMAPRODUCTO((F13:F17>C12)*F13:F17)` | 470 |
| C15 | `=INDICE(ORDENAR(F13:F17;1;-1);1)` | 200 |

**G1.** Los tres valores coinciden con la tabla.

**G2.** Marca C13, C14 y C15 como salidas y simula.
- Esperado: sigue siendo **motor rápido**, y C13 y C14 tienen la misma media
  (en torno a **462**).

**G3. Derrame.** En `H13` escribe `=FILTRAR(E13:E17;F13:F17>C12)`: en Excel
salen tres zonas hacia abajo. Añade H13 como salida y simula.
- Esperado: el complemento pasa al **modo compatible** y explica que H13
  «devuelve varias celdas y aquí derramaría». Luego quita H13 de las salidas.

---

## H. Entrada con fórmula en el modo compatible

**H1.** Marca `Pruebas!C21` como entrada (tiene la fórmula `=7+1`) y `C22`
como salida. En Configuración, motor **Compatible** e iteraciones `1000`
(«Otra cantidad»). Simula.
- Esperado: al terminar, **C21 sigue teniendo la fórmula `=7+1`** (míralo en
  la barra de fórmulas), no un número. Antes de esta versión se perdía.
- Vuelve el motor a **Automático**.

---

## I. Libros de fidelidad

Como las otras veces: ábrelos en Excel, deja que calculen, guárdalos y
mándamelos.

- **I1.** `tests/fixtures/fidelidad-tanda7.xlsx` (LET, 14 casos).
- **I2.** `tests/fixtures/fidelidad-tanda8.xlsx` (matrices, 27 casos). Hace
  falta Excel 365 o 2021.
- **I3.** Las 3 fórmulas matriciales de `Caso_practico.xlsx`:
  `Sin Refi!E46`, `Con Refi!E47` y `Con Refi!E69` (copia el texto de la barra
  de fórmulas).
