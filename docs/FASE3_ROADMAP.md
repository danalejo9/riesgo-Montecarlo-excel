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

---

**2.2 — ¿El modo compatible entra en el MVP?** *(decisión original, luego invertida — se
conserva por trazabilidad; ver §1.1)*
Decisión: **no; entra en la V1**. Y el motivo es una consecuencia de tu propia respuesta 3.2:

> Con Excel dentro del bucle, 1M de iteraciones son horas o días. Si tus corridas pueden ser de millones, **el modo compatible no puede darte lo que buscas en ningún caso** — solo sirve para modelos pequeños con miles de iteraciones. Meterlo en el MVP consumiría ~1 semana en algo que, en tu escenario real, casi nunca vas a usar.

Lo que sí entra en el MVP es el **informe de compatibilidad**: si un modelo no es soportado, sabrás exactamente qué celda y qué función lo impiden, y qué habría que cambiar. Lo que faltará hasta la V1 es el botón "simúlalo igualmente, despacio".

**Esta es la decisión más fácil de invertir de todo el roadmap.** Si prefieres tener red de seguridad desde el primer día, se mueve E8 delante de E5 y el MVP se retrasa alrededor de una semana. Dilo y lo cambio.

---

## 2. Vista general

> **Estado al 24/09/2026.** Actualizado con lo que de verdad está hecho y
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
| E4 | Funciones `RISK.*` + modo exploración F9 | 5–6 d | 🟡 12 funciones `RIESGO.*` hechas (muestran la media); faltan runtime compartido, modo determinístico/probabilístico y el resto de §2.1-B |
| E5 | Motor Niveles 1 y 2 | 10–12 d | 🟡 N1 43/44, N2 37/41 — Nivel 1 completo salvo `DESREF`; texto completo |
| E6 | Escala D11 y rendimiento | 6–8 d | 🟡 ejecutor por bloques, **pool de Web Workers** y núcleos configurables hechos; falta medir con libros grandes |
| E7 | Análisis y visualización | 8–10 d | 🟡 hecho: estadísticos, CDF, histograma, umbrales, tornado + contribución, araña, precisión, escenarios, ajuste a datos, informe PDF y volcado. Pendiente: §2.1-C |
| E9 | Mac, empaquetado y documentación | 4–5 d | ⬜ no empezada |
| E10 | Producto: hosting, i18n, licencia, privacidad | 8–12 d | ⬜ no empezada |
| E11 | Validación y publicación en AppSource | 5–8 d | ⬜ no empezada |

**Dónde estamos de verdad**: el ciclo completo funciona —marcar entradas y
salidas (o escribir `RIESGO.*`), distribuciones, correlaciones, simular por el
motor rápido (en varios hilos) o con Excel en el bucle, ver y guardar
resultados, comparar escenarios, informe PDF y volcado a hoja—. **Casi todo lo
de los días 23 y 24 está probado en el banco y en Node, no en el Excel del
usuario**: la guía `docs/GUIA_PRUEBAS_EXCEL.md` es el siguiente paso
obligatorio. Lo que queda está ordenado en §2.1.

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

Faltan de Nivel 2: `LAMBDA`, `DIVIDIRTEXTO` (solo tiene sentido derramando),
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

### B. Runtime compartido, modo del libro y funciones RIESGO (E4) — 6–8 d
- **B1. Runtime compartido** (`SharedRuntime`): panel, cinta y funciones en
  el mismo proceso. Es la base de B2 y B3, y la solución segura de A1-B4.
- **B2. Interruptor en la cinta «Determinístico / Probabilístico».**
  Determinístico: cada `RIESGO.*` muestra un valor fijo, a elegir en
  Configuración entre **media, moda, mediana o un percentil**. Probabilístico:
  muestra un valor aleatorio y F9 remuestrea (funciones volátiles). El modo
  del libro no cambia los resultados de la simulación, y se dice en la UI.
- **B3. Cinta que actúa sin abrir el panel**: «Marcar como entrada», «Marcar
  como salida», «Simular», «Quitar resaltado».
- **B4. Más funciones, las que el motor ya sabe muestrear**:
  `RIESGO.DISCRETA({valores};{pesos})`, truncado (`RIESGO.TRUNCAR` o argumento
  opcional de mínimo/máximo), `RIESGO.LOGNORMAL2` (parámetros del logaritmo).
- **B5. Distribuciones nuevas en el motor y como funciones**: t de Student,
  logística, log-logística, Pareto, geométrica, binomial negativa,
  hipergeométrica, uniforme entera, triangular por percentiles (Trigen),
  general/histograma (a partir de puntos). Cada una con sus pruebas de
  momentos y de Kolmogorov–Smirnov, como las actuales.
- **B6. Funciones que no son distribuciones**: `RIESGO.SALIDA()` (marcar una
  salida desde la fórmula); `RIESGO.MEDIA(celda)`, `RIESGO.PERCENTIL(celda;
  p)`, `RIESGO.PROB(celda; umbral)`, `RIESGO.DESV(celda)` para traer a la hoja
  los resultados de la última simulación; correlación declarada desde la
  fórmula (`RIESGO.CORRELACION`, a diseñar).
- **B7. Argumentos que son celdas**: `=RIESGO.NORMAL(B2;15)` cuando B2 no
  depende de ninguna entrada (se resuelve una vez); y, en una segunda fase,
  distribuciones cuyos parámetros dependen de otras entradas. Permitir la
  función dentro de una operación (`=1+RIESGO.NORMAL(…)`).

### C. Gráficas y exportación — 5–7 d
- **C1. Hoja «Resumen de entradas y salidas»** al volcar: por cada entrada,
  distribución, parámetros, **estadísticos de lo muestreado** (media,
  desviación, mínimo, p5, p50, p95, máximo) y su lugar en el tornado; por cada
  salida, los mismos estadísticos, el umbral y su probabilidad. Una tabla
  pensada para pegar en un informe.
- **C2. Gráficos nativos de Excel que faltan en el volcado**: tornado (barras
  horizontales), araña (líneas), y los de comparación de escenarios (curvas
  superpuestas). Hoy solo hay curva acumulada e histograma.
- **C3. Datos de la simulación**: exportar las iteraciones (entradas y
  salidas, hasta un tope) a una hoja, para que el usuario haga sus propios
  análisis o gráficos.
- **C4. Gráficas nuevas en el panel y el informe**:
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

### D. Análisis que faltan — 3–5 d
- **D1. Análisis de escenarios por cola** (el de @RISK): qué entradas están
  más desplazadas cuando la salida cae en su peor 10 % (o mejor 10 %). Dice
  *qué tiene que pasar* para que salga mal, que el tornado no dice.
- **D2. Análisis de estrés / qué pasa si determinista**: fijar una entrada
  en un percentil y ver el efecto en la salida sin simular el resto a mano.
- **D3. Salidas que son un rango** (C28:H28 como una sola salida con
  periodos), base del gráfico de abanico C4.

### E. Uso del panel — 2–4 d
- **E1. Vista de todas las entradas** en una tabla (nombre, celda,
  distribución, correlaciones), incluidas las `RIESGO.*` del libro, con
  edición rápida.
- **E2. Matriz de correlaciones** visible y editable como tabla.
- **E3. Deshacer** el último cambio del modelo.
- **E4. Ayuda contextual**: qué es cada distribución, cada gráfico y cada
  número, sin salir del panel.

### F. Motor y cobertura — según lo que pidan los libros
- **F1.** `DESREF` con desplazamientos constantes; `LAMBDA`.
- **F2.** Medir con libros grandes (el de 132 hojas) el tiempo de lectura y de
  simulación, y optimizar donde se vea.
- **F3.** Modo compatible más rápido (lotes de iteraciones por sincronización).

### G. Producto (E9–E11)
Mac, instalación sin `npm start`, manifiesto de producción, licencias,
interfaz en inglés, privacidad y AppSource: sin cambios respecto a lo
descrito abajo.

**Orden propuesto**: A → B1–B3 → C1, C2, C5 → B4, B6 → D1 → C3, C4 → resto.

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

**Estado (24/09):** hechas 12 funciones `RIESGO.*` sin runtime compartido,
que devuelven la media; el motor las reconoce como entradas. Lo pendiente
está en §2.1-B.

**Criterio de hecho:** `=RISK.NORMAL(1000;50)` escrita a mano en una celda de Excel **en Windows** devuelve 1000, el motor la reconoce como entrada, y al activar el modo exploración F9 la mueve. Verificado en Excel real, no en el validador.

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
- Suite `npm run bench` con resultados versionados.

**Criterio de hecho:** el escenario D11 (1M × 300 entradas × 100 salidas × 3.000 celdas) ejecutado, por debajo de 60 s y de 800 MB de pico. **Si no se alcanza, aquí es donde se decide sobre Rust→WASM**, con los números delante.

---

## E7 — Análisis y visualización · **v1.0**

**Entregable:** el producto que querías, completo.

- Histograma con bins configurables y densidad; CDF con cortes por percentil arrastrables.
- Tornado con Spearman, regresión estandarizada y contribución a la varianza, **top 20 con acceso a la lista completa** (§3.4).
- Comparación de escenarios.
- Probabilidad de superar umbrales.
- Ajuste de distribuciones a datos, unificando las dos implementaciones heredadas, con MLE y PERT real.
- Exportación a hojas nativas de Excel.

**Criterio de hecho:** un informe completo generado desde un libro real, y ningún cálculo estadístico ejecutándose dentro de un render de React.

---

## E8 — Modo compatible  *(absorbida en E3 por la decisión 15)*

**Entregable:** la red de seguridad. Ningún modelo se queda sin poder simularse.

- Excel en el bucle, pero con lotes adaptativos, `Recalculate` en lugar de `Full` cuando procede, cancelación y guardián transaccional.
- Estimación de tiempo **medida** con 200 iteraciones reales, no extrapolada a ojo.
- Aviso honesto cuando la combinación pedida no es razonable.

**Criterio de hecho:** un modelo con `SUBTOTALES` simulado a 10.000 iteraciones, cancelable, sin dejar rastro en el libro.

---

## E9 — Mac, empaquetado y documentación

- Prueba real en **Mac** (D1). Esto se valida antes, no aquí: una prueba de humo en Mac debe hacerse ya en E4, cuando se toca el manifiesto. E9 es la validación completa.
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

---

## 4. Qué necesito de ti, y cuándo

| Cuándo | Qué |
|---|---|
| Ahora | **Decidir el modelo de licencia** y qué se promete exactamente sobre la conexión a Internet (§E10). Condiciona la arquitectura, así que cuanto antes mejor |
| Antes de E10 | Cuenta de Partner Center, política de privacidad, condiciones de uso, canal de soporte, revisión de marca. Son tareas tuyas, no mías |
| Al cerrar E1 | Pasar el escáner por tus libros reales y revisar juntos el catálogo del §4.2 |
| Al cerrar E3 (MVP) | Probarlo con un modelo tuyo de verdad y decir qué falla |
| Al cerrar E4 | Confirmar que `RISK.*` funciona en tu Excel, y probarlo en un Mac si tienes acceso a uno |
