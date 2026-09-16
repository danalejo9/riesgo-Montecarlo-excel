# FASE 1 — Auditoría técnica del complemento de simulación Monte Carlo

Fecha: 2026-09-15
Alcance: carpeta `Riesgos_cuantificables` (copia idéntica de `C:\Users\danal\Documents\1 complemento sensibilidad`).
Método: lectura completa del código fuente (~4.700 líneas), compilación con las herramientas del proyecto, validación del manifiesto con `office-addin-manifest`, inspección de la caché de complementos de Office, contraste con la documentación oficial de Microsoft y dos benchmarks ejecutados realmente (no estimados).

No se ha modificado ningún archivo del proyecto. Lo único añadido es este documento en `docs/`.

---

## 1. Resumen del proyecto

Es un **Office Add-in para Excel** (web add-in, no XLL ni VBA) generado a partir de la plantilla `React + TypeScript + Vite`, con Office.js. Consta de:

| Parte | Archivo(s) | Líneas | Estado |
|---|---|---|---|
| Panel de tareas (UI React) | `src/App.tsx`, `src/components/*` | ~2.250 | Funciona parcialmente |
| "Motor" de simulación | `src/services/excelService.ts` (`runMonteCarloSimulation`) | 716 | Funciona, pero con Excel dentro del bucle |
| Distribuciones / estadística | `src/utils/mathUtils.ts`, `src/utils/statistics.ts` | 796 | Funciona, con errores matemáticos |
| Funciones personalizadas de Excel (`=RIESGO.*`) | `src/functions.ts`, `public/functions.js`, `public/functions.json` | ~280 | **No funcionan** (causa raíz identificada, §5) |
| Comandos de cinta (ribbon) | `src/commands.ts`, `commands.html`, `manifest.xml` | 207 + 371 | Funciona parcialmente |
| Diálogo "Entrada rápida" | `src/dialog.tsx` | 126 | Funciona (subconjunto de distribuciones) |

No existe: repositorio Git, pruebas (0 tests), CI, documentación técnica (el `README.md` es el de la plantilla de Vite), empaquetado para distribución (todas las URLs del manifiesto apuntan a `https://localhost:9090`).

---

## 2. Arquitectura actual

### 2.1 Tecnologías

- **Lenguaje:** TypeScript 6 / React 19 / Vite 8 (rolldown).
- **Integración Excel:** Office.js (`@types/office-js`), manifiesto XML *add-in only* (`VersionOverridesV1_0`).
- **Gráficos:** SVG dibujado a mano en `ResultsDashboard.tsx` (histograma, CDF, tornado); `recharts` solo en `FittingTool.tsx`.
- **Exportación:** `jspdf` + `html2canvas` (PDF), escritura de hojas de reporte con Office.js.
- **Persistencia:** `workbook.settings["MonteCarloConfig"]` (JSON con entradas/salidas/ajustes) + rangos con nombre ocultos (`input_<ts>`, `output_<ts>`) para seguir celdas si el usuario mueve filas.
- **Servidor de desarrollo:** Vite en `https://localhost:9090` con certificados de `office-addin-dev-certs`.
- **Dependencias externas en tiempo de ejecución:** `office.js` desde CDN de Microsoft (obligatorio) y **Google Fonts** (`index.html:11-13`, innecesario y contrario al requisito de ejecución local).

### 2.2 Runtimes (según manifiesto)

El manifiesto **no declara runtime compartido** (`<Runtimes>` ausente, sin `SharedRuntime`). Por tanto, según la documentación de Microsoft, en Excel para Windows hay hasta cuatro procesos independientes que **no comparten memoria**:

1. Panel de tareas (`index.html`) — runtime de navegador (WebView2).
2. Comandos de cinta (`commands.html`) — runtime de navegador, efímero.
3. Funciones personalizadas — **runtime JavaScript-only** (sin DOM, sin `window`, sin `localStorage`), que carga **únicamente** el archivo `<Script>` del manifiesto (`/functions.js`).
4. Diálogo (`dialog.html`).

El código, sin embargo, está escrito como si existiera un runtime compartido (`src/main.tsx:5` — *"Register Custom Functions for Shared Runtime"*). Es un supuesto falso.

### 2.3 Flujo de la simulación (el punto crítico)

`runMonteCarloSimulation` (`src/services/excelService.ts:301-537`):

```
Para cada iteración i (hasta 50.000, tope de la UI):
   ├─ escribir 1 celda por entrada (range.values = [[muestra_i]])
   ├─ context.workbook.application.calculate(Full)   ← recálculo COMPLETO del libro
   └─ copiar cada salida a una hoja oculta MCTemp_*  (copyFrom)
   cada 250 iteraciones: await context.sync()  + setTimeout(10 ms)
Al final: leer la hoja oculta, borrar la hoja, restaurar entradas y modo de cálculo.
```

Es exactamente el patrón `Excel → fórmula → complemento → cálculo → Excel → …` que se quería confirmar. Excel participa en **cada** iteración; el complemento solo genera los números aleatorios. Las estadísticas se calculan luego en el panel (JS), correctamente, pero sobre datos que tuvieron que salir de Excel una a una.

El documento `batching_architecture.md` presenta el batching de 250 como "simulaciones instantáneas". Reduce el overhead de red del Office.js, pero **no elimina el recálculo completo por iteración**, que es el coste dominante.

---

## 3. Funcionalidades existentes (inventario)

| # | Funcionalidad | Dónde | ¿Funciona? | Conservar / rediseñar |
|---|---|---|---|---|
| 1 | Definir variable de entrada desde celda seleccionada, 10 tipos de distribución, con valores por defecto sugeridos | `VariableConfig.tsx` | Sí (UI). Escribe `=RIESGO.X(...)` en la celda → **#¿NOMBRE?** porque las funciones no existen | Rediseñar (concepto OK, implementación acoplada a funciones rotas) |
| 2 | Definir variable de salida | `VariableConfig.tsx`, `commands.ts:addOutputQuick` | Sí | Conservar concepto |
| 3 | Rangos con nombre ocultos para seguir celdas | `excelService.ts:addNamedRange` | Sí, pero ids como `input_1717...` generan nombres `MC_input_...` inconsistentes; un `context.sync()` por variable al cargar (`App.tsx:54-61`) | Conservar idea, reimplementar en lote |
| 4 | Entrada/salida rápida desde la cinta (diálogo) | `commands.ts`, `dialog.tsx` | Parcial: el diálogo solo ofrece 6 de 10 distribuciones; usa stubs globales + `setTimeout(100)` para "rescatar" eventos (`commands.ts:189-207`), frágil | Rediseñar |
| 5 | Simulación Monte Carlo | `excelService.ts:301` | Sí hasta unos miles de iteraciones; inutilizable a 100k+ (§6) | **Reemplazar** |
| 6 | Semilla reproducible (Mulberry32) | `mathUtils.ts:79-92` | Parcial: la semilla afecta al muestreo del panel, pero **no** a las funciones `RIESGO.*` (usan `Math.random`) | Conservar idea, unificar PRNG |
| 7 | Estadísticas (media, sd, min, max, P10/50/90, histograma 20 bins) | `mathUtils.ts:analyzeResults` | Sí | Conservar lógica, mover al motor |
| 8 | Percentiles interactivos (sliders) | `ResultsDashboard.tsx` | Sí, pero recalcula/ordena todo el array en cada render (sin `useMemo`, línea 68) | Rediseñar |
| 9 | Histograma, CDF ("curva S"), tornado por correlación de Pearson | `ResultsDashboard.tsx` | Sí, SVG manual, sin ejes numéricos configurables, sin densidad, sin comparación | Rediseñar |
| 10 | Ajuste de distribuciones a datos (KS) | `statistics.ts`, `FittingTool.tsx` | Sí, con limitaciones: PERT usa la CDF triangular como proxy; parámetros por momentos, no MLE; la "empírica" siempre gana con KS = 0 por definición (`statistics.ts:328`) | Rediseñar |
| 11 | Exportar reporte a hojas de Excel (resumen + 1 hoja por variable + gráficos nativos) | `excelService.ts:exportReportToExcel` | Sí | Conservar (buena idea, integra con Excel) |
| 12 | Exportar PDF | `ResultsDashboard.tsx` (jspdf + html2canvas) | Sí; añade ~350 KB al bundle | Cuestionable; evaluar |
| 13 | Ajustes globales: iteraciones (tope 50.000), semilla, "modo estocástico/determinístico" | `SettingsPanel.tsx` | Iteraciones/semilla sí. El "modo" se guarda en `OfficeRuntime.storage` pero **nadie lo lee**: funcionalidad muerta | Eliminar/rediseñar |
| 14 | Resaltar celdas de entrada/salida | `commands.ts:highlightAllCells` | Sí; no hay "quitar resaltado" global | Conservar |
| 15 | Vista "Ver Entradas"/"Ver Salidas" + exportar listado a hoja | `ReportView.tsx` | Sí | Conservar |
| 16 | Ayuda | `HelpDocs.tsx` | Documenta `RIESGO.X(a; b)` — funciones que no funcionan | Reescribir |
| 17 | Funciones personalizadas `RIESGO.NORMAL/LOGNORMAL/UNIFORME/TRIANGULAR/PERT/BERNOULLI/POISSON/BINOMIAL` | `functions.ts`, `functions.json` | **No** | Reconstruir desde cero (§5) |
| 18 | Modo "navegador" (mock sin Excel) | `excelService.ts` (todas las funciones) | Sí | Útil para tests, mantener separado |

---

## 4. Problemas encontrados en el código

### 4.1 El proyecto no compila con su propio script

`npm run build` = `tsc -b && vite build`. **`tsc -b` falla con 10 errores** (`OfficeRuntime` no declarado en `SettingsPanel.tsx:18,19,35,36`; variable `range` usada sin asignar en `excelService.ts:186`; imports sin usar en `App.tsx:10,180`). `dist/` no pudo generarse con ese comando; se generó con `vite build` directo o a mano. ESLint reporta **55 errores** (varios `any`, hooks llamados tras `return` condicional en `ResultsDashboard.tsx:85,104`, `setState` durante el render en `ResultsDashboard.tsx:42-49`).

### 4.2 Tres versiones divergentes del mismo código de funciones

| Archivo | Contenido | Quién lo carga |
|---|---|---|
| `src/functions.ts` | 8 funciones con `Office.onReady` + polyfill falso de `CustomFunctions` | `functions.html` (solo Mac/web) y **el panel de tareas** vía `main.tsx:5` |
| `public/functions.js` | **Solo `TESTRIESGO`** (stub de depuración) | **Excel Windows** (`Functions.Script.Url` → `/functions.js`) y también `index.html:17` |
| `dist/functions.js` | 6 funciones (sin Poisson/Binomial), versión vanilla | Nadie (dist obsoleto y no reproducible) |
| `public/functions.json` vs `dist/functions.json` | Distintos (ids `UNIFORME` vs `UNIFORM`, descripciones distintas) | — |

Además `index.html` carga `/functions.js` como script clásico en el **panel de tareas**, donde `CustomFunctions` no existe → `ReferenceError` en consola en cada apertura del panel.

### 4.3 Errores matemáticos

- **PERT no es PERT** (`mathUtils.ts:130-141` y `functions.ts:33-37`): devuelve `(triangular + media + moda)/3`. Eso es una mezcla que **reduce la varianza a ~1/9** de la triangular y no tiene la forma Beta. Para análisis de riesgo esto sesga sistemáticamente los resultados hacia la moda. Debe implementarse como Beta(α, β) reescalada (α = 1 + λ(m−a)/(b−a), β = 1 + λ(b−m)/(b−a), λ = 4).
- **Lognormal ambigua**: la UI pide "Media" y "Desv. Estándar", pero el código los interpreta como μ y σ del logaritmo (`mathUtils.ts:104-106`). Un usuario que introduzca media = 1000 obtendrá `exp(1000)` = Infinity. El ajuste de distribuciones sí usa log-parámetros, por lo que "inyectar" un ajuste lognormal funciona por accidente, pero introducirlo a mano no.
- **Poisson** con algoritmo de Knuth: O(λ) por muestra y `exp(-λ)` desborda a 0 para λ > ~745 → bucle infinito potencial (`mathUtils.ts:149-158`).
- **Binomial** por n ensayos de Bernoulli: O(n) por muestra.
- **Triangular** sin validar `min < moda < max`: división por cero si `max == min`, `NaN` por `sqrt` negativo si la moda está fuera del rango.
- **Percentiles** implementados tres veces (`mathUtils.ts:238`, `ResultsDashboard.tsx:71`, `excelService.ts:552`), con la misma fórmula pero duplicadas.
- `erf` duplicado en `mathUtils.ts:308` y `statistics.ts:100`.
- **Sensibilidad**: solo correlación de Pearson lineal; sin rank (Spearman), sin regresión, sin tornado por percentiles.
- **Muestreo**: Monte Carlo simple; sin Latin Hypercube, sin correlación entre entradas, sin truncamiento, sin distribuciones Beta/Gamma/Weibull/Exponencial/Empírica continua.

### 4.4 Código muerto, duplicado o experimental

- `getExcelFormulaForDistribution` importada y no usada en `App.tsx:10`; `handleReset` sin uso (`App.tsx:180`).
- `openFittingTool` en `commands.ts:130` no está referenciado en el manifiesto.
- `MCGroupQuick.Label` y `menuFitting.*` definidos en recursos del manifiesto pero sin control asociado.
- "Modo estocástico/determinístico" (`SettingsPanel.tsx`): se persiste y nunca se consume.
- `FitResult` definida dos veces con forma distinta (`mathUtils.ts:349` y `statistics.ts:4`); `fitDistribution` (mathUtils) y `fitDistributions` (statistics) son dos implementaciones paralelas del mismo ajuste.
- Polyfill de `CustomFunctions.associate` que escribe en `window[id]` (`functions.ts:159-165`): no registra nada en Excel; solo enmascara el error.
- Rescate de eventos de cinta mediante stubs globales y `setTimeout(…, 100)` (`commands.html`, `commands.ts:189`): workaround de carrera de carga que puede perder clics.
- `dist/` completo: artefacto obsoleto no reproducible.

### 4.5 Riesgos de estabilidad y seguridad

- **Sin cancelación**: una simulación larga no puede detenerse; cerrar el panel a mitad deja el libro en modo de cálculo manual, con la hoja `MCTemp_*` creada y las celdas de entrada con valores muestreados (el `finally` no se ejecuta si el runtime muere). Corrupción del modelo del usuario.
- **Sin validación** de parámetros de distribución ni de que las celdas de salida contengan fórmulas.
- `catch(e) {}` silenciosos (`excelService.ts:195,268`).
- Nombres de hoja de reporte con `Math.random()*1000`: colisiones posibles (`excelService.ts:207`).
- Google Fonts y `office.js` desde CDN: dependencia de Internet para abrir el panel (la fuente es evitable; office.js debe venir de CDN por política de Microsoft, con caché).
- `ReadWriteDocument`: permiso correcto.
- No hay secretos en el código.

---

## 5. Por qué las funciones de Excel no funcionan (causa raíz)

Se reprodujo el diagnóstico por evidencia estática, validación oficial y caché de Office (no hace falta abrir Excel para demostrarlo; el registro nunca ocurrió).

### Evidencia

1. **La caché de registro de funciones está vacía.** `%LOCALAPPDATA%\Microsoft\Office\16.0\Wef\CustomFunctions\v1.7\` solo contiene `hostproperties.json`; no hay ninguna carpeta de funciones para el id `b5137d5a-…`. Excel **nunca registró** `RIESGO.*`. El complemento sí está registrado como panel (`Wef\AddinInfo\...\boot.json` apunta a `\\DANIELPC\Users\danal\Documents\1 complemento sensibilidad`).
2. **El validador oficial** (`office-addin-manifest validate`) concluye que el complemento puede ejecutarse en *"Excel on iPad, Excel on Mac"* — **no lista Excel en Windows ni Excel en la web**. Es el síntoma de un manifiesto de funciones personalizadas mal estructurado.
3. **Comentario de la IA anterior** en `App.tsx:199-200`: *"Use static expected values instead of custom function formulas to avoid #NAME? or #¿NOMBRE? errors"*. Ya había visto el fallo y lo evitó en lugar de arreglarlo.

### Causas (en orden de importancia; todas deben corregirse)

| # | Causa | Dónde | Efecto |
|---|---|---|---|
| C1 | El `ExtensionPoint xsi:type="CustomFunctions"` está dentro de `<DesktopFormFactor>`. Microsoft lo exige dentro de **`<AllFormFactors>`** (plantilla oficial `OfficeDev/Excel-Custom-Functions`) | `manifest.xml:37-48` | Excel Windows no activa la extensión de funciones |
| C2 | Falta el bloque `<Requirements><Sets DefaultMinVersion="1.1"><Set Name="CustomFunctionsRuntime" MinVersion="1.1"/></Sets></Requirements>` | `manifest.xml` (raíz de `OfficeApp`) | El host no reconoce que el complemento requiere el runtime de funciones |
| C3 | `Functions.Script.Url` → `/functions.js` = `public/functions.js`, que **solo registra `TESTRIESGO`**. En Windows el runtime JavaScript-only carga **solo ese archivo** (no `functions.html`) | `manifest.xml:320`, `public/functions.js` | Aunque C1/C2 se corrigieran, en Windows `NORMAL…BINOMIAL` seguirían sin asociarse → `#¡VALOR!` |
| C4 | `src/functions.ts` se compila como módulo ES (`type="module"`) dentro de `functions.html`, con `Office.onReady` y referencias a `window`. Vite no genera el bundle plano que exige el runtime JS-only | `functions.html`, `vite.config.ts` | Incluso en Mac/web la carga es frágil |
| C5 | Ninguna función es **`volatile`** en `functions.json` | `public/functions.json` | Con argumentos constantes, Excel calcularía una vez y jamás re-muestrearía (F9 no haría nada) |
| C6 | `functions.json` no se genera desde JSDoc (`@customfunction`) sino a mano, y hay dos versiones distintas | `public/`, `dist/` | Riesgo permanente de desalineación id/name/associate |
| C7 | El registro de *sideload* apunta a la otra carpeta (`1 complemento sensibilidad`) | `HKCU\...\WEF\Developer` | Los cambios en esta carpeta no llegan a Excel hasta re-registrar |

**Aspectos que NO son la causa** (descartados): idioma/separadores (Office.js `formulas` usa sintaxis en-US; la coma en `getExcelFormulaForDistribution` es correcta), tipos de datos (`number` escalar es válido), certificados (existen y son válidos), versión de Excel (16.0.20326 M365, es-ES, soporta `CustomFunctionsRuntime 1.1`).

### Conclusión sobre funciones

No es un bug puntual: la capa de funciones está **estructuralmente mal montada** (manifiesto, runtime, build y metadatos). Hay que reconstruirla siguiendo la plantilla oficial (JSDoc → `custom-functions-metadata` genera el JSON; bundle plano `functions.js` con `CustomFunctions.associate` al nivel superior; `AllFormFactors` + `Requirements`). Es un trabajo acotado (1–2 días) y de bajo riesgo si se hace desde cero.

Consideración de diseño importante para la Fase 2: las funciones `=RIESGO.X()` en celdas son útiles como **declaración** de la distribución (autodocumentan el modelo, como en @RISK), pero **no deben ser el mecanismo de muestreo masivo**. El motor debe leer la definición y muestrear fuera de Excel.

---

## 6. Rendimiento y escalabilidad

### 6.1 Benchmarks ejecutados (hardware: este PC, Excel 16.0.20326 x64, Node 24)

**A. Coste de una iteración con Excel dentro del bucle** (escribir 10 entradas → `CalculateFull` → leer 1 salida; modelo mínimo de 50 fórmulas; vía COM, que es **más rápido** que Office.js, por lo que es un límite inferior optimista de la arquitectura actual):

| Iteraciones | Tiempo | ms/iter | Proyección 100.000 | Proyección 1.000.000 |
|---:|---:|---:|---:|---:|
| 200 | 2,8 s | 13,8 | 23 min | 3,8 h |
| 1.000 | 11,0 s | 11,0 | 18 min | 3,1 h |

Con un modelo real (miles de fórmulas, BUSCARV, tablas) el recálculo completo por iteración es de decenas o cientos de ms: **1M iteraciones = días**. Y Office.js añade serialización JSON y viajes entre procesos; el batching de 250 no cambia el orden de magnitud.

**B. Muestreo + modelo trivial + estadísticas en JS puro** (10 entradas normales, salida = suma ponderada, ordenación y percentiles):

| Iteraciones | Muestreo + modelo | Estadísticas (sort, percentiles) | Memoria aprox. |
|---:|---:|---:|---:|
| 10.000 | 9 ms | 2 ms | 6 MB |
| 100.000 | 58 ms | 12 ms | 14 MB |
| 500.000 | 262 ms | 72 ms | 47 MB |
| 1.000.000 | **564 ms** | 161 ms | 88 MB |

Diferencia: **~4 órdenes de magnitud**. El cuello de botella no es el código JS ni el número de iteraciones: es que Excel recalcula el libro entero en cada iteración.

### 6.2 Cuellos de botella concretos de la implementación actual

1. `application.calculate(Full)` por iteración (`excelService.ts:463`). Dominante.
2. Copia celda a celda a la hoja temporal con `copyFrom` (N × salidas operaciones encoladas).
3. Tope artificial de 50.000 iteraciones en la UI (`SettingsPanel.tsx:28,63`) — reconoce implícitamente el problema.
4. Precálculo de muestras en arrays JS de `number[]` (`push`), no en `Float64Array`.
5. Panel de resultados: `analyzeResults` reordena todo el array en **cada render** (cada movimiento del slider de percentil).
6. `getNamedRangeAddress` con 3 `context.sync()` por variable, secuencial (`App.tsx:54`).
7. Bundle del panel de 1 MB (jspdf + html2canvas + recharts + react), con warning de Vite.

### 6.3 Escalabilidad a 100k–1M: lo que la arquitectura actual no puede dar

Con Excel en el bucle, ningún batching, hilo o WASM cambia el resultado. Para escalar hace falta que **el modelo se evalúe fuera del ciclo de recálculo de Excel**. Alternativas a evaluar en la Fase 2 (no se decide aquí):

- **(a) Evaluador de fórmulas en el motor**: extraer el subgrafo de dependencias entre entradas y salidas, y evaluarlo vectorizado (cada celda del grafo se calcula sobre un vector de N muestras). Motores candidatos: HyperFormula (TS, MIT/GPL según versión), formula.js, o compilación propia del subgrafo. Techo teórico: el del benchmark B. Riesgo: cobertura de funciones de Excel (BUSCARV, SI.ERROR, matrices dinámicas…) y fidelidad numérica.
- **(b) Excel en proceso (XLL vía Excel-DNA/.NET o C++)**: recálculo nativo sin Office.js, ~10–100× más rápido que la vía actual, pero sigue siendo O(N × coste de recálculo); es lo que hace @RISK y por eso @RISK también tarda con 1M. Solo Windows; requiere instalar un XLL.
- **(c) Híbrido**: (a) cuando el subgrafo es soportado, con *fallback* a (b) o a la vía actual con aviso de tiempo estimado.
- **Rango razonable de tecnologías** para el motor dentro de un web add-in: TypeScript con `Float64Array` + Web Workers (paralelismo real por núcleo) y, si hace falta, Rust→WASM para el muestreo/ordenación. Python/NumPy o GPU quedan descartados como base por integración y distribución (requieren instalar un runtime aparte); podrían aparecer solo como motor opcional externo.

La regla del §7 de las instrucciones (no transferir 1M filas a Excel) se cumple naturalmente con (a): el motor devuelve estadísticas, histogramas y percentiles; los datos brutos se escriben solo bajo demanda.

---

## 7. Interfaz de usuario: problemas observados

- Navegación por `<select>` desplegable (`App.tsx:238`) en lugar de pestañas visibles; la cinta abre el panel con `?tab=` pero si ya está abierto no cambia de pestaña (se intenta con `settings.forceTab`, un hack).
- Dos vías para lo mismo (panel "Variables" y diálogo "Entrada rápida") con distinto conjunto de distribuciones y distinto naming (`Variable_B5` vs `Entrada_B5` vs `Var_B5`).
- Etiquetas engañosas: "Guardar e Inyectar" no inyecta nada; "Modo de fórmulas" no hace nada; el encabezado dice "Financial risk" en inglés.
- Sin indicación de tiempo estimado ni cancelación durante la simulación.
- Histograma sin número de bins configurable (fijo 20), sin ejes con valores, sin densidad, sin comparación de escenarios, sin cortes por percentil, tornado solo por Pearson.
- Tipografía y estilos con `style={{}}` inline en casi todos los componentes (mantenibilidad), tema oscuro/claro sin control.
- Rendimiento del panel: re-cálculo estadístico completo en cada interacción.

Lo rescatable: el flujo conceptual (definir entradas → salidas → simular → resultados → exportar) es correcto y coincide con el flujo deseado del §20 de las instrucciones.

---

## 8. Control de versiones (estado)

- **No hay repositorio Git** en ninguna de las dos carpetas. No hay historial, ramas ni versiones etiquetadas; la única "versión" es `dist/` obsoleto y la copia `1 complemento sensibilidad`.
- `.gitignore` es el de Vite y ya excluye `node_modules` y `dist` (correcto).
- No hay secretos ni credenciales.
- Archivos que no deberían versionarse: `dist/`, `node_modules/`.
- La estructura es trivialmente migrable a Git.

Recomendación (para aplicar en Fase 4, con tu aprobación): `git init` en esta carpeta, commit inicial "estado heredado" (para conservar la evidencia), luego trabajar en `develop` con ramas por funcionalidad, `main` solo para releases etiquetadas (SemVer), `CHANGELOG.md`, GitHub como remoto privado con Issues para el roadmap. La carpeta `1 complemento sensibilidad` puede quedar como copia congelada.

---

## 9. Riesgos técnicos

| Riesgo | Probabilidad | Impacto |
|---|---|---|
| Que ninguna arquitectura basada en recálculo de Excel alcance 1M iteraciones en tiempos aceptables | Alta | Alto — define la arquitectura |
| Cobertura incompleta de funciones de Excel en un evaluador externo | Media | Medio — necesita *fallback* y tests de fidelidad |
| Límites de memoria del WebView2 (1M × variables × 8 bytes: 10 entradas + 5 salidas ≈ 120 MB, manejable; 100 variables ≈ 800 MB, ya no) | Media | Medio — exige estadísticas por streaming y no retener todo |
| Caché de funciones personalizadas de Office (registro pegajoso; hay que limpiar `Wef` al cambiar ids) | Alta en desarrollo | Bajo |
| Distribución: el manifiesto apunta a `localhost`; para otros usuarios hará falta hosting HTTPS o sideload por carpeta compartida | Alta | Medio |

---

## 10. Componentes reutilizables

- Lógica estadística básica (`analyzeResults`, percentiles, correlación) — como referencia para tests; reescribir sobre `Float64Array`.
- CDFs teóricas de `statistics.ts` (normal, uniforme, triangular, lognormal, Poisson, binomial) — correctas, útiles para el ajuste y para tests.
- Muestreadores normal (Box-Muller), uniforme, triangular, Bernoulli, discreta — correctos (PERT, Poisson y binomial no).
- `exportReportToExcel` (hojas de reporte con gráficos nativos) — buena funcionalidad, reutilizable con ajustes.
- Persistencia en `workbook.settings` + rangos con nombre — el concepto es correcto.
- Iconos, textos de cinta, estructura de grupos del manifiesto.
- Modo mock sin Excel — base para tests.

## 11. Componentes que deberían reemplazarse

- `runMonteCarloSimulation` completo (motor).
- Toda la capa de funciones personalizadas (manifiesto, `functions.ts/js/json`, build).
- `ResultsDashboard.tsx` (gráficos y cálculo en render).
- `dialog.tsx` + mecanismo de eventos de cinta.
- `SettingsPanel.tsx` (opciones muertas, tope de 50k).
- Ajuste de distribuciones (unificar las dos implementaciones, MLE, PERT real).
- `dist/`, `README.md`, `batching_architecture.md` (documentación inexacta).

---

## 12. Diagnóstico general y decisión

**Clasificación: C — Reescribir parcialmente**, en la frontera con D.

Justificación:

- **Lo que hay que reemplazar** es el núcleo de valor del producto: motor de simulación, funciones de Excel, gráficos y parte del modelo de datos. Eso es ~60 % del código y el 100 % de lo que determina rendimiento y corrección.
- **Lo que se conserva** no es código tal cual, sino decisiones válidas: Office Add-in web como plataforma (multiplataforma, sin instalador, distribución por manifiesto), React/TypeScript/Vite como stack, persistencia en el libro, rangos con nombre, exportación a hojas nativas, y la estructura de la cinta. Empezar "desde cero" volvería a llegar a estas mismas decisiones, por lo que D no aporta nada.
- **No es A ni B**: no existe una base sólida que "solo necesite mejoras"; el proyecto no compila, no tiene tests, y su arquitectura de simulación es incompatible con el objetivo de 100k–1M iteraciones por diseño, no por implementación.

En la práctica, la Fase 4 se plantearía como un **proyecto nuevo dentro de la misma plataforma**, con estructura de carpetas nueva (`engine/` puro sin dependencia de Office, testeable en Node; `excel/` adaptadores; `ui/`; `functions/`), que va absorbiendo las piezas reutilizables listadas en §10 con sus tests correspondientes, en lugar de parchear el árbol actual.

---

## 13. Preguntas antes de la Fase 2 (agrupadas)

> **Estado 2026-09-15:** las preguntas 1 y 2 ya están respondidas (ver más abajo). El resto sigue abierto.
> El seguimiento vivo de decisiones está en [`ESTADO_Y_HANDOFF.md`](ESTADO_Y_HANDOFF.md).

1. ~~**Plataforma objetivo**~~ → **RESPONDIDA**: principalmente Excel de escritorio en Windows, **pero también debe funcionar en Mac**, y deseablemente en otras versiones. **Consecuencia: queda descartado el XLL / Excel-DNA** (solo Windows), y con él la opción (b) del §6.3. La única vía viable a 100k–1M iteraciones es la opción (a): evaluar el modelo fuera del ciclo de recálculo de Excel.
2. ~~**Distribución**~~ → **RESPONDIDA**: equipo **personal**. Sin catálogo de organización ni hosting corporativo; sideload en Windows y carpeta compartida en Mac.
3. **Modelos típicos**: ¿tamaño aproximado (número de hojas, fórmulas), qué funciones de Excel usan (BUSCARV/XLOOKUP, SUMAR.SI, tablas, matrices dinámicas, macros VBA, Power Query)? Determina la viabilidad del evaluador de fórmulas externo (opción (a) del §6.3).
4. **Número habitual de entradas inciertas y salidas** (¿decenas o cientos?) y **rango realista de iteraciones** en el día a día (¿10k–100k normalmente y 1M ocasional?).
5. ¿Es aceptable que el motor de alto rendimiento cubra un **subconjunto** de funciones de Excel con detección automática y aviso, y que los modelos no soportados caigan a un modo lento con Excel en el bucle?
6. ¿Deben conservarse los libros ya configurados con la versión actual (formato `MonteCarloConfig`), o se puede definir un formato nuevo sin migración?
7. Convención de nombres de funciones: ¿mantener el espacio de nombres `RIESGO.` y nombres en español (`RIESGO.NORMAL`, `RIESGO.TRIANGULAR`)?
8. Licencias: ¿hay restricciones para dependencias GPL (afecta a la elección de evaluador de fórmulas, p. ej. HyperFormula es GPLv3 salvo licencia comercial)?
9. ¿Autorizas `git init` en esta carpeta con un commit inicial del estado heredado antes de tocar nada?
