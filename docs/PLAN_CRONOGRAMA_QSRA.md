# Riesgo de cronograma (QSRA): diagnóstico, decisión y plan de trabajo

**Fecha:** 2026-09-30
**Estado:** aprobado por el usuario. Decisiones 19–23 en [`ESTADO_Y_HANDOFF.md`](ESTADO_Y_HANDOFF.md) §3.
**Documentos hermanos:** [`FASE3_ROADMAP.md`](FASE3_ROADMAP.md) (bloque P), [`INVENTARIO_FUNCIONALIDADES.md`](INVENTARIO_FUNCIONALIDADES.md), [`GUIA_PRUEBAS_EXCEL.md`](GUIA_PRUEBAS_EXCEL.md) (bloque N).

Tres estudios del usuario revisaron las herramientas de análisis cuantitativo de riesgo de cronograma (QSRA): cómo funcionan, qué opinan los usuarios y qué oportunidades quedan. Los tres llegan al mismo diagnóstico. Los tres proponen además un producto gratuito o de código abierto, y **eso se descarta**. El producto será de pago, a precio bajo, pensado para pymes.

Este documento recoge el diagnóstico, la decisión tomada, la arquitectura del módulo y el **plan de trabajo unificado**. Ese plan no deja fuera las pruebas pendientes del bloque N.

---

## 1. Diagnóstico del mercado

### 1.1 Cómo está repartida la oferta

| Segmento | Herramientas | Precio orientativo (3 años, por puesto) | Problema principal |
|---|---|---|---|
| Especializadas de gama alta | Safran Risk, Deltek Acumen Risk (+ Fuse), Booz Allen Polaris | 10.000–16.500 USD | Precio. Orientadas a gran empresa y gobierno |
| Referencia abandonada | Oracle Primavera Risk Analysis (Pertmaster) | ~10.800 USD | Sin desarrollo desde 2013. Es de 32 bits y lenta por encima de ~10.000 actividades. Se sigue enseñando |
| Gama media y económica | RiskyProject, Full Monte, Tamara | 1.200–7.700 USD | Interfaces anticuadas. Full Monte solo funciona dentro de MS Project. Tamara no deja editar la lógica |
| Monte Carlo genérico en Excel | @RISK (+ ScheduleRiskAnalysis), Crystal Ball, ModelRisk | 2.200–16.500 USD | El CPM se reconstruye con fórmulas en la cuadrícula, lo que es lento y frágil. Solo Windows |
| **Competidor más cercano** | **Epoch SRA**: panel de tareas en Excel, lee el XML de MS Project, chequeo DCMA | ~990 € al año | No lee P6, no está en español y no tiene un modelo de costos integrado |

### 1.2 Lo que falla en las herramientas actuales y cómo lo resolvemos

| Queja recurrente (los tres estudios) | Nuestra respuesta |
|---|---|
| Precio alto, renovaciones automáticas, ventas opacas | Precio público y bajo (el modelo exacto sigue pendiente, §5) |
| Lentitud cuando la red CPM se calcula en la cuadrícula de Excel | El motor propio ya calcula **fuera** de la cuadrícula, vectorizado y en Web Workers |
| «Basura entra, basura sale»: nadie avisa si el cronograma está mal construido | Chequeo de salud (DCMA‑14) con semáforo que bloquea o avisa **antes** de simular |
| Correlaciones que nadie sabe estimar. Partir tareas da falsa certeza (ley de los grandes números) | *Risk drivers* (AACE 57R‑09): la correlación sale de la causa común, sin coeficientes |
| No se explica por qué el P80 cae después del camino crítico (*merge bias*) | Explicación visual de las convergencias y tornado **en días** |
| No hay visor: quien recibe el modelo necesita licencia | «Preparar para compartir» (ya hecho: el libro funciona sin el complemento) e informe PDF |
| Interfaces complejas, solo en inglés y solo en Windows | Panel moderno en español, un solo código para Windows, Mac y Web |
| Las herramientas baratas no tienen análisis conjunto de costo y plazo (JCL) | JCL integrado con el motor de costos que ya existe |
| A los directivos les cuesta entender P50 y P80 | Resumen ejecutivo en español generado por reglas locales, sin IA externa |

### 1.3 Fortalezas de la competencia que conviene copiar

- **Acumen:** revisa la calidad del cronograma antes de simular y detecta los puntos de convergencia.
- **Safran:** *risk drivers* nativos, velocidad y calendarios de clima probabilísticos.
- **Primavera Risk Analysis:** fidelidad al CPM de P6 y plantillas de informe.
- **RiskyProject:** registro de riesgos y simulación en la misma herramienta.
- **Full Monte:** no hay que exportar nada, es rápido y trae un «inspector de cronograma».
- **Epoch:** precio transparente, semilla reproducible y panel dentro de Excel.
- **@RISK:** une costo y plazo en la hoja.

### 1.4 Lo que ya tenemos (y sirve para el plazo)

| Pieza | Dónde |
|---|---|
| Complemento Office.js (Windows, Mac y Web) con React | `manifest.xml`, `ui/` |
| Motor vectorizado por bloques y en Web Workers | `engine/executor/`, `ui/motor/poolNavegador.ts` |
| Philox con semilla (reproducible sin importar cuántos núcleos haya) | `engine/random/philox.ts` |
| LHS e Iman‑Conover | `engine/sampling/` |
| PERT, Trigen, Triangular, Lognormal… | `engine/distributions/` |
| t‑digest, percentiles, convergencia, tornado | `engine/stats/` |
| Registro de riesgos (`RIESGO.EVENTO`) | `excel/registroRiesgos.ts` |
| Fechas y días laborables | `engine/modelo/fechas.ts`, `engine/functions/calendario.ts` |
| Orden topológico | `engine/graph/toposort.ts` |
| Dispersión (C4), informe PDF, volcado, compartir, guardián | `ui/Graficos.tsx`, `excel/informeImprimible.ts`, `excel/volcarResultados.ts`, `excel/compartir.ts`, `engine/modelo/guardian.ts` |
| Migración del modelo guardado (H8) | `engine/modelo/` |

**Falta:**
- El modelo de red de actividades y el solver CPM.
- Calendarios laborables por actividad.
- Importadores de cronogramas.
- Chequeo de salud.
- Asignación de riesgos a actividades.
- Salidas propias del plazo: índice de criticidad y Gantt probabilístico.

---

## 2. Decisión: un solo producto con un módulo «Cronograma»

**Se amplía el complemento actual.** No se crea otro complemento ni otro programa. El producto pasa a ser una plataforma de riesgo de proyecto (costo + plazo).

Por qué:

1. **El diferenciador más fuerte, el JCL, solo existe si costo y plazo están en el mismo motor.** La duración simulada entra como columna en el modelo de costos (costos indirectos = duración × tasa) dentro de la misma iteración. Con dos productos, eso se pierde.
2. Entre el 60 % y el 70 % de lo que necesita un QSRA ya existe y está probado (§1.4).
3. Un solo producto significa una sola licencia, un solo hosting, una sola validación en AppSource y un solo soporte.
4. Un programa de escritorio aparte (Excel‑DNA/.NET, como sugiere el estudio 1) rompe el requisito de Mac y Web, que es la decisión 1. Una aplicación web aparte pierde Excel, que es donde ya trabajan las pymes.

**Descartado:**
- Gratis o código abierto (decisión del usuario). La credibilidad se gana publicando la metodología y los casos de validación.
- Convertirnos en programador de proyectos: no hay edición de Gantt, solo ediciones ligeras en la tabla.
- Nube propia o colaboración en tiempo real: se usa la coautoría de Excel.
- IA externa.
- Leer el `.mpp` binario: no se puede desde un complemento web; se pide «Guardar como XML».
- Event Chain Methodology.
- *Reference Class Forecasting* con datos de SECOP.
- Rust/WASM, salvo que un benchmark lo exija, igual que para costos.

---

## 3. Arquitectura del módulo

Principio: **la hoja es entrada y reporte, nunca la calculadora de la red.**

### 3.1 `engine/cronograma/` (nuevo, puro, sin Office)

| Archivo | Qué hace |
|---|---|
| `modelo.ts` | Tipos de actividad, relación (FS, SS, FF, SF con retardo), calendario y restricción |
| `predecesoras.ts` | Parser de la sintaxis de MS Project: `3FS+2d;5SS` |
| `calendario.ts` | Días laborables y excepciones. Tablas índice laborable ↔ fecha para convertir en O(1) |
| `cpm.ts` | Orden topológico y ciclos, pasadas hacia adelante y hacia atrás, holguras, restricciones y avance (fecha de corte, duración remanente) |
| `cpmVectorizado.ts` | La pasada hacia adelante sobre `Float64Array` por bloques de N iteraciones. Guarda el predecesor que manda para sacar el índice de criticidad sin repetir la pasada hacia atrás |
| `salud.ts` | Chequeo tipo DCMA‑14: lógica faltante, extremos abiertos, retardos negativos, retardos, relaciones SF, restricciones duras, holgura alta o negativa, duraciones largas, tareas manuales, ciclos y puntos de convergencia. Cada regla es roja (bloquea) o amarilla (avisa) |
| `drivers.ts` | *Risk drivers* (AACE 57R‑09): probabilidad, factor multiplicativo con distribución y actividades afectadas. Incertidumbre de 3 puntos asignable en bloque por categoría o EDT, con Trigen P10/P90 |
| `importar/mspdi.ts` | XML de MS Project, con `DOMParser` |
| `importar/xer.ts` | XER de Primavera P6: texto separado por tabuladores |
| `verificacion.ts` | Compara el CPM determinista con las fechas del archivo de origen y lista las diferencias |

Los importadores se escriben en TypeScript porque MPXJ es Java o .NET y no corre en Office.js.

### 3.2 `excel/`

- Hoja **«Actividades»**, la representación canónica del cronograma: ID, nombre, duración, predecesoras, calendario, mínimo, más probable, máximo, categoría y costo por día. Los importadores escriben en ella.
- Hoja **«Riesgos de plazo»**: matriz de riesgos por actividades.
- Lector de las dos hojas.
- Escritura del Gantt probabilístico (bandas P10–P90) y de los resultados.

El cronograma vive en hojas y no en `workbook.settings`, que tiene un tamaño limitado. Además, así se comparte y se abre sin el complemento.

### 3.3 Integración con costos (JCL)

- Los hitos del cronograma se exponen como columnas de entrada del grafo de costos, con `RIESGO.CRONOGRAMA("Hito")` o con un nombre definido.
- El costo que depende del tiempo se calcula en la misma iteración que el plazo.
- La dispersión costo‑fecha (C4) y la curva JCL salen de ahí.

### 3.4 Salidas

- Histograma y curva S por hito, con P50, P80 y P90.
- Índice de criticidad.
- Tornado en días por *driver*.
- Priorización GAO: «quitar un riesgo y volver a simular».
- Explicación del *merge bias*.
- Gantt probabilístico.
- Informe PDF.
- Resumen ejecutivo en español.

### 3.5 Rendimiento

Objetivo: **5.000 actividades × 10.000 iteraciones en menos de 10 s en Excel Web o Mac.** Benchmark en `bench/`.

---

## 4. Plan de trabajo unificado (tres pistas en paralelo)

Decisión 20: se trabaja **en paralelo**. La v1 de costos se publica cuando esté lista, sin esperar al cronograma.

**Regla de prioridad:** si algo falla en las pruebas en Excel (pista A), se arregla **antes** de seguir con el cronograma (pista C). El cronograma nunca aparta las pruebas pendientes.

### Pista A — Pruebas pendientes en Excel (bloque N de la guía) · la hace el usuario

Detalle y pasos en [`GUIA_PRUEBAS_EXCEL.md`](GUIA_PRUEBAS_EXCEL.md), «Ronda del 29/09».

| Estado | Pruebas |
|---|---|
| ✅ Hechas (29/09) | N1, N2, N3, N6 |
| 🔁 Repetir (arreglada) | **N4** Modo compatible más rápido (`ItemNotFound` corregido) |
| ⬜ Pendientes | **N5** Todo lo demás sigue igual |
| ⬜ | **N7** Modo aleatorio (medir lo que tarda F9) · **N8** La cinta actúa sin abrir el panel · **N9** RIESGO dentro de operaciones con Excel en el bucle |
| ⬜ | **N10** Marcas y delimitadores · **N11** Resultados más fáciles de leer · **N12** Salida y correlación desde la fórmula · **N13** Ajuste orientado al riesgo |
| ⬜ | **N14** Fechas · **N15** Registro de riesgos · **N16** Opciones de decisión · **N17** Iteraciones a una hoja · **N18** Gráficas nuevas · **N19** Distribuciones nuevas |
| ⬜ | **N20** Cambio en la salida · **N21** Estrés · **N22** Serie de salidas · **N23** Deshacer · **N24** Matriz de correlaciones · **N25** Ayuda |
| ⬜ | **N26** Avisos de coherencia y trazado · **N27** Asistente y plantillas · **N28** Buscar objetivo · **N29** DESREF |
| ⬜ Con libros propios | **N30** Tu libro grande: cuánto tarda · **N31** Qué funciones usan tus libros (`npm run scan`) · **N33** LAMBDA: Peng‑Robinson |
| ⬜ | **N32** Binomial negativa, umbral de RIESGO.SALIDA y fechas en la tabla |
| ⬜ Cinta nueva (reiniciar `npm start`) | **N34** Cinta nueva · **N35** Explorador · **N36** Ajustar desde la cinta · **N37** Catálogo · **N38** Entradas y salidas · **N39** Clic derecho y Detener |
| ⬜ Excel para la Web | **W6** Texto en «Zonas» · **W7** Resultados en la hoja en la Web |
| ⬜ Mac (E9a) | Prueba de humo en un Mac, si hay acceso a uno |

Con los resultados: arreglar lo que falle, luego **F2** (rendimiento, con el dato de N30) y las funciones que salgan en N31.

Las pruebas en Excel del módulo de cronograma se añadirán a la guía como bloque **Q**, al cerrar cada etapa P.

### Pista B — Producto y publicación (E9, E10, E11) · sobre todo tareas del usuario

- **E10:**
  - Licencia y precio (**pendientes**, decisión 22).
  - Hosting HTTPS.
  - Idiomas (catálogo de textos).
  - Moneda configurable.
  - Privacidad.
- **E11:** cuenta de Partner Center, política de privacidad, condiciones de uso, soporte y revisión de marca.
- Criterio de hecho: v1 de costos publicada.

### Pista C — Módulo Cronograma (bloque P) · desarrollo

| Etapa | Contenido | Esfuerzo |
|---|---|---|
| **P0** | Tipos, plantilla «Actividades», lector, parser de predecesoras, **capa de capacidades por licencia**, **catálogo de textos** del módulo y **moneda configurable** en las plantillas | 3–4 d |
| **P1** | CPM determinista: 4 relaciones, retardos, calendarios, restricciones, avance. Con tests | 8–10 d |
| **P2** | Chequeo de salud con semáforo en el panel | 3–4 d |
| **P3** | Monte Carlo del cronograma: CPM vectorizado en workers, 3 puntos, *drivers* y eventos. Todas las salidas del §3.4. Benchmark | 10–12 d |
| **P4** | Importadores de XML de MS Project y XER de P6, con verificación contra las fechas de origen | 6–8 d |
| **P5** | Costo‑plazo: hitos como entradas del modelo de costos, costos que dependen del tiempo, JCL | 5–7 d |
| **P6** (v2) | Clima probabilístico, escenarios antes y después de mitigar, ramificación probabilística, rangos por sector, ayudas de elicitación | — |

Lanzamiento del módulo: **P0 a P5, unos 35–45 días de trabajo**. Puede ir en la v1 o en una versión posterior, según cuándo esté lista la v1 de costos.

---

## 5. Lo que las decisiones de negocio pendientes sí cambian en el desarrollo

- **Precio (pendiente).** Se construye una **capa de capacidades** (`licencia/capacidades.ts`). El panel y la simulación preguntan si `cronograma` o `jcl` están habilitados. En desarrollo, todo está habilitado. Así cabe cualquier modelo de precio (planes, plan único o perpetuo) sin tocar el código de los módulos.
- **Moneda configurable (decisión 23).**
  - Los precios se leen de una configuración, nunca van escritos en el código.
  - Dentro del producto, los costos toman el formato de su celda, como ya ocurre.
  - Las plantillas dejan de fijar `"€"` (`excel/plantillas.ts`) y usan un ajuste de moneda.
- **Idiomas (decisión 23).** Todo texto nuevo del módulo nace en un catálogo (`ui/textos/es.ts`), listo para paquetes de idioma. La migración de los textos que ya existen queda en E10.

---

## 6. Verificación del módulo

- `npm run check` (build + lint + tests) al cerrar cada etapa.
- Tests unitarios del CPM: 4 relaciones, retardos negativos, calendarios con excepciones, ciclos y avance.
- Prueba estadística del *merge bias*: dos rutas paralelas iguales dan un P50 más tarde que una sola, y coincide con el máximo de dos normales calculado analíticamente.
- Fidelidad: fechas deterministas contra archivos XML de MSP y XER de ejemplo en `tests/fixtures/`.
- Benchmark del §3.5 en `bench/`.
- Bloque Q en la guía de pruebas: Windows, Web y Mac.
- Casos de validación publicables, comparados con ejemplos de la guía GAO‑16‑89G y de AACE 57R‑09.

---

## 7. Advertencias sobre las fuentes

- Varias comparativas vienen de partes interesadas: Vose vende Tamara, Safran y Emerald venden Safran, y Barbecana y Epoch hablan de sus propios productos. Los precios y las velocidades son orientativos.
- Hay pocas reseñas públicas de herramientas de SRA en Capterra y G2.
- Verificar todo antes de usarlo en material comercial.
