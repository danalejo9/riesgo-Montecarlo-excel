# Casos publicados para validar un Monte Carlo de cronogramas (y costos)

## Instrucciones para la IA que lo use
- Los datos de abajo son los publicados por las fuentes. NO completes ni inventes datos faltantes (predecesoras, calendarios, asignaciones de riesgos, iteraciones).
- Cada caso tiene un campo `reproducibilidad`: `analitico` (se puede comprobar exacto), `parcial` (faltan datos; solo comparar de forma aproximada) o `no_reproducible`.
- Los resultados publicados son los valores de referencia. Las fechas de la fuente no traen año en el texto de la GAO (salvo la Tabla 5 y Hulett), así que compara en DIFERENCIAS DE DÍAS desde el fin determinista, no en fechas absolutas.
- Tolerancias sugeridas: para resultados leídos en texto con "about", +-3 puntos porcentuales o +-2 días; los percentiles dependen de la semilla y del número de iteraciones (usa >= 50.000).
- Si hace falta suponer la red (caso A), marca claramente que es supuesto tuyo y no un dato publicado.

---

## CASO 1 — Merge bias analítico (GAO-16-89G, BP8, "Merge Bias and Schedule Underestimation", Fig. 36)
reproducibilidad: analitico
Fuente: https://guides.gaoinnovations.gov/schedule-guide/merge-bias-and-schedule-underestimation.html

Datos: dos rutas independientes que convergen en un hito; cada una tiene 60% de probabilidad de terminar a tiempo.

| Prueba | Resultado publicado |
|---|---|
| P(hito a tiempo), 2 rutas | 36% (0,6 x 0,6) |
| P(tarde) | 64% = 24% (eléctrica tarde, plomería a tiempo) + 24% (inverso) + 16% (ambas tarde) |
| P(hito a tiempo), 3 rutas de 60% | 22% (0,6^3 = 21,6%) |

Uso: simular dos/tres rutas independientes calibradas para P(ruta a tiempo)=0,6 y verificar 36% / 22%.

---

## CASO 2 — Red determinista de arranque y pruebas (GAO-16-89G, Apéndice IV, Tabla 9, Figs. 51-56)
reproducibilidad: analitico (determinista, sin incertidumbre)
Fuente: https://guides.gaoinnovations.gov/schedule-guide/appendix-iv-the-forward-and-backward-pass.html
Inicio: martes 27 de enero (inspecciones cerradas el lunes 26 al fin del día). Todas las relaciones FS, sin retardos. Calendario de días laborables no especificado (se usan fechas de lunes a viernes).

```csv
id,nombre,duracion_dias,predecesoras
M1,Set electricity meter,1,
M2,Set gas meter,1,
M3,Set water meter,1,
T1,Start up and test electrical system,2,M1
T2,Start up and test furnace and AC,1,"M1;M2"
T3,Start up and test plumbing fixtures,2,"M2;M3"
FIN,Start-up and test complete (hito),0,"T1;T2;T3"
```
Duraciones: T2 = 1 día según Tabla 9. Resultados publicados: ES de M1-M3 = 27 ene; T1 ES 28 ene, EF 29 ene; T3 ES 28 ene, EF 29 ene; T2 ES 28 ene; hito FIN = 29 ene. LS de T3 = 28 ene, LS de T2 = 29 ene, LF de M2 = 27 ene (T2 tiene 1 día de holgura).
Horas-trabajo (Tabla 9): M1 16 h, T1 16 h, M2 16 h, T2 8 h, M3 16 h, T3 32 h. No hay tarifas ni costos.

---

## CASO 3 — Casa, tres puntos (GAO-16-89G, BP8, Tabla 2, Fig. 37)
reproducibilidad: parcial (NO se publica la red: faltan predecesoras, tipos, retardos y calendario)
Fuente: https://guides.gaoinnovations.gov/schedule-guide/schedule-risk-analysis-with-three-point-duration-estimates.html

Distribución: triangular (declarado). Duraciones restantes, unidad no declarada (se infieren días).

```csv
id,nombre,min,mas_probable,max
A1870,Install drywall on walls and ceilings,3,4,6
A1880,Inspect drywall screws,1,1,2
A1890,Finish drywall (tape and mud),3,5,6
A1900,Install ceiling insulation,1,1,2
A1910,Apply drywall texture,2,3,4
A1920,Apply wall finishes (stain and paint),2,3,4
A1930,Install tile in bathroom and kitchen,2,3,5
```
Resultados publicados (texto): fin determinista 10 feb; fecha esperada 25 feb (Fig. 37); P(terminar el 10 feb o antes) ~ 7% ("about 7 percent"); P70 = 2 mar ("about a calendar month later"). No se publican P10/P50/P80/P90 numéricos, iteraciones ("thousands") ni herramienta.
Nota: la tabla es solo "una sección" de un cronograma mayor; si se asume una red (p. ej. serie), es SUPUESTO del evaluador. Si el fin determinista de la sección son pocas jornadas y la fuente reporta ~1 mes de diferencia entre determinista y P70, la red del documento incluye más actividades que las 7 listadas.

---

## CASO 4 — Casa, risk drivers (GAO-16-89G, BP8, Tablas 3 y 4, Fig. 38)
reproducibilidad: parcial (asignación de riesgos a actividades y red NO publicadas; distribución del factor no nombrada)
Fuente: https://guides.gaoinnovations.gov/schedule-guide/schedule-risk-analysis-with-risk-drivers.html

Cada riesgo es un factor multiplicativo sobre la duración restante de las actividades asignadas, aplicado solo si el riesgo ocurre en la iteración. Un riesgo asignado a varias actividades ocurre en todas a la vez (correlación implícita).

```csv
riesgo,tipo,probabilidad,min_factor,mas_probable_factor,max_factor
Design is incomplete,riesgo,0.80,0.95,1.25,1.50
Site investigation is inadequate,riesgo,0.30,1.00,1.20,1.35
Material is unavailable,riesgo,0.25,1.00,1.25,1.30
Material is late or defective,riesgo,0.35,0.95,1.10,1.30
Inspectors are unavailable,riesgo,0.30,1.25,1.50,2.00
Rework will be necessary,riesgo,0.25,1.00,1.10,1.35
Materials are purchased incorrectly,riesgo,0.10,1.00,1.10,1.30
Soil conditions are poor,riesgo,0.25,1.00,1.15,1.35
Owner makes changes,riesgo,0.50,0.95,1.10,1.30
Productivity of labor,incertidumbre,1.00,0.95,1.00,1.10
Efficacy of general contractor,incertidumbre,1.00,0.90,1.00,1.25
Schedule estimating error,incertidumbre,1.00,0.95,1.05,1.15
```
Resultados publicados (texto): P(10 feb) < 1%; P70 = 14 abr ("2-month time contingency"); el ancho P5-P95 es mayor que en el caso 3 (sin cifras).

### Priorización por eliminación (Tabla 5, Fig. 39-41)
Método: se corre el modelo completo, se registra P80; se quita un riesgo; se compara el P80; el de mayor ahorro es el principal; se repite quitando de forma acumulada.
```csv
prioridad,riesgo,fecha_P80,dias_calendario_ahorrados
0,TODOS,2026-04-23,
1,Design is incomplete,2026-04-01,22
2,Machines are not available,2026-03-23,9
3,Material is not available,2026-03-17,6
4,Efficacy of the general contractor,2026-03-10,7
5,Materials are late or defective,2026-03-04,6
```
Observaciones: "Machines are not available" aparece en la Tabla 5 pero no en la Tabla 3 (inconsistencia de la fuente). El año 2026 de la Tabla 5 sugiere edición web actualizada; no se sabe si las fechas del caso 3 y 4 (feb/mar/abr) son del mismo año.
Tornado (Fig. 40, solo texto): mayor riesgo = Design is incomplete, luego disponibilidad de materiales. Fig. 39 (sensibilidad por actividad) y Fig. 41 (criticidad): sin valores en texto.

---

## CASO 5 — Casa, ramificación probabilística (GAO-16-89G, BP8, Figs. 42-43)
reproducibilidad: parcial (se aplica sobre la red/3 puntos del caso 3, no publicada)
Fuente: https://guides.gaoinnovations.gov/schedule-guide/probabilistic-branching.html

Datos: tras el recorrido del dueño. 70%: "deficiencies are corrected" (1 semana laboral, sin retraso al aceptación). 30%: "deficiencies are disputed" 15 días hábiles + "dispute is mediated" 30 días hábiles = retraso de 40 días hábiles a la aceptación y a la ocupación (el texto dice 40, no 45).
Resultados publicados: distribución bimodal; P80 = 15 abr.

---

## CASO 6 — Casa, correlación (GAO-16-89G, BP8, Fig. 44)
reproducibilidad: parcial (matriz de pares y red no publicadas)
Fuente: https://guides.gaoinnovations.gov/schedule-guide/correlation.html

Datos: correlación de 0,90 entre actividades de oficios relacionados, sobre el modelo de tres puntos (caso 3).
```csv
percentil,sin_correlacion,con_correlacion_0.90
P50,25 feb,24 feb
P80,4 mar,9 mar
```
Conclusión de la fuente: la correlación ensancha las colas (P80 sube una semana laboral) y casi no cambia la mediana. Prueba cualitativa útil: P80 con correlación > P80 sin correlación; P50 ~ igual.

---

## CASO 7 — UAV, costo, tres puntos (GAO-20-195G, Tabla 12, Fig. 15)
reproducibilidad: analitico/parcial (modelo de costo por suma; no hay red)
Fuente: https://guides.gaoinnovations.gov/cost-guide/cost-risk-analysis-data-and-methods.html

Triangular, $K por vehículo aéreo; 32 vehículos.
```csv
wbs,elemento,min,mas_probable,max
1.1,Airframe,17955,19645,21785
1.2,Propulsion,8500,10553,13000
1.3,Communications,4000,4306,5100
1.4,Navigation,4100,4305,4650
1.5,Central Computer,550,600,650
1.6,Software,32300,35547,52500
1.7,Integration Assembly test and check-out,1950,2136,2600
```
Verificación: suma de más probables = 77.092 $K por vehículo (~$77 M) x 32 = ~$2,47 B.
Resultados publicados: estimación puntual $2,47 B; P50 = $2,61 B (+$140 M); P(costo <= $2,47 B) ~ 15%; P80 = $2,79 B (~+$320 M). Iteraciones: "thousands" (sin cifra). Herramienta: no declarada.
Nota: la suma de triangulares independientes tiene media y desviación calculables analíticamente: úsalo como cuña de validación (media de cada triangular = (min+ml+max)/3).

---

## CASO 8 — UAV, costo, risk drivers (GAO-20-195G, Tablas 13-14, Fig. 16)
reproducibilidad: parcial (asignación de riesgos a elementos WBS no publicada)
Fuente: https://guides.gaoinnovations.gov/cost-guide/cost-risk-analysis-with-risk-drivers.html
```csv
riesgo,tipo,probabilidad,min,mas_probable,max
Material is late or defective,riesgo,0.80,1.00,1.05,1.30
Complex airframe producibility lead to increased manufacturing time,riesgo,0.25,1.00,1.10,1.25
GFI deliveries are delayed,riesgo,0.20,0.90,1.00,1.15
Hiring and retention affected by changing economy,riesgo,0.15,0.95,1.10,1.35
Labor productivity,incertidumbre,1.00,0.97,1.00,1.05
Cost estimating errors,incertidumbre,1.00,0.97,1.00,1.06
Software sizing errors,incertidumbre,1.00,0.76,1.00,1.40
```
Resultados publicados: P(<= $2,47 B) ~ 1%; P80 = $3,08 B (incluye $610 M de contingencia).

---

## CASO 9 — Curva S genérica (GAO-20-195G, Fig. 14)
reproducibilidad: no_reproducible (solo referencia de lectura de la curva)
Fuente: https://guides.gaoinnovations.gov/cost-guide/conducting-a-cost-risk-and-uncertainty-analysis.html
Estimación puntual $825.000; P~40% de costar $825.000 o menos; P50 = $908.000 ($83.000 de contingencia); P70 = $1.096.000 (~$271.000 sobre el punto).

---

## CASO 10 — Hulett (1996), tres casos de dos y cuatro actividades
reproducibilidad: parcial (varios rangos solo en figuras)
Fuente: Hulett, D.T. (1996) "Schedule Risk Analysis Simplified", PM Network 10(7), 25-32. https://www.pmi.org/learning/library/schedule-risk-analysis-simplified-10742
Aviso: NO hay evidencia de que sean los ejemplos de AACE 57R-09/64R-11.
Herramienta: Risk+ v1.5 sobre MS Project 4.0. Distribución triangular. Inicio 10 jun 1996, días laborables. Iteraciones: 2.500 (caso 1).

```csv
caso,actividad,predecesora,min,mas_probable,max,nota
1,A101,,40,50,100,rango de la nota al pie 3
1,A102,A101,?,80,?,rango solo en Figura 2 (imagen): FALTA
2,A101,,40,50,100,
2,A102,A101,?,80,?,FALTA (igual que caso 1)
2,B101,,40,50,100,idéntica a A101
2,B102,B101,?,80,?,FALTA (igual que A102)
3,B101,,?,45,?,rangos solo en Figura 7: FALTA
```
Fin CPM (los 3 casos): 11-dic-1996 (130 d laborables en caso 1 y 2; en caso 3 la ruta A = 130 d y la ruta B = 125 d, holgura 5).
```csv
resultado,caso1,caso2,caso3
P(fecha CPM),10-15%,<5%,<5%
fecha_mas_probable,~24-dic-1996,~7-ene-1997,
media,7-ene-1997,17-ene-1997,3-ene-1997
P80,24-ene-1997,4-feb-1997,
criticidad,,,"ruta B 69% / ruta A 31%"
```
Verificación: media triangular de A101 = (40+50+100)/3 = 63,3 d (sobreestadía de 13,3 d sobre 50).

---

## CASO 11 — NASA JCL
reproducibilidad: no_reproducible
Fuente: https://ntrs.nasa.gov/citations/20250002084
Un solo valor citado en el texto: 6,2% de JCL (pág. 3), SIN red, rangos, costos, iteraciones ni herramienta. Sin verificar contra el PDF original (lo obtuve por un resumen automático). No usar como referencia.

---

## NO DISPONIBLE (no se debe rellenar)
- AACE RP 57R-09 y 64R-11: acceso de pago/miembros (https://www.pathlms.com/aace/courses/2928/documents/3840 y .../3847). No se leyó su contenido; no se sabe qué ejemplos numéricos traen.
- GAO-20-195G: no tiene ejemplo numérico de cronograma ni integrado costo-plazo (solo texto conceptual en el capítulo EVM).
- Figuras GAO 37-44, 15, 16, 14 no fueron leídas; ningún valor de gráfica está en este archivo.
- Números de página del PDF no verificados (la versión web no los trae).

## Orden recomendado de pruebas
1. Caso 1 (exacto), 2. Caso 2 (exacto, determinista), 3. Caso 7 (analítico en media/varianza + percentiles publicados), 4. Caso 10 con rangos faltantes completados SOLO si se obtienen las figuras, 5. Casos 3-6 y 8 solo de forma cualitativa (direcciones y órdenes de magnitud) hasta tener la red completa.
