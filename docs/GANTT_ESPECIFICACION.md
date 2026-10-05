# Especificación funcional y técnica — Diagrama de Gantt con diagnóstico de ruta crítica

*Entregada por el usuario el 05/10/2026. Se guarda tal cual como fuente de la
verdad; la auditoría, las brechas y el plan están en `docs/GANTT_PLAN.md`.*

**Propósito:** visualizar, editar y diagnosticar cronogramas con lógica de red (CPM), con un comportamiento equivalente al de MS Project y Primavera P6 en lo esencial.
**Relación con otros módulos:** reutiliza el **mismo motor CPM** del complemento QRSA (`especificacion-qrsa.md`, sección 4). No se debe duplicar el cálculo: el Gantt solo lee y escribe el modelo de datos y llama al motor.

> **Instrucción para Claude Code:** primero audita lo que existe hoy (motor CPM, hojas, UI) y entrega una tabla de brechas por sección (Cumple / Parcial / No existe). Propón la tecnología de renderizado (sección 14) con su justificación antes de implementar. Implementa por fases (sección 16).

---

## 1. Principios

1. **La lógica manda, no las fechas.** Las fechas se calculan con el CPM a partir de duraciones, relaciones y calendarios. El usuario no "dibuja" fechas salvo que fije restricciones de forma explícita.
2. **Recalcular en cada cambio** (modo automático): cualquier edición dispara el CPM y actualiza las barras, las flechas y las holguras.
3. **Diagnóstico visible:** la ruta crítica, la holgura y los problemas de lógica se ven en el propio diagrama, no solo en un reporte.
4. **Una sola fuente de datos:** las hojas de Excel (o el modelo en memoria) son la verdad, y el Gantt es una vista de ellas.

---

## 2. Disposición general

- **Panel dividido:** tabla (grid) a la izquierda y línea de tiempo a la derecha, con un divisor redimensionable.
- Scroll vertical **sincronizado** entre los dos paneles; scroll horizontal independiente.
- Encabezados fijos (columnas y escala de tiempo).
- Barra de herramientas: zoom, filtros, buscar, ir a hoy, ir a la actividad seleccionada, mostrar u ocultar capas (flechas, línea base, holgura, riesgos).
- Panel lateral de detalles de la actividad seleccionada (pestañas: General, Predecesoras, Sucesoras, Avance, Riesgos, Diagnóstico).
- Leyenda de colores y símbolos.

---

## 3. Tabla (grid)

### 3.1 Columnas disponibles (selector de columnas, reordenables, ancho ajustable)
| Columna | Notas |
|---|---|
| ID / n.º de fila | Inmutable una vez creado |
| EDT / WBS | Generada desde la jerarquía |
| Nombre | Con sangría por nivel y botón para expandir o contraer |
| Tipo | Tarea, hito, resumen |
| Duración | Días laborables; las de resumen son calculadas |
| Comienzo / Fin | Calculadas; editables solo si se fija una restricción |
| Predecesoras | Texto editable con la sintaxis `5FC+2d; 7CC; 9FF-1d` |
| Sucesoras | Misma sintaxis |
| Holgura total / libre | En días; resaltar negativos |
| Crítica | Sí / No |
| Restricción | Tipo + fecha |
| Fecha límite (*deadline*) | No mueve la actividad; genera holgura negativa si se incumple |
| % completado, comienzo y fin reales, duración restante | Seguimiento |
| Línea base: comienzo, fin, variación | Variación = fin actual − fin de la línea base |
| Calendario, recurso, costo | Opcionales |
| P50 / P80 fin, índice de criticidad | Vienen de QRSA (sección 12) |
| Diagnóstico | Íconos de alertas (sección 8) |

### 3.2 Comportamiento
- Edición en celda con validación inmediata (por ejemplo, un ID de predecesora inexistente o un ciclo se rechaza con un mensaje).
- Sangrar o quitar sangría (crea o deshace actividades resumen).
- Insertar, eliminar, mover filas (arrastrar o con atajos de teclado).
- Selección múltiple; copiar y pegar filas conservando las relaciones internas.
- Navegación con teclado (flechas, Tab, Enter, F2 para editar).
- Ordenar y agrupar sin alterar el orden real del cronograma (vista temporal).

---

## 4. Escala de tiempo

- **Encabezado de dos niveles** configurable: año/trimestre, trimestre/mes, mes/semana, semana/día.
- **Zoom** con botones, con Ctrl+rueda y con "ajustar todo el proyecto".
- Sombreado de **días no laborables y festivos** según el calendario del proyecto (festivos de Colombia incluidos).
- Líneas verticales:
  - **Hoy**
  - **Fecha de corte o de estado** (*status date*), con un estilo distinto a hoy
  - Inicio y fin del proyecto
  - Fechas meta o hitos contractuales (configurables)
- Etiquetas de fecha en formato `dd/mm/aaaa` y semanas ISO opcionales.

---

## 5. Barras y símbolos

| Elemento | Representación |
|---|---|
| Tarea normal | Barra rectangular |
| **Tarea crítica** | Barra roja (color configurable) |
| **Casi crítica** | Naranja si la holgura total ≤ umbral (por defecto 5 días) |
| Holgura negativa | Barra roja con borde o patrón de alerta |
| Hito | Rombo; rojo si es crítico |
| Resumen | Barra tipo corchete que abarca a las hijas |
| **Avance** | Relleno interno proporcional al % completado |
| **Línea base** | Barra delgada gris debajo de la barra actual |
| **Holgura total** | Línea delgada que sale del fin de la barra hasta el fin tardío (LF) |
| Restricción | Ícono al inicio o al fin de la barra según el tipo (con tooltip) |
| Fecha límite | Flecha hacia abajo en la fecha |
| **Rango de riesgo** (QRSA) | Bigote P10–P90 sobre el fin de la barra, con una marca en P80 |
| Riesgo asociado | Ícono pequeño en la barra con tooltip de los riesgos del registro |

- Etiquetas configurables a la derecha de la barra: nombre, recurso, fechas, holgura.
- **Tooltip** al pasar el cursor: nombre, fechas, duración, holgura total y libre, predecesoras y sucesoras con su tipo y desfase, y alertas.

---

## 6. Flechas de dependencia

### 6.1 Puntos de anclaje por tipo de relación
| Tipo | Sale de | Llega a |
|---|---|---|
| **FC** (fin–comienzo) | Fin de la predecesora | Comienzo de la sucesora |
| **CC** (comienzo–comienzo) | Comienzo de la predecesora | Comienzo de la sucesora |
| **FF** (fin–fin) | Fin de la predecesora | Fin de la sucesora |
| **CF** (comienzo–fin) | Comienzo de la predecesora | Fin de la sucesora |

### 6.2 Trazado
- Ruteo **ortogonal** (codos de 90°) con un pequeño tramo horizontal de salida y de llegada.
- Si la sucesora empieza antes del punto de salida (por un desfase negativo o un tipo CC/FF), el ruteo da la vuelta por debajo sin atravesar barras.
- Evitar el solapamiento de flechas paralelas (desplazamiento de unos píxeles).
- Punta de flecha visible en la llegada.
- **Desfase:** etiqueta opcional `+2d` o `−1d` sobre el tramo horizontal.

### 6.3 Estilos y estados
- Flecha **crítica o impulsora** (*driving*) en rojo y continua; no impulsora en gris.
- Al seleccionar una actividad: resaltar **todas** sus predecesoras y sucesoras directas y atenuar el resto.
- Opción para resaltar la **cadena completa** aguas arriba y aguas abajo (sección 7.3).
- Clic en una flecha: seleccionarla. Doble clic: editar el tipo y el desfase. Tecla Supr: eliminarla (con deshacer).

### 6.4 Crear vínculos
- Arrastrar desde el borde de una barra hasta otra barra. El tipo se deduce del borde de origen y de destino (fin→comienzo = FC, etc.) y es editable después.
- Desde la columna Predecesoras (texto).
- Desde el panel de detalles.
- Validación: rechazar ciclos y vínculos duplicados.

---

## 7. Diagnóstico de ruta crítica

### 7.1 Cálculo
- Ruta crítica por **holgura total ≤ 0** (definición tradicional).
- **Ruta más larga** (*longest path*): se traza hacia atrás desde el fin del proyecto siguiendo solo las relaciones impulsoras. Es la definición correcta cuando hay restricciones o varios calendarios, porque entonces la holgura total ≤ 0 puede marcar actividades que no impulsan el fin. **Ambas definiciones deben estar disponibles** y debe indicarse cuál está activa.
- **Relación impulsora:** aquella cuya **holgura de la relación** es 0, es decir, la que efectivamente determina la fecha de la sucesora.
  - FC: `holgura_rel = ES_suc − (EF_pred + lag)`
  - CC: `holgura_rel = ES_suc − (ES_pred + lag)`
  - FF: `holgura_rel = EF_suc − (EF_pred + lag)`
  - CF: `holgura_rel = EF_suc − (ES_pred + lag)`
  (en días laborables del calendario de la sucesora)

### 7.2 Visualización
- Colorear las actividades y flechas críticas y casi críticas (sección 5).
- Filtro rápido "Solo ruta crítica" y "Crítica + casi crítica".
- **Rutas de holgura múltiples** (al estilo P6): numerar la ruta 1 (crítica), la ruta 2 (siguiente menor holgura), etc., hasta N rutas configurables, con colores o una columna "Ruta n.º".

### 7.3 Trazado de cadenas
- **Ruta impulsora hacia una actividad seleccionada:** desde cualquier actividad o hito, resaltar la cadena de predecesoras impulsoras hasta el inicio. Responde a la pregunta "¿qué controla la fecha de este hito?".
- Trazado aguas arriba y aguas abajo (todas las relaciones, no solo las impulsoras).
- Panel "¿Por qué es crítica esta actividad?": muestra la predecesora impulsora, la sucesora que consume su holgura y la restricción si la hay.

### 7.4 Alertas de ruta crítica
- La ruta crítica no llega del inicio al fin del proyecto (lógica rota).
- Holgura negativa (lista de actividades y causa: restricción o fecha límite).
- La ruta crítica pasa por una actividad resumen o con una restricción dura.
- Ruta crítica demasiado corta o demasiado larga en proporción a la red (por ejemplo, < 5 % o > 60 % de las actividades), como advertencia.

---

## 8. Diagnóstico de calidad del cronograma

Inspirado en DCMA 14 puntos (umbrales configurables). Se muestra un **ícono por fila** en la columna Diagnóstico y un **panel resumen con semáforo**; un clic en un hallazgo filtra o navega a las actividades.

| Chequeo | Umbral por defecto |
|---|---|
| Lógica faltante (sin predecesora o sin sucesora, salvo inicio y fin) | ≤ 5 % |
| Desfases negativos (*leads*) | 0 |
| Desfases positivos | ≤ 5 % de las relaciones |
| Relaciones distintas de FC | ≥ 90 % FC |
| Relaciones CF | 0 (advertir) |
| Restricciones duras | ≤ 5 % |
| Holgura total alta | > 44 días, ≤ 5 % |
| Holgura negativa | 0 |
| Duraciones largas | > 44 días, ≤ 5 % |
| Fechas inválidas (real en el futuro o pronóstico en el pasado respecto a la fecha de corte) | 0 |
| Vínculos a actividades resumen | 0 |
| Avance fuera de secuencia | Advertir |
| Prueba de integridad de la ruta crítica (CPLI ≥ 0,95, BEI ≥ 0,95 si hay línea base) | Informativo |

---

## 9. Edición interactiva en el diagrama

- **Arrastrar una barra horizontalmente:** en modo automático, pedir confirmación porque crea una restricción "No comenzar antes de". Opción para cancelar.
- **Redimensionar el extremo derecho:** cambia la duración.
- Arrastrar el borde del relleno de avance: cambia el % completado.
- Crear y editar vínculos (sección 6.4).
- Menú contextual: insertar arriba o abajo, eliminar, convertir en hito, agregar predecesora, ir a predecesora o sucesora, fijar o quitar restricción.
- **Deshacer / rehacer** ilimitado en la sesión (Ctrl+Z / Ctrl+Y).
- Modo **automático** (recalcula siempre) y **manual** (recalcula con F9 o un botón), con indicador visible.

---

## 10. Seguimiento y líneas base

- **Fecha de corte** configurable.
- Campos reales: comienzo real, fin real, % completado, duración restante.
- Lógica para el avance fuera de secuencia: **lógica retenida** (por defecto) o **anulación por progreso**, configurable.
- Al recalcular, el trabajo restante se programa después de la fecha de corte.
- **Líneas base:** guardar hasta 3 (configurable) con nombre y fecha; elegir cuál se dibuja.
- Columnas de variación y filtro "Actividades atrasadas respecto a la línea base".

---

## 11. Vistas, filtros y búsqueda

- Filtros predefinidos: críticas, casi críticas, hitos, atrasadas, en curso, sin iniciar, con alertas, con riesgos.
- Filtros personalizados (campo / operador / valor).
- Agrupar por WBS, recurso, calendario o ruta de holgura.
- Contraer o expandir hasta el nivel N.
- Buscar por nombre o ID con resaltado.
- Vistas guardables: columnas + filtro + zoom + capas.

---

## 12. Integración con QRSA

- Columnas: P50 y P80 de fin, desviación, **índice de criticidad** e índice de sensibilidad.
- Capa opcional de **bigotes P10–P90** en las barras (sección 5).
- **Mapa de calor** de criticidad probabilística: el color de la barra según el % de iteraciones crítica.
- En los hitos: etiqueta con la probabilidad de cumplir la fecha planeada.
- Íconos de riesgo enlazados al registro: clic → panel con los riesgos que impactan la actividad.
- Botón "Correr QRSA" desde la vista; los resultados se refrescan en el Gantt al terminar.

---

## 13. Importación, exportación e impresión

- Importar y exportar: MS Project XML (MSPDI), Primavera XER (importar), Excel/CSV.
- **Exportar imagen** (PNG/SVG) y **PDF** con:
  - Rango de fechas y columnas seleccionables
  - Ajustar a N páginas de ancho o alto, orientación, tamaño (Carta / Oficio / A3)
  - Repetir los encabezados en cada página
  - Encabezado y pie: nombre del proyecto, fecha de corte, logo, n.º de página
  - Leyenda incluida
- Exportar la lista de hallazgos del diagnóstico a una hoja.

---

## 14. Tecnología de renderizado y rendimiento

### 14.1 Plataforma (decidida)
El complemento está hecho en **Office.js + TypeScript + React (Vite)**, con un runtime compartido, motor propio en Web Workers y un motor CPM propio. El Gantt se construye sobre esa base:

- **Componente React** que dibuja en **Canvas** (barras, flechas, escala de tiempo) con una capa DOM solo para el grid editable y los tooltips. SVG solo si la prueba de rendimiento de la sección 14.3 se cumple igual.
- **Dónde vive:** el panel lateral es angosto para un Gantt. Ofrecer **dos modos**: (a) vista compacta en el panel lateral (solo línea de tiempo + nombre), y (b) **ventana flotante** (diálogo de Office.js, como el explorador de distribuciones) para la vista completa grid + Gantt. Verificar el tamaño máximo del diálogo y su comportamiento en Windows, Mac y Web.
- **Sincronización con las hojas:** el diálogo no comparte el runtime, así que el estado se pasa con mensajes (`messageParent` / `messageChild`). Enviar **diferencias** (cambios), no el cronograma completo en cada edición; las escrituras a las hojas van en bloque desde el runtime principal.
- **Motor:** el CPM del Gantt es el **mismo** módulo que usa el QRSA. Recalcular en un Web Worker si una edición tarda más de 50 ms.
- No usar formato condicional ni Shapes para el Gantt (sin flechas reales y lentos).

### 14.2 Librerías
- Preferir la **construcción propia en Canvas** (control total del trazado de las 4 flechas, de la ruta impulsora y de las capas QRSA).
- Si se evalúa una librería: frappe-gantt (MIT, básica, no cubre los 4 tipos de flecha ni CPM); dhtmlxGantt y Bryntum (comerciales o GPL, **verificar la licencia antes de adoptar**).
- El cálculo CPM **siempre** es el del motor propio; la librería solo dibuja.

### 14.3 Rendimiento
- **Virtualización** de filas y del eje de tiempo (solo se dibuja lo visible).
- Meta: 2 000 actividades y 3 000 relaciones con scroll y zoom fluidos (≥ 30 fps), y recálculo CPM completo en menos de 200 ms.
- Recalcular en un hilo aparte (Web Worker) si bloquea la interfaz.
- Escritura a las hojas en bloque, nunca celda por celda.

---

## 15. Pruebas obligatorias

1. Las fechas, holgura total y holgura libre coinciden con MS Project en 3 cronogramas de referencia (simple; 4 tipos de relación con desfases positivos y negativos; calendario con festivos y restricciones).
2. Las flechas de los 4 tipos se anclan en el borde correcto, incluidos los casos con desfase negativo.
3. La ruta más larga y la de holgura total ≤ 0 se diferencian correctamente en un caso con una restricción FNLT.
4. La ruta impulsora hacia un hito selecciona exactamente las relaciones con holgura de relación = 0.
5. Crear un vínculo que genere un ciclo se rechaza.
6. Deshacer y rehacer restauran el estado exacto (fechas y vínculos).
7. Cada chequeo de calidad detecta su caso de prueba y no da falsos positivos en un cronograma limpio.
8. Rendimiento: se cumple la meta de la sección 14.3 con un cronograma sintético de 2 000 actividades.
9. La exportación a PDF respeta la paginación y los encabezados.

---

## 16. Fases de implementación

**Fase 1 — Visualización con lógica**
Grid con las columnas base, escala de tiempo con zoom, barras (tarea, hito, resumen), flechas de los 4 tipos, colores de crítica y casi crítica, línea de holgura, tooltip, días no laborables, línea de hoy, filtro "Solo ruta crítica".

**Fase 2 — Edición y diagnóstico**
Edición en grid y en barras, crear y editar vínculos, deshacer/rehacer, modo automático/manual, ruta más larga vs. holgura total, ruta impulsora hacia una actividad, panel "¿por qué es crítica?", diagnóstico de calidad con semáforo.

**Fase 3 — Seguimiento e integración**
Fecha de corte, avance, líneas base y variación, rutas de holgura múltiples, integración QRSA (bigotes, mapa de calor, probabilidad en hitos), importación MSPDI y XER, exportación a PDF e impresión, vistas guardables.

---

## 17. Criterios de aceptación globales

- El CPM da los mismos resultados que MS Project en los cronogramas de referencia.
- Las flechas nunca atraviesan barras en los casos de prueba y siempre muestran el tipo correcto.
- Desde cualquier hito se puede responder en un clic "¿qué cadena controla esta fecha?".
- Cada alerta de calidad lleva a las actividades afectadas.
- Fluido con 2 000 actividades.
- Toda edición se puede deshacer.

---

## Glosario

- **CPM:** método de la ruta crítica.
- **ES / EF / LS / LF:** inicio y fin tempranos, inicio y fin tardíos.
- **Holgura total:** cuánto se puede retrasar una actividad sin retrasar el fin del proyecto.
- **Holgura libre:** cuánto se puede retrasar sin retrasar a ninguna sucesora.
- **Relación impulsora (*driving*):** la que determina efectivamente la fecha de la sucesora.
- **Ruta más larga:** cadena de relaciones impulsoras desde el inicio hasta el fin del proyecto.
- **CPLI:** índice de longitud de la ruta crítica.
- **BEI:** índice de ejecución de la línea base.
- **Fecha de corte:** fecha hasta la cual se reporta el avance real.
