## Arquitectura de Alto Rendimiento (Batching)
Para garantizar simulaciones instantáneas y fluidas (especialmente en Excel Online), el complemento no sincroniza cada iteración por red. En su lugar:
1. Genera las muestras aleatorias en memoria (JS).
2. Crea una hoja oculta en Excel.
3. Encola todas las escrituras, recálculos (`context.workbook.application.calculate('Full')`) y copias en un solo bloque.
4. Envía todo en **un único paquete** al motor C++ nativo de Excel y lee la hoja oculta.
Esto reduce el tiempo de simulación de 30 segundos a ~1 segundo y evita el parpadeo de pantalla y el límite de llamadas a la API (Timeouts).
