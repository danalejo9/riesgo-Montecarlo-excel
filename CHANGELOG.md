# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico. Las etapas (E0, E1, …) son las de `docs/FASE3_ROADMAP.md`.

## [No publicado]

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
