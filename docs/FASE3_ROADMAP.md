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
  de «volcar iteraciones a una hoja» dentro de E7. *(Nota de la fusión: lo que sí se
  hizo el 24/09 es **cobertura**: que las fórmulas del usuario que usan `FILTRAR` o
  `SUMAPRODUCTO` dentro de otra función corran en el motor rápido. No es una
  integración con el derrame de Excel, que sigue yendo al modo compatible.)*
- **Pasar a Rust→WASM por principio**: sigue siendo una decisión de E6, tomada con
  benchmark delante.

**Pendiente para después de la v1.0, sin fecha:** cópulas (Clayton, Gumbel, Frank, t),
optimización bajo incertidumbre y ampliar el catálogo de distribuciones (hoy ~14,
frente a 135 de ModelRisk).

**Cautela sobre la fuente:** las citas del estudio se repiten sobre cinco fuentes, y
varias son de Vose, competidor directo. Los precios y las quejas son orientativos y
hay que verificarlos antes de usarlos en material comercial.

#### 1.2.1 Segundo informe de competidores (27/09/2026)

El usuario aportó un segundo informe (tabla comparativa de @RISK, Crystal Ball,
ModelRisk, Analytic Solver y RiskAMP) y una propuesta detallada de motor de ajuste
de distribuciones. Conclusiones:

- **Confirma lo ya decidido**: la brecha común es que casi todos son complementos
  COM solo para Windows (el nuestro es Office.js: Windows, Mac y Web, pendiente de
  verificar en E9a); compartir modelos sin complemento exige pasos manuales («Swap»
  de @RISK y ModelRisk), que aquí ya resuelve «Preparar para compartir» (26/09); y
  el precio es una barrera (entrada de RiskAMP en ~149–279 USD perpetuos o 19 USD/mes),
  lo que alimenta la decisión de E10.
- **Colaboración en tiempo real**: se queda en lo que da Excel —OneDrive/SharePoint
  y coautoría— y en proteger el modelo guardado de escrituras cruzadas (H10). **No**
  se construye una nube propia: rompería la promesa de cálculo local y es otro
  producto.
- **Cautela**: el informe no cita fuentes concretas; los precios (≈3.680 €/año de
  la suite de @RISK, ≈2.420 USD de Crystal Ball, ≈2.500–6.000 USD/año de Analytic
  Solver) son orientativos. «Simulación 5.0» aparece sin datos públicos: no se
  toma como referencia. Verificar todo antes de usarlo en material comercial.
- **La propuesta de ajuste** se compara con lo que ya hay (MLE para normal,
  lognormal, exponencial y Weibull; gamma por aproximación de Minka; A–D, K–S, AIC
  y BIC) y lo que falta se registra como bloque I en tres niveles.

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
| E4 | Funciones `RISK.*` + modo exploración F9 | 5–6 d | 🟡 12 funciones `RIESGO.*` hechas (muestran la media) y **«Preparar para compartir» hecho** (26/09); faltan runtime compartido, modo determinístico/probabilístico y el resto de §2.1-B. **Redefinida el 26/09** (§1.2): el libro tiene que seguir funcionando sin el complemento |
| E5 | Motor Niveles 1 y 2 | 10–12 d | 🟡 N1 43/44, N2 37/41 — Nivel 1 completo salvo `DESREF`; texto, `LET` y matrices dentro de funciones hechos |
| E6 | Escala D11 y rendimiento | 7–10 d | 🟡 ejecutor por bloques, **Web Workers en el panel** (24/09) y núcleos configurables hechos; faltan medir con libros grandes y el escenario D11 |
| E7 | Análisis y visualización | 8–10 d | 🟡 hechos: tornado (Spearman + contribución a la varianza + R²), araña, **ajuste de distribuciones (A–D, K–S, AIC y BIC)**, histograma, CDF, umbrales, precisión, escenarios, informe PDF y volcado. Pendiente: §2.1-C |
| E9a | Prueba de humo en Excel Web y Mac | 1–2 d | ⬜ **adelantada** desde E9 (§1.2); incluida en la guía de pruebas (bloque W) |
| E9 | Mac, empaquetado y documentación | 4–5 d | ⬜ no empezada |
| E10 | Producto: hosting, i18n, licencia, privacidad | 8–12 d | ⬜ no empezada |
| E11 | Validación y publicación en AppSource | 5–8 d | ⬜ no empezada |
| E12 | Diferenciadores: depurador de escenarios, conversor de @RISK, narrativa local | 8–12 d | ⬜ después de la v1.0 (§1.2) |

**Dónde estamos de verdad**: el ciclo completo funciona —marcar entradas y
salidas (o escribir `RIESGO.*`), distribuciones, correlaciones, simular por el
motor rápido (en varios hilos) o con Excel en el bucle, ver y guardar
resultados, comparar escenarios, informe PDF y volcado a hoja—. **Casi todo lo
de los días 23 al 26 está probado en el banco y en Node, no en el Excel del
usuario**: la guía `docs/GUIA_PRUEBAS_EXCEL.md` es el siguiente paso
obligatorio.

> **Nota de la fusión (26/09).** La revisión con el estudio de mercado (§1.2) se
> escribió sobre `main`, que estaba en el estado del 23/09. Sus tres primeras
> prioridades —tornado, ajuste de distribuciones y Web Worker— se hicieron en la
> rama de trabajo el 24/09, sin conocer el estudio y en el mismo orden que él
> propone. Se conservan sus decisiones (E4 redefinida, E9a, E12, precio,
> rechazos) y se actualizan los estados.

**Orden de trabajo desde el 2026-09-26** (estudio de mercado §1.2 + revisión
§2.1, sobre el estado real):

1. ~~E7: tornado y sensibilidad~~ ✅ 24/09.
2. ~~E7: ajuste de distribuciones~~ ✅ 24/09; AIC y BIC añadidos el 26/09.
3. ~~E6: Web Worker en el panel~~ ✅ 24/09. **E9a (Excel Web y Mac)**: en la
   guía de pruebas, junto con Windows.
4. **E4 redefinida**: «Preparar para compartir» ✅ 26/09; el resto de E4 en
   §2.1-B.
5. **Pruebas en Excel** (§2.1-A) — bloqueante para lo siguiente.
6. **E10: decidir licencia y precio.** Decisión del usuario; bloquea la publicación.
7. §2.1 en su orden (B1–B3, C1–C2–C5 + I1, B4–B6, D1, H2, I2, C3–C4…).
8. **E12**, después de la v1.0.

Todo el trabajo de producto (E9–E11) no es técnico, pero sin él esto no llega a
nadie más que a su autor.

**Cobertura de funciones, medida** (`npm test` la ata; no es una estimación):

| Nivel | Qué es | Estado |
|---|---|---|
| Nivel 0 | Aritmética, agregación, lógica, redondeo, estadísticos de orden | **57 / 57** |
| Nivel 1 | Criterios, fechas, financieras, búsquedas | **43 / 44** |
| Nivel 2 | Texto, matriciales dinámicas, `SUBTOTALES`, `LET`/`LAMBDA` | **37 / 41** |

Falta de Nivel 1 solo `DESREF`, a propósito: es una referencia dinámica (el
rango depende de sus argumentos) y rompe el grafo fijo. Con desplazamientos
constantes se podrá resolver al compilar; si no, modo compatible. Las once que
entraron el 2026-09-23 están verificadas contra Excel (sexta tanda, 69/69).

Faltan de Nivel 2 (`LAMBDA` hecha el 29/09): `DIVIDIRTEXTO` (solo tiene sentido derramando),
`FORMULATEXTO` e `IMPORTARDATOSDINAMICOS`. Las matriciales dinámicas y `LET`
están hechas; las matriciales, **dentro de una función que las consuma** (lo
que derramaría va al modo compatible, ver `compiler/usoMatricial.ts`).

Total aproximado: **78–105 días** de trabajo efectivo. El MVP utilizable (v0.5)
se alcanzó.

> **E8 (modo compatible) ya no es una etapa suelta**: se absorbe dentro de E3 por la
> decisión 15. Se mantiene el número retirado para no romper las referencias de los
> commits anteriores.
>
> **E10 y E11 son nuevas** y nacen del cambio de destino del proyecto (§1.1). No son
> opcionales: sin ellas el complemento no puede llegar a un usuario que no seas tú.

---

## 2.1 Plan tras la revisión del 24/09/2026

Revisión hecha con el usuario antes de seguir desarrollando. **Nada de esta
sección está hecho.** Orden por bloques; dentro de cada bloque, por valor.
Estimaciones en días de trabajo efectivo.

### A. Probar lo que hay (bloqueante para todo lo demás)
- **A1.** El usuario recorre `docs/GUIA_PRUEBAS_EXCEL.md` (30 pruebas) y se
  arregla lo que falle. Las dos que no se pueden simular fuera de Excel: B4
  (botones de la cinta con el panel abierto) y C2 (informe en el navegador).
- **A2.** Tandas de fidelidad 7 (LET) y 8 (matrices); las 3 fórmulas
  matriciales de `Caso_practico.xlsx`.
- **Primera ronda (27/09, A1–E4).** Pasaron A1–A8, B1–B4, C1–C4 y D1.
  Fallos arreglados el mismo día: el panel en blanco dentro de Excel (Office.js
  anula `history.replaceState`), «Referencia sin resolver» cuando una salida
  depende de una `RIESGO.*` que no está en el panel, y el tornado que no salía
  en el PDF. La guía del bloque E se rehízo (las pruebas se hicieron en la hoja
  «Modelo» porque la guía no insistía en «Pruebas»). Mejoras que propuso el
  usuario, repartidas abajo: **C7**, **C8**, **E5**, **E6**, **E7**, **E8** y
  **F4**.
- **Segunda ronda (27/09, C2–W).** Pasaron C2, E1–E5, F1, G1–G2, H1,
  J1–J4, W1–W4. Tandas de fidelidad 7 (14/14) y 8 (27/27, tras leer bien
  los errores «enriquecidos» como `#CALC!`). Las 3 fórmulas de
  `Caso_practico.xlsx` (`SUMAPRODUCTO(fila/fila)` sobre H:DC) van por el
  motor rápido. Arreglado: funciones RIESGO en Excel para la Web (CORS en
  `funciones.json/js`, pendiente de confirmar), salida sin números (G3) sin
  «∞», y «Restaurar» arriba cuando el libro está preparado (J4). Pendiente
  del usuario: K, y repetir W5, J4 y G3. Excel para la Web: ExcelApi 1.12,
  8 hilos, 757 ms para 10.000 iteraciones.
- **Tercera ronda (28/09, K, J, L, G3).** Pasaron K1–K2 (mismos números al
  volver a marcar, motor rápido), J2, L1–L6 y G3. J1 no quedó claro en la guía
  (el botón «Preparar para compartir» está al final de la pestaña Modelo). J3
  en Excel para la Web sin preparar el libro enseña `_xldudf_RIESGO_NORMAL`,
  que es lo esperado: hay que repetirlo **después** de preparar. Nuevas
  peticiones: C8 (otra vez), C9, F5 (otra vez), F6 y el bloque T.

### B. Runtime compartido, modo del libro y funciones RIESGO (E4) — 6–8 d
- **B1. Runtime compartido** (`SharedRuntime`): panel, cinta y funciones en
  el mismo proceso. Es la base de B2 y B3, y la solución segura de A1-B4.
  ✅ **Hecho el 29/09** (manifiesto 0.5): `<Runtimes>` de larga vida con
  `taskpane.html`, que carga también `funciones.js`; `FunctionFile` y la
  página de las funciones apuntan ahí; los cuatro botones son `ExecuteFunction`
  (`ui/acciones.ts`: pestaña + `showAsTaskpane`). Exige `SharedRuntime 1.1`
  (Web, Windows 365 ≥ 2002 y Excel 2021, Mac ≥ 16.35; no iPad). B6 pasa los
  resultados en memoria y las celdas que dijeron «simula primero» se
  refrescan al publicarse, también al abrir el libro en otro equipo.
  Verificado sobre la página real con un Office de mentira; **falta Excel
  real**.
  *Ronda del 29/09 (B4):* los botones de la cinta cambian de pestaña, pero el
  panel se pone en blanco un instante (se recarga). Con el runtime compartido
  el panel no se recarga: debe desaparecer.
- **B2. Interruptor en la cinta «Determinístico / Probabilístico».**
  Determinístico: cada `RIESGO.*` muestra un valor fijo, a elegir en
  Configuración entre **media, moda, mediana o un percentil**. Probabilístico:
  muestra un valor aleatorio y F9 remuestrea (funciones volátiles). El modo
  del libro no cambia los resultados de la simulación, y se dice en la UI.
  ✅ **Hecho el 29/09**: grupo «Modo del libro» en la cinta (Valores fijos /
  Aleatorio; el activo, desactivado con `Office.ribbon.requestUpdate`),
  sección en Configuración, guardado en el libro (`excel/modoLibro.ts`),
  valores en `engine/modelo/valorFijo.ts`. Las funciones de distribución son
  volátiles; las de resultados (B6), no. Límite: en Aleatorio,
  `RIESGO.TRUNCAR` deja en el límite lo que cae fuera (no vuelve a sortear).
  **Falta Excel real** (N6, N7).
- **B3. Cinta que actúa sin abrir el panel**: «Marcar como entrada», «Marcar
  como salida», «Simular», «Quitar resaltado».
  ✅ **Hecho el 29/09**: grupo «Acciones» en la cinta; el panel, montado en
  el runtime compartido aunque no se vea, registra los manejadores
  (`manejarDesdeLaCinta` en `ui/acciones.ts`; `ui/marcar.ts` compartido con
  los botones del panel). Marcar no abre el panel (la celda se pinta); si hay
  un aviso, sí. Simular abre el panel para el progreso. **Falta Excel real**
  (N8).
- **B1b. Funciones RIESGO que sortean en el motor compatible** (decidido el
  28/09; va después de B1, B2 y B3, dentro de la etapa 2). Con el runtime
  compartido, durante una simulación con Excel en el bucle el panel dice a
  las funciones qué iteración toca, y cada `RIESGO.*` devuelve su valor
  sorteado (no la media), calculado con los parámetros que Excel acaba de
  obtener. Razones:
  - Completa B7: `=10+RIESGO.NORMAL(0;1)` y `=RIESGO.NORMAL(C34;50)` hoy
    solo van con el motor rápido; con esto, también con el compatible. Es como
    trabaja @RISK.
  - **Más seguro para el libro**: el compatible ya no tendría que escribir
    números encima de las celdas con RIESGO y devolverles la fórmula al final
    (si Excel se cierra a mitad, hoy pueden quedarse sin su fórmula).
  - Mismos sorteos que el motor rápido con la misma semilla: se reutiliza el
    cuantil por iteración de B7 (`engine/functions/riesgo.ts`).

  A vigilar:
  - Cada llamada necesita una identidad fija (celda y posición en la
    fórmula) para que el sorteo sea reproducible.
  - Hay que comprobar en Excel real cómo recalcula las funciones en cada
    iteración.
  - No acelera el compatible: sigue siendo un recálculo por iteración.

  Estimación: 2–3 d con B1 hecho.
  ✅ **Hecho el 29/09**: las celdas que son solo la función siguen como
  antes (se escribe el valor, por lotes); las reescritas (dentro de una
  operación, parámetros aleatorios) conservan la fórmula y su función
  devuelve el sorteo de la iteración (`simulacionEnExcel` en
  `excel/modoLibroCompartido.ts`, `sorteoEnCurso` en `ui/funciones.ts`); con
  alguna, una iteración por viaje. No admitidas (aviso): varias funciones en
  una fórmula, `TRUNCAR` con parámetros aleatorios. En el banco, compatible y
  rápido dan exactamente lo mismo. **Falta Excel real** (N9).
- **B4. Más funciones, las que el motor ya sabe muestrear**:
  `RIESGO.DISCRETA({valores};{pesos})`, truncado (`RIESGO.TRUNCAR` o argumento
  opcional de mínimo/máximo), `RIESGO.LOGNORMAL2` (parámetros del logaritmo).
- **B5. Distribuciones nuevas en el motor y como funciones** ✅ 29/09 (todas las de la lista; el histograma es la «general» por tramos iguales): t de Student,
  logística, log-logística, Pareto, geométrica, binomial negativa,
  hipergeométrica, uniforme entera, triangular por percentiles (Trigen),
  general/histograma (a partir de puntos). Cada una con sus pruebas de
  momentos y de Kolmogorov–Smirnov, como las actuales.
- **B6. Funciones que no son distribuciones** — ✅ **hecho el 28/09** lo de
  traer resultados (`MEDIA`, `DESV`, `PERCENTIL`, `PROB`, `MIN`, `MAX`), con el
  diseño de abajo (`excel/resultadosEnHoja.ts`, `almacenResultadosHoja.ts`,
  `resultadosEnGrafo.ts`). ✅ **29/09**: `RIESGO.SALIDA("nombre")` (vale 0,
  se suma a la fórmula) y `RIESGO.CORRELACION(celda1; celda2; coef)` (vale el
  coeficiente), en `excel/declaracionesEnGrafo.ts`. Antes quedaban `RIESGO.SALIDA()` y `RIESGO.CORRELACION`,
  y con B1, leer los resultados del libro: `RIESGO.SALIDA()` (marcar una
  salida desde la fórmula); `RIESGO.MEDIA(celda)`, `RIESGO.PERCENTIL(celda;
  p)`, `RIESGO.PROB(celda; umbral)`, `RIESGO.DESV(celda)` para traer a la hoja
  los resultados de la última simulación; correlación declarada desde la
  fórmula (`RIESGO.CORRELACION`, a diseñar).
  *Revisión del 28/09 (sin cambios de código):*
  - Las funciones de Excel viven hoy en un runtime propio (`funciones.html`),
    separado del panel: no ven los resultados en memoria ni los guardados en
    el libro.
  - **Sin tocar el manifiesto** se puede hacer así:
    - El panel, al simular, deja en `OfficeRuntime.storage` los cuantiles y
      estadísticos de cada salida; las funciones los leen.
    - La celda se identifica con `requiresParameterAddresses` en los
      metadatos de las funciones.
    - El panel fuerza un recálculo al terminar.
  - **Límites de esa versión:**
    - Los resultados viven en el equipo, no en el libro. En otro equipo, o
      tras borrar la caché, la función da «simula primero» hasta volver a
      simular.
    - Dos libros con la misma celda comparten clave.
  - **Con B1** (runtime compartido) las funciones leen los resultados
    **guardados en el libro** y esos límites desaparecen; el código de las
    funciones se reutiliza y solo cambia de dónde leen.
  - **El motor también cambia:** una fórmula que use `RIESGO.MEDIA(…)` debe
    tratarse como una constante (su valor actual), no forzar el modo
    compatible.
  - Estimación: 2–3 d antes de B1, más ≈ 0,5 d para cambiar a leer del libro
    tras B1.
- **B7. Argumentos que son celdas** — ✅ **hecho el 28/09**, fases 1 y 2
  (`engine/modelo/riesgoEnGrafo.ts`, `engine/functions/riesgo.ts`): `=RIESGO.NORMAL(B2;15)` cuando B2 no
  depende de ninguna entrada (se resuelve una vez); y, en una segunda fase,
  distribuciones cuyos parámetros dependen de otras entradas. Permitir la
  función dentro de una operación (`=1+RIESGO.NORMAL(…)`).
  *Revisión del 28/09 (sin cambios de código):*
  - **Hoy:** `leerFuncionRiesgo` solo acepta números escritos (`constante()`:
    ni `C12` ni `10*2`). En Excel la celda sí enseña la media, porque la
    función recibe el valor, pero al simular se rechaza (prueba E4 de la
    primera ronda y F5 de la guía nueva). `RIESGO.CATEGORIA`, `DISCRETA` y
    `EMPIRICA` ya aceptan rangos, pero solo con valores escritos.
  - **Fase 1** (≈ 1 d): argumentos que son celdas, cálculos o fórmulas que no
    dependen de ninguna entrada aleatoria. Se comprueba con el grafo, se toma
    el valor que Excel ya calculó (hay que leer también los valores de las
    celdas con fórmula) y se construye la distribución una vez. Funciona igual
    en los dos motores.
  - **Fase 2** (≈ 2–3 d): parámetros que cambian en cada iteración (la
    media es otra celda aleatoria) y la función dentro de una operación.
    - Todas las distribuciones del motor muestrean por transformada inversa
      (`Distribution.quantile(u)`).
    - Basta con muestrear el uniforme `u` como hoy (Monte Carlo, hipercubo,
      correlación y reproducibilidad sin cambios) y calcular
      `quantile(u; parámetros de esa iteración)` como una función más del
      evaluador del motor rápido.
    - En el modo compatible exige un recálculo más por iteración (leer los
      parámetros, escribir la muestra): más lento. Primero, solo el motor
      rápido, y en el compatible un aviso claro.
  - **No toca el manifiesto**: se puede hacer antes de la etapa 2.
  - Afecta a la guía: F5 deja de ser «error bien explicado» y pasa a
    comprobar que `=RIESGO.NORMAL(C12;150)` simula. Hay que añadir pruebas con
    parámetros que dependen de otra entrada y con `=1+RIESGO.NORMAL(…)`.

### C. Gráficas y exportación — 5–7 d
- **C1. Hoja «Resumen de entradas y salidas»** al volcar: por cada entrada,
  distribución, parámetros, **estadísticos de lo muestreado** (media,
  desviación, mínimo, p5, p50, p95, máximo) y su lugar en el tornado; por cada
  salida, los mismos estadísticos, el umbral y su probabilidad. Una tabla
  pensada para pegar en un informe.
- **C2. Gráficos nativos de Excel que faltan en el volcado**: tornado (barras
  horizontales), araña (líneas), y los de comparación de escenarios (curvas
  superpuestas). Hoy solo hay curva acumulada e histograma.
- **C3. Datos de la simulación** ✅ 29/09 (`excel/iteraciones.ts`, `exportarIteraciones.ts`; hasta 100.000, las retenidas): exportar las iteraciones (entradas y
  salidas, hasta un tope) a una hoja, para que el usuario haga sus propios
  análisis o gráficos.
- **C4. Gráficas nuevas en el panel y el informe** ✅ 29/09 (`ui/Graficos.tsx`; la dispersión, solo en el panel):
  - **dispersión** entrada × salida (se elige la pareja), que enseña la forma
    de la relación que resume el tornado;
  - **caja y bigotes** para comparar varias salidas o escenarios de un
    vistazo;
  - **abanico** para salidas que son una serie (flujo de caja por año: p5–p95
    y mediana por periodo), muy de modelos financieros;
  - **curvas de varias salidas superpuestas**.
- **C5. Vista previa de la distribución** al editarla en el panel (su forma,
  p5/p50/p95), para no elegir parámetros a ciegas. Es probablemente la mejora
  de uso más barata con más efecto.
- **C6. Percentiles configurables** (qué percentiles se enseñan y exportan).
- **C7. Informe PDF que habla del proyecto** *(usuario, 27/09)*: título y
  descripción del proyecto (editables en Configuración, guardados en el libro),
  nombres legibles en vez de `Modelo!C5` (ver E5), y un párrafo de lectura
  generado con reglas a partir de los percentiles y el tornado (E12-7).
- **C8. Hoja volcada más legible** *(usuario, 27/09: «desorganizada y difícil
  de leer»)*: una sección por salida con título, estadísticas arriba y
  gráficos al lado, tablas con formato de tabla de Excel; va con C1.
  **Segunda queja el 28/09** (captura de L3): números sin formato (sin
  separador de miles, 15 decimales, porcentajes como 0,214), todo en una
  columna larga, salidas constantes con sensibilidad a cero. Sube de
  prioridad: formato numérico según la celda de origen, un bloque por salida
  con sus gráficos al lado, y esconder lo que no aporta.
- **C9. Ver cómo se muestreó cada entrada** *(usuario, 28/09)*: después de
  simular, en cada entrada, su histograma y su curva acumulada con los valores
  que de verdad se generaron, sus estadísticos y, encima, la distribución
  teórica elegida, para comprobar que el modelo usó lo que se quería. Barato:
  las entradas ya se guardan para el tornado.
- **C10. Marcas en el histograma** ✅ 29/09 (panel e informe; la hoja volcada queda para C4) *(usuario, ronda del 29/09)*: líneas de la
  media y la mediana, y **delimitadores que se arrastran** sobre el gráfico
  (como los de @RISK) que van diciendo el porcentaje a cada lado y entre los
  dos. Percentiles configurables (enlaza con C6). En el panel y, fijos, en el
  informe y la hoja volcada.

### D. Análisis que faltan — 3–5 d
- **D1. Análisis de escenarios por cola** (el de @RISK; su versión iteración a
  iteración es el depurador de escenarios de E12): qué entradas están
  más desplazadas cuando la salida cae en su peor 10 % (o mejor 10 %). Dice
  *qué tiene que pasar* para que salga mal, que el tornado no dice.
- **D2. Análisis de estrés / qué pasa si determinista** ✅ 29/09 (sobre las iteraciones retenidas, sin volver a simular; `excel/estres.ts`): fijar una entrada
  en un percentil y ver el efecto en la salida sin simular el resto a mano.
- **D3. Salidas que son un rango** ✅ 29/09 (una salida por celda con nombres de serie; `nombresDeSerie`) (C28:H28 como una sola salida con
  periodos), base del gráfico de abanico C4.
- **D4. Tornado de cambio en la salida** ✅ 29/09 (de las medias por décimos de la araña; `TornadoCambio`) *(nuevo, 27/09)*: cuánto sube o baja
  la media (o un percentil) de la salida entre el valor bajo y el alto de cada
  entrada, en unidades de la salida. Complementa al tornado de correlaciones,
  que dice «cuánto se parecen» pero no «cuánto dinero mueve».

### E. Uso del panel — 2–4 d
- **E1. Vista de todas las entradas** ✅ 29/09 en una tabla (nombre, celda,
  distribución, correlaciones), incluidas las `RIESGO.*` del libro, con
  edición rápida.
- **E2. Matriz de correlaciones** ✅ 29/09 visible y editable como tabla.
- **E3. Deshacer** ✅ 29/09 (30 cambios, agrupando lo escrito de seguido) el último cambio del modelo.
- **E4. Ayuda contextual** ✅ 29/09 (`ui/ayuda.tsx`, textos reutilizables en el manual): qué es cada distribución, cada gráfico y cada
  número, sin salir del panel.
- **E5. Nombres legibles automáticos** *(27/09)*: al marcar una celda,
  proponer como nombre el texto de su izquierda (B5 «Precio unitario») o de
  encima; se usa en el panel, el tornado, la araña, el informe y el volcado.
  Barato y es lo que más cambia la lectura de todo lo demás.
- **E6. Elegir la salida en Resultados** *(usuario, 27/09)*: con muchas
  salidas hay que desplazarse mucho. Un selector arriba que enseñe una salida
  cada vez, más una tabla resumen de todas; y, si se puede, que al
  seleccionar en la hoja una celda de salida el panel salte a ella.
- **E7. Administrador de escenarios** *(usuario, 27/09)*: hoy solo hay una
  referencia fijada. Guardar varios escenarios con nombre (parámetros y
  resultados), compararlos de dos en dos o todos a la vez, y borrarlos.
  Enlaza con H3 (simulaciones en serie).
- **E8. Distinguir las celdas con `RIESGO.*`** *(usuario, 27/09)*: pintarlas
  de un color propio, distinto del amarillo de las entradas del panel.
- **U1. Asistente del primer modelo y plantillas** ✅ 29/09 (`excel/plantillas.ts`, `escribirPlantilla.ts`, `PrimerModelo` en Modelo.tsx; cada plantilla probada simulándola) *(nuevo, 27/09; el
  estudio pedía «asistentes paso a paso»)*: guía a quien empieza (qué celdas
  son inciertas, qué distribución elegir, qué salida medir) y ofrece modelos
  de partida (proyecto de inversión, presupuesto de obra, cartera).
- **U3. Interacción: cinta, explorador y catálogo** *(decidido con el usuario el 29/09, tras su ronda N1–N6: «no quiero llenarlo de funcionalidades, quiero que sea muy útil»)*. Límites de la plataforma, para no prometer lo que no se puede: la cinta de un complemento Office.js solo admite **botones y menús** (no campos de texto ni desplegables editables, como la de @RISK, que es nativa de Windows); las **ventanas flotantes** (`displayDialogAsync`) sí funcionan en Windows, Mac y la Web.
  - **U3.1 Explorador de distribución** ✅ 29/09 (`excel/explorador.ts`, `excel/ventana.ts`, `ui/explorador.tsx`) (ventana flotante): la distribución de la celda seleccionada —una entrada (su distribución) o una salida (su resultado)—, histograma o curva acumulada, **estadísticas a la derecha** y **dos delimitadores que se arrastran** con el porcentaje entre ellos y a cada lado (reutiliza C10). Se abre desde la cinta («Ver distribución») y sigue a la selección.
  - **U3.2 Cinta reorganizada** ✅ 29/09 (manifiesto, `excel/cinta.ts`, acciones en `ui/main.tsx` y `ui/Panel.tsx`; ayuda en `ui/ayudaPagina.tsx`): Modelo (Marcar entrada, Marcar salida, Quitar resaltado) · Simulación (**Iteraciones ▾** con 1.000 / 5.000 / 10.000 / 50.000 / 100.000 y «Otra…», la activa desactivada como en el modo del libro; Simular; Valores fijos / Aleatorio) · Análisis (Ver distribución, Ajustar a datos, Escenarios) · Informes (Volcar a una hoja, Informe PDF) · Ayuda (Manual —la guía hasta que exista M—, Ejemplos ▾ con las plantillas, Diagnóstico).
  - **U3.3 Catálogo visual de distribuciones** ✅ 29/09 (`GRUPOS_CATALOGO`, `Catalogo` en `ui/EditorDistribucion.tsx`), dentro del selector de distribución que ya existe (no una ventana aparte): cada una con su forma en miniatura y «cuándo usarla».
  - **U3.4 Lista de entradas y salidas** ✅ 29/09 (pestaña «Entradas y salidas» de la ventana del explorador: Excel solo admite una ventana por complemento; `listaDelModelo`) en ventana flotante (tipo «ventana del modelo»): todas, con su distribución o su resultado, y clic para ir a la celda o abrirla en el explorador.
  - **U3.5 Menú del clic derecho** ✅ 29/09 (confirmado por el usuario): Marcar entrada / salida, Ver distribución. **U3.6 Botón Detener** ✅ 29/09 en la cinta, activo solo mientras simula.
  - **No se hace** (decidido): un botón por cada análisis; más distribuciones «por tenerlas»; campos de texto en la cinta (la plataforma no lo permite). **Ya existe, solo hacerlo visible**: administrador de escenarios y comparación con referencia (E7), cajas, curvas superpuestas y abanico (D2–D4).
- **U2. Legibilidad del panel** ✅ 29/09 en Resultados (cifras clave, secciones plegables que se recuerdan, menos texto; el resto del panel, según lo que diga el usuario en N11) *(usuario, ronda del 29/09: «está muy difícil
  de leer toda la información, en general el panel lateral»)*. Primer paso
  hecho el 29/09: las acciones secundarias son botones con borde (antes
  parecían texto). Queda un repaso de conjunto, a decidir con el usuario:
  jerarquía (lo principal arriba y grande: media, rango, probabilidad del
  umbral), secciones plegables en Resultados (medidas de riesgo, qué tiene
  que pasar, entradas muestreadas…) con las más usadas abiertas, menos texto
  explicativo visible (a una «i» o a la ayuda E4) y más espacio entre bloques.
  Va antes del manual (M2), para que las capturas sean las definitivas.

### F. Motor y cobertura — según lo que pidan los libros
- **F1.** `DESREF` con desplazamientos constantes ✅ 29/09 (`engine/parser/desref.ts`); `LAMBDA` (en la celda, en LET y con nombre) y nombres definidos ✅ 29/09 (`engine/parser/let.ts`, `nombres.ts`; libro `fidelidad-lambda.xlsx`, Peng-Robinson). Siguen en el compatible: LAMBDA recursivas y `MAP`/`REDUCE`/`BYROW`…
- **F2.** Medir con libros grandes (el de 132 hojas) el tiempo de lectura y de
  simulación, y optimizar donde se vea.
- **F3.** Modo compatible más rápido (lotes de iteraciones por sincronización).
- **F4. Núcleos en automático según el tamaño** *(medido el 27/09)*: con
  10.000 iteraciones del libro de demostración, 1 hilo tardó 212 ms y 8 hilos
  527 ms (arrancar los workers cuesta más que lo que reparten). El modo
  automático debería usar un hilo por debajo de un umbral de trabajo
  (iteraciones × celdas), medido.
- **F5. Congelar la pantalla en el modo compatible** *(usuario, 27/09)*:
  como `ScreenUpdating = False` en VBA. Office.js tiene
  `application.suspendScreenUpdatingUntilNextSync()` (ExcelApi 1.9), pero la
  documentación avisa de parpadeo si se llama en bucle, que es justo lo que
  hace el modo compatible. Probarlo en Excel con una opción antes de dejarlo
  por defecto; medir si acelera. **Pedido otra vez el 28/09**: sube de
  prioridad. **Ronda del 29/09**: con la casilla, la hoja parpadea y va más
  rápido; sin ella, se ven los números cambiar y va más lento. Congelar del
  todo no se puede con Office.js (no hay un `ScreenUpdating` que dure), pero
  sí repintar mucho menos: ver F5b.
- **F5b. El modo compatible por lotes** ✅ *(29/09)*: 20 iteraciones por
  viaje a Excel en vez de una (escribir, recalcular y leer, encolado, y un
  solo `sync`). Excel repinta una vez por lote y se ahorran 19 de cada 20
  viajes, que son lo caro. Mismos números que antes (comprobado en el banco
  contra el motor rápido). Pendiente: medirlo en Excel real (prueba H2 de la
  próxima ronda).
- **F6. Reproducibilidad del modo compatible** *(28/09)*: el usuario vio un p95
  distinto al repetir K1/K2 con el motor de Excel. En el banco los dos dan
  exactamente lo mismo (media, desviación y todos los percentiles). Sospecha:
  la entrada C5 se volvió a marcar con la triangular por defecto (108/120/132)
  en vez de 105/120/140. El usuario confirma (28/09) que probablemente la
  distribución quedó distinta. Se cierra; se recomprueba en la ronda completa.

### G. Producto (E9–E11)
Mac, instalación sin `npm start`, manifiesto de producción, licencias,
interfaz en inglés, privacidad y AppSource: sin cambios respecto a lo
descrito abajo.

### H. Calidad del modelo y análisis avanzado — 6–9 d
Añadido en la segunda revisión con el usuario (25/09).
- **H1. Resultados que no cambian al volver a marcar una celda.** Hoy el
  flujo aleatorio de una entrada depende de su identificador, que se genera
  nuevo cada vez que se marca: quitar y volver a marcar la misma celda cambia
  los números con la misma semilla. Ligar el flujo a la celda (y conservarlo
  al renombrar). Corto y protege la reproducibilidad de todo lo demás: **va
  pronto**.
- **H2. Más medidas de riesgo**: VaR y CVaR (pérdida media en la peor cola),
  asimetría, curtosis, semidesviación. En el panel, el informe y el volcado.
- **H3. Simulaciones en serie (paramétricas)** ✅ 29/09, cubierta por `RIESGO.DECISION` (T9) con opciones numéricas: repetir la simulación
  variando un parámetro (precio 100 / 110 / 120) y comparar los resultados
  lado a lado. Reutiliza la comparación de escenarios.
- **H4. Búsqueda de objetivo con riesgo** ✅ 29/09 (`excel/busquedaObjetivo.ts`; motor rápido, ~10–16 simulaciones): «¿qué valor de esta celda hace que
  P(VAN < 0) quede por debajo del 10 %?», por bisección sobre simulaciones.
- **H5. Series temporales** ✅ 29/09 con fórmulas encadenadas (el motor ya las admite, B7) y la plantilla «Serie de precios»; una función propia de serie, si se pide: entradas que evolucionan periodo a periodo de
  forma aleatoria (paseo aleatorio, crecimiento con ruido, reversión a la
  media), declaradas sobre un rango (C7:H7). Enlaza con D3 y el abanico C4.
- **H6. Avisos de coherencia** ✅ 29/09 (`excel/coherencia.ts`: entradas sin efecto y negativos en celdas positivas): distribuciones que dan negativos en
  cantidades que no pueden serlo, correlaciones que apuntan a celdas que ya
  no existen, salidas que no dependen de ninguna entrada (ya existe) o
  entradas que no afectan a ninguna salida.
- **H7. Trazado de dependencias** ✅ 29/09 (camino más corto, en «Cómo se calculó»): qué salidas dependen de cada entrada y por
  qué celdas intermedias pasa, para detectar entradas mal conectadas.
- **H8. Migración del modelo guardado** ✅ 29/09 (`migrarRiskModel`, `MIGRACIONES_RISK_MODEL`; aviso para versiones más nuevas): cuando cambie el esquema de
  `RiskModel`, que los libros de versiones anteriores se abran sin perder
  nada (hoy un esquema desconocido se rechaza, sin migrar).
- **H9. Manual de usuario en español** y más libros de ejemplo (proyecto de
  inversión, presupuesto de obra, cartera), además de la guía de pruebas.
- **H10. Libros compartidos** (OneDrive/SharePoint, coautoría): comprobar qué
  pasa si dos personas abren a la vez el mismo libro con el complemento, y
  proteger el modelo guardado de escrituras cruzadas.

### I. Motor de ajuste de distribuciones — I1: 3–4 d · I2: 3–5 d · I3: sin fecha
Añadido el 27/09 a partir de la propuesta del usuario (§1.2.1). Parte de lo
que ya hay: MLE para normal, lognormal, exponencial y Weibull (Newton), gamma
por la aproximación de Minka, acotadas por cotas extendidas y momentos, beta
por momentos; A–D, K–S, AIC y BIC; orden por AIC con selector.
- **I1. Ajuste rápido y explicado** (va justo después de las pruebas, con C5):
  - **Diagnóstico previo visible**: n, signo (¿hay negativos o ceros?), sesgo,
    curtosis, peso de la cola, si todos son enteros, si están acotados. Explica
    qué familias se proponen y cuáles se descartan (p. ej. «hay negativos: se
    descartan lognormal, gamma y Weibull»).
  - **AICc** (AIC corregido para muestras pequeñas) y **Cramér–von Mises**, junto a
    los criterios actuales.
  - **Gráficas del ajuste**: histograma de los datos con la densidad ajustada
    encima, y gráfico **Q-Q**.
  - **Gamma por MLE exacto** (Newton sobre la aproximación de Minka).
  - **Distribución empírica** como candidata en el ajuste y como función
    `RIESGO.EMPIRICA(datos)` (enlaza con «general/histograma» de B5).
- **I2. Ajuste orientado al riesgo** ✅ 29/09 (la binomial negativa, también el 29/09, tras B5):
  - **Error en percentiles** P50, P80, P90, P95 y P99 (ajustado frente a
    empírico), con un objetivo elegible: *general*, *cola superior* o *cola
    inferior*. Cada criterio se muestra por separado; **sin puntuación combinada
    opaca**.
  - **Bootstrap** de los parámetros y de los percentiles: intervalos que dicen
    cuánto se puede fiar uno del ajuste con pocos datos.
  - **Discretas**: Poisson, binomial y binomial negativa, propuestas cuando los
    datos son enteros (detección automática).
- **I3. Avanzado** (sin fecha, según lo que pidan los usuarios): bootstrap
  paramétrico con p-valor para A–D y K–S; cola extrema con cuerpo empírico +
  Pareto generalizada (GPD); ajuste robusto a atípicos; datos truncados o
  censurados; mezclas de distribuciones. Ampliar familias ajustables va con B5.

### T. Variables de texto (categóricas) — ✅ T1–T4 y T6 hechos el 28/09 (T5: documentación en el manual, bloque M)
Propuesto por el usuario el 28/09 a raíz de G3: que una simulación pueda
trabajar con **textos**, no solo con números. Dos mitades:

- **Entradas de texto**: una celda que vale «Norte» con un 20 %, «Sur» con un
  25 %, «Este»… en cada iteración, y el resto del libro formulado sobre ella
  (`BUSCARV`, `SI`, `INDICE/COINCIDIR`…). Hoy solo se puede con un truco: una
  discreta de números 1..5 y un `INDICE` en la hoja.
- **Salidas de texto**: una celda cuyo resultado es un texto (la zona elegida,
  «Aprobado / Rechazado», el proveedor más barato…). Hoy cuenta como «no dio
  un número» y no enseña nada (G3). Lo que tendría que enseñar: con qué
  frecuencia sale cada valor, cuál sale más, y qué entradas lo deciden.

**Por qué merece la pena**: hasta donde sé, los complementos del mercado solo
simulan números (las salidas de @RISK tienen que ser numéricas; los textos se
simulan con índices a mano). Es una diferencia real, y el motor ya está
preparado a medias: el canal de valores (`Columna`) lleva textos por
iteración desde E5, y las funciones de texto están verificadas contra Excel.

**Qué cambia en la aplicación** (borrador, se cierra con las respuestas):

| Parte | Cambio |
|---|---|
| Modelo guardado | Nueva distribución `categorical` con valores (texto) y pesos, o leída de un rango del libro |
| Motor rápido | Entradas que inyectan una columna de textos en vez de números; recuento de categorías por salida en cada bloque (sin límite de iteraciones, con tope de categorías distintas) |
| Modo compatible | Escribir textos en las celdas de entrada y leer textos de las salidas |
| Estadísticas | Frecuencias y moda para salidas de texto; «probabilidad de que salga X» como el umbral de las numéricas |
| Sensibilidad | Salida numérica × entrada de texto: media (y caja) de la salida por categoría. Salida de texto × entradas: cómo cambia la probabilidad de cada categoría según cada entrada |
| Panel | Editor de la distribución de texto (escrita o desde un rango); resultados con barras por categoría |
| Funciones | `RIESGO.CATEGORIA(valores; pesos)` que muestra el más probable fuera de la simulación; «Preparar para compartir» también la convierte |
| Informe, volcado, escenarios | Tablas de frecuencias y su comparación entre escenarios |
| Documentación | Manual (una página de variables de texto), tutorial 3 (el retraso de obra o el proveedor como texto), pruebas de fidelidad del motor con textos |

**Decisiones del usuario (28/09)**:
1. **Entradas**: en el panel (valores escritos o leídos de un rango: columna de
   nombres + columna de probabilidades) **y** con la función
   `RIESGO.CATEGORIA(valores; pesos)` en la celda.
2. **Salidas de texto**: las tres cosas — frecuencias con barras y el valor
   más frecuente; la probabilidad de un valor, como el umbral de las numéricas
   y comparable entre escenarios; y qué entradas deciden cada valor.
3. **Cruce salida numérica × entrada de texto**: sí — media y caja (p5–p95)
   de cada salida numérica por categoría.
4. **Lugar**: después de la etapa 1b (C8, C9, F5) y antes de la etapa 2.

**Niveles**: T1 entradas de texto (panel y rango) · T2 salidas de texto
(frecuencias, barras, probabilidad de un valor) · T3 sensibilidad cruzada (qué
entradas deciden cada valor; salida numérica por categoría) · T4 función
`RIESGO.CATEGORIA` y «Preparar para compartir» · T5 documentación, tutorial y
pruebas de fidelidad con textos.

**Ideas del mismo estilo** *(propuestas el 28/09; el usuario incluye T6 en
este bloque y deja T7, T8 y T9 para después de la etapa 2)*:
- **T6. Salidas de sí/no** *(entra en el bloque T)* (`VERDADERO`/`FALSO`): «¿se cumple el covenant?»,
  «¿llega a tiempo?» → probabilidad de que sea verdadero, y qué entradas lo
  deciden. Sale casi gratis con T2.
- **T7. Entradas de fecha** ✅ 29/09 (por el formato de fecha de la celda; `engine/modelo/fechas.ts`, `excel/formatoCeldas.ts`, `formatoDe` en `ui/formato.ts`) *(después de la etapa 2)*: una fecha de inicio o de entrega incierta
  (triangular entre dos fechas) que se enseña como fecha y no como número de
  serie, y salidas de fecha («fecha de fin del proyecto») con percentiles en
  fechas. Muy de gestión de proyectos.
- **T8. Registro de riesgos** ✅ 29/09 en el panel, la hoja volcada y el informe PDF (`RIESGO.EVENTO`, `excel/registroRiesgos.ts`) *(después de la etapa 2)*: cada riesgo como probabilidad × impacto (un
  sí/no y una distribución del coste o del retraso), declarado en una tabla
  de la hoja, con su propia vista: qué riesgos pesan más en el total. Es como
  se trabaja el riesgo en obra y en proyectos, y ningún complemento de
  simulación lo trae hecho de forma sencilla.
- **T9. Opciones de decisión** ✅ 29/09 (`RIESGO.DECISION`, `excel/decisiones.ts`; solo motor rápido, hasta 16 combinaciones) *(después de la etapa 2)*: una celda con varias opciones que **no** son
  aleatorias («proveedor A / B / C», «deuda al 60 / 70 / 80 %»): se simula
  el modelo con cada una y se comparan lado a lado. Es la versión de texto
  de H3 (simulaciones en serie).

### M. Libros tutoriales y manual — lo último, 6–9 d
Pedido por el usuario el 27/09. Diseño completo en `docs/LIBROS_TUTORIAL.md`.
Va **al final** porque enseña las funcionalidades de los demás bloques.
- **M1. Tres libros tutoriales**, de menos a más: «Feria de fin de semana»
  (un periodo, lo esencial), «Proyecto Aurora» (el libro de demostración
  ampliado: proyecto de inversión a cinco años) y «Parque solar Altamira»
  (varias hojas, 20 años, financiación, riesgos de evento, series: todo el
  potencial). Cada uno con hoja de lecciones, resultados esperados y una
  prueba automática que los comprueba. Absorbe la parte de libros de H9 y las
  plantillas de U1.
- **M2. Manual en HTML**: índice lateral, buscador, lectura de principio a fin
  con «anterior / siguiente», capturas, una página por distribución y por
  gráfico, los tres tutoriales paso a paso, preguntas frecuentes y glosario.
  Botón «Ayuda» en el panel que abre la sección de la pestaña. Absorbe el
  manual de H9 y de E9.

**Orden propuesto**: A → ~~E5, E6, C7, E7, E8, F4~~ ✅ 28/09 → ~~C8, C9, F5~~
✅ 28/09 → ~~T1–T6~~ ✅ 28/09 (salvo el manual, T5) → **ronda completa de
pruebas con la guía reescrita** ✅ 29/09 (todo OK salvo T2, arreglado; ver `ESTADO_Y_HANDOFF.md` punto 39) → B1–B3 → **B1b** → ~~U2, C10~~ ✅ 29/09 (ronda del 29/09) → ~~C1, C2, C5, I1, B4, D1, H2~~ ✅ 28/09 (adelantados: no tocan el manifiesto) → ~~B7, B6~~ ✅ 28/09 (SALIDA y CORRELACION el 29/09) (tampoco tocan el manifiesto; B6 pasa a leer del libro con B1) → ~~I2~~ ✅ 29/09 →
~~T7, T8, T9, C3, C4, B5, D2–D4, E1–E4, H6, H7, U1, H4, H5, H8~~ ✅ 29/09 → F según los libros, G, M, E, H, U1 → F según los
libros → G →
**M (libros tutoriales y manual)** → I3.
**Versión 2 (decidido con el usuario el 29/09)**: opciones de decisión (T9) y
búsqueda de objetivo (H4) con el **motor compatible**. Hoy solo van con el
rápido y el panel lo dice; los libros que lo necesiten se verán en la ronda.
**Pruebas en Excel (decidido el 28/09)**: no se prueba cada desarrollo por
separado. Se consolidan varios (etapa 1b y bloque T como mínimo), se
**reescribe la guía de pruebas desde cero** y el usuario la recorre entera
desde el principio. J3 (abrir el libro preparado sin el complemento, en el
iPad) queda para esa ronda.

La lista completa, numerada y con su origen, está en
`docs/INVENTARIO_FUNCIONALIDADES.md`. *(H1 ✅ 26/09.)*

---

## 2.2 Fuera del alcance: productos futuros

Decidido con el usuario el 25/09: **no entran en este complemento**, porque
cada uno es un producto entero con su propio motor y su propia interfaz.
Quedan registrados como candidatos a desarrollar después, reutilizando lo que
se pueda (el motor de simulación, el lector del libro, el canal de valores).

| Producto futuro | Qué haría | Referencia en el mercado | Qué se reutilizaría |
|---|---|---|---|
| **Optimización bajo incertidumbre** | Buscar los valores de las decisiones (celdas ajustables) que maximizan o minimizan una salida simulada, con restricciones («maximizar el VAN medio con P(VAN<0) < 10 %») | RISKOptimizer (@RISK), OptQuest (Crystal Ball) | El motor rápido completo: cada evaluación de la optimización es una simulación |
| **Árboles de decisión** | Modelar decisiones secuenciales con sucesos inciertos, valor esperado de cada rama y valor de la información | PrecisionTree (Palisade) | La interfaz en Excel, el panel, las distribuciones como nodos de azar |
| **Muestreo avanzado** | Cuasi Monte Carlo (Sobol, Halton) para converger con menos iteraciones; cópulas (t, Clayton, Gumbel) para dependencias de cola | Opciones avanzadas de @RISK | El diseño por contador del generador y el ejecutor por bloques |
| **Pruebas automáticas en Excel real** | Batería que abre Excel, carga el complemento y comprueba resultados sin intervención | Script Lab, Office Add-in test tooling | La guía de pruebas como especificación |

Mientras tanto, las pruebas en Excel real se hacen con guías manuales como
`docs/GUIA_PRUEBAS_EXCEL.md`.

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

**Estado (26/09):** hechas 12 funciones `RIESGO.*` sin runtime compartido, que
devuelven la media; el motor las reconoce como entradas. **«Preparar para
compartir» y su inverso «Restaurar funciones RIESGO» hechos** (Diagnóstico y
aviso en Modelo). Lo pendiente está en §2.1-B.

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
- ✅ **Web Worker en el navegador** (hecho el 24/09: `engine/executor/pool.ts`, `ui/motor/`). Texto original de la revisión: hoy el complemento simula con `crearEjecutorSecuencial` en el mismo hilo que el panel; el pool de workers solo existe en Node (`tests/helpers/poolNodeWorkers.ts`). La interfaz `EjecutorDeBloques` ya separa «calcular un bloque» de «quién lo reparte», así que es un ejecutor nuevo, no un rediseño. Va con E9a, porque el comportamiento de los workers dentro del panel de Office cambia entre Windows, Mac y Web.
- Suite `npm run bench` con resultados versionados.

**Criterio de hecho:** el escenario D11 (1M × 300 entradas × 100 salidas × 3.000 celdas) ejecutado, por debajo de 60 s y de 800 MB de pico. **Y el panel sigue respondiendo** (se puede cancelar y cambiar de pestaña) durante una simulación de 1M de iteraciones dentro de Excel. **Si no se alcanza, aquí es donde se decide sobre Rust→WASM**, con los números delante.

---

## E7 — Análisis y visualización · **v1.0**

**Entregable:** el producto que querías, completo.

> **Orden dentro de la etapa, desde el 2026-09-26 (§1.2):** primero el tornado, después
> el ajuste de distribuciones, y luego lo demás. Son las dos capacidades que el
> estudio de mercado identifica como imprescindibles en cualquier herramienta
> profesional, y hoy no existe ninguna de las dos.

1. ✅ **Tornado** con Spearman, regresión estandarizada y contribución a la varianza, **top 20 con acceso a la lista completa** (§3.4). Diagrama **spider** (salida frente a percentil de cada entrada) sobre el mismo reservorio.
2. ✅ **Ajuste de distribuciones a datos**, unificando las dos implementaciones heredadas, con MLE y PERT real. Ranking por **AIC y BIC**, y bondad de ajuste con **Kolmogorov–Smirnov** y **Anderson–Darling**. El ajuste elegido se guarda como una distribución normal del modelo.
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
