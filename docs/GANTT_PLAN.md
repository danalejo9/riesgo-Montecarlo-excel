# Gantt con diagnóstico de ruta crítica: auditoría, tecnología y plan

*Auditoría del 05/10/2026 contra `docs/GANTT_ESPECIFICACION.md` (la
especificación del usuario, guardada tal cual). El usuario aceptó las 9
decisiones del final. **G1 y G2 hechas el 05/10, G3 el 06/10** (ver
«Estado» al final).*

## Resumen

El **motor** ya está casi entero: el Gantt puede apoyarse en el mismo CPM del
QRSA (`engine/cronograma/`), que calcula fechas tempranas y tardías, holgura
total y libre con las cuatro relaciones, desfases, varios calendarios,
festivos y restricciones, y coincide día por día con la implementación de
referencia en Python en R1–R3. También existen el chequeo de calidad (DCMA),
la simulación QRSA con criticidad y P10–P90 por actividad, y la importación de
MS Project XML y P6 XER.

Lo que **no existe** es casi toda la **vista**: no hay un Gantt de verdad
(solo un esquema mínimo en el panel, después de simular), ni edición desde el
diagrama, ni flechas, ni jerarquía de resúmenes, ni seguimiento (avance, fecha
de corte, líneas base). Al motor le faltan cuatro cálculos: la holgura de cada
relación (relaciones impulsoras), la ruta más larga, las rutas de holgura
múltiples y la programación con avance real.

## Tabla de brechas

| § | Tema | Estado | Qué hay hoy | Qué falta |
|---|---|---|---|---|
| 1 | Principios (lógica manda, recalcular, una fuente) | **Parcial** | Las fechas salen del CPM; las hojas son la fuente; se recalcula al simular o revisar | Recalcular en cada edición dentro del Gantt |
| 2 | Disposición (grid + línea de tiempo, barra, detalles, leyenda) | **No existe** | `GanttAjustado` en el panel: barras base y P50–P80 en un SVG pequeño | Todo |
| 3.1 | Columnas | **Parcial** | Los datos existen: ID, WBS, tipo, duración, calendario, restricción, fechas, holguras, crítica, P50/P80, criticidad (hojas y `ResultadoCpm`) | Grid, columna Predecesoras/Sucesoras en texto `5FC+2d`, fecha límite separada de FNLT, seguimiento, línea base, recurso, diagnóstico por fila |
| 3.2 | Edición en grid, sangría, insertar, mover, copiar, teclado | **No existe** | Se edita en las hojas de Excel | Todo |
| 4 | Escala de tiempo, zoom, no laborables, líneas de hoy/corte/meta | **No existe** | El calendario sabe qué días son laborables y festivos | Todo |
| 5 | Barras y símbolos | **No existe** | Datos de crítica, holgura, hitos y P10–P90 por actividad (`fechas` de la simulación) | Todo; resúmenes necesitan jerarquía |
| 6 | Flechas de los 4 tipos, ruteo, crear vínculos | **No existe** | Relaciones con tipo y desfase en la red compilada | Todo |
| 7.1 | Holgura total ≤ 0, ruta más larga, relación impulsora | **Parcial** | Holgura total ≤ 0 | Holgura de cada relación y ruta más larga en `engine/cronograma/` |
| 7.2 | Colores, filtros, rutas de holgura múltiples | **No existe** | Rutas críticas frecuentes (QRSA), que es otra cosa | Rutas de holgura numeradas (estilo P6) |
| 7.3 | Ruta impulsora hacia una actividad, «¿por qué es crítica?» | **No existe** | — | Trazado sobre las relaciones impulsoras |
| 7.4 | Alertas de ruta crítica | **Parcial** | Holgura negativa en el chequeo de calidad | Ruta que no va del inicio al fin, crítica por resumen o restricción dura, proporción de críticas |
| 8 | Diagnóstico de calidad | **Parcial** | `chequearCalidad`: extremos abiertos, adelantos, desfases > 5 %, CF, duras, holgura alta y negativa, duraciones largas, sin incertidumbre, correlación | % de relaciones FC, umbrales configurables, fechas inválidas, avance fuera de secuencia, CPLI y BEI, ícono por fila |
| 9 | Edición en el diagrama, deshacer, automático/manual | **No existe** | — | Todo |
| 10 | Seguimiento y líneas base | **No existe** | — | Fecha de corte, reales, lógica retenida o anulación por progreso **en el motor**, líneas base |
| 11 | Filtros, agrupar, buscar, vistas guardables | **No existe** | — | Todo |
| 12 | Integración QRSA | **Parcial** | P10–P90, P50/P80 y criticidad por actividad ya se calculan | Bigotes, mapa de calor, probabilidad en hitos, «Correr QRSA» desde la vista |
| 13 | Importar/exportar, imagen y PDF | **Parcial** | Importar MSPDI y XER; informe ejecutivo imprimible | Exportar MSPDI y CSV, PNG/SVG, PDF paginado del Gantt, hallazgos a una hoja |
| 14 | Tecnología y rendimiento | **Parcial** | Office.js + React; ventana flotante (`displayDialogAsync`) ya usada por el explorador; CPM de 300 actividades en una fracción de milisegundo | Canvas virtualizado, mensajes por diferencias, medida de 2.000 actividades |
| 15 | Pruebas | **Parcial** | Prueba 1 sin holgura libre en el CSV de referencia; prueba 5 (ciclos) en el motor; prueba 7 parcial | Las demás |

## Propuesta de tecnología (sección 14)

**Construcción propia en Canvas, sin librería**, como recomienda la
especificación:

- Las librerías gratuitas (frappe-gantt) no dibujan los cuatro tipos de
  flecha ni dejan pintar la ruta impulsora o las capas QRSA; las completas
  (dhtmlxGantt, Bryntum) son de pago o GPL, y el complemento va a ser un
  producto. Además, cualquier librería trae su propio cálculo de fechas, que
  habría que desactivar.
- **Canvas** para la línea de tiempo (barras, flechas, escala, sombreado):
  con 2.000 filas solo se dibujan las visibles y el zoom no crea miles de
  elementos. **DOM** solo para el grid editable (también virtualizado), los
  tooltips y los menús.
- **Dónde**: (a) una vista compacta en el panel (sustituye al esquema actual
  y aparece también antes de simular) y (b) la vista completa como **una
  pestaña «Gantt» en la ventana flotante** que ya existe. Office.js solo deja
  abrir **una ventana por complemento**: si el Gantt abriera otra, cerraría el
  explorador. La ventana se abre en porcentaje de la pantalla (hasta el 100
  %); en Excel para la Web va dentro de la página. Esto se verifica en las
  tres plataformas en la guía.
- **Sincronización**: la ventana no comparte el proceso con el panel. El panel
  lee las hojas, calcula y manda a la ventana el cronograma calculado una vez;
  cada edición en la ventana vuelve al panel como un cambio pequeño («duración
  de E = 52», «nueva relación D→F FC+2»); el panel la valida, recalcula y la
  escribe en la hoja en bloque, y devuelve solo lo que cambió.
- **Motor**: el mismo CPM. Recalcular 2.000 actividades lleva milisegundos
  (300 actividades × 5.000 iteraciones tardan 3,8 s, es decir menos de 1 ms por
  CPM), así que el hilo aparte solo hará falta si la medida lo pide.
- Sin formato condicional ni formas de Excel, como pide la especificación.

## Lo que hay que añadir al motor (sin duplicarlo)

1. **Holgura de cada relación** y relaciones impulsoras (fórmulas de §7.1, en
   días del calendario de la sucesora; ya existe `limiteRelacion`, que da el
   límite que impone cada relación).
2. **Ruta más larga**: hacia atrás desde el fin, solo por relaciones con
   holgura 0, y por restricciones que fijen la fecha.
3. **Rutas de holgura múltiples** (estilo P6): ruta 1 = la más larga; la
   siguiente, la cadena impulsora de la actividad no asignada con menor
   holgura libre hacia la ruta anterior, hasta N.
4. **Seguimiento**: con fecha de corte, las actividades terminadas usan sus
   fechas reales; las que están en curso, su inicio real más la duración
   restante desde la fecha de corte; nada pendiente empieza antes de la fecha
   de corte; lógica retenida o anulación por progreso.
5. **Fecha límite** (*deadline*) separada de la restricción FNLT (se comportan
   igual en el cálculo; pueden convivir).
6. **Resúmenes** calculados desde la jerarquía WBS (inicio = el menor de sus
   hijas, fin = el mayor), sin entrar en la red.

## Plan por fases (bloque G del roadmap)

- **G1. Visualización con lógica** (§16 fase 1): vista compacta en el panel
  (también antes de simular) y pestaña Gantt en la ventana: grid de solo
  lectura con las columnas base, escala de dos niveles con zoom y «ajustar
  todo», barras de tarea, hito y resumen (desde la WBS), flechas de los 4
  tipos con ruteo ortogonal, crítica y casi crítica (umbral 5 días), línea de
  holgura, tooltip, días no laborables y festivos, líneas de hoy, inicio, fin
  y meta, filtro «solo ruta crítica», leyenda. Botón **Gantt** en el grupo
  Cronograma de la cinta. Pruebas 2 y 8.
- **G2. Edición y diagnóstico** (fase 2): edición en el grid (duración,
  nombre, predecesoras en texto `5FC+2d`, restricción) y en las barras
  (duración, mover con confirmación de «No comenzar antes de»), crear,
  editar y borrar vínculos arrastrando, insertar y borrar filas, sangría
  (cambia la WBS), deshacer y rehacer, automático/manual; holgura de
  relación, ruta más larga frente a holgura total, ruta impulsora hacia una
  actividad, «¿por qué es crítica?», calidad completa con ícono por fila y
  umbrales configurables. Pruebas 3 a 7.
- **G3. Seguimiento e integración** (fase 3): fecha de corte, reales, avance y
  lógica retenida/anulación en el motor; hasta 3 líneas base con variación;
  rutas de holgura múltiples; capas QRSA (bigotes P10–P90, mapa de calor de
  criticidad, probabilidad en hitos, «Correr QRSA» desde la vista);
  exportar MSPDI y CSV; PNG y PDF paginado; filtros, agrupar, buscar y vistas
  guardables. Prueba 9.

## Decisiones para confirmar con el usuario

1. **Dónde**: pestaña «Gantt» en la ventana flotante que ya existe (con el
   explorador y la lista) y vista compacta en el panel. *Recomendado*:
   Office.js no deja abrir dos ventanas.
2. **Las hojas siguen siendo la verdad**: toda edición del Gantt se escribe en
   Actividades y Relaciones. Ojo: Excel no puede deshacer lo que escribe un
   complemento (Ctrl+Z de Excel no lo cubre); el deshacer será el del propio
   Gantt, mientras dure la sesión.
3. **Jerarquía por la WBS**: una actividad es resumen si otras cuelgan de su
   WBS (1 → 1.1, 1.2); sangrar o quitar sangría reescribe la WBS. Los
   resúmenes no entran en el cálculo (como hoy) y sus fechas salen de las
   hijas.
4. **Seguimiento en columnas nuevas de Actividades** (comienzo real, fin real,
   % completado, duración restante) y **Fecha de corte** en Config, con
   «lógica retenida» por defecto. Las líneas base en una hoja nueva
   **Lineas_Base** (hasta 3).
5. **Ruta crítica por defecto: holgura total ≤ 0** (como MS Project), con el
   cambio a «ruta más larga» (como P6) en la barra; umbral de casi crítica 5
   días, configurable.
6. **PDF**: por la impresión del navegador, con el tamaño y la orientación
   elegidos y las páginas armadas por el complemento (encabezados repetidos,
   leyenda, pie); PNG como descarga. Generar el PDF directamente exigiría
   una librería externa.
7. **Validación sin MS Project**: la prueba 1 se hace como en el QRSA
   (Python y ProjectLibre), añadiendo la holgura libre y un caso con
   restricciones y festivos al generador de referencias.
8. **Cinta**: un botón **Gantt** en el grupo Cronograma (cambia el manifiesto:
   hay que reiniciar Excel).
9. **Orden**: G1, G2 y G3 seguidas, con un commit por unidad, como en el QRSA.

## Estado (05/10/2026)

**G1 y G2, en código y probadas en el banco.** Las pruebas de la
especificación (§15):

| Prueba | Dónde | Estado |
|---|---|---|
| 1. Fechas y holguras contra MS Project | `tests/unit/cronogramaReferencias.test.ts` (R1–R3, Python y ProjectLibre) | ✅ fechas, holgura total y libre |
| 2. Anclaje de las flechas de los 4 tipos, con desfase negativo | `tests/unit/ganttTrazado.test.ts` | ✅ |
| 3. Ruta más larga frente a holgura total con una FNLT | `tests/unit/ganttMotor.test.ts` | ✅ |
| 4. Ruta impulsora hacia un hito = relaciones con holgura 0 | `tests/unit/ganttMotor.test.ts` | ✅ |
| 5. Un vínculo que cierra un ciclo se rechaza | `tests/unit/ganttEdicion.test.ts` | ✅ |
| 6. Deshacer y rehacer restauran el estado exacto | `tests/unit/ganttEdicion.test.ts` (10 ediciones mixtas) | ✅ |
| 7. Cada chequeo detecta su caso y no da falsos positivos | `cronogramaCalidad.test.ts`, `ganttVista.test.ts`, `ganttSeguimiento.test.ts`, `ganttLineaBase.test.ts` | ✅ también fechas inválidas, fuera de secuencia, BEI y CPLI |
| 8. 2.000 actividades y 3.000 relaciones | `tests/unit/ganttRendimiento.test.ts` y el banco | ✅ vista 69–75 ms; 40,7 cuadros/s en vertical, 60 en horizontal (Chromium sin GPU) |
| 9. PDF paginado | `tests/unit/ganttTrazado.test.ts` (paginar) y el banco | ✅ ninguna fila se pierde ni se repite; escala en cada página, leyenda en la última |

Lo que queda de G1/G2 frente a la especificación, a propósito para G3 o
después: selección múltiple y copiar/pegar filas, menú contextual,
reordenar columnas, desplazar unos píxeles las flechas paralelas, el
recálculo en un Web Worker (no hace falta: 75 ms con 2.000 actividades).

**G3 (06/10)**: seguimiento con lógica retenida o anulación por progreso
(`ganttSeguimiento.test.ts`), líneas base con BEI y CPLI y probabilidad de
hitos (`ganttLineaBase.test.ts`), rutas de holgura (`ganttMotor.test.ts`),
MSPDI de ida y vuelta y CSV (`ganttExportar.test.ts`), paginación
(`ganttTrazado.test.ts`). Pendiente para después: selección múltiple,
copiar y pegar filas, menú contextual, reordenar columnas, arrastrar el
borde del avance, agrupar con encabezados de grupo.

**06/10, tras la ronda Q del usuario.** Debajo de las barras, tras
simular, la franja «Fechas de fin posibles» (como la demostración animada):
una barra por semana en el mismo eje, azules hasta la meta, naranjas
después, líneas P50/P80/Meta y la probabilidad de cumplir la meta (la misma
de Resultados); «Ajustar todo» llega hasta la última fecha simulada. La
ventana vuelve a pedir el cronograma si el primer aviso se pierde (se
quedaba en «Leyendo el cronograma…»). Guía GT31–GT32.

**06/10, editores en ventana.** Junto a la pestaña Gantt, Calendarios,
Riesgos y Ramas: formularios que leen las hojas y, al guardar, reescriben
el bloque con un cambio «rango» validado con `leerCronograma`; el mismo
historial (Deshacer) que el Gantt. La animación de iteraciones se descartó.

