# Especificación funcional y técnica — Complemento QRSA para Excel

*Entregada por el usuario el 05/10/2026. Se guarda tal cual como fuente de la
verdad; el análisis de brechas y el plan están en `docs/QRSA_PLAN.md`.*

**Propósito:** análisis cuantitativo integrado de riesgo de **cronograma y costo** (QRSA / SRA + CRA) mediante simulación Monte Carlo sobre un modelo de ruta crítica (CPM).
**Referentes metodológicos:** AACE RP 57R-09 (análisis integrado costo–cronograma con Monte Carlo sobre CPM), AACE RP 41R-08 (estimación por rangos), GAO Schedule Assessment Guide, DCMA 14-Point Assessment, ISO 31000.

> **Instrucción para Claude Code:** antes de implementar, audita el código existente del complemento contra esta especificación y entrega una tabla de brechas (Cumple / Parcial / No existe) por sección. Luego implementa por fases (sección 13). No cambies la arquitectura sin explicar el motivo.

---

## 1. Principio rector

El motor **debe recalcular la red completa (forward y backward pass) en cada iteración**. Sumar duraciones aleatorias en serie no es un SRA válido, porque ignora el **sesgo de convergencia** (*merge bias*): cuando varias rutas convergen en un hito, la fecha del hito es el máximo de las rutas. Ese efecto es la principal razón por la que los proyectos se atrasan "sin explicación".

---

## 2. Modelo de datos (hojas de Excel)

| Hoja | Contenido mínimo |
|---|---|
| `Config` | Fecha de inicio, unidad de tiempo, n.º de iteraciones, semilla, método de muestreo, moneda, percentiles objetivo, fecha y costo meta |
| `Calendario` | Días laborables por semana, festivos de Colombia, excepciones; permitir más de un calendario |
| `Actividades` | ID, nombre, WBS, tipo (tarea / hito / resumen), duración base, calendario, restricción (tipo + fecha), costo base, ¿excluir de la simulación? |
| `Relaciones` | ID predecesora, ID sucesora, tipo (FC, CC, FF, CF), desfase (positivo o negativo), unidad del desfase |
| `Incertidumbre` | ID actividad o grupo, distribución, parámetros (mín / más probable / máx o P10 / P50 / P90) |
| `Riesgos` | ID, descripción, causa, consecuencia, dueño, categoría, probabilidad pre y post mitigación, estado, costo de la mitigación |
| `Impactos` | ID riesgo, ID actividad afectada, impacto en días (distribución), impacto en costo (distribución), pre y post |
| `Correlaciones` | Pares (A, B, ρ) o grupos de correlación con coeficiente común |
| `Costos` | Partida, tipo (fijo / dependiente del tiempo / por recurso), tarifa, actividad o periodo asociado, incertidumbre |
| `Resultados_*` | Hojas de salida generadas por el motor (nunca editadas a mano) |

Requisitos: IDs únicos, validación de datos en las celdas y mensajes de error que indiquen fila y columna.

---

## 3. Importación de cronogramas

- **Prioridad 1:** tabla nativa de Excel (hojas `Actividades` y `Relaciones`).
- **Prioridad 2:** MS Project XML (MSPDI): tareas, vínculos, desfases, calendarios, restricciones, resumen o no resumen.
- **Prioridad 3:** Primavera P6 XER (TASK, TASKPRED, CALENDAR).
- Tras importar, mostrar un resumen: n.º de actividades, relaciones, hitos y calendarios, y advertencias.
- Ignorar las actividades resumen en el cálculo (los vínculos sobre resúmenes generan advertencia).

---

## 4. Motor CPM (núcleo)

### 4.1 Cálculo determinístico
- Ordenamiento topológico y **detección de ciclos** (si hay ciclo, se aborta indicando las actividades involucradas).
- **Forward pass** con los cuatro tipos de relación y desfases, incluidos los negativos:
  - FC: `ES_suc ≥ EF_pred + lag`
  - CC: `ES_suc ≥ ES_pred + lag`
  - FF: `EF_suc ≥ EF_pred + lag`
  - CF: `EF_suc ≥ ES_pred + lag`
- **Backward pass:** LS / LF, holgura total y holgura libre.
- **Calendarios:** aritmética en días laborables y conversión a fechas reales con festivos.
- **Restricciones:** "no comenzar antes de" (SNET), "no terminar después de" (FNLT, genera holgura negativa sin mover fechas), "debe comenzar o terminar el" (advertencia: anula la lógica en la simulación). Opción global para ignorar las restricciones duras durante la simulación.
- Hitos de duración 0.
- **Validación obligatoria:** el resultado determinístico debe coincidir con MS Project o P6 para el mismo cronograma (tolerancia: 0 días).

### 4.2 Por iteración
1. Muestrear las duraciones.
2. Activar o desactivar los riesgos discretos y sumar sus impactos.
3. Forward pass → fechas de hitos y fin.
4. Backward pass → holgura → marcar las actividades críticas (holgura total ≤ 0) para el índice de criticidad.
5. Calcular el costo de la iteración (sección 7).
6. Guardar en arreglos: fin del proyecto, fechas de los hitos clave, costo total, duración de cada actividad, flag crítico por actividad y riesgos ocurridos.

---

## 5. Incertidumbre de duración

### 5.1 Distribuciones
- Triangular, **BetaPERT** (con parámetro λ, por defecto 4), uniforme, lognormal, discreta.
- **Trigen:** se ingresa P10 / más probable / P90 y el sistema convierte a mín / máx (los expertos subestiman los extremos; esta es la entrada recomendada).
- Validación: mín ≤ más probable ≤ máx; sin duraciones negativas.

### 5.2 Factores de incertidumbre (para reducir la carga de datos)
- Asignar plantillas de rango por **grupo** (WBS, tipo de actividad, contratista), por ejemplo "Obras de siembra: 90 %–100 %–140 % de la duración base".
- Si una actividad tiene un rango propio, este prima sobre el del grupo.

---

## 6. Riesgos discretos (registro de riesgos)

- Cada riesgo tiene una **probabilidad de ocurrencia** (Bernoulli por iteración) y uno o varios **impactos** en actividades: días y costo, cada uno con su propia distribución.
- Un mismo riesgo puede afectar varias actividades (todas se activan juntas en la iteración).
- Varios riesgos sobre una misma actividad: los impactos se suman.
- **Escenarios pre y post mitigación:** se corren ambos y se comparan. En el escenario post se incluye el costo de la mitigación.
- Opción avanzada: modelar el riesgo como una actividad insertada en la red (con su propia lógica) en lugar de una extensión de la duración.
- Riesgos de **oportunidad** (impacto negativo = ahorro).
- Opcional (fase 3): ramificación probabilística (rutas alternativas, por ejemplo "si el permiso se niega, se sigue la ruta B").

---

## 7. Modelo de costos (integración costo–plazo)

- **Costo fijo con incertidumbre:** materiales, suministros (distribución sobre el valor).
- **Costo dependiente del tiempo:** tarifa diaria × duración simulada de la actividad o del proyecto (administración, interventoría, vigilancia, alquileres, parte de la A del AIU). **Esta es la integración clave: un retraso cuesta dinero.**
- **Costo por recurso:** unidades × tarifa × duración.
- Impactos de costo de los riesgos discretos.
- Opcional: escalamiento o inflación por periodo según la fecha simulada de ejecución.
- Correlación entre partidas de costo (sección 8).
- Salidas: costo P50 / P80, **contingencia = P80 − costo base** (o el percentil configurado).

---

## 8. Correlación

- Correlación de **rangos** (Spearman) entre duraciones y entre costos, inducida con el método **Iman-Conover** (conserva las distribuciones marginales).
- Entrada por pares o por grupos (por ejemplo, todas las actividades de siembra con ρ = 0,6).
- **Validar que la matriz sea semidefinida positiva**; si no lo es, corregirla a la matriz válida más cercana (método de Higham) y avisar al usuario.
- Verificación: la correlación lograda en la muestra debe quedar dentro de ±0,05 de la objetivo.
- Advertencia en el reporte cuando no se define ninguna correlación (los resultados salen optimistas).

---

## 9. Motor de simulación

- **Muestreo:** Monte Carlo simple y **Latin Hypercube** (por defecto).
- **Semilla configurable** para que los resultados sean reproducibles.
- Iteraciones configurables (por defecto 5 000) con **criterio de convergencia**: detener o avisar cuando el P80 varía menos de 0,5 % entre bloques de 500 iteraciones.
- **Rendimiento objetivo:** 500 actividades × 5 000 iteraciones en menos de 60 s. Calcular sobre arreglos en memoria y **nunca leer o escribir celdas dentro del bucle**. Escribir los resultados en bloque al final.
- Barra de progreso y botón de cancelar.
- Si el entorno es VBA y no alcanza el rendimiento, evaluar un motor compilado (Excel-DNA / C#) o Office.js con Web Worker. Documentar la decisión.

---

## 10. Salidas obligatorias

### 10.1 Cronograma
- **Histograma y curva S acumulada** de la fecha de fin y de cada hito clave.
- Tabla de percentiles: P10, P20 … P90 (fechas y días).
- **Probabilidad de cumplir la fecha determinística** y la fecha meta.
- Media, desviación estándar y mínimo y máximo simulados.

### 10.2 Diagnóstico de drivers
- **Índice de criticidad:** % de iteraciones en que cada actividad estuvo en la ruta crítica.
- **Cruciality:** correlación entre la duración de la actividad y la fecha de fin.
- **Índice de sensibilidad del cronograma (SSI):** `SSI = CI × (σ_actividad / σ_proyecto)`.
- **Tornado por riesgo** con el método de **eliminación de riesgos**: para cada riesgo, la reducción del P80 y de la media al quitarlo. Es más robusto que la correlación.
- Tornado de incertidumbre por actividad o grupo.
- **Rutas críticas más frecuentes** (top 5 con su %).

### 10.3 Costo
- Histograma y curva S del costo total. P50, P80 y contingencia.
- Desglose de la contingencia por riesgo (eliminación de riesgos) y por incertidumbre.

### 10.4 Integradas
- **Diagrama de dispersión costo vs. fecha de fin** con **JCL** (*Joint Confidence Level*): % de iteraciones que cumplen a la vez el costo meta y la fecha meta.
- **Comparación pre vs. post mitigación** (curvas S superpuestas y tabla de deltas).
- **Cronograma ajustado por riesgo:** fechas Pxx (por ejemplo P80) para cada actividad.

### 10.5 Reporte
- Hoja de resumen ejecutivo lista para imprimir o exportar a PDF: supuestos, n.º de iteraciones, semilla, advertencias de calidad, gráficos principales y top 10 de riesgos.
- Exportación de los datos crudos de las iteraciones (opcional, CSV).

---

## 11. Chequeo de calidad del cronograma (antes de simular)

Inspirado en DCMA 14 puntos. Bloquea o advierte antes de correr:
- Actividades sin predecesora o sin sucesora (extremos abiertos), salvo inicio y fin.
- Ciclos.
- Restricciones duras.
- Desfases negativos (leads) y desfases mayores al 5 % de las relaciones.
- Relaciones CF y vínculos a actividades resumen.
- Holgura total mayor a 44 días laborables (lógica incompleta).
- Duraciones mayores a 44 días laborables.
- % de actividades sin incertidumbre asignada.
- Correlación no definida.

Salida: semáforo por criterio con la lista de actividades afectadas.

---

## 12. Arquitectura y calidad de código

- Separar en capas: **datos (lectura y validación) → motor (funciones puras, sin dependencia de Excel) → salidas (escritura y gráficos) → UI (cinta o panel)**.
- El motor debe poder probarse sin Excel.
- Sin variables globales mutables en el motor; la configuración se pasa como objeto.
- Registro de la versión del complemento y de los supuestos en cada corrida.

### Pruebas obligatorias
1. **CPM determinístico** = MS Project en 3 cronogramas de prueba (simple, con los 4 tipos de relación y desfases, con calendario y festivos).
2. **Sesgo de convergencia:** dos actividades paralelas idénticas que convergen en un hito → la media del hito debe ser mayor que la media de cada una.
3. **Reproducibilidad:** misma semilla → resultados idénticos.
4. **Distribuciones:** la media y los percentiles muestrales coinciden con los analíticos (tolerancia del 1 % con 50 000 muestras).
5. **Correlación lograda** dentro de ±0,05.
6. **Riesgo con p = 1** equivale a sumar el impacto de forma determinística; con **p = 0** no tiene efecto.
7. **Costo dependiente del tiempo:** proyecto 10 días más largo → costo mayor en tarifa × 10.

---

## 13. Fases de implementación

**Fase 1 — MVP (lo mínimo para que sea un SRA válido)**
Hojas de entrada, CPM completo (4 relaciones, desfases, calendario), triangular / PERT / trigen, riesgos discretos con impacto en días, Monte Carlo y LHS con semilla, curva S, percentiles, índice de criticidad, tornado por eliminación de riesgos, chequeo de calidad básico.

**Fase 2 — Integración costo–plazo**
Modelo de costos (fijo, dependiente del tiempo, por recurso), impactos de costo de los riesgos, correlación Iman-Conover, contingencia, JCL, pre vs. post mitigación, factores de incertidumbre por grupo, importación desde MS Project XML.

**Fase 3 — Avanzado**
Importación XER, SSI y cruciality, rutas críticas frecuentes, ramificación probabilística, escalamiento, cronograma ajustado por riesgo, reporte ejecutivo en PDF, criterio de convergencia automático.

---

## 14. Criterios de aceptación globales

- Un cronograma de 300 actividades con 20 riesgos corre 5 000 iteraciones en menos de 60 s.
- El resultado determinístico coincide con MS Project.
- Cada gráfico y tabla de salida se puede regenerar sin intervención manual.
- Los errores de entrada indican hoja, fila y causa.
- El reporte documenta los supuestos, la semilla, las iteraciones y las advertencias de calidad.

---

## Glosario

- **CPM:** método de la ruta crítica.
- **ES / EF / LS / LF:** inicio y fin tempranos, inicio y fin tardíos.
- **Pxx:** valor con xx % de probabilidad de no ser excedido.
- **LHS:** Latin Hypercube Sampling.
- **JCL:** probabilidad conjunta de cumplir costo y plazo.
- **SSI:** Schedule Sensitivity Index.
- **Merge bias:** sesgo de convergencia de rutas paralelas.
