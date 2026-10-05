# QRSA: análisis de brechas y plan de trabajo

*05/10/2026. Auditoría del código contra `docs/QRSA_ESPECIFICACION.md`
(especificación del usuario) y plan por fases. **No se ha empezado a
implementar**: el usuario pidió revisar primero cómo trabajarlo.*

## Resumen

El complemento ya tiene casi todo lo que **rodea** a un análisis de riesgo
de cronograma: el muestreo (Monte Carlo, hipercubo latino, semilla
reproducible), las distribuciones (triangular, PERT con λ, Trigen por
percentiles, lognormal, discreta), la correlación de rangos por Iman-Conover,
el registro de riesgos, la contingencia (P80 − base), los gráficos, el
explorador, la hoja volcada, el informe PDF y un motor en memoria con hilos
que ya cumple el rendimiento pedido.

Lo que **no existe** es el núcleo: un **motor CPM** que recalcule la red
(ida y vuelta) en cada iteración, con sus cuatro tipos de relación, desfases,
calendarios con festivos y restricciones. Hoy un cronograma solo se puede
modelar con fórmulas de Excel (`=MAX(fin A; fin B)`, como la plantilla
«Cronograma de obra»). Así la fecha de entrega sí recoge el sesgo de
convergencia, pero no hay ruta crítica, holguras, índice de criticidad,
calendarios ni importación de MS Project o P6.

## Decisión de arquitectura (confirmada por el usuario el 05/10)

**Un módulo de cronograma dentro del mismo complemento, con su propio motor
CPM, que no pasa por el grafo de fórmulas.**

- `engine/cronograma/`: funciones puras sin Excel (red, orden topológico,
  ciclos, ida y vuelta con FC/CC/FF/CF y desfases, calendarios, restricciones,
  criticidad). Trabaja sobre arreglos: por iteración, las duraciones
  muestreadas entran y salen las fechas, las holguras y las marcas de crítica.
- **Se reutiliza sin cambios** lo que ya está probado: `engine/sampling`
  (MC, LHS, Iman-Conover, flujos con semilla), `engine/distributions`,
  `engine/stats` (percentiles, curvas, histogramas, sensibilidad), el pool de
  hilos, el registro de riesgos, la contingencia, el explorador, la hoja
  volcada y el PDF.
- `excel/cronograma*.ts`: lectura y validación de las hojas (`Actividades`,
  `Relaciones`…) con errores por hoja, fila y columna; escritura de
  `Resultados_*` en bloque.
- **UI**: una pestaña «Cronograma» en el panel y un grupo en la cinta (Crear
  libro de cronograma, Revisar calidad, Simular cronograma). Los resultados
  usan los mismos componentes de Resultados.

**Por qué no por fórmulas.** El grafo de fórmulas sirve para cualquier
modelo, pero no sabe qué es una holgura ni una relación CC con desfase
negativo, y una red de 500 actividades en fórmulas sería frágil y lenta de
leer. Un motor CPM dedicado es lo que hacen las herramientas de referencia
(AACE 57R-09) y es el único camino para validar contra MS Project con 0 días
de tolerancia. El motor de fórmulas sigue para lo demás, y los dos se pueden
**unir**: las fechas y costos del cronograma pueden alimentar celdas del libro
(por ejemplo, un flujo de caja que depende de la fecha de entrega) en una
fase posterior.

**Rendimiento.** 500 actividades × 5.000 iteraciones son 2,5 millones de
pasos de ida y vuelta: en JavaScript con arreglos tipados es del orden de
segundos, lejos de los 60 s del criterio. Office.js + Web Workers, que ya es
la arquitectura del complemento, basta; no hace falta un motor compilado.
Se medirá en el banco con un cronograma sintético de 500 actividades antes
de darlo por cumplido.

## Tabla de brechas por sección

| § | Tema | Estado | Qué hay hoy | Qué falta |
|---|---|---|---|---|
| 1 | Principio rector (red recalculada por iteración) | **Parcial** | Con fórmulas `MAX` la fecha de cada iteración es correcta y recoge el sesgo de convergencia (plantilla «Cronograma de obra», media 249,5 d frente a 217 d del plan) | La red CPM real con ida y vuelta |
| 2 | Modelo de datos en hojas | **No existe** | Modelo propio: entradas y salidas en el panel o con funciones RIESGO | Las 9 hojas, con validación de datos y errores por fila y columna; un «Crear libro de cronograma» que las genere |
| 3 | Importación | **No existe** | — | Tabla nativa (P1), MS Project XML (P2), P6 XER (P3), resumen tras importar |
| 4.1 | CPM determinístico | **No existe** | — | Orden topológico, ciclos, FC/CC/FF/CF con desfases (también negativos), holgura total y libre, calendarios con festivos, SNET/FNLT/MSO/MFO, hitos, validación contra MS Project |
| 4.2 | CPM por iteración | **No existe** | El muestreo y el bucle por bloques ya existen | Ida y vuelta por iteración, marcas de crítica, arreglos de resultados |
| 5.1 | Distribuciones | **Cumple** | Triangular, PERT con λ (4 por defecto), uniforme, lognormal, discreta, **Trigen** con P10/P90 configurables; validación de parámetros | Solo la entrada en la hoja `Incertidumbre` |
| 5.2 | Factores por grupo | **No existe** | — | Rango en % de la duración base por WBS / tipo / contratista, con prioridad del rango propio |
| 6 | Riesgos discretos | **Parcial** | `RIESGO.EVENTO` (Bernoulli × impacto), registro, matriz de probabilidad e impacto | Un riesgo que afecta **varias actividades a la vez** (mismo sorteo); impacto en días **y** costo; pre/post mitigación con su costo; oportunidades; riesgo como actividad insertada; ramificación (fase 3) |
| 7 | Costos | **Parcial** | Cualquier fórmula de Excel (tarifa × duración); contingencia P80 − base (V1) | Modelo estructurado: fijo, dependiente del tiempo, por recurso; costo de los riesgos; escalamiento |
| 8 | Correlación | **Parcial** | Iman-Conover de rangos, por pares; detección de matrices imposibles | Grupos con coeficiente común; **corrección de Higham** (hoy se rechaza la matriz); comprobación ±0,05 en el informe; aviso si no hay correlaciones |
| 9 | Motor de simulación | **Parcial** | MC y LHS, semilla, iteraciones, cálculo en memoria con hilos, progreso, Cancelar y Detener; decisión Office.js + Workers ya documentada | LHS **por defecto** (hoy Monte Carlo); convergencia por **P80 en bloques de 500** (hoy por el margen de la media); medir 500 × 5.000 |
| 10.1 | Salidas de cronograma | **Parcial** | Histograma, curva S, percentiles, probabilidad de cumplir un umbral y el valor base, fechas (T7) | Tabla P10…P90, varios hitos a la vez desde la red |
| 10.2 | Drivers | **Parcial** | Tornado por correlación de rangos (≈ *cruciality*) y por cambio en la salida | **Índice de criticidad**, SSI, **tornado por eliminación de riesgos**, rutas críticas frecuentes |
| 10.3 | Costo | **Parcial** | Histograma, curva S, P50/P80, contingencia | Desglose de la contingencia por riesgo y por incertidumbre |
| 10.4 | Integradas | **Parcial** | Dispersión entrada–salida; escenarios y curvas superpuestas (comparación manual) | Dispersión costo–fecha con **JCL**; pre/post automático; cronograma ajustado P80 |
| 10.5 | Reporte | **Parcial** | Informe PDF y hoja volcada con supuestos, semilla, iteraciones y registro de riesgos; iteraciones a una hoja | Advertencias de calidad del cronograma, top 10 de riesgos por eliminación, CSV |
| 11 | Chequeo de calidad (DCMA) | **No existe** | Avisos de coherencia genéricos (H6) | Los 9 criterios con semáforo y lista de actividades |
| 12 | Arquitectura | **Cumple** (falta un detalle) | Capas datos (`excel/`) → motor puro (`engine/`) → UI (`ui/`); motor probado sin Excel; configuración como objeto | Registrar la **versión del complemento** en cada corrida |
| 12 | Pruebas obligatorias | **Parcial** | 3 reproducibilidad ✓, 4 distribuciones ✓, 5 correlación (parcial), 6 eventos (parcial) | 1 contra MS Project, 2 sesgo de convergencia, 7 costo por tiempo |
| 14 | Aceptación | **Parcial** | Rendimiento y regeneración de salidas ya son así en el motor de fórmulas | Todo lo anterior aplicado al cronograma |

## Plan por fases (bloque Q del roadmap)

### Q0. Antes de escribir código

**Estado (05/10): decisiones confirmadas; falta la comprobación en
ProjectLibre.** El usuario aceptó las recomendaciones: «La arquitectura, la
que hice. La semana laboral también. Los desfases. El reenvío también, pero
quiero que te hagan en una opción. Y el proyecto libre, pues yo lo puedo
instalar y probar.»

- **Q0.1 Arquitectura** ✅: módulo de cronograma con motor CPM propio dentro
  del mismo complemento (la de arriba).
- **Q0.2 Validación sin MS Project** ✅ preparada. La prueba obligatoria 1
  se cambia por tres fuentes independientes:
  1. **Casos de libro con solución publicada** (redes clásicas de CPM con
     sus fechas y holguras calculadas a mano).
  2. **Una segunda implementación en Python**, escrita aparte del motor:
     `tests/fixtures/qrsa/generar-referencias.py`. Calcula las mismas redes y
     el motor tendrá que dar lo mismo, día por día.
  3. **ProjectLibre** (gratuito y de código abierto, lee el formato XML de
     MS Project): el usuario lo instala y abre los tres cronogramas de
     referencia (guía, bloque Q).
- **Cronogramas de referencia** (en `tests/fixtures/qrsa/`, generados por el
  script; cada uno con su `*-esperado.csv` de fechas y holguras):
  - `R1-simple.xml`: 7 actividades, solo FC. Termina el 21/01/2027 (14 días
    laborables); ruta crítica A-B-D-F-M; C y E con 4 días de holgura.
  - `R2-relaciones.xml`: CC, FF y CF, un desfase negativo, SNET y FNLT.
    Termina el 25/02/2027; G y H con holgura −1 (la FNLT del 24/02 no se
    cumple), que es lo que tiene que señalar el motor.
  - `R3-calendario.xml`: calendario de 2027 con los festivos de Colombia y un
    desfase de 7 días calendario (el curado). Termina el 24/11/2027 (220 días
    laborables); el vaciado termina el 05/08 y el desencofrado empieza el
    13/08.
  - `festivos-colombia.csv`: los festivos de 2026 a 2030 (90).
- **Sin cronogramas reales** del usuario: además se generarán en Q1 una obra
  mediana de unas 60 actividades, un proyecto de restauración y siembra con
  semana de lunes a sábado, y uno sintético de 500 para el rendimiento.
- **Q0.3 Reglas de calendario** ✅ confirmadas:
  - Duraciones en días laborables del calendario de la actividad.
  - **Semana de lunes a viernes por defecto**, con la opción de lunes a
    sábado (por calendario), y los festivos de Colombia.
  - **Desfases en días laborables por defecto**, con la opción de días
    calendario por relación (el curado del concreto sigue los fines de
    semana). El desfase cuenta con el calendario de la sucesora, como MS
    Project; el de días calendario empieza a contar a la medianoche que sigue
    al último día laborable de la predecesora.
  - **Redondeo como opción**: por defecto las duraciones simuladas se
    redondean al día entero más cercano (sin sesgo, en fechas, como un
    cronograma real); la alternativa es conservar los decimales.
- **Q0.4 Festivos de Colombia** ✅ en el script de referencia (algoritmo de
  Pascua y traslado al lunes de la ley Emiliani); en Q1 el complemento los
  genera para los años del proyecto, editables en la hoja `Calendario`.
- **Pendiente para cerrar Q0**: que el usuario abra R1–R3 en ProjectLibre y
  confirme (o no) las fechas de los `*-esperado.csv`. Una diferencia no
  bloquea Q1: se estudia caso por caso (puede ser una convención de
  ProjectLibre, como fechar un hito al final del día anterior).

### Q1. MVP: un análisis de riesgo de cronograma válido (fase 1 de la especificación)

**Estado (05/10): hecho en código; falta la prueba del usuario en Excel
(guía Q5–Q14) y en ProjectLibre (Q1–Q4).**

| Punto | Hecho | Dónde |
|---|---|---|
| 1. Libro de cronograma | ✅ siete hojas con encabezados, listas desplegables, mensajes de ayuda y el ejemplo de una obra de 14 actividades (calendario de lunes a sábado en la estructura, curado de 7 días calendario, cuatro riesgos y una oportunidad) | `excel/cronogramaHojas.ts`, `excel/cronogramaLibro.ts` |
| 2. Lectura y validación | ✅ columnas por encabezado (se pueden reordenar), errores con hoja, fila, columna y causa, sin errores en cascada; actividades resumen fuera del cálculo con aviso; «Excluir de la simulación» deja la duración fija | `excel/cronogramaHojas.ts` |
| 3. CPM determinístico | ✅ orden topológico, ciclos con sus actividades, FC/CC/FF/CF, desfases laborables o en días calendario (también negativos), varios calendarios, festivos, SNET/FNET/SNLT/FNLT/MSO/MFO, holgura total y libre. **Igual, día por día, a la implementación en Python en R1–R3** | `engine/cronograma/{calendario,red,cpm}.ts` |
| 4. CPM por iteración | ✅ duraciones en días o en % de la base (triangular, PERT, Trigen, uniforme, lognormal), riesgos con varios impactos y un solo sorteo, oportunidades, LHS por defecto, redondeo al día o decimales, opción de ignorar las restricciones duras, Cancelar | `engine/cronograma/{modelo,simulacion}.ts` |
| 5. Salidas | ✅ P10–P90 en fechas y días del fin y de los hitos intermedios, probabilidad de cumplir la fecha determinística y la meta, curva S, histograma, criticidad, *cruciality*, SSI, tornado por eliminación (y la corrida sin ningún riesgo), convergencia del P80 en bloques de 500; hoja `Resultados_Cronograma` con gráfico | `engine/cronograma/analisis.ts`, `excel/cronogramaResultados.ts`, `ui/Cronograma.tsx` |
| 6. Chequeo de calidad | ✅ semáforo por criterio con las actividades: red calculable (bloquea), extremos abiertos, restricciones duras, adelantos, desfases > 5 %, CF, holgura > 44 d, holgura negativa, duraciones > 44 d, tareas sin incertidumbre, correlación | `engine/cronograma/calidad.ts` |
| 7. Pruebas | ✅ 1 (contra Python en R1–R3; ProjectLibre pendiente del usuario), 2 (sesgo de convergencia), 3 (reproducibilidad), 4 (media y percentiles ±1 % con 50.000), 6 (p = 1 y p = 0). **Medida: 300 actividades × 20 riesgos × 5.000 iteraciones, con las 21 corridas del tornado, 4,65 s** en el contenedor (criterio: < 60 s) | `tests/unit/cronograma*.test.ts` |
| UI | ✅ pestaña Cronograma y grupo Cronograma en la cinta (manifiesto 0.7.0.0) | `ui/Cronograma.tsx`, `manifest.xml` |

Decisiones tomadas al implementar (revisables):
- Un hito se fecha al comienzo del día laborable siguiente al fin de su
  predecesora (la convención del CSV de referencia); ProjectLibre lo pone al
  final del día anterior: es el mismo instante.
- Las actividades con la ruta en otro calendario pueden ganar un día de
  holgura por un sábado (lo mismo hace MS Project); baja su criticidad. Se
  explica en la ayuda.
- Por defecto se siguen los hitos intermedios (con predecesora y sucesora);
  en Config se pueden elegir otros.
- La simulación corre en el hilo del panel con pausas cada 500 iteraciones:
  con 4,65 s en el caso grande no hacen falta hilos.

1. **Libro de cronograma**: botón «Crear libro de cronograma» que escribe las
   hojas `Config`, `Calendario`, `Actividades`, `Relaciones`,
   `Incertidumbre`, `Riesgos` e `Impactos` con validación de datos y un
   ejemplo (el cronograma de obra).
2. **Lectura y validación** de esas hojas, con errores por hoja, fila y
   columna (IDs únicos, referencias que existen, parámetros válidos).
3. **Motor CPM determinístico** (`engine/cronograma/`): orden topológico,
   ciclos (con las actividades implicadas), FC/CC/FF/CF con desfases, holgura
   total y libre, hitos, un calendario con festivos, SNET y FNLT.
   **Validado contra los tres cronogramas de MS Project (0 días).**
4. **CPM por iteración**: duraciones muestreadas con la distribución de cada
   actividad (triangular, PERT, Trigen…), riesgos discretos con impacto en
   días sobre una o varias actividades con el mismo sorteo, ida y vuelta,
   marcas de crítica. LHS por defecto en el cronograma.
5. **Salidas**: histograma y curva S del fin y de cada hito, tabla P10…P90,
   probabilidad de cumplir la fecha determinística y la meta, **índice de
   criticidad**, **tornado por eliminación de riesgos** (una simulación
   extra por riesgo con los mismos números aleatorios, como ya se hace en las
   decisiones).
6. **Chequeo de calidad básico**: extremos abiertos, ciclos, restricciones
   duras, desfases negativos, holguras y duraciones > 44 días, actividades
   sin incertidumbre; semáforo con la lista de actividades.
7. **Pruebas**: 1 (MS Project), 2 (sesgo de convergencia), 3, 4 y 6; y la
   medida de 300 actividades × 20 riesgos × 5.000 iteraciones.

### Q2. Integración costo–plazo (fase 2)

**Estado (05/10): hecho en código; falta la prueba del usuario (guía
Q15–Q26).**

| Punto | Hecho | Dónde |
|---|---|---|
| 1. Costos | ✅ hoja Costos: fijo, por tiempo (tarifa × duración simulada de la actividad o del proyecto) y por recurso, con incertidumbre; impactos de costo de los riesgos (también ahorros). **Prueba 7** | `engine/cronograma/simulacion.ts` (`costoDe`), `excel/cronogramaHojas.ts` |
| 2. Correlación | ✅ pares y grupos (IDs, «WBS x», «Grupo y») sobre duraciones y tarifas; **Higham** con aviso si la matriz es imposible; correlación lograda en la hoja y aviso si se aleja más de 0,05 (**prueba 5**); el chequeo de calidad avisa si no hay ninguna | `engine/sampling/higham.ts`, `correlacionar` |
| 3. Contingencia | ✅ Pxx − costo base (percentil configurable, 80 % por defecto) y su desglose por riesgo (eliminación) y por incertidumbre (corrida sin riesgos) | `resumirCosto`, `eliminacion[].reduccionP80Costo` |
| 4. JCL | ✅ probabilidad conjunta con la fecha y el costo meta, dispersión costo–fecha (panel y gráfico en la hoja) | `confianzaConjunta` |
| 5. Pre/post | ✅ probabilidad post, % del impacto post y costo de mitigación por riesgo; segunda corrida con los mismos números; tabla de diferencias y curvas S superpuestas | `comparacionPrePost` |
| 6. Factores por grupo | ✅ fila de Incertidumbre «WBS 3» o «Grupo Siembra», para las actividades sin fila propia (la primera que coincide manda) | `incertidumbreDe` |
| 7. MS Project XML | ✅ tareas, resúmenes, hitos, vínculos y desfases (laborables o transcurridos), calendarios con excepciones, restricciones; R1–R3 importados dan las fechas de referencia | `excel/importarCronograma.ts` |
| 8. Varios calendarios | ✅ desde Q1 (por actividad) y en la importación | |

Decisiones: el costo base usa los valores base y las duraciones base sin
riesgos; el escalamiento usa la fecha media simulada de la actividad (o del
proyecto); en el escenario post el costo de mitigación se suma siempre.
La corrección de Higham aún no se aplica al **motor de fórmulas** (allí el
editor de correlaciones ya impide la matriz imposible); queda en las mejoras
pequeñas.

1. Hoja `Costos`: costo **fijo** con incertidumbre, **dependiente del
   tiempo** (tarifa × duración simulada de la actividad o del proyecto) y
   **por recurso**; impactos de costo de los riesgos. Prueba 7.
2. Correlación por **grupos** y **corrección de Higham** con aviso (sirve
   también al motor de fórmulas); comprobación ±0,05 en el informe; aviso si
   no hay correlaciones. Prueba 5 completa.
3. Contingencia de costo (P80 − base, ya existe como V1) y su desglose por
   riesgo.
4. **JCL**: dispersión costo–fecha con las dos metas y el porcentaje que
   cumple ambas.
5. **Pre y post mitigación**: dos simulaciones con los mismos números
   aleatorios, curvas S superpuestas y tabla de diferencias (incluye el costo
   de la mitigación).
6. **Factores de incertidumbre por grupo** (WBS, tipo, contratista).
7. **Importación de MS Project XML** (tareas, vínculos, desfases,
   calendarios, restricciones, resúmenes ignorados con aviso).
8. **Varios calendarios**.

### Q3. Avanzado (fase 3)

**Estado (05/10): hecho en código; falta la prueba del usuario.**

| Punto | Hecho |
|---|---|
| 1. P6 XER | ✅ PROJECT, CALENDAR (clndr_data: días y excepciones), TASK, TASKPRED, PROJWBS; R1 y R2 dan las fechas de referencia. P6 no trae desfases transcurridos por relación |
| 2. SSI, cruciality, rutas frecuentes | ✅ (SSI y cruciality desde Q1); las 5 rutas críticas más frecuentes con su % |
| 3. Cronograma ajustado | ✅ P50 y P80 de inicio y fin por actividad (hoja) y un Gantt base frente a P80 en el panel (en el panel, no en el explorador) |
| 4. Ramificación y riesgo insertado | ✅ hoja Ramas (opciones con probabilidad; el determinístico sigue la más probable) y modo «Actividad insertada» por riesgo |
| 5. Escalamiento | ✅ por partida, anual, según la fecha simulada |
| 6. Convergencia automática | ✅ en el cronograma: «Automático» sube de 1.000 a 20.000 hasta que el P80 cambie menos del 0,5 %; **pendiente** en el motor de fórmulas |
| 7. Resumen ejecutivo y CSV | ✅ `ui/informeCronograma.html` (imprimible a PDF) y las iteraciones en CSV |

Medida tras Q2/Q3: 300 actividades × 20 riesgos × 5.000 iteraciones, con el
tornado, 3,8 s en el contenedor.

1. Importación de **P6 XER**.
2. **SSI** y *cruciality* por actividad; **rutas críticas más frecuentes**
   (top 5).
3. **Cronograma ajustado por riesgo** (P80 de inicio y fin de cada actividad,
   Gantt en el explorador).
4. Ramificación probabilística; riesgo como actividad insertada en la red.
5. Escalamiento por periodo según la fecha simulada.
6. **Convergencia automática por P80** (bloques de 500, < 0,5 %); también
   para el motor de fórmulas.
7. **Resumen ejecutivo** del cronograma en el informe PDF (supuestos,
   advertencias de calidad, gráficos, top 10 de riesgos); exportación CSV.

### Mejoras pequeñas al motor actual que salen de la auditoría

Sirven ya, sin esperar al cronograma:
- Registrar la **versión del complemento** en cada corrida (hoja volcada y
  PDF).
- **Corrección de Higham** en lugar de rechazar una matriz de correlación
  imposible.
- **Aviso** cuando un modelo con varias entradas no declara ninguna
  correlación.
- Tabla de percentiles **P10…P90** en el explorador y la hoja volcada.
- Valorar el **hipercubo latino por defecto** (cambia los números de los
  libros ya simulados con la misma semilla: decidir con el usuario).

## Dependencias del usuario

- ~~Confirmar la arquitectura (Q0.1) y las reglas de calendario (Q0.3)~~ ✅
  05/10.
- Instalar ProjectLibre y comprobar R1–R3 (guía, bloque Q).
- ~~Dar la orden de empezar Q1~~ ✅ 05/10; Q1 hecha en código.
- Probar Q1, Q2 y Q3 en Excel (guía Q5–Q26).
- Para la importación (Q2 y Q3): sin archivos reales del usuario, se prueba
  con los generados por ProjectLibre o escritos a mano siguiendo el formato
  publicado de MS Project XML.
