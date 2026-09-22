# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico. Las etapas (E0, E1, …) son las de `docs/FASE3_ROADMAP.md`.

## [No publicado]

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
