# Estado del proyecto y traspaso de contexto

**Última actualización:** 2026-09-15
**Fase actual:** Fases 1 y 2 COMPLETADAS Y APROBADAS. **Fase 3 (Roadmap) ENTREGADA, pendiente de aprobación.** Después empieza la implementación (Fase 4, etapa E0).
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
| 2 | Distribución | Equipo **personal** | Sin catálogo de organización ni hosting corporativo. Sideload en Windows, carpeta compartida en Mac |
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
11. [ ] E2 en adelante, según [`FASE3_ROADMAP.md`](FASE3_ROADMAP.md).

**Siguiente acción al retomar:** empezar E1 (escáner de compatibilidad).

### Estado del árbol tras E0

- `engine/` — motor nuevo. Ya contiene el PRNG Philox basado en contador.
- `tests/unit/` — Vitest. 16 tests en verde.
- `legacy/` — código heredado congelado, **fuera de build, lint y tests**. Ver `legacy/README.md`.
- `npm run build` es solo `tsc -b`: no hay `vite build` hasta E3, cuando se reconstruyan los puntos de entrada HTML.
- CI en GitHub Actions (`.github/workflows/ci.yml`): tipos + lint + tests en cada push a `main` y `develop`.
