# Guía de pruebas en Excel

Paso a paso para probar el complemento en tu Excel con el libro de
demostración **`ejemplos/demo-proyecto-aurora.xlsx`**. Cada prueba tiene un
código (A1, A2…). Al terminar cada bloque, dime por cada código:

*Versión del 26/09: añadidos los bloques J (compartir el libro), K
(reproducibilidad) y W (Excel para la Web y Mac), y AIC/BIC en D1.*

*Versión del 27/09, tras tu primera ronda (A–E4):* el bloque E está rehecho
(todo en la hoja «Pruebas», y una E5 nueva). Repite **C2** (el PDF ya
imprime el tornado) y **E1–E5**; luego sigue desde F.

*Versión del 28/09: bloque **L** nuevo con la etapa 1 (nombres legibles,
elegir la salida, informe del proyecto, escenarios, color RIESGO, núcleos).*

*Versión del 27/09 (tarde), tras tu segunda ronda (C2–W):* pasaron E, F, G1,
G2, H, J y W1–W4, y las tandas 7 y 8. Falta **K** (no venía en el reporte).
Repite solo:
- **W5** (funciones RIESGO en Excel para la Web): arreglado lo que
  probablemente las bloqueaba.
- **J1 y J4**: ahora, con el libro preparado, «Restaurar» sale **arriba** de
  la pestaña Modelo y como botón.
- **G3**: ahora dice «ninguna iteración dio un número» en vez de «∞». Dime
  también si al simular apareció el aviso de que H13 «derramaría».

- **OK**, o
- **Falla** + qué ves (una captura ayuda mucho).

No hace falta hacerlas todas de una vez: se pueden repartir en varios días.

---

## 0. Preparación (una vez)

En **PowerShell**, una línea cada vez:

```
cd "C:\Users\danal\Documents\Proyectos Claude\riesgo-montecarlo-v2"
git checkout claude/nifty-thompson-xfnqm2
git pull origin claude/nifty-thompson-xfnqm2
npm install
npm run stop
npm start
```

1. `git checkout` asegura que estás en la rama de trabajo (todo lo nuevo
   está ahí, no en `main`).
2. `git pull` trae los cambios; `npm install`, lo que falte.
3. `npm run stop` y `npm start` recargan el complemento: sin ello no
   aparecen los botones nuevos ni las funciones `RIESGO`. Deja esa ventana
   abierta mientras pruebas.
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
- *Desde el 27/09:* las barras del tornado salen en el PDF (antes salían en
  blanco) y la primera salida empieza en la primera página.

**C3. Volcar a una hoja.** **Volcar a una hoja**.
- Esperado: hoja «Riesgo Monte Carlo» con las tablas (sensibilidad, araña,
  histograma) y dos gráficos por salida: curva acumulada e histograma.

**C4. Cerrar y reabrir.** Guarda (Ctrl+S), cierra el libro y ábrelo de nuevo.
Abre el panel.
- Esperado: el modelo sigue ahí y los **resultados también** (con la nota
  «Resultados guardados en el libro el…»); la referencia «Base» sigue fijada,
  y el umbral del VAN sigue escrito.

- *Nota sobre `npm start`:* al cerrar Excel, el complemento de desarrollo
  se desregistra y hay que volver a ejecutar `npm start`. Es propio del
  entorno de desarrollo; instalado de verdad (E9) no hará falta.

---

## D. Ajustar una distribución a datos

**D1.** En Modelo, abre la entrada C5 (precio). Pulsa **Ajustar a datos
históricos…**. Selecciona en la hoja «Pruebas» el rango **K5:K44** y pulsa
**Leer de la selección**.
- Esperado: «40 datos de Pruebas!K5:K44» y una tabla con columnas **AIC**,
  **BIC** y **A–D**, ordenada por AIC, con **Lognormal** o **Gamma** arriba
  («mejor») y la curva sobre los datos.
- En «Ordenar por» cambia a **BIC** y luego a **Anderson–Darling**: el orden
  puede cambiar un poco, y la primera sigue siendo una distribución con cola
  a la derecha.
- Pulsa **Usar** en la primera: la distribución de C5 cambia a esa.

---

## E. Funciones RIESGO (hoja «Pruebas»)

*Rehecho el 27/09.* **Todo este bloque va en la hoja «Pruebas»**, no en
«Modelo»: haz clic en la pestaña **Pruebas**, abajo a la izquierda, antes de
empezar. En la hoja «Modelo» C5 y C6 son el precio y las unidades; en
«Pruebas» son celdas vacías preparadas para esto, y C7 ya multiplica C5 × C6.

**Antes de empezar:**
- Si en una prueba anterior escribiste funciones RIESGO en la hoja
  «Modelo», **cierra el libro sin guardar** y ábrelo de nuevo (o descarga
  otra vez `ejemplos/demo-proyecto-aurora.xlsx`): los valores de «Modelo»
  tienen que volver a ser 120 € y 20.000.
- En el panel, quita todas las entradas y salidas con la ✕.

**E1.** En la hoja **Pruebas**, celda **C5**, escribe
`=RIESGO.NORMAL(1000;150)`.
- Esperado: al escribir `=RIES` Excel propone las funciones RIESGO. La celda
  vale **1.000** (fuera de la simulación enseña la media).

**E2.** En **Pruebas!C6** escribe `=RIESGO.TRIANGULAR(8;10;14)`.
- Esperado: C6 = **10,67**; **Pruebas!C7** (ya escrita) = **10.666,67**.

**E3.** Selecciona **Pruebas!C7** y pulsa «Añadir la selección como
salida». No añadas ninguna entrada. Simula.
- Esperado: en la lista de salidas se lee **Pruebas!C7** (si dice
  «Modelo!…», estás en la hoja equivocada). Motor rápido; en «Cómo se
  calculó», «Entradas con funciones RIESGO del libro: Pruebas!C5 …
  Pruebas!C6 …». Media de C7 en torno a **10.670**.
- *Arreglado el 27/09:* antes de esta versión aquí salía «Referencia sin
  resolver». Es el fallo que encontraste al usar C32.

**E4. Error bien explicado.** En **Pruebas!C5** escribe
`=RIESGO.NORMAL(C12;150)` y simula.
- Esperado: no simula y dice que los argumentos tienen que ser números
  escritos, nombrando **Pruebas!C5**. Después vuelve a poner
  `=RIESGO.NORMAL(1000;150)`.

**E5. Una RIESGO dentro de un modelo grande.** *(Nueva: es lo que hiciste
por tu cuenta en E3, y destapó el fallo.)* Cierra sin guardar y reabre el
libro. En la hoja **Modelo**, escribe en **C5** `=RIESGO.NORMAL(120;10)`.
Quita todo del panel, añade **solo Modelo!C32** (VAN) como salida y simula.
- Esperado: simula sin error; en «Cómo se calculó» aparece «Entradas con
  funciones RIESGO del libro: Modelo!C5 …»; el tornado tiene una sola
  barra, Modelo!C5.
- Al terminar, **cierra sin guardar** para que «Modelo» vuelva a su estado.

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
- *Nota (27/09):* H13 devuelve **nombres de zona** (texto), así que las
  estadísticas salen vacías: es correcto. Lo que se prueba es el paso al modo
  compatible y el aviso. Desde esta versión, la salida dice «ninguna iteración
  dio un número» en vez de «mínimo ∞».

---

## H. Entrada con fórmula en el modo compatible

**H1.** Marca `Pruebas!C21` como entrada (tiene la fórmula `=7+1`) y `C22`
como salida. En Configuración, motor **Compatible** e iteraciones `1000`
(«Otra cantidad»). Simula. La distribución que el panel le pone a C21 por
defecto (triangular alrededor de 8) vale: no hace falta cambiarla.
- Esperado: al terminar, **C21 sigue teniendo la fórmula `=7+1`** (míralo en
  la barra de fórmulas), no un número. Antes de esta versión se perdía.
- Vuelve el motor a **Automático**.

---

## J. Compartir el libro sin romperlo

Necesita las funciones RIESGO del bloque E escritas en `Pruebas!C5` y `C6`.

**J1. Preparar.** Pestaña Modelo → baja hasta el final, a la sección
**«Compartir el libro»** (justo encima del botón Simular) → pulsa **«Preparar
para compartir»**.
- Esperado: «Convertidas 2 funciones RIESGO…». En la hoja, **C5 vale 1000 y
  C6 vale 10,67 como números** (la barra de fórmulas ya no muestra
  `=RIESGO…`). En el panel aparecen dos entradas nuevas, `Pruebas!C5` y
  `Pruebas!C6`, con su normal y su triangular.

**J2. Sigue simulando igual.** Con C7 como salida, simula.
- Esperado: media de C7 en torno a **10.670**, como en E3. Ahora las entradas
  vienen del panel, no de las funciones.

**J3. Sin el complemento (opcional, pero es lo importante).** **Después de
J1** (con el libro ya preparado), guarda el libro y ábrelo donde no esté el
complemento: otro ordenador, **el iPad** o Excel para la Web sin cargarlo. Si
lo abres sin haberlo preparado, verás `=_xldudf_RIESGO_NORMAL(…)`: es justo
lo que «Preparar para compartir» evita.
- Esperado: **ningún #¿NOMBRE?**; C5, C6 y C7 muestran números.

**J4. Restaurar.** Vuelve a Modelo → **Restaurar las 2 funciones RIESGO**.
- Esperado: C5 y C6 vuelven a tener `=RIESGO.NORMAL(1000;150)` y
  `=RIESGO.TRIANGULAR(8;10;14)`, y las dos entradas desaparecen del panel.

---

## K. Mismos números al volver a marcar

**K1.** En la hoja «Modelo», con el modelo de los bloques A–C (o márcalo de
nuevo), simula con 10.000 iteraciones y **apunta la media del VAN**.

**K2.** Quita la entrada C5 con la ✕ y vuelve a añadirla con **la misma
distribución** (Triangular 105 / 120 / 140). Simula.
- Esperado: **la media del VAN es exactamente la misma** que en K1. Antes de
  esta versión cambiaba un poco cada vez que se volvía a marcar una celda.

---

## W. Excel para la Web (y Mac, si tienes)

Es la «prueba de humo» que el estudio de mercado pedía adelantar: saber si lo
que funciona en Windows funciona también en las otras plataformas.

**Preparación (Web):**
1. Deja `npm start` funcionando en tu PC (el complemento se sirve desde tu
   equipo, así que la Web solo puede cargarlo **en ese mismo PC**).
2. Sube `demo-proyecto-aurora.xlsx` a tu OneDrive y ábrelo en
   **excel.office.com**.
3. **Inicio → Complementos → Más complementos → Mis complementos → Cargar
   mi complemento**, y elige el archivo `manifest.xml` de la carpeta del
   proyecto.

**W1.** Aparece la pestaña **Riesgo** (o el botón del complemento) y el panel
se abre.

**W2.** Marca las entradas y salidas de A2 y simula.
- Esperado: motor rápido, resultados como en Windows. Apunta **cuántos
  hilos** dice «Cómo se calculó».

**W3.** Pestaña **Diagnóstico**: apunta la versión de **ExcelApi** que dice.

**W4.** Volcar a una hoja, y cerrar y reabrir el libro (C3 y C4).

**W5.** Escribe `=RIESGO.NORMAL(1000;150)` en una celda vacía.
- Esperado: vale 1000.
- *Arreglado el 27/09:* el servidor no daba permiso de origen cruzado a los
  archivos de las funciones, y Excel para la Web los pide desde otro dominio.
  Antes de repetirla: `git pull`, **`npm run stop`** y **`npm start`**, y en la
  Web **quita el complemento y vuelve a cargar `manifest.xml`** (la Web
  guarda en caché la lista de funciones). Si sigue sin funcionar, abre las
  herramientas del navegador (F12 → Consola) y mándame una captura de los
  errores en rojo.

**Mac (si tienes acceso):** lo mismo, cargando el manifiesto en Excel para
Mac. Si no tienes Mac, sáltalo y dímelo.

---

## L. Etapa 1: lo que pediste en las pruebas (nuevo, 28/09)

Con el libro limpio, en la hoja **Modelo**. Quita todo del panel antes.

**L1. Nombres legibles (E5).** Marca C5 como entrada y C32 como salida.
- Esperado: la entrada se llama **«Precio unitario»** y la salida **«VAN al
  11 %»** (el texto de su izquierda), no «Modelo!C5». Marca también H28 como
  salida: debe llamarse **«Flujo de caja libre (H28)»**.
- En un modelo que ya tenías marcado (con nombres «Modelo!C5»), aparece el
  aviso con el botón **«Poner nombres desde la hoja»**: púlsalo.

**L2. Elegir la salida (E6).** Con las entradas de A2 y las salidas C32, C33
y C34, simula.
- Esperado: al principio de Resultados, una tabla **«Salidas»** con las tres
  y un selector «Ver». Solo se ve una salida debajo; al pulsar otra fila de la
  tabla, cambia.
- **Selecciona en la hoja la celda C33**: el panel debe saltar a la TIR. Dime
  si lo hace.

**L3. Informe del proyecto (C7).** En **⚙ → Proyecto**, escribe un título y
una descripción. Simula y pulsa **Informe PDF**.
- Esperado: el PDF empieza con tu título y tu descripción, y cada salida
  tiene un párrafo que la explica en palabras. En el panel, ese párrafo sale
  debajo del nombre de cada salida.
- **Volcar a una hoja**: la hoja empieza también con tu título.

**L4. Escenarios (E7).** Simula y pulsa **Guardar como escenario** («Escenario
base»). Cambia la entrada C9 (costes fijos, máximo 600000), simula y guarda
como «Costes altos».
- Esperado: la lista de escenarios con los dos; «Escenario base» sigue
  marcado, y cada salida tiene la tabla «Frente a «Escenario base»» y otra
  **«En todos los escenarios»** con las dos filas.
- Marca «Costes altos» y luego «No comparar con ninguno»: la comparación
  cambia o desaparece. Borra uno con la ✕.
- Guarda, cierra y reabre el libro: los escenarios siguen ahí.

**L5. Color de las celdas RIESGO (E8).** En la hoja **Pruebas**, escribe las
funciones de E1 y E2, marca Pruebas!C7 como salida y simula.
- Esperado: Pruebas!C5 y C6 quedan pintadas de **melocotón** (distinto del
  amarillo de las entradas del panel).

**L6. Núcleos automáticos (F4).** Con ⚙ → núcleos en **Automático**, simula el
modelo de A2 con 10.000 iteraciones y luego con 250.000.
- Esperado: con 10.000, «Cómo se calculó» dice **un hilo** y tarda poco
  (≈ 200 ms); con 250.000, **varios hilos**.

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
