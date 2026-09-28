# Guía de pruebas en Excel

*Versión del 28/09, reescrita desde cero.* Recorre **todo** el complemento
de principio a fin, incluido lo nuevo desde tu última ronda:

- **Etapa 1b**: hoja volcada legible, entradas muestreadas y pantalla congelada.
- **Bloque T**: variables de texto y salidas de sí/no.
- **Antes de la etapa 2**:
  - Vista previa de la distribución.
  - Medidas de riesgo.
  - Tornado y araña en la hoja volcada.
  - «Qué tiene que pasar».
  - Funciones DISCRETA, TRUNCAR, LOGNORMAL2 y EMPIRICA.
  - Ajuste explicado.

Las guías anteriores quedan sustituidas por esta.

Se usa el libro **`ejemplos/demo-proyecto-aurora.xlsx`**, que tiene cuatro
hojas: **Instrucciones**, **Modelo**, **Pruebas** y **Zonas**. Las celdas en
amarillo claro de «Pruebas» y «Zonas» están vacías a propósito: ahí se
escribe lo que diga la guía.

Cada prueba tiene un código (A1, A2…). Por cada código dime:

- **OK**, o
- **Falla** + qué ves (una captura ayuda mucho).

Se puede repartir en varios días. Si un bloque falla entero, sigue con el
siguiente: casi todos son independientes. Las cifras «en torno a» son
aproximadas: con otra semilla o con otras distribuciones cambian un poco.

---

## 0. Preparación

En **PowerShell**, una línea cada vez:

```
cd "C:\Users\danal\Documents\Proyectos Claude\riesgo-montecarlo-v2"
git checkout claude/nifty-thompson-xfnqm2
git pull origin claude/nifty-thompson-xfnqm2
npm install
npm run stop
npm start
```

- Si `git pull` se queja de los archivos `tests/fixtures/fidelidad-tanda7.xlsx`
  o `fidelidad-tanda8.xlsx` (porque los guardaste en Excel), descarta tu copia
  y vuelve a hacer el pull:

  ```
  git checkout -- tests/fixtures/fidelidad-tanda7.xlsx tests/fixtures/fidelidad-tanda8.xlsx
  git pull origin claude/nifty-thompson-xfnqm2
  ```

- `npm run stop` y `npm start` recargan el complemento. Sin ellos no aparecen
  los botones nuevos ni las funciones RIESGO nuevas. Deja esa ventana abierta
  mientras pruebas.
- Al cerrar Excel, el complemento de desarrollo se desregistra: vuelve a
  ejecutar `npm start` antes de abrirlo otra vez. Instalado de verdad no hará
  falta.
- Abre **el libro recién descargado**
  (`ejemplos\demo-proyecto-aurora.xlsx`), no una copia vieja: ha cambiado
  (hoja «Zonas» nueva y sección 6 en «Pruebas»).

**P0.** En la cinta, la pestaña **Riesgo** tiene cuatro botones: Modelo,
Resultados, Configuración y Diagnóstico. Al pulsar Modelo se abre el panel
(no se queda en blanco).

---

## A. Lo básico, en la hoja «Modelo»

**A1. Valores base.** Sin tocar nada:
- `Modelo!C32` = 366.372 €
- `C33` = 22,1 %
- `C34` = 942.185 €

**A2. Marcar con nombres legibles.** Botón **Modelo**. Selecciona `C5` y pulsa
«Añadir la selección como entrada».
- Esperado:
  - La entrada se llama **«Precio unitario»** (el texto de su izquierda), no
    «Modelo!C5».
  - La celda se pinta de amarillo.
  - El panel le propone una triangular de 108 a 132.

**A3. Vista previa.** Abre la entrada C5 y cámbiala a **Triangular 105 / 120
/ 140** (la distribución de la hoja «Instrucciones»).
- Esperado: debajo de los campos, un dibujo de la distribución que cambia
  según escribes, con «p5 … · p50 … · p95 … · media …».
- Escribe un mínimo mayor que la moda (p. ej. 130): sale un aviso y la vista
  previa no se rompe. Vuelve a 105.

**A4. Acotar.** En la misma entrada, en «Acotar: mínimo» escribe `110`.
- Esperado: la vista previa se corta en 110 y el p5 sube.
- Borra el 110: vuelve a como estaba.

**A5. El resto del modelo.** Marca también como entradas C6, C7, C8 y C9, con
las distribuciones de la hoja «Instrucciones». Marca como salidas C32, C33 y
C34.
- Esperado:
  - Cada una lleva el nombre de su fila: «Unidades vendidas el año 1», «VAN
    al 11 %», «TIR del proyecto»…
  - Las salidas se pintan de verde.

**A6. Simular.** Pulsa **Simular** (10.000 iteraciones, motor automático).
- Esperado: en «Cómo se calculó», **Rápido (en memoria)**; tarda menos de 2
  segundos.
- VAN: mediana en torno a **+255.000 €**.

**A7. Resumen y selector de salidas.** Al principio de Resultados, una tabla
**«Salidas»** con las tres y un desplegable «Ver».
- Debajo se ve una sola salida.
- Pulsa otra fila de la tabla: cambia la que se ve.
- **Selecciona en la hoja la celda C33**: el panel salta a la TIR.

**A8. Lectura en palabras.** Debajo del nombre del VAN, un párrafo, por
ejemplo: «VAN al 11 % tiene una media de…; en el 90 % de los casos simulados
queda entre… y…», y qué entradas lo mueven más.

**A9. Umbral.** En el VAN: «Probabilidad de quedar **por debajo de**» `0`, y
pulsa Intro.
- Esperado:
  - En torno a **30 %**.
  - En el histograma, las barras a la izquierda del 0 en verde y las demás
    en gris.
  - El párrafo de A8 añade la frase de la probabilidad.

**A10. Tornado («Qué la mueve más»).**
- Arriba, precio (C5) y coste variable (C8).
- A la derecha de cada barra, un %.
- Debajo, «Entre todas explican el X % de la variación».

**A11. Araña («Qué pasa si cada entrada se mueve»).** Una línea por entrada:
- La del precio sube y la del coste variable baja.
- Al pasar el ratón se lee un valor.

**A12. Medidas de riesgo (nuevo).** Sección **«Medidas de riesgo»** con una
tabla «Cola baja / Cola alta»: VaR 5 %, CVaR 5 %, semidesviación. Debajo,
asimetría, curtosis y una frase sobre la forma («casi simétrica», «cola larga
a la…»).
- En el VAN, el CVaR 5 % de la cola baja es **más negativo** que el VaR 5 %
  (es la media de lo que queda por debajo).

**A13. Qué tiene que pasar (nuevo).** Sección **«Qué tiene que pasar»**, con
el desplegable «Para que quede en su 10 % más bajo / más alto».
- Con «más bajo», el VAN aparece en su peor 10 % cuando el precio está bajo y
  el coste variable alto, y se dice cuánto se desplaza cada uno (en σ).
- Cambia a «más alto»: los sentidos se invierten.

**A14. Cómo se muestrearon las entradas.** Sección con un desplegable de
entradas.
- Para cada una, el histograma de lo que de verdad salió, con la línea de lo
  esperado encima.
- Tabla «Muestreado / Esperado», con medias casi iguales.

**A15. Precisión.** Debajo de las estadísticas del VAN: «✓ Iteraciones
suficientes…» (o, si no bastan, cuántas harían falta).

**A16. TIR sin valor.** En la TIR, un aviso con unas pocas iteraciones que
«no dieron un número». Es correcto: en los escenarios muy malos la TIR no
existe.

---

## B. Configuración (botón ⚙ junto a las pestañas)

**B1. Núcleos automáticos.** Con «Núcleos para calcular» en **Automático**,
simula con 10.000 iteraciones y luego con 250.000 («Otra cantidad»).
- Esperado:
  - Con 10.000, «Cómo se calculó» dice **un hilo** y tarda poco.
  - Con 250.000, **varios hilos**.

**B2. Un núcleo.** Elige **1 núcleo** y simula.
- Esperado: «un hilo», y el panel **no se congela** mientras simula.
- Vuelve a **Automático**.

**B3. Hasta alcanzar la precisión.** Configura así y simula:
- Iteraciones: **10 mil**.
- Margen: **± 0,5 %**.
- Marca «Simular hasta alcanzar la precisión».
- Tope: **1 M**.

Esperado: «Simulado hasta ±0,5 % de precisión: 10.000 → … iteraciones». Al
acabar, desmarca la casilla y vuelve a 10.000 iteraciones.

**B4. Botones de la cinta con el panel abierto.** Con el panel abierto,
pulsa en la cinta Resultados, Configuración, Diagnóstico y Modelo.
- Dime si cambia de pestaña cada vez.

---

## C. Proyecto, informe PDF y hoja volcada

**C1. Proyecto.** En ⚙ → **Proyecto**, escribe:
- Título: «Proyecto Aurora — evaluación a cinco años».
- Una descripción de dos líneas.

**C2. Informe PDF.** Simula y pulsa **Informe PDF**; se abre el navegador.
Pulsa «Imprimir o guardar como PDF».
- Esperado:
  - Empieza con tu título y tu descripción.
  - Cada salida tiene su párrafo en palabras.
  - Las barras del tornado salen.
- **Mándame el PDF.**

**C3. Hoja volcada (rehecha).** Pulsa **Volcar a una hoja**.
- Hoja «Riesgo Monte Carlo»:
  - Arriba, tu título.
  - Bloques con cabecera de color: **CÓMO SE CALCULÓ**, **RESUMEN DE LAS
    ENTRADAS** (distribución, media, p5–p95, puesto en el tornado) y
    **RESUMEN DE LAS SALIDAS**.
- Cada salida tiene:
  - Estadísticos.
  - Medidas de riesgo.
  - «Qué la mueve».
  - «Para quedar en su 10 %…».
- Los importes llevan el mismo formato que en la hoja «Modelo» (€, %).
- **Cuatro gráficos por salida**, sin taparse entre sí ni tapar las tablas:
  - A la derecha, curva acumulada e histograma.
  - Más a la derecha, tornado y araña.

  Los datos de los gráficos van más a la derecha todavía (desde la columna Z).
- Captura de la hoja, por favor.

**C4. Cerrar y reabrir.** Guarda (Ctrl+S), cierra el libro y ábrelo de nuevo
(tras `npm start`). Abre el panel.
- Siguen ahí:
  - El modelo.
  - Los **resultados**, con la nota «Resultados guardados en el libro el…».
  - El título del proyecto.
  - El umbral del VAN.

---

## D. Escenarios

**D1. Guardar dos.** Simula y pulsa **Guardar como escenario** con el nombre
«Escenario base». Abre la entrada C9 (costes fijos), sube el máximo a
`600000`, simula y guárdalo como «Costes altos».
- Esperado:
  - La lista de escenarios muestra los dos, con «Escenario base» marcado.
  - Cada salida tiene la tabla **«Frente a «Escenario base»»**, la curva de
    Base punteada y la tabla **«En todos los escenarios»** con las dos filas.

**D2. Cambiar y borrar.**
- Marca «Costes altos» y después «No comparar con ninguno»: la comparación
  cambia y luego desaparece.
- Borra uno con la ✕.

**D3. Persisten.** Guarda, cierra y reabre: los escenarios siguen ahí.

Al terminar, vuelve a poner el máximo de C9 en 530000.

---

## E. Ajustar una distribución a datos (rehecho)

**E1.** En Modelo, abre la entrada C5 y pulsa **Ajustar a datos
históricos…**. Selecciona en la hoja «Pruebas» el rango **K5:K44** y pulsa
**Leer de la selección**.
- Esperado:
  - «40 datos de Pruebas!K5:K44».
  - Arriba, un **diagnóstico** de los datos en una frase: cola a la derecha,
    todos positivos…
  - La tabla, con las columnas **AICc**, **BIC**, **A–D** y **CvM**,
    ordenada por AICc.
  - Arriba, **Lognormal** o **Gamma**.

**E2. Histograma.** Debajo de la tabla, el histograma de los 40 datos con la
curva de la candidata elegida. Pulsa otra fila: la curva cambia.

**E3. Criterios.** En «Ordenar por» prueba **BIC**, **Anderson–Darling** y
**Cramér–von Mises**: el orden puede moverse un poco, y arriba sigue una
distribución con cola a la derecha.

**E4. Empírica.** Pulsa **«Usar los datos tal cual (distribución
empírica)»**.
- Esperado: C5 pasa a ser una discreta con los 40 valores, y la vista previa
  enseña barras.
- Vuelve a **Ajustar…** y pulsa **Usar** en la primera de la tabla. Déjala
  así o vuelve a Triangular 105 / 120 / 140; da igual para lo que sigue.

---

## F. Funciones RIESGO (hoja «Pruebas»)

Todo este bloque va en la pestaña **Pruebas** (abajo a la izquierda). Antes,
**quita todas las entradas y salidas del panel** con la ✕. En «Pruebas», C5 y
C6 están vacías y C7 ya multiplica C5 × C6.

**F1.** En **C5** escribe `=RIESGO.NORMAL(1000;150)`.
- Esperado: al escribir `=RIES` Excel propone las funciones. La celda vale
  **1.000** (fuera de la simulación enseña la media).

**F2.** En **C6** escribe `=RIESGO.TRIANGULAR(8;10;14)`.
- Esperado: C6 = **10,67** y C7 = **10.666,67**.

**F3.** Selecciona **C7** y añádela como salida (se llama «Ingresos =
Demanda × Precio»). Sin entradas. Simula.
- Esperado:
  - Motor rápido.
  - En «Cómo se calculó», «Entradas con funciones RIESGO del libro»:
    Pruebas!C5 y Pruebas!C6, con nombres legibles («Demanda», «Precio»).
  - Media de C7 en torno a **10.670**.

**F4. Color de las celdas RIESGO.** Tras simular, C5 y C6 quedan pintadas de
**melocotón**, distinto del amarillo de las entradas del panel.

**F5. Error bien explicado.** En C5 escribe `=RIESGO.NORMAL(C12;150)` y
simula.
- Esperado: no simula; dice que los argumentos tienen que ser números
  escritos y nombra Pruebas!C5.
- Vuelve a poner `=RIESGO.NORMAL(1000;150)`.

**F6. Una RIESGO dentro del modelo grande.** Cierra sin guardar y reabre. En
**Modelo!C5** escribe `=RIESGO.NORMAL(120;10)`. Quita todo del panel, añade
**solo Modelo!C32** como salida y simula.
- Esperado:
  - Simula sin error.
  - El tornado tiene una sola barra, la de Modelo!C5.
- Después **cierra sin guardar** y reabre.

**Funciones nuevas (sección 6 de «Pruebas», filas 25–29).** Escribe cada una
en su celda amarilla: la instrucción está en la columna I.

| Prueba | Celda | Fórmula | Valor en la celda |
|---|---|---|---|
| **F7** | C25 | `=RIESGO.DISCRETA(E25:E27;F25:F27)` | **5** (3, 5 o 10 días con 50/30/20 %) |
| **F8** | C26 | `=RIESGO.TRUNCAR(RIESGO.NORMAL(100;30);50;150)` | **100** |
| **F9** | C27 | `=RIESGO.LOGNORMAL2(4,6;0,2)` | **101,49** |
| **F10** | C28 | `=RIESGO.EMPIRICA(K5:K44)` | **118,95** (la media de los datos) |

Al escribir cada una, Excel enseña la ayuda de sus argumentos. C29 (suma de
control) vale **325,44**.

**F11. Simularlas.** Quita todo del panel. Añade como salidas C25, C26, C27 y
C28 y simula.
- Esperado, en «Cómo se calculó», las cuatro entradas RIESGO:

  | Salida | Qué se ve |
  |---|---|
  | **C25** | Histograma con solo tres barras (3, 5 y 10). Media en torno a **5**. |
  | **C26** | **Mínimo ≥ 50 y máximo ≤ 150**: nada se sale de los límites. Media en torno a 100. |
  | **C27** | Cola a la derecha. Mediana en torno a **99,5** y media en torno a **101,5**. |
  | **C28** | Mínimo **90,79** y máximo **165,8**: solo salen valores que están en los datos. Media en torno a 119. |

---

## G. LET, matrices y derrame (hoja «Pruebas»)

**G1. LET.** Añade `Pruebas!C10` como salida (ya tiene LET) y simula, con
C5 y C6 de F1–F2 escritas.
- Esperado: motor rápido; media en torno a **4.270** (el 40 % de C7).

**G2. Matrices.** Escribe:

| Celda | Fórmula | Valor esperado |
|---|---|---|
| C13 | `=SUMA(FILTRAR(F13:F17;F13:F17>C12;0))` | 470 |
| C14 | `=SUMAPRODUCTO((F13:F17>C12)*F13:F17)` | 470 |
| C15 | `=INDICE(ORDENAR(F13:F17;1;-1);1)` | 200 |

Los tres valores coinciden con la tabla.

**G3.** Marca C13, C14 y C15 como salidas y simula.
- Esperado: sigue siendo **motor rápido**, y C13 y C14 tienen la misma media
  (en torno a **462**).

**G4. Derrame.** En `H13` escribe `=FILTRAR(E13:E17;F13:F17>C12)` (salen
zonas hacia abajo). Añade H13 como salida y simula.
- Esperado: pasa al **modo compatible** y explica que H13 «devuelve varias
  celdas y aquí derramaría».
- H13 es texto, así que ahora se ve como **salida de texto**: barras con
  cuántas veces sale cada zona.
- Después quita H13 de las salidas.

---

## H. Modo compatible (Excel en el bucle)

**H1. Entrada con fórmula.** Quita todo del panel. Marca `Pruebas!C21` como
entrada (tiene `=7+1`) y `C22` como salida. En ⚙: motor **Compatible** e
iteraciones `1000`. Simula; la triangular que propone el panel vale.
- Esperado: al terminar, **C21 sigue teniendo la fórmula `=7+1`** (míralo en
  la barra de fórmulas).

**H2. Pantalla congelada.** En ⚙, marca **«Congelar la pantalla al simular
con Excel en el bucle»** y repite H1.
- Esperado: la hoja no parpadea mientras simula.
- Apunta el tiempo con y sin la casilla; dime si va más rápido.
- Después vuelve el motor a **Automático** (la casilla puede quedarse).

---

## T. Variables de texto (hoja «Zonas»)

La hoja es una zona de venta (Norte, Sur o Este, con sus probabilidades en
E5:F7) que cambia el recargo con un BUSCARV. **Quita todo del panel** antes.

**T1. Entrada de texto.** Selecciona **C4** («Norte») y añádela como
entrada.
- Esperado: el panel la propone como **Categórica** con una sola categoría,
  «Norte».
- Selecciona en la hoja **E5:F7** y pulsa **«Leer de la selección (nombres y
  probabilidades)»**: quedan Norte 20 %, Sur 50 % y Este 30 %, y la vista
  previa enseña tres barras.

**T2. El resto.** Marca C6 (precio) y C7 (unidades) como entradas; deja la
triangular que proponen. Marca como salidas C8 (ingresos), C9 (gama) y C10
(¿supera 100.000 €?). Simula.
- Esperado: sigue siendo **motor rápido**.
- **Ingresos:** media en torno a **99.000 €** y p5–p95 en torno a 85.000 –
  115.000.
- **Según Zona de venta:** una tabla con la media de los ingresos en cada
  zona (Norte la más alta, Este la más baja).

**T3. Salida de texto (la gama).** En la salida C9:
- **«Valores que salen»**: barras con Media en torno al **71 %**, Baja
  **17 %** y Alta **12 %**.
- En «Probabilidad de que salga» elige **Alta**: dice la probabilidad
  (≈ 12 %).
- **«Qué decide que salga «Alta»»**: arriba, la zona o el precio, con cuánto
  sale en su 10 % bajo y en su 10 % alto.
- La lectura en palabras, arriba, dice lo mismo en frases.

**T4. Salida de sí/no.** En C10: VERDADERO en torno al **44 %** y FALSO al
56 %, con las palabras de tu Excel (VERDADERO / FALSO).

**T5. Con la función.** En **C12** escribe
`=RIESGO.CATEGORIA(E5:E7;F5:F7)`.
- Fuera de la simulación vale **Sur** (la más probable).
- Añade C13 como salida y simula: la tabla de C13 **«Según Zona con
  función»** se parece a la de T2.

**T6. En la hoja volcada y en los escenarios.**
- **Volcar a una hoja**: la gama sale con la tabla «Valor / Iteraciones /
  Probabilidad» y el cruce por zona.
- Guarda como escenario, cambia la probabilidad de Norte a 40 % (y Sur a
  30 %), simula: en «En todos los escenarios» la gama muestra el valor más
  frecuente y su probabilidad.

**T7. Correlación no permitida.** Añade una correlación entre la zona y el
precio y simula.
- Esperado: no simula y dice «Zona de venta» es una entrada de texto: no se
  puede correlacionar con otras.
- Quita la correlación.

---

## J. Compartir el libro sin romperlo (hoja «Pruebas»)

Necesita `Pruebas!C5` y `C6` con las funciones de F1–F2.

**J1. Preparar.** Pestaña Modelo → al final, sección **«Compartir el
libro»** → **«Preparar para compartir»**.
- Esperado:
  - «Convertidas N funciones RIESGO…».
  - C5 y C6 pasan a ser números (la barra de fórmulas ya no muestra
    `=RIESGO…`).
  - En el panel aparecen como entradas.
  - Arriba de la pestaña Modelo sale el botón «Restaurar».

**J2. Sigue simulando igual.** Con C7 como salida, simula: media en torno a
**10.670**.

**J3. Sin el complemento (en el iPad).** Guarda el libro preparado y ábrelo
en **el iPad**, o donde no esté el complemento.
- Esperado: **ningún #¿NOMBRE?**; C5, C6 y C7 muestran números.

**J4. Restaurar.** Pulsa **Restaurar las N funciones RIESGO**.
- Esperado: C5 y C6 vuelven a tener sus funciones y las entradas desaparecen
  del panel.

---

## K. Mismos números al repetir

**K1.** En «Modelo», con el modelo del bloque A, simula con 10.000
iteraciones y **apunta la media del VAN**.

**K2.** Quita la entrada C5 con la ✕ y vuelve a añadirla con **la misma
distribución** (Triangular 105 / 120 / 140). Simula.
- Esperado: la media del VAN es **exactamente la misma** que en K1.

**K3. Con el motor compatible.** En ⚙, motor **Compatible** y 1.000
iteraciones. Simula dos veces seguidas sin tocar nada.
- Esperado: las dos veces, los mismos números.
- Si en la ronda anterior el p95 te salió distinto, suele ser porque una
  distribución no era la misma: compruébalas antes.
- Vuelve a **Automático**.

---

## W. Excel para la Web (y Mac, si tienes)

**Preparación:**
1. Deja `npm start` funcionando en tu PC (la Web solo puede cargar el
   complemento **en ese mismo PC**).
2. Sube `demo-proyecto-aurora.xlsx` a OneDrive y ábrelo en
   **excel.office.com**.
3. Si ya lo habías cargado antes, **quítalo primero** (la Web guarda en caché
   la lista de funciones). Luego, **Inicio → Complementos → Más complementos
   → Mis complementos → Cargar mi complemento** y elige `manifest.xml` de la
   carpeta del proyecto.

**W1.** Aparece la pestaña Riesgo y el panel se abre.

**W2.** Marca el modelo de A5 y simula: resultados como en Windows. Apunta
cuántos hilos dice «Cómo se calculó».

**W3.** Pestaña **Diagnóstico**: apunta la versión de **ExcelApi**.

**W4.** Volcar a una hoja (¿salen los cuatro gráficos?), y cerrar y reabrir
el libro.

**W5.** En la hoja «Pruebas», en C5, escribe `=RIESGO.NORMAL(1000;150)`.
- Esperado: vale 1000.
- Si sale #¿NOMBRE? o no aparece: abre las herramientas del navegador
  (**F12 → Consola**) y mándame una captura de los errores en rojo.

**W6.** En «Zonas», repite T1–T3: la entrada de texto y la gama.

**Mac:** lo mismo, cargando el manifiesto en Excel para Mac. Si no tienes,
sáltalo.

---

## I. Libros de fidelidad

Ábrelos en Excel, deja que calculen, guárdalos y mándamelos:

- **I1.** `tests\fixtures\fidelidad-tanda7.xlsx` (LET, 14 casos).
- **I2.** `tests\fixtures\fidelidad-tanda8.xlsx` (matrices, 27 casos).

Después haz el `git checkout -- …` de la preparación para que no te den
conflicto en el próximo pull.
