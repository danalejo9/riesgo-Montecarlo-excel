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
| 1b | N | **Ronda del bloque N** (guía, «Ronda del 29/09»): repetir **N4**; **N5**, **N7–N39**; **W6**, **W7** (Web) y la prueba en Mac. Lista completa en `PLAN_CRONOGRAMA_QSRA.md` §4, pista A. Va **antes** que el cronograma | Pruebas | ⬜ tú |
| 2 | E10 | **Decidir licencia y precio** (bloquea la publicación, no el desarrollo). Sigue pendiente (decisión 22, 30/09); moneda configurable (decisión 23) | Estudio | ⬜ tú |

### Etapa 1: lo que pediste en las pruebas — ✅ hecha el 28/09 (falta tu prueba, bloque L de la guía)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 3 | E5 | ✅ **Nombres legibles automáticos**: C5 se llama «Precio unitario» (el texto de su izquierda), en el panel, los gráficos, el PDF y el volcado | Pruebas |
| 4 | E6 | ✅ **Elegir la salida en Resultados**: selector arriba y tabla resumen de todas; si se puede, que al seleccionar una salida en la hoja el panel salte a ella | **Tú** |
| 5 | C7 | ✅ **Informe PDF del proyecto**: título, descripción y un párrafo de lectura de los resultados | **Tú** |
| 6 | E7 | ✅ **Administrador de escenarios**: varios escenarios con nombre, compararlos, borrarlos | **Tú** |
| 7 | E8 | ✅ **Color propio para las celdas con `RIESGO.*`** | **Tú** |
| 8 | F4 | ✅ Núcleos en automático según el tamaño (con poco trabajo, 1 núcleo es más rápido) | Pruebas |

### Etapa 1b: lo que pediste en la tercera ronda — ✅ hecha el 28/09

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 8a | C8 | ✅ **Hoja volcada legible** (sube desde la etapa 3: la pediste dos veces) | **Tú** |
| 8b | C9 | ✅ **Ver cómo se muestreó cada entrada**: histograma, acumulada y estadísticos de los valores generados, con la distribución teórica encima | **Tú** |
| 8c | F5 | ✅ **Congelar la pantalla en el modo compatible** (la pediste dos veces) | **Tú** |
| 8d | F6 | ~~Reproducibilidad del modo compatible~~: casi seguro la distribución quedó distinta; se recomprueba en la ronda completa | Pruebas |

### Bloque T: variables de texto y sí/no — ✅ T1–T4 y T6 hechos el 28/09 (T5, el manual, va con M; T7–T9 después de la etapa 2) — después de la etapa 1b; diseño cerrado contigo el 28/09

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| T1 | T1 | ✅ **Entradas de texto**: «Norte» 20 %, «Sur» 25 %… | **Tú** |
| T2 | T2 | ✅ **Salidas de texto**: frecuencia de cada valor, cuál sale más, probabilidad de un valor | **Tú** |
| T3 | T3 | ✅ Sensibilidad cruzada: salida numérica por categoría; qué entradas deciden una salida de texto | **Tú** |
| T4 | T4 | ✅ `RIESGO.CATEGORIA` y «Preparar para compartir» | **Tú** |
| T5 | T5 | Manual, tutorial y pruebas con textos | **Tú** |
| T6 | T6 | ✅ Salidas de sí/no (VERDADERO/FALSO): probabilidad y qué lo decide | **Tú** (confirmado 28/09) |
| T7 | T7 | ✅ (29/09, falta Excel real) Entradas y salidas de fecha (percentiles en fechas, dispersión en días), según el formato de la celda; también en «Todas las entradas» y en la hoja volcada | Después de la etapa 2 |
| T8 | T8 | ✅ (29/09, falta Excel real) Registro de riesgos: `RIESGO.EVENTO(p; impacto)` en una tabla de la hoja y su vista en Resultados (valor esperado y parte del total), en la hoja volcada y en el informe PDF | Después de la etapa 2 |
| T9 | T9 | ✅ (29/09, falta Excel real) Opciones de decisión (A / B / C) simuladas y comparadas lado a lado: `RIESGO.DECISION`, mismos números aleatorios, hasta 16 combinaciones, solo motor rápido | Después de la etapa 2 |

### Etapa 2: funciones RIESGO completas y la cinta (≈ 6–8 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 9 | B1 | ✅ (29/09, falta Excel real) Runtime compartido (panel, cinta y funciones en el mismo proceso): la cinta cambia de pestaña sin recargar el panel, y `RIESGO.MEDIA` y compañía tienen los resultados también al abrir el libro en otro equipo | Plan |
| 10 | B2 | ✅ (29/09, falta Excel real) **Interruptor «Determinístico / Probabilístico»** en la cinta: las `RIESGO.*` muestran un valor fijo (media, moda, mediana o percentil) o uno aleatorio que cambia con F9 | **Tú** |
| 11 | B3 | ✅ (29/09, falta Excel real) **Cinta que actúa sin abrir el panel**: marcar entrada, marcar salida, simular, quitar resaltado | **Tú** |
| 11b | B1b | ✅ (29/09, falta Excel real) **Funciones RIESGO que sortean en el motor compatible**: `=10+RIESGO.NORMAL(0;1)` y los parámetros aleatorios (B7) también con Excel en el bucle, y sin escribir encima de las fórmulas (más seguro). Necesita B1 | **Tú** (28/09) |
| 11c | F5b | ✅ (29/09) **Modo compatible por lotes**: 20 iteraciones por viaje a Excel; repinta y tarda mucho menos, con los mismos números. Falta medirlo en tu Excel | **Tú** (H2) |
| 11d | U2 | ✅ (29/09, falta tu opinión) **Legibilidad del panel**: cifras clave arriba, secciones plegables que se recuerdan, menos texto visible, botones con borde | **Tú** (T6) |
| 11f | U3.1 | ✅ (29/09, falta Excel real) **Explorador de distribución** en ventana flotante: histograma o curva de la celda seleccionada, estadísticas a la derecha, delimitadores que se arrastran | **Tú** (29/09) |
| 11g | U3.2 | ✅ (29/09, falta Excel real) **Cinta reorganizada**: grupos Modelo, Simulación (menú de iteraciones), Análisis, Informes y Ayuda (manual, ejemplos) | **Tú** (29/09) |
| 11h | U3.3 | ✅ (29/09, falta Excel real) **Catálogo visual de distribuciones** en el selector: forma en miniatura y cuándo usarla | **Tú** (29/09) |
| 11i | U3.4 | ✅ (29/09, falta Excel real) **Lista de entradas y salidas** en ventana flotante | **Tú** (29/09) |
| 11j | U3.5–U3.6 | ✅ (29/09, falta Excel real) Menú del clic derecho (marcar entrada, salida, ver distribución) y botón Detener en la cinta | **Tú** (29/09) |
| 11e | C10 | ✅ (29/09, falta Excel real) **Marcas en el histograma**: media, mediana y delimitadores que se arrastran con su porcentaje | **Tú** (sugerencia) |

### Etapa 3: gráficas, exportación y ajuste (≈ 8–10 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 12 | C1 | ✅ **Hoja «Resumen de entradas y salidas»** al volcar (distribuciones, estadísticos, orden en el tornado) | **Tú** |
| 13 | C2 | ✅ Tornado, araña y comparación de escenarios como gráficos nativos de Excel en el volcado | **Tú** (gráficas) |
| 14 | C5 | ✅ **Vista previa de la distribución** al editarla (su forma y p5/p50/p95) | Plan |
| 15 | I1 | ✅ **Ajuste rápido y explicado**: diagnóstico de los datos, AICc, Cramér–von Mises, histograma con la curva encima (**el gráfico de distribución que pediste en D1**), Q-Q, gamma exacta, distribución empírica y `RIESGO.EMPIRICA` | **Tú** (investigación y D1) |

### Etapa 4: más funciones y análisis (≈ 8–12 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 17 | B4 | ✅ `RIESGO.DISCRETA`, distribuciones truncadas, `RIESGO.LOGNORMAL2` | **Tú** (lista de funciones) |
| 18 | B6 | ✅ (28–29/09, falta Excel real de lo último) **Traer resultados a la hoja**: `RIESGO.MEDIA`, `RIESGO.DESV`, `RIESGO.PERCENTIL`, `RIESGO.PROB` (también de un texto), `RIESGO.MIN`, `RIESGO.MAX`; y **declarar desde la fórmula**: `RIESGO.SALIDA("nombre")` y `RIESGO.CORRELACION(celda1; celda2; coef)` | **Tú** (lista de funciones) |
| 19 | D1 | ✅ **Análisis de escenarios por cola**: qué entradas pesan cuando la salida cae en su peor 10 % | Plan |
| 20 | H2 | ✅ **Más medidas de riesgo**: VaR, CVaR, asimetría, curtosis, semidesviación | Plan |
| 21 | I2 | ✅ (29/09, falta Excel real) **Ajuste orientado al riesgo**: error en percentiles por objetivo (general, cola alta, cola baja), tabla percentil a percentil, bootstrap, Poisson, binomial y binomial negativa | **Tú** (investigación) |
| 22 | C3 | ✅ (29/09, falta Excel real) Exportar las iteraciones a una hoja (entradas y salidas emparejadas, hasta 100.000) | Plan |
| 23 | C4 | ✅ (29/09, falta Excel real) Gráficas nuevas: dispersión entrada × salida, caja y bigotes, abanico por periodos, curvas superpuestas | **Tú** (gráficas) |

### Etapa 5: el resto del plan (sin orden fijo entre sí, ≈ 15–25 días)

| # | Código | Funcionalidad | Origen |
|---|---|---|---|
| 24 | B5 | ✅ (29/09, falta Excel real) Distribuciones nuevas: t de Student, logística, log-logística, Pareto, geométrica, binomial negativa, hipergeométrica, uniforme entera, Trigen, general/histograma | **Tú** (lista de funciones) |
| 25 | B7 | ✅ (28/09) `RIESGO.*` con celdas o cálculos como argumentos (`=RIESGO.NORMAL(B2;15)`), dentro de operaciones y con parámetros que dependen de otra celda aleatoria (los dos últimos, solo con el motor rápido) | **Tú** (prueba E4) |
| 26 | C6 | Percentiles configurables | Plan |
| 27 | D2 | ✅ (29/09, falta Excel real) Análisis de estrés: fijar una entrada en un percentil | Plan |
| 28 | D3 | ✅ (29/09, falta Excel real) Salidas que son un rango (C28:H28 como una salida por periodos) | Plan |
| 29 | D4 | ✅ (29/09, falta Excel real) **Tornado de cambio en la salida**: cuánto sube o baja la media (o un percentil) de la salida entre el valor bajo y el alto de cada entrada, en unidades de la salida | **Nuevo** |
| 30 | E1 | ✅ (29/09) Tabla con todas las entradas (incluidas las `RIESGO.*`) y edición rápida | Plan |
| 31 | E2 | ✅ (29/09) Matriz de correlaciones visible y editable | Plan |
| 32 | E3 | ✅ (29/09) Deshacer el último cambio del modelo | Plan |
| 33 | E4 | ✅ (29/09) Ayuda contextual (qué es cada distribución, gráfico y número) | Estudio |
| 34 | U1 | ✅ (29/09, falta Excel real) **Asistente del primer modelo y plantillas** (proyecto de inversión, presupuesto…): paso a paso para quien empieza | **Nuevo** (el estudio pedía «asistentes») |
| 35 | H3 | ✅ (29/09, con `RIESGO.DECISION`) Simulaciones en serie (precio 100 / 110 / 120, lado a lado) | Plan |
| 36 | H4 | ✅ (29/09, falta Excel real) Búsqueda de objetivo con riesgo («¿qué precio deja P(VAN<0) bajo el 10 %?») | Plan |
| 37 | H5 | ✅ (29/09, con fórmulas encadenadas y una plantilla) Series temporales (paseo aleatorio, reversión a la media) | Plan |
| 38 | H6 | ✅ (29/09) Avisos de coherencia del modelo | Plan |
| 39 | H7 | ✅ (29/09) Trazado de dependencias (qué salidas dependen de cada entrada) | Plan |
| 40 | H8 | ✅ (29/09) Migración del modelo guardado entre versiones | Plan |
| 41 | H9 | Manual de usuario en español y más libros de ejemplo | Plan |
| 42 | H10 | Libros compartidos en OneDrive/SharePoint (coautoría) | Estudio |
| 43 | F1 | ✅ (29/09, falta Excel real: N33) `DESREF` con desplazamientos constantes; `LAMBDA` en la celda, en LET y con nombre; nombres definidos (constantes, celdas, rangos). Recursivas y MAP/REDUCE, al compatible | Plan |
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

### Módulo Cronograma (QSRA) — aprobado el 30/09, en paralelo (≈ 35–45 días)

Diagnóstico y decisión en `PLAN_CRONOGRAMA_QSRA.md`: **dentro de este
complemento**, no como producto aparte. Las pruebas N van primero.

| # | Código | Funcionalidad | Origen | Estado |
|---|---|---|---|---|
| P0 | P0 | Plantilla «Actividades», predecesoras `3FS+2d`, capa de capacidades por licencia, catálogo de textos, moneda configurable | Estudios QSRA + **Tú** | ✅ 30/09 (falta Excel: Q1–Q11) |
| P1 | P1 | CPM determinista: 4 relaciones, retardos, calendarios, restricciones, avance | Estudios QSRA | ✅ 30/09 avance y restricciones (falta Excel: Q26–Q30); calendarios por actividad en V7 |
| P2 | P2 | Chequeo de salud del cronograma (DCMA‑14) con semáforo | Estudios QSRA | ✅ 30/09 (falta Excel: Q11–Q12) |
| P3 | P3 | Monte Carlo del cronograma: *risk drivers*, 3 puntos por categoría, curva S, P80, criticidad, tornado en días, Gantt probabilístico | Estudios QSRA | ✅ 30/09 (falta Excel: Q13–Q20) |
| P3b | P3b | Simulación del plazo repartida en varios núcleos (Web Workers) | Plan | ✅ 30/09 (6,3 s para 5.000 × 10.000 en 4 hilos) |
| P3c | P3c | **Ver el cronograma**: ventana con Gantt interactivo (flechas, zoom, criticidad, P10–P90) y hoja «Cronograma (Gantt)» para compartir | **Tú** (30/09) | ✅ 30/09 (falta Excel: Q21–Q25) |
| P4 | P4 | Importar MS Project (XML) y Primavera P6 (XER), con verificación de fechas | **Tú** | ✅ 30/09 (falta Excel: Q31–Q35, y tus cronogramas reales) |
| P5 | P5 | Costo + plazo en la misma simulación: costos que dependen del tiempo y JCL | Estudios QSRA | ✅ 30/09 JCL y hoja «Plazo simulado» para el modelo de costos (falta Excel: Q36–Q40) |
| V1 | P6 | Mitigación antes y después (respuestas, costo, ahorro por unidad invertida) | **Tú** (30/09) | ✅ 30/09 (falta Excel: Q42–Q44) |
| V2 | P6 | Riesgos que añaden trabajo (ramificación probabilística) | **Tú** | ✅ 30/09 (falta Excel: Q45) |
| V3 | P6 | Informe ejecutivo PDF configurable, costos y cronograma (título, logo, pie, secciones) | **Tú** | ✅ 30/09 (falta Excel: Q46–Q48) |
| V4 | P6 | Incertidumbre en los costos de cada actividad | **Tú** | ✅ 30/09 (falta Excel: Q49–Q50) |
| V5 | P6 | Seguimiento en el tiempo (instantáneas y tendencia del P80) | **Tú** | ✅ 30/09 (falta Excel: Q51–Q52) |
| V6 | P6 | Rangos por sector y ayudas para estimar (P10/P90, avisos de optimismo) | **Tú** | ✅ 30/09 (falta Excel: Q53–Q55) |
| V7 | P6 | Calendarios por actividad | **Tú** | ✅ 30/09 (falta Excel: Q56–Q58) |
| V8 | P6 | Clima probabilístico | **Tú** | ✅ 30/09 (falta Excel: Q59–Q60) |
| V9 | P6 | Devolver resultados a MS Project y P6 | **Tú** | ✅ 30/09 (falta Excel/MSP/P6: Q61–Q62) |
| V10 | P6 | Registro de riesgos completo (matriz, responsables, estado) | **Tú** | ✅ 30/09 (falta Excel: Q63–Q64) |
| V11 | P6 | Simulación rápida mientras se edita, configurable | **Tú** | ✅ 30/09 (falta Excel: Q65–Q66) |
| W1 | P7 | Hitos contractuales y multas por retraso | **Tú** (30/09) | ✅ 30/09 (falta Excel: Q67) |
| W2 | P7 | Reserva de contingencia y su reparto por riesgo | **Tú** | ✅ 30/09 (falta Excel: Q68) |
| W3 | P7 | Casos de validación publicables (GAO, AACE, merge bias) | **Tú** | ✅ 30/09 analíticos y contra Python (`docs/VALIDACION_CRONOGRAMA.md`); ⬜ ejemplos publicados de GAO/AACE |
| W4 | P7 | Merge bias explicado con un gráfico | **Tú** | ✅ 30/09 (falta Excel: Q69) |
| W5 | P7 | `RIESGO.CRONOGRAMA("Hito")` en el modelo de costos | **Tú** | ✅ 30/09 (falta Excel: Q70–Q71) |
| W6 | P7 | Plantillas por sector y guía de primer uso | **Tú** | ⬜ |
| W7 | P7 | Escenarios «¿qué pasa si?» | **Tú** | ⬜ |
| H, I | — | Referencias de SECOP; cadenas de eventos | **Tú** | aplazados (30/09) |

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
| Tres estudios de riesgo de cronograma (QSRA), 30/09 | Módulo Cronograma, P0–P6 (`PLAN_CRONOGRAMA_QSRA.md`) |
| Libro de pruebas propio para el cronograma | ✅ `ejemplos/demo-cronograma.xlsx` + bloque Q de la guía |
| Versión 2 del cronograma (30/09): calendarios, clima, mitigación, PDF configurable y A–K | Bloque V (V1–V11), `PLAN_CRONOGRAMA_QSRA.md` §4.1 |
| Ver el cronograma dibujado (Gantt), como otros programas | P3c: ventana interactiva + hoja de Gantt |
| No perder de vista las pruebas N | Fila 1b y pista A del plan: van primero |
| Quitar lo de la IA | ✅ quitado |
| Gráfico de distribución en el ajuste (D1) | I1 |
| Color para las celdas con fórmula del complemento (E1) | E8 |
| Elegir la salida en Resultados | E6 |
| Administrador de escenarios | E7 |
| PDF que hable del proyecto | C7 (+ E5) |
| Hoja volcada difícil de leer (C3, y otra vez en L3) | C8, sube a la etapa 1b |
| Ver la distribución generada de cada entrada tras simular | C9, etapa 1b |
| Que no se muevan las celdas al simular con Excel (otra vez) | F5, etapa 1b |
| Estadísticas de variables de texto (entradas y salidas) | Bloque T |
| Cinta más rápida (B4 tarda una fracción de segundo) | B1 debería mejorarlo |
| Congelar la pantalla en el modo compatible (G3) | F5 |
| `npm start` hay que repetirlo (C4) | Desaparece con la instalación real (E9) |
| Tres libros tutoriales (sencillo, Aurora, completo) | M1, al final |
| Manual en HTML con índice | M2, lo último |
