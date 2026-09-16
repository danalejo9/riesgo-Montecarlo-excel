# Estado del proyecto y traspaso de contexto

**Última actualización:** 2026-09-15
**Fase actual:** Fase 1 (Auditoría) COMPLETADA. Fase 2 (Arquitectura) BLOQUEADA a la espera de un dato.
**Documento hermano:** [`FASE1_AUDITORIA_TECNICA.md`](FASE1_AUDITORIA_TECNICA.md) — diagnóstico completo con evidencia y benchmarks.

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
| 3 | Qué funciones de Excel usan sus modelos | **No lo sabe** | Pendiente de medir. Ver §5 |
| 4 | ¿Motor rápido con cobertura parcial + fallback? | Pidió recomendación → **se recomendó el híbrido** (pendiente de confirmación explícita) | Ver §4 |
| 5 | Git / GitHub | Pidió recomendación; **no tiene ningún repositorio** en GitHub | Ver §6 |

### Consecuencia arquitectónica principal

Al exigirse Mac, el camino nativo queda eliminado. **Solo queda una vía viable** para alcanzar 100k–1M iteraciones: **evaluar el modelo fuera del ciclo de recálculo de Excel**, en un motor propio vectorizado (TypeScript sobre `Float64Array`, Web Workers para paralelismo real, y Rust→WASM solo si los benchmarks lo justifican). Ya no es una opción entre varias.

Nota de diseño derivada: las funciones `=RIESGO.X()` en celdas deben servir para **declarar** la distribución (autodocumentan el modelo, como en @RISK), **no** como mecanismo de muestreo masivo. El motor lee la declaración y muestrea fuera de Excel.

---

## 4. Arquitectura híbrida recomendada (pendiente de confirmar)

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

## 5. BLOQUEANTE ACTUAL: medir los modelos reales

La Fase 2 no debe cerrarse por intuición. Falta saber qué funciones de Excel usan los modelos reales del usuario, porque determina la viabilidad y el alcance del motor rápido.

Dos caminos ofrecidos al usuario (elige él):

- **(A)** El usuario da la ruta de 1–3 libros representativos → se analizan y se devuelve el inventario exacto: funciones usadas, número de fórmulas, tablas, matrices dinámicas, VBA, Power Query, y qué porcentaje cubriría el motor rápido.
- **(B)** Si prefiere no compartir libros con datos sensibles, el **primer entregable de la Fase 4** es un escáner de compatibilidad que corre en su máquina y no envía nada.

**Siguiente acción al retomar:** preguntar por cuál de los dos opta, y ejecutarlo.

---

## 6. Control de versiones: recomendación pendiente de autorización

Situación: **no hay Git** en ninguna de las dos carpetas. La única copia de seguridad es una carpeta duplicada. Antes de la Fase 4 esto es un riesgo serio.

Plan recomendado:

1. `git init` en `Riesgos_cuantificables` + commit inicial **del estado heredado tal cual** (congela la evidencia de la auditoría antes de modificar nada).
2. Repositorio **privado nuevo** en GitHub — el usuario no tiene ninguno. Nombre sugerido: **`riesgo-montecarlo-excel`**.
3. `main` solo para versiones etiquetadas (SemVer), `develop` para el trabajo diario, `CHANGELOG.md`, Issues como roadmap.
4. `.gitignore` actual ya excluye `node_modules` y `dist` (correcto). No hay secretos en el código.

Detalle práctico: **`gh` (GitHub CLI) no está instalado** en este equipo (`git` sí, 2.55.0). Opciones: instalarlo con `winget`, o que el usuario cree el repo vacío desde la web y se conecte el remoto (más rápido, no instala nada).

**No ejecutado aún: requiere autorización explícita del usuario.**

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

1. [ ] Resolver el bloqueante de §5 (ruta de libros reales, o escáner como primer entregable).
2. [ ] Confirmar la arquitectura híbrida de §4.
3. [ ] Autorizar Git/GitHub de §6 y ejecutarlo.
4. [ ] **Fase 2 — Propuesta de arquitectura**: arquitectura objetivo, tecnologías, motor, comunicación con Excel, sistema de gráficos, distribuciones, funciones, estrategia de rendimiento, de pruebas y de versionado, con las alternativas descartadas y por qué.
5. [ ] **Fase 3 — Roadmap** por etapas (MVP → V1 → …).
6. [ ] **Fase 4 — Implementación** en cambios pequeños y verificables, con pruebas y benchmarks tras cada bloque importante.
