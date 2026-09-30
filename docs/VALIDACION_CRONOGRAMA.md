# Validación del módulo de cronograma (QSRA)

> Documento generado por `npm run validacion:cronograma` a partir de `tests/validacion/casos.ts`;
> los mismos casos se comprueban en cada `npm test`. No se edita a mano.

**Resultado:** 31 de 31 comprobaciones dentro de su tolerancia, en 12 casos.

## Cómo se valida

1. **Casos analíticos**: redes pequeñas cuya respuesta sale de una fórmula o de un cálculo a mano, y que
   cubren lo que distingue un análisis de riesgo del cronograma: la suma de tareas en serie, el sesgo de
   convergencia (*merge bias*), la criticidad, los *risk drivers* (AACE 57R‑09), la ramificación
   probabilística, la probabilidad conjunta de plazo y costo (JCL), las cuatro relaciones con retardos y
   festivos, los calendarios por actividad y el clima. Los Monte Carlo usan 100.000 iteraciones y una
   tolerancia del orden de su error de muestreo; lo determinista, exacto.
2. **Implementación independiente**: `ejemplos/generar-cronograma.py` (Python, escrito aparte) calcula el
   CPM y el Monte Carlo del proyecto de prueba (`ejemplos/demo-cronograma.xlsx`). El CPM debe coincidir
   fila a fila; el Monte Carlo, que usa otros números aleatorios, dentro de su error.

Todo es reproducible: el motor usa números aleatorios con semilla (Philox), así que con la misma semilla
da exactamente los mismos resultados en cualquier equipo, con uno o con varios hilos.

## Casos analíticos

### V-01 · Diez tareas en serie

**Planteamiento.** 10 tareas fin‑comienzo, cada una triangular(8, 10, 15) días. 100.000 iteraciones.

**Respuesta esperada.** Suma de variables independientes: la media y la varianza se suman (exacto, para cualquier distribución).

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| Media de la duración total (días) | 110 | 110,038 | ± 0,05 | Sí |
| Desviación típica (días) | 4,655 | 4,669 | ± 0,05 | Sí |

### V-02.1 · Convergencia de 1 ruta paralela (merge bias)

**Planteamiento.** Una ruta de una tarea triangular(8, 10, 15) que termina en un hito (la referencia sin convergencia). 100.000 iteraciones.

**Respuesta esperada.** El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^1, así que el percentil p es F⁻¹(p^(1/1)) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P50 del fin (días) | 10,817 | 10,821 | ± 0,05 | Sí |
| P80 del fin (días) | 12,354 | 12,348 | ± 0,05 | Sí |

### V-02.2 · Convergencia de 2 rutas paralelas (merge bias)

**Planteamiento.** 2 rutas de una tarea triangular(8, 10, 15) que convergen en un hito. 100.000 iteraciones.

**Respuesta esperada.** El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^2, así que el percentil p es F⁻¹(p^(1/2)) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P50 del fin (días) | 11,798 | 11,795 | ± 0,05 | Sí |
| P80 del fin (días) | 13,078 | 13,076 | ± 0,05 | Sí |
| Criticidad de cada ruta (por simetría, 1/n) | 0,5 | 0,5 | ± 0,01 | Sí |

### V-02.5 · Convergencia de 5 rutas paralelas (merge bias)

**Planteamiento.** 5 rutas de una tarea triangular(8, 10, 15) que convergen en un hito. 100.000 iteraciones.

**Respuesta esperada.** El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^5, así que el percentil p es F⁻¹(p^(1/5)) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P50 del fin (días) | 12,871 | 12,87 | ± 0,05 | Sí |
| P80 del fin (días) | 13,764 | 13,764 | ± 0,05 | Sí |
| Criticidad de cada ruta (por simetría, 1/n) | 0,2 | 0,2 | ± 0,01 | Sí |

### V-03 · Risk driver: una causa común frente a dos independientes

**Planteamiento.** Dos tareas fijas de 10 días en paralelo; impacto +20 % (a 12 días). 100.000 iteraciones.

**Respuesta esperada.** Con un solo riesgo (30 %) que alarga a la vez las dos rutas, el proyecto se retrasa con probabilidad 0,3; con dos riesgos independientes, uno por ruta, con 1 − 0,7² = 0,51. Es la correlación que modela el método de risk drivers (AACE 57R‑09) sin pedir coeficientes.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P(fin = 12 días), causa común | 0,3 | 0,302 | ± 0,005 | Sí |
| P(fin = 12 días), causas independientes | 0,51 | 0,509 | ± 0,005 | Sí |

### V-04 · Ramificación: un riesgo que añade una actividad

**Planteamiento.** A (10 días fijos) → fin; reproceso condicional de 5 días. 100.000 iteraciones.

**Respuesta esperada.** Si el riesgo ocurre (25 %), aparece un reproceso de 5 días entre A y el fin: el fin es 15 días con probabilidad 0,25 y 10 en el resto.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P(fin = 15 días) | 0,25 | 0,25 | ± 0,005 | Sí |

### V-05 · Probabilidad conjunta de plazo y costo (JCL)

**Planteamiento.** Una tarea triangular(8, 10, 15); (a) costo fijo con rango propio; (b) solo costo por día. 100.000 iteraciones.

**Respuesta esperada.** Con costo independiente del plazo, P(plazo ≤ P80 y costo ≤ P80) = P(plazo ≤ P80) × 0,8. Como el plazo se cuenta en días enteros, P(plazo ≤ P80) = F(⌈F⁻¹(0,8)⌉) = 0,8857, y la JCL esperada es 0,7086. Con el costo proporcional a la duración (costo por día), los dos se mueven juntos y la JCL es 0,8.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| JCL con costo independiente | 0,709 | 0,708 | ± 0,01 | Sí |
| JCL con costo ligado al plazo | 0,8 | 0,8 | ± 0,01 | Sí |

### V-06 · CPM: las cuatro relaciones, retardos y un festivo

**Planteamiento.** Cinco tareas con FC+2, CC+1, FF+1 y CF+6; calendario de lunes a viernes con festivo el 10/02/2027.

**Respuesta esperada.** Cálculo a mano con la convención de MS Project (el fin es el último día trabajado). A: 01–05/02. B (FC+2): los dos días de retardo son el lunes 8 y el martes 9; el miércoles 10 es festivo, así que B va del jueves 11 al lunes 15/02. C (CC+1): 02/02–05/02. D (FF+1 de B): termina un día laborable después que B, el martes 16/02, y empieza el lunes 15. E (CF+6 de C): termina 6 días laborables después del inicio de C, el martes 09/02 (empieza el viernes 05/02).

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

## Contra la implementación independiente en Python

### P-01 · CPM del proyecto de prueba (20 actividades)

**Planteamiento.** Centro comunitario: las cuatro relaciones, retardos y un adelanto, dos hitos, «inicio no antes de», cinco festivos.

**Respuesta esperada.** El CPM de `generar-cronograma.py`, escrito aparte en Python: fechas temprana y tardía, holgura y ruta crítica.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| Filas idénticas (fechas, holgura, crítica) | 20 de 20 | 20 de 20 | exacto | Sí |

### P-02 · Monte Carlo del proyecto de prueba (PERT + cinco riesgos)

**Planteamiento.** 20.000 iteraciones, semilla por defecto, duraciones PERT.

**Respuesta esperada.** El Monte Carlo de `generar-cronograma.py` (otros números aleatorios, 20.000 iteraciones): los percentiles deben coincidir dentro del error de muestreo.

| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |
|---|---|---|---|---|
| P10 (días laborables) | 124 | 124 | ± 1 | Sí |
| P50 (días laborables) | 135 | 135 | ± 1 | Sí |
| P80 (días laborables) | 143 | 143 | ± 1 | Sí |
| P90 (días laborables) | 148 | 148 | ± 1 | Sí |
| Costo P50 | 1.305.742 | 1.305.203 | ± 1 % | Sí |
| Costo P80 | 1.343.194 | 1.342.925 | ± 1 % | Sí |
| JCL | 76 % | 76,2 % | ± 3 puntos | Sí |

## Pendiente

- Reproducir los ejemplos numéricos publicados en la guía GAO‑16‑89G (*Schedule Assessment Guide*) y en
  la AACE 57R‑09 (*Integrated Cost and Schedule Risk Analysis Using Risk Drivers*), cuando se tengan los
  documentos (la de AACE es de pago). El formato de esta página ya los admite: cada caso con su
  planteamiento, su respuesta publicada y la del motor.
- Más comprobaciones en el libro de pruebas (avance, calendarios, clima, hitos) están en
  `tests/unit/cronograma*.test.ts`.
