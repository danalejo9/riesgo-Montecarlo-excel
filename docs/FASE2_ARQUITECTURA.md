# FASE 2 — Propuesta de arquitectura

Fecha: 2026-09-15
Estado: **propuesta, pendiente de aprobación**. No se ha escrito código de producto todavía.
Documentos previos: [`FASE1_AUDITORIA_TECNICA.md`](FASE1_AUDITORIA_TECNICA.md) (diagnóstico), [`ESTADO_Y_HANDOFF.md`](ESTADO_Y_HANDOFF.md) (decisiones vivas).

---

## 0. Decisiones de partida (ya cerradas con el usuario)

| # | Decisión | Fecha |
|---|---|---|
| D1 | Plataforma: Office Add-in web. Windows **y Mac**. Descarta XLL/Excel-DNA | 2026-09-15 |
| D2 | Distribución: equipo personal, sideload. Sin catálogo de organización | 2026-09-15 |
| D3 | **Arquitectura híbrida confirmada**: motor rápido propio + detección automática de compatibilidad + modo compatible lento como respaldo | 2026-09-15 |
| D4 | **No se miden los modelos reales por ahora**. Se asume un catálogo de funciones típico de presupuestos (§4.2) y se ajusta el alcance más adelante con el escáner | 2026-09-15 |
| D5 | Nombres de funciones **en inglés**, espacio de nombres `RISK.` (`RISK.NORMAL`, `RISK.TRIANGULAR`, …) | 2026-09-15 |
| D6 | **Formato de configuración nuevo**, sin migración de los libros hechos con la versión heredada | 2026-09-15 |
| D7 | Git local + repositorio privado en GitHub (`danalejo9/riesgo-Montecarlo-excel`) | 2026-09-15 |
| D8 | Arquitectura del §1–§15 **aprobada**, incluidas las eliminaciones del §16.4 | 2026-09-15 |
| D9 | `RISK.*` declarativa por defecto, **pero con un "modo exploración" conmutable** en el que F9 vuelve a muestrear (§6.1) | 2026-09-15 |
| D10 | Muestreo: **Monte Carlo y Latin Hypercube, ambos disponibles y seleccionables** por el usuario | 2026-09-15 |
| D11 | **Escala real: cientos de entradas y salidas, e iteraciones que pueden llegar a millones.** No hay un tamaño "por defecto" | 2026-09-15 |

> **D11 es la restricción más dura de todo el proyecto.** Cientos de variables × millones de iteraciones hace inviable retener las muestras completas (300 salidas × 1M × 8 B = **2,4 GB**). Obliga a tres cambios de diseño frente al borrador inicial: bloques de tamaño **adaptativo** (§3.1), percentiles por **t-digest** como comportamiento normal y no como excepción (§3.3), y sensibilidad calculada sobre un **reservorio acotado** (§3.4). Ver §10 y §15.

> **Consecuencia de D4 — supuesto explícito que hay que vigilar.** El alcance del motor rápido se define en este documento sobre un catálogo *supuesto* de funciones de Excel, no medido. Si tus modelos reales usan funciones fuera del Nivel 1 (§4.2), no se rompe nada — caen al modo compatible — pero la promesa de velocidad no se cumpliría para esos modelos. Por eso el **escáner de compatibilidad es el primer entregable de la Fase 4** (§13): convierte el supuesto en dato antes de que cueste caro.

---

## 1. Objetivo de la arquitectura

Una frase: **sacar la evaluación del modelo fuera del ciclo de recálculo de Excel y hacerla vectorizada**, de forma que el coste por iteración pase de milisegundos a nanosegundos.

Requisitos que gobiernan todas las decisiones:

| R | Requisito | Verificación |
|---|---|---|
| R1 | 1.000.000 de iteraciones en tiempo interactivo | Benchmark: objetivo < 5 s en un modelo de 200 celdas, 20 entradas, 5 salidas |
| R2 | Cálculo 100 % local, sin red | Auditoría de dependencias en tiempo de ejecución; el panel debe abrir sin Internet salvo `office.js` |
| R3 | Windows y Mac | Un solo artefacto web; CI que valide el manifiesto para ambos |
| R4 | Fidelidad numérica con Excel | Batería de tests celda a celda contra un libro de referencia (§11.3) |
| R5 | Nunca corromper el libro del usuario | Cancelación real + restauración transaccional (§7.3) |
| R6 | Corrección estadística | Tests de bondad de ajuste sobre cada distribución (§11.2) |

---

## 2. Vista general

```
┌─────────────────────────────────────────────────────────────┐
│  EXCEL (libro del usuario)                                  │
│   · celdas con =RISK.NORMAL(...)  → declaran la entrada     │
│   · celdas de salida marcadas     → qué se quiere analizar  │
│   · workbook.settings["RiskModel"] → configuración          │
└───────────▲──────────────────────────────────┬──────────────┘
            │ Office.js (lectura en lote)      │ escritura de resultados
            │                                  ▼
┌───────────┴──────────────────────────────────────────────────┐
│  excel/   adaptadores Office.js                              │
│   · lector del grafo: fórmulas, precedentes, valores         │
│   · escritor de reportes (hojas nativas + gráficos)          │
│   · guardián transaccional (snapshot/restauración)           │
└───────────┬──────────────────────────────────────────────────┘
            │ ModelGraph (estructura pura, sin Office)
            ▼
┌──────────────────────────────────────────────────────────────┐
│  engine/  motor puro — cero dependencias de Office           │
│   1. parser de fórmulas Excel  → AST                         │
│   2. analizador de compatibilidad → Informe (soportado/no)   │
│   3. compilador  AST → plan de ejecución vectorizado         │
│   4. muestreadores (Float64Array, PRNG con streams)          │
│   5. ejecutor por bloques, repartido en Web Workers          │
│   6. estadísticas en streaming + muestra para percentiles    │
└───────────┬──────────────────────────────────────────────────┘
            │ SimulationResult (estadísticas, no 1M filas)
            ▼
┌──────────────────────────────────────────────────────────────┐
│  ui/  panel React                                            │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  functions/  bundle plano independiente (RISK.*)             │
│   runtime JavaScript-only de Excel. No comparte memoria.     │
└──────────────────────────────────────────────────────────────┘
```

Regla de oro del diseño: **`engine/` no importa nada de Office**. Se ejecuta y se testea en Node sin Excel. Esto es lo que hace posible tener tests de verdad, que el proyecto heredado no tenía.

---

## 3. El motor: por qué vectorizar y no "recalcular rápido"

La diferencia entre 3 horas y 1 segundo no está en el lenguaje ni en el paralelismo. Está en **el orden de los bucles**.

**Orden actual (fila a fila):** para cada una de las N iteraciones, recorrer las C celdas del modelo. Coste = N × (coste de recorrer el grafo + overhead de Excel). El overhead se paga N veces.

**Orden propuesto (columna a columna):** para cada una de las C celdas del modelo, calcular sus N valores de golpe sobre un `Float64Array`. Coste = C × (N operaciones aritméticas contiguas). El overhead de recorrer el grafo se paga **una sola vez**, y las N operaciones son un bucle plano sobre memoria contigua que el JIT vectoriza.

Ejemplo. Un modelo con `D5 = B5 * C5`:

```ts
// plan compilado, ejecutado una vez por celda
const d5 = buf(D5), b5 = buf(B5), c5 = buf(C5);
for (let i = 0; i < n; i++) d5[i] = b5[i] * c5[i];
```

Esto es lo que ninguna librería de fórmulas existente hace, y es la razón de la decisión de §12.1.

### 3.1 Ejecución por bloques de tamaño adaptativo (no 1M de golpe)

El motor no reserva `C × 1.000.000 × 8 bytes`. Procesa por bloques, y —por D11— **el tamaño de bloque no es fijo**: se calcula para que el conjunto de vivos quepa en un presupuesto de memoria por worker.

```
tamañoBloque = clamp( presupuestoBytesPorWorker / (buffersVivos × 8), 4096, 65536 )
```

Con 20 buffers vivos el bloque es de 65.536 muestras; con 300 entradas declaradas cae a ~6.500. El número de bloques sube, el coste por muestra no cambia: el bucle interno sigue siendo plano y contiguo.

- **Reutilización de buffers por análisis de vida**: una celda intermedia cuyo último consumidor ya se calculó devuelve su buffer al pool. El pico es proporcional al *ancho máximo del grafo*, no a su tamaño.
- Los bloques encajan en caché mejor que un array de 8 MB.
- Permite **progreso y cancelación reales** entre bloques (R5).
- Las estadísticas se acumulan bloque a bloque.

### 3.2 Paralelismo

`navigator.hardwareConcurrency − 1` Web Workers, cada uno con bloques distintos. Los buffers viajan como `Transferable` (coste cero). Escala casi lineal porque no hay estado compartido.

**PRNG:** contador determinista tipo **Philox/counter-based**, no Mulberry32 secuencial. Propiedad clave: la muestra i-ésima se calcula como `f(semilla, stream, i)`, sin depender de las anteriores. Esto da **reproducibilidad exacta independiente del número de núcleos** — la misma semilla da el mismo resultado en un equipo de 4 núcleos y en uno de 16. Con un PRNG secuencial repartido entre workers eso no se puede garantizar, y sin ello los tests de fidelidad dejan de ser fiables.

### 3.3 Estadísticas con memoria acotada (revisado por D11)

- **En streaming** (sin retener datos): media y varianza por Welford, mín/máx, momentos 3 y 4 (asimetría y curtosis), histograma sobre un rango fijado en una pasada previa corta. Coste: O(1) por salida, independiente de N.
- **Percentiles.** El borrador inicial retenía la muestra completa por salida (8 MB por salida a 1M). Con cientos de salidas eso son gigabytes: inviable. Regla definitiva:

  | Condición | Estrategia |
  |---|---|
  | `salidas × iteraciones × 8 B ≤ 100 MB` | Muestra completa retenida → **percentiles exactos** |
  | Por encima | **t-digest** por salida (~16 KB cada una, error < 0,1 % incluso en P1/P99) |

  El cambio es automático y **se muestra en la UI** — el usuario siempre sabe si un percentil es exacto o aproximado. 300 salidas por t-digest ocupan ~5 MB en total.
- **Nunca** se escriben millones de filas en Excel salvo petición explícita del usuario (regla §7 de las instrucciones maestras).

### 3.4 Sensibilidad con cientos de entradas (nuevo, por D11)

El tornado necesita correlacionar cada entrada con cada salida. Spearman exige **rangos**, y los rangos exigen la muestra ordenada: 300 entradas × 1M × 8 B = 2,4 GB. Inaceptable.

Solución: **reservorio acotado**. Se conserva una submuestra aleatoria uniforme de **20.000 iteraciones** de todas las entradas y salidas (300 × 20.000 × 8 ≈ 48 MB) y la sensibilidad se calcula sobre ella.

Esto no es una degradación oculta, es estadística básica: el error típico de un coeficiente de correlación con n = 20.000 es ≈ 0,007. Para *ordenar* qué variables mandan en el resultado —que es para lo que sirve un tornado— sobra. Los percentiles y las probabilidades, que sí requieren precisión en las colas, siguen usando las N iteraciones completas.

Consecuencia de UI: un tornado de 300 barras no se lee. Se muestran las **20 más influyentes** con acceso a la lista completa.

---

## 4. Análisis de compatibilidad (el corazón del híbrido)

### 4.1 Flujo al pulsar "Simular"

1. Leer en **una sola pasada** por hoja las fórmulas del rango usado (`getUsedRange().formulas`) — un `sync()`, no uno por celda.
2. Parsear cada fórmula a AST y construir el grafo de dependencias.
3. Recortar al **subgrafo relevante**: solo las celdas que están en algún camino entre una entrada y una salida. El resto del libro es irrelevante y no se evalúa (ganancia enorme en libros grandes).
4. Recorrer el subgrafo y clasificar cada nodo: soportado / no soportado / soportado con salvedades.
5. Detectar además: referencias circulares, volátiles (`ALEATORIO`, `HOY`, `INDIRECTO`), referencias a otros libros, matrices dinámicas, celdas con UDF de VBA.
6. Emitir el **Informe de compatibilidad**.

### 4.2 Catálogo de funciones del motor rápido (supuesto, D4)

**Nivel 0 — MVP, imprescindible:**
operadores `+ - * / ^ % & = <> < <= > >=`, referencias relativas/absolutas, rangos, `SUMA`, `PROMEDIO`, `MIN`, `MAX`, `CONTAR`, `CONTARA`, `SI`, `Y`, `O`, `NO`, `SI.ERROR`, `REDONDEAR`, `REDONDEAR.MAS`, `REDONDEAR.MENOS`, `TRUNCAR`, `ENTERO`, `ABS`, `RAIZ`, `POTENCIA`, `EXP`, `LN`, `LOG`, `SIGNO`, `SUMAPRODUCTO`.

**Nivel 1 — necesario para presupuestos reales:**
`BUSCARV`, `BUSCARX`, `INDICE`, `COINCIDIR`, `SUMAR.SI`, `SUMAR.SI.CONJUNTO`, `CONTAR.SI`, `CONTAR.SI.CONJUNTO`, `PROMEDIO.SI`, `ELEGIR`, `DESREF` (acotado), `MAX.SI.CONJUNTO`, `MIN.SI.CONJUNTO`, financieras (`VNA`, `TIR`, `PAGO`, `VA`, `VF`, `TASA`) y fechas (`FECHA`, `AÑO`, `MES`, `DIA`, `DIAS`, `FIN.MES`, `SIFECHA`).

Matiz decisivo: en un modelo de presupuesto, un `BUSCARV` casi siempre busca en una **tabla constante** (tarifas, precios unitarios). El compilador detecta que esa tabla no depende de ninguna entrada incierta, la evalúa **una vez** y la convierte en una estructura de consulta precompilada. El coste por iteración se desploma. Este *constant folding* del subgrafo invariante es lo que hace viable el Nivel 1.

**Nivel 2 — más adelante, o nunca:**
texto (`CONCATENAR`, `EXTRAE`, `SUSTITUIR`…), matrices dinámicas (`FILTRAR`, `UNICOS`, `ORDENAR`), `SUBTOTALES`, `AGREGAR`, tablas dinámicas, referencias externas, VBA, Power Query.

**No soportado por diseño:** `ALEATORIO`/`ALEATORIO.ENTRE` dentro del modelo (el motor es la única fuente de aleatoriedad; se avisa y se ofrece sustituirlo por `RISK.UNIFORM`), `INDIRECTO` con argumento variable, UDF de VBA.

### 4.3 El informe (lo que ve el usuario)

Ni un "no se puede" ni un porcentaje vago. Concretamente:

```
✅ Modelo compatible con el motor rápido
   187 celdas en el subgrafo · 12 entradas · 3 salidas
   1.000.000 iteraciones ≈ 2,4 s

⚠️  3 celdas impiden el motor rápido
   Presupuesto!H42   =SUBTOTALES(9;H5:H41)    función no soportada
   Presupuesto!J17   =INDIRECTO(...)          referencia dinámica
   Costes!C8         =MiMacroVBA(B8)          función definida por el usuario

   Opciones:
   [Simular en modo compatible]  100.000 iteraciones ≈ 22 min
   [Ver las celdas en el libro]
   [Ajustar el modelo]  ← SUBTOTALES(9;…) equivale a SUMA(…) si no hay filtros
```

El tiempo estimado no se inventa: se **mide** ejecutando 200 iteraciones reales del modo compatible y extrapolando.

---

## 5. Modo compatible (respaldo)

Es la arquitectura heredada, pero hecha bien:

- Entradas y salidas agrupadas en un **bloque contiguo** de una hoja temporal cuando la topología lo permite, para escribir y leer en lote.
- `calculate(Recalculate)` en vez de `Full` cuando el análisis demuestra que basta.
- Lotes de tamaño adaptativo según el tiempo medido, no fijos a 250.
- **Cancelable en cualquier momento**, con restauración garantizada (§7.3).
- Sin tope artificial de iteraciones: se avisa del tiempo estimado y decide el usuario.

No se le pedirá que alcance 1M. Su función es que **ningún modelo se quede sin poder simularse**.

---

## 6. Funciones personalizadas `RISK.*`

Reconstrucción completa siguiendo la plantilla oficial, corrigiendo C1–C7 de la auditoría:

- `<Requirements>` con `CustomFunctionsRuntime 1.1` en la raíz del manifiesto.
- `ExtensionPoint CustomFunctions` dentro de **`<AllFormFactors>`**.
- **Build propio** para `functions/`: bundle plano IIFE (sin `type="module"`, sin `Office.onReady`, sin `window`), con `CustomFunctions.associate` en el nivel superior.
- `functions.json` **generado** desde JSDoc `@customfunction` con `custom-functions-metadata`. Nunca a mano, y un solo archivo: se acaban las versiones divergentes.
- El panel **no** carga `functions.js` (se elimina la etiqueta de `index.html` que provoca el `ReferenceError` en cada apertura).

**Semántica (cambio conceptual respecto al heredado):** `=RISK.NORMAL(1000; 50)` en una celda **declara** una entrada incierta y devuelve su **valor determinista** (la media, o un valor base configurable). No es volátil y no muestrea. El libro queda legible, auditable y estable; el motor lee la declaración y muestrea fuera. Es lo que permite que un modelo con `RISK.*` siga siendo un modelo de Excel normal cuando nadie está simulando.

### 6.1 Modo exploración con F9 (D9)

El usuario quiere poder pulsar **F9 y ver el modelo moverse**. Es una petición razonable: da intuición sobre el comportamiento del modelo antes de simular.

Implementación: **todas las funciones `RISK.*` se declaran `volatile` en los metadatos** (la volatilidad no se puede activar y desactivar en caliente; es una propiedad estática de la función). El comportamiento se decide **dentro** de la función leyendo un indicador de modo en `OfficeRuntime.storage`:

| Modo | Qué devuelve `=RISK.NORMAL(1000;50)` | Uso |
|---|---|---|
| **Declarativo** (por defecto) | Siempre 1000 (valor base). Excel recalcula, pero el número no cambia | Trabajo normal: modelo estable y auditable |
| **Exploración** | Una muestra nueva en cada recálculo. F9 mueve todo el libro | Entender el modelo, demostrarlo a otros |

Se conmuta con un botón en la cinta, con indicador visible de que el modo está activo.

**Tres advertencias que la UI debe dar, no ocultar:**

1. El modo exploración **no es una simulación**. Es una sola iteración visible. Las conclusiones se sacan de la simulación, no de pulsar F9 veinte veces.
2. Las **correlaciones entre entradas no se respetan** en este modo: cada celda se muestrea por su cuenta. En un modelo donde acero y cemento van correlacionados, F9 puede mostrar combinaciones que la simulación nunca generaría.
3. Con las funciones volátiles, **cada edición del libro recalcula todas las celdas `RISK.*`**. En un libro grande se nota. Por eso el modo declarativo devuelve un valor fijo: el coste de recálculo existe igual, pero el modelo no se desestabiliza. Si el libro es muy pesado, salir del modo exploración es lo correcto.

Nombres (D5): `RISK.NORMAL`, `RISK.LOGNORMAL`, `RISK.UNIFORM`, `RISK.TRIANGULAR`, `RISK.PERT`, `RISK.BETA`, `RISK.GAMMA`, `RISK.WEIBULL`, `RISK.EXPONENTIAL`, `RISK.BERNOULLI`, `RISK.BINOMIAL`, `RISK.POISSON`, `RISK.DISCRETE`, `RISK.EMPIRICAL`, más `RISK.OUTPUT` para marcar salidas.

---

## 7. Integración con Excel

### 7.1 Runtime compartido

Se declara `<Runtimes>` con `SharedRuntime` para el panel y los comandos de cinta. Elimina los stubs globales y los `setTimeout(100)` del mecanismo de eventos heredado, que pueden perder clics. Las funciones personalizadas siguen en su runtime aparte (Windows lo exige) y se comunican, si hace falta, vía `OfficeRuntime.storage`.

### 7.2 Persistencia — formato nuevo `RiskModel v1` (D6)

```jsonc
{
  "schema": 1,
  "inputs":  [{ "id": "in_7f3a", "name": "Precio acero", "ref": "RM_in_7f3a",
                "dist": { "type": "pert", "min": 800, "mode": 950, "max": 1400 },
                "correlations": [] }],
  "outputs": [{ "id": "out_21b", "name": "Coste total", "ref": "RM_out_21b" }],
  "settings": { "iterations": 100000, "seed": 20260915, "sampling": "lhs", "engine": "auto" }
}
```

Cada variable conserva su **rango con nombre** (`RM_in_…`), que es lo que sobrevive a insertar o mover filas. El JSON se guarda en `workbook.settings` y, si supera el límite práctico, se parte en fragmentos numerados. Los `id` son aleatorios cortos, no marcas de tiempo (el heredado generaba nombres inconsistentes).

### 7.3 Guardián transaccional (R5)

Antes de cualquier simulación se guarda el modo de cálculo y los valores originales de las entradas en `workbook.settings["RiskModel.recovery"]`, **persistido en el libro**. Al terminar se borra. Si el panel se cierra a mitad o el runtime muere, al reabrir el complemento detecta el registro de recuperación y ofrece restaurar. El `finally` del código heredado no cubre ese caso; esto sí.

---

## 8. Distribuciones y muestreo

**Corrección de los errores matemáticos de §4.3 de la auditoría:**

- **PERT real**: Beta(α, β) reescalada, con α = 1 + λ(m−a)/(b−a), β = 1 + λ(b−m)/(b−a), λ = 4 configurable (PERT modificada). Sustituye al `(triangular + media + moda)/3` heredado, que reducía la varianza a ~1/9.
- **Lognormal**: dos parametrizaciones explícitas en la UI — media y desviación **de la variable** (lo natural) o **del logaritmo** — con conversión interna. Se acaba el `exp(1000) = Infinity`.
- **Poisson**: inversión por tabla para λ pequeño, PTRS o aproximación normal con corrección para λ grande. O(1), sin bucles que puedan colgarse.
- **Binomial**: BTRS en lugar de n ensayos de Bernoulli. O(1).
- **Triangular**: validación `min ≤ moda ≤ max` en la UI y en la función.
- Percentiles y `erf`: **una sola implementación** en `engine/`, usada por todos (había tres y dos respectivamente).

**Añadidas:** Beta, Gamma, Weibull, Exponencial, Empírica continua, Discreta, y **truncamiento** genérico aplicable a cualquier distribución.

**Muestreo (D10 — ambos métodos disponibles y seleccionables):**

- **Monte Carlo simple**: el estándar, sin supuestos. Necesario para comparar contra @RISK o contra resultados previos, y el único correcto si alguna vez se quiere un error estadístico limpiamente estimable.
- **Latin Hypercube**: misma precisión con del orden de 1/10 de las iteraciones en modelos suaves. Se estratifica por bloque.
- **Selector explícito en la UI**, guardado en el modelo (`settings.sampling`), con LHS preseleccionado por ser el que más rinde a igualdad de iteraciones. Los resultados indican siempre con qué método se generaron: un histograma de LHS y uno de MC no son comparables sin saberlo.
- **Correlación entre entradas** por Iman–Conover (correlación de rangos, preserva las marginales). Carencia real del heredado: en un presupuesto, el precio del acero y el del cemento no son independientes, y tratarlos como tales infraestima la cola.

  Ajuste por D11: Iman–Conover necesita ordenar las muestras, así que se aplica **por bloque y solo a los grupos de entradas efectivamente correlacionadas** que el usuario haya declarado — típicamente unas pocas, no las trescientas. Aplicarlo a la matriz completa de cientos de variables × millones de filas sería inviable en memoria, y además innecesario: las entradas sin correlación declarada son independientes por definición.

---

## 9. Análisis y visualización

- Histograma con nº de bins configurable y curva de densidad (KDE).
- CDF ascendente/descendente con cortes por percentil arrastrables.
- **Tornado** con tres métricas seleccionables: correlación de **Spearman** (rangos — la correcta por defecto; el heredado solo tenía Pearson lineal), coeficientes de regresión estandarizados, y contribución a la varianza.
- Comparación de escenarios superpuestos.
- Tabla de estadísticos: media, mediana, moda, desviación, asimetría, curtosis, P1–P99, probabilidad de superar un umbral.

**Tecnología de gráficos:** SVG propio sobre datos **ya agregados por el motor** (nunca 1M de puntos en el DOM), con memoización; el cálculo estadístico sale del render (el heredado reordenaba el array entero en cada movimiento de un slider). Se descarta `recharts` en el panel principal por peso de bundle.
Se elimina Google Fonts (R2). Se sustituye `jspdf` + `html2canvas` (≈350 KB) por la exportación a hojas nativas de Excel, que ya funciona bien y encaja mejor en el flujo; el PDF queda como opcional a decidir en Fase 3.

---

## 10. Rendimiento: presupuesto objetivo

Metas que la Fase 4 debe **medir**, no estimar (regla del usuario):

| Escenario | Objetivo |
|---|---|
| 1M iter · 20 entradas · 5 salidas · modelo de 200 celdas aritméticas | < 5 s |
| 1M iter · mismo modelo con 3 `BUSCARV` sobre tabla constante | < 8 s |
| 100k iter · modelo de 2.000 celdas | < 3 s |
| **1M iter · 300 entradas · 100 salidas · modelo de 3.000 celdas** (escenario D11) | < 60 s |
| Análisis de compatibilidad de un libro de 50.000 fórmulas | < 2 s |
| Memoria pico, en cualquier escenario | < 800 MB |

El escenario D11 es el que manda. Es también el que decide si hace falta Rust→WASM: si con TypeScript se queda en el entorno del minuto, es aceptable para una corrida de 300 variables; si se va a cinco minutos, se reabre §12.4.

Si tras optimizar el TypeScript se incumple R1, entonces —y solo entonces— se evalúa **Rust→WASM** para el ejecutor. La decisión será por benchmark, no por preferencia.

---

## 11. Estrategia de pruebas

El proyecto heredado tiene **0 tests**. Esto no se repite. Vitest, con CI en GitHub Actions.

### 11.1 Unitarias

Parser (rangos mixtos, `$`, nombres definidos, intersecciones, argumentos omitidos), compilador, y cada función de Excel implementada contra casos tabulados.

### 11.2 Estadísticas

Para cada distribución: Kolmogorov–Smirnov contra su CDF teórica con semilla fija, y comprobación de momentos (media, varianza, asimetría) con tolerancia. Incluye un test específico de varianza del PERT — exactamente el que habría detectado el error del código heredado.

### 11.3 Fidelidad contra Excel (R4 — obligatoria)

Un libro de referencia `tests/fixtures/fidelidad.xlsx` con cientos de fórmulas que cubren el catálogo del §4.2 y sus casos límite (división por cero, celdas vacías, texto donde se espera número, fechas, precisión). Un script exporta los valores que produce Excel; el test compara el motor celda a celda con tolerancia relativa `1e-9`. **Ninguna función entra en el catálogo de soportadas sin su fila en ese libro.** Es lo único que impide que el motor sea rápido y silenciosamente incorrecto — el peor resultado posible para una herramienta de riesgo.

### 11.4 Benchmarks

Suite ejecutable (`npm run bench`) con los escenarios del §10 y resultados versionados, para detectar regresiones de rendimiento.

### 11.5 Manuales en Excel

Lista de comprobación para lo que no se puede automatizar: registro de `RISK.*` en Windows y en Mac, cinta, diálogos, y recuperación tras cierre forzado.

---

## 12. Alternativas consideradas y descartadas

### 12.1 Usar HyperFormula / formula.js en vez de un evaluador propio

**Descartado.** HyperFormula es un motor de hoja de cálculo **escalar**: evalúa una celda a un valor. Simular 1M de iteraciones significaría 1M de recálculos completos — el mismo error arquitectónico del código heredado, solo que con mejor constante. No es vectorizable sin reescribir su núcleo. Añadido: es GPLv3 salvo licencia comercial, lo que condicionaría el proyecto de forma permanente. `formula.js` es una colección de funciones escalares sin grafo ni resolución de referencias; sirve como **referencia de comportamiento** al implementar funciones, no como motor.

El coste del parser propio es real (estimación: 2–3 semanas para Nivel 0 + Nivel 1), pero es el único camino que cumple R1.

### 12.2 XLL nativo (Excel-DNA / C++)

**Descartado por D1** (solo Windows). Además sigue siendo O(N × coste de recálculo): es lo que hace @RISK, y por eso @RISK también tarda con 1M de iteraciones.

### 12.3 Python/NumPy o GPU como motor

**Descartado.** Exigen instalar un runtime aparte, lo que rompe la distribución por sideload de D2 y la portabilidad a Mac de D1. Podrían reaparecer como motor externo opcional, nunca como base.

### 12.4 Rust→WASM desde el principio

**Aplazado, no descartado.** Complica el build y el desarrollo en Mac. El benchmark B de la auditoría (0,56 s para 1M de muestras en JS puro) sugiere que TypeScript sobre `Float64Array` basta. Se decide con datos en la Fase 4.

### 12.5 Parchear el código heredado en vez de estructura nueva

**Descartado en Fase 1** (decisión C). Lo que hay que reemplazar —motor, funciones, gráficos— es el 100 % de lo que determina rendimiento y corrección.

---

## 13. Estructura del proyecto

```
engine/                 motor puro (sin Office, testeable en Node)
  parser/               tokenizador, AST, referencias, nombres definidos
  compiler/             grafo, subgrafo, constant folding, plan, vida de buffers
  functions/            implementaciones vectorizadas de funciones de Excel
  random/               PRNG counter-based, streams, LHS, Iman-Conover
  distributions/        muestreadores + PDF/CDF/inversas
  stats/                Welford, percentiles, histograma, sensibilidad
  runtime/              ejecutor por bloques, pool de Web Workers
excel/                  adaptadores Office.js (lector de grafo, escritor, guardián)
functions/              custom functions RISK.* (build propio, bundle plano)
ui/                     panel React
scanner/                escáner de compatibilidad (primer entregable, D4)
tests/                  unit · estadísticos · fidelidad · benchmarks
  fixtures/             libro de referencia de fidelidad
docs/                   esta documentación
```

---

## 14. Control de versiones (D7 — ya ejecutado)

- `git init` hecho. Commit inicial **"Estado heredado"** con el código tal cual, etiquetado **`v0.0.0-heredado`** como evidencia de la auditoría.
- Ramas: `main` solo para versiones etiquetadas (SemVer), `develop` para el trabajo diario, ramas por funcionalidad.
- `.claude/` añadido a `.gitignore`.
- Pendiente: crear el repositorio **privado** en GitHub (`riesgo-montecarlo-excel`) y conectar el remoto. `gh` no está instalado; lo más rápido es crearlo vacío desde la web.
- `CHANGELOG.md` y CI (build + lint + tests) en la Fase 4.

---

## 15. Riesgos abiertos de esta arquitectura

| Riesgo | Mitigación |
|---|---|
| **El catálogo supuesto (D4) no cubre los modelos reales** | El escáner es el primer entregable; el modo compatible garantiza que nada quede sin simular |
| El parser propio es el componente más costoso y el que más puede desviar el plazo | Alcance por niveles; el Nivel 0 ya da producto útil; tests de fidelidad desde el primer día |
| Divergencia numérica silenciosa con Excel | §11.3 es bloqueante: sin fila en el libro de fidelidad, la función no se declara soportada |
| **Memoria en WebView2 con cientos de variables (D11)** | Bloque adaptativo (§3.1) + reutilización de buffers + t-digest (§3.3) + reservorio para sensibilidad (§3.4). Es el riesgo que más condiciona el diseño |
| Que el escenario D11 no alcance tiempos aceptables ni optimizado | Se reabre Rust→WASM (§12.4); el motor está aislado en `engine/`, así que es sustituible sin tocar UI ni Excel |
| Que el usuario saque conclusiones del modo exploración F9 en vez de la simulación | La UI advierte explícitamente, e indica que las correlaciones no se aplican en ese modo (§6.1) |
| Registro "pegajoso" de funciones personalizadas durante el desarrollo | Script de limpieza de la caché `Wef` + ids estables documentados |
| Distribución a Mac (sideload por carpeta compartida) | Se valida pronto, no al final: prueba real en Mac antes de cerrar el MVP |

---

## 16. Aprobación — CONCEDIDA (2026-09-15)

1. ✅ La arquitectura de este documento en conjunto.
2. ✅ El catálogo por niveles del §4.2 como alcance del motor rápido.
3. ✅ La semántica declarativa de `RISK.*` del §6, **con la adición del modo exploración F9** (§6.1, D9).
4. ✅ Eliminar del producto: Google Fonts, `jspdf`/`html2canvas`, `recharts` en el panel principal, el "modo estocástico/determinístico" muerto y el tope de 50.000 iteraciones.
5. ✅ Repositorio remoto conectado.

Revisión posterior a la aprobación: D9, D10 y **D11** obligaron a revisar §3.1, §3.3, §3.4, §6.1, §8, §10 y §15. La arquitectura no cambia de forma; cambia el dimensionamiento.

Continúa en [`FASE3_ROADMAP.md`](FASE3_ROADMAP.md).
