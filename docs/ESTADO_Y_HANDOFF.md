# Estado del proyecto y traspaso de contexto

**Última actualización:** 2026-09-16
**Fase actual:** Fases 1, 2 y 3 aprobadas. Implementación en curso: **E0, E1 y E2 terminadas; E3 empezada** (formato `RiskModel v1`, la parte que no necesita Excel — ver §9.12). El resto de E3 necesita Excel de verdad.
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
| 3 | Qué funciones de Excel usan sus modelos | **No lo sabe, y decide NO medirlo ahora** | Se asume un catálogo típico de presupuestos (§4.2 de Fase 2). El escáner de compatibilidad pasa a ser el primer entregable de la Fase 4. Ver §5 |
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

## 5. Medición de los modelos reales — APLAZADA (supuesto vivo)

El usuario decidió **no medir** sus libros por ahora. Consecuencia: el alcance del motor rápido se ha definido sobre un **catálogo supuesto** de funciones típicas de presupuestos (§4.2 de la Fase 2), no sobre datos.

Esto es un supuesto explícito, no un olvido. Hay que vigilarlo:

- Si los modelos reales usan funciones fuera del Nivel 1, **no se rompe nada**: caen al modo compatible. Pero la promesa de velocidad no se cumpliría para esos modelos.
- Por eso el **escáner de compatibilidad es el primer entregable de la Fase 4**: corre en la máquina del usuario, no envía nada, y convierte el supuesto en dato antes de que corregirlo sea caro.
- En cuanto haya resultados del escáner, revisar el §4.2 de la Fase 2 y ajustar el alcance.

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
- Sideload registrado en `HKCU\SOFTWARE\Microsoft\Office\16.0\WEF\Developer` apuntando a **la carpeta antigua** (`Documents\1 complemento sensibilidad`), no a esta. Hay que re-registrar cuando se empiece a probar en Excel desde esta carpeta.
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
       calculados en Excel real, 25 verificados exactos, 6 documentados por
       id como pendientes con motivo (`PENDIENTES` en
       `tests/unit/fidelidad.test.ts`) — tres por el canal de texto que no
       existe todavía, y **dos hallazgos nuevos**: `AVERAGE` no distingue una
       celda vacía de un cero en su denominador. No se corrigen ahora: la
       corrección de fondo (canal de vacío/texto/error completo) toca todo
       `engine/functions/` y es un cambio más grande, para cuando le
       corresponda.
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

    Empezada por la parte que **no** necesita Excel: `engine/modelo/`
    (formato `RiskModel v1`, validación, agrupación de correlaciones,
    conversión a las entradas del ejecutor — ver `CHANGELOG.md`). Sigue
    siendo código de `engine/`, probado en Node, sin Office.js.

    **Decisión propia sin confirmar, revisar antes de seguir**: el campo
    `dist` de `RiskModel` reutiliza `DescriptorDistribucion` con sus nombres
    en español (`tipo`, `moda`), no las claves en inglés del boceto de Fase 2
    §7.2 (`type`, `mode`). Es un cambio de nombres, no de forma, pero
    conviene decidirlo antes de que el formato quede persistido de verdad en
    algún libro — después de la primera versión pública, cambiarlo exige una
    migración (E10).

    Todo lo que sigue **sí** necesita Excel de verdad y no se puede avanzar
    más en la nube:
    - **Adaptadores Office.js**: lector del grafo en lote (fórmulas,
      precedentes) y escritor de resultados. No existen todavía.
    - **`resolverRef`**: `prepararEntradas` (`engine/modelo/`) ya espera esta
      función inyectada (rango con nombre → clave de celda); implementarla de
      verdad es Office.js puro.
    - **Guardián transaccional** (Fase 2 §7.3): snapshot del modo de cálculo
      y las entradas antes de simular, restauración si el panel se cierra a
      mitad. Necesita `workbook.settings` real para probarse.
    - **Panel React**, informe de compatibilidad integrado, resultados
      (histograma, CDF).

**Siguiente acción al retomar:** lo que se podía adelantar sin Excel
(`engine/modelo/`) ya está. Lo que sigue de E3 —adaptadores Office.js,
guardián transaccional, panel— necesita Excel de verdad (Windows, el entorno
verificado en §7) para probarse; no tiene sentido escribirlo a ciegas sin
poder hacer sideload. Antes de seguir, hay que resolver con el usuario: (a)
si tiene acceso a un entorno con Excel para probar, y (b) confirmar o
cambiar la decisión de nombres de campo de `RiskModel` de arriba, antes de
que dependa de ella más código.

### Estado del árbol tras E0–E2 (completa) y el arranque de E3

- `engine/` — motor nuevo, **completo para Nivel 0**. Contiene el PRNG Philox
  basado en contador (`random/`), el parser de fórmulas (`parser/`), el
  grafo de dependencias (`graph/`), el registro de funciones vectorizadas
  (`functions/`, con `SUMPRODUCT` e `IFERROR`), el evaluador de referencia y
  el compilador optimizado (`compiler/`), las distribuciones
  (`distributions/`, con su forma serializable en `descriptor.ts`), el
  muestreo (`sampling/`), las estadísticas de salida (`stats/`), el
  ejecutor por bloques (`executor/`) y el formato `RiskModel v1`
  (`modelo/`, parte de E3, ver arriba).
- `tests/fixtures/fidelidad.xlsx` — el libro de fidelidad, calculado en Excel
  real. `tests/helpers/leerFidelidad.ts` lo lee. `tests/helpers/poolNodeWorkers.ts`
  y `workerCalcularBloque.ts` son el pool de `worker_threads` que prueba el
  paralelismo real del ejecutor por bloques.
- `tests/unit/` — Vitest. 280 tests en verde, 6 documentados como pendientes.
- `legacy/` — código heredado congelado, **fuera de build, lint y tests**. Ver `legacy/README.md`.
- `npm run build` es solo `tsc -b`: no hay `vite build` hasta E3, cuando se reconstruyan los puntos de entrada HTML.
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
