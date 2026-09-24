# Estado del proyecto y traspaso de contexto

**Última actualización:** 2026-09-21
**Fase actual:** Fases 1, 2 y 3 aprobadas. Implementación en curso: **E0, E1 y E2 terminadas; E3 empezada**. El motor tiene ya el **canal de valores completo** (los cinco tipos de celda de Excel) y el **Nivel 1 de funciones de criterio**; el libro de fidelidad pasa **31/31 sin excepciones**. Lo que queda de E3 necesita Excel de verdad (ver §9.12).
**Cambio de destino (2026-09-15):** el proyecto deja de ser una herramienta personal y pasa a ser un **producto comercial para 100+ usuarios**. Lee el §10 antes que nada: invalida varios supuestos anteriores.
**Documentos hermanos:**
- [`FASE1_AUDITORIA_TECNICA.md`](FASE1_AUDITORIA_TECNICA.md) — diagnóstico completo con evidencia y benchmarks.
- [`FASE2_ARQUITECTURA.md`](FASE2_ARQUITECTURA.md) — arquitectura objetivo, alternativas descartadas, estrategia de pruebas.
- [`FASE3_ROADMAP.md`](FASE3_ROADMAP.md) — etapas E0–E9, criterios de hecho, riesgos del plan.

Este archivo existe para que cualquier sesión nueva (o cualquier otra IA) pueda retomar el trabajo sin releer toda la conversación anterior. Léelo entero antes de tocar nada.

---

## 1. Qué se quiere construir

Un complemento profesional de Excel para **análisis de sensibilidad, incertidumbre y riesgo en presupuestos**, conceptualmente similar a @RISK: definir variables de entrada inciertas con distribuciones, ejecutar simulaciones Monte Carlo sobre el modelo construido en Excel, y analizar resultados (histogramas, CDF, percentiles, cortes, tornado, escenarios).

Requisito rector: **velocidad**. Debe poder ejecutar 100.000 / 500.000 / 1.000.000 de iteraciones. Todo el cálculo debe ser **local** (sin APIs externas, sin servidores, sin internet para calcular), por privacidad de información presupuestal sensible.

Las instrucciones originales completas del usuario están en:
`C:\Users\danal\Downloads\Instrucciones maestras para diagnóstico y desarrollo del complemento de análisis de sensibilidad.md`

---

## 2. Estado del código heredado (resumen de la auditoría)

Proyecto en `C:\Users\danal\Documents\Proyectos Claude\Riesgos_cuantificables` (copia idéntica en `C:\Users\danal\Documents\1 complemento sensibilidad`, sin Git en ninguna).

Office Add-in web (React 19 + TypeScript + Vite 8 + Office.js), ~4.700 líneas, hecho con otra IA.

Los cinco hechos que hay que tener presentes:

1. **No compila.** `npm run build` (`tsc -b && vite build`) falla con 10 errores de tipos. ESLint reporta 55 errores. `dist/` es un artefacto obsoleto no reproducible.

2. **Las funciones `=RIESGO.*` nunca han funcionado y la causa raíz está identificada** (§5 de la auditoría): el `ExtensionPoint CustomFunctions` está en `<DesktopFormFactor>` en vez de `<AllFormFactors>`; falta `<Requirements>` con `CustomFunctionsRuntime 1.1`; y sobre todo el archivo que Excel Windows carga realmente (`public/functions.js`, apuntado por `Functions.Script.Url`) solo registra un stub `TESTRIESGO` — las 8 funciones reales están en `src/functions.ts`, que ese runtime nunca carga. Verificado además contra la caché de Office: `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\CustomFunctions` está vacía para este complemento, y el validador oficial dice que solo puede correr en iPad y Mac.

3. **El motor mete a Excel dentro del bucle.** `runMonteCarloSimulation` (`src/services/excelService.ts:301`) escribe las entradas, llama a `application.calculate(Full)` y copia las salidas **en cada iteración**. Benchmarks reales medidos en este equipo:

   | | 1.000.000 iteraciones |
   |---|---|
   | Excel en el bucle (vía COM, límite inferior optimista, modelo de 50 fórmulas) | **~3 horas** |
   | Muestreo + modelo + estadísticas en JS puro | **0,7 s**, 88 MB |

   Cuatro órdenes de magnitud. La UI ya topa las iteraciones a 50.000, reconociendo el problema.

4. **Hay errores matemáticos**: PERT no es una Beta (reduce la varianza a ~1/9, sesga hacia la moda); lognormal ambigua (media=1000 da `exp(1000)` = Infinity); Poisson puede colgarse con lambda grande. Detalle en §4.3 de la auditoría.

5. **No hay cancelación**: cerrar el panel a mitad deja el libro en cálculo manual, con una hoja temporal creada y las celdas de entrada sobrescritas. Corrompe el modelo del usuario.

**Decisión de la auditoría: C — Reescribir parcialmente.** Se reemplaza el núcleo (motor, funciones personalizadas, gráficos, parte del modelo de datos). Se conservan las *decisiones* válidas — plataforma Office Add-in web, stack React/TS/Vite, persistencia en `workbook.settings`, rangos con nombre, exportación a hojas nativas, estructura de la cinta — y piezas puntuales (CDFs teóricas, muestreadores correctos) reescritas con tests. Empezar desde cero volvería a las mismas decisiones, así que no aporta nada.

---

## 3. Decisiones ya tomadas con el usuario (NO volver a preguntar)

| # | Pregunta | Respuesta | Consecuencia técnica |
|---|---|---|---|
| 1 | Plataformas | Principalmente Excel de escritorio Windows (M365, es-ES, 16.0.20326 x64), **pero también debe funcionar en Mac**; deseable otras versiones | **Descarta XLL / Excel-DNA** (solo Windows). Obliga a mantener el formato Office Add-in web |
| 2 | ~~Distribución~~ | ~~Equipo **personal**~~ — **SUPERADA por la decisión 14** | Ya no aplica. Ver §10 |
| 3 | Qué funciones de Excel usan sus modelos | ~~No lo sabe, y decide NO medirlo ahora~~ → **MEDIDO el 2026-09-21** con el escáner sobre un libro real | El catálogo supuesto resultó acertado en su forma, pero las funciones de criterio pesan mucho más de lo previsto (3.183 usos) y se implementaron de inmediato. Ver §5 |
| 4 | ¿Motor rápido con cobertura parcial + fallback? | **SÍ — híbrido confirmado** | Es la arquitectura de la Fase 2. Ver §4 |
| 5 | Git / GitHub | **Autorizado**: git local + repositorio privado en GitHub | Ejecutado el local. Ver §6 |
| 6 | Nombres de las funciones personalizadas | **En inglés, espacio de nombres `RISK.`** | `RISK.NORMAL`, `RISK.TRIANGULAR`, … Se abandona `RIESGO.` |
| 7 | Compatibilidad con libros ya configurados | **No hace falta migrar** | Formato nuevo `RiskModel v1`, sin soporte de `MonteCarloConfig` |
| 8 | Aprobación de la Fase 2 | **Concedida**, incluidas las eliminaciones (Google Fonts, jspdf/html2canvas, recharts, modo muerto, tope de 50k) | Fase 2 cerrada |
| 9 | ¿F9 debe mover el modelo? | **Sí**, como **modo exploración** conmutable | `RISK.*` volátiles con doble comportamiento según modo. Ver §6.1 de Fase 2 |
| 10 | Método de muestreo | **Ambos**, Monte Carlo y LHS, seleccionables | LHS preseleccionado; el método se indica siempre en los resultados |
| 11 | **Escala real** | **Cientos de entradas y salidas; iteraciones que pueden llegar a millones** | Restricción dominante del proyecto. Obligó a rediseñar memoria: bloque adaptativo, t-digest, reservorio para sensibilidad |
| 12 | Orden de construcción | **Delegado en mí** → escáner primero, motor después | Ver Fase 3, §1 |
| 13 | Carpeta duplicada `1 complemento sensibilidad` | **Puede borrarse** ahora que hay Git | Ojo: el sideload de Excel apunta a ella; hay que re-registrar antes de borrarla |
| 14 | **Destino del proyecto** | **Producto comercial**, para vender o publicar (AppSource). **100+ usuarios, público abierto** | **Invalida la D2 original ("equipo personal").** Ver §10 |
| 15 | Modo compatible (Excel en el bucle) | **Entra en el MVP**, invirtiendo la decisión 2.2 | Con usuarios desconocidos, "no puedo simular tu modelo" es motivo de desinstalar |
| 16 | Alcance del catálogo de funciones | **Amplio por diseño**, no limitado a los libros del usuario | Los libros propios sirven de suelo mínimo, no de techo. Añadir funciones debe ser barato |
| 17 | **Configuración regional** (separador decimal) | **Se lee de Office al crear el modelo y se guarda en el libro** (`RiskModel v1`) | Ni se pregunta al usuario ni se relee en cada ejecución: el libro queda reproducible entre máquinas con idiomas distintos, que es lo que necesita un producto que van a compartir 100+ personas. Ver §9.14 |

### Consecuencia arquitectónica principal

Al exigirse Mac, el camino nativo queda eliminado. **Solo queda una vía viable** para alcanzar 100k–1M iteraciones: **evaluar el modelo fuera del ciclo de recálculo de Excel**, en un motor propio vectorizado (TypeScript sobre `Float64Array`, Web Workers para paralelismo real, y Rust→WASM solo si los benchmarks lo justifican). Ya no es una opción entre varias.

Nota de diseño derivada: las funciones `=RIESGO.X()` en celdas deben servir para **declarar** la distribución (autodocumentan el modelo, como en @RISK), **no** como mecanismo de muestreo masivo. El motor lee la declaración y muestrea fuera de Excel.

---

## 4. Arquitectura híbrida — CONFIRMADA

> Desarrollada en detalle en [`FASE2_ARQUITECTURA.md`](FASE2_ARQUITECTURA.md). Lo que sigue es el resumen que motivó la decisión.

Tres posturas posibles para la cobertura de funciones de Excel:

- **Solo motor rápido**: velocísimo, pero un modelo con una función no soportada no se puede simular. Inaceptable para presupuestos reales.
- **Solo Excel en el bucle**: funciona con cualquier modelo, pero es la arquitectura actual y no cumple el objetivo de velocidad.
- **Híbrido (RECOMENDADO)**: al pulsar "Simular", se analiza el subgrafo de dependencias entre entradas y salidas. Si todo está soportado → motor rápido. Si no → se informa exactamente qué celda y qué función lo impiden, se estima el tiempo, y se ofrece el modo compatible (lento) o ajustar el modelo.

Ventaja decisiva del híbrido: nunca deja al usuario sin respuesta ni le miente sobre el tiempo, y cada función añadida al motor amplía cobertura sin rediseñar nada.

**Riesgo asociado que debe cubrirse obligatoriamente:** fidelidad numérica. El motor debe producir exactamente lo mismo que Excel. Requiere una batería de tests que compare celda a celda contra Excel sobre un libro de referencia. No es opcional.

Estructura de carpetas prevista para la Fase 4 (proyecto nuevo dentro de la misma plataforma, no parcheo del árbol actual):

```
engine/     motor puro, sin dependencias de Office, testeable en Node
excel/      adaptadores Office.js (lectura del modelo, escritura de resultados)
functions/  funciones personalizadas, build propio (bundle plano)
ui/         panel de tareas React
tests/      unitarios, estadísticos, de fidelidad vs Excel, benchmarks
```

---

## 5. Medición de los modelos reales — RESUELTA (2026-09-21)

Llevaba abierta desde la Fase 1: el alcance del motor se había definido sobre un **catálogo supuesto** de funciones típicas de presupuestos (§4.2 de la Fase 2), no sobre datos, porque el usuario decidió no medir sus libros entonces (decisión 3 del §3).

**Ya hay dato.** El usuario pasó el escáner por un libro real suyo:

```
npm run scan -- "…\Humedales_v1_completo (100).xlsx"
```

| | |
|---|---|
| Hojas | 132 |
| Celdas con contenido | 95.317 |
| Fórmulas | 16.609 (5.762 compartidas) |
| Profundidad de cadena | 31 (cota inferior) |
| Nombres definidos | 104 |
| Cobertura solo con Nivel 0 | **85,2 %** |
| Con Nivel 0 + Nivel 1 | todo salvo **7 usos de `ESBLANCO`** |

Funciones más usadas: `SI` (6.254), `REDONDEAR` (5.536), `SUMA` (3.022), `SUMAR.SI.CONJUNTO` (1.666), `REDONDEAR.MAS` (1.244), `CONTAR.SI` (1.052), `O` (921), `PROMEDIO.SI.CONJUNTO` (396).

**Qué decidió este dato:**

1. El catálogo supuesto era **acertado en su forma**: un libro real y grande, de un dominio distinto al previsto (humedales, no presupuesto genérico), queda a siete fórmulas de ser 100 % compatible. La apuesta de los dos niveles se sostiene.
2. Pero las **funciones de criterio** (`SUMAR.SI*`, `CONTAR.SI*`, `PROMEDIO.SI*`) suman **3.183 usos**: no son un extra de Nivel 1, son el bloque que decide si el motor sirve para un presupuesto real. Se implementaron de inmediato.
3. `ESBLANCO` y los criterios estaban bloqueados por la **misma causa raíz**: el motor solo modelaba números. De ahí el canal de valores (§9.13).

### 5.1 Segundo libro, y una lección sobre el propio escáner (2026-09-21)

El usuario pasó el escáner por un segundo libro, `Caso_practico.xlsx` (6 hojas, 22.799 fórmulas, 97,2 % de cobertura solo con Nivel 0), y el informe dijo **"✅ Compatible con el motor rápido"**.

Era falso. Ese libro usa `FIN.MES`, `MES` y `AÑO` 300 veces cada una, y `TIR` cuatro, y ninguna estaba implementada: el motor se habría atragantado con él.

**La causa era conceptual, no un descuido**: el veredicto miraba el *catálogo previsto* (§4.2 de Fase 2) y no el *registro de funciones*. Son dos cosas distintas —el catálogo es el plan, el registro es lo que existe— y confundirlas produce exactamente la clase de respuesta tranquilizadora y falsa que el escáner existe para evitar. Es la segunda vez que aparece la misma deriva; la primera fue con diez funciones de Nivel 0 inexistentes.

Corregido en dos frentes:

1. El informe separa ahora **bloqueantes** (fuera del catálogo: no correrán sin cambiar el roadmap) de **pendientes** (dentro del catálogo pero sin implementar: correrán en cuanto se escriban, sin tocar el libro). El verde exige que no haya ni unas ni otras, y el escáner consulta el registro del motor directamente, así que no puede volver a desincronizarse.
2. Se implementaron las funciones que faltaban: `FECHA`, `AÑO`, `MES`, `DIA`, `FIN.MES`, `FECHA.MES`, `DIAS`, `DIASEM`, `VNA` y `TIR`.

Con eso, **los dos libros reales del usuario dan compatible de verdad**.

Queda pendiente pasar el escáner por más libros suyos: dos no bastan para dar el catálogo por bueno, aunque ya son mucho más que cero.

---

## 6. Control de versiones — AUTORIZADO Y EJECUTADO (local)

Hecho el 2026-09-15 en `Riesgos_cuantificables`:

1. `git init` con rama `main`. Identidad configurada **solo en este repositorio** (`danalejo9 / danalejo9@gmail.com`), sin tocar la configuración global.
2. Commit inicial `b7abbb2` **"Estado heredado"** con el código tal como lo dejó la IA anterior, antes de modificar nada.
3. Etiqueta **`v0.0.0-heredado`** sobre ese commit: es la evidencia congelada de la auditoría.
4. Rama **`develop`** creada y activa. `main` queda reservada para versiones etiquetadas (SemVer).
5. `.claude/` añadido a `.gitignore` (ya excluía `node_modules` y `dist`). No hay secretos en el código.

6. **Remoto conectado y subido**: `https://github.com/danalejo9/riesgo-Montecarlo-excel.git`. El repositorio ya tenía un commit inicial con un README automático de GitHub (`f68242e`); se **rebasó** la historia local encima en lugar de sobrescribirla, conservando el README heredado como contenido. `main`, `develop` y la etiqueta `v0.0.0-heredado` están en el remoto.

Nota: `gh` (GitHub CLI) **no está instalado** en este equipo. Todas las operaciones de GitHub se hacen por `git` + web.

La carpeta `1 complemento sensibilidad` queda como copia congelada; ya no es el mecanismo de respaldo.

---

## 7. Entorno verificado de este equipo

- Windows 11, Node v24.15.0, npm 11.12.1, git 2.55.0. Sin `gh`.
- Excel: Microsoft 365, versión 16.0.20326.20144, x64, cultura **es-ES**.
- Certificados de desarrollo presentes en `~/.office-addin-dev-certs` (válidos).
- Sideload **re-registrado el 2026-09-21** apuntando al repositorio actual (`riesgo-montecarlo-v2`), con el Id nuevo `6c55c606-966a-443c-b0af-ad9b854af48f`. El registro del complemento heredado (`b5137d5a-…`, en `1 complemento sensibilidad`) se eliminó de esa misma clave.

### 7.1 Entorno de Office verificado dentro de Excel (2026-09-21)

Medido por el propio panel de diagnóstico, no supuesto:

| | |
|---|---|
| Host / plataforma | Excel / PC |
| Versión | 16.0.20326.20144 |
| Idioma de la interfaz | **es-ES** |
| `ExcelApi` disponible | **hasta 1.12** (todos los conjuntos que el complemento necesita) |

**Esto desbloquea decisiones que estaban en el aire**, porque no hay que
programar contra el mínimo común denominador en la máquina del usuario:

- `ExcelApi 1.8` → `getDirectPrecedents`: el grafo de dependencias se puede
  pedir a Excel en vez de deducirlo solo del texto de las fórmulas.
- `ExcelApi 1.9` → modo de cálculo y `suspendApiCalculationUntilNextSync`:
  es lo que necesita el guardián transaccional (§7.3 de Fase 2) para
  proteger el libro de verdad.
- `ExcelApi 1.12` → lectura de fórmulas en lote más eficiente, que es la
  operación dominante al leer un libro de 132 hojas.

**Ojo con generalizar**: esto es la máquina del usuario, con M365 al día.
Un cliente con Office 2019 o Excel para Mac tendrá menos, y el complemento
sigue teniendo que degradar con elegancia — por eso `entorno.ts` comprueba
cada conjunto por separado en vez de fiarse del número de versión.

El **idioma es-ES confirma** que la decisión 17 (configuración regional) no
es teórica: este Excel escribe los decimales con coma.
- Servidor de desarrollo previsto: Vite en `https://localhost:9090`.

---

## 8. Reglas de trabajo acordadas con el usuario

Vienen de sus instrucciones maestras y siguen vigentes:

- Trabajar **por fases**: Auditoría → Arquitectura → Roadmap → Implementación. No implementar antes de presentar diagnóstico y arquitectura.
- Antes de cambios destructivos (borrar archivos, reescribir módulos, cambiar de framework o lenguaje, eliminar funcionalidades): explicar qué se propone, por qué, qué se gana, qué se pierde, qué riesgos hay, qué alternativa existe y qué impacto tendrá. **Esperar aprobación.**
- Actuar como arquitecto + desarrollador + ingeniero de rendimiento + especialista en Monte Carlo, no como ejecutor literal. Si una idea del usuario genera problemas técnicos, decírselo.
- No inventar requisitos ni suponer preferencias técnicas: preguntar, agrupando preguntas.
- Los benchmarks deben **ejecutarse realmente**, nunca estimarse.
- Entregable final obligatorio: documentación completa que permita a otra IA reconstruir el proyecto desde cero (§21 de las instrucciones maestras).

---

## 9. Próximos pasos concretos

1. [x] Resolver el bloqueante de §5 → aplazado por decisión del usuario; escáner como primer entregable de Fase 4.
2. [x] Confirmar la arquitectura híbrida de §4.
3. [x] Autorizar Git y ejecutar el repositorio local (§6). Falta solo el remoto en GitHub.
4. [x] **Fase 2 — Propuesta de arquitectura** → [`FASE2_ARQUITECTURA.md`](FASE2_ARQUITECTURA.md).
5. [x] **Fase 2 aprobada** (los 5 puntos de su §16), con revisión posterior por D9–D11.
6. [x] Repositorio en GitHub creado y remoto conectado.
7. [x] **Fase 3 — Roadmap** → [`FASE3_ROADMAP.md`](FASE3_ROADMAP.md). Escáner (E1) como primer entregable.
8. [x] **Fase 3 aprobada** (2026-09-15). La decisión 2.2 se mantiene: el modo compatible va a la V1, no al MVP.
9. [x] **E0 — Fundaciones COMPLETADA**. Criterio de hecho cumplido: `npm run build && npm run lint && npm test` en verde, 16 tests. Ver `CHANGELOG.md`.
10. [~] **E1 — Escáner de compatibilidad**: implementado y probado (50 tests en verde). **Falta lo único que no puedo hacer yo: que el usuario lo pase por sus libros reales** y revisar juntos el catálogo del §4.2. Hasta entonces la etapa no se cierra.

    ```
    npm run scan -- "C:\ruta\Presupuesto.xlsx"
    ```
11. [x] **E2 — Motor Nivel 0, COMPLETADA**, según [`FASE3_ROADMAP.md`](FASE3_ROADMAP.md).
    Los tres criterios de hecho:
    1. **Fidelidad contra Excel**: `tests/fixtures/fidelidad.xlsx`, 31 casos
       calculados en Excel real. Al cerrar E2 iban 25 exactos y 6
       documentados por id como pendientes, todos por la misma causa raíz
       (el motor solo modelaba números), incluidos **dos hallazgos nuevos**:
       `PROMEDIO` no distinguía una celda vacía de un cero en su
       denominador. **Desde el 2026-09-21 los 31 pasan** — ver el punto 13.
    2. **Tests estadísticos**: en verde para todas las distribuciones
       (`engine/distributions/`) y el muestreo (`engine/sampling/`).
    3. **Benchmark formal, medido, no estimado**: 1M iteraciones / 20
       entradas / 5 salidas / 200 celdas en **8,5 s en un hilo, 3,2 s con un
       pool de 4 workers reales** (`worker_threads` de Node, prueba de que la
       interfaz `EjecutorDeBloques` sirve para paralelismo real) — ambos por
       debajo o cerca del objetivo de 5 s, y el paralelo claramente por debajo.

    Todo lo construido, en orden: parser, grafo de dependencias, registro de
    funciones vectorizadas, evaluador de referencia, **distribuciones**
    (`engine/distributions/`, con `descriptor.ts` para su forma serializable
    — el mismo formato que usará `RiskModel v1`), **muestreo**
    (`engine/sampling/`, con `muestrearMonteCarloBloque` para generar por
    tramos), **estadísticas de salida** (`engine/stats/`), **compilador
    optimizado con *constant folding*** (`engine/compiler/plan.ts` +
    `executor.ts`) y el **ejecutor por bloques** (`engine/executor/`: tamaño
    de bloque adaptativo, cancelación entre bloques, progreso, estadísticas
    acumuladas bloque a bloque, y la interfaz `EjecutorDeBloques` que separa
    "calcular un bloque" de "quién lo reparte" — un solo hilo por defecto, o
    un pool real). Ver `CHANGELOG.md` para el detalle de cada pieza.

    **Límite conocido, heredado y sin resolver todavía**: LHS no puede
    generarse por tramos (su estratificación necesita `n` completo de
    antemano), así que sigue materializando el buffer entero por variable.
    Monte Carlo sí es 100 % por tramos. Documentado en
    `engine/executor/entradas.ts`.

    `npm run build && npm run lint && npm test` en verde: 263 tests (+ 6
    documentados como pendientes, no ocultos).

12. [~] **E3 — Integración Excel + UI mínima + modo compatible**, según
    [`FASE3_ROADMAP.md`](FASE3_ROADMAP.md) — **v0.5, el MVP**: el ciclo
    completo funcionando de verdad (definir entradas, marcar salidas, simular
    un millón de iteraciones, ver resultados), adaptadores Office.js,
    formato `RiskModel v1` en `workbook.settings`, guardián transaccional,
    panel React, informe de compatibilidad integrado.

    Empezada por lo que **no** necesita Excel:
    - `engine/modelo/`: formato `RiskModel v1`, validación, agrupación de
      correlaciones, conversión a las entradas del ejecutor, y el
      **guardián transaccional** (`guardian.ts`) — la lógica de cuándo
      proteger/restaurar/descartar, probada con un almacén simulado en
      memoria. La frontera real con Excel (`AlmacenGuardian`: leer/escribir
      `workbook.settings`, cambiar el modo de cálculo, leer/escribir una
      celda) queda inyectada, sin implementar todavía.
    - `engine/stats/resumen.ts`: `resumenEstadistico` (media, desviación,
      percentiles p1..p99 marcados como aproximados) y `curvaCDF` a partir de
      lo que ya produce el ejecutor por bloques (Welford + t-digest) — la
      parte de "Resultados" de E3 que es pura transformación de datos, sin
      Office.js. `puntosHistograma` formatea un `Histograma` ya construido,
      pero el histograma **por bloques** (acumulado en streaming, Fase 2
      §3.3) no existe todavía — límite documentado en el propio archivo,
      para cuando se aborde E6.

    Sigue siendo código de `engine/`, probado en Node, sin Office.js.

    **Decisión confirmada con el usuario (2026-09-19): `RiskModel v1` va
    íntegro en inglés** (`type`, `mean`, `mode`, `with`, `coefficient`…),
    para que un desarrollador o usuario que no hable español pueda leerlo
    directamente — coherente con la decisión 14 (producto comercial
    internacional). El motor interno (`engine/distributions/descriptor.ts`)
    se queda en español porque es puramente interno; `engine/modelo/distributionSchema.ts`
    es la traducción entre los dos mundos (`toDescriptor`/`fromDescriptor`).
    Ya no es una decisión abierta.

    Todo lo que sigue **sí** necesita Excel de verdad y no se puede avanzar
    más en la nube:
    - **Adaptadores Office.js**: lector del grafo en lote (fórmulas,
      precedentes) y escritor de resultados. No existen todavía.
    - **`resolverRef`**: `prepararEntradas` (`engine/modelo/`) ya espera esta
      función inyectada (rango con nombre → clave de celda); implementarla de
      verdad es Office.js puro.
    - **`AlmacenGuardian` de verdad**: la lógica del guardián ya está y está
      probada (arriba); falta conectarla a `workbook.settings`, al modo de
      cálculo real y a la escritura de celdas — eso sí necesita Excel abierto
      para verificarse.
    - **Panel React**, informe de compatibilidad integrado, y el histograma
      por bloques pendiente de `engine/stats/resumen.ts`.

13. [x] **Canal de valores + Nivel 1 de criterios (2026-09-21)** — no estaba
    en el roadmap como etapa propia; lo disparó el resultado del escáner (§5).

    El motor modelaba **solo números**, un límite que estaba documentado y
    aplazado a propósito en el antiguo `engine/functions/types.ts`. Era la
    causa raíz común de tres cosas a la vez: los seis casos pendientes del
    libro de fidelidad, la imposibilidad de implementar `ESBLANCO` (los 7
    usos que bloqueaban el libro real) y la de implementar las funciones de
    criterio (3.183 usos). Se decidió con el usuario atacarla de raíz en vez
    de parchear solo los criterios con comparaciones numéricas.

    Lo que hay ahora:
    - `engine/values/` — los cinco tipos de celda de Excel, vectorizados. Una
      `Columna` son los N valores de una celda, en tres formas: vector
      numérico plano (el caso dominante), constante no numérica (un texto no
      necesita un millón de copias) y mixta (`SI(A1>10;"alto";5)`).
    - `engine/functions/agregacion.ts` — las reglas de contexto de Excel en un
      solo sitio: en un rango solo cuentan los números, pero sueltos un lógico
      vale 1 y el texto "5" se convierte; un error se propaga en `SUMA` y se
      ignora en `CONTAR`.
    - `engine/functions/criterios.ts` + `condicionales.ts` — `SUMAR.SI`,
      `SUMAR.SI.CONJUNTO`, `CONTAR.SI`, `CONTAR.SI.CONJUNTO`, `PROMEDIO.SI`,
      `PROMEDIO.SI.CONJUNTO`, con comodines y criterios sobre vacío.
    - `engine/functions/info.ts` — `ESBLANCO` y las demás funciones de tipo.
    - Diez funciones de Nivel 0 que el catálogo prometía y **no estaban
      implementadas** (`REDOND.MULT`, `MULTIPLO.SUPERIOR/INFERIOR`,
      `PERCENTIL`, `CUARTIL`, `K.ESIMO.MAYOR/MENOR`, `SUMA.CUADRADOS`).

    **Fidelidad: 31/31 contra Excel real, sin excepciones** (antes 25/31, con
    6 documentados como pendientes). El diccionario `PENDIENTES` de
    `tests/unit/fidelidad.test.ts` se conserva vacío, como sitio donde
    documentar el próximo hueco.

    **Rendimiento: sin coste.** Medido en el mismo contenedor, mismo modelo,
    comparando el commit anterior con el actual: 18,3 s antes, 18,6 s después
    (1M iteraciones, un hilo) — ~1,5 %, dentro del ruido, y la media de la
    salida idéntica hasta el último decimal. Lo consigue el camino rápido:
    cada función comprueba una vez por llamada si sus argumentos ya son
    vectores numéricos y, si lo son, corre el mismo bucle plano de antes.
    Reproducible con `npm run bench`. (Los 8,5 s del criterio de E2 se
    midieron en el equipo del usuario, no aquí; este contenedor es ~2× más
    lento. La comparación válida es antes-contra-después en la misma máquina.)

    **Deriva corregida, y atada:** el escáner contaba como cubiertas diez
    funciones de Nivel 0 inexistentes y como bloqueantes varias `ES*` ya
    implementables. Un informe de compatibilidad optimista es peor que no
    tener informe, así que `tests/unit/catalogoVsRegistro.test.ts` ata las dos
    listas y falla si alguien añade una función en un lado y no en el otro.

    **Huecos que deja, documentados y no disimulados:**
    - Una salida no numérica (texto, o error en algunas iteraciones) se
      convierte a `NaN` al reducirse a estadísticas y contamina la media sin
      decir por qué. Lo correcto —contar esas iteraciones y enseñarlas— es
      trabajo de E6 y toca el formato que viaja entre workers. Ver
      `aBufferNumerico` en `engine/values/buffer.ts`.
    - Los casos límite de los criterios (`"<>texto"` contra una celda vacía,
      entre otros) están implementados según la documentación de Microsoft,
      **no verificados contra Excel**. Necesitan una segunda tanda del libro
      de fidelidad: es lo primero que conviene pedirle al usuario ahora que
      tiene Excel a mano.
    - La conversión de texto a número ignora la configuración regional: un
      "1,5" escrito en un libro es-ES no se convierte.

14. [~] **Segunda tanda del libro de fidelidad: Nivel 1 verificado (2026-09-21)**

    50 casos calculados por el Excel real del usuario
    (`tests/fixtures/fidelidad-nivel1.xlsx`, generado con
    `tests/fixtures/generar-nivel1.py`). **48 coinciden**; los 2 restantes
    están documentados por id en `PENDIENTES`, no ocultos.

    Lo que confirmó que estaba bien: los comodines (`*`, `?`, `~` para
    escaparlos), los criterios sobre vacío (`""` y `"<>"`), que `CONTAR.SI`
    ignora un error dentro del rango y `SUMAR.SI` no lo propaga, y los cuatro
    cuadrantes de signos de `MULTIPLO.SUPERIOR`/`MULTIPLO.INFERIOR` —
    incluido `MULTIPLO.SUPERIOR(-2,5;1) = -2`, que redondea *hacia* cero pese
    al nombre.

    **Un error real del motor, encontrado justo por esto:** yo había
    implementado que una celda vacía no coincide nunca con un criterio de
    valor concreto. Es falso para `<>`. Excel dice que una celda vacía **sí**
    es "distinta de obra", así que `SUMAR.SI(M:M;"<>obra";N:N)` suma también
    esa fila: 4100 y no 3400. Corregido en `engine/functions/criterios.ts`,
    con el test unitario que afirmaba lo contrario reescrito. Es exactamente
    el tipo de fallo que ninguna cantidad de tests propios habría encontrado,
    porque los tests propios comprueban lo que uno creyó.

    **Un hallazgo con consecuencias de diseño, no un fallo a parchear:** el
    Excel es-ES del usuario convierte un número a texto con **coma decimal**
    (`1,5&""` da `"1,5"`), y el motor produce `"1.5"`. Confirma con dato el
    hueco de configuración regional que ya estaba documentado como sospecha.
    Afecta a más de lo que parece: a la concatenación, a la conversión de
    texto a número (un `"1,5"` escrito en una celda debería valer 1,5) y a
    cualquier comparación que pase por texto. **Antes de arreglarlo hay que
    decidir de dónde sale esa configuración**: de `Office.context`
    (`displayLanguage` / `decimalSeparator`), de una opción del panel, o del
    propio libro. Es una decisión para el usuario, ligada a la
    internacionalización del §10.4, y no debe tomarse a la ligera porque
    cambia el significado de datos numéricos.

    **Un defecto del generador, no del motor:** las funciones posteriores a
    Excel 2007 se guardan en el XML con el prefijo `_xlfn.`, y el generador
    escribió `IFNA` a secas; Excel la tomó por una función definida por el
    usuario y devolvió `#¿NOMBRE?`. Corregido en el generador. De paso
    destapó que el registro del motor tampoco quitaba ese prefijo, cosa que
    sí hacía el escáner: un libro real llega con `_xlfn.IFNA` escrito así, de
    modo que esto habría fallado en producción. Corregido y con test.

15. [~] **E3 arrancado: manifiesto nuevo, build de la UI y panel de diagnóstico (2026-09-21)**

    Primer entregable **sideloadeable** del proyecto. Hasta aquí no había nada
    que Excel pudiera cargar: el `manifest.xml` de la raíz era todavía el
    heredado, el que nunca funcionó.

    - **`manifest.xml` reescrito**, con Id nuevo (el viejo puede estar en la
      caché de Office de la máquina del usuario) y los defectos de la
      auditoría corregidos: `<Requirements>` declarado, y **ninguna función
      personalizada declarada todavía** — apuntar `RISK.*` a un `functions.js`
      inexistente reproduciría el defecto 3 en otra forma. Entrarán cuando
      estén escritas.
    - **`excel/`**: la capa de Office.js. `entorno.ts` (host, plataforma,
      idioma y qué conjuntos de `ExcelApi` hay disponibles) y `seleccion.ts`
      (lectura en lote de la selección). Desde el primer archivo se respeta la
      regla que el heredado rompía: pedir en lote y sincronizar una vez, nunca
      una llamada por celda.
    - **`ui/`**: panel React mínimo, sin librería de componentes ni fuentes
      remotas, con tema claro y oscuro.
    - **Build**: `npm run build` vuelve a ser `tsc -b && vite build`. Raíz de
      Vite en `ui/`, para que las URL servidas coincidan exactamente con las
      del manifiesto. `tsconfig.ui.json` separa la capa con DOM y `office-js`
      del motor, que sigue sin saber nada del entorno.

    **El panel no simula nada a propósito.** Contesta tres preguntas que no se
    podían contestar sin Excel delante: ¿carga el complemento?, ¿qué APIs hay
    en esta máquina (difieren entre Windows y Mac)?, ¿se puede leer el libro?
    Si el sideload está mal, es mucho mejor descubrirlo con cien líneas que
    con mil.

    **Lo que no se pudo verificar aquí**: `npm run validate-manifest` necesita
    el servicio en línea de Microsoft y el entorno de desarrollo en la nube lo
    bloquea (403). Se comprobó a mano que el XML está bien formado, que el
    orden de los elementos respeta el esquema (que es sensible al orden), que
    no falta ningún `resid` y que existen todos los recursos que el manifiesto
    pide. La validación de verdad la tiene que hacer el usuario.

16. [~] **Búsquedas y financieras completas (2026-09-22)** — el giro de
    prioridad que pidió el usuario: dejar de seguir el rastro de sus dos
    libros y cubrir lo que necesita **cualquier** libro.

    El motor tenía 73 funciones, pero faltaban `BUSCARV`, `INDICE`,
    `COINCIDIR`, `BUSCARX`… Que ninguno de los dos libros medidos las use es
    **suerte, no representatividad**: una tabla de tarifas consultada con
    `BUSCARV` está en casi todos los modelos de presupuesto ajenos.

    Añadidas: `BUSCARV`, `BUSCARH`, `INDICE`, `COINCIDIR`, `BUSCARX`,
    `COINCIDIRX`, `ELEGIR`; y las financieras estructuradas `PAGO`, `VA`,
    `VF`, `NPER`, `TASA`, `PAGOINT`, `PAGOPRIN`, `VNA.NO.PER`, `TIR.NO.PER`.
    El motor pasa de 73 a 91 funciones.

    **Una decisión de modelo**: `Argumento` gana la **forma** del rango (filas
    × columnas). Hasta ahora un rango llegaba aplanado, y `BUSCARV` necesita
    saber cuántas columnas tiene la tabla. El aplanado es por columnas, así
    que la celda (f, c) está en `c * filas + f`; equivocar ese orden da una
    tabla transpuesta y resultados plausibles pero falsos.

    **Un problema de rendimiento real, encontrado midiendo y no suponiendo.**
    El docstring de `busquedas.ts` advertía que la búsqueda se repite en cada
    iteración. El benchmark lo cuantificó: **281 s** para un millón de
    iteraciones con 200 `BUSCARV` sobre una tabla de 100 filas, contra 17 s
    del modelo numérico. Inaceptable.

    La causa: la tabla no cambia entre iteraciones, pero el motor no tenía
    forma de saberlo y la recorría entera cada vez pasando por el despacho del
    canal de valores. La solución es una bandera `invariante` en `Columna`,
    que ponen los constructores que rellenan un único valor: la invariancia es
    un hecho **conocido** en el momento de construir, no algo que haya que
    redescubrir recorriendo el array. Con ella, las búsquedas extraen las
    claves una sola vez y usan búsqueda binaria cuando están ordenadas.

    **281 s → 32 s, con la media de salida idéntica** (3.020.927,67), que es
    lo que prueba que la semántica no cambió. La binaria solo se usa si las
    claves están de verdad ordenadas; si la tabla está desordenada —error
    frecuente que Excel tampoco detecta— se sigue recorriendo linealmente,
    que es lo que reproduce el comportamiento de Excel.

    **Lo que queda pendiente de verificar contra Excel**: toda esta tanda.
    `BUSCARV` aproximado sobre tabla desordenada, `TASA` y `TIR.NO.PER`
    (resueltas numéricamente, y Excel se rinde a las 20 iteraciones mientras
    el motor es más tenaz), y el convenio de signos de `PAGOINT`/`PAGOPRIN`
    con pagos al principio del periodo. Va a la tercera tanda del libro.

17. [~] **Modo compatible: Excel dentro del bucle (2026-09-22)** — la red de
    seguridad del producto (decisión 15), construida entera salvo su
    verificación dentro de Excel.

    El motor rápido es cuatro órdenes de magnitud más veloz, pero solo sabe
    las 91 funciones que tiene implementadas. Con usuarios desconocidos eso no
    basta: un libro con una función que falte se queda sin respuesta, y "no
    puedo simular tu modelo" es motivo de desinstalar. El modo compatible
    invierte el trato — escribe las entradas en las celdas, le pide a Excel
    que recalcule y lee las salidas, una iteración cada vez — y funciona con
    **cualquier** libro, porque lo calcula Excel.

    **La decisión que lo hace comprobable sin Excel**: `LibroCalculable`
    (`engine/compatible/tipos.ts`), una interfaz con un único método,
    `calcularIteracion`. Es el mismo patrón que `EjecutorDeBloques`: el bucle,
    las estadísticas, la cancelación y la estimación de tiempo son lógica pura
    probada en Node con un libro de mentira, y el adaptador de Office.js es una
    capa fina encima. Es **un** método y no tres (escribir / recalcular / leer)
    porque en Office.js las tres cosas se encolan y se resuelven en **una sola**
    sincronización: separarlas invitaría a hacer tres viajes por iteración, y
    en este modo el coste *es* el viaje.

    Lo que hay:
    - `engine/compatible/simularCompatible.ts` — el bucle, con t-digest por
      tramos (igual que `simularPorBloques` con los bloques, para no acumular
      un millón de valores sueltos por salida), y `medirRitmo`, que corre unas
      pocas iteraciones reales y las tira.
    - `engine/compatible/tiempo.ts` — `tiempoEstimado` y `convieneAvisar`.
      Está en el motor y no en el panel porque la regla es de producto: con
      Excel en el bucle **se dice el tiempo, siempre, y medido**. La auditoría
      midió ~3 h para un millón de iteraciones; descubrirlo a los veinte
      minutos es sentirse engañado.
    - `excel/libroCalculable.ts` — el adaptador real. Una iteración, un
      `context.sync()`; los rangos se resuelven una vez, fuera del bucle;
      `recalculate` y no `full`, para no tirar la cadena de dependencias que
      Excel ya mantiene.
    - `excel/almacenGuardian.ts` — **el `AlmacenGuardian` de verdad**, lo que
      el guardián esperaba desde E3. Resuelve el desajuste entre una interfaz
      síncrona y un Office.js asíncrono con una foto y un volcado: una lectura
      en lote al cargar (registro pendiente, modo de cálculo, valor actual de
      cada entrada), escrituras encoladas, un `aplicar()` al final. Dos viajes
      a Excel, no veinte.
    - `excel/simulacionCompatible.ts` — la coreografía completa dentro de un
      único `Excel.run`.
    - `excel/direcciones.ts` (puro, probado) y `excel/rangos.ts` (el trozo que
      necesita el tipo `Excel.Range`), separados para que partir `Hoja!Rango`
      se pueda probar sin arrastrar los globales de Office al proyecto del
      motor. No es ceremonia: basta una hoja llamada "Flujo de caja" para que
      un `split('!')` ingenuo falle.

    **Dos decisiones que cambian lo que ve el usuario:**
    - **Las iteraciones no numéricas se cuentan, no se propagan.** Si una
      salida da `#¡DIV/0!` en 12 de 5.000 iteraciones, meter ese `NaN` en
      Welford deja las estadísticas en `NaN` sin decir por qué. En modo
      compatible se excluyen y se cuentan en `noNumericas`. Esto **cierra a
      medias** el hueco que documenta `aBufferNumerico`: cerrado en este modo,
      todavía abierto en el modo rápido, donde tocar el formato que viaja
      entre workers es trabajo de E6.
    - **Al terminar se restauran los valores, no solo el modo de cálculo.** El
      modo compatible escribe en el libro del usuario, y la última iteración
      deja en sus entradas un número aleatorio cualquiera. Por eso se usa
      siempre `restaurarDesdeRecuperacion` y no `finalizarProteccion`, también
      cuando todo va bien: terminar "con éxito" dejando el modelo con datos
      inventados es corromper el libro despacio (R5).

    **Lo que no se ha verificado**: nada de `excel/` se ha ejecutado dentro de
    Excel todavía — el usuario aplazó esa parte. Los tres puntos donde puede
    fallar y no lo sabemos: que `application.calculate(recalculate)` dentro de
    un `Excel.run` compartido recalcule de verdad antes del `sync` (si no,
    habría que partir en dos sincronizaciones y el modo costaría el doble),
    que el modo de cálculo se pueda cambiar sin permisos extra, y **cuál es el
    ritmo real** — las ~93 iteraciones/s de la auditoría son de otro motor y
    otra máquina. `medirRitmoEnExcel` existe justamente para sustituir ese
    número supuesto por uno medido en cuanto haya Excel delante.

18. [~] **El ciclo completo y el panel del MVP (2026-09-22)** — el
    complemento deja de ser un panel de diagnóstico.

    Lo que faltaba no era motor: era la coreografía y la interfaz. Ahora se
    marcan celdas inciertas desde la selección, se les da una distribución, se
    marca lo que se quiere medir, se simula y se lee la curva.

    **`engine/modelo/eleccionMotor.ts`: decir que no puede el rápido, antes.**
    Predice cuál de los cinco rechazos del evaluador va a ocurrir —función
    desconocida, fórmula matricial, nombre sin resolver, constante matricial,
    error de sintaxis— recorriendo el subgrafo necesario para las salidas, y lo
    dice con nombre de celda. Cada caso se prueba **dos veces**: que lo señale,
    y que el evaluador de verdad falle con esa fórmula. Predecir de más manda
    al modo lento a quien no lo necesita; de menos, promete una simulación que
    va a fallar a mitad. Avisa además de una salida que no depende de ninguna
    entrada, que casi siempre es una celda mal marcada.

    **Los adaptadores que faltaban**: `almacenModelo.ts` (el `RiskModel v1`
    dentro del libro, porque el modelo es trabajo del usuario y tiene que
    viajar con el archivo), `resolverRef.ts` (direcciones y nombres definidos,
    un viaje) y `ejecutarSimulacion.ts` (la coreografía, con un tipo de error
    por cada cosa que el usuario puede arreglar).

    **El panel**: pestañas Modelo / Resultados / Diagnóstico; editor de
    distribuciones que se pinta solo desde `CATALOGO_DISTRIBUCIONES`; ajustes;
    progreso con ritmo medido y cancelación de verdad; y la curva de
    probabilidad acumulada en SVG, con cursor de lectura. La CDF y no el
    histograma porque contesta la pregunta que se hace delante de un análisis
    de riesgo —*¿qué probabilidad hay de pasarme de X?*— y porque el histograma
    por bloques sigue sin existir.

    **Un hueco real, encontrado construyendo esto: los valores estáticos del
    libro no llegaban al motor.** `construirGrafo` solo recibía fórmulas, así
    que una celda sin fórmula se evaluaba como vacía. En los tests y en el
    libro de fidelidad daba igual, porque las constantes viven dentro de las
    fórmulas; en un modelo real los datos están en celdas y las fórmulas los
    referencian, de modo que media hoja valía cero **sin avisar de nada**. El
    grafo lleva ahora el valor de las celdas sin fórmula, por los dos
    evaluadores, y una celda de verdad vacía sigue siendo vacía y no cero.

    **`ui/banco/`: un Excel de mentira.** Como la verificación en Excel está
    aplazada, el panel se desarrolla y se mira sobre un libro falso servido en
    `/banco/`. Se ha ejecutado el ciclo completo en un navegador real, con los
    dos motores: 10.000 iteraciones por el rápido en 26 ms y 1.000 por el
    compatible, **con la misma mediana** (71,2 mil) — que es la comprobación
    que valida que las dos rutas simulan el mismo modelo con la misma semilla.
    El banco dice de sí mismo lo que **no** puede probar: como sus propiedades
    están disponibles sin esperar al `sync()`, no caza un `load` sin su `sync`,
    que es el error más típico de Office.js.

    **Dos decisiones de producto que se ven:**
    - La distribución que se propone al marcar una celda va **alrededor del
      valor que ya tiene** (triangular de ±10 %). Proponer (0; 1; 2) sobre una
      celda que vale 1.200 obliga a borrar tres campos antes de poder pensar.
    - **No hay botón de guardar.** Cada cambio confirmado va al libro; un panel
      que se cierra sin querer no debe poder perder el trabajo de nadie. Y un
      modelo guardado que no se entiende no se pisa en silencio: se enseña el
      problema y el JSON crudo.

    **Lo que sigue sin verificarse**: todo `excel/` dentro de Excel. Y el panel
    no edita todavía las **correlaciones**, que el motor sí sabe aplicar
    (Iman–Conover, `engine/modelo/correlaciones.ts`): hoy solo se pueden
    declarar editando el JSON del modelo a mano.

19. [~] **Verificación en Excel, resaltado y libro de demostración (2026-09-22)**

    La tercera tanda del libro de fidelidad volvió calculada por el Excel real
    del usuario: **87 de 89**. Los dos fallos y lo que enseñan están en el
    CHANGELOG; lo que importa aquí es que **`TIR`, `VAN`, `TIR.NO.PER`, toda la
    familia de préstamos y todas las búsquedas están ahora verificadas contra
    Excel**, no contra mi lectura de la documentación.

    **Resaltado en la hoja** (`excel/resaltado.ts`). Sin él, el modelo solo
    existía en el panel: se marcaba `C5` como entrada y la hoja no se enteraba.
    Ahora las entradas se pintan de amarillo y las salidas de verde —el
    convenio de décadas en modelización financiera— y el relleno anterior de
    cada celda se guarda **en el propio libro**, de modo que quitar el
    resaltado la deja exactamente como estaba, incluido "sin relleno", que no
    es lo mismo que blanco. No se tocan bordes ni fuentes: restaurarlos
    fielmente exigiría guardar ocho propiedades por celda y el relleno se ve
    igual de bien.

    **Libro de demostración** (`ejemplos/generar-demo.py` →
    `demo-proyecto-aurora.xlsx`). Probar sobre un libro real del usuario mezcla
    dos incógnitas —¿falla el complemento o falla el modelo?— y obliga a tocar
    un archivo que le importa. Este lo conocemos los dos: una empresa ficticia
    con precio, unidades, crecimiento, costes, amortización, impuestos y valor
    residual, sin una sola función rara, con una hoja de instrucciones que dice
    qué celdas marcar y **qué resultado debería salir**.

    **Un fallo real que destapó la demo, y que era el hueco más viejo
    documentado del proyecto.** Con la `TIR` como salida, unas 3 de cada 1.000
    iteraciones dan `#¡NUM!` —un flujo que no cambia de signo no tiene tasa— y
    **un solo `NaN` dejaba la media, la desviación y todos los percentiles en
    `NaN`**. Es el hueco que `aBufferNumerico` documentaba desde el canal de
    valores y que se había aplazado a E6 por tocar el formato que viaja entre
    workers. La demo lo convirtió en un "sin datos" en la pantalla, así que se
    arregló: `ParcialSalida` gana `noNumericas`, el conteo se suma bloque a
    bloque y el panel lo enseña. Los dos motores lo cuentan igual, y el caso
    normal —ninguna mala— no paga ni una copia de buffer.

    **Pedido por el usuario y no hecho todavía**: botones en la cinta de Excel
    (pestaña Riesgo) que abran directamente Modelo, Resultados o Diagnóstico.
    Hoy la cinta solo abre el panel. Exige tocar el manifiesto, añadir iconos y
    un comando por botón; está anotado a petición suya para más adelante.

20. [~] **Correlaciones en el panel (2026-09-23)** — y el ciclo completo
    verificado dentro de Excel.

    **El libro de demostración corrió en el Excel del usuario**: motor rápido,
    100.000 iteraciones en **394 ms**, el resaltado puesto, y un VAN de media
    260.614 € con p5 -664.113 €. Prácticamente los mismos números que en la
    nube; la diferencia son los identificadores aleatorios de cada entrada, no
    el modelo. El producto funciona de punta a punta en Excel real.

    **Las correlaciones dejan de ser inalcanzables.** Iman–Conover está desde
    la Fase 2 y solo se podía usar editando el JSON a mano. Ahora hay un
    deslizador y un número por pareja dentro de la ficha de cada entrada, con
    la traducción a palabras debajo. La simetría **se escribe**: cada cambio
    toca las dos entradas, de modo que la contradicción no se puede teclear.

    Y dos fallos que aparecieron justo al hacer alcanzable la capacidad:
    - Una matriz imposible (A con B, B con C, A al revés que C) reventaba a
      mitad de la simulación con una excepción de Cholesky. Ahora
      `agruparCorrelaciones` la rechaza antes de empezar, nombrando a los
      implicados; el criterio lo comparte con Iman–Conover
      (`esDefinidaPositiva`), así que no pueden discrepar.
    - Quitar una entrada dejaba correlaciones apuntando a un identificador que
      ya no existía, y el modelo dejaba de poder guardarse con un mensaje sobre
      un id que el usuario nunca ha visto.

    **Lo que sigue sin medirse**: el ritmo del modo compatible en una máquina
    real. Es la última incógnita de la fase de pruebas y no se puede contestar
    desde aquí.

21. [x] **El modo compatible, medido (2026-09-23)** — se cierra la última
    incógnita de la fase de pruebas.

    **33 iteraciones por segundo**: 10.000 iteraciones en 5 min 4 s, Excel de
    escritorio en Windows, modelo de 63 celdas. La auditoría del motor heredado
    suponía ~93 y era casi tres veces optimista. Las otras dos preguntas
    abiertas del modo quedan contestadas de paso: **Excel recalcula de verdad
    antes del `sync`** (si no, los resultados no variarían) y **el cambio a
    cálculo manual funciona** sin permisos extra. Las tres se documentaron como
    riesgos al construir el modo; ninguna se ha materializado.

    | iteraciones | motor rápido | compatible |
    |------------:|-------------:|-----------:|
    |      10.000 |        40 ms |      5 min |
    |     100.000 |       400 ms |     51 min |
    |   1.000.000 |         ~4 s |      8,4 h |

    **Lo que obligó a cambiar.** Un millón de iteraciones en modo compatible es
    una jornada entera de espera, y hasta ahora el panel ofrecía el mismo
    desplegable en los dos motores sin decir nada. Ahora, al elegir el motor
    compatible, se enseña **antes de simular** el ritmo medido y lo que va a
    tardar, con un aviso explícito si pasa de media hora. Si el libro no se ha
    medido, un botón lo mide en segundos corriendo unas pocas iteraciones de
    verdad, y el resultado se guarda en el libro (`excel/ritmo.ts`): es una
    propiedad de este modelo en esta máquina.

    `medirRitmoEnExcel` existía desde que se construyó el modo compatible y no
    estaba conectado a nada. Esta era su razón de ser.

22. [~] **Resultados guardables, y Nivel 2 (2026-09-23)**

    **Volcado a una hoja** (`excel/volcarResultados.ts`): el informe entero con
    el modelo, la semilla, el motor, los estadísticos, los percentiles y los
    puntos de la curva como datos, con un gráfico nativo de Excel encima. La
    parte pura (`excel/informe.ts`) se prueba en Node.

    **El modelo que no sobrevivió a cerrar y reabrir** sigue sin causa
    conocida. Son dos pasos y solo uno es nuestro: el complemento escribe el
    ajuste, y Excel lo mete en el `.xlsx` cuando el usuario guarda. Para
    convertir la próxima vez en un dato: el panel dice "guardado a las hh:mm",
    `guardarModelo` relee lo escrito y avisa si no vuelve, y Diagnóstico enseña
    en crudo los ajustes del libro.

    **Nivel 2: 27 de 41.** Texto (25), `SUBTOTALES` y `AGREGAR`. La trampa de
    estas dos es el doble conteo de los subtotales intermedios; se resuelve con
    una marca en un `WeakSet` que el ejecutor hereda al difundir constantes.
    Fuera a propósito: `TEXTO` (configuración regional), las matriciales
    dinámicas (otro modelo de celda), `LET`/`LAMBDA` (ámbitos en el
    evaluador), y dos que dependen de estructuras que no se leen.

    **Cuarta tanda de fidelidad**, 90 casos, esperando volver de Excel. Los 90
    se pasaron por el motor antes de enviarla y coinciden con sus notas.

23. [x] **Cuarta tanda verificada, configuración regional y `TEXTO` (2026-09-23)**

    **La cuarta tanda volvió de Excel con 87 de 90**, y los tres que no
    coincidieron eran justo los tres sondeos de configuración regional puestos
    a propósito. Ningún fallo del motor en el Nivel 2. Un cuarto desajuste
    aparente (`UNIRCADENAS`) era del lector del libro de fidelidad, que perdía
    los textos terminados en espacio (`<v xml:space="preserve">`).

    **La configuración regional** (`engine/values/regional.ts`,
    `excel/regional.ts`): separador decimal, de miles y nombres de los lógicos,
    leídos de Excel (no deducidos del idioma), guardados con el modelo y
    transportados a los workers. Es un ajuste de módulo, con su coste pagado y
    probado con `worker_threads` reales. **Los cuatro casos pendientes por esto
    —N1-049, T4-013, T4-052, T4-072— pasan ahora contra los valores de Excel**,
    porque los libros de fidelidad se evalúan en español, que es como los
    calculó el Excel del usuario.

    **`TEXTO`**, que dependía de ella. Con él el Nivel 2 de texto está completo.
    Quinta tanda de fidelidad (36 casos) esperando a Excel.

24. [x] **Quinta tanda verificada y resto del Nivel 1 (2026-09-23)**

    **La quinta tanda (`TEXTO`) volvió con 32 de 36**; las cuatro diferencias
    eran tres suposiciones sobre el Excel en español (`aaaa` es el día de la
    semana, una letra que no es código da `#¡VALOR!`, AM/PM es `p. m.` con
    espacio duro). Corregidas: 36/36.

    **Resto del Nivel 1: 11 de las 12 que faltaban.** `MAX.SI.CONJUNTO` y
    `MIN.SI.CONJUNTO` (`condicionales.ts`), `SI.CONJUNTO` y `CAMBIAR`
    (`logic.ts`), `BUSCAR` en sus dos formas (`busquedas.ts`) y las de
    calendario en un módulo propio, `calendario.ts`: `DIAS360` (método
    estadounidense y europeo), `FRAC.AÑO` (bases 0–4), `SIFECHA` (con el fallo
    de `"MD"` reproducido), `DIA.LAB`, `DIAS.LAB` y `FECHANUMERO` (orden
    día/mes según el idioma, nombres de meses en español e inglés).

    **`DESREF` se queda fuera a propósito**: devuelve una referencia que
    depende de sus argumentos, así que el grafo de dependencias deja de ser
    fijo. Con desplazamientos constantes se podría resolver al compilar; con
    desplazamientos que cambian por iteración es trabajo del modo compatible.
    `catalogoVsRegistro.test.ts` lo deja como único pendiente del Nivel 1.

    **Sexta tanda de fidelidad: 69 de 69 contra Excel a la primera.** Casi la
    mitad son bordes de calendario (fin de febrero, días 31, bisiestos) y
    sondeos de `FECHANUMERO` en español. Confirmó también la regla de las
    letras de `TEXTO` que la quinta tanda dedujo de un solo caso.

25. [x] **Tornado de sensibilidad y persistencia confirmada (2026-09-24)**

    **El modelo sí sobrevive a guardar, cerrar y reabrir**: el usuario lo
    comprobó en su Excel con el diagnóstico de ajustes guardados. Cerrado.

    **Análisis de sensibilidad** (`engine/stats/sensibilidad.ts`): Spearman por
    rangos con empates repartidos, y un peso ρ² normalizado que se presenta
    como aproximado. Los dos motores retienen las primeras
    `LIMITE_MUESTRA_SENSIBILIDAD` (100.000) iteraciones de cada salida
    (`retenerMuestra`); las entradas no se guardan, se regeneran con el mismo
    generador de contador. Se muestra como tornado en HTML debajo de cada
    salida (`ui/Resultados.tsx`) y se escribe en la hoja al volcar. Colores de
    polaridad validados para daltonismo en claro y oscuro.

    **Límite conocido**: el peso reparte mal el mérito entre entradas
    correlacionadas entre sí; ρ sigue siendo correcto. La contribución a la
    varianza por regresión (la de @RISK) queda para después.

26. [x] **Histograma, umbrales y botones en la cinta (2026-09-24)**

    `engine/stats/muestra.ts`: la muestra retenida se ordena una vez; de ahí
    salen el histograma (Freedman–Diaconis, 10–50 barras) y
    `probabilidadUmbral` (estricta en los dos sentidos: un VAN de 0 no es una
    pérdida). El umbral vive en el modelo (`SalidaRiskModel.threshold`,
    opcional y validado) y en el informe volcado, con su gráfico de columnas.

    **Cinta**: tres botones `ShowTaskpane` con el mismo `TaskpaneId` y URL con
    fragmento (`#modelo`, `#resultados`, `#diagnostico`). El panel lee el
    fragmento al abrir, escucha `hashchange` y reescribe el fragmento con
    `replaceState` al cambiar de pestaña a mano, para que el siguiente botón
    siempre cambie la URL. **Sin verificar en Excel real**: si Office no
    vuelve a navegar un panel ya abierto con el mismo `TaskpaneId`, el botón
    solo sirve para abrirlo; la alternativa es un runtime compartido
    (`Office.addin.showAsTaskpane`), más pesado.

27. [x] **Varios hilos y resultados guardados (2026-09-24)**

    **Hilos** (`engine/executor/pool.ts`, `ui/motor/`): protocolo propio del
    motor —`iniciar` una vez por hilo con el modelo, luego solo rangos—, sin
    nombrar ninguna API de hilos; el panel lo monta sobre Web Workers (núcleos
    − 1, máximo 8) y `excel/ejecutarSimulacion.ts` lo recibe inyectado
    (`crearPool`). Troceo fijo (`bloquesMinimos: 16`) para que el resultado no
    dependa del número de núcleos; probado bit a bit contra el secuencial. Si
    no hay hilos o uno no arranca, se repite en el hilo del panel. Medido en
    Chromium (4 núcleos, modelo de 7 celdas, 1 M iteraciones): 969 → 715 ms.

    **Resultados guardados** (`excel/resultadosGuardados.ts`, puro): todo lo
    que enseña el panel más 1.001 cuantiles por salida en vez de la muestra;
    huella FNV-1a del modelo (sin umbrales) para marcar resultados
    desactualizados. `riesgoMontecarlo.results` en `workbook.settings`.

28. [x] **Panel de Configuración (2026-09-24)**, pedido por el usuario:
    núcleos por equipo (`ui/motor/preferencias.ts`, `localStorage`),
    iteraciones libres, y precisión en el modelo (`settings.convergence`:
    `target`, `untilConverged`, `maxIterations`). "Hasta alcanzar la
    precisión" repite la simulación completa con más iteraciones
    (`siguienteTanda`: lo que falta +10 %, mínimo ×1,5, tope, máx. 5 tandas);
    no se aplica con el motor compatible.

**Siguiente acción al retomar**, en orden de valor:

1. **Probar en Excel**: Configuración (núcleos, tandas), tornado, histograma, umbral, botones de la cinta con
   el panel abierto, hilos (¿"3 hilos" en Cómo se calculó?) y resultados tras
   cerrar y reabrir (recargar el manifiesto: `npm run stop` y `npm start`).
2. **Las tres fórmulas matriciales de `Caso_practico.xlsx`** (el usuario las
   manda) y **la séptima tanda (`LET`)** de vuelta de Excel. `LET` ya está
   hecho (sustitución al parsear, `engine/parser/let.ts`).
3. E7 completa: convergencia (`engine/stats/convergencia.ts`), escenarios
   (`excel/comparacion.ts`) y ajuste a datos (`engine/modelo/ajuste.ts`,
   `ui/AjusteDatos.tsx`). Siguiente bloque grande: funciones `RISK.*` en
   celdas (E4) o matriciales dinámicas (N2).
4. **`DESREF` con desplazamientos constantes**.

### Estado del árbol tras E0–E2 (completa) y el arranque de E3

- `engine/` — motor nuevo, **completo para Nivel 0**. Contiene el PRNG Philox
  basado en contador (`random/`), el parser de fórmulas (`parser/`), el
  grafo de dependencias (`graph/`), el registro de funciones vectorizadas
  (`functions/`, con el Nivel 0 completo, las funciones de tipo y el Nivel 1
  de criterios), **el canal de valores (`values/`: los cinco tipos de celda de
  Excel)**, el evaluador de referencia y el compilador optimizado
  (`compiler/`), las distribuciones (`distributions/`, con su forma
  serializable en `descriptor.ts`), el muestreo (`sampling/`), las
  estadísticas de salida (`stats/`), el ejecutor por bloques (`executor/`), el
  formato `RiskModel v1` (`modelo/`, parte de E3, ver arriba) y el **modo
  compatible** (`compatible/`: el bucle con Excel dentro, puro y probado sin
  Excel tras la interfaz `LibroCalculable`).
- `tests/fixtures/fidelidad.xlsx` — el libro de fidelidad, calculado en Excel
  real. `tests/helpers/leerFidelidad.ts` lo lee. `tests/helpers/poolNodeWorkers.ts`
  y `workerCalcularBloque.ts` son el pool de `worker_threads` que prueba el
  paralelismo real del ejecutor por bloques.
- `bench/motor.ts` — el benchmark reproducible (`npm run bench`).
- `excel/` — la capa de Office.js: entorno, selección, lector del libro en
  lote, informe de compatibilidad, el adaptador del modo compatible
  (`libroCalculable.ts`, `simulacionCompatible.ts`) y el `AlmacenGuardian`
  real (`almacenGuardian.ts`). **Nada de esta carpeta se ha ejecutado dentro
  de Excel más allá del panel de diagnóstico** (ver punto 17).
- `ui/` — el panel React (Modelo / Resultados / Diagnóstico), servido por Vite
  desde `ui/` como raíz. `ui/banco/` es el banco de pruebas con un Excel de
  mentira, en `/banco/`: sirve para desarrollar la interfaz sin Excel y dice de
  sí mismo lo que no puede probar.
- `ejemplos/` — el libro de demostración y su generador.
- `tests/unit/` — Vitest. **841 tests en verde**, 2 saltados y documentados
  por id (`PENDIENTES` de la segunda tanda de fidelidad), ninguno oculto.
- `legacy/` — código heredado congelado, **fuera de build, lint y tests**. Ver `legacy/README.md`.
- `npm run build` es `tsc -b && vite build` desde E3.
- `manifest.xml` en la raíz está **reescrito** (Id nuevo, `<Requirements>` declarado, sin funciones personalizadas todavía) y **sideloadeado con éxito** en el Excel del usuario: Windows, 16.0.20326.20144, es-ES, `ExcelApi` hasta 1.12.
- CI en GitHub Actions (`.github/workflows/ci.yml`): tipos + lint + tests en cada push a `main` y `develop`.

---

## 10. Cambio de destino: de herramienta personal a producto (2026-09-15)

La decisión D2 original decía "equipo personal". **Ya no es cierta.** El usuario va a
distribuir el complemento a más de 100 personas y quiere venderlo o publicarlo.

Este apartado existe porque el cambio invalida supuestos anteriores y cualquiera que
retome el proyecto debe leerlo antes que el resto.

### 10.1 Qué invalida

| Supuesto anterior | Estado |
|---|---|
| Sideload personal, sin hosting | **Muerto.** Hace falta hosting HTTPS permanente; `localhost:9090` solo sirve para desarrollo |
| "El alcance del motor se define por los libros del usuario" | **Muerto.** Los usuarios traerán funciones que nadie ha previsto. Los libros propios son el suelo, no el techo |
| Modo compatible aplazado a la V1 | **Invertido.** Entra en el MVP |
| Mac "deseable" | **Obligatorio y bloqueante** si se declara en el manifiesto. Microsoft valida lo que declaras |
| Formato `RiskModel` libre de cambiar | Libre **hasta la primera versión pública**. Después, cada cambio necesita migración |

### 10.2 Qué NO cambia

- **El cálculo sigue siendo 100 % local.** Los datos del libro no salen del equipo del
  usuario. Alojar el complemento en una URL solo significa que se descarga el programa,
  como una página web.
- La arquitectura del motor (vectorizado, fuera del ciclo de recálculo) es exactamente
  la misma. Si acaso, con usuarios variados importa aún más.

### 10.3 Tensión que hay que resolver antes de publicar

Un producto de pago suele necesitar comprobar la licencia contra un servidor, al menos
una vez. Eso choca con la promesa "no se conecta a Internet". Se puede resolver con
activación única o licencia firmada offline, pero **hay que decidir qué se promete
exactamente**, porque acaba escrito en la ficha del producto y en la política de
privacidad. Pendiente de decisión del usuario.

### 10.4 Trabajo nuevo que antes no existía

Técnico: hosting y despliegue, internacionalización (mínimo es/en), versionado estricto
del formato guardado, compatibilidad hacia atrás, mensajes de error pensados para alguien
que no conoce el producto, telemetría opcional y explícita (nunca datos del libro).

No técnico, y responsabilidad del usuario: cuenta de Partner Center, política de
privacidad y condiciones de uso publicadas, canal de soporte, modelo de precios, y
revisión de marca. **Aviso:** "@RISK" es marca registrada de Lumivero; el prefijo de
funciones `RISK.` no debería ser problema, pero el nombre comercial y el material de
marketing sí deben revisarse.
