# FASE 3 — Roadmap

Fecha: 2026-09-15
Estado: **propuesta, pendiente de aprobación**.
Base: [`FASE2_ARQUITECTURA.md`](FASE2_ARQUITECTURA.md) (aprobada). Contexto: [`ESTADO_Y_HANDOFF.md`](ESTADO_Y_HANDOFF.md).

---

## 0. Cómo leer este documento

Las estimaciones están en **días de trabajo efectivo**, no en fechas de calendario. Son órdenes de magnitud para ordenar prioridades y detectar desviaciones, no compromisos. La etapa E2 es la que más puede moverse, y se dice por qué.

Cada etapa lleva:
- **Entregable**: qué existe al terminar que antes no existía.
- **Criterio de hecho**: la condición objetiva que permite cerrarla. Sin ella, la etapa no está terminada por mucho código que tenga.
- **Qué NO entra**: para que el alcance no se desborde por los bordes.

Regla que gobierna todo el roadmap: **ninguna etapa se cierra sin sus tests y, cuando aplique, sin su benchmark ejecutado**. El proyecto heredado murió por lo contrario.

---

## 1. Decisiones de alcance tomadas en esta fase

**2.1 — Orden de construcción (delegada en mí).**
Decisión: **escáner primero, y motor inmediatamente después**. Razones concretas:

- Aceptaste no medir tus modelos (D4). El escáner es lo que convierte ese supuesto en dato, y cuesta días, no semanas.
- Con D11 sobre la mesa (cientos de variables, millones de iteraciones) el escáner deja de ser solo un inventario de funciones: también mide **tamaño del subgrafo, número de entradas y salidas y profundidad de dependencias**, que son precisamente los parámetros que dimensionan el motor. Construir el motor sin esos números es dimensionar a ciegas.
- Es un entregable **útil por sí mismo** aunque el motor tardara: te dice hoy qué tienen tus libros.

### 1.1 Revisión del 2026-09-15: el proyecto pasa a ser un producto

El usuario comunica que va a **vender o publicar** el complemento, con **más de 100
usuarios** de público abierto. Eso invalida la decisión D2 original ("equipo personal")
y cambia tres cosas de este roadmap:

1. **El modo compatible sube al MVP** (decisión 15, invierte la 2.2 de más abajo). Con
   usuarios desconocidos, un modelo que no se puede simular es motivo de desinstalar el
   complemento. La justificación original —que con corridas de millones de iteraciones
   el modo lento no sirve— solo valía para *este* usuario; mucha gente hará 10.000
   iteraciones, y ahí funciona perfectamente.
2. **El catálogo de funciones deja de tener techo conocido.** Los libros del usuario
   pasan a ser el suelo mínimo. Se diseña el registro de funciones para que añadir una
   sea barato (un archivo pequeño + su fila en el libro de fidelidad), porque la
   cobertura va a crecer durante toda la vida del producto.
3. **Aparecen E10 y E11**: hosting, internacionalización, licencia, privacidad y la
   validación de Microsoft. Nada de eso existía cuando el destinatario era una persona.

Consecuencia de calendario: el MVP se retrasa alrededor de una semana y el total sube de
~65–83 a ~78–105 días.

Lo que **no** cambia: el cálculo sigue siendo 100 % local y la arquitectura del motor es
la misma. Alojar el complemento en una URL significa que se descarga el programa, no que
los datos salgan del equipo.

### 1.2 Revisión del 2026-09-26: lo que dice el estudio de mercado

El usuario aportó un estudio de mercado sobre los complementos de simulación y
riesgo para Excel (@RISK, Crystal Ball, ModelRisk, Analytic Solver, RiskAMP). Se
comparó con el estado real del código. Conclusión: **la arquitectura ya está donde el
estudio dice que hay que estar** (Office.js, cálculo 100 % local, motor fuera del
recálculo de Excel), así que no cambia. Lo que cambia es **el orden** y el alcance de
cuatro etapas.

**Qué se reordena:**

1. **E7 pasa delante de E4, y dentro de E7 van primero el tornado y el ajuste de
   distribuciones.** Son las dos capacidades que cualquier usuario de @RISK da por
   hechas. Sin ellas el producto parece incompleto, por bueno que sea el motor.
2. **Una prueba de humo en Excel para la Web y en Mac se adelanta** (antes en E9, ahora
   E9a, justo después del tornado). El manifiesto ya declara esas plataformas y solo se
   ha verificado Windows. Enterarse en la validación de AppSource es caro.
3. **La simulación sale del hilo del panel (Web Worker en el navegador)**, dentro de
   E6. Hoy el complemento usa `crearEjecutorSecuencial` en el mismo hilo que React. Los
   workers solo se han probado en Node. A 1M de iteraciones el panel se congelaría, que
   es una de las quejas del mercado.

**Qué se redefine:**

4. **E4 queda condicionada a que el libro siga funcionando al compartirlo.** Hoy, quien
   abre el libro sin el complemento ve un Excel normal con los valores base, porque el
   modelo vive en `workbook.settings`. Es justo lo que el estudio llama «modo visor»
   y la competencia no ofrece. Escribir `=RISK.NORMAL(...)` en las celdas lo
   rompería: sin el complemento, esas celdas acaban en `#¿NOMBRE?`. Ver E4.

**Qué se añade** (E12, después de la v1.0):

5. **Depurador de escenarios**: aislar el peor 5 % (o cualquier percentil) y ver cómo
   fluye esa iteración por las celdas. Philox es un generador basado en contador, así
   que cualquier iteración se puede reproducir exactamente. Es barato para esta
   arquitectura y caro para la competencia.
6. **Conversor de modelos de @RISK** (`RiskNormal` → `RiskModel v1`), sobre el lector
   `.xlsx` del escáner. Baja el coste de cambiarse.
7. **Narrativa de resultados en local**: textos generados con reglas a partir del
   tornado y los percentiles. Nunca con un modelo de IA externo.

**Qué se rechaza expresamente** (para no reabrirlo sin datos nuevos):

- **Créditos de cálculo en la nube**: rompen la promesa de cálculo local, y con esta
  velocidad no hacen falta.
- **Explicaciones con una IA externa**: sacarían del equipo los datos del libro.
- **Matrices dinámicas y Python en Excel como integración**: poco valor para quien
  modela presupuestos y mucho coste (es otro modelo de celda). Como mucho, una opción
  de «volcar iteraciones a una hoja» dentro de E7.
- **Pasar a Rust→WASM por principio**: sigue siendo una decisión de E6, tomada con
  benchmark delante.

**Pendiente para después de la v1.0, sin fecha:** cópulas (Clayton, Gumbel, Frank, t),
optimización bajo incertidumbre y ampliar el catálogo de distribuciones (hoy ~14,
frente a 135 de ModelRisk).

**Cautela sobre la fuente:** las citas del estudio se repiten sobre cinco fuentes, y
varias son de Vose, competidor directo. Los precios y las quejas son orientativos y
hay que verificarlos antes de usarlos en material comercial.

---

**2.2 — ¿El modo compatible entra en el MVP?** *(decisión original, luego invertida — se
conserva por trazabilidad; ver §1.1)*
Decisión: **no; entra en la V1**. Y el motivo es una consecuencia de tu propia respuesta 3.2:

> Con Excel dentro del bucle, 1M de iteraciones son horas o días. Si tus corridas pueden ser de millones, **el modo compatible no puede darte lo que buscas en ningún caso** — solo sirve para modelos pequeños con miles de iteraciones. Meterlo en el MVP consumiría ~1 semana en algo que, en tu escenario real, casi nunca vas a usar.

Lo que sí entra en el MVP es el **informe de compatibilidad**: si un modelo no es soportado, sabrás exactamente qué celda y qué función lo impiden, y qué habría que cambiar. Lo que faltará hasta la V1 es el botón "simúlalo igualmente, despacio".

**Esta es la decisión más fácil de invertir de todo el roadmap.** Si prefieres tener red de seguridad desde el primer día, se mueve E8 delante de E5 y el MVP se retrasa alrededor de una semana. Dilo y lo cambio.

---

## 2. Vista general

> **Estado al 26/09/2026.** Actualizado con lo que de verdad está hecho y
> verificado en Excel, no con lo que el plan preveía. Las etapas no se han
> recorrido en orden: E3 arrastró trozos de E5 y de E7 porque el escáner
> encontró `TIR` en un libro real del usuario, y porque un panel que no enseña
> resultados no es un MVP.

| Etapa | Nombre | Esfuerzo | Estado |
|---|---|---|---|
| E0 | Fundaciones | 2–3 d | ✅ hecha |
| E1 | Escáner de compatibilidad | 4–5 d | ✅ **v0.1**, pasado por dos libros reales |
| E2 | Motor Nivel 0 | 15–20 d | ✅ hecha — 57/57 funciones, fidelidad verificada contra Excel |
| E3 | Integración Excel + UI **+ modo compatible** | 11–14 d | ✅ **v0.5 — el MVP simula de verdad en Excel** |
| E4 | Funciones `RISK.*` + modo exploración F9 | 5–6 d | ⬜ no empezada — **redefinida el 2026-09-26** (§1.2): el libro tiene que seguir funcionando sin el complemento |
| E5 | Motor Niveles 1 y 2 | 10–12 d | 🟡 N1 43/44, N2 28/41 — Nivel 1 completo salvo `DESREF`; texto completo |
| E6 | Escala D11 y rendimiento | 7–10 d | 🟡 el ejecutor por bloques está; faltan el histograma en *streaming* y **el Web Worker en el navegador** |
| E7 | Análisis y visualización | 8–10 d | 🟡 estadísticos, percentiles, CDF y volcado a hoja hechos; **tornado y ajuste de distribuciones, primero** |
| E9a | Prueba de humo en Excel Web y Mac | 1–2 d | ⬜ no empezada — **adelantada** desde E9 (§1.2) |
| E9 | Mac, empaquetado y documentación | 4–5 d | ⬜ no empezada |
| E10 | Producto: hosting, i18n, licencia, privacidad | 8–12 d | ⬜ no empezada |
| E11 | Validación y publicación en AppSource | 5–8 d | ⬜ no empezada |
| E12 | Diferenciadores: depurador de escenarios, conversor de @RISK, narrativa local | 8–12 d | ⬜ después de la v1.0 (§1.2) |

**Dónde estamos de verdad**: el ciclo completo funciona dentro de Excel —marcar
entradas y salidas, distribuciones, correlaciones, simular por el motor rápido
o con Excel en el bucle, ver resultados y volcarlos a una hoja—.

**Orden de trabajo desde el 2026-09-26** (revisado con el estudio de mercado, §1.2):

1. **E7: tornado y sensibilidad.** La capacidad básica que más se echa de menos.
2. **E7: ajuste de distribuciones a datos** (AIC, BIC, Kolmogorov–Smirnov, Anderson–Darling).
3. **E9a + E6: prueba de humo en Excel Web y Mac, y simulación en un Web Worker.**
4. **E4 redefinida**: `RISK.*` sin romper el libro compartido.
5. **E10: decidir licencia y precio.** La decisión es del usuario y bloquea la publicación.
6. El resto de E7 (histograma, escenarios), E5 (Nivel 2), E6, E9–E11.
7. **E12**, después de la v1.0.

Todo el trabajo de producto (E9–E11) no es técnico, pero sin él esto no llega a
nadie más que a su autor.

**Cobertura de funciones, medida** (`npm test` la ata; no es una estimación):

| Nivel | Qué es | Estado |
|---|---|---|
| Nivel 0 | Aritmética, agregación, lógica, redondeo, estadísticos de orden | **57 / 57** |
| Nivel 1 | Criterios, fechas, financieras, búsquedas | **43 / 44** |
| Nivel 2 | Texto, matriciales dinámicas, `SUBTOTALES`, `LET`/`LAMBDA` | **28 / 41** |

Falta de Nivel 1 solo `DESREF`, a propósito: es una referencia dinámica (el
rango depende de sus argumentos) y rompe el grafo fijo. Con desplazamientos
constantes se podrá resolver al compilar; si no, modo compatible. Las once que
entraron el 2026-09-23 están verificadas contra Excel (sexta tanda, 69/69).

Faltan de Nivel 2, en dos grupos que no se parecen entre sí (el texto está
completo desde que llegó la configuración regional):
- **Las matriciales dinámicas** (`FILTRAR`, `ORDENAR`, `ORDENARPOR`, `UNICOS`,
  `SECUENCIA`, `DIVIDIRTEXTO`, `TRANSPONER`, `MMULT`, `MINVERSA`): devuelven
  varias celdas, y el motor modela una celda por valor. Es otro modelo, no
  otra función.
- **`LET`, `LAMBDA`, `IMPORTARDATOSDINAMICOS`, `FORMULATEXTO`**.

Total aproximado: **78–105 días** de trabajo efectivo. El MVP utilizable (v0.5)
se alcanzó.

> **E8 (modo compatible) ya no es una etapa suelta**: se absorbe dentro de E3 por la
> decisión 15. Se mantiene el número retirado para no romper las referencias de los
> commits anteriores.
>
> **E10 y E11 son nuevas** y nacen del cambio de destino del proyecto (§1.1). No son
> opcionales: sin ellas el complemento no puede llegar a un usuario que no seas tú.

---

## E0 — Fundaciones

**Entregable:** un esqueleto que compila, se testea y se mide.

- Estructura de carpetas del §13 de la Fase 2.
- Vitest configurado; el primer test verde del proyecto.
- CI en GitHub Actions: build + lint + tests en cada push.
- Arreglar los 10 errores de TypeScript y los 55 de ESLint del código heredado, o aislar el código heredado en `legacy/` fuera del build — lo que resulte más barato al abordarlo (probablemente lo segundo).
- Eliminar: Google Fonts, la etiqueta `<script src="/functions.js">` de `index.html` que provoca el `ReferenceError`, y `dist/` del árbol de trabajo.
- `CHANGELOG.md`.

**Criterio de hecho:** `npm run build && npm run lint && npm test` pasa en verde en CI, desde cero, en un clon limpio del repositorio.

**Qué NO entra:** nada de motor, nada de UI nueva.

---

## E1 — Escáner de compatibilidad · **v0.1**

**Entregable:** una herramienta que abre tus libros reales y te dice qué hay dentro. Corre local, no envía nada (R2).

- Lectura de todas las hojas y fórmulas vía Office.js, en lote.
- Inventario: funciones usadas y frecuencia, nº de fórmulas, hojas, tablas, rangos con nombre, matrices dinámicas, referencias externas, VBA, volátiles, referencias circulares.
- Métricas que dimensionan el motor (D11): tamaño del subgrafo, profundidad de dependencias, nº de entradas y salidas candidatas.
- Clasificación contra el catálogo del §4.2: qué % de fórmulas caería en Nivel 0, Nivel 1, Nivel 2 o no soportado, **con la lista de las funciones bloqueantes ordenada por frecuencia**.
- Informe exportable a una hoja de Excel.

**Criterio de hecho:** ejecutado sobre tus libros reales, con el informe en la mano y **§4.2 de la Fase 2 revisado** en consecuencia. Esta etapa no la cierro yo solo: necesita que lo pases por tus modelos.

**Qué NO entra:** simular nada. Solo lee.

---

## E2 — Motor Nivel 0

La etapa crítica y la más larga. Es el corazón del producto.

- **Parser**: tokenizador y AST de fórmulas de Excel. Referencias relativas/absolutas/mixtas, rangos, hojas, nombres definidos, operadores, literales, errores. Se lee `range.formulas` (en-US), no `formulasLocal`, para no depender de tu `es-ES`.
- **Grafo y subgrafo**: dependencias, detección de ciclos, recorte al camino entradas→salidas, orden topológico.
- **Compilador**: AST → plan vectorizado, análisis de vida de buffers, *constant folding* del subgrafo invariante.
- **Ejecutor**: bloques de tamaño adaptativo (§3.1), pool de Web Workers, PRNG counter-based con streams, cancelación entre bloques.
- **Funciones Nivel 0** vectorizadas (§4.2).
- **Distribuciones** con los errores del heredado corregidos: PERT como Beta real, lognormal con doble parametrización, Poisson y Binomial en O(1), triangular validada; más Beta, Gamma, Weibull, Exponencial, Empírica, Discreta y truncamiento.
- **Muestreo**: Monte Carlo y LHS, seleccionables (D10).
- **Estadísticas**: Welford, histograma, percentiles exactos y t-digest.

**Criterio de hecho — tres condiciones, las tres obligatorias:**
1. Tests de fidelidad contra Excel en verde para **todas** las funciones de Nivel 0 (§11.3 de la Fase 2). Ninguna función se declara soportada sin su fila en el libro de referencia.
2. Tests estadísticos (KS + momentos) en verde para todas las distribuciones.
3. Benchmark **ejecutado**: 1M iteraciones, 20 entradas, 5 salidas, modelo de 200 celdas, en menos de 5 s.

**Qué NO entra:** `BUSCARV` y compañía (es E5), Office.js (el motor se testea en Node sin Excel), gráficos.

**Riesgo:** es la etapa que más puede desviarse. Si a mitad se ve que el parser se complica más de lo previsto, lo sabrás en cuanto lo detecte, no al final.

---

## E3 — Integración Excel + UI mínima · **v0.5 (MVP)**

**Entregable:** el ciclo completo funcionando de verdad. Defines entradas, marcas salidas, simulas un millón de iteraciones y ves resultados.

- Adaptadores Office.js: lector del grafo en lote, escritor de resultados.
- Formato `RiskModel v1` en `workbook.settings`, con rangos con nombre (§7.2).
- **Guardián transaccional** (§7.3): registro de recuperación persistido en el libro, restauración al reabrir tras un cierre forzado.
- Panel React reconstruido: definir entradas/salidas, ajustes, ejecutar, progreso real, **cancelar**.
- Informe de compatibilidad integrado (§4.3), con navegación a la celda bloqueante.
- Resultados: estadísticos, histograma y CDF.

**Criterio de hecho:** una simulación de 1M de iteraciones sobre un libro real, desde Excel, con progreso y cancelación, que sobrevive a cerrar el panel a mitad sin dejar el libro tocado.

**Qué NO entra:** `RISK.*` en celdas (E4), tornado y escenarios (E7).

---

## E4 — Funciones `RISK.*` + modo exploración F9

**Entregable:** las funciones que nunca funcionaron, funcionando.

- Manifiesto corregido: `AllFormFactors`, `Requirements` con `CustomFunctionsRuntime 1.1`, `SharedRuntime` para panel y cinta.
- Build propio del bundle plano; `functions.json` generado desde JSDoc.
- Las 14 funciones `RISK.*` + `RISK.OUTPUT`.
- Lectura de declaraciones desde las celdas hacia el modelo, y viceversa.
- **Modo exploración (D9)**: conmutador en la cinta, funciones volátiles, F9 remuestrea, con las tres advertencias del §6.1 visibles en la UI.
- Script de limpieza de la caché `Wef` para desarrollo.

> **Revisión del 2026-09-26 (§1.2): compartir no puede romper el libro.**
> Hoy el modelo vive en `workbook.settings` y las celdas conservan sus valores, así que
> quien abre el libro sin el complemento ve un Excel normal con los valores base. Es
> una ventaja frente a @RISK que hay que conservar. Una función personalizada en una
> celda, en un Excel sin el complemento, acaba en `#¿NOMBRE?` al recalcular. Por eso:
>
> - **`workbook.settings` sigue siendo la fuente de verdad del modelo.** `RISK.*` es
>   una forma opcional de declarar, no la única.
> - **Comando «Preparar para compartir»**: sustituye cada `RISK.*` por su valor base
>   (media o valor de la celda antes de declararla), sin perder la declaración, que
>   sigue en el modelo. Quien vuelva a abrir el libro con el complemento lo recupera.
> - Aviso en el panel si el libro tiene `RISK.*` escritas y se va a guardar.

**Criterio de hecho:** `=RISK.NORMAL(1000;50)` escrita a mano en una celda de Excel **en Windows** devuelve 1000, el motor la reconoce como entrada, y al activar el modo exploración F9 la mueve. Verificado en Excel real, no en el validador. **Y además:** el libro, tras «Preparar para compartir», abierto en un Excel sin el complemento, no muestra ningún `#¿NOMBRE?` y recalcula con los valores base.

---

## E5 — Motor Nivel 1 · **v0.8**

**Entregable:** el motor deja de servir solo para modelos de juguete.

- `BUSCARV`, `BUSCARX`, `INDICE`, `COINCIDIR`, `ELEGIR`, `DESREF` acotado.
- `SUMAR.SI(.CONJUNTO)`, `CONTAR.SI(.CONJUNTO)`, `PROMEDIO.SI`, `MAX/MIN.SI.CONJUNTO`.
- Financieras: `VNA`, `TIR`, `PAGO`, `VA`, `VF`, `TASA`.
- Fechas: `FECHA`, `AÑO`, `MES`, `DIA`, `DIAS`, `FIN.MES`, `SIFECHA`.
- **Tablas de consulta precompiladas**: el *constant folding* que hace que un `BUSCARV` sobre tarifas fijas cueste casi nada por iteración (§4.2). Es la pieza que da valor a toda la etapa.

**El orden concreto lo fija el informe de E1**: se implementan primero las funciones que tus libros más usan, no las que a mí me parezcan importantes.

**Criterio de hecho:** fidelidad en verde para todas ellas, y benchmark del modelo con `BUSCARV` por debajo de 8 s a 1M.

---

## E6 — Escala D11 y rendimiento

**Entregable:** que cientos de variables y millones de iteraciones no rompan nada.

- t-digest para percentiles por encima del umbral, con indicación en la UI de si un percentil es exacto o aproximado (§3.3).
- Reservorio de 20.000 iteraciones para sensibilidad (§3.4).
- Iman–Conover por bloque, solo sobre grupos correlacionados declarados.
- Ajuste fino del tamaño de bloque y del reparto entre workers.
- **Web Worker en el navegador** (añadido el 2026-09-26, §1.2). Hoy el complemento simula con `crearEjecutorSecuencial` en el mismo hilo que el panel; el pool de workers solo existe en Node (`tests/helpers/poolNodeWorkers.ts`). La interfaz `EjecutorDeBloques` ya separa «calcular un bloque» de «quién lo reparte», así que es un ejecutor nuevo, no un rediseño. Va con E9a, porque el comportamiento de los workers dentro del panel de Office cambia entre Windows, Mac y Web.
- Suite `npm run bench` con resultados versionados.

**Criterio de hecho:** el escenario D11 (1M × 300 entradas × 100 salidas × 3.000 celdas) ejecutado, por debajo de 60 s y de 800 MB de pico. **Y el panel sigue respondiendo** (se puede cancelar y cambiar de pestaña) durante una simulación de 1M de iteraciones dentro de Excel. **Si no se alcanza, aquí es donde se decide sobre Rust→WASM**, con los números delante.

---

## E7 — Análisis y visualización · **v1.0**

**Entregable:** el producto que querías, completo.

> **Orden dentro de la etapa, desde el 2026-09-26 (§1.2):** primero el tornado, después
> el ajuste de distribuciones, y luego lo demás. Son las dos capacidades que el
> estudio de mercado identifica como imprescindibles en cualquier herramienta
> profesional, y hoy no existe ninguna de las dos.

1. **Tornado** con Spearman, regresión estandarizada y contribución a la varianza, **top 20 con acceso a la lista completa** (§3.4). Diagrama **spider** (salida frente a percentil de cada entrada) sobre el mismo reservorio.
2. **Ajuste de distribuciones a datos**, unificando las dos implementaciones heredadas, con MLE y PERT real. Ranking por **AIC y BIC**, y bondad de ajuste con **Kolmogorov–Smirnov** y **Anderson–Darling**. El ajuste elegido se guarda como una distribución normal del modelo.
3. Histograma con bins configurables y densidad; CDF con cortes por percentil arrastrables.
4. Comparación de escenarios.
5. Probabilidad de superar umbrales.
6. Exportación a hojas nativas de Excel, incluido el tornado. Opción de **volcar las iteraciones** a una hoja (con el límite de filas de Excel), para quien quiera filtrarlas con fórmulas nativas.

**Criterio de hecho:** un informe completo generado desde un libro real, y ningún cálculo estadístico ejecutándose dentro de un render de React. **El tornado del libro de demostración ordena las entradas como se espera por construcción**, y el ajuste recupera los parámetros de muestras sintéticas generadas con distribuciones conocidas (test estadístico, no a ojo).

---

## E8 — Modo compatible  *(absorbida en E3 por la decisión 15)*

**Entregable:** la red de seguridad. Ningún modelo se queda sin poder simularse.

- Excel en el bucle, pero con lotes adaptativos, `Recalculate` en lugar de `Full` cuando procede, cancelación y guardián transaccional.
- Estimación de tiempo **medida** con 200 iteraciones reales, no extrapolada a ojo.
- Aviso honesto cuando la combinación pedida no es razonable.

**Criterio de hecho:** un modelo con `SUBTOTALES` simulado a 10.000 iteraciones, cancelable, sin dejar rastro en el libro.

---

## E9a — Prueba de humo en Excel para la Web y en Mac  *(adelantada el 2026-09-26)*

**Entregable:** saber pronto, y con dato, si lo que funciona en Windows funciona en las otras dos plataformas que declara el manifiesto.

- Sideload en **Excel para la Web** (basta una cuenta de Microsoft 365) y, si hay acceso, en **Excel para Mac**.
- Recorrer el libro de demostración de punta a punta: marcar, simular por el motor rápido, ver resultados, volcar a hoja, cerrar y reabrir.
- Anotar por plataforma el `ExcelApi` disponible (el panel de Diagnóstico ya lo mide), si el modo de cálculo se puede cambiar (en la Web no siempre) y si arranca un Web Worker desde el panel.
- Lo que falle se documenta en `ESTADO_Y_HANDOFF.md` y se decide si se arregla ya o se deja de declarar esa plataforma.

**Qué NO entra:** la validación completa, el empaquetado y el manual. Eso sigue en E9.

**Criterio de hecho:** una tabla por plataforma (Windows, Web, Mac) con qué funciona y qué no, medida en Excel real.

---

## E9 — Mac, empaquetado y documentación

- Prueba real en **Mac** (D1). La prueba de humo ya se hizo en E9a; E9 es la validación completa.
- Empaquetado y sideload documentado para ambos sistemas; manifiesto de producción sin `localhost`.
- Re-registro del sideload apuntando a esta carpeta (hoy apunta a `1 complemento sensibilidad`).
- **Documentación que permita a otra IA reconstruir el proyecto desde cero** (§21 de tus instrucciones maestras): decisiones, arquitectura, formatos, catálogo de funciones, cómo correr tests y benchmarks.
- Manual de usuario.

---

## E10 — Producto: hosting, internacionalización, licencia y privacidad

Etapa nueva, nacida del cambio de destino (§1.1). Nada de esto es opcional si el
complemento tiene que llegar a alguien que no seas tú.

- **Hosting HTTPS permanente** y manifiesto de producción sin `localhost`. Despliegue
  automático desde el repositorio, con la versión visible en la interfaz para que el
  soporte sepa qué está mirando el usuario.
- **Internacionalización** (mínimo español e inglés). Se hace aquí solo porque la UI no
  existe hasta E3; a partir de E3 **todo texto nuevo nace en el catálogo de cadenas**,
  nunca incrustado en el código. Retrofitear i18n es de las cosas más caras que hay.
- **Versionado estricto del formato `RiskModel`.** Desde la primera versión pública,
  cada cambio necesita ruta de migración: habrá libros ajenos con la configuración
  dentro y no se pueden romper.
- **Licencia.** Requiere una decisión previa del usuario (ver §4): una comprobación
  contra un servidor choca con la promesa de "no se conecta a Internet". Se puede
  resolver con activación única o licencia firmada offline, pero hay que elegir qué se
  promete, porque acaba en la política de privacidad.
- **Precio** (añadido el 2026-09-26, §1.2). El estudio sitúa a la competencia entre
  ~1.550 € y 6.000 $ por usuario y año, con contratos anuales y precios opacos, y
  propone una suscripción **mensual, pública y sin permanencia** (orientativo: 29–49 $
  al mes) con prueba gratuita. Encaja con este producto. **No** entra la parte de
  «créditos de cálculo en la nube» del estudio: rompe la promesa de cálculo local.
  Decisión del usuario, junto con la de licencia.
- **La ficha del producto debe contar lo que ya se tiene**: cálculo 100 % local, Windows
  + Mac + Web con un solo código, y libros que siguen funcionando al compartirlos sin el
  complemento (E4). Son las tres quejas principales del mercado.
- **Mensajes de error para desconocidos.** Hoy están pensados para alguien que conoce el
  proyecto. Un usuario que acaba de instalarlo necesita saber qué hacer, no qué falló.
- **Telemetría opcional y explícita**, si la hay: nunca datos del libro, nunca activada
  por defecto.

**Criterio de hecho:** una persona ajena al proyecto, en un equipo limpio, instala el
complemento desde la URL pública y simula un modelo sin ayuda.

---

## E11 — Validación y publicación en AppSource

- Cuenta de Partner Center y envío del complemento.
- Política de privacidad y condiciones de uso publicadas y enlazadas desde el manifiesto.
- Canal de soporte operativo.
- Pruebas en las plataformas que se declaren: **Microsoft valida lo que declaras**, así
  que si el manifiesto dice Mac, tiene que funcionar en Mac de verdad.
- Accesibilidad y requisitos de la lista de validación de Microsoft.
- Material de la ficha: descripción, capturas, vídeo.

**Criterio de hecho:** complemento publicado y instalable por cualquiera desde AppSource.

**Riesgo propio:** la validación de Microsoft puede rechazar y obligar a iterar. No es
raro que lleve varias rondas. Conviene revisar la lista de requisitos **antes** de E9,
no al final.

**Aviso de marca:** "@RISK" es marca registrada de Lumivero. El prefijo de funciones
`RISK.` no debería dar problema, pero el nombre comercial y el material de marketing
deben revisarse antes de publicar. No es una tarea técnica y no la puedo resolver yo.

---

## E12 — Diferenciadores  *(nueva el 2026-09-26, después de la v1.0)*

**Entregable:** tres cosas que la competencia no tiene o hace mal, y que esta arquitectura hace baratas. Nace del estudio de mercado (§1.2).

- **Depurador de escenarios.** Elegir un percentil de una salida (por ejemplo, el peor 5 %), elegir una iteración concreta de ese tramo y ver sus valores celda a celda, con la hoja resaltada. Philox es un generador basado en contador: la iteración *k* se regenera exactamente sin guardar las anteriores, y el evaluador de referencia la recalcula entera. Sirve para auditar el modelo y para contestar «¿qué tiene que pasar para que perdamos dinero?».
- **Conversor de modelos de @RISK.** Leer un `.xlsx` con `RiskNormal`, `RiskTriang`, `RiskPert`, `RiskOutput`… (el lector del escáner ya parsea las fórmulas) y proponer el `RiskModel v1` equivalente, avisando de lo que no tiene traducción. Revisar la marca antes de nombrarlo en la ficha (ver E11).
- **Narrativa de resultados en local.** Dos o tres frases generadas con reglas a partir del tornado y de los percentiles («hay un 15 % de probabilidad de VAN negativo; el 60 % de la varianza lo explica el precio»). Nada sale del equipo; **no** se usa un modelo de IA externo.

**Qué NO entra:** cópulas, optimización y el catálogo ampliado de distribuciones. Siguen sin fecha (§1.2).

**Criterio de hecho:** el depurador enseña la iteración del percentil 5 del libro de demostración y su valor coincide con el que dio la simulación; el conversor traduce un libro de @RISK de ejemplo sin pérdidas silenciosas.

---

## 3. Riesgos del plan

| Riesgo | Señal temprana | Respuesta |
|---|---|---|
| E2 se alarga más de lo estimado | El parser no cubre el Nivel 0 completo al día 10 | Recortar Nivel 0 a lo que E1 demuestre que usas, y pasar el resto a E5 |
| E1 revela que tus modelos usan mucho Nivel 2 | El informe lo dirá en el día 8 del proyecto | Replantear: subir E8 (modo compatible) a MVP y reequilibrar el catálogo. Es barato corregir en el día 8, caro en el día 40 |
| D11 no alcanzable en TypeScript | Benchmark de E6 | Rust→WASM solo para el ejecutor; el resto de `engine/` no cambia |
| Las funciones `RISK.*` vuelven a no registrarse | E4 falla en Excel real | La causa raíz está documentada (C1–C7); si falla, es por algo nuevo y se diagnostica con la caché `Wef` |
| Alcance que crece por los bordes | Cada etapa dice qué NO entra | Lo que surja va al CHANGELOG como idea, no a la etapa en curso |
| **Cobertura de funciones insuficiente para usuarios desconocidos** | Quejas tras publicar | El modo compatible en el MVP garantiza que nada quede sin simular; el registro de funciones hace barato ampliar |
| **Rechazo en la validación de Microsoft** | E11 | Revisar la lista de requisitos antes de E9, no al final |
| **Soporte y compatibilidad con 100+ usuarios** | A partir de la publicación | Versionado estricto del formato, versión visible en la UI, mensajes de error autoexplicativos |
| **Parecer incompleto frente a @RISK** | Sin tornado ni ajuste de distribuciones | Son lo primero de E7 desde el 2026-09-26 (§1.2) |
| **`RISK.*` rompe los libros compartidos** | `#¿NOMBRE?` en un Excel sin el complemento | `workbook.settings` sigue siendo la fuente de verdad y «Preparar para compartir» entra en el criterio de hecho de E4 |
| **Excel Web o Mac no se comportan como Windows** | Solo verificado en Windows | E9a adelantada: prueba de humo antes de E4 |

---

## 4. Qué necesito de ti, y cuándo

| Cuándo | Qué |
|---|---|
| Ahora | **Decidir el modelo de licencia y el precio** y qué se promete exactamente sobre la conexión a Internet (§E10). Condiciona la arquitectura, así que cuanto antes mejor |
| En E9a | Hacer el sideload en Excel para la Web (y en un Mac si tienes acceso) y recorrer el libro de demostración |
| Antes de E10 | Cuenta de Partner Center, política de privacidad, condiciones de uso, canal de soporte, revisión de marca. Son tareas tuyas, no mías |
| Al cerrar E1 | Pasar el escáner por tus libros reales y revisar juntos el catálogo del §4.2 |
| Al cerrar E3 (MVP) | Probarlo con un modelo tuyo de verdad y decir qué falla |
| Al cerrar E4 | Confirmar que `RISK.*` funciona en tu Excel, y probarlo en un Mac si tienes acceso a uno |
