# Validación del módulo de cronograma (QRSA)

> Documento generado por `npm run validacion:cronograma` a partir de `tests/validacion/casos.ts`;
> los mismos casos se comprueban en cada `npm test`. No se edita a mano.

**Resultado:** 41 de 41 comprobaciones dentro de su tolerancia, en 13 casos.

## Cómo se valida

1. **Casos analíticos**: redes pequeñas cuya respuesta sale de una fórmula o de un cálculo a mano, y que
   cubren lo que distingue un análisis de riesgo del cronograma: la suma de tareas en serie, el sesgo de
   convergencia (*merge bias*), la criticidad, los *risk drivers* (AACE 57R‑09), la ramificación
   probabilística, la probabilidad conjunta de plazo y costo (JCL), las cuatro relaciones con desfases y
   festivos, los calendarios por actividad y el clima. Los Monte Carlo usan 100.000 iteraciones y una
   tolerancia del orden de su error de muestreo; lo determinista, exacto.
2. **Casos publicados por la GAO** (abajo).
3. **Implementación independiente**: los cronogramas de referencia R1–R3 se calcularon aparte en Python;
   el CPM del complemento coincide con ellos día por día (`tests/unit/cronogramaReferencias.test.ts`).

Todo es reproducible: el motor usa números aleatorios con semilla, así que con la misma semilla da
exactamente los mismos resultados en cualquier equipo.

## Casos analíticos

### V-01 · Diez tareas en serie

**Planteamiento.** 10 tareas fin‑comienzo, cada una triangular(8, 10, 15) días laborables. 100.000 iteraciones.

**Respuesta esperada.** Suma de variables independientes: la media y la varianza se suman (exacto, para cualquier distribución).

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| Media de la duración total (días) | 110 | 110,007 | ± 0,05 | Sí |
| Desviación típica (días) | 4,655 | 4,659 | ± 0,05 | Sí |

### V-02.1 · Convergencia de 1 ruta paralela (merge bias)

**Planteamiento.** Una ruta de una tarea triangular(8, 10, 15) que termina en un hito (la referencia sin convergencia). 100.000 iteraciones.

**Respuesta esperada.** El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^1, así que el percentil p es F⁻¹(p^(1/1)) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P50 del fin (días) | 10,817 | 10,812 | ± 0,05 | Sí |
| P80 del fin (días) | 12,354 | 12,347 | ± 0,05 | Sí |

### V-02.2 · Convergencia de 2 rutas paralelas (merge bias)

**Planteamiento.** 2 rutas de una tarea triangular(8, 10, 15) que convergen en un hito. 100.000 iteraciones.

**Respuesta esperada.** El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^2, así que el percentil p es F⁻¹(p^(1/2)) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P50 del fin (días) | 11,798 | 11,798 | ± 0,05 | Sí |
| P80 del fin (días) | 13,078 | 13,075 | ± 0,05 | Sí |
| Criticidad de cada ruta (por simetría, 1/n) | 0,5 | 0,499 | ± 0,01 | Sí |

### V-02.5 · Convergencia de 5 rutas paralelas (merge bias)

**Planteamiento.** 5 rutas de una tarea triangular(8, 10, 15) que convergen en un hito. 100.000 iteraciones.

**Respuesta esperada.** El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^5, así que el percentil p es F⁻¹(p^(1/5)) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P50 del fin (días) | 12,871 | 12,876 | ± 0,05 | Sí |
| P80 del fin (días) | 13,764 | 13,765 | ± 0,05 | Sí |
| Criticidad de cada ruta (por simetría, 1/n) | 0,2 | 0,199 | ± 0,01 | Sí |

### V-03 · Risk driver: una causa común frente a dos independientes

**Planteamiento.** Dos tareas fijas de 10 días en paralelo; impacto +2 días (a 12). 100.000 iteraciones.

**Respuesta esperada.** Con un solo riesgo (30 %) que alarga a la vez las dos rutas, el proyecto se retrasa con probabilidad 0,3; con dos riesgos independientes, uno por ruta, con 1 − 0,7² = 0,51. Es la correlación que modela el método de risk drivers (AACE 57R‑09) sin pedir coeficientes.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P(fin = 12 días), causa común | 0,3 | 0,299 | ± 0,005 | Sí |
| P(fin = 12 días), causas independientes | 0,51 | 0,509 | ± 0,005 | Sí |

### V-04 · Ramificación: un reproceso que puede aparecer

**Planteamiento.** A (10 días fijos) → reproceso (5 días, solo en la opción «Sí» de la rama) → fin. 100.000 iteraciones.

**Respuesta esperada.** Si la rama «Sí» sale (25 %), aparece un reproceso de 5 días entre A y el fin: el fin es 15 días con probabilidad 0,25 y 10 en el resto. El determinístico sigue la opción más probable (sin reproceso).

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P(fin = 15 días) | 0,25 | 0,248 | ± 0,005 | Sí |
| Duración determinística (días) | 10 | 10 | exacto | Sí |

### V-05 · Probabilidad conjunta de plazo y costo (JCL)

**Planteamiento.** Una tarea triangular(8, 10, 15); (a) un costo fijo con su propio rango triangular(800, 1.000, 1.500); (b) solo un costo por día. 100.000 iteraciones.

**Respuesta esperada.** Con el costo independiente del plazo, P(plazo ≤ P80 y costo ≤ P80) = 0,8 × 0,8 = 0,64. Con el costo proporcional a la duración (por día), los dos se mueven juntos y la JCL es 0,8.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| JCL con costo independiente | 0,64 | 0,64 | ± 0,01 | Sí |
| JCL con costo ligado al plazo | 0,8 | 0,8 | ± 0,01 | Sí |

### V-06 · CPM: las cuatro relaciones, desfases y un festivo

**Planteamiento.** Cinco tareas con FC+2, CC+1, FF+1 y CF+6; calendario de lunes a viernes con festivo el 10/02/2027.

**Respuesta esperada.** Cálculo a mano con la convención de MS Project (el fin es el último día trabajado). A: 01–05/02. B (FC+2): los dos días de desfase son el lunes 8 y el martes 9; el miércoles 10 es festivo, así que B va del jueves 11 al lunes 15/02. C (CC+1): 02/02–05/02. D (FF+1 de B): termina un día laborable después que B, el martes 16/02, y empieza el lunes 15. E (CF+6 de C): termina 6 días laborables después del inicio de C, el martes 09/02 (empieza el viernes 05/02).

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| B: inicio / fin | 2027-02-11 / 2027-02-15 | 2027-02-11 / 2027-02-15 | exacto | Sí |
| C: inicio / fin | 2027-02-02 / 2027-02-05 | 2027-02-02 / 2027-02-05 | exacto | Sí |
| D: inicio / fin | 2027-02-15 / 2027-02-16 | 2027-02-15 / 2027-02-16 | exacto | Sí |
| E: inicio / fin | 2027-02-05 / 2027-02-09 | 2027-02-05 / 2027-02-09 | exacto | Sí |
| Fin del proyecto | 2027-02-16 | 2027-02-16 | exacto | Sí |

### V-07 · Calendarios por actividad

**Planteamiento.** Una tarea de 12 días con el calendario del proyecto (L–V) y con uno de 6 días (L–S).

**Respuesta esperada.** 12 días laborables desde el lunes 01/02/2027: de lunes a viernes terminan el martes 16/02; trabajando también los sábados, el sábado 13/02.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| Fin con L–V | 2027-02-16 | 2027-02-16 | exacto | Sí |
| Fin con L–S | 2027-02-13 | 2027-02-13 | exacto | Sí |

### V-08 · Clima: días perdidos en el mes

**Planteamiento.** Una tarea de 10 días que empieza el 01/02/2027, expuesta a un clima que quita siempre 4 días en febrero.

**Respuesta esperada.** Febrero de 2027 tiene 20 días laborables; si se pierden 4, se avanza al 80 %: 10 días de trabajo tardan 10 / 0,8 = 12,5.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| Duración (días laborables) | 12,5 | 12,5 | ± 0 | Sí |

## Casos publicados (GAO)

Ejemplos de las guías de la GAO (*Schedule Assessment Guide*, GAO‑16‑89G, y *Cost Estimating and
Assessment Guide*, GAO‑20‑195G, versiones web en guides.gaoinnovations.gov) que traen todos los datos
necesarios para reproducirlos (resumen de las fuentes en `docs/fuentes/casos_publicados_SRA.md`). Las
cifras que la GAO da como «cerca de» se comparan con una tolerancia mayor: no se sabe con qué
herramienta ni cuántas iteraciones se calcularon.

### G-01 · GAO: sesgo de convergencia con rutas del 60 %

**Planteamiento.** Cada ruta: una actividad de 10 días con un riesgo propio del 40 % que la alarga 5 días (llega a tiempo con 60 %). Las rutas convergen en un hito. 100.000 iteraciones.

**Respuesta esperada.** GAO‑16‑89G, mejor práctica 8, «Merge Bias and Schedule Underestimation» (figura 36): dos rutas independientes que llegan a tiempo con 60 % cada una dejan el hito a tiempo con 0,6 × 0,6 = 36 %; con tres rutas, 0,6³ ≈ 22 %.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P(hito a tiempo), 2 rutas | 0,36 | 0,362 | ± 0,005 | Sí |
| P(hito tarde), 2 rutas (24 % + 24 % + 16 %) | 0,64 | 0,638 | ± 0,005 | Sí |
| P(hito a tiempo), 3 rutas | 0,216 | 0,217 | ± 0,005 | Sí |

### G-02 · GAO: pasada adelante y atrás (arranque y pruebas de una casa)

**Planteamiento.** Tres medidores de un día (M1 electricidad, M2 gas, M3 agua) y tres pruebas: T1 (2 días, tras M1), T2 (1 día, tras M1 y M2) y T3 (2 días, tras M2 y M3), que acaban en un hito. Todas fin‑comienzo, lunes a viernes, inicio el martes 27 de enero de 2015.

**Respuesta esperada.** GAO‑16‑89G, apéndice IV «The Forward and Backward Pass», tabla 9 y figuras 51 a 56: inicios y fines tempranos y tardíos publicados, día a día. El complemento fecha un hito al comienzo del día laborable siguiente al fin de su predecesora (docs/QRSA_PLAN.md, Q1): el mismo instante que el «fin del 29/01» que publica la GAO.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| Inicio temprano de M1, M2 y M3 | 27/01, 27/01, 27/01 | 27/01, 27/01, 27/01 | exacto | Sí |
| T1: inicio y fin tempranos | 28/01 – 29/01 | 28/01 – 29/01 | exacto | Sí |
| T3: inicio y fin tempranos | 28/01 – 29/01 | 28/01 – 29/01 | exacto | Sí |
| T2: inicio temprano e inicio tardío | 28/01 – 29/01 | 28/01 – 29/01 | exacto | Sí |
| T2: holgura total (días) | 1 | 1 | exacto | Sí |
| T3: inicio tardío | 28/01 | 28/01 | exacto | Sí |
| M2: fin tardío | 27/01 | 27/01 | exacto | Sí |
| Hito de fin (publicado: fin del 29/01 = comienzo del 30/01) | 30/01 | 30/01 | exacto | Sí |

### G-03 · GAO: costo de 32 vehículos aéreos no tripulados, con tres puntos

**Planteamiento.** Siete elementos triangulares (miles de dólares por vehículo), sumados y multiplicados por 32 vehículos (el costo por vehículo se sortea una vez: los 32 son iguales). Con el motor de costos, 100.000 iteraciones. Cifras en miles de millones de dólares.

**Respuesta esperada.** GAO‑20‑195G (*Cost Estimating and Assessment Guide*), tabla 12 y figura 15: estimación puntual de 2,47 mil millones de dólares, P50 de 2,61, P80 de 2,79 y «cerca de un 15 %» de terminar en la estimación puntual o por debajo. La media y la desviación de una suma de triangulares independientes se conocen exactas.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| Estimación puntual (miles de millones) | 2,467 | 2,467 | exacto | Sí |
| Media (exacta) | 2,632 | 2,632 | ± 0,2 % | Sí |
| Desviación típica (exacta) | 0,147 | 0,147 | ± 1 % | Sí |
| P50 (publicado 2,61) | 2,61 | 2,611 | ± 1 % | Sí |
| P80 (publicado 2,79) | 2,79 | 2,765 | ± 2 % | Sí |
| P(costo ≤ estimación puntual) (publicado «cerca del 15 %») | 0,15 | 0,125 | ± 0,03 | Sí |

## Pendiente

- **Los demás ejemplos de la GAO‑16‑89G** (la casa con tres puntos, con *risk drivers*, con ramificación
  y con correlación: tablas 2 a 5, figuras 37 a 44) no publican la red completa (predecesoras,
  calendario, a qué actividades afecta cada riesgo). Sin ella no se pueden reproducir los números, solo
  los efectos que describen, que ya comprueban los casos analíticos: la causa común que ensancha la cola
  (V‑03) y la ramificación (V‑04). La priorización «quitar un riesgo y volver a simular» de su tabla 5 es
  el tornado por eliminación del panel.
- **GAO‑20‑195G con *risk drivers*** (tablas 13 y 14): no publica a qué elementos se aplica cada riesgo.
- **Hulett (1996)**, *Schedule Risk Analysis Simplified*: faltan los rangos de varias actividades, que
  solo están en las figuras del artículo.
- **AACE 57R‑09 y 64R‑11**: de pago; no se ha podido leer qué ejemplos numéricos traen.
