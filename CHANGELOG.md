# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico. Las etapas (E0, E1, …) son las de `docs/FASE3_ROADMAP.md`.

## [No publicado]

### Etapa 1: nombres legibles (E5), elegir la salida (E6) e informe del proyecto (C7) (2026-09-27)

**Añadido**
- **Las celdas marcadas nacen con un nombre legible**: el texto de su
  izquierda («Precio unitario») en vez de «Modelo!C5». En una tabla por años,
  con números en medio, se añade la celda: «Flujo de caja libre (H28)». Sin
  texto a la izquierda, el de encima. Se usa en el panel, el tornado, la araña,
  el informe y el volcado (`excel/nombreSugerido.ts`, `etiquetasEnExcel.ts`).
- Las entradas que vienen de funciones `RIESGO.*` también se nombran así.
- **«Poner nombres desde la hoja»** para los modelos marcados antes, cuyas
  celdas aún se llaman como su referencia.
- **Elegir la salida en Resultados** (E6): con varias salidas, una tabla
  resumen arriba (media, p5, p50, p95 y el umbral) y un selector que enseña
  una cada vez o todas. Se elige pulsando una fila o **seleccionando la celda
  de la salida en la hoja** (`excel/seleccionActiva.ts`, ExcelApi 1.2).
- **Informe PDF del proyecto** (C7): título y descripción del proyecto en
  Configuración (se guardan en el libro, campo opcional `project` del
  modelo); encabezan el PDF y la hoja volcada. Cada salida lleva una
  **lectura en palabras** generada con reglas (rango del 90 %, probabilidad del
  umbral, qué la mueve más, si bastan las iteraciones), también en el panel
  (`excel/lectura.ts`). Las entradas `RIESGO.*` salen con su nombre legible.

### Segunda ronda de pruebas en Excel (C2–W) y tandas 7 y 8 (2026-09-27)

**Verificado en Excel**
- Tandas de fidelidad 7 (LET, 14/14) y 8 (matrices, 27/27) calculadas por
  el Excel del usuario y ya en las pruebas. El único desacuerdo (T8-012) era
  del lector: Excel guarda `#CALC!` como «valor enriquecido» y escribe
  `#VALUE!` para lectores antiguos. `tests/helpers/leerFidelidad.ts` lee ahora
  `xl/richData`.
- Las 3 fórmulas de `Caso_practico.xlsx` (`SUMAPRODUCTO(H42:DC42/H45:DC45)` y
  similares) calculan bien y van por el motor rápido (prueba nueva).

**Corregido**
- **Funciones RIESGO en Excel para la Web** (W5): el servidor de desarrollo
  no enviaba `Access-Control-Allow-Origin` en `funciones.json` y
  `funciones.js` (ese middleware va antes que los encabezados de Vite).
  Pendiente de confirmar en la Web.
- **Una salida que nunca da un número** (G3, un FILTRAR de nombres) enseñaba
  «mínimo ∞, máximo −∞» y un tornado de ceros; ahora un aviso claro, también
  en el PDF.
- **«Restaurar funciones RIESGO»** (J4) sale arriba de la pestaña Modelo, y
  como botón, cuando el libro está preparado para compartir.

### Primera ronda de pruebas en Excel (A1–E4) (2026-09-27)

**Corregido**
- **Un error de guardado no se podía quitar del panel.** Una triangular con
  el máximo por debajo de la moda llegaba a guardarse, fallaba, y el aviso
  rojo se quedaba aunque se corrigiera. Ahora el editor no guarda una
  distribución inválida: la deja como borrador con un aviso al lado
  (`problemaDeDistribucion`). El recuadro de error tiene ✕ y se borra solo
  cuando el siguiente guardado sale bien.
- **Los parámetros se leen en formato español**: «23.000» es veintitrés mil
  (antes, 23), y se muestran con coma decimal. «0.054» sigue siendo 0,054.
- **«Referencia sin resolver» al simular una salida que depende de una
  `RIESGO.*`** que no está en el panel (Modelo!C32 con =RIESGO.NORMAL en
  C5). Las entradas de funciones se descubren después de resolver las
  referencias del panel, y preparar la simulación pedía resolverlas otra vez.
  `resolverConFunciones` (excel/entradasRiesgo.ts) y una prueba con un
  resolvedor estricto como el de Excel.
- **El tornado salía en blanco en el PDF**: el navegador no imprime fondos
  por defecto; ahora `print-color-adjust: exact`. La primera salida ya no
  empieza en una página nueva, y el tornado y la araña van lado a lado.

**Guía de pruebas**
- Bloque E rehecho: todo en la hoja «Pruebas», con aviso de reabrir el libro
  si se escribió en «Modelo», y una E5 nueva (RIESGO dentro del modelo
  grande). Nota sobre `npm start` en C4.

**Plan**
- Mejoras propuestas por el usuario registradas: C7 (PDF con datos del
  proyecto), C8 (hoja volcada legible), E5 (nombres legibles automáticos),
  E6 (elegir la salida en Resultados), E7 (administrador de escenarios), E8
  (color para celdas RIESGO), F4 (núcleos en automático según el tamaño).

### Arreglo: el panel se quedaba en blanco dentro de Excel (2026-09-27)

**Corregido**
- **El panel parpadeaba y se quedaba en blanco en Excel** (primera prueba
  del usuario). Office.js anula `history.replaceState`, y el panel lo
  llamaba al montar para recordar la pestaña: el error desmontaba React.
  Ahora se guarda el original antes de cargar Office.js y se usa con
  protección (`ui/fragmento.ts`). Reproducido y verificado en Chromium
  imitando a Office.js. No se vio antes porque el banco de pruebas corre en
  un navegador normal, donde la función existe.

**Añadido**
- **Red de seguridad del panel** (`ui/ErrorPanel.tsx`): si algo falla al
  pintarse, se muestra el mensaje de error y un botón para recargar, en vez
  de un panel en blanco.

### Plan: motor de ajuste de distribuciones (2026-09-27)

**Plan**
- §1.2.1 del roadmap: conclusiones del segundo informe de competidores.
- Nuevo bloque **I** en §2.1: I1 (diagnóstico previo de los datos, AICc,
  Cramér–von Mises, histograma con densidad, Q-Q, gamma por MLE exacto,
  distribución empírica y `RIESGO.EMPIRICA`), I2 (error en percentiles con
  objetivo de cola, bootstrap, discretas) e I3 (avanzado). I1 va tras las
  pruebas, junto a C5.

### Fusión con el roadmap del estudio de mercado, y tres cosas antes de las pruebas (2026-09-26)

**Plan**
- Fusionada la revisión del roadmap con el estudio de mercado (§1.2: E4
  redefinida, E9a adelantada, E12, precio, rechazos). Se escribió sobre el
  estado del 23/09; sus tres primeras prioridades (tornado, ajuste, Web
  Worker) ya estaban hechas y se marcan como tales.

**Añadido**
- **«Preparar para compartir»** (E4 redefinida): convierte cada `RIESGO.*` en
  una entrada del panel y deja en la celda su media, para que quien abra el
  libro sin el complemento no vea `#¿NOMBRE?`. Guarda las fórmulas originales
  y **«Restaurar funciones RIESGO»** las devuelve. Aviso en Resultados si el
  libro usa funciones RIESGO.
- **AIC y BIC** en el ajuste de distribuciones (con la densidad de cada
  candidata), y selector «Ordenar por» AIC / BIC / Anderson–Darling. AIC por
  defecto: castiga los parámetros de más.

**Cambiado**
- **El flujo aleatorio de cada entrada va ligado a su celda** (H1): volver a
  marcar una celda ya no cambia los números con la misma semilla. Los
  resultados de una misma semilla cambian una vez respecto a versiones
  anteriores.
- Guía de pruebas ampliada: bloques J (compartir), K (reproducibilidad) y W
  (Excel para la Web y Mac).

### Guía de pruebas en Excel y hoja «Pruebas» (2026-09-24)

**Añadido**
- `docs/GUIA_PRUEBAS_EXCEL.md`: el paso a paso para probar todo en Excel con
  el libro de demostración, con un código por prueba (A1…I3) y el resultado
  esperado de cada una.
- El libro de demostración trae una hoja **«Pruebas»** para lo nuevo:
  funciones `RIESGO.*`, `LET`, matrices, derrame, entrada con fórmula en el
  modo compatible y 40 precios históricos para el ajuste a datos. Lo que la
  guía da como esperado está medido con el motor
  (`tests/unit/hojaPruebasDemo.test.ts`).

### Matrices en el motor rápido (2026-09-24)

**Añadido**
- **Funciones de matrices dinámicas** dentro de otra función que las consuma:
  `FILTRAR`, `ORDENAR`, `ORDENARPOR`, `UNICOS`, `SECUENCIA`, `TRANSPONER`,
  `MMULT`, `MINVERSA` (`=SUMA(FILTRAR(…))`, `=INDICE(ORDENAR(…); 1)`). Se
  calculan **por iteración**: un `FILTRAR` cuyo criterio depende de la
  simulación deja pasar filas distintas en cada una (las que pasan, arriba y
  en orden; el resto vacío).
- **Operaciones entre rangos dentro de funciones** y las **fórmulas
  matriciales clásicas**: `SUMA(A2:A9*B2:B9)`, `SUMAPRODUCTO((A2:A9>5)*B2:B9)`,
  `SUMA(SI(A2:A9>5; B2:B9))`, constantes `{1;2;3}`, con la difusión de Excel
  (fila contra columna; `#N/A` donde una no llega). Las funciones escalares
  (`SI`, `REDONDEAR`, `ABS`…) se aplican elemento a elemento en ese contexto.
- Lo que **derramaría** (una matriz que llega a la raíz de la fórmula) sigue
  yendo al modo compatible, con el motivo: las celdas derramadas no tienen
  fórmula propia y el motor rápido las tomaría por constantes.
- Octava tanda de fidelidad (`fidelidad-tanda8.xlsx`, 27 casos), escritos como
  fórmulas matriciales para que cualquier Excel las evalúe igual. Pendiente de
  calcular en Excel.

**Nivel 2**: 37/41 (quedan `LAMBDA`, `DIVIDIRTEXTO`, `FORMULATEXTO` y
`IMPORTARDATOSDINAMICOS`).

### Funciones RIESGO.* en las celdas (2026-09-24)

**Añadido**
- **`=RIESGO.NORMAL(100; 15)`** y otras once (LOGNORMAL, UNIFORME, TRIANGULAR,
  PERT, BETA, GAMMA, EXPON, WEIBULL, BERNOULLI, BINOMIAL, POISSON) escritas
  directamente en una celda la declaran entrada incierta, sin pasar por el
  panel, como en @RISK. Fuera de la simulación la celda muestra la **media**
  de su distribución, así que el libro calcula con normalidad.
- Se registran como funciones personalizadas de Excel (manifiesto 0.4.0.0):
  script de un solo archivo (`funciones.js`), página y metadatos
  (`funciones.json`) **generados del catálogo del motor**, para que no pueda
  haber en Excel una función que el motor no sepa simular.
- Al simular, las celdas `RIESGO.*` de las que depende alguna salida se suman
  a las entradas del panel (si una está en los dos, manda el panel y se
  avisa), salen en "Cómo se calculó", en el tornado, en el informe y en el
  volcado. Basta con tener una salida para simular.
- Solo argumentos numéricos escritos y la función como fórmula entera; lo
  demás (`=RIESGO.NORMAL(B2; 15)`, `=1+RIESGO.…`) se rechaza con la celda y el
  motivo. También se aceptan los nombres `RISK.*`.

**Corregido**
- **El modo compatible perdía la fórmula de las entradas que tenían una**:
  el guardián guardaba y restauraba solo el valor, así que una entrada con
  `=B2*1,1` quedaba convertida en un número tras simular. Ahora guarda la
  fórmula y la restaura.
- El motor ya no recorre lo que hay dentro de una celda de entrada (su
  fórmula y sus precedentes no se usan): una entrada con una función que el
  motor no conoce ya no manda la simulación al modo compatible.

### Informe PDF (2026-09-24)

**Añadido**
- Botón **"Informe PDF"** en Resultados: abre en el navegador del sistema un
  informe maquetado para A4 —cómo se calculó, entradas, y por cada salida el
  umbral, estadísticos, precisión, comparación con la referencia, histograma,
  curva acumulada, tornado y araña—, con un botón "Imprimir o guardar como
  PDF". Una salida por página al imprimir; siempre en claro en papel.
- Los datos viajan **comprimidos en el fragmento de la dirección** (`#d=…`,
  unos 4 kB por salida): el navegador no envía el fragmento a ningún
  servidor, así que no salen del equipo. Dentro de Excel se abre con
  `openBrowserWindow`, la vía oficial.

### Gráfico de araña y contribución a la varianza (2026-09-24)

**Añadido**
- **"Qué pasa si cada entrada se mueve"** (gráfico de araña): la media de la
  salida en cada décimo de cada entrada, en unidades de la salida, con las
  cuatro entradas de más efecto y su recorrido (±). Sale de la muestra ya
  simulada: no hace falta simular más.
- **Contribución a la varianza** en el tornado, por regresión sobre rangos
  (medida de Pratt): reparte bien el mérito entre entradas correlacionadas,
  donde el peso ρ² se equivoca. Y el **R²**: qué parte de la variación
  explican las entradas juntas; si es bajo, el panel avisa de interacciones o
  efectos no monótonos.
- Los dos van también al informe volcado.

### Panel de Configuración (2026-09-24)

**Añadido**
- **Configuración** con un botón ⚙ junto a las pestañas y un botón nuevo en la
  cinta (cuatro en total; manifiesto 0.3.0.0). Tres bloques:
  - **Rendimiento** (de este equipo, en el navegador): cuántos núcleos usar,
    "Automático (3 de 4)" o de 1 al total. No cambia ningún resultado.
  - **Simulación** (del modelo, en el libro): iteraciones con accesos
    rápidos (1 mil, 10 mil, 100 mil, 1 M) y cualquier otra cantidad entre 100
    y 10 millones; semilla, muestreo y motor. Salen de la pestaña Modelo, que
    queda con un resumen y un enlace.
  - **Precisión** (del modelo): margen objetivo ±0,5 / 1 / 2 / 5 %, y **simular
    hasta alcanzarlo**: por tandas (hasta 5) sin pasar de un tope. Cada tanda
    es una simulación completa con la misma semilla, así que el resultado
    final es el mismo que pidiendo esas iteraciones de entrada. Solo con el
    motor rápido; con Excel en el bucle se simulan las iteraciones fijadas y
    se dice.
- "Cómo se calculó" cuenta las tandas ("1.000 → 390.000 iteraciones") o
  avisa si no se alcanzó el margen con el tope.
- Con un solo núcleo elegido también se calcula en un hilo aparte, para que el
  panel no se congele.

**Medido** (Chromium, modelo de ejemplo con una lognormal muy dispersa,
±1 %): 1.000 → 390.000 iteraciones en 482 ms con 3 hilos.

### Ajustar una distribución a datos (2026-09-24)

**Añadido**
- En cada entrada, **"Ajustar a datos históricos…"**: se pegan los datos (una
  columna copiada de Excel, con coma decimal) o se leen de la selección, y se
  proponen las distribuciones que mejor los describen, de mejor a peor, con
  un botón **Usar**.
- Candidatas y estimación (`engine/modelo/ajuste.ts`): normal, lognormal y
  exponencial por máxima verosimilitud; gamma (Minka); Weibull (Newton);
  uniforme, triangular y PERT con extremos ampliados sin sesgo; beta por
  momentos si los datos están entre 0 y 1. Solo se proponen las que admiten
  los datos (nada positivo con datos negativos).
- Ordenadas por **Anderson–Darling** (pesa las colas) con K–S al lado, y la
  curva de la elegida sobre la escalera de los datos. Se dice que es una
  ordenación, no una prueba de aceptación.
- Parámetros redondeados a seis cifras significativas.

### Comparar escenarios (2026-09-24)

**Añadido**
- **"Fijar como referencia"** en Resultados, con un nombre ("Sin
  refinanciación"). Al cambiar el modelo y volver a simular, cada salida
  enseña una tabla frente a la referencia —media, desviación, p5, p50, p95 y
  la probabilidad del umbral— con la diferencia (actual − referencia), y la
  curva acumulada de la referencia punteada debajo de la actual, a la misma
  escala.
- La referencia se guarda en el libro (`riesgoMontecarlo.reference`) y
  sobrevive a cerrarlo. Las salidas se emparejan por id; una que no estaba en
  la referencia lo dice.
- El margen relativo de la precisión se muestra con sus cifras ("0,025 %").

### ¿Bastan las iteraciones? (2026-09-24)

**Añadido**
- Debajo de las estadísticas de cada salida: el **margen de la media al 95 %**
  (1,96·σ/√n), si es suficiente con un listón del 1 % y, si no, **cuántas
  iteraciones harían falta**. Con la media cerca de cero se mide contra la
  desviación.
- **Intervalos al 95 % de p5 y p95**, por la binomial, sin suponer forma.
- También en el informe volcado y en los resultados guardados.

### LET (2026-09-24)

**Añadido**
- **`LET`** en el motor rápido, resuelto al parsear sustituyendo cada nombre
  por su expresión (`engine/parser/let.ts`): ni el grafo, ni la elección de
  motor, ni los evaluadores necesitan conocerlo. Ámbitos como en Excel (cada
  nombre ve los anteriores, un `LET` anidado redefine dentro), mayúsculas
  indiferentes, y la forma del XML (`_xlfn.LET`, `_xlpm.x`).
- Tope de 20.000 nodos al expandir: una cadena que crece exponencialmente va
  al modo compatible con su motivo en vez de colgar el panel.
- Séptima tanda de fidelidad (`fidelidad-tanda7.xlsx`, 14 casos de `LET`),
  con el resultado del motor anotado. Pendiente de calcular en Excel.

**Nivel 2**: 29/41 (queda `LAMBDA`, las matriciales dinámicas y dos que
dependen de estructuras que no se leen).

### Los resultados se guardan en el libro (2026-09-24)

**Añadido**
- **Al reabrir el libro, la última simulación sigue ahí**: resumen,
  percentiles, curva, histograma, sensibilidad, motor, hilos y tiempo. Se
  guarda en `workbook.settings` (`riesgoMontecarlo.results`) al terminar cada
  simulación; como el modelo, sobrevive si se guarda el archivo.
- En lugar de las hasta 100.000 iteraciones por salida se guardan **1.001
  cuantiles** (unos 25 kB por salida): los umbrales se siguen calculando al
  escribir, con ±0,1 puntos, y el panel dice que son aproximados.
- **Aviso de resultados desactualizados** cuando el modelo cambia después de
  simular (distribuciones, celdas, iteraciones, semilla), tanto al reabrir
  como en la misma sesión. Cambiar solo un umbral no cuenta.
- El diagnóstico recorta los ajustes largos al enseñarlos.

**Corregido**
- Los ids de variables nuevas tienen 10 caracteres en vez de 6: la prueba de
  colisión fallaba una vez de cada ~170 ejecuciones.

### El motor rápido calcula en varios hilos (2026-09-24)

**Añadido**
- **Web Workers en el panel.** El motor rápido reparte los bloques entre
  hasta ocho hilos (los núcleos menos uno, que queda para Excel). El panel ya
  no se congela: el progreso avanza y cancelar responde mientras simula.
- **El modelo viaja una vez por hilo**; cada trabajo es solo un rango de
  iteraciones, y las muestras vuelven transferidas, sin copiarse
  (`engine/executor/pool.ts`, sin depender de ninguna API de hilos).
- **Misma semilla, mismo resultado** con uno o con ocho hilos: el troceo es
  fijo (al menos 16 bloques, `bloquesMinimos`) y los resultados se colocan por
  índice. Probado: estadísticas, t-digest y muestra idénticos bit a bit.
- Si el entorno no deja crear hilos, o uno no arranca, se calcula en el hilo
  del panel como antes. "Cómo se calculó" dice con cuántos hilos.

**Medido** (Chromium, 4 núcleos, modelo de ejemplo de 7 celdas, 1.000.000 de
iteraciones): 969 ms en un hilo, 715 ms con 3. En un modelo tan pequeño manda
el trabajo fijo (ordenar la muestra, la sensibilidad); la ganancia crece con
el tamaño del libro.

### Histograma, umbrales y botones en la cinta (2026-09-24)

**Añadido**
- **Probabilidad de superar un umbral**, arriba de cada salida: "probabilidad
  de quedar por debajo / por encima de X". Se contesta al escribir, se guarda
  en el modelo del libro (`outputs[].threshold`) y va al informe volcado.
- **Histograma** de cada salida (barras de Freedman–Diaconis, de 10 a 50). Con
  umbral, las barras del lado contado van en color: el área es la probabilidad.
  En el volcado, tabla y gráfico de columnas nativo.
- Los dos salen de la muestra retenida (exactos hasta 100.000 iteraciones;
  por encima, margen de ±0,3 puntos, y el panel lo dice).
- **Tres botones en la cinta**, pestaña Riesgo: Modelo, Resultados y
  Diagnóstico. Abren el panel en su pestaña; con el panel abierto, cambian de
  pestaña sin recargar (fragmento de URL + `hashchange`). Sustituyen a "Abrir
  panel". Versión del manifiesto: 0.2.0.0.
- La pestaña Resultados ya no está desactivada sin resultados: explica cómo
  obtenerlos.

**Para verlo en Excel** hay que volver a cargar el manifiesto: `npm run stop`
y `npm start`.

### Análisis de sensibilidad: el tornado (2026-09-24)

**Añadido**
- **Qué entrada mueve más cada salida.** Debajo de cada salida, un gráfico de
  tornado con la correlación de rangos de Spearman de cada entrada, ordenado
  de mayor a menor efecto: a la derecha las que la suben, a la izquierda las
  que la bajan. Las diez primeras, con acceso a la lista completa.
- El **peso** de cada entrada (ρ² normalizado), marcado como aproximado cuando
  hay entradas correlacionadas entre sí.
- La tabla de sensibilidad también se escribe en la hoja al volcar resultados.
- Funciona con los dos motores. Se calcula sobre las primeras 100.000
  iteraciones (error típico de ρ ≈ 0,003); el motor retiene solo los valores de
  las salidas y regenera las entradas, que con un generador de contador salen
  idénticas.

**Confirmado**
- El modelo sobrevive a guardar, cerrar y reabrir el libro (verificado por el
  usuario en su Excel).

### La sexta tanda vuelve de Excel: 69 de 69 a la primera (2026-09-23)

Las once funciones nuevas del Nivel 1 coinciden con Excel en todos los casos,
incluidos los bordes de calendario. Quedan verificados, entre otros:
- `DIAS360` estadounidense **no** aplica la regla de "los dos fines de
  febrero": del 29-feb-2024 al 28-feb-2025 son 358, no 360 (`FRAC.AÑO` base 0
  sí la aplica y da 1).
- `SIFECHA(...;"MD")` desde un 31 da −1: el fallo que Microsoft documenta.
- `FECHANUMERO` en español entiende día/mes, años de dos cifras, `ago` y
  `agosto`, e ignora la hora; un 31 de febrero es `#¡VALOR!`.
- `DIA.LAB` con 0 días desde un sábado devuelve el propio sábado.
- `CAMBIAR` no distingue mayúsculas; con la expresión en error, propaga el error.
- `TEXTO(5;"0 kg")` es `#¡VALOR!`: confirma la regla de que una letra que no
  es un código invalida el formato.

### El resto del Nivel 1: 11 funciones más, y la sexta tanda (2026-09-23)

**Añadido**
- `MAX.SI.CONJUNTO` y `MIN.SI.CONJUNTO`: sin coincidencias devuelven 0.
- `SI.CONJUNTO` (ninguna cierta → `#N/A`) y `CAMBIAR` (valor por defecto si
  sobra un argumento; comparación como el operador `=`).
- `BUSCAR`, en forma vectorial y matricial (más ancha que alta: busca en la
  primera fila; si no, en la primera columna).
- Funciones de calendario en `engine/functions/calendario.ts`: `DIAS360`
  (estadounidense y europeo), `FRAC.AÑO` (bases 0–4), `SIFECHA` (Y, M, D, YM,
  YD, MD, con el fallo conocido de MD), `DIA.LAB`, `DIAS.LAB` (con festivos) y
  `FECHANUMERO` (día/mes o mes/día según el idioma, meses con nombre).
- Sexta tanda del libro de fidelidad (`tests/fixtures/fidelidad-tanda6.xlsx`,
  69 casos), con el resultado del motor anotado en cada caso.

**Pendiente a propósito**
- `DESREF`: referencia dinámica. Es lo único que falta del Nivel 1 (43/44).

### La quinta tanda vuelve de Excel: TEXTO, corregido en tres puntos (2026-09-23)

32 de 36 coincidieron a la primera. Las cuatro diferencias eran tres
suposiciones mías sobre el Excel en español, y las tres estaban al revés:

- **`aaaa` es el nombre del día, no el año.** `TEXTO(fecha;"dd/mm/aaaa")` da
  `23/09/miércoles`. `aaa` y `aaaa` son los códigos de día de la semana de
  Excel; `a` y `aa` sueltas se escriben tal cual; y el año se escribe con `y`
  también en español.
- **Una letra que no es un código invalida el formato**: `"Estándar"` es
  `#¡VALOR!`. Yo la escribía tal cual. (La regla se dedujo de un solo caso;
  queda anotado para la próxima tanda.)
- **AM/PM en español es `p. m.`, con un espacio duro** (U+00A0) entre las dos
  partes. Un espacio normal daría un texto que se ve igual y no es igual; se
  miró el XML para saberlo.

Los 36 pasan ahora. Verificados de paso: el redondeo del 1,005 (la trampa
binaria), el separador de miles como escala, las abreviaturas `sep` y `mié`,
y que un libro en español acepta los códigos en inglés.

### TEXTO, y el Nivel 2 de texto completo (2026-09-23)

**Añadido**

- **`TEXTO`** (`engine/functions/formato.ts`), la última función de texto que
  faltaba. Depende de la configuración regional por cuatro sitios, y por eso
  entra después de ella: la cadena de formato se lee con los separadores del
  libro (`"#.##0,00"` en español), el resultado sale con ellos (`1.234,50`),
  los códigos de fecha están traducidos (`aaaa`, y también `yyyy`) y los
  nombres de meses y días son del idioma (`miércoles 23 de septiembre`).
  Cubre secciones, `0`/`#`/`?`, miles y su uso como escala, porcentaje,
  científica, literales, colores, y fechas y horas. Las condiciones entre
  corchetes, las fracciones y el relleno devuelven `#¡VALOR!` en vez de un
  resultado inventado.
- **Quinta tanda del libro de fidelidad** (`tests/fixtures/generar-tanda5.py`),
  36 casos de `TEXTO` escritos en español, esperando a Excel. Los que no se
  pueden saber sin él: las abreviaturas de meses y días (Excel las toma de
  Windows), qué escribe en lugar de AM/PM, si acepta los códigos en inglés y
  cómo se llama el formato General.

**Corregido**

- Los separadores de miles después de los decimales (`"0,0.."`) también
  escalan. La primera versión solo los buscaba en la parte entera; lo cazó su
  test.

### La configuración regional (2026-09-23)

El Excel del usuario escribe `1,5` donde el motor escribía `1.5`. La cuarta
tanda del libro de fidelidad lo confirmó por tres sitios, y el caso N1-049
llevaba pendiente desde la segunda. **Los cuatro pasan ahora contra los valores
de su Excel**, sin que se rompa ningún otro caso.

**Añadido**

- `engine/values/regional.ts`: el separador decimal, el de miles y los nombres
  de los lógicos. Lo usan las cuatro conversiones por las que pasa todo el
  motor: número a texto (`1,5`), texto a número (`"1.234,5"` es 1234,5 y
  `"1234.5"` es `#¡VALOR!`), lógico a texto (`VERDADERO`) y texto a lógico.
  Los miles solo se aceptan **bien agrupados**: ser permisivo convertiría en
  número lo que Excel rechaza, y un número equivocado no se ve.
- Es un ajuste del módulo, no un argumento: la conversión ocurre en decenas de
  sitios y es el mismo valor durante toda la simulación. El coste es que **no
  cruza de un hilo a otro**, así que viaja con cada trabajo a los workers; hay
  una prueba con `worker_threads` reales de que llega.
- `excel/regional.ts` la lee de Excel (`application.cultureInfo`,
  `decimalSeparator`, `useSystemSeparators`), no la adivina del idioma: un
  Excel en español puede tener el punto como decimal. Se guarda con el modelo,
  como se decidió, y el diagnóstico la enseña.
- Los libros de fidelidad se evalúan ahora en español, que es como los calculó
  el Excel del usuario: comparar con otra configuración era comparar dos
  configuraciones, no dos motores.

### La cuarta tanda vuelve de Excel: el Nivel 2, verificado (2026-09-23)

**87 de 90 coinciden, y los 3 que no son exactamente los tres sondeos de
configuración regional que se pusieron a propósito.** Ningún fallo del motor en
el Nivel 2.

Quedan verificados contra Excel: las 25 funciones de texto —incluidas las
rarezas de `NOMPROPIO` tras un dígito, `ESPACIOS` con el espacio duro, `HALLAR`
con comodines, `CARACTER(128)` en la página de Windows—, `CONCAT` recorriendo
por filas, `SUBTOTALES` y `AGREGAR` **sin doble conteo**, la moda empatada, y
el `DIAS` que quedaba de la tercera tanda.

Los tres sondeos confirman el trabajo pendiente: en el Excel es-ES del usuario,
un decimal se escribe `"1,5"`, `VALOR("1234.5")` es `#¡VALOR!` y un lógico es
`"VERDADERO"`. Quedan documentados por id hasta que llegue la configuración
regional.

**Corregido**

- **El lector del libro de fidelidad perdía los textos que empiezan o acaban
  en espacio.** Excel los escribe como `<v xml:space="preserve">` y el lector
  solo reconocía `<v>` a secas, así que `UNIRCADENAS` —que Excel y el motor
  calcularon igual, `"a, , c, "`— aparecía como un fallo del motor. Es un
  fallo del instrumento de medida, y se miró el XML antes de tocar el motor.

### Nivel 2: texto, SUBTOTALES y AGREGAR (2026-09-23)

27 de las 41 funciones del Nivel 2. El motor pasa de 89 a **116 funciones**.

**Añadido**

- **Texto** (`engine/functions/texto.ts`): `LARGO`, `IZQUIERDA`, `DERECHA`,
  `EXTRAE`, `MAYUSC`, `MINUSC`, `NOMPROPIO`, `ESPACIOS`, `CONCATENAR`,
  `CONCAT`, `UNIRCADENAS`, `ENCONTRAR`, `HALLAR`, `SUSTITUIR`, `REEMPLAZAR`,
  `REPETIR`, `CARACTER`, `CODIGO`, `IGUAL`, `VALOR`, `VALOR.NUMERO`, `TIPO`,
  `N`, `T` e `HIPERVINCULO`. Rara vez están entre una entrada y una salida,
  pero basta una para mandar la simulación al modo compatible: 33 iteraciones
  por segundo en vez de 250.000. Si todos sus argumentos son invariantes —lo
  normal con texto—, se calculan una vez y se difunden.
- **`SUBTOTALES` y `AGREGAR` sin doble conteo** (`engine/functions/subtotales.ts`).
  Existen para que un total general sobre una columna con subtotales por
  capítulo no los cuente dos veces. Implementarlas sin eso sería peor que no
  implementarlas: el total saldría el doble, sin avisar. Cada columna que
  producen se apunta en un `WeakSet` y al leer un rango se salta; el ejecutor
  hereda la marca al difundir una constante, que era el sitio exacto donde
  podía perderse. `AGREGAR` además sabe ignorar errores y tiene sus 19
  funciones.
- **Cuarta tanda del libro de fidelidad** (`tests/fixtures/generar-tanda4.py`),
  90 casos, a la espera de volver calculada por Excel. Incluye tres sondeos de
  configuración regional a propósito y el `DIAS` pendiente de la tercera.

**Fuera, a propósito**

- **`TEXTO`**: su resultado depende de la configuración regional por cuatro
  sitios (decimal, miles, nombres de meses y días, y los separadores de la
  propia cadena de formato). En inglés daría un resultado distinto al de Excel
  en cada libro en español. Entra con la configuración regional.
- **Matriciales dinámicas** (`FILTRAR`, `ORDENAR`, `UNICOS`, `SECUENCIA`…):
  devuelven varias celdas, y el motor modela una celda por valor. Necesitan
  otro modelo, no otra función.
- **`LET` y `LAMBDA`**, que necesitan ámbitos en el evaluador; `IMPORTARDATOSDINAMICOS`
  y `FORMULATEXTO`, que dependen de estructuras que el motor no lee.

**Corregido**

- El escáner trataba cualquier función de Nivel 2 como bloqueante por su
  categoría, sin preguntar si estaba implementada.
- La moda de `AGREGAR` devolvía, en caso de empate, la primera en **alcanzar**
  el máximo al recorrer, no la primera en **aparecer**. Lo cazó su test.

### Los resultados se pueden guardar (2026-09-23)

**Añadido**

- **Volcado a una hoja del libro** (`excel/volcarResultados.ts`). Hasta ahora
  una simulación vivía solo en el panel y se perdía al cerrarlo: en modo
  compatible, tirar cinco minutos de espera; en cualquier modo, un análisis
  terminado que no se puede guardar, imprimir ni enviar. La hoja lleva el
  modelo entero —distribuciones y correlaciones incluidas—, la semilla, el
  motor, los estadísticos, los percentiles y **los puntos de la curva como
  datos**, con un gráfico **nativo de Excel** encima. No una imagen: así se
  puede reformatear, copiar a otra parte o rehacer. Quien abra el libro dentro
  de un año tiene que poder saber de dónde salieron esos números.
- **El panel dice si el modelo quedó guardado**, con la hora, y recuerda que
  hay que guardar el archivo para que sobreviva al cerrarlo. Son dos pasos y
  solo uno es nuestro: el complemento escribe el ajuste, y Excel lo mete en el
  `.xlsx` cuando el usuario guarda. Sin decirlo, los dos parecen uno.
- **`guardarModelo` relee lo que acaba de escribir** y avisa si Excel no se lo
  devuelve. Un `settings.add` que no persiste es indistinguible de uno que sí,
  salvo que alguien mire.
- **Diagnóstico → «Lo que hay guardado en este libro»**: enseña en crudo los
  ajustes del complemento. Cuando alguien dice "no se guardó nada", esto
  convierte la conversación en un dato.
- Las correlaciones se ven desde la ficha plegada (`· 1 correlación(es)`) y se
  menciona cómo llegar a ellas. Estaban a dos clics de profundidad y el usuario
  las buscó sin encontrarlas.

**Corregido**

- El resaltado de la hoja podía pintarse **dos veces por cambio**: el efecto
  estaba dentro del actualizador de estado de React, que puede invocarse dos
  veces. Ahora la comparación va en una referencia, fuera.

**Estructura**

- `excel/informe.ts` y `excel/tiposLectura.ts` separan de la capa de Office lo
  que son datos puros. Es la misma regla que ya separó `direcciones.ts` de
  `rangos.ts`: en cuanto un archivo nombra un tipo del espacio `Excel`, ningún
  test puede importar nada que dependa de él ni de lejos.

### El modo compatible, medido: 33 iteraciones por segundo (2026-09-23)

El último número que faltaba de la fase de pruebas, y no se podía obtener sin
Excel delante: **10.000 iteraciones en 5 min 4 s** en una máquina real
(Windows, modelo de 63 celdas). La auditoría del motor heredado suponía ~93
it/s; era casi tres veces optimista. De paso quedan confirmadas las otras dos
incógnitas del modo: Excel recalcula de verdad antes del `sync`, y el cambio a
cálculo manual funciona sin permisos extra.

Lo que implica, y por qué obliga a cambiar la interfaz:

|  iteraciones |  motor rápido |  compatible |
|-------------:|--------------:|------------:|
|       10.000 |         40 ms |       5 min |
|      100.000 |        400 ms |      51 min |
|    1.000.000 |          ~4 s |       8,4 h |

**Añadido**

- Al elegir el motor compatible, el panel enseña **antes de simular** el ritmo
  medido y lo que va a tardar, y avisa si pasa de media hora. Si el libro no se
  ha medido todavía, hay un botón que lo mide en unos segundos corriendo unas
  pocas iteraciones de verdad. El ritmo se guarda en el libro: es una propiedad
  de este modelo en esta máquina, y no hay que volver a medirlo.
- `medirRitmoEnExcel` existía desde que se construyó el modo compatible y no
  estaba conectado a nada. Ahora lo usa el panel, que era su razón de ser: sin
  esto, el usuario pulsa Simular y descubre la espera a los cinco minutos.

### Las correlaciones, por fin alcanzables (2026-09-23)

El motor las aplica desde la Fase 2 (Iman–Conover, con sus grupos y su matriz)
y hasta hoy solo se podían declarar editando a mano el JSON del modelo: una
capacidad entera, construida y probada, que el usuario no podía usar.

No es un adorno estadístico. Simular el precio y las unidades como
independientes supone que las unidades pueden caer mientras el precio sube,
igual de a menudo que cualquier otra combinación. Rara vez es cierto, y el
error va **siempre en la misma dirección**: la independencia diluye el riesgo,
porque los malos escenarios de una variable se compensan con los buenos de la
otra. El p5 sale mejor de lo que es, y el p5 es justo el número en el que
alguien se apoya para decidir.

**Añadido**

- `ui/EditorCorrelaciones.tsx`: un deslizador y un número por pareja, dentro de
  la ficha de cada entrada. El deslizador porque un coeficiente es una
  intuición ("van bastante juntos"); el número porque quien venga de un estudio
  con un 0,62 tiene que poder escribirlo. Debajo, lo que significa en palabras.
- **La simetría se escribe, no se pide**: cada cambio actualiza las dos
  entradas a la vez, así que la contradicción "0,6 en una y 0,3 en la otra" no
  se puede ni teclear.

**Corregido**

- **Una matriz de correlación imposible ya no revienta a mitad de la
  simulación.** "A va con B, B va con C, y A va al revés que C" no describe
  ninguna realidad, y hasta ahora salía como una excepción de Cholesky —para el
  usuario, un fallo del programa—. Ahora se detecta antes de empezar y se dice
  con los nombres de los implicados.
- **Quitar una entrada se lleva las correlaciones que la nombraban.** Si no,
  quedaban apuntando a un identificador inexistente y el modelo dejaba de poder
  guardarse, con un mensaje sobre un id que el usuario nunca ha visto.
- La distribución sugerida al marcar una celda ya no enseña
  `0,11000000000000001`: la basura binaria de multiplicar por 1,1 se limpia
  antes de proponerla.

### Resaltado en la hoja, libro de demostración, y el hueco más viejo cerrado (2026-09-22)

**Añadido**

- **`excel/resaltado.ts`**: las entradas se pintan de amarillo en la hoja y las
  salidas de verde. El relleno anterior de cada celda se guarda en el propio
  libro, así que quitarlo la deja exactamente como estaba —incluido "sin
  relleno", que no es lo mismo que blanco—. No se tocan bordes ni fuentes.
- **`ejemplos/demo-proyecto-aurora.xlsx`** y su generador: el flujo de caja a
  cinco años de una empresa ficticia, con instrucciones de qué celdas marcar y
  qué resultado debería salir. Probar sobre un libro del usuario mezcla dos
  incógnitas; este lo conocemos los dos.

**Corregido**

- **Una salida no numérica ya no envenena las estadísticas.** Con la `TIR` como
  salida, unas 3 de cada 1.000 iteraciones dan `#¡NUM!` —un flujo que no cambia
  de signo no tiene tasa— y un solo `NaN` dejaba la media, la desviación y
  todos los percentiles en `NaN`. Era el hueco que `aBufferNumerico`
  documentaba desde que se construyó el canal de valores, aplazado a E6 por
  tocar el formato que viaja entre workers. El libro de demostración lo
  convirtió en un "sin datos" en pantalla y dejó de poder aplazarse: ahora se
  cuentan, se excluyen y se enseñan, en los dos motores. El caso normal no paga
  ni una copia de buffer.

### La tercera tanda vuelve de Excel: 87 de 89 (2026-09-22)

El libro calculado por el Excel real del usuario. Dos casos no coincidieron, y
solo uno era del motor.

**Corregido**

- **`PAGOINT` con pagos al principio del periodo y periodo > 1.** Excel da
  -828,878382 y el motor daba -836,787 (caso N2-032). Con pagos al principio la
  cuota se paga **antes** de que el periodo devengue intereses, así que el
  interés se descuenta un periodo; el motor le restaba la cuota al saldo, que
  es otra cosa. Es el segundo fallo de esta familia en dos vueltas: la primera
  lo encontré yo revisando signos, esta lo encontró Excel.
- **El generador escribía `DAYS` sin el prefijo `_xlfn.`** (es de Excel 2013),
  así que Excel la tomó por una función definida por el usuario y devolvió
  #¿NOMBRE?. Mismo defecto que tuvo `SI.ND` en la tanda anterior: la lista de
  funciones que necesitan prefijo es más larga de lo que parece y solo se
  descubre probándolas. Corregido; el caso queda documentado como pendiente
  hasta la próxima tanda en vez de darse por bueno.

**Verificado contra Excel** (85 casos que ya coincidían): `TIR` con y sin
estimación —incluido el flujo de dos raíces, donde Excel devuelve 0 con la
estimación por omisión y 2,414 con otra, exactamente como el motor—, `VNA`,
`TIR.NO.PER`, `VNA.NO.PER`, toda la familia de préstamos, `BUSCARV` aproximada
**sobre tabla desordenada**, los modos ±1 de `BUSCARX` (que esta misma semana
estaban rotos), `INDICE`, `COINCIDIR`, `ELEGIR`, `SI.ND`, el criterio `"<>5"`
contra una celda vacía, y el 29 de febrero de 1900 que nunca existió.

Y una confirmación que importa: **`TASA` no converge igual que Excel y da lo
mismo**. El caso N2-026 esperaba un `#¡NUM!` de Excel —se rinde a las 20
iteraciones— y Excel devolvió -0,424417, el mismo número que el motor. La
divergencia que estaba documentada como riesgo no existe.

### Tercera tanda del libro de fidelidad, y dos fallos reales que destapó (2026-09-22)

86 casos de financieras, búsquedas y fechas
(`tests/fixtures/generar-nivel2.py` → `fidelidad-nivel2.xlsx`). Pasarlos por el
motor **antes** de mandar el libro a Excel ya encontró tres cosas.

**Corregido**

- **El signo de `PAGOINT` y `PAGOPRIN` estaba invertido.** `PAGOINT` devolvía
  +833,33 donde Excel da -833,33 (los intereses son parte de la cuota, que es
  dinero que sale) y `PAGOPRIN` absorbía el error entero: -1906,98 en vez de
  -240,31. El test unitario lo daba por bueno porque comprobaba la identidad
  `PAGOINT + PAGOPRIN = PAGO`, **que se cumplía con los dos términos mal**.
  Una identidad que cuadra no demuestra que sus términos sean correctos.
- **`BUSCARX` y `COINCIDIRX` con los modos -1 y 1 reutilizaban la búsqueda de
  `BUSCARV`**, que supone la lista ordenada y corta en cuanto se pasa. Pero
  esa familia es justamente la que **no** exige orden con esos modos (solo con
  los binarios ±2). Buscar "el siguiente más grande" que 700 en una lista que
  empieza por 0 daba `#N/A`.
- **Un argumento omitido era indistinguible de un cero.** `BUSCARX(x;a;b;;-1)`
  tomaba el hueco del cuarto argumento como un valor por defecto igual a 0 y
  devolvía 0 en vez de `#N/A`. `Argumento` gana una marca `omitido`.

**Añadido**

- `tests/unit/fidelidadNivel2.test.ts`, que se activa solo en cuanto el libro
  vuelva calculado de Excel. Cubre: `TIR` (con estimación, sin raíz, y con dos
  raíces), `VNA`, `TIR.NO.PER`/`VNA.NO.PER`, `PAGO`/`VA`/`VF`/`NPER`/`TASA`,
  `PAGOINT`/`PAGOPRIN` con pagos al principio del periodo, `BUSCARV` exacta y
  aproximada **sobre tabla desordenada**, `BUSCARH`, `INDICE`, `COINCIDIR`,
  `BUSCARX`/`COINCIDIRX` con todos sus modos, `ELEGIR`, `SI.ND` con su prefijo
  `_xlfn.`, el criterio `"<>5"` contra una celda vacía, y ocho casos de fechas
  incluido el 29 de febrero de 1900 que nunca existió.

### El ciclo completo: definir un modelo, simular y ver resultados (2026-09-22)

El complemento deja de ser un panel de diagnóstico. Marcar celdas inciertas,
darles una distribución, marcar lo que se quiere medir, simular y leer la
curva de probabilidad: el MVP de E3, entero, salvo su verificación en Excel.

**Añadido**

- **`engine/modelo/eleccionMotor.ts`** — decide si puede el motor rápido
  **antes** de simular, y si no, lo dice con nombre de celda: "Flujo!D12 usa
  YEARFRAC". Predice exactamente los cinco rechazos del evaluador, y cada uno
  se prueba dos veces: que lo señale, y que el evaluador de verdad falle.
- **`excel/almacenModelo.ts`** — el `RiskModel v1` guardado **en el libro**,
  no en el navegador: el modelo es trabajo del usuario y viaja con el archivo.
- **`excel/resolverRef.ts`** — lo que `prepararEntradas` esperaba inyectado
  desde E3. Direcciones y nombres definidos, en un viaje.
- **`excel/ejecutarSimulacion.ts`** — la coreografía completa, con un tipo de
  error por cada cosa que el usuario puede arreglar.
- **`engine/modelo/catalogoDistribuciones.ts`** — las trece distribuciones
  descritas en español, para que el panel las pinte sin un `switch` de trece
  ramas. Atado con un test, como el catálogo del escáner.
- **El panel**: pestañas Modelo / Resultados / Diagnóstico, editor de
  distribuciones, ajustes, progreso con ritmo medido y cancelación, y la curva
  de probabilidad acumulada en SVG con cursor de lectura.
- **`ui/banco/`: un banco de pruebas con un Excel de mentira**, para poder
  desarrollar el panel sin Excel. Se abre en `/banco/` con `npm run
  dev-server`. Dice de sí mismo lo que no puede probar.

**Corregido**

- **Los valores estáticos del libro no llegaban al motor.** `construirGrafo`
  solo recibía fórmulas, así que una celda sin fórmula se evaluaba como vacía.
  En un libro de juguete daba igual —las constantes viven dentro de las
  fórmulas— pero en un modelo real los datos están en celdas y las fórmulas los
  referencian: media hoja valía cero sin avisar.
- El lexer rechazaba las letras no ASCII, de modo que un nombre definido
  `Año_base` salía como error de sintaxis, que el informe presenta como un
  fallo *del motor*.

**Decidido**

- **La distribución que se propone al marcar una celda va alrededor del valor
  que ya tiene** (triangular de ±10 %). Proponer (0; 1; 2) sobre una celda que
  vale 1.200 obliga a borrar tres campos antes de poder pensar.
- **No hay botón de guardar**: cada cambio confirmado va al libro. Un panel que
  se cierra sin querer no debe poder perder el trabajo de nadie.
- **Un modelo guardado que no se entiende no se pisa en silencio**: se enseña
  el problema y el JSON crudo, y decide el usuario.

### Modo compatible: Excel dentro del bucle (2026-09-22)

La red de seguridad del producto (decisión 15), construida entera: un libro
con funciones que el motor no conoce ya tiene respuesta, porque lo calcula
Excel. Falta ejecutarla dentro de Excel — el usuario aplazó esa parte.

**Añadido**

- `engine/compatible/` — el bucle, las estadísticas, la cancelación y la
  estimación de tiempo, **puros y probados en Node** detrás de la interfaz
  `LibroCalculable`. Un único método, `calcularIteracion`, porque Office.js
  encola escritura + recálculo + lectura en una sola sincronización y
  separarlas triplicaría los viajes, que es donde se va todo el tiempo de este
  modo.
- `tiempoEstimado` / `convieneAvisar` y `medirRitmo`: con Excel en el bucle se
  dice lo que va a tardar, **siempre, y con un número medido sobre el libro
  del usuario**. La auditoría midió ~3 h para un millón de iteraciones.
- `excel/libroCalculable.ts`, `excel/simulacionCompatible.ts`,
  `excel/direcciones.ts` y `excel/rangos.ts` — el adaptador de Office.js. Una
  iteración, un `context.sync()`; rangos resueltos fuera del bucle;
  `recalculate` y no `full`.
- **`excel/almacenGuardian.ts`: el `AlmacenGuardian` de verdad**, sobre
  `workbook.settings`, el modo de cálculo y las celdas. Lo que el guardián
  transaccional esperaba desde E3. Resuelve el desajuste síncrono/asíncrono
  con una foto al cargar y un volcado al final: dos viajes a Excel, no veinte.
- 22 tests nuevos del modo compatible y del parseo de direcciones (524 en
  total, en verde).

**Decidido**

- **Las iteraciones no numéricas se cuentan, no se propagan.** Una salida que
  dé `#¡DIV/0!` en 12 de 5.000 iteraciones ya no deja las estadísticas en
  `NaN` sin explicación: esas 12 se excluyen y se informan en `noNumericas`.
  Cierra el hueco de `aBufferNumerico` **en este modo**; en el modo rápido
  sigue abierto (toca el formato que viaja entre workers, E6).
- **Al terminar se restauran los valores, no solo el modo de cálculo**, también
  cuando la simulación va bien. El modo compatible escribe en el libro del
  usuario y la última iteración deja números aleatorios en sus entradas;
  dejarlos ahí es corromper el libro despacio (R5).

### Nivel 1 verificado contra Excel (2026-09-21)

Segunda tanda del libro de fidelidad: 50 casos calculados por el Excel real
del usuario (`tests/fixtures/fidelidad-nivel1.xlsx`, generado con
`tests/fixtures/generar-nivel1.py`). **48 coinciden**; los 2 restantes quedan
documentados por id, no ocultos.

**Corregido**

- **Una celda vacía sí coincide con un criterio `"<>"` de valor concreto.** El
  motor hacía lo contrario, porque yo había supuesto que una celda vacía nunca
  entra en una comparación. Excel dice que una vacía es "distinta de obra", así
  que `SUMAR.SI(M:M;"<>obra";N:N)` da 4100 y no 3400 (caso N1-011). Corregido
  en `criterios.ts`, con el test unitario que afirmaba lo contrario reescrito.
  Ninguna cantidad de tests propios lo habría encontrado: comprobaban lo que yo
  creí que hacía Excel.
- **El registro no quitaba el prefijo `_xlfn.`** con el que Excel guarda en el
  XML las funciones posteriores a 2007 (`SI.ND` se escribe `_xlfn.IFNA`). El
  escáner sí lo hacía; el motor no, así que habría fallado con libros reales.
  `_xludf.` no se normaliza a propósito: marca una función que ni el propio
  Excel reconoció.
- El lector del libro de fidelidad daba por bueno un libro sin calcular: una
  celda sin valor se leía como el número 0, porque `Number('')` es 0 y no
  `NaN`, y cualquier caso cuya respuesta fuera 0 pasaba por accidente. Ahora
  expone si el valor estaba de verdad cacheado y ambas tandas lo comprueban.

**Verificado (estaba bien, ahora con respaldo)**

Comodines `*`, `?` y `~`; criterios sobre vacío `""` y `"<>"`; que `CONTAR.SI`
ignora un error dentro del rango y `SUMAR.SI` no lo propaga; los cuatro
cuadrantes de signos de `MULTIPLO.SUPERIOR`/`MULTIPLO.INFERIOR`, incluido
`MULTIPLO.SUPERIOR(-2,5;1) = -2`; y los estadísticos de orden.

**Pendiente, con motivo**

- `N1-049`: el Excel es-ES del usuario convierte un número a texto con **coma
  decimal** (`1,5&""` da `"1,5"`) y el motor produce `"1.5"`. Confirma con dato
  el hueco de configuración regional. No se parchea: antes hay que decidir de
  dónde sale esa configuración (`Office.context`, una opción del panel, o el
  propio libro), y es una decisión del usuario ligada a la internacionalización.
- `N1-046`: no verificado por un defecto del generador —escribió `IFNA` sin el
  prefijo `_xlfn.`— y no del motor. Corregido el generador para la próxima tanda.

### Canal de valores y Nivel 1 (2026-09-21)

Disparado por el primer dato real: el usuario pasó el escáner de E1 por un
libro suyo de verdad (`Humedales_v1_completo`, 132 hojas, 95.317 celdas con
contenido, 16.609 fórmulas). El resultado cerró el supuesto que llevaba
abierto desde la Fase 1 (§5 del handoff, decisión 3):

- Con **solo Nivel 0**: 85,2 % de las fórmulas evaluables.
- Con **Nivel 0 + Nivel 1**: todo el libro salvo **7 usos de `ESBLANCO`**.
- Las funciones de criterio (`SUMAR.SI.CONJUNTO` 1.666, `CONTAR.SI` 1.052,
  `PROMEDIO.SI.CONJUNTO` 396, `SUMAR.SI` 69) son **3.183 usos**: el bloque
  que de verdad decide si el motor rápido sirve para un presupuesto real.

Ambas cosas —`ESBLANCO` y los criterios— estaban bloqueadas por la misma
causa raíz: el motor solo modelaba números.

**Añadido**

- `engine/values/`: el modelo de valores con los cinco tipos de celda de
  Excel (número, texto, lógico, vacío, error).
  - `columna.ts`: una `Columna` son los N valores de una celda en las N
    iteraciones, en tres formas — vector numérico plano (el caso dominante y
    el único que recorren los bucles del registro), constante no numérica (un
    texto o un vacío no necesita un millón de copias) y mixta
    (`SI(A1>10;"alto";5)`, el caso raro). Los constructores colapsan siempre a
    la forma más compacta, así que la forma es información fiable.
  - `coercion.ts`: las reglas de conversión y comparación de Excel, con sus
    límites escritos: la conversión de texto a número no acepta moneda,
    millares ni el separador decimal de es-ES, porque el motor todavía no
    recibe configuración regional.
  - `buffer.ts`: el buffer numérico crudo de las fronteras (entradas
    muestreadas, salidas que se reducen a estadísticas), que antes vivía en
    `engine/functions/types.ts`.
- `engine/functions/agregacion.ts`: las reglas de contexto de Excel, que no
  son las que uno supondría y ahora viven en un solo sitio. Dentro de un rango
  solo cuentan los números; sueltos, un lógico vale 1 y el texto "5" se
  convierte. Un error se propaga en `SUMA` y se ignora en `CONTAR`.
- `engine/functions/info.ts`: `ESBLANCO`, `ESNUMERO`, `ESTEXTO`, `ESNOTEXTO`,
  `ESLOGICO`, `ESERROR`, `ESERR`, `ESND`, `NOD`. Ninguna podía existir sin el
  canal de valores: sin él una celda vacía y un cero eran el mismo valor.
- `engine/functions/criterios.ts` y `condicionales.ts`: la gramática de
  criterios (comparadores, texto sin distinguir mayúsculas, comodines `*` y
  `?` con `~` para escaparlos, y los criterios sobre vacío `""` y `"<>"`) y
  las seis funciones que la usan. Precalculan el conjunto de coincidencias una
  sola vez cuando los rangos de criterio no dependen de la simulación, que es
  el caso normal: son etiquetas.
- Diez funciones de Nivel 0 que el catálogo prometía y nadie había
  implementado: `REDOND.MULT`, `MULTIPLO.SUPERIOR`, `MULTIPLO.INFERIOR`,
  `SUMA.CUADRADOS`, `PERCENTIL(.INC)`, `CUARTIL(.INC)`, `K.ESIMO.MAYOR`,
  `K.ESIMO.MENOR`. Más `SI.ND`, `CONTARA`, `CONTAR.BLANCO`, `VERDADERO`,
  `FALSO`.
- `npm run bench` (`bench/motor.ts`): el benchmark como archivo del
  repositorio. Antes era un script suelto, así que la cifra que cita el
  criterio de hecho de E2 no se podía volver a medir.
- `tests/unit/catalogoVsRegistro.test.ts`: ata el catálogo del escáner al
  registro del motor.

**Corregido**

- **Los seis casos pendientes del libro de fidelidad quedan cerrados: 31/31
  contra lo que Excel calculó de verdad, sin excepciones** (antes 25/31).
  - `PROMEDIO` ya no cuenta las celdas vacías en el denominador (L0-031: daba
    13,33 donde Excel da 20) y un rango sin números da `#¡DIV/0!` en vez de 0
    (L0-032). Eran los dos hallazgos nuevos de la primera tanda.
  - `SI(...;"mayor";"menor")` devuelve texto (L0-040) y
    `SI.ERROR(10/0;"sin datos")` devuelve "sin datos" (L0-022).
  - `CONTAR` y `CONTARA` se diferencian de verdad (L0-033, L0-034).
- Los errores llevan su código. El convenio anterior era `NaN` para todo, así
  que `#¡DIV/0!` y `#¡NUM!` eran indistinguibles; el test de fidelidad compara
  ahora el código exacto que Excel escribió en la celda.
- **Dos derivas entre el escáner y el motor.** El escáner contaba como
  cubiertas diez funciones de Nivel 0 que no existían —un informe de
  compatibilidad optimista es peor que no tener informe— y clasificaba como
  bloqueantes de Nivel 2 las `ES*` que ya se podían implementar. Corregidas
  las dos y atadas con un test para que no vuelvan a separarse.

**Rendimiento**

Medido en este contenedor, mismo modelo y misma máquina, comparando el commit
anterior al canal de valores con el actual (1.000.000 de iteraciones, 20
entradas, 5 salidas, 200 celdas intermedias, un solo hilo):

| | tiempo |
|---|---|
| Antes del canal de valores | 18,37 s / 18,29 s |
| Después | 18,64 s / 18,61 s |
| Modelo con texto y `SUMAR.SI.CONJUNTO` | 16,22 s |

Diferencia ~1,5 %, dentro del ruido, y la media de la salida sale idéntica
hasta el último decimal (5.655.827,14): el canal de valores no cambió ni el
resultado ni el coste del camino numérico. Lo consigue el camino rápido — cada
función comprueba **una vez por llamada** si sus argumentos ya son vectores
numéricos y, si lo son, recorre el mismo bucle plano de antes.

Ojo al comparar con los 8,5 s que cita el criterio de hecho de E2: aquello se
midió en el equipo del usuario (Windows, Node 24), no en este contenedor, que
es aproximadamente el doble de lento. La comparación válida es la de la tabla,
antes contra después en la misma máquina.

**Huecos conocidos que deja este trabajo**

- Una salida no numérica (un texto, o un error en algunas iteraciones) se
  convierte a `NaN` al reducirse a estadísticas, y contamina la media sin
  decir por qué. Lo correcto es contar esas iteraciones y enseñárselas al
  usuario ("3.412 de 1.000.000 dieron #¡DIV/0!"); es trabajo del informe de
  resultados (E6) y exige tocar el formato que viaja entre workers.
  Documentado en `aBufferNumerico`.
- Los casos límite de los criterios (qué hace exactamente `"<>texto"` con una
  celda vacía, entre otros) están implementados según lo documentado por
  Microsoft, pero **no verificados contra Excel de verdad**. Necesitan una
  segunda tanda del libro de fidelidad.
- La conversión de texto a número ignora la configuración regional, así que un
  "1,5" escrito en un libro es-ES no se convierte.

### E3 — Integración Excel + UI mínima (en curso)

**Añadido**
- `engine/modelo/`: el formato `RiskModel v1` (decisión D6, Fase 2 §7.2) —
  todavía sin nada de Office.js, la parte que sí se puede construir y probar
  en Node antes de tener Excel a mano.
  - **Todo el formato persistido está en inglés**, a propósito y ya
    confirmado con el usuario: es un producto comercial internacional
    (decisión 14 del handoff), y es el único archivo del proyecto que va a
    leer directamente alguien que no hable español. `dist: { type, mean,
    stdDev, ... }`, `correlations: [{ with, coefficient }]`, `settings:
    { iterations, seed, sampling, engine }` — nada de `tipo`/`moda`/`con`.
  - `distributionSchema.ts`: `DistributionSpec`, la forma en inglés de una
    distribución, con `toDescriptor`/`fromDescriptor` hacia
    `DescriptorDistribucion` (en español, interno — serializa hacia un Web
    Worker, nunca lo lee un humano). Es la frontera entre los dos idiomas:
    el resto del motor no sabe que `RiskModel` existe, y `RiskModel` no sabe
    que el descriptor interno tiene otros nombres. Un tipo desconocido (JSON
    corrupto o de una versión futura) falla con un mensaje claro en vez de
    devolver un objeto a medias. 18 tests: viaje de ida y vuelta sin pérdida
    para las 13 distribuciones, el caso sin parametrización explícita, y el
    tipo desconocido.
  - `riskModel.ts`: los tipos del modelo (`inputs`, `outputs`, `settings`) y
    `validarRiskModel`, que valida un `unknown` recién leído de
    `workbook.settings` — nunca hay que confiar en que ese JSON tiene la
    forma esperada, puede venir de una versión anterior o estar corrupto. La
    validación semántica de cada distribución (`min <= mode <= max`, etc.)
    no se repite: se reutiliza `toDescriptor` + `construirDesdeDescriptor`
    de `engine/distributions/`, que ya la hacen.
  - `id.ts`: `generarId`, ids cortos y aleatorios (D6: "no marcas de tiempo",
    el error concreto del heredado).
  - `correlaciones.ts`: `agruparCorrelaciones` — las correlaciones que declara
    cada entrada (`correlations: [{with, coefficient}]`) se agrupan en
    componentes conexas, cada una con su matriz simétrica lista para
    Iman–Conover. Detecta declaraciones contradictorias (el mismo par con dos
    coeficientes distintos).
  - `prepararSimulacion.ts`: `prepararEntradas` convierte un `ModeloRiesgo`
    validado en las `DefinicionEntrada[]` que espera `engine/executor/`. Las
    variables sin correlación quedan perezosas (el ejecutor decide si puede
    generarlas por tramos); las de un grupo correlacionado se materializan
    enteras y se correlacionan con Iman–Conover antes de entrar al ejecutor —
    igual límite que ya tiene LHS, por la misma razón (hace falta el buffer
    completo para reordenar por rangos).
  - Todo sigue sin saber nada de Excel: `prepararEntradas` recibe
    `resolverRef` inyectado (rango con nombre → clave de celda), que es
    responsabilidad del adaptador de Office.js, todavía por construir.
  - 17 tests más: modelo válido, esquema desconocido rechazado sin intentar
    migrar, ids/refs repetidos, correlación hacia una entrada inexistente o
    hacia sí misma, `settings` inválidos, agrupación simple y encadenada,
    contradicción detectada, y la conversión a `DefinicionEntrada[]` con y
    sin correlación.
- `engine/modelo/guardian.ts`: el guardián transaccional de Fase 2 §7.3 (R5:
  "nunca corromper el libro del usuario"). Antes de simular,
  `iniciarProteccion` guarda el modo de cálculo y el valor original de cada
  entrada en un registro de recuperación; `finalizarProteccion` lo borra al
  terminar bien. Si el panel se cierra a mitad o el runtime muere, el
  registro sigue en el libro la próxima vez que se abre —
  `hayRecuperacionPendiente` lo detecta, y el usuario elige entre
  `restaurarDesdeRecuperacion` (vuelve las celdas y el modo de cálculo a como
  estaban) o `descartarRecuperacion` (se queda con lo que hay). No pisa un
  registro ya existente: iniciar una protección encima de una simulación
  interrumpida perdería justo los valores que hacían falta para deshacerla.
  - La única frontera con Excel (`AlmacenGuardian`: leer/escribir
    `workbook.settings`, leer/cambiar el modo de cálculo, leer/escribir una
    celda) queda inyectada — no existe todavía, es trabajo del adaptador de
    Office.js. Lo que sí se construye y prueba ahora, con un almacén
    simulado en memoria, es la lógica de **cuándo** hacer cada cosa, que es
    donde está el riesgo real de este mecanismo.
  - 8 tests: guarda y cambia de modo al iniciar, no pisa una protección
    activa, restaura sin tocar celdas al finalizar con éxito, detecta una
    recuperación pendiente tras un cierre a medio camino, restaurar y
    descartar hacen exactamente lo que dicen (uno toca las celdas y el modo,
    el otro no), y se puede volver a proteger después de resolver cualquiera
    de los dos.
- `engine/stats/resumen.ts`: convierte lo que produce el ejecutor
  (`EstadoWelford` + `TDigest` por salida) en lo que de verdad va a pintar el
  panel — la parte de "Resultados: estadísticos, histograma y CDF" de E3 que
  no depende de Office.js.
  - `resumenEstadistico`: media, desviación, min, max y nueve percentiles
    estándar (p1..p99). Marcados `percentilesAproximados: true` siempre —
    vienen del t-digest, porque el ejecutor por bloques nunca retiene el
    buffer completo de una salida (Fase 2 §3.3 exige que la UI pueda
    distinguir un percentil exacto de uno aproximado).
  - `curvaCDF`: puntos `(x, p)` a lo largo de toda la distribución para
    dibujar la curva, con `p` espaciado por el punto medio de cada tramo.
  - `puntosHistograma`: formatea un `Histograma` ya construido como bins
    listos para un gráfico de barras.
  - **Límite documentado, no resuelto aquí**: el histograma de una salida
    calculada por bloques no tiene todavía acumulación en streaming (Fase 2
    §3.3 pide fijar su rango en una pasada previa corta y sumar conteos
    bloque a bloque); `puntosHistograma` sirve hoy para cuando se tiene el
    buffer completo (p. ej. desde `evaluarModelo`), no para el camino por
    bloques del ejecutor. Queda para cuando se aborde E6 (escala D11).
  - 5 tests: percentiles y desviación de una normal conocida, las nueve
    claves estándar presentes, monotonía de la curva CDF, su cercanía al
    percentil exacto, y los límites de bin correctos al formatear un
    histograma.

### E2 — Motor Nivel 0 · **completa**

**Añadido**
- `engine/executor/`: el ejecutor por bloques de Fase 2 §3.1, la última
  pieza de E2. Trocea la simulación en bloques de tamaño **adaptativo**,
  reparte el trabajo en lo que se le dé (un solo hilo por defecto, o un pool
  real de Web Workers/`worker_threads`), acumula las estadísticas de cada
  salida bloque a bloque, y permite cancelar entre bloques sin perder lo ya
  calculado.
  - `bloques.ts`: `tamanoBloqueAdaptativo` implementa la fórmula exacta de
    Fase 2 §3.1 (`clamp(presupuesto / (vivos·8), 4096, 65536)`) — con pocas
    variables vivas el bloque es grande; con cientos (D11), se encoge. El
    coste por muestra no cambia, solo cuántas veces se repite el bucle.
  - `entradas.ts`: cada variable de entrada se genera **por tramos**, no
    completa. Para Monte Carlo esto es gratis (`muestrearMonteCarloBloque`,
    nuevo en `engine/sampling/`, usa que el PRNG de contador puede generar
    cualquier tramo `[a,b)` directamente). LHS no puede todavía —su
    estratificación necesita conocer `n` de antemano— así que se resuelve
    entera una vez (`resolverEntradas`) antes de trocear; queda documentado
    como el límite conocido que ya anticipaba el handoff.
  - `calcularBloque.ts`: la unidad de trabajo — pura, sin más estado que sus
    argumentos. Es lo que corre en un hilo o en cien: no importa, el
    resultado no depende de quién ni cuándo la ejecute.
  - `tipos.ts`: el contrato `EjecutorDeBloques` que desacopla "calcular un
    bloque" de "quién lo reparte y cómo". `engine/` no puede depender de
    Web Workers ni de `worker_threads` (regla de oro de la arquitectura), así
    que el motor solo conoce esta interfaz; quién la implementa —un bucle
    secuencial, un pool del navegador— es decisión de la capa que lo usa.
  - `ejecutorSecuencial.ts`: la implementación por defecto, en este mismo
    hilo. Es la que usan los tests y la que corre si no hay pool disponible.
  - `simular.ts` (`simularPorBloques`): orquesta todo lo anterior — combina
    Welford (`combinar`) y t-digest (`combinarTDigest`) de cada bloque en el
    resultado final, consulta cancelación entre rondas de bloques, y reporta
    progreso.
  - **Prueba de paralelismo real, no solo la interfaz**: `tests/helpers/`
    trae un pool de `worker_threads` de Node de verdad (fuera de `engine/`,
    donde debe estar) que implementa `EjecutorDeBloques` repartiendo bloques
    entre varios hilos del sistema operativo — usando `--experimental-strip-types`
    de Node 22 para cargar los `.ts` del motor directamente, sin compilar y
    sin ninguna dependencia nueva del proyecto. **Medido, no estimado**: el
    escenario formal (1M iteraciones, 20 entradas, 5 salidas, 200 celdas) pasa
    de 8,47 s en un hilo a 3,16 s con un pool de 4 workers en una máquina de 4
    núcleos — **2,7× más rápido**, con resultados idénticos (el PRNG de
    contador es indiferente a cuántos hilos calculan qué bloque, la propiedad
    central de Fase 2 §3.2). El adaptador de producción para el navegador (un
    `Worker` real en vez de `worker_threads`) es la misma idea con la misma
    interfaz, y se construye en Fase 3 E3 cuando exista la integración con
    Excel — no antes, porque hoy no hay dónde enchufarlo.
  - 13 tests: la fórmula de tamaño de bloque, el particionado exacto sin
    huecos, un bloque suelto comparado contra generar y evaluar todo junto,
    invariancia del resultado frente al tamaño de bloque, equivalencia con
    `evaluarModelo`, cancelación a medio camino, progreso creciente, un error
    de función no soportada reportado con la celda exacta, y (en su propio
    archivo) el pool de `worker_threads` dando el mismo resultado que el
    ejecutor secuencial y repartiendo de verdad más trabajos que workers sin
    cruzarlos.
- `engine/distributions/descriptor.ts`: forma serializable de una
  distribución (`{ tipo, ...parámetros }`, sin funciones). Hace falta porque
  una `Distribution` tiene closures (`quantile`, `cdf`) que no se pueden
  clonar entre hilos ni guardar en JSON — y es, de paso, exactamente el
  formato que `RiskModel v1` va a persistir en `workbook.settings` (Fase 2
  §7.2). Cubre las trece distribuciones con forma "hoja" (todas menos
  `empirical` y `truncar`, que se añaden cuando haga falta serializarlas).

**Con esto se cierra E2.** Los tres criterios de hecho de Fase 3 están
cumplidos: fidelidad contra Excel (25/31 casos, 6 documentados como
pendientes), tests estadísticos en verde para distribuciones y muestreo, y el
benchmark formal de 1M/20/5/200 celdas en ~2,5–8,5 s según el ejecutor —
todos por debajo del objetivo de 5 s con el pool paralelo, y el secuencial ya
lo cumplía de sobra antes de esta pieza.

- `tests/fixtures/fidelidad.xlsx` (Fase 2 §11.3, **primer criterio de hecho de
  E2 que se cierra**): 31 casos reales, calculados y recalculados en Excel de
  escritorio (es-ES), no en un simulador. Cubren el catálogo Nivel 0 de Fase
  2 §4.2: aritmética y precedencia (`^` asocia por la izquierda, el menos
  unario se aplica antes que la potencia), redondeo (los tres casos donde
  Excel diverge de JavaScript), división por cero y raíz/logaritmo de
  argumentos inválidos, agregación con celdas vacías, lógica, potencias y
  logaritmos.
  - `tests/helpers/leerFidelidad.ts`: lee el `.xlsx` directamente (ZIP+XML,
    igual que `scanner/xlsx.ts`) y extrae el **valor cacheado** que Excel dejó
    grabado en cada fórmula — número, texto, booleano o código de error—, que
    es la referencia real contra la que se compara el motor.
  - `tests/unit/fidelidad.test.ts`: evalúa cada fórmula con el motor y la
    compara contra ese valor, con tolerancia `1e-9` para números. 25 de los
    31 casos pasan hoy. Los 6 que no se excluyen **por id, con el motivo
    exacto documentado en el propio test** (no en silencio): tres por el
    canal de texto que todavía no existe (`IF`/`IFERROR` con ramas de texto,
    `COUNT`/`COUNTA` con una celda de texto en el rango) y **dos hallazgos
    nuevos, encontrados precisamente por tener este libro**: `AVERAGE` no
    distingue una celda vacía de un cero en su denominador (`PROMEDIO` de un
    rango con huecos da un número distinto al de Excel, y de un rango
    totalmente vacío da 0 en vez de un error). Quedan para cuando exista el
    canal de valores completo (texto/booleano/error/vacío) que ya anticipaba
    `engine/functions/types.ts`.
  - Añadidas al registro de funciones, al pasar por este ejercicio:
    `SUMPRODUCT` (`engine/functions/math.ts`, multiplica posición a posición
    dos o más rangos y suma) e `IFERROR` (`engine/functions/logic.ts`, usa el
    convenio de este registro de que `NaN` es un error — cubre el caso
    numérico; el caso con un `valor_si_error` de texto queda documentado como
    pendiente, arriba). Ambas con sus propios tests unitarios además de la
    fila del libro de fidelidad.
- `engine/compiler/plan.ts` y `engine/compiler/executor.ts`: el compilador
  optimizado de Fase 2 §3, en un solo hilo (sin Web Workers todavía — eso
  queda para el ejecutor por bloques).
  - **Compilación**: `compilarPlan` analiza el grafo una vez (orden
    topológico + detección de ciclos, reutilizando `engine/graph/`) y
    reutiliza `subgrafoRelevante` para decidir, de una vez y con código ya
    probado, qué celdas de la clausura de las salidas dependen de alguna
    entrada y cuáles no.
  - ***Constant folding***: una celda que hace falta calcular pero que no
    depende de ninguna entrada (la tabla de tarifas fija del ejemplo de Fase
    2 §4.2) se evalúa **una vez** (`n=1`), no las `n` iteraciones completas.
    Solo se "difunde" (`fill`) a un buffer de `n` en el momento en que de
    verdad hace falta —porque alguna celda no constante la consume, o porque
    es ella misma una salida pedida—; una cadena de celdas constantes que
    solo se alimentan entre sí nunca paga el coste de `n`.
  - **Vida de buffers**: cada celda se borra del mapa de valores en cuanto se
    calculan sus últimos consumidores, para que el recolector de basura la
    libere en vez de mantener vivas todas las celdas intermedias hasta el
    final. Documentado como límite explícito: esto reduce el pico de memoria,
    pero no es todavía el *pool* de buffers reutilizables que exige un
    ejecutor por bloques de verdad — eso necesita que `evaluarNodo` acepte un
    buffer de destino en vez de reservar uno nuevo cada vez, un cambio más
    profundo que se deja para cuando exista ese ejecutor.
  - Reutiliza `evaluarNodo` de `evaluate.ts` (ahora exportado) célula a
    célula: la semántica de cada operador y función vive en un solo sitio: el
    compilador decide *cuándo* llamarla, no reimplementa qué hace `+`.
  - Contrato deliberadamente distinto del evaluador de referencia: solo
    devuelve las celdas de `salidas`, no todas las celdas intermedias —es lo
    que permite que el *constant folding* ahorre trabajo de verdad.
  - **Benchmark ejecutado** (Fase 2 §10, regla de "nunca estimar"): con el
    escenario formal (1.000.000 de iteraciones, 20 entradas, 5 salidas, 200
    celdas aritméticas encadenadas), el evaluador de referencia tarda ~2,9 s
    y el plan compilado ~2,5 s — **ambos ya por debajo del objetivo de 5 s**.
    Con el mismo modelo más una tabla de tarifas constante de 50 celdas
    (cada una una `SUM` sobre hasta 10 tarifas anteriores), la tabla añade
    ~1,8 s al evaluador de referencia (que la recalcula en las 1.000.000 de
    iteraciones) frente a ~0,5 s al plan compilado (que la calcula una vez y
    difunde) — el ahorro esperado del *constant folding*, medido, no
    estimado.
  - 12 tests: paridad exacta con `evaluarModelo` en varios modelos (cadenas,
    funciones sobre rangos, varias salidas a la vez, división por cero, un
    modelo íntegramente constante), clasificación correcta de qué es
    constante y qué no, los mismos errores que el evaluador de referencia
    (ciclos, función no soportada, longitud de entrada incorrecta), y el
    contrato de que solo se devuelven las salidas pedidas.
- `engine/stats/`: estadísticas de salida (Fase 3, criterio de hecho de E2).
  - **Welford** (`welford.ts`): media y varianza en una pasada, con
    combinación de estados parciales (algoritmo paralelo de Chan, Golub y
    LeVeque) — lo que permite que el ejecutor por bloques (todavía pendiente)
    o varios Web Workers acumulen cada uno su trozo y se junten al final sin
    releer ni un valor. Se guarda `m2` (suma de desviaciones al cuadrado), no
    la varianza ya dividida, porque es lo único que se recombina sin arrastrar
    error de redondeo.
  - **Percentiles exactos** (`percentiles.ts`): interpolación lineal sobre el
    array ordenado, igual que `PERCENTILE.INC` de Excel.
  - **Histograma** (`histogram.ts`): bins de ancho igual sobre un rango dado
    o calculado del propio buffer.
  - **t-digest** (`tdigest.ts`): percentiles aproximados con memoria acotada
    para cuando D11 (millones de iteraciones, cientos de salidas) hace
    inviable ordenar el buffer completo solo para un percentil. Construcción
    por lotes con la función de escala `k1` (Dunning, 2019); la combinación
    de varios digests parciales reutiliza el mismo algoritmo de construcción
    sobre los centroides como si fueran puntos con peso, sin necesitar una
    fusión aparte. La UI deberá indicar cuándo un percentil viene de aquí
    (aproximado) y cuándo de `percentiles.ts` (exacto) — Fase 2 §3.3.
  - 14 tests: caso de libro de texto para Welford, combinación de bloques
    idéntica a acumular todo junto, asociatividad, `PERCENTILE.INC` de
    referencia, y precisión del t-digest contra el percentil exacto (incluida
    la propiedad de que es más preciso en las colas que en el centro).
- `engine/sampling/`: muestreo de las variables de entrada (Fase 2 §8, D10).
  - **Monte Carlo** (`montecarlo.ts`): un uniforme por iteración vía
    `fillUniform`, transformado por `quantile()` de la distribución.
  - **Latin Hypercube** (`lhs.ts`): estratifica `[0,1)` en `n` tramos y saca
    una muestra de cada uno, con el orden de tramos barajado (Fisher–Yates)
    y el punto dentro del tramo ("jitter") en un flujo del PRNG
    **independiente** de la baraja — si compartieran flujo, la posición
    dentro del tramo quedaría correlacionada con qué tramo tocó. Test
    dedicado: con la misma `n`, el error de la media muestral es menor que
    con Monte Carlo.
  - Cada variable usa dos flujos del PRNG derivados de su propio `id`
    (`streamOf`), igual que ya hacía el generador de uniformes: añadir o
    quitar una variable del modelo no cambia los números que reciben las
    demás.
  - `generarEntrada(dist, id, seed, n, metodo)`: punto de entrada único que
    despacha a Monte Carlo o LHS según `settings.sampling` del modelo — ni el
    adaptador de Excel ni los tests necesitan saber cuál es cuál para pedir
    una muestra.
  - **Correlación Iman–Conover** (`correlate.ts`): reordena los valores ya
    muestreados de un grupo de variables para inducir una correlación de
    rangos objetivo, sin tocar sus marginales (cada buffer conserva
    exactamente el mismo multiconjunto de valores). Incluye descomposición
    de Cholesky propia y detección explícita de matrices de correlación no
    válidas (no simétrica, diagonal ≠ 1, no definida positiva) en vez de un
    `NaN` silencioso. Ajuste de D11 ya incorporado en el diseño: se aplica
    por grupo declarado, nunca a la matriz completa de variables del modelo.
  - 12 tests: determinismo, independencia entre variables, estratificación
    exacta de LHS, correlación inducida verificada con Spearman, y rechazo
    de matrices de correlación inválidas.
- `engine/distributions/`: las distribuciones de Fase 2 §8, con los errores
  matemáticos del heredado (Fase 1 §4.3) corregidos y con tests de bondad de
  ajuste (Fase 2 §11.2).
  - `mathfn.ts`: funciones especiales compartidas —`erf`/`erfinv`, cuantil de
    la normal estándar, `lgamma`, gamma incompleta regularizada (serie +
    fracción continua) y beta incompleta regularizada (fracción continua),
    cada una con su inversa. Antes había `erf` duplicado en dos sitios del
    heredado; ahora hay una sola implementación, usada por todas las
    distribuciones que la necesitan.
  - Cada distribución expone `quantile` (para muestrear por transformada
    inversa, la vía que comparten Monte Carlo y LHS), `cdf` (para el
    truncamiento y para KS), y `mean`/`variance` teóricos (para las pruebas
    de momentos).
  - **PERT real** (`pert.ts`): Beta(α,β) reescalada, α = 1+λ(moda−min)/(max−min),
    β = 1+λ(max−moda)/(max−min), λ=4 configurable. Sustituye al
    `(triangular+media+moda)/3` heredado, que reducía la varianza a ~1/9 de la
    triangular; hay un test dedicado que compara la varianza de PERT contra
    la de la triangular equivalente y habría detectado el error original.
  - **Lognormal** (`lognormal.ts`) con parametrización explícita
    (`'variable'` o `'logaritmo'`): corrige la ambigüedad heredada donde
    "media=1000" se interpretaba como el logaritmo y daba `exp(1000)` =
    Infinity.
  - **Poisson y Binomial** (`poisson.ts`, `binomial.ts`): inversión por
    recurrencia en log para parámetros moderados, aproximación normal con
    corrección de continuidad para los grandes — O(1) en ambos casos, sin el
    `exp(-λ)` que desbordaba a 0 para λ > ~745 (bucle potencialmente
    infinito) ni los n ensayos de Bernoulli del binomial heredado.
  - **Triangular** (`triangular.ts`) con validación `min <= moda <= max` y
    `min !== max` al construir la distribución, no en cada muestra.
  - Añadidas: Beta (`beta.ts`, incluida la forma reescalada que usa PERT),
    Gamma y Exponencial (`gamma.ts`), Weibull (`weibull.ts`), Uniforme
    (`uniform.ts`), Normal (`normal.ts`), Bernoulli (`bernoulli.ts`),
    Discreta (`discrete.ts`) y Empírica continua por puntos de control de la
    CDF (`empirical.ts`, mismo formato que `RiskCumul` de @RISK).
  - **Truncamiento genérico** (`truncate.ts`): envoltura aplicable a
    cualquier distribución sin necesitar una fórmula por caso, con media y
    varianza por cuadratura sobre el cuantil.
  - 34 tests: KS contra la CDF teórica y comprobación de momentos por cada
    distribución, con semilla fija.
- `engine/compiler/evaluate.ts`: **evaluador de referencia**, la pieza que une
  parser + grafo + registro de funciones en un cálculo completo. Dado un
  conjunto de celdas de entrada (ya muestreadas) y unas salidas, calcula todo
  el subgrafo necesario en orden topológico. Es la versión **interpretada**
  del motor —recorre el AST de cada celda directamente, sin el análisis de
  vida de buffers ni el *constant folding* de Fase 2 §3.1— y existe para
  validar la corrección de punta a punta antes de escribir el compilador
  optimizado, que es el siguiente paso de E2.
- Prueba informal (no el benchmark formal de Fase 2 §10, que llega con su
  propia etapa y metodología): 1.000.000 de iteraciones sobre un modelo de 200
  celdas encadenadas, con este evaluador sin optimizar, en ~8,7 s. Confirma
  que la dirección arquitectónica funciona en la práctica antes de invertir en
  la versión con reutilización de buffers.
- Errores con la celda y el motivo exactos: referencia circular, función no
  soportada, error de sintaxis, rango de columna/fila entera (no soportado
  todavía), tamaño de buffer de entrada incorrecto. Nunca una excepción sin
  contexto ni un resultado silenciosamente incorrecto.
- 14 tests, incluida una cadena de dependencias con forma de presupuesto real
  (cantidad × precio → subtotal → IVA → total).
- `engine/functions/`: registro de funciones vectorizadas — **subconjunto
  numérico** por ahora (SUM, PRODUCT, MIN, MAX, COUNT, AVERAGE, MEDIAN,
  STDEV.S/P, VAR.S/P, ABS, SIGN, SQRT, INT, EXP, LN, LOG, LOG10, POWER, MOD,
  ROUND, ROUNDUP, ROUNDDOWN, TRUNC, IF, AND, OR, NOT, XOR). Cada celda es un
  `Float64Array` de N valores (una por iteración de la simulación) y cada
  función opera sobre esos buffers completos de una vez — es la vectorización
  de Fase 2 §3 hecha código.
- Tres funciones donde Excel diverge de su equivalente ingenuo en JavaScript,
  corregidas con test dedicado: `ROUND` redondea alejándose de cero
  (`ROUND(-2.5,0)=-3`, no -2 como `Math.round`), `MOD` toma el signo del
  divisor (`MOD(-7,3)=2`, no -1 como `%`), y `TRUNC`/`INT` divergen en
  negativos (`TRUNC(-2.5)=-2` pero `INT(-2.5)=-3`).
- Documentado como límite explícito, no como descuido: este registro todavía
  no modela texto, booleano-distinto-de-número, error ni celda vacía. Ninguna
  de estas funciones se declara "soportada" a efectos de la batería de
  fidelidad de Fase 2 §11.3 hasta que ese canal exista.
- 29 tests de funciones.
- `engine/graph/`: grafo de dependencias entre celdas, construido a partir del
  AST del parser. Cada celda referenciada es un nodo, tenga o no fórmula
  propia (una entrada con valor puro también lo es).
- Orden topológico con recorrido iterativo (no recursivo, por la misma razón
  que el escáner: una cadena de decenas de miles de fórmulas encadenadas por
  fila es normal en un presupuesto) y **detección de referencias circulares**,
  con las celdas implicadas identificadas en vez de colgarse o dar un
  resultado arbitrario.
- Dos recortes de grafo con propósitos distintos, documentados para no
  confundirlos: la **clausura de dependencias** de las salidas (todo lo que
  hace falta calcular, incluidas ramas constantes) para el compilador, y el
  **subgrafo entrada→salida** (solo lo que conecta una entrada incierta con
  una salida) para el informe de compatibilidad. Una celda que no depende de
  ninguna entrada —una tabla de tarifas fija— pertenece a la primera pero no a
  la segunda: es la base del *constant folding* previsto en Fase 2 §4.2.
- 20 tests de grafo.
- `engine/parser/`: tokenizador y parser de fórmulas de Excel a AST, por
  escalada de precedencia. Trabaja sobre la forma en-US de la fórmula, que es
  la que guardan tanto el `.xlsx` como `range.formulas` de Office.js, de modo
  que el motor no depende de la configuración regional.
- Reproduce las rarezas de Excel que otros lenguajes no comparten: `^` asocia
  por la izquierda (`2^3^2` = 64) y el menos unario se aplica antes que la
  potencia (`-2^2` = 4).
- Cubre referencias absolutas, hojas con y sin comillas, rangos, columnas y
  filas enteras, nombres definidos, argumentos omitidos, constantes
  matriciales, errores literales y porcentajes.
- Lo que está fuera de alcance (referencias a otros libros, referencias
  estructuradas, uniones de rangos, derrames de matriz dinámica) produce un
  nodo `no-soportado` **con su motivo**, no un error de sintaxis: el informe
  debe poder decir qué construcción concreta lo impide.
- El parser no lanza excepciones hacia fuera: devuelve el error con mensaje y
  posición, porque procesar miles de celdas no puede detenerse en la primera
  fórmula rara.
- 35 tests de parser.

**Corregido**
- El test de bondad de ajuste de `beta(0.5, 0.5)` (forma en U) podía superar
  el timeout por defecto de Vitest: la inversión por bisección converge más
  despacio cerca de los extremos, y sobre 200.000 muestras se notaba. Se
  reduce a 20.000 muestras solo para esa forma — sigue sobrando potencia
  estadística para detectar un error real, y ya no depende de qué tan cargada
  esté la máquina que corre los tests.

### E1 — Escáner de compatibilidad (v0.1)

**Añadido**
- `npm run scan -- <libro.xlsx>`: analiza libros reales y dice qué porcentaje de
  sus fórmulas podría evaluar el motor rápido y qué funciones lo impiden, con
  celda de ejemplo y frecuencia de uso.
- Lectura directa del formato `.xlsx` (ZIP + XML) **sin abrir Excel y sin una
  sola llamada de red**: hojas, fórmulas, fórmulas compartidas y matriciales,
  nombres definidos, tablas, enlaces externos, VBA y Power Query.
- Tokenizador de fórmulas que distingue funciones de nombres definidos, de
  referencias y de texto entrecomillado — `LOG10(A1)` es una función y `LOG10`
  a secas es una celda.
- Catálogo de funciones por nivel (§4.2 de la arquitectura), con normalización
  de los prefijos `_xlfn.` y `@` que añade Excel.
- Medida del tamaño del problema para dimensionar el motor (D11): fórmulas,
  referencias por fórmula y profundidad de la cadena de dependencias, calculada
  con un recorrido iterativo que aguanta cadenas de decenas de miles de celdas.
- Resumen agregado de varios libros con los bloqueantes ordenados por
  frecuencia: es la lista de trabajo de E5.
- Regla de ESLint que prohíbe a `engine/` importar Node, Office o capas
  superiores. La regla de oro de la arquitectura la vigila el linter.
- 34 tests nuevos, con libros `.xlsx` construidos en memoria en lugar de
  fixtures binarios.

**Corregido**
- El veredicto usaba un umbral del 99,5 % y llegaba a declarar "compatible" un
  libro con celdas bloqueantes. Ahora basta una para que no lo sea: el
  porcentaje mide cuánto falta, no decide el veredicto.

### E0 — Fundaciones

**Añadido**
- Estructura del proyecto nuevo: `engine/`, `tests/`.
- Vitest configurado y **primera batería de tests del proyecto** (16 tests).
- Generador pseudoaleatorio **Philox-2x32-10 basado en contador**
  (`engine/random/philox.ts`): la muestra `i` se calcula como
  `f(semilla, flujo, índice)` sin estado, de modo que el resultado no depende
  del número de núcleos ni del troceado en bloques.
- Integración continua en GitHub Actions: tipos, lint y tests en cada push.
- `legacy/README.md` explicando qué se puede reutilizar del código heredado y
  qué no.
- Scripts `npm test`, `npm run test:watch`, `npm run check`,
  `npm run validate-manifest`.

**Cambiado**
- El código heredado se traslada a `legacy/` y queda **fuera del build, del
  lint y de los tests**. Se conserva como referencia; el commit etiquetado
  `v0.0.0-heredado` lo preserva íntegro.
- `npm run build` pasa a ser solo comprobación de tipos (`tsc -b`). Los puntos
  de entrada HTML se reconstruyen en E3, y hasta entonces no hay `vite build`.
- El paquete pasa a llamarse `riesgo-montecarlo-excel`.
- ESLint simplificado, con `legacy/` ignorado; el motor compila con `strict`.

**Eliminado**
- Dependencias `jspdf`, `html2canvas` y `recharts` (≈350 KB de bundle),
  aprobado en la decisión 1.2. La exportación de informes se hará a hojas
  nativas de Excel.
- `dist/`: artefacto obsoleto y no reproducible.
- Google Fonts y la etiqueta `<script src="/functions.js">` del panel, que
  provocaba un `ReferenceError` en cada apertura — ambos salen del producto al
  quedar `index.html` heredado dentro de `legacy/`.

## [v0.0.0-heredado] — 2026-09-15

Estado del complemento tal como fue entregado por la IA anterior, congelado
como evidencia de la auditoría. No compila, no tiene tests y sus funciones
`=RIESGO.*` nunca llegaron a registrarse en Excel. Ver
`docs/FASE1_AUDITORIA_TECNICA.md`.
