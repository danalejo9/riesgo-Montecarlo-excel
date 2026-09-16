# Escáner de compatibilidad

Dice qué porcentaje de las fórmulas de un libro podría evaluar el motor rápido,
y **qué funciones concretas lo impiden**.

```bash
npm run scan -- "C:\ruta\Presupuesto.xlsx"
npm run scan -- libro1.xlsx libro2.xlsx --json informe.json
```

## Privacidad

Lee los `.xlsx` directamente del disco y **no hace una sola llamada de red**.
No abre Excel, no necesita que el libro esté abierto y no necesita el
complemento instalado. Puedes pasarlo por presupuestos con datos sensibles
(requisito R2 de la arquitectura).

Lo único que sale del proceso es lo que se imprime en pantalla, y ahí no
aparecen valores de celdas: solo nombres de función, referencias de celda y
recuentos.

## Cómo leer el resultado

| Veredicto | Significa |
|---|---|
| ✅ Compatible | Ninguna fórmula queda fuera del catálogo Nivel 0 + Nivel 1 |
| ⚠️ Casi compatible | Hay bloqueantes, pero son pocos: mirar si se reescriben |
| ⛔ No compatible | Hay bloqueantes de peso |

**No hay un umbral de porcentaje para el verde, y es a propósito.** Basta una
celda bloqueante en el camino entre una entrada y una salida para que el motor
rápido no pueda evaluar el modelo. Un "99,8 % compatible" con tres celdas que lo
impiden sería tranquilizador y falso.

El porcentaje sirve para medir *cuánto* falta, no para decidir el veredicto.

## Límites conocidos

Son limitaciones del análisis estático sobre el archivo, no defectos a corregir:

- **Es un análisis de libro completo, no de un modelo concreto.** Todavía no hay
  entradas ni salidas definidas, así que no se puede recortar al subgrafo
  relevante. Una función bloqueante puede estar en una hoja que a tu simulación
  no le afecte. El informe integrado en el panel (E3) sí hará ese recorte.
- **La profundidad de cadena es una cota inferior.** Las fórmulas compartidas no
  aportan aristas (el XML no guarda su texto ya desplazado) y los rangos de más
  de 4.096 celdas no se expanden.
- **`.xls` antiguo no se lee**: es un formato binario distinto. Ábrelo en Excel y
  guárdalo como `.xlsx`.
- Las funciones desconocidas se reportan como "definidas por el usuario". Suelen
  ser macros VBA, pero también pueden ser funciones de Excel que falten del
  catálogo: si ves algo estándar en esa lista, es un fallo del catálogo y hay que
  añadirlo.

## Para qué existe

Al decidir no medir los libros reales por adelantado (decisión D4), el alcance
del motor quedó apoyado en un catálogo supuesto. Esta herramienta convierte ese
supuesto en dato. Su salida más valiosa es la lista agregada de bloqueantes
ordenada por frecuencia: **es la lista de trabajo de la etapa E5**, que se
implementa por uso real y no por intuición.
