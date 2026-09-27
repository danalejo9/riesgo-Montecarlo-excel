# Inventario de funcionalidades

*27/09/2026.* Todo lo que tiene el complemento y todo lo que falta, en una sola
lista. Sale de `docs/FASE3_ROADMAP.md` (los códigos B1, C7, E5… son los suyos),
cruzado con todas las peticiones del usuario en las conversaciones y en las dos
rondas de pruebas. Si algo que pediste no aparece aquí, es un olvido: dilo.

**Origen**: **Tú** = lo pediste tú · **Estudio** = los estudios de mercado ·
**Plan** = revisión del plan · **Pruebas** = salió al probar en Excel ·
**Nuevo** = propuesto en esta revisión (27/09), para que lo confirmes.

---

## 1. Lo que ya está hecho

✅ = probado en tu Excel · 🧪 = probado solo en pruebas automáticas y en el
banco del navegador.

| Área | Funcionalidad | Estado |
|---|---|---|
| Motor | Fórmulas de Excel: Nivel 0 57/57, Nivel 1 43/44 (falta `DESREF`), Nivel 2 37/41 | ✅ 251/251 casos iguales a tu Excel |
| Motor | `LET`, y matrices dinámicas dentro de una función (`SUMAPRODUCTO`, `FILTRAR`…) | ✅ tandas 7 y 8 |
| Motor | Configuración regional (separadores, `VERDADERO`/`FALSO`) | ✅ |
| Motor | Motor rápido en memoria, en varios núcleos (Web Workers) | ✅ |
| Motor | Modo compatible (Excel calcula cada iteración) y elección automática del motor | ✅ |
| Motor | El modo compatible no pierde las fórmulas de las entradas | ✅ H1 |
| Motor | Resultados reproducibles con la misma semilla, también al volver a marcar una celda | 🧪 falta tu prueba K |
| Motor | Muestreo Monte Carlo e hipercubo latino | ✅ |
| Motor | Correlaciones entre entradas | 🧪 |
| Distribuciones | 13 en el panel: triangular, PERT, uniforme, normal, lognormal, beta, gamma, exponencial, Weibull, Bernoulli, binomial, Poisson, discreta | ✅ |
| Funciones | 12 funciones `RIESGO.*` en celdas (muestran la media fuera de la simulación) | ✅ escritorio · ⚠️ Web por confirmar (W5) |
| Funciones | «Preparar para compartir» y «Restaurar»: el libro se abre sin el complemento sin `#¿NOMBRE?` | ✅ J1–J4 |
| Panel | Marcar entradas y salidas, editor de distribuciones, resaltado de colores en la hoja | ✅ |
| Panel | El modelo se guarda dentro del libro | ✅ |
| Panel | Configuración: núcleos, iteraciones, semilla, muestreo, motor, «simular hasta alcanzar la precisión» | ✅ B1–B3 |
| Panel | Cinta con 4 botones (Modelo, Resultados, Configuración, Diagnóstico) | ✅ |
| Panel | Diagnóstico: entorno, API disponibles, ajustes guardados, compatibilidad del libro | ✅ |
| Panel | Ajuste de distribuciones a datos históricos (AIC, BIC, Anderson–Darling, K–S) | ✅ D1 |
| Panel | Avisos que se pueden cerrar; el editor no guarda distribuciones inválidas | 🧪 arreglado tras tu prueba |
| Resultados | Estadísticos, percentiles, precisión («¿bastan las iteraciones?») | ✅ |
| Resultados | Probabilidad de quedar por debajo o por encima de un umbral | ✅ |
| Resultados | Histograma, curva acumulada, tornado (con % de varianza), araña | ✅ |
| Resultados | Comparar con **un** escenario de referencia | ✅ C1 |
| Resultados | Los resultados quedan guardados en el libro | ✅ C4 |
| Resultados | Informe PDF | ✅ C2 |
| Resultados | Volcar a una hoja con gráficos de Excel | ✅ C3 (poco legible, ver C8) |
| Plataformas | Excel de escritorio en Windows | ✅ |
| Plataformas | Excel para la Web | ✅ panel y simulación · ⚠️ funciones RIESGO (W5) |
| Plataformas | Excel para Mac | ⬜ sin probar (no tienes Mac) |

---

## 2. Lo que falta, en el orden propuesto

La columna **#** es el orden de trabajo. Los bloques de filas son las etapas.

### Ahora: terminar las pruebas

| # | Código | Funcionalidad | Origen | Estado |
|---|---|---|---|---|
| 1 | A | Tu prueba **K**, y repetir **W5**, **J4** y **G3** | Plan | ⬜ tú |
| 2 | E10 | **Decidir licencia y precio** (bloquea la publicación, no el desarrollo) | Estudio | ⬜ tú |

### Etapa 1: lo que pediste en las pruebas (≈ 5–7 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 3 | E5 | **Nombres legibles automáticos**: C5 se llama «Precio unitario» (el texto de su izquierda), en el panel, los gráficos, el PDF y el volcado | Pruebas |
| 4 | E6 | **Elegir la salida en Resultados**: selector arriba y tabla resumen de todas; si se puede, que al seleccionar una salida en la hoja el panel salte a ella | **Tú** |
| 5 | C7 | **Informe PDF del proyecto**: título, descripción y un párrafo de lectura de los resultados | **Tú** |
| 6 | E7 | **Administrador de escenarios**: varios escenarios con nombre, compararlos, borrarlos | **Tú** |
| 7 | E8 | **Color propio para las celdas con `RIESGO.*`** | **Tú** |
| 8 | F4 | Núcleos en automático según el tamaño (con poco trabajo, 1 núcleo es más rápido) | Pruebas |

### Etapa 2: funciones RIESGO completas y la cinta (≈ 6–8 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 9 | B1 | Runtime compartido (panel, cinta y funciones en el mismo proceso); hace más rápidos los botones de la cinta | Plan |
| 10 | B2 | **Interruptor «Determinístico / Probabilístico»** en la cinta: las `RIESGO.*` muestran un valor fijo (media, moda, mediana o percentil) o uno aleatorio que cambia con F9 | **Tú** |
| 11 | B3 | **Cinta que actúa sin abrir el panel**: marcar entrada, marcar salida, simular, quitar resaltado | **Tú** |

### Etapa 3: gráficas, exportación y ajuste (≈ 8–10 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 12 | C1 | **Hoja «Resumen de entradas y salidas»** al volcar (distribuciones, estadísticos, orden en el tornado) | **Tú** |
| 13 | C2 | Tornado, araña y comparación de escenarios como gráficos nativos de Excel en el volcado | **Tú** (gráficas) |
| 14 | C5 | **Vista previa de la distribución** al editarla (su forma y p5/p50/p95) | Plan |
| 15 | I1 | **Ajuste rápido y explicado**: diagnóstico de los datos, AICc, Cramér–von Mises, histograma con la curva encima (**el gráfico de distribución que pediste en D1**), Q-Q, gamma exacta, distribución empírica y `RIESGO.EMPIRICA` | **Tú** (investigación y D1) |
| 16 | C8 | **Hoja volcada legible** (secciones por salida, formato de tabla) | **Tú** |

### Etapa 4: más funciones y análisis (≈ 8–12 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 17 | B4 | `RIESGO.DISCRETA`, distribuciones truncadas, `RIESGO.LOGNORMAL2` | **Tú** (lista de funciones) |
| 18 | B6 | `RIESGO.SALIDA()`, y traer resultados a la hoja: `RIESGO.MEDIA`, `RIESGO.PERCENTIL`, `RIESGO.PROB`, `RIESGO.DESV`; correlación desde la fórmula | **Tú** (lista de funciones) |
| 19 | D1 | **Análisis de escenarios por cola**: qué entradas pesan cuando la salida cae en su peor 10 % | Plan |
| 20 | H2 | **Más medidas de riesgo**: VaR, CVaR, asimetría, curtosis, semidesviación | Plan |
| 21 | I2 | **Ajuste orientado al riesgo**: error en percentiles P50–P99, bootstrap, discretas | **Tú** (investigación) |
| 22 | C3 | Exportar las iteraciones a una hoja | Plan |
| 23 | C4 | Gráficas nuevas: dispersión entrada × salida, caja y bigotes, abanico por periodos, curvas superpuestas | **Tú** (gráficas) |

### Etapa 5: el resto del plan (sin orden fijo entre sí, ≈ 15–25 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 24 | B5 | Distribuciones nuevas: t de Student, logística, log-logística, Pareto, geométrica, binomial negativa, hipergeométrica, uniforme entera, Trigen, general/histograma | **Tú** (lista de funciones) |
| 25 | B7 | `RIESGO.*` con celdas como argumentos (`=RIESGO.NORMAL(B2;15)`) y dentro de operaciones | Plan |
| 26 | C6 | Percentiles configurables | Plan |
| 27 | D2 | Análisis de estrés: fijar una entrada en un percentil | Plan |
| 28 | D3 | Salidas que son un rango (C28:H28 como una salida por periodos) | Plan |
| 29 | D4 | **Tornado de cambio en la salida**: cuánto sube o baja la media (o un percentil) de la salida entre el valor bajo y el alto de cada entrada, en unidades de la salida | **Nuevo** |
| 30 | E1 | Tabla con todas las entradas (incluidas las `RIESGO.*`) y edición rápida | Plan |
| 31 | E2 | Matriz de correlaciones visible y editable | Plan |
| 32 | E3 | Deshacer el último cambio del modelo | Plan |
| 33 | E4 | Ayuda contextual (qué es cada distribución, gráfico y número) | Estudio |
| 34 | U1 | **Asistente del primer modelo y plantillas** (proyecto de inversión, presupuesto…): paso a paso para quien empieza | **Nuevo** (el estudio pedía «asistentes») |
| 35 | H3 | Simulaciones en serie (precio 100 / 110 / 120, lado a lado) | Plan |
| 36 | H4 | Búsqueda de objetivo con riesgo («¿qué precio deja P(VAN<0) bajo el 10 %?») | Plan |
| 37 | H5 | Series temporales (paseo aleatorio, reversión a la media) | Plan |
| 38 | H6 | Avisos de coherencia del modelo | Plan |
| 39 | H7 | Trazado de dependencias (qué salidas dependen de cada entrada) | Plan |
| 40 | H8 | Migración del modelo guardado entre versiones | Plan |
| 41 | H9 | Manual de usuario en español y más libros de ejemplo | Plan |
| 42 | H10 | Libros compartidos en OneDrive/SharePoint (coautoría) | Estudio |
| 43 | F1 | `DESREF` con desplazamientos constantes; `LAMBDA` | Plan |
| 44 | F2 | Medir y optimizar con libros grandes (el de 132 hojas) | Plan |
| 45 | F3 | Modo compatible más rápido | Plan |
| 46 | F5 | **Congelar la pantalla en el modo compatible** (como `ScreenUpdating` en VBA) | **Tú** |

### Etapa 6: producto y publicación (≈ 17–25 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 47 | E9 | Prueba en Mac, instalación sin `npm start`, manifiesto de producción | Plan |
| 48 | E10 | Servidor HTTPS permanente, interfaz en inglés, licencia, privacidad, mensajes de error para desconocidos | Plan / Estudio |
| 49 | E11 | Publicación en AppSource (la tienda de Microsoft) | Plan |

### Cierre: tutoriales y manual (≈ 6–9 días) — lo último antes de publicar

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 50 | M1 | **Tres libros tutoriales**: «Feria de fin de semana» (sencillo, un periodo), «Proyecto Aurora» (el actual, ampliado) y «Parque solar Altamira» (completo, todo el potencial). Diseño en `docs/LIBROS_TUTORIAL.md` | **Tú** |
| 51 | M2 | **Manual en HTML** con índice, buscador, lectura paso a paso, tutoriales y preguntas frecuentes; botón «Ayuda» en el panel | **Tú** |

### Después de la versión 1.0

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 52 | E12 | Depurador de escenarios (ver una iteración mala celda a celda) | Estudio |
| 53 | E12 | Conversor de modelos de @RISK | Estudio |
| 54 | E12 | Narrativa de resultados con reglas (se adelanta en parte con C7) | Estudio |
| 55 | I3 | Ajuste avanzado: colas extremas (GPD), datos censurados, mezclas | **Tú** (investigación) |

### Otros productos, fuera de este complemento (decidido el 25/09)

| Producto | Origen |
|---|---|
| Optimización bajo incertidumbre | **Tú** |
| Árboles de decisión | **Tú** |
| Muestreo avanzado (Sobol, cópulas) | **Tú** |
| Pruebas automáticas en Excel real | **Tú** |

### Rechazado expresamente (para no reabrirlo sin datos nuevos)

Cálculo en la nube, cualquier uso de IA externa (quitado a petición tuya el
27/09), integración con Python en Excel, nube propia de colaboración.

---

## 3. Tus peticiones, una por una

| Petición | Dónde quedó |
|---|---|
| Núcleos configurables con un botón arriba | ✅ hecho (⚙ y cinta) |
| Iteraciones configurables, panel de configuración | ✅ hecho |
| Modo determinístico / probabilístico | B2 (etapa 2) |
| Lista de funciones RIESGO pendientes | B4, B5, B6 |
| Gráficas y hoja de resumen de entradas y salidas | C1, C2, C4, C8 |
| Otros programas para el futuro | Tabla «Otros productos» |
| Estudio de mercado 1 (multiplataforma, compartir, precio, tornado, ajuste) | Hechos, salvo precio (E10) |
| Estudio 2 + motor de ajuste | Bloque I (I1, I2, I3) |
| Quitar lo de la IA | ✅ quitado |
| Gráfico de distribución en el ajuste (D1) | I1 |
| Color para las celdas con fórmula del complemento (E1) | E8 |
| Elegir la salida en Resultados | E6 |
| Administrador de escenarios | E7 |
| PDF que hable del proyecto | C7 (+ E5) |
| Hoja volcada difícil de leer (C3) | C8 |
| Cinta más rápida (B4 tarda una fracción de segundo) | B1 debería mejorarlo |
| Congelar la pantalla en el modo compatible (G3) | F5 |
| `npm start` hay que repetirlo (C4) | Desaparece con la instalación real (E9) |
| Tres libros tutoriales (sencillo, Aurora, completo) | M1, al final |
| Manual en HTML con índice | M2, lo último |
