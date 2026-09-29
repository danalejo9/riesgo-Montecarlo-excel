# Guía de pruebas en Excel

> **Ronda del 29/09 (la que toca ahora): qué hacer, en orden.**
> 1. **Preparación** (sección 0, más abajo): actualizar, reinstalar y abrir
>    el libro de demostración **recién descargado**.
> 2. **Bloque N entero, de N1 a N31** (sección N, justo después de la 0).
>    Es todo lo nuevo desde tu última ronda. Lo demás (bloques A–K, T, J, W,
>    I) ya pasó; no hace falta repetirlo salvo N5, que es un repaso rápido.
> 3. **N30 y N31** son con **tus propios libros** (el de humedales de 132
>    hojas y los que pienses usar): miden el tiempo con un libro grande y
>    buscan funciones que el motor todavía no sepa.
> 4. Pendientes de antes: **W6** y **W7** (Excel para la Web). Mac, si algún
>    día tienes uno a mano.
>
> Anota **OK** o **Falla + qué ves** por código, en el mismo documento de
> siempre (tu Word de resultados), y pásamelo con las capturas.

*Versión del 28/09, reescrita desde cero; bloque N ampliado el 29/09.* Recorre **todo** el complemento
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
  - **B7**: funciones RIESGO con celdas como argumentos
    (`=RIESGO.NORMAL(C32;C33)`), dentro de una operación y con parámetros que
    dependen de otra celda aleatoria.
  - **B6**: traer resultados a la hoja con `RIESGO.MEDIA`, `RIESGO.PERCENTIL`,
    `RIESGO.PROB`, `RIESGO.DESV`, `RIESGO.MIN` y `RIESGO.MAX`.

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
  (hoja «Zonas» y, en «Pruebas», secciones 6 a 12; la 9 a la 12 son del
  29/09). Si guardaste cambios en tu copia y `git pull` se queja, descártala:
  `git checkout -- ejemplos/demo-proyecto-aurora.xlsx` y repite el pull.
  Mejor: trabaja sobre una copia (`Copy-Item ejemplos\demo-proyecto-aurora.xlsx
  "$HOME\Desktop\aurora-prueba.xlsx"`) y deja el original intacto.
- Las funciones de Excel del complemento han cambiado (hay seis nuevas). Si
  al escribir `=RIESGO.MEDIA` Excel no la propone, cierra Excel, repite
  `npm run stop` y `npm start` y vuelve a abrir el libro.

**P0.** En la cinta, la pestaña **Riesgo** tiene cuatro botones: Modelo,
Resultados, Configuración y Diagnóstico. Al pulsar Modelo se abre el panel
(no se queda en blanco).

---

## N. Etapa 2 (ronda siguiente: empieza por aquí)

*Añadido el 29/09, tras tu ronda completa.* La etapa 2 cambia el
**manifiesto** (versión 0.5): el panel, los botones de la cinta y las
funciones RIESGO pasan a vivir en un solo proceso («runtime compartido»).
Solo hace falta probar este bloque; lo demás ya pasó.

**Antes de empezar** (imprescindible, porque el manifiesto cambió):
1. Cierra Excel del todo.
2. En PowerShell: `git pull origin claude/nifty-thompson-xfnqm2`, luego
   `npm install`, `npm run stop` y `npm start`.
3. Si la pestaña Riesgo no aparece o se comporta como antes, borra la caché
   de complementos de Office: cierra Excel, borra el contenido de
   `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\` y repite `npm start`.
4. En Excel para la Web: quita el complemento y vuelve a cargar
   `manifest.xml`.

**N1. Diagnóstico.** Pestaña Diagnóstico: la línea **«Runtime compartido»**
dice **sí**. Si dice «no», para aquí y dímelo con la versión de Excel.

**N2. La cinta sin recargar el panel** (era B4). Simula algo y, con el panel
abierto, pulsa en la cinta Resultados, Configuración, Diagnóstico y Modelo.
- Esperado: cambia de pestaña **sin ponerse en blanco** y sin perder los
  resultados.
- Cierra el panel con la ✕ y pulsa Resultados en la cinta: se abre
  directamente en Resultados, con los resultados que había.

**N3. Resultados en la hoja al reabrir** (era el límite de F19). En la hoja
«Pruebas», con las secciones 7 y 8 escritas (F12 y F16), simula C37. Guarda,
cierra Excel, ejecuta `npm start` y abre el libro **sin abrir el panel**.
- Esperado: C40–C43 muestran sus números (el complemento arranca solo al
  calcular las funciones y lee los resultados guardados en el libro). Si
  salen #N/D un momento, deben pasar a números en uno o dos segundos.

**N4. Modo compatible más rápido** (era H2). Repite H1 con y sin «Congelar
la pantalla».
- Esperado: bastante más rápido que en tu ronda del 29/09 y con mucho menos
  parpadeo (ahora escribe 20 iteraciones por cada viaje a Excel). Apunta el
  tiempo y las iteraciones por segundo que dice «Cómo se calculó».

**N6. Modo del libro: valores fijos** (B2, nuevo). En la cinta hay un grupo
**«Modo del libro»** con **Valores fijos** (desactivado: es el modo actual) y
**Aleatorio**. En la hoja «Pruebas», con `=RIESGO.TRIANGULAR(8;10;14)` en C6:
- C6 vale **10,67** (la media).
- En ⚙ → **Modo del libro** → Valor fijo: **Moda** → C6 = **10**; **Mediana**
  → **10,54**; **Percentil…** 90 → **12,45**. Vuelve a **Media**.

**N7. Modo aleatorio.** Pulsa **Aleatorio** en la cinta.
- Esperado: el botón Aleatorio queda desactivado y Valores fijos activo; C5,
  C6 y C7 cambian a valores al azar. Pulsa **F9** varias veces: cambian cada
  vez. En «Zonas», C12 (`RIESGO.CATEGORIA`) va saliendo Norte, Sur o Este.
- Simula C7: la media sigue en torno a **10.670**, como siempre (el modo no
  toca la simulación).
- Guarda, cierra y reabre: el libro sigue en Aleatorio. Vuelve a **Valores
  fijos** al terminar.

**N8. La cinta actúa sin abrir el panel** (B3, nuevo). Cierra el panel. En
la cinta hay un grupo **«Acciones»**: Marcar entrada, Marcar salida,
Simular y Quitar resaltado. En la hoja «Modelo», con un modelo vacío (quita
todo antes desde el panel y ciérralo):
- Selecciona **C5** y pulsa **Marcar entrada**: C5 se pinta de amarillo y el
  panel **no** se abre. Igual con C6.
- Selecciona **C32** y pulsa **Marcar salida**: se pinta de verde.
- Pulsa otra vez **Marcar salida** con C32: ahora sí se abre el panel, con el
  aviso «Modelo!C32 ya está en el modelo».
- Pulsa **Simular**: se abre el panel, se ve el progreso y acaba en
  Resultados (C5 y C6 con la triangular que propone el panel).
- **Quitar resaltado**: las celdas vuelven a su relleno.
- Abre el panel: C5 y C6 están en Entradas con su nombre legible («Precio
  unitario»…) y C32 en Salidas.

**N9. RIESGO dentro de operaciones, con Excel en el bucle** (B1b, nuevo;
era F15). En la hoja «Pruebas», con F12 escrito (C34–C36) y C37 como salida:
- Simula con el motor **Automático** y apunta la media y la desviación de C37.
- En ⚙, motor **Compatible**, las **mismas iteraciones** (pon 1.000 en los
  dos) y simula.
- Esperado: **ya no sale el error** de F15; simula (más despacio: con estas
  funciones va de una iteración por viaje a Excel) y da **la misma media y la
  misma desviación** que el motor rápido.
- Mientras simula, C35 y C36 **conservan su fórmula** (míralo en la barra de
  fórmulas): es la propia función la que devuelve el valor de cada iteración.
- Sigue sin admitirse, con un aviso claro: dos funciones RIESGO en la misma
  fórmula, o `RIESGO.TRUNCAR` con parámetros que cambian.
- Vuelve el motor a **Automático**.

**N10. Marcas y delimitadores en el histograma** (C10, nuevo). Simula la
demo con la salida de beneficio y mira el histograma de Resultados:
- Hay una línea continua con «media» y, si no coincide con ella, otra
  discontinua con «mediana».
- Dos líneas oscuras en p5 y p95; encima dicen **5 % · 90 % · 5 %** y las
  barras de fuera se ven grises.
- **Arrastra** la línea izquierda hacia la derecha: los porcentajes cambian
  al momento y suman 100 %. Escribe un valor en *Desde* o *Hasta* y pulsa
  Intro: la línea se mueve ahí (un valor fuera del gráfico se queda en el
  borde).
- En el informe PDF (C7), el histograma trae fijas la media, la mediana y
  las líneas de p5 y p95.

**N11. Resultados más fáciles de leer** (U2, nuevo; responde a T6). Tras
simular la demo:
- Arriba: una línea «Rápido · 10.000 iteraciones · …», los avisos (si hay) y
  los dos botones. Bajo el nombre de la salida, **cuatro cifras grandes**
  (media, p5, p95, desviación), la lectura y el histograma.
- Debajo, secciones con ▸ que se abren con un clic; *Qué la mueve más* viene
  abierta. Abre *Estadísticos y percentiles*, cierra el panel y vuelve a
  abrirlo: sigue abierta.
- Dime si ahora se lee mejor y si cambiarías qué va abierto o a la vista.

**N12. Salida y correlación desde la fórmula** (resto de B6, nuevo): haz
F20 y F21 (sección 9 de «Pruebas»).

**N13. Ajuste orientado al riesgo** (I2, nuevo): haz E5.

**N14. Fechas** (T7 del plan, nuevo): haz T9.

**N15. Registro de riesgos** (T8 del plan, nuevo): haz T10.

**N16. Opciones de decisión** (T9 del plan, nuevo): haz T11.

**N17. Iteraciones a una hoja** (C3 del plan, nuevo): haz C5.

**N18. Gráficas nuevas** (C4 del plan, nuevo): haz C6.

**N19. Distribuciones nuevas** (B5 del plan, nuevo): haz F22.

**N20. Cambio en la salida** (D4 del plan, nuevo). Simula la demo con el
VAN como salida y abre «Qué la mueve más»: arriba hay dos botones,
**Correlación** (el tornado de siempre) y **Cambio en la salida**. En el
segundo, cada barra va de la media del VAN cuando esa entrada está en su 10 %
más bajo a cuando está en su 10 % más alto, en euros; pasa el ratón para leer
los dos valores. El orden puede no coincidir con el de correlación: este mide
«cuánto dinero mueve». También sale en el informe PDF («Cuánto mueve cada
entrada»).

**N21. Estrés** (D2 del plan, nuevo). En la misma salida, abre **«Estrés:
una entrada en un extremo»**: elige una entrada (p. ej. el precio) y «su 10 %
más bajo». La tabla compara la media, p5, p50 y p95 del VAN de siempre con
los de esas iteraciones, y el cambio; con umbral, también su probabilidad.
Es instantáneo (no vuelve a simular). Prueba con una entrada de texto (la
zona, si la tienes marcada): se elige la categoría.

**N22. Una serie de salidas** (D3 del plan, nuevo). En «Modelo», selecciona
**D28:H28** (los flujos de caja libres de los años 1 a 5) y pulsa «Añadir la
selección como salida»: se crean cinco salidas llamadas **«Flujo de caja
libre · Año 1»** … **«· Año 5»**. Simula: en «Comparar salidas», el
**abanico** muestra la serie año a año. Una selección de varias filas y
columnas avisa de que hay que elegir una fila o una columna.

**N23. Deshacer** (E3 del plan, nuevo). En «Modelo», añade dos entradas y
cambia una distribución. Aparece **↶ Deshacer** arriba: cada pulsación
deshace un cambio (añadir, quitar, cambiar una distribución, un nombre
escrito de seguido cuenta como uno). También con **Ctrl+Z** si no estás
escribiendo en un campo. Hasta 30 cambios; se pierde al cerrar el panel.

**N24. Matriz de correlaciones y todas las entradas** (E1 y E2, nuevo). En
«Modelo», bajo las entradas:
- **Todas las entradas**: una tabla con las del panel (pulsa una para
  abrirla) y, tras simular, las funciones RIESGO del libro, en gris.
- **Matriz de correlaciones**: escribe 0,8 entre dos entradas y pulsa Intro;
  en la ficha de ambas pone «1 correlación(es)». Si escribes algo imposible
  (0,8, 0,8 y −0,8 entre tres), un aviso con sus nombres explica por qué.

**N25. Ayuda** (E4, nuevo). En Resultados, «¿Qué es esto?» bajo las cifras y
dentro de cada sección: explica en dos o tres frases qué es cada número y
cada gráfico. Dime si falta en algún sitio o si algo no se entiende.

**N26. Avisos de coherencia y trazado** (H6 y H7 del plan, nuevo).
- Marca como entrada una celda que el modelo no usa (por ejemplo, una celda
  de la hoja «Pruebas» con un número) y simula la demo: arriba en Resultados,
  «La entrada … no afecta a ninguna salida».
- Pon a las unidades (C6) una **Normal(20.000; 12.000)** y simula: aviso de
  que da negativos alrededor del **5 %** de las veces. Vuelve a dejarla como
  estaba.
- En «Cómo se calculó», **«Por dónde llega cada entrada»**: para cada
  entrada, el camino de celdas hasta cada salida (p. ej. C5 → … → C32).

**N27. Asistente y plantillas** (U1 del plan, nuevo). En un libro nuevo
(sin modelo), abre el panel: «Tu primer modelo» explica los cuatro pasos y
ofrece tres plantillas. Pulsa **Proyecto de inversión**: aparece una hoja
«Inversión» con las funciones RIESGO ya puestas. Pulsa **Simular** sin
marcar nada: sale el **VAN** (media en torno a **30.000 €**, con mucha
dispersión). Prueba también **Presupuesto de obra** (coste total en torno a
**323.000 €**, con «Registro de riesgos») y **Cartera** (valor al cabo de un
año en torno a **105.500 €**; cambia la correlación de B9 a 0 y el p5
mejora). Y **Serie de precios** (H5): cinco salidas «Precio · Año 1…5»
(medias en torno a 103 → 116, cada vez más dispersas) y el tipo a 5 años
en torno al **4,2 %**; en «Comparar salidas», el abanico se abre con los años.

**N28. Buscar objetivo** (H4 del plan, nuevo). Simula la demo con el VAN y
pon el umbral «por debajo de 0». Abre **«Buscar objetivo»**: celda C5 (el
precio; «Leer de la selección»), desde 105 hasta 140, probabilidad 10 %, y
**Buscar**. Tarda unas diez simulaciones y dice qué precio deja P(VAN < 0)
en el 10 %, con la lista de lo probado. Un rango que no contiene esa
probabilidad lo dice. La celda se fija solo durante la búsqueda: el libro no
cambia. Solo con el motor rápido.

**N29. DESREF** (F1 del plan, nuevo). En «Pruebas», escribe en una celda
vacía `=SUMA(DESREF(C5;0;0;3;1))` (suma C5:C7) y márcala como salida junto a
lo demás: simula con el motor **rápido** (antes DESREF lo mandaba al
compatible) y da lo mismo que `=SUMA(C5:C7)`. Con un desplazamiento
calculado (`DESREF(C5;C32/1000;0)`) sigue yendo al compatible.

**N30. Tu libro grande: cuánto tarda** (F2 del plan, nuevo). Con el libro
de humedales (`Humedales_v1_completo (100).xlsx`, 132 hojas) **abierto en
Excel** y el complemento cargado (`npm start` en la carpeta del proyecto):
1. Pestaña **Diagnóstico** → **Analizar el libro**. Apunta: hojas, fórmulas,
   viajes a Excel, **tiempo**, cobertura y las funciones sin soporte que
   liste.
2. Pestaña **Modelo**: marca como entradas **tres o cuatro celdas con
   números** de las que dependa un resultado importante (cualquier supuesto
   del modelo) y como salida **ese resultado**. Deja la distribución que
   propone el panel.
3. En ⚙, **10.000 iteraciones** y motor **Automático**. **Simular**.
4. En Resultados → «Cómo se calculó», apunta: **motor**, **tiempo total**,
   **Leer el libro** (con hojas, fórmulas y viajes), **Preparar y simular**,
   **celdas del modelo** e hilos. Si sale «Por qué no pudo el motor rápido»,
   copia los motivos.
5. Repite el paso 3 con **1.000 iteraciones** (para separar lo fijo de lo que
   crece con las iteraciones).
6. Al terminar, **quita las entradas y la salida** del panel o **no guardes**
   el libro (el modelo se guarda dentro del archivo).
- Pásame esas cifras (o capturas). No hace falta que me envíes el libro:
  con esto sé dónde se va el tiempo (leer o calcular) y si hay que optimizar.
  Si prefieres que lo mida yo aquí, súbelo al repositorio en
  `tests/fixtures/privado/` (dime antes si contiene datos que no deban
  quedar en GitHub).

**N31. Qué funciones usan tus libros** (F1, LAMBDA; nuevo). En PowerShell,
**en la carpeta del proyecto**:

```
cd "C:\Users\danal\Documents\Proyectos Claude\riesgo-montecarlo-v2"
npm run scan -- "RUTA\DEL\LIBRO.xlsx"
```

(cambia `RUTA\DEL\LIBRO.xlsx` por la ruta de verdad, entre comillas; puedes
poner varios libros seguidos). Hazlo con el de humedales y con los libros
que pienses simular de verdad. Pásame el informe que sale en pantalla: dice
qué funciones faltan (por ejemplo `LAMBDA`, `DESREF` con desplazamientos
calculados o `INDIRECTO`) y así desarrollo solo lo que tus libros usan.

**N5. Todo lo demás sigue igual.** Repite rápido A6 (simular), F3 (RIESGO en
«Pruebas»), T2 (ahora la **zona sale en el tornado**, en gris, y la lectura
dice que es lo que más mueve los ingresos) y W1–W5 en la Web.

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

**C5. Iteraciones a una hoja** (C3 del plan, nuevo). Simula la demo y pulsa
**Iteraciones a una hoja** (arriba en Resultados).
- Esperado: una hoja nueva **«Iteraciones»** con una fila por iteración
  (10.000 con los ajustes de la demo): la columna *Iteración*, una por cada
  entrada y una por cada salida, con su nombre y, debajo, su celda. Las dos
  primeras filas quedan fijas al desplazarte.
- Las entradas de texto salen como texto («Norte»), las fechas como fechas,
  y una iteración sin número, en blanco.
- Comprueba una fila a mano: con los valores de las entradas de esa fila, la
  salida da lo mismo que calcula tu modelo.
- Tras cerrar y reabrir el libro (resultados restaurados), el botón no
  aparece: las iteraciones solo viven en memoria. Vuelve a simular.

**C6. Gráficas nuevas** (C4 del plan, nuevo). Marca como salidas, en este
orden, los flujos de caja libres de los cinco años de la hoja «Modelo»
(**D28, E28, F28, G28 y H28**) y simula.
- **Dispersión con una entrada** (sección plegable de cada salida): una nube
  de puntos; elige otra entrada en el desplegable. La entrada que más mueve
  la salida en el tornado da la nube más inclinada.
- **Comparar salidas** (arriba, bajo la tabla de salidas): **caja y
  bigotes** de cada salida en un eje común, las **curvas acumuladas**
  superpuestas con su leyenda de colores y, con tres o más, el **abanico**
  (mediana y bandas p25–p75 y p5–p95, en el orden en que marcaste las
  salidas).
- En el **Informe PDF**, al final, «Comparar salidas» con las mismas gráficas.

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

**E5. Ajuste orientado al riesgo** (I2, nuevo). Con los 40 precios otra vez
en «Ajustar a datos»:
- En **«Lo que más importa»** elige *La cola alta*, y en «Ordenar por»,
  *Error en los percentiles del objetivo*. La columna **Perc.** es ese error
  (en desviaciones típicas; cuanto menor, mejor).
- Debajo de la tabla, **«Percentiles: datos y …»**: p50, p80, p90, p95 y p99
  de los datos frente a los de la elegida; en negrita los que se separan más
  de 0,25 σ. Pincha la **Normal**: en p95–p99 se queda corta (diferencia
  negativa en negrita).
- Pulsa **«¿Cuánto fiarse de este ajuste? (bootstrap)»**: en un momento sale
  una tabla con cada parámetro y cada percentil y su intervalo del 90 %.
  Con 40 datos el p99 tiene un intervalo ancho: es lo esperable.
- **Conteos**: pega `3 5 2 4 4 6 1 3 5 4 2 7 3 4 5 3 2 4 6 3`. Aparecen
  **Poisson** y **binomial** marcadas «(discreta)», con una nota: su AICc no
  se compara con el de las continuas; en «Perc.» la binomial queda la
  primera.

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

**F5. Error bien explicado.** En C5 escribe `=RIESGO.NORMAL(1000;-150)` (una
desviación negativa) y simula.
- Esperado: no simula; dice «Hay funciones RIESGO que no se pueden usar tal
  como están» y nombra Pruebas!C5 con el motivo (parámetros no válidos).
- Vuelve a poner `=RIESGO.NORMAL(1000;150)`.
- *Cambiado el 28/09:* antes esta prueba usaba `=RIESGO.NORMAL(C12;150)`, que
  ya **no es un error**: desde B7 una celda puede ser argumento (bloque F12–F15).

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

**RIESGO con celdas (B7, sección 7 de «Pruebas», filas 32–37).** C32 (1.000)
y C33 (150) son la media y la desviación de la demanda, escritas en celdas.

**F12. Escribir.** En las celdas amarillas:

| Celda | Fórmula | Qué caso es | Valor en la celda |
|---|---|---|---|
| C34 | `=RIESGO.NORMAL(C32;C33)` | argumentos que son celdas | **1.000** |
| C35 | `=10+RIESGO.NORMAL(0;1)` | dentro de una operación | **10** |
| C36 | `=RIESGO.NORMAL(C34;50)` | la media es otra celda aleatoria (C34) | **1.000** |

C37 (ya escrita, `=C36*C35`) vale **10.000**.

**F13. Simular.** Quita todo del panel, añade **C37** como salida y simula.
- Esperado:
  - **Motor rápido**, sin errores.
  - En «Cómo se calculó», «Entradas con funciones RIESGO del libro»:
    - «Demanda con celdas (Pruebas!C34): Normal(1000; 150)», con los números
      leídos de C32 y C33.
    - «Precio con imprevisto (Pruebas!C35): Normal(0; 1)».
    - «Demanda del mes siguiente (Pruebas!C36): RIESGO.NORMAL con parámetros
      que cambian en cada iteración».
  - C37: media en torno a **10.000** y desviación en torno a **1.875**.
  - En el tornado, arriba «Demanda con celdas», luego «Precio con
    imprevisto» y, con poco peso, «Demanda del mes siguiente».
  - C34, C35 y C36 se pintan de melocotón.

**F14. Los argumentos se leen al simular.** Cambia **C33** a `300` y vuelve a
simular.
- Esperado: C34 pasa a Normal(1000; 300) y la desviación de C37 sube a unos
  **3.200**.
- Vuelve a poner C33 en `150`.

**F15. Solo con el motor rápido.** En ⚙, motor **Compatible**, y simula.
- Esperado: no simula; dice «Hay funciones RIESGO que solo puede simular el
  motor rápido»:
  - Pruebas!C35 tiene una función RIESGO dentro de una operación.
  - Pruebas!C36 tiene una función RIESGO con parámetros que cambian en cada
    iteración.
  - En Configuración está elegido el motor compatible: pon «Automático» o
    «Rápido».
- Vuelve el motor a **Automático**.

**Resultados en la hoja (B6, sección 8 de «Pruebas», filas 40–43).** Traen a
la hoja lo que dio la última simulación de C37.

**F16. Escribir.** Escribe las fórmulas de la sección 8:

| Celda | Fórmula | Tras simular F17, en torno a |
|---|---|---|
| C40 | `=RIESGO.MEDIA(C37)` | **10.000** |
| C41 | `=RIESGO.PERCENTIL(C37;0,05)` | **7.050** |
| C42 | `=RIESGO.PROB(C37;8000)` | **14 %** |
| C43 | `=RIESGO.DESV(C37)` | **1.875** |

- Esperado nada más escribirlas: ya dan números, los de la **última
  simulación** de C37, que fue la de F14 (con C33 = 300). Por eso C43 dice
  unos **3.200** y no 1.875.
- Si sale #¿NOMBRE?, Excel no ha cargado las funciones nuevas: mira la
  preparación (cerrar Excel, `npm run stop`, `npm start`).

**F17. Simular.** Con C37 como salida (y C33 otra vez en 150), simula.
- Esperado:
  - Al terminar, C40–C43 cambian solos a los valores de la tabla (C43 baja
    de unos 3.200 a unos 1.875).
  - C40 y C43 son **exactamente** la media y la desviación que enseña el panel.
  - C41 es casi igual al p5 del panel (el panel lo calcula con toda la muestra; la función, con 1.001 cuantiles).
- Vuelve a simular: cambian con la simulación nueva.

**F18. Variantes.** Escribe en celdas vacías (por ejemplo, E40 y E41):
- `=RIESGO.PROB(C37;8000;VERDADERO)`: la probabilidad **por encima**, en torno
  a **86 %** (C42 + E40 = 100 %).
- `=RIESGO.PERCENTIL(C37;95)`: el p95, en torno a **13.200** (el 95 se entiende
  como 0,95).
- `=RIESGO.MIN(C37)` y `=RIESGO.MAX(C37)`: el mínimo y el máximo del panel.
- `=RIESGO.MEDIA(C32)`: C32 no es una salida, así que da **#N/D**. Al pasar
  el ratón por el aviso de la celda se lee «Sin resultados de esta celda:
  márcala como salida y simula».

**F19. Cerrar y reabrir.** Guarda, cierra Excel, ejecuta `npm start` y vuelve
a abrir el libro.
- Esperado: C40–C43 siguen con sus números, y al abrir el panel siguen igual.
- **Límite conocido de esta versión** (hasta la etapa 2): los resultados de
  estas funciones se guardan en el equipo, no en el libro. En otro equipo
  darán #N/D hasta abrir el panel (que los publica de nuevo desde los
  resultados guardados en el libro) o simular.

**Salida y correlación con funciones (sección 9 de «Pruebas», filas
46–49).** Escribe:

| Celda | Fórmula | Enseña |
|---|---|---|
| C46 | `=RIESGO.NORMAL(100;10)` | 100 |
| C47 | `=RIESGO.NORMAL(50;5)` | 50 |
| C48 | `=RIESGO.CORRELACION(C46;C47;0,9)` | 0,90 |
| C49 | `=RIESGO.SALIDA("Coste total")+C46+C47` | 150 |

**F20. RIESGO.SALIDA.** Sin marcar C49 como salida en el panel, simula.
- Esperado: en Resultados aparece una salida **«Coste total»** (Pruebas!C49),
  con media en torno a **150**. Si quitas todas las salidas del panel,
  *Simular* sigue funcionando: basta la de la fórmula.

**F21. RIESGO.CORRELACION.** Mira la desviación de «Coste total».
- Esperado: unos **14,7** (con la correlación de 0,9). Cambia C48 a
  `=RIESGO.CORRELACION(C46;C47;0)` y vuelve a simular: baja a unos **11,2**;
  con `-0,9`, a unos **5,9**. Deja 0,9.
- Errores claros: un coeficiente de 1,5 (en la celda da #¡NUM!; al simular,
  «tiene que estar entre -1 y 1»), o una celda que no es entrada (p. ej.
  `=RIESGO.CORRELACION(C46;C45;0,5)`: «Pruebas!C45 no es una entrada»).
- Con el motor **Compatible** da lo mismo (más despacio).
- «Preparar para compartir»: C49 queda como `=0+C46+C47` (sigue calculando
  sin el complemento), C48 con su valor, y el panel gana la salida «Coste
  total» y la correlación entre C46 y C47. «Restaurar» lo deshace.

**F22. Distribuciones nuevas** (B5 del plan, nuevo). En celdas vacías de
«Pruebas» (por ejemplo, la columna E a partir de la fila 46), escribe una a
una. En «Valores fijos» (media), cada una enseña:

| Fórmula | Enseña |
|---|---|
| `=RIESGO.STUDENT(5;100;10)` | 100 |
| `=RIESGO.LOGISTICA(100;10)` | 100 |
| `=RIESGO.LOGLOGISTICA(50;4)` | 55,54 |
| `=RIESGO.PARETO(1000;3)` | 1.500 |
| `=RIESGO.UNIFORMEENTERA(1;6)` | 3,5 |
| `=RIESGO.GEOMETRICA(0,25)` | 3 |
| `=RIESGO.BINOMNEG(3;0,4)` | 4,5 |
| `=RIESGO.HIPERGEOM(10;5;50)` | 1 |
| `=RIESGO.TRIGEN(80;100;150;0,1;0,9)` | 112,93 |
| `=RIESGO.HISTOGRAMA(0;100;{1;3;5;3;1})` | 50 |

- Marca una de ellas como salida y simula: la media del panel se acerca a lo
  que enseña la celda.
- En el panel, una entrada nueva: en «Distribución» aparecen las diez, cada
  una con su explicación y su vista previa; el histograma pide mínimo,
  máximo y los pesos de los tramos.
- Errores claros: `=RIESGO.HIPERGEOM(10;60;50)` da #¡NUM! (más casos que
  población); al simular, el motivo.

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
- Selecciona en la hoja **E5:F7** y pulsa **«Leer de la selección»**: quedan Norte 20 %, Sur 50 % y Este 30 %, y la vista
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

**T8. RIESGO.PROB con texto.** Tras simular T2, escribe en una celda vacía
`=RIESGO.PROB(C9;"Alta")`.
- Esperado: en torno a **12 %**, lo mismo que dice el panel para «Alta».

**T9. Fechas** (T7 del plan, nuevo; hoja «Pruebas», sección 10, filas
52–54). Escribe `=RIESGO.TRIANGULAR(FECHA(2027;1;1);FECHA(2027;2;1);FECHA(2027;4;1))`
en C52 (ya tiene formato de fecha) y `=RIESGO.NORMAL(90;10)` en C53. C54 es
`=C52+C53`, con formato de fecha. Marca C54 como salida y simula.
- Esperado, en Resultados, **todo en fechas**: media en torno al
  **11/05/2027**, p5 hacia el **08/04/2027** y p95 hacia el **17/06/2027**;
  la desviación, en **días** (unos **21**). También los ejes del histograma y
  de la curva, los delimitadores, los percentiles y la lectura.
- En la pregunta de probabilidad escribe `15/05/2027`: da la probabilidad de
  terminar antes (en torno al **58 %**).
- En «Cómo se muestrearon las entradas», C52 sale en fechas.
- «Volcar a una hoja» e «Informe PDF»: fechas también (la desviación, en días).

**T10. Registro de riesgos** (T8 del plan, nuevo; «Pruebas», sección 11,
filas 57–59). Escribe `=RIESGO.EVENTO(0,3;RIESGO.TRIANGULAR(10000;20000;60000))`
en C57 y `=RIESGO.EVENTO(0,1;50000)` en C58.
- Nada más escribirlas, en «Valores fijos» (media), C57 enseña **9.000** y
  C58 **5.000**: su valor esperado (probabilidad × impacto medio).
- Marca C59 como salida y simula. Esperado:
  - Media de C59 en torno a **14.000**.
  - En Resultados, sección **«Registro de riesgos»**: los dos riesgos, con
    su probabilidad (30 % y 10 %), su impacto, el valor esperado (9.000 y
    5.000) y su parte del total (64 % y 36 %), de más a menos.
  - En «Qué la mueve más», cada riesgo aparece como «… (ocurre)» y, el
    primero, también «… (impacto)».
- Con el motor **Compatible**: C58 sí (una sola función); C57 avisa de que
  tiene varias funciones en la fórmula (pon el impacto en otra celda).

**T11. Opciones de decisión** (T9 del plan, nuevo; «Pruebas», sección 12,
filas 62–64). Escribe `=RIESGO.NORMAL(1000;100)` en C62 y
`=RIESGO.DECISION(8;10;12)` en C63 (enseña **8**, la primera opción). Marca
C64 como salida y simula.
- Esperado: tarda unas tres veces lo normal (una simulación por opción). En
  Resultados, **«Comparar decisiones»** con tres filas: 8 (en la hoja), 10 y
  12, con medias en torno a **8.000**, **10.000** y **12.000**, y p5
  **proporcionales** (unos 6.680, 8.350 y 10.020): se simuló cada opción con
  los mismos números aleatorios.
- Pon un umbral en C64 (por ejemplo, por debajo de 9.000) y vuelve a simular:
  aparece la columna «Umbral» con la probabilidad en cada opción.
- También con textos: `=RIESGO.DECISION("Proveedor A";"Proveedor B")`, o
  con un rango (`=RIESGO.DECISION(E62:E64)`).
- Con el motor **Compatible**: un aviso claro (las decisiones solo con el
  rápido).

---

## J. Compartir el libro sin romperlo (hoja «Pruebas»)

Necesita `Pruebas!C5` y `C6` con las funciones de F1–F2.

**J1. Preparar.** Pestaña Modelo → al final, sección **«Compartir el
libro»** → **«Preparar para compartir»**.
- Esperado:
  - «Convertidas N funciones RIESGO…».
  - Si tienes escritas las secciones 7 y 8 (F12–F19), además: «N celdas con
    RIESGO dentro de una operación, con parámetros de otras celdas aleatorias
    o con funciones de resultados (RIESGO.MEDIA…) se quedan con su valor
    actual». Son C35, C36 y C40–C43; C34 se convierte en entrada.
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
- Esperado: C5 y C6 (y C34–C36, C40–C43 si estaban) vuelven a tener sus
  funciones, y las entradas creadas al preparar desaparecen del panel.

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

**W7. Resultados en la hoja en la Web.** En «Pruebas», repite F12, F16 y F17
(RIESGO con celdas y `RIESGO.MEDIA`).
- Esperado: como en Windows. Si las funciones de la sección 8 se quedan en
  #N/D después de simular, dímelo: es la parte que más depende de la
  plataforma.

**Mac:** lo mismo, cargando el manifiesto en Excel para Mac. Si no tienes,
sáltalo.

---

## I. Libros de fidelidad

Ábrelos en Excel, deja que calculen, guárdalos y mándamelos:

- **I1.** `tests\fixtures\fidelidad-tanda7.xlsx` (LET, 14 casos).
- **I2.** `tests\fixtures\fidelidad-tanda8.xlsx` (matrices, 27 casos).

Después haz el `git checkout -- …` de la preparación para que no te den
conflicto en el próximo pull.
