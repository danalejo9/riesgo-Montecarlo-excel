# Guía de pruebas en Excel

> **Ronda del 29/09 — qué hacer, paso a paso** (actualizado tras tus
> resultados de N1–N6).
>
> **Paso 1. Actualizar.** En PowerShell, una línea cada vez:
>
> ```
> cd "C:\Users\danal\Documents\Proyectos Claude\riesgo-montecarlo-v2"
> git checkout -- ejemplos/demo-proyecto-aurora.xlsx
> git pull origin claude/nifty-thompson-xfnqm2
> npm install
> npm run stop
> npm start
> ```
>
> La segunda línea descarta tu copia del libro de demostración (el pull se
> negaba por ella). Si el pull se queja de otro `.xlsx`, haz lo mismo con
> ese archivo: `git checkout -- RUTA` y repite el pull. Sale bien cuando
> termina en `Fast-forward`.
>
> **Paso 2. Tu copia del libro, ya rellena.** No hay que reconstruir nada a
> mano:
> 1. Copia el libro al escritorio (así el original queda intacto y el próximo
>    pull no se queja):
>    `Copy-Item ejemplos\demo-proyecto-aurora.xlsx "$HOME\Desktop\aurora-prueba.xlsx"`
> 2. Abre `aurora-prueba.xlsx` del escritorio y abre el panel (Riesgo → Modelo).
> 3. Pestaña **Diagnóstico** → sección **«Hojas de prueba»** → botón
>    **«Rellenar las hojas de prueba»**. Escribe de una vez las 28 fórmulas de
>    las celdas amarillas de «Pruebas» (secciones 1 a 12) y «Zonas» (C12).
>    Debe decir «Escritas 28 fórmulas».
> 4. Guarda (Ctrl+G). Desde aquí, **cada prueba que diga «escribe …» ya lo
>    tiene escrito**: sáltate ese paso y comprueba lo que dice «Esperado».
>
> Dos cosas normales en este libro relleno: en Resultados siempre aparece
> también la salida **«Coste total»** (la declara `RIESGO.SALIDA` en C49), y
> la sección 12 (decisiones) solo se simula tres veces si marcas C64 como
> salida.
>
> **Paso 3. Las pruebas, en este orden.**
> - **Ya hechas** (tu documento): N1, N2, N3 y N6.
> - **Repetir N4**: el error `ItemNotFound` al pasar al modo compatible
>   está arreglado (el resaltado intentaba pintar celdas de una hoja que ya
>   no existía). Debe ir sin errores.
> - **Seguir con N5 y de N7 a N42** (sección N, justo después de la 0).
>   N34 a N36 son la cinta nueva y el explorador: el manifiesto cambió, así
>   que ahí hay que cerrar Excel y repetir `npm run stop` y `npm start`.
>   N30 y N31 son con tus propios libros; N33 con el libro de LAMBDA.
> - Pendientes de antes: **W6** y **W7** (Excel para la Web).
> - **Nuevo, aparte y sin Excel**: el bloque **Q** (cronogramas de
>   referencia en ProjectLibre, para el motor de cronograma). Cuando puedas.
> - **Nuevo**: **V3 y V4** (comparar en el explorador y el asistente de
>   juicio experto), justo antes del bloque A.
> - **Nuevo, en Excel**: **Q5 a Q26**, el análisis de riesgo de cronograma
>   y costo (grupo Cronograma de la cinta y pestaña Cronograma). El
>   manifiesto cambió: cierra Excel y repite `npm run stop` y `npm start`.
> - **Nuevo, en Excel**: **GT1 a GT18**, el diagrama de Gantt (botón
>   **Gantt** del grupo Cronograma). El manifiesto cambió otra vez (0.9.0.0):
>   cierra Excel y repite `npm run stop` y `npm start`.
> - **Nuevo (06/10, tras tu ronda Q)**: **Q9 a Q26 reescritas** con la hoja,
>   la celda o la sección exacta de cada paso (repite **Q14, Q18, Q20 y Q21**,
>   que no se podían seguir) y **GT31 a GT33** (el Gantt carga a la primera,
>   fechas de fin bajo el Gantt, Configuración y Resultados unificados).
>   Antes de Q9, lee el recuadro **«Dónde está cada cosa»** al principio de
>   Q9.
> - **Nuevo (06/10)**: **R1 a R4** (correlaciones imposibles, P80,
>   percentiles configurables y modo compatible) y **GT19 a GT30** (el Gantt
>   con seguimiento, líneas base, rutas de holgura, riesgo, imprimir y
>   exportar). Usa un libro de cronograma nuevo: tiene hojas y columnas
>   nuevas.
>
> Lo demás de esta guía (bloques A–K, T, J, W, I) ya pasó en rondas
> anteriores: es referencia, no hace falta repetirlo.
>
> Anota **OK** o **Falla + qué ves** por código en tu Word de resultados y
> pásamelo con las capturas.

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
amarillo claro de «Pruebas» y «Zonas» vienen vacías: se rellenan todas con el
botón **Diagnóstico → «Rellenar las hojas de prueba»** (paso 2 de arriba), o
a mano, escribiendo lo que diga cada prueba.

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

- Si `git pull` se queja de los archivos `tests/fixtures/fidelidad-tanda7.xlsx`,
  `fidelidad-tanda8.xlsx` o `fidelidad-lambda.xlsx` (porque los guardaste en
  Excel), descarta tu copia y vuelve a hacer el pull:

  ```
  git checkout -- tests/fixtures/fidelidad-tanda7.xlsx tests/fixtures/fidelidad-tanda8.xlsx tests/fixtures/fidelidad-lambda.xlsx
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

> **06/10: corregido el cierre de Excel al cargar el complemento** (el menú
> del clic derecho estaba mal colocado en el manifiesto; ahora es 0.9.1.0).
> Tras el `git pull`, haz el arranque limpio de abajo una vez.

### Si Excel se cierra solo, no aparece la pestaña Riesgo o el panel dice «The service is unavailable»

*Añadido el 06/10.* Arranque limpio, en este orden:

1. Cierra Excel y termina los Excel que quedan ocultos:
   `taskkill /IM EXCEL.EXE /F` (si dice que no hay ninguno, bien).
2. `npm run stop`
3. Borra la caché de complementos:
   `Remove-Item "$env:LOCALAPPDATA\Microsoft\Office\16.0\Wef\*" -Recurse -Force`
4. `npm run revisar`. Tiene que decir **OK** en las dos líneas. Si falla
   en los certificados: `npx office-addin-dev-certs install` (acepta el
   aviso de Windows). Si dice que el **puerto 9090 está ocupado por otro
   programa** (por ejemplo, «The service is unavailable»), ejecuta
   `netstat -ano | findstr :9090` y `tasklist /FI "PID eq N"` con el número
   de la última columna, y mándame lo que salga.
5. Arranca el servidor **solo**, en esta ventana: `npm run dev-server`.
   Espera a `Local: https://localhost:9090/` y déjala abierta.
6. En Edge abre `https://localhost:9090/taskpane.html`: debe verse el panel
   (con un aviso de que falta Excel), sin aviso de certificado.
7. Abre **otra** ventana de PowerShell, ve a la carpeta del proyecto y
   ejecuta `npm start`. Excel se abre con la pestaña **Riesgo**.

Si Excel se vuelve a cerrar en el paso 7, al abrirlo responde **No** a
«modo seguro», ve a Archivo → Opciones → Complementos → Administrar:
**Complementos COM** → Ir, desmarca los que no sean de Microsoft, y repite
desde el paso 1. Anota en qué paso se rompe y qué texto sale.

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
  (C5, C6 y C12 ya las escribió «Rellenar las hojas de prueba».)
- Cuenta, a ojo, **cuántos segundos** tardan en cambiar tras F9 y apúntalo
  (en N6 notaste que tardan): con la cifra decido si vale la pena
  optimizarlo.
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

**N32. Binomial negativa, umbral de RIESGO.SALIDA y fechas en la tabla**
(nuevo).
- **Ajuste**: en una hoja vacía escribe en A1:A20 estos conteos:
  `0 1 1 2 2 2 3 3 4 4 5 5 6 7 8 9 11 13 16 20` (uno por celda). Selecciónalos
  y ajusta. Esperado: aparece la **binomial negativa** (r ≈ 1,64; p ≈ 0,21),
  marcada como discreta, y es la **primera por error general**; la Poisson
  (λ = 6,1) queda muy por detrás.
- **Umbral**: tras F20 (C49 con `RIESGO.SALIDA("Coste total")`, sin marcarla
  en el panel), en Resultados elige «Coste total» y pon un umbral. Esperado:
  sale su probabilidad y **no** aparece el aviso de resultados
  desactualizados. Cierra y abre el panel: el umbral sigue ahí.
- **Fechas en la tabla**: tras T9 (C52 con fecha incierta), pestaña Modelo,
  «Todas las entradas»: la distribución de C52 se lee en **fechas** (y la
  desviación en días), no en números de serie como 46.388. Lo mismo en la
  hoja volcada.

**N33. LAMBDA: Peng-Robinson** (F1 del plan, nuevo). Necesita **Excel 365**
(LAMBDA no existe en Excel 2019 ni antes). Abre, desde la carpeta del
proyecto, `tests\fixtures\fidelidad-lambda.xlsx`
(ruta completa: `C:\Users\danal\Documents\Proyectos Claude\riesgo-montecarlo-v2\tests\fixtures\fidelidad-lambda.xlsx`).
Si Excel pregunta por habilitar la edición, sí.
- **Fórmulas → Administrador de nombres**: 11 nombres. `R_GAS` (una
  constante), `TC_CO2`, `PC_CO2`, `W_CO2` (celdas) y siete LAMBDA:
  `PR_KAPPA`, `PR_ALFA`, `PR_A`, `PR_B`, `PR_P` (la presión), `PR_Z` y
  `FACTREC` (un factorial recursivo, para ver que el motor lo manda al
  compatible).
- **Hoja «Fidelidad»**: la columna E es lo que calcula Excel y la F, lo que
  calculé en Python sin Excel. Tienen que coincidir en todas las filas con
  «Python: …» (L-013, la presión: **40,286**). L-020 y L-021 deberían dar
  **#¡VALOR!** y L-022 **#¡CALC!**: anota lo que salga, sea lo que sea. Si
  alguna celda da **#¿NOMBRE?**, dímelo con captura: sería que Excel no
  reconoció la LAMBDA tal como la escribí en el archivo.
- **Hoja «PengRobinson»**: B11, B12 y B13 son la misma presión calculada con
  una LAMBDA con nombre, con una LAMBDA dentro de LET y con una LAMBDA
  invocada en la celda. Las tres, **40,286** (como la columna C). B14 (Z),
  **0,782**; B15 (gas ideal), **51,55**; B16, **−21,8 %**.
- **Guarda el libro** (Ctrl+G) tal cual y mándamelo: con él se activan las
  pruebas que comparan el motor con tu Excel.
- **Simula** (con el libro ya guardado, puedes seguir en él): escribe
  `=RIESGO.NORMAL(310;5)` en B8 y `=RIESGO.TRIANGULAR(0,45;0,5;0,6)` en B9.
  Marca B11, B12 y B13 como salidas y simula 10.000 iteraciones. Esperado:
  - «Cómo se calculó» dice motor **Rápido** (las LAMBDA ya no mandan al
    compatible).
  - Las tres salidas, **iguales**: media en torno a **39,4 bar**, desviación
    **2,06**, p5 ≈ **36,0** y p95 ≈ **42,7**.
  - En «Qué la mueve más», **B9 (el volumen) es la que más mueve la presión**
    y con signo negativo (ρ ≈ −0,87: más volumen, menos presión); la
    temperatura, positiva y menor (ρ ≈ 0,47).
  - Si luego quieres dejar el libro como estaba para mandármelo otra vez,
    no hace falta: con el que guardaste antes de simular me basta.

**N34. La cinta nueva** (U3.2, nuevo). **El manifiesto cambió**: cierra
Excel, `npm run stop`, `npm start`; si la pestaña Riesgo sigue como antes,
borra la caché (`%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\`) y repite.
- Esperado, de izquierda a derecha: **Panel** (Modelo, Resultados,
  Configuración) · **Celdas** (Marcar entrada, Marcar salida, Quitar
  resaltado) · **Simulación** (Iteraciones ▾, Simular) · **Modo del libro** ·
  **Análisis** (Ver distribución, Ajustar a datos, Escenarios) · **Informes**
  (Volcar a una hoja, Informe PDF) · **Ayuda** (Ayuda, Ejemplos ▾,
  Diagnóstico).
- **Iteraciones ▾**: elige **5.000** y simula: «Cómo se calculó» dice 5.000.
  Vuelve a abrir el menú: **5.000 aparece desactivado** (si no se desactiva,
  apúntalo: es lo que depende de tu versión de Excel). «Otra cantidad…» abre
  Configuración.
- **Ejemplos ▾ → Presupuesto de obra**: se crea la hoja con el modelo, sin
  abrir el panel.
- **Ayuda**: se abre una ventana con «Cómo empezar», «La cinta» y «Qué
  significa cada cosa».
- **Volcar a una hoja** e **Informe PDF** desde la cinta hacen lo mismo que
  los botones de Resultados.
- **Escenarios** abre Resultados y baja hasta la sección Escenarios.

**N35. Explorador de distribución** (U3.1, nuevo). Simula la demo (hoja
«Modelo», con su salida). Selecciona la celda de la salida y pulsa **Ver
distribución**.
- Esperado: una **ventana aparte** con el histograma a la izquierda y las
  estadísticas a la derecha (media, desviación, mínimo, máximo, p1 a p99,
  VaR, CVaR, asimetría, curtosis). Las mismas cifras que en Resultados.
- **Arrastra** los dos delimitadores: los porcentajes de arriba cambian (por
  debajo, entre y por encima). También se pueden escribir en «Desde» y
  «Hasta». «Acumulada» cambia a la curva.
- **Sin cerrar la ventana**, selecciona en la hoja una entrada (celda
  amarilla): la ventana pasa a esa entrada (dice «Entrada» y su
  distribución, con la curva teórica en rojo encima). Selecciona una celda
  cualquiera: aparece arriba el aviso de que no es una entrada ni una
  salida, y se queda lo anterior.
- Vuelve a simular con la ventana abierta: se actualiza sola.
- Apunta si la ventana se puede mover y cambiar de tamaño, y si en la Web
  sale igual (W).

**N36. Ajustar a datos desde la cinta** (U3.2, nuevo). En «Pruebas»,
selecciona **K5:K44** (los precios históricos) y pulsa **Ajustar a datos**.
- Esperado: el panel se abre en Modelo con «Ajustar a datos» arriba, ya con
  los 40 datos leídos y las distribuciones propuestas.
- Selecciona una celda vacía (por ejemplo **C70**) y pulsa **Usar** en la
  primera: C70 se marca como entrada con esa distribución y se abre su
  detalle.

**N37. Catálogo de distribuciones** (U3.3, nuevo). Abre una entrada del
panel (▸) y pulsa **«¿Cuál elegir? Ver el catálogo»**.
- Esperado: las distribuciones en fichas, cada una con su forma pequeña y
  una línea de cuándo usarla, en seis grupos («Sé el mínimo, el más probable
  y el máximo», «Varía alrededor de un valor central»…). La actual, marcada.
- Pulsa **Lognormal**: el catálogo se cierra, la entrada pasa a lognormal y
  su vista previa cambia. Dime si los grupos te sirven para elegir o si
  cambiarías alguno.

**N38. Entradas y salidas** (U3.4, nuevo). Con la demo simulada, pulsa en
la cinta **Entradas y salidas** (grupo Análisis).
- Esperado: la ventana del explorador en su pestaña **«Entradas y
  salidas»**: dos tablas con todas las entradas (las del panel y las de
  funciones RIESGO, marcadas «· función») y todas las salidas, con su
  distribución o su valor más frecuente, y media, p5 y p95.
- Pulsa una fila: Excel **selecciona esa celda** y la ventana pasa a la
  pestaña «Distribución» con esa entrada o salida.
- Arreglo de paso: una función RIESGO dentro de una suma en una celda con
  fecha (escribe en una celda vacía con formato de fecha
  `=FECHA(2027;1;1)+RIESGO.NORMAL(90;10)` y márcala como salida) aparece en
  la lista como `Normal(90; 10)` (días), no como una fecha de 1900.

**N39. Clic derecho y Detener** (U3.5, U3.6, nuevo).
- **Clic derecho** en una celda de la hoja «Modelo»: aparece
  **«Riesgo Monte Carlo»** con **Marcar como entrada**, **Marcar como
  salida** y **Ver distribución**. Marca una entrada así: se pinta de
  amarillo y el panel no se abre. «Ver distribución» sobre una salida ya
  simulada abre el explorador.
- En la cinta, **Detener** está gris. Pon **100.000** iteraciones y simula:
  mientras simula, **Detener** se activa y **Simular** se pone gris. Pulsa
  Detener: la simulación para y Resultados dice «cancelada». Al terminar,
  vuelven como estaban. (Si no se activan o desactivan, apúntalo: depende de
  tu versión de Excel, y Detener funciona igual pulsándolo.)

**N40. Contingencia** (V1, nuevo). Con el libro en **Valores fijos**, simula
la demo (hoja «Modelo»). En Resultados, en la salida, sección
**«Contingencia»** (abierta).
- Esperado: «Valor base X»: el número que enseñaba la celda de la salida
  antes de simular (compruébalo en la hoja). La probabilidad de cumplirlo y
  una tabla con 50 %, 80 % y 90 % de confianza.
- Arriba, **coste o plazo / beneficio**: se propone por el nombre (un VAN o
  unos ingresos, beneficio; un coste o una fecha de fin, coste). Cámbialo: la
  tabla pasa de «Reserva sobre el base» (P50, P80, P90) a «Por debajo del
  base» (P50, P20, P10). Cierra y abre el panel: la elección se mantiene.
- En la hoja «Pruebas», con «Coste total» (C49) y los riesgos de las filas
  57–59: es el caso típico de presupuesto. Marca C59 como salida: dime si la
  reserva al P80 te parece razonable.
- Pon **Aleatorio** y simula: la sección dice que no hay valor base.
  Vuelve a **Valores fijos**.
- **Volcar a una hoja**: sección «CONTINGENCIA FRENTE AL VALOR BASE».
  **Informe PDF**: la misma tabla en cada salida.

**N41. Matriz de probabilidad e impacto** (V2, nuevo). En «Pruebas», con
los riesgos de las filas 57–58 (T10), marca C59 como salida y simula. En
Resultados → **Registro de riesgos**, debajo de la tabla, **«Probabilidad e
impacto»**:
- Esperado: una cuadrícula 5 × 5 de colores (verde, amarillo, naranja,
  rojo). «Retraso de permisos» (30 %, impacto medio 30.000) en **Media ×
  Muy alto**; «Avería grave» (10 %, 50.000) en **Baja × Muy alto**. Los dos,
  severidad **Alta**.
- **Volcar a una hoja**: en el registro, una columna «Severidad» coloreada y
  la cuadrícula con los números de cada riesgo. **Informe PDF**: la misma
  matriz.
- Dime si las bandas (probabilidad < 10 %, 10–30 %…; impacto frente al mayor
  del registro) encajan con cómo clasificas los riesgos en tu trabajo, o si
  prefieres fijar los umbrales de impacto en pesos.

**N42. Ejemplo de cronograma** (nuevo). Cinta → **Ejemplos ▾ → Cronograma
de obra** (el manifiesto cambió: si no aparece, `npm run stop`, `npm start`
y reabre Excel).
- Esperado: una hoja «Cronograma» con nueve actividades (duración, inicio,
  fin), el retraso por lluvias en la fila 16 y, abajo, «Fecha de entrega» y
  «Duración total». Con Valores fijos, las fechas salen con las duraciones
  medias.
- Simula: «Duración total» con media en torno a **249 días** y «Fecha de
  entrega» en fechas (en torno al 08/10/2027). Pon en la fecha de entrega el
  umbral «por debajo de» **06/09/2027**: la probabilidad sale muy baja (en
  torno al 3 %). Mira también el Registro de riesgos (lluvias) y la
  Contingencia.
- Para presentar: abre con doble clic
  `ejemplos\cronograma-obra-animado.html` (la versión animada del mismo
  cronograma).

**N5. Todo lo demás sigue igual.** Repite rápido A6 (simular), F3 (RIESGO en
«Pruebas»), T2 (ahora la **zona sale en el tornado**, en gris, y la lectura
dice que es lo que más mueve los ingresos) y W1–W5 en la Web.

---

## Q. Cronograma: ProjectLibre (Q1–Q4) y el análisis en Excel (Q5–Q26)

*Añadido el 05/10. No necesita Excel ni el complemento, y no bloquea el
resto de la guía: hazlo cuando puedas.* Antes de escribir el motor de
cronograma (QRSA, fase Q1) quiero saber si mis fechas coinciden con las de un
programa de cronogramas de verdad. Como no tienes MS Project, uso
ProjectLibre, que es gratuito y lee el mismo formato XML.

**Preparación**
1. En PowerShell, en la carpeta del proyecto:
   `git pull origin claude/nifty-thompson-xfnqm2`. Los archivos quedan en
   `tests\fixtures\qrsa\`.
2. Descarga e instala ProjectLibre desde su página oficial
   (projectlibre.com). El instalador de Windows ya trae lo que necesita para
   funcionar.

**Q1. Abrir cada cronograma.** En ProjectLibre: Archivo → Abrir, y elige
`R1-simple.xml` (luego `R2-relaciones.xml` y `R3-calendario.xml`). Si
pregunta cómo importarlo, acepta lo que propone. El proyecto empieza el
lunes 04/01/2027.

**Q2. Poner las columnas.** En la tabla de tareas deben verse Inicio, Fin y
Holgura total. Si falta la holgura: clic derecho en el encabezado de una
columna → Insertar columna → «Holgura total» (puede llamarse «Margen total»
o «Total Slack», según el idioma).

**Q3. Comparar** con el archivo `*-esperado.csv` del mismo nombre (se abre
con Excel o el Bloc de notas). Lo que espero:

| Cronograma | Qué prueba | Termina | Detalles para mirar |
|---|---|---|---|
| R1 | Solo fin–comienzo | 21/01/2027 | C y E con 4 días de holgura; el resto en 0 |
| R2 | Comienzo–comienzo, fin–fin, comienzo–fin, un desfase negativo, «no comenzar antes de» y «terminar no después de» | 25/02/2027 | G y H con holgura **−1**: la fecha límite del 24/02 no se cumple |
| R3 | Calendario con los festivos de Colombia de 2027 y un desfase de 7 días calendario (el curado) | 24/11/2027 | E termina el 05/08 y F empieza el 13/08; G con 5 días de holgura y C con 31 |

Un hito (duración 0, como M en R1 o J en R3) puede salir en ProjectLibre el
día anterior al del CSV: él lo pone al final del día en que termina su
predecesora y yo al comienzo del día laborable siguiente. Es la misma fecha.

**Q4. Mandarme el resultado.** Lo más cómodo, cualquiera de los dos:
- una captura de la tabla de cada cronograma con Inicio, Fin y Holgura
  total; o
- Archivo → Guardar como → formato XML de MS Project
  (`R1-projectlibre.xml`, etc.), y me adjuntas los tres archivos.

Dime también la versión de ProjectLibre (Ayuda → Acerca de). Si algo no
coincide, no lo corrijas a mano: mándamelo tal cual, y vemos si es un error
mío o una convención del programa.

### Q5–Q14. El análisis de riesgo de cronograma en Excel (fase Q1)

*Añadido el 05/10; actualizado con Q2 y Q3 el mismo día.* Antes: cierra
Excel, `git pull`, `npm install`, `npm run stop` y `npm start`. Si el grupo
Cronograma no aparece, borra la caché de
`%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\` y repite `npm start`. Usa un
**libro nuevo en blanco**.

**Q5. La cinta.** En la pestaña Riesgo hay un grupo **Cronograma** con tres
botones: Crear libro de cronograma, Revisar calidad y Simular cronograma.
En el panel hay una pestaña nueva, **Cronograma**.

**Q6. Crear el libro.** Pulsa **Crear libro de cronograma**. Esperado:
**diez** hojas nuevas (Config, Calendario, Actividades, Relaciones,
Incertidumbre, Riesgos, Impactos, Costos, Correlaciones, Ramas) con
encabezados azules y un ejemplo de obra de 14 actividades agrupadas en 4 resúmenes (filas «Resumen», que no entran en el cálculo). Comprueba:
- en Actividades, las columnas Tipo, Calendario y Restricción tienen lista
  desplegable; al elegir una celda de «Duración (días)» sale un mensaje de
  ayuda;
- en Calendario, dos calendarios (lunes a viernes y lunes a sábado) y, desde
  la columna J, los festivos de Colombia de cinco años (por ejemplo, el
  22/03/2027 San José y el 26/03/2027 Viernes Santo);
- en Costos, siete partidas (administración, interventoría, cimentación,
  estructura, grúa, fachada, acabados); en Correlaciones, un par (ADM–INT)
  y dos grupos;
- pulsar el botón otra vez en ese libro dice que ya tiene todas las hojas.

**Q7. Para comparar con mis números**: en Config pon la **Fecha de inicio**
04/01/2027 y la **Fecha meta** 31/01/2028 (si no, las fechas dependen del
lunes en que creaste el libro). Deja el **Costo meta** en 5.600.000.000.

**Q8. Revisar calidad.** Esperado: 1 en rojo («Duraciones mayores de 44
días laborables»: B y E) y 1 en amarillo («Desfases positivos»: 2 de 16
relaciones). La correlación sale en verde (3 definidas) y «Actividades sin
incertidumbre» también: Instalaciones (G) toma el rango de la fila «WBS 3».

**Dónde está cada cosa** (vale para todo el bloque Q y GT):
- **Hojas del libro**: las pestañas de abajo en Excel (Config, Actividades,
  Costos, Riesgos…). Las celdas se dan como «Config!B4» = hoja Config,
  columna B, fila 4.
- **Panel**: la ventana de la derecha (Riesgo → Modelo la abre). Arriba
  tiene las pestañas **Modelo · Resultados · Cronograma · Diagnóstico** y el
  engranaje **⚙** (Configuración).
- **Pestaña Cronograma** del panel: los botones (Crear, Revisar calidad,
  Simular cronograma, Ver Gantt, Importar), la calidad y el Gantt compacto.
- **Pestaña Resultados** del panel: desde el 06/10, al terminar de simular
  el cronograma el panel **salta solo a Resultados**, que empieza con el
  título **«Resultados del cronograma»** y debajo, en este orden, las
  secciones: Fin del proyecto · Costo del proyecto · Fecha y costo a la vez
  · Antes y después de mitigar · Riesgos: tornado por eliminación ·
  Actividades más críticas · Rutas críticas más frecuentes · Cronograma
  ajustado · **Avisos de la simulación y correlación lograda** (cerrada:
  pulsa el ▸ para abrirla) · botones Informe ejecutivo (PDF) e Iteraciones
  en CSV.
- **Iteraciones, semilla y muestreo del cronograma**: en **⚙ → Simulación
  del cronograma** (o en Config!B4, B5 y B6: es lo mismo). La sección
  «Simulación» de más abajo en ⚙ es la del modelo de celdas RIESGO, no la
  del cronograma.

**Q9. Simular cronograma.** Comprueba en **⚙ → Simulación del cronograma**
que dice **5 mil**, semilla **12.345** e **Hipercubo latino**. Vuelve a la
pestaña **Cronograma** y pulsa **Simular cronograma**. Mientras simula dice
«Simulación: … de 5.000 iteraciones» y después «tornado y antes/después de
mitigar: vuelta 1 de 6…» (son repeticiones para el tornado, no más
iteraciones). Al terminar, el panel pasa a **Resultados**. Esperado
**exacto**:

| Dónde (pestaña Resultados) | Qué | Valor |
|---|---|---|
| Debajo del título | Iteraciones | «5000 iteraciones · semilla 12345 · hipercubo latino» |
| Fin del proyecto | Fecha determinística | 22/11/2027 |
| Fin del proyecto | Probabilidad de cumplirla | 5,08 % |
| Fin del proyecto | Probabilidad de cumplir la meta (31/01/2028) | 65,3 % |
| Fin del proyecto | P50 · P80 | 18/01/2028 · 16/02/2028 |
| Fin del proyecto | Media y desviación | 257 días ± 24,8 |
| Costo del proyecto | Costo base · P80 · contingencia | 5.034.578.244 · 5.598.359.651 · 563.781.406 COP |
| Costo del proyecto | Probabilidad de cumplir el costo meta | 80,1 % |
| Fecha y costo a la vez | JCL | 58,6 % |
| Riesgos: tornado | Barras (baja el P80) | R1 8 d, R2 6 d, R3 3 d, R4 0 d |
| Riesgos: tornado | Texto debajo | «Sin ningún riesgo, el P80 sería 260,2 días…» |
| Fin del proyecto, tabla de percentiles | P80 de «Obra gris terminada» | 20/12/2027 |
| Rutas críticas más frecuentes | La primera | 62,8 % |

En la pestaña **Cronograma** queda un aviso verde: «Simulado: 5000
iteraciones. Los resultados están en la pestaña Resultados». Anota cuántos
segundos dice la última línea de Resultados.

**Q10. La hoja de resultados.** En Excel, abre la hoja
**Resultados_Cronograma** (se crea o se rehace en cada simulación). Arriba,
«Supuestos de la corrida»: Versión del complemento **0.9.0**, Iteraciones
5.000, Semilla 12345, Muestreo Hipercubo latino. Debajo: advertencias con
su color, fin e hito con P10 a P90, costo, JCL, pre/post, rutas,
correlación pedida y lograda, cronograma ajustado P50/P80, tornado con
columnas de costo, índices por actividad y convergencia. A la derecha,
**tres gráficos** (curva S del fin, curva S del costo y dispersión
costo–fecha).

**Q11. Un error lleva a su celda.** Escribe **−2** en **Actividades!E5**
(duración de B, Licencia de construcción) y pulsa **Revisar calidad** en la
pestaña Cronograma. Esperado: un recuadro rojo «Hay que corregir el
cronograma» con «Actividades, E5: La duración tiene que ser un número mayor
o igual que 0». Pulsa el enlace «Actividades, E5»: Excel selecciona E5.
Vuelve a escribir **45**.

**Q12. Cambiar el calendario.** En **Actividades!F9** (calendario de E,
Estructura) elige «Lunes a viernes» en la lista y pulsa **Simular
cronograma**. Esperado en Resultados → Fin del proyecto: la fecha
determinística pasa de 22/11/2027 a **03/12/2027**. Vuelve a poner «Lunes a
sábado» en F9.

**Q13. Desde la cinta, con el panel cerrado.** Cierra el panel (la ✕ de
arriba a la derecha) y pulsa **Simular cronograma** en la cinta (Riesgo →
grupo Cronograma). Esperado: se abre el panel, simula y termina en
**Resultados** con las cifras de Q9.

**Q14. Cambiar las iteraciones y cancelar.** En **⚙ → Simulación del
cronograma** pulsa **50 mil** (Config!B4 pasa a 50000). Ve a la pestaña
Cronograma, pulsa **Simular cronograma** y, a mitad de la barra, **Cancelar**.
Esperado: «Simulación cancelada.» Vuelve a **⚙** y pulsa **5 mil**.

### Q15–Q26. Costo, mitigación, importación y lo avanzado (fases Q2 y Q3)

Sigue en el mismo libro, con inicio 04/01/2027 y meta 31/01/2028. Cada
prueba que cambia algo dice cómo dejarlo como estaba: hazlo antes de la
siguiente, o las cifras no coincidirán.

**Q15. Antes y después de mitigar.** Simula (pestaña Cronograma → Simular
cronograma) y en **Resultados → Antes y después de mitigar** comprueba: el
P80 del fin pasa de 16/02/2028 a 04/02/2028 (gana 12 días de calendario, 8
laborables) y la probabilidad de cumplir la meta de 65,3 % a 76,1 %; el
costo P80 **sube** un poco (5,6 a 5,62 mil millones) porque las
mitigaciones cuestan más de lo que ahorran. Dos curvas S: la continua es
«Esta simulación» y la punteada «Post mitigación».

**Q16. Costo por tiempo.** En la hoja **Costos**, fila 2 (ADM,
Administración): cambia **E2** de 2500000 a **3500000** y simula. Esperado
en **Resultados → Costo del proyecto**: Costo base **5.252.578.244 COP**
(218 millones más: 1.000.000 × 218 días). Ahora cambia también **H2, I2 y
J2** (mínimo, más probable y máximo) sumándoles 1.000.000 a cada uno y
simula otra vez: el costo base no cambia, pero el **P80** y la
**probabilidad de cumplir el costo meta** sí (bajan del 80,1 % a un 43 %
aprox.). Devuelve E2, H2, I2 y J2 a lo que tenían.

**Q17. Correlación imposible.** En la hoja **Correlaciones**, debajo del
par ADM–INT, escribe tres filas en las columnas A, B y C:
`D` `E` `0,9` · `E` `H` `0,9` · `D` `H` `-0,9` (la última **negativa**).
Simula. Esperado: no falla. En **Resultados → Avisos de la simulación y
correlación lograda** (ábrela con ▸) salen cuatro avisos: tres «La
correlación entre D y E está dos veces (0,5 y 0,9); se usa 0,9» (porque D,
E y H ya están en el grupo «Obra húmeda» con 0,5, en Correlaciones!E2:G2)
y uno «Las correlaciones entre D, E, H no pueden darse a la vez; se usó la
matriz posible más cercana (Higham): el coeficiente que más cambió, 0,4».
En la tabla de debajo, D–E dice Pedida 0,9 y Aplicada 0,5. Borra las tres
filas.

**Q18. Factor por grupo.** Sirve para dar una misma incertidumbre a varias
actividades sin escribir una fila por cada una. Pasos:
1. En **Actividades!J7** (columna Grupo, fila de C, Adecuación del
   terreno) escribe `Siembra`.
2. En la hoja **Incertidumbre**, borra la fila 4 (la de C): clic derecho
   en el número 4 → Eliminar.
3. En la primera fila vacía de Incertidumbre escribe: A `Grupo Siembra`,
   B `Triangular`, C `90`, D `100`, E `200`, F `% de la base`.
4. Pestaña Cronograma → **Revisar calidad**.

Esperado: en «Calidad del cronograma», «Actividades sin incertidumbre
asignada» sale en **verde** («Todas las tareas tienen una distribución»).
Para comparar, si solo haces el paso 2 (sin la fila del grupo), sale en
amarillo: «1 de 11 tareas (9 %) con duración fija: C». Deshaz los tres
cambios (Ctrl+Z o a mano).

**Q19. Riesgo como actividad insertada.** En la hoja **Riesgos**, celda
**L4** (columna Modo, fila de R3), elige «Actividad insertada» y simula.
Esperado: en la hoja **Resultados_Cronograma**, tabla «Índices por
actividad», aparece una fila **R3@D · Riesgo R3: Suelo más blando de lo
previsto (tras D)**. Vuelve a poner «Extiende actividades» en L4.

**Q20. Ramificación.** Una rama es una decisión que aún no se conoce: en
cada iteración se sortea una opción y solo cuentan sus actividades. Antes
de nada, anota de Resultados el P50, el P80 y la probabilidad de la meta
(18/01/2028, 16/02/2028, 65,3 %). Después, en la hoja **Ramas**, filas 2 y
3, columnas A a D:

| A Rama | B Opción | C Probabilidad | D Actividades |
|---|---|---|---|
| Licencia | Trámite normal | 70 % | B |
| Licencia | Ya aprobada | 30 % | C |

Simula. Esperado en Resultados: **Fin del proyecto** P50 · P80 =
**27/12/2027 · 07/02/2028** y probabilidad de cumplir la meta **75,2 %**
(antes 65,3 %): en el 30 % de las iteraciones no hay trámite de licencia.
En **Actividades más críticas**, B baja de 84 % a **59 %** de criticidad y C
sube de 0 % a **24 %**. Cambia C3 a **40 %** y simula: sale el error «Las
opciones de la rama «Licencia» suman 110 %; tienen que sumar 100 %». Borra
las dos filas.

**Q21. Iteraciones automáticas.** En **⚙ → Simulación del cronograma**
pulsa **Automático** (Config!B4 pasa a «Automático») y simula. Esperado: en
Resultados, justo debajo del título, un aviso verde «Iteraciones
automáticas: el P80 se estabilizó con 2.000 iteraciones (cambió 0,36 % en
el último bloque)», y la línea de iteraciones dice 2000. Vuelve a **5 mil**.

**Q22. Informe ejecutivo.** Al final de Resultados pulsa **Informe ejecutivo
(PDF)**: se abre en el navegador con supuestos, advertencias, fecha de fin,
costo, JCL, pre/post, los riesgos, las actividades más críticas y las
rutas; «Imprimir o guardar como PDF» lo deja en A4.

**Q23. CSV.** Al final de Resultados pulsa **Iteraciones en CSV**: se
descarga `iteraciones-cronograma.csv` (5.000 filas, separado por «;», se
abre con Excel).

**Q24. Importar de MS Project.** Pestaña Cronograma → **Importar MS Project o
P6…** y elige, en la carpeta del proyecto,
`tests\fixtures\qrsa\R2-relaciones.xml`. Esperado: «MS Project XML: 7
actividades, 1 hito, 9 relaciones, 1 calendario; empieza el 04/01/2027».
Pulsa **Empezar de cero** y simula: Resultados → Fin del proyecto, fecha
determinística **25/02/2027**. Prueba también **Reemplazar** con
`R3-calendario.xml`: como Incertidumbre y Riesgos remiten a las actividades
de antes, salen errores con su celda (eso es lo esperado).

**Q25. Importar de Primavera P6.** En un **libro nuevo en blanco**, pestaña
Cronograma → Importar → `tests\fixtures\qrsa\R1-simple.xer` → Crear las
hojas, y simula: fecha determinística **21/01/2027**.

**Q26. Un libro de una versión anterior.** Solo si tienes un libro de
cronograma creado antes del 05/10 (sin Costos, Correlaciones ni Ramas): el
primer botón dice **Añadir las hojas que faltan** y las añade vacías. Si no
tienes ninguno, márcala «no aplica».

### V3 y V4. Comparar en el explorador y asistente de juicio experto

*Añadido el 05/10.* En el libro de demostración (o cualquiera con entradas y
salidas del panel).

**V4a. El asistente.** En la pestaña Modelo, abre una entrada y pulsa
**Asistente: dígamelo en palabras**. Escribe mínimo 1000, máximo 1600 y
más probable 1200, con «Podría salirse de ese rango 1 de cada 10 veces».
Esperado: «… 1.000 y 1.600 se toman como el P10 y el P90: una Trigen que en
realidad va de 789,5 a 1.869», con la forma debajo. Pulsa **Usar esta
distribución**: el desplegable pasa a Trigen con esos valores.

**V4b. Las otras respuestas.** Con «Nunca bajaría del mínimo ni pasaría
del máximo» propone una PERT entre 1000 y 1600. Marca «No sé cuál es lo más
probable»: con extremos firmes propone una uniforme; con «1 de cada 10», una
Trigen centrada en 1300 y un aviso. Con mínimo mayor que máximo, dice por
qué no se puede.

**V3a. Comparar con otra salida.** Con al menos dos salidas, simula y abre
**Ver distribución** sobre una de ellas. Arriba del gráfico aparece
**Comparar con**: elige la otra salida. En el histograma sale una línea
roja con su forma (a la misma escala) y, debajo, una tabla «Esta /
Comparada / Diferencia» con media, desviación, p5, p50 y p95. En
**Acumulada**, las dos curvas (la comparada, punteada).

**V3b. Comparar con un escenario.** En Resultados guarda la simulación como
escenario «Base», cambia una entrada, vuelve a simular y abre el
explorador: en **Comparar con** aparece «La misma salida en un escenario ·
«Base»». Elígelo y selecciona otra salida en la hoja: sigue comparando con
«Base» (ahora con esa salida).

### GT1–GT18. Diagrama de Gantt (fases G1 y G2)

*Añadido el 05/10.* **El manifiesto cambió (0.9.0.0, botón nuevo)**: cierra
Excel y repite `npm run stop` y `npm start`. Usa el libro de cronograma del
ejemplo con **Fecha de inicio 04/01/2027** y **Fecha meta 31/01/2028** en
Config (como en Q5); si cambiaste algo del ejemplo, crea uno nuevo. Las
cifras de abajo salen de ese ejemplo, calculadas con el mismo motor.

**GT1. El botón y la vista compacta.** En el grupo Cronograma de la cinta
hay un botón nuevo, **Gantt**. Abre antes la pestaña Cronograma del panel:
sin revisar ni simular aparece **Diagrama de Gantt** con las barras de las
18 filas, los nombres a la derecha, los resúmenes como corchetes negros y
las flechas. Rojo es crítica, naranja casi crítica (E y G), azul el resto
(C e I).

**GT2. La ventana.** Pulsa **Gantt** en la cinta (o **Ver Gantt** en el
panel). Se abre la ventana flotante en la pestaña **Gantt** (la misma
ventana del explorador: Office deja una sola). Esperado en la línea de
estado: «Ruta crítica: holgura total ≤ 0 · 10 críticas · fin 22/11/2027 ·
meta 31/01/2028» y «18 filas · 16 vínculos · calculado en … ms». En la
tabla: E con holgura total 1 y G con 5 (naranjas), C con 31 e I con 30.
Anota cuántos ms dice y en qué Excel (Windows, Mac o Web).

**GT3. Escala de tiempo.** **Ajustar todo** enseña el proyecto entero.
Prueba **−**, **+**, el desplegable (Años, Trimestres, Meses, Semanas,
Días) y **Ctrl + rueda** sobre el diagrama. En Semanas o Días se ven
sombreados los sábados, domingos y festivos (por ejemplo el lunes
11/01/2027, Reyes). Hay líneas punteadas grises en el inicio y el fin,
morada en la meta y verde continua en hoy. **Hoy** lleva a la fecha de hoy.

**GT4. Flechas y tooltip.** Pasa el ratón por la barra de H: tooltip con
fechas 09/08/2027 – 27/09/2027 (35 d), holgura 0, «Predecesoras: F CC+5d».
Pasa el ratón por la flecha de F a H: «F → H · CC +5 días», holgura de la
relación 0, impulsora. La flecha sale del **comienzo** de F (CC) y la de E
a F (FC+7 días calendario) del **final** de E. Las flechas impulsoras entre
críticas son rojas; C → D (holgura 31) es gris.

**GT5. Las dos definiciones de ruta crítica.** Cambia **Crítica:** a
**Ruta más larga**. Esperado: 11 críticas, ahora también E. Es el caso que
explica la especificación: E va en el calendario de lunes a sábado y le
queda un sábado de holgura, pero es la que de verdad impulsa el fin.
Vuelve a «Holgura total ≤ 0».

**GT6. Filtros, búsqueda y plegar.** «Solo ruta crítica» deja las 10
críticas (sin resúmenes); «Crítica + casi crítica», 12. Vuelve a «Todas».
Escribe `H` en **Buscar** y Enter: selecciona H. Pulsa ▾ junto a «Obra
gris»: sus cuatro hijas se pliegan.

**GT7. ¿Por qué es crítica? y ruta impulsora.** Selecciona H y abre
**Diagnóstico** en Detalles: «No tiene holgura: cualquier retraso mueve el
fin del proyecto. Su inicio lo fija F (CC+5d); a su vez fija el inicio de
M.» Selecciona E: «Tiene 1 días de holgura. Su inicio lo fija D (FC); a su
vez fija el inicio de F, I.» Selecciona L y pulsa **Ruta impulsora hacia
aquí**: quedan resaltadas 11 actividades (INI, A, B, D, E, F, H, M, J, K,
L) y el resto atenuado; «quitar» lo deshace. Con M resalta 8. Prueba
también **Aguas arriba** y **Aguas abajo**.

**GT8. Editar en la tabla y deshacer.** Doble clic en la duración de E
(Estructura), escribe 60 y Enter. Esperado: «Duración de E: escrito en las
hojas», fin 02/12/2027, y en la hoja **Actividades** la duración de E es
60. Pulsa **Ctrl+Z** (o ↶): «Deshecho: Duración de E», fin 22/11/2027 y la
hoja vuelve a 50. **Ctrl+Y** lo rehace; deshazlo otra vez.

**GT9. Un ciclo se rechaza.** Doble clic en Predecesoras de A, escribe
`INI; L` y Enter. Esperado: «Hay un ciclo en las relaciones: B → D → E →
F → G → J → K → L → A → B» en rojo, y **nada** cambia en Relaciones. Prueba
también `INI; ZZ` (no existe) y `INI;;X?!` (no se entiende).

**GT10. Restricción al mover una barra.** Arrastra el centro de la barra
de G unas semanas a la derecha y suelta: sale un aviso amarillo «Mover G
al … fija la restricción «No comenzar antes de» …». Pulsa **Cancelar**: no
cambia nada. Ahora en Detalles → General de G elige «No comenzar antes de»,
escribe 01/09/2027 y **Aplicar**. Esperado: fin 07/12/2027, G pasa a roja
(holgura 0) y aparece una marca morada al comienzo de su barra; en la hoja,
Restricción y su fecha llenas. Deshaz.

**GT11. Duración arrastrando y vínculo arrastrando.** Arrastra el borde
derecho de la barra de C (el cursor cambia a ↔): al soltar cambia su
duración. Deshaz. Pon el ratón justo a la derecha de la barra de C (cursor
de cruz) y arrastra hasta la **mitad izquierda** de la barra de I: se crea
C → I fin–comienzo («E; C» en Predecesoras de I y una fila nueva en
Relaciones). Si sueltas en la mitad derecha, sale FF. Repetirlo dice «Ya
existe un vínculo de C a I». Clic en esa flecha, **Supr**: se borra.
Deshaz lo que quede.

**GT12. Insertar, borrar, sangría y mover.** Selecciona D y pulsa **+
Tarea**: aparece N1 «Nueva actividad» con WBS 2.3 (E pasa a 2.4, F a 2.5)
y una marca (⚠ o !) en la primera columna (sin predecesora ni sucesora). Deshaz.
Selecciona B y pulsa **⇥** (aumentar sangría): B queda 1.1.1 y A pasa a
resumen; en Calidad, «Vínculos a actividades resumen» se pone en rojo con
«INI → A, A → B, A → C». Deshaz. Prueba ↑/↓ con una actividad y **Borrar**
(pide confirmación; borra también sus vínculos y su incertidumbre). Deshaz
todo hasta volver a 18 filas y fin 22/11/2027.

**GT13. Fecha límite y holgura negativa.** En Detalles → General de L,
escribe en **Fecha límite** 01/11/2027 y sal del campo. Esperado: L con
holgura −14 y la ruta en barras rojas rayadas con borde oscuro, una flecha
azul hacia abajo sobre L (roja si se incumple) y en Diagnóstico: «Tiene
holgura negativa (-14 días) por L (fecha límite)…». Deshaz.

**GT14. Calidad con semáforo.** Abajo, «Calidad del cronograma» con 1
rojo y 2 amarillos: rojo «Duraciones largas» (B, E); amarillos «Desfases
positivos» (2 de 16) y «Proporción de actividades críticas» (10 de 14, 71
%). Pulsa un criterio con actividades: las resalta en el diagrama. Las
filas señaladas llevan ⚠ o ! en la tabla (con el tooltip del criterio).

**GT15. Deshacer protegido.** Cambia una duración desde el Gantt. Luego,
en Excel, inserta a mano una fila en Relaciones (o cambia una celda de
Actividades) y pulsa Ctrl+Z en el Gantt. Esperado: «Las hojas … cambiaron
fuera del Gantt después de esa edición: no se puede deshacer con
seguridad», sin tocar nada. **Releer hojas** trae lo que cambiaste a mano.

**GT16. Cálculo manual.** Pulsa **Cálculo automático** (pasa a manual) y
cambia una duración: se escribe en la hoja, pero el diagrama sigue igual y
dice «Hay cambios sin recalcular (F9)». **F9** o **Recalcular** lo
actualiza. Vuelve a automático.

**GT17. Con la simulación.** Simula el cronograma (panel o cinta) con el
Gantt abierto: se refresca solo y aparecen las columnas «P80 fin (QRSA)» y
«Criticidad (QRSA)» y, sobre cada barra, el rango P10–P90 del fin con una
marca en el P80. «Columnas y capas» deja quitar o poner columnas y capas;
el ancho de las columnas y de la tabla (el divisor) se ajusta arrastrando y
se recuerda.

**GT18. Excel para la Web y Mac.** Si puedes, repite GT2, GT8 y GT11 en
Excel para la Web: la ventana va dentro de la página. Anota si se ve
entera y si los arrastres responden.

### R1–R4. Pendientes pequeños, percentiles (C6) y modo compatible (F3)

*Añadido el 06/10.* En el libro de demostración.

**R1. Una correlación imposible ya no impide simular.** En la pestaña
Modelo, abre la **Matriz de correlaciones** con tres entradas y pon 0,9
entre la 1.ª y la 2.ª, 0,9 entre la 2.ª y la 3.ª y −0,9 entre la 1.ª y la
3.ª. Esperado: bajo la matriz, un aviso «…no pueden darse a la vez (son
contradictorias): se usa la combinación posible más cercana — «A»–«B» 0,90
→ …», con los coeficientes que se usan. Simula: simula, y el mismo aviso
sale arriba en Resultados. Deja las correlaciones como estaban.

**R2. El P80 en «¿Bastan las iteraciones?».** Simula con 1.000
iteraciones. El recuadro de precisión de cada salida dice ahora «la media
se conoce con ±… y el P80 con ±…»; si no bastan, las iteraciones que pide
cuentan también el P80. Con **Simular hasta alcanzar la precisión**
(Configuración), las tandas siguen hasta que la media y el P80 cumplen.

**R3. Percentiles configurables (C6).** En Configuración (⚙), sección
**Percentiles**: pon Bajo p10, Alto p90 y en Adicionales `2,5; 97,5`.
Simula. Esperado: las cifras grandes dicen «p10» y «p90» (no p5 y p95), la
tabla de salidas y la comparación con un escenario también; en el informe
PDF los delimitadores del histograma van en p10 y p90 (10 % · 80 % · 10 %);
en la hoja volcada, la tabla de percentiles incluye p2,5 y p97,5, en orden.
Escribe `120` en Adicionales: dice qué está mal y no lo guarda. Vuelve a
p5 y p95.

**R4. Modo compatible más rápido (F3).** En Configuración elige el motor
**Compatible** y simula 1.000 iteraciones del libro de demostración.
Anota cuánto tarda (arriba en Resultados) y compáralo con lo que tardaba
antes (prueba H2 de la ronda del 29/09): el primer viaje a Excel lleva 20
iteraciones y los siguientes se ajustan para durar unos 0,7 s, así que
debería ir igual o más rápido, con los mismos resultados que el motor
rápido. Vuelve a **Automático**.

### GT19–GT30. Gantt: seguimiento, líneas base, rutas, riesgo, exportar (fase G3)

*Añadido el 06/10.* **El libro de cronograma tiene una hoja nueva,
Lineas_Base, y columnas nuevas en Actividades** (Comienzo real, Fin real, %
completado, Duración restante) **y en Config** (Fecha de corte, Lógica del
avance): un libro de antes muestra en el panel **Añadir las hojas que
faltan**; para las columnas, lo más fácil es crear un libro nuevo con el
ejemplo. Inicio 04/01/2027 y meta 31/01/2028, como en GT1.

**GT19. Rutas de holgura.** En el Gantt, abre **Columnas y capas** y marca
**Colorear por ruta de holgura**; añade la columna **Ruta n.º**. Esperado:
ruta 1 (roja) INI, A, B, D, E, F, H, M, J, K y L; ruta 2 G; ruta 3 I; ruta
4 C.

**GT20. Riesgo en el Gantt.** Pulsa **Correr QRSA** en la ventana: el panel
simula el cronograma y el Gantt se actualiza solo. Esperado: columnas
Criticidad, P80 fin y **P(cumplir el hito)**; junto a los hitos, su
probabilidad: M 8 % y L 5 % (la de cumplir su fecha del cronograma). En
**Columnas y capas**, **Mapa de calor de criticidad** colorea de azul (nunca
crítica) a rojo (siempre): E 80 %, G 22 %, C 0 %. Pon en L una fecha límite
31/03/2028: su probabilidad pasa a ser la de cumplir esa fecha (más del 90
%) y el tooltip dice «(fecha límite)». Quítala.

**GT21. Fecha de corte y avance.** En la hoja **Config** escribe Fecha de
corte 01/03/2027. En el Gantt (columnas «Comienzo real», «Fin real» y «%
completado», que aparecen al haber fecha de corte), registra: INI comienzo
y fin real 04/01/2027; A comienzo 04/01/2027 y fin real 12/02/2027; B
comienzo real 15/02/2027 y 40 %. Esperado: fin 12/11/2027, 9 críticas,
una línea naranja punteada en el 01/03/2027 (la fecha de corte, distinta
de la verde de hoy). A queda «terminada» (barra azul clara, sin holgura ni
crítica); B «en curso», del 15/02 al 09/04/2027 (37 días: lleva 10 y le
faltan 27 desde el corte) con una franja oscura del 40 %; C, que no ha
empezado, empieza el 01/03/2027 (nada pendiente antes de la fecha de
corte). El resumen S1 sale en curso con un 66 %.

**GT22. Lógica retenida o anulación por progreso.** Registra en D (que
depende de B) comienzo real 22/02/2027 y Duración restante 10. Esperado: en
Calidad, «Avance fuera de secuencia: D empezó antes de que terminara una
predecesora fin–comienzo…»; con lógica **Retenida** (la de por defecto en
Config) lo que le falta a D espera a B: D termina el 23/04/2027 y el
proyecto el 25/10/2027. Cambia en Config **Lógica del avance** a
«Anulación por progreso» y pulsa **Releer hojas**: D termina el 12/03/2027
y el proyecto el 14/09/2027. Vuelve a «Retenida» y borra el avance de D.

**GT23. Fechas inválidas.** Escribe en C un fin real 10/03/2027 (posterior
al corte): Calidad dice en rojo «Fechas reales después de la fecha de
corte: C…». Bórralo.

**GT24. Línea base.** Con el avance de GT21, pulsa **Guardar línea base**
(LB1). En la hoja **Lineas_Base** aparecen el comienzo y el fin de cada
actividad. Cambia la duración de E a 60. Esperado: fin 29/11/2027, una
barra gris delgada bajo cada barra (la línea base), la columna «Variación
(d)» con E +10 (en rojo) y L +10, y en Calidad: «BEI … 2 de 2 … BEI 1,00» y
«CPLI … Faltan 184 días laborables por la ruta crítica y el fin va 9 días
después del de la línea base: CPLI 0,95». Elige **Línea base: Ninguna**:
desaparecen la barra gris y esas columnas. Deshaz el cambio de E.

**GT25. Hasta tres líneas base.** Elige **Línea base: LB2**, pulsa
**Guardar línea base** y luego otra vez: la segunda pregunta si
reemplazarla. Cambia entre LB1 y LB2 en el desplegable.

**GT26. Filtros, orden y vistas.** Prueba los filtros nuevos («Solo
hitos», «Con alertas de calidad», «En curso», «Sin terminar»), **Hasta el
nivel 1** (solo los resúmenes y el hito INI) y **Por holgura total** (orden
temporal: la hoja no cambia). En **Vistas**, escribe un nombre y **Guardar
la vista actual**; cambia filtros y columnas y vuelve a ella con un clic.
Cierra la ventana y ábrela otra vez: la vista sigue ahí.

**GT27. Imprimir y PDF.** Pulsa **Imprimir y exportar…**: se abre en el
navegador el Gantt paginado. Elige A3 horizontal o A4 vertical: cambia el
número de páginas. Cada página lleva título, fechas, la escala de tiempo
repetida y «Página n de N»; la leyenda va en la última. **Imprimir o
guardar como PDF** → «Guardar como PDF».

**GT28. PNG, MS Project y CSV.** En la misma página: **Imagen (PNG)**
descarga todo el Gantt en una imagen; **MS Project (XML)** un archivo que
abre ProjectLibre (o MS Project) con las mismas actividades, vínculos,
calendarios, fechas límite y avance; **Tabla (CSV)** la tabla, que Excel
abre con acentos y fechas bien.

**GT29. Importar avance.** Importa en un libro nuevo el XML de GT28: el
avance (comienzo y fin reales, %), las fechas límite y la fecha de corte
(la de estado del archivo) llegan a las hojas.

**GT30. Muchas actividades.** Si tienes un cronograma grande (cientos de
actividades), impórtalo y abre el Gantt: anota cuánto dice «calculado en …
ms» y si el desplazamiento va fluido.

### GT31–GT33. Arreglos y mejoras de la ronda del 06/10

En el libro de cronograma del ejemplo (inicio 04/01/2027, meta 31/01/2028).

**GT31. La ventana carga a la primera.** Con Excel recién abierto, pestaña
Cronograma del panel → **Ver Gantt**. Esperado: en uno o dos segundos se ve
el Gantt; ya no se queda en «Leyendo el cronograma…» hasta cambiar de
pestaña.

**GT32. Fechas de fin posibles bajo el Gantt.** Simula el cronograma
(pestaña Cronograma → Simular cronograma); el panel pasa a Resultados: al
final, junto a «Iteraciones en CSV», pulsa **Ver Gantt**. Pulsa
**Ajustar todo**. Esperado: debajo de las barras, una franja **«Fechas de
fin posibles»** con una barra por semana, en el mismo eje de fechas que el
Gantt (al desplazar a izquierda o derecha se mueve con él). Azules las
semanas hasta la meta, naranjas las de después; líneas punteadas P50 y P80
y una morada «Meta». El texto de la izquierda dice «5.000 iteraciones · cada
barra, una semana · P50 18/01/2028 · P80 16/02/2028 · Meta 31/01/2028:
probabilidad de cumplirla 65,3 %», la misma de Resultados. La casilla
«Fechas de fin posibles» la oculta y la vuelve a mostrar.

**GT33. Configuración y Resultados unificados.** Con el libro de cronograma
abierto, **⚙** muestra arriba **«Simulación del cronograma»** con 5 mil,
semilla 12.345 e Hipercubo latino. Pulsa **1 mil**: en Excel, Config!B4
pasa a 1000. Simula: el panel salta a **Resultados**, que empieza con
«Resultados del cronograma» y «1000 iteraciones · semilla 12345 · hipercubo
latino». Si en el mismo libro simulas también el modelo (pestaña Modelo →
Simular), arriba de Resultados aparece «Ver los resultados de: Modelo ·
Cronograma» para pasar de uno a otro. Vuelve a **5 mil**.

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
  - **«Volcar a una hoja»**: sección **REGISTRO DE RIESGOS** tras el
    resumen de las salidas, con probabilidad en %, esperado, parte del
    total y una fila **Total** (14.000). **«Informe PDF»**: la misma tabla,
    tras «Entradas inciertas».
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
- **I3.** `tests\fixtures\fidelidad-lambda.xlsx` (LAMBDA, 23 casos; es N33).

Después haz el `git checkout -- …` de la preparación para que no te den
conflicto en el próximo pull.
