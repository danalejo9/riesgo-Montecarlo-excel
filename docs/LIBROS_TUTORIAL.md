# Libros tutoriales y manual

*Diseño del 27/09/2026, pedido por el usuario.* Tres libros de ejemplo que
enseñan el complemento de menos a más, y un manual en HTML que los recorre.
Se **construyen al final** (bloque M del roadmap), cuando estén las
funcionalidades que enseñan; el diseño queda fijado desde ahora para que cada
desarrollo sepa en qué libro se va a enseñar.

Los tres siguen las mismas reglas:

- **Empresas y cifras ficticias**, en euros, con formato español.
- **Una hoja «Lecciones» primero**: pasos numerados, qué celda marcar, qué
  distribución poner y **qué resultado debería salir** (con margen), para que
  el usuario sepa si lo ha hecho bien.
- **Supuestos en azul, cálculos en negro, resultados en negrita**: la
  convención de modelización financiera.
- **Generados por un script** (`ejemplos/generar-tutorial-N.py`), como el de
  Aurora, y **con una prueba automática** que simula el libro con el motor y
  comprueba que los resultados esperados de «Lecciones» son los que salen. Un
  tutorial con un número equivocado es peor que no tenerlo.
- **Sin nada marcado**: el usuario lo marca siguiendo las lecciones. Cada libro
  trae además una hoja «Solución» que explica el modelo ya marcado.

---

## Tutorial 1 — «Feria de fin de semana» (lo esencial, 15 minutos)

**Para quién**: alguien que nunca ha hecho una simulación. **Un solo periodo**,
cálculos de una línea.

**El caso**: una empresa monta un puesto en una feria de dos días. Tiene que
decidir si le compensa: paga un alquiler fijo, compra el género antes de saber
cuánta gente vendrá, y lo que no vende lo liquida a mitad de precio.

| Celda | Supuesto | Valor base | Distribución en la lección |
|---|---|---|---|
| C4 | Visitantes al puesto | 1.200 | Triangular 800 / 1.200 / 1.500 |
| C5 | % que compra | 18 % | PERT 10 % / 18 % / 25 % |
| C6 | Precio de venta | 25 € | fijo |
| C7 | Coste por unidad | 11 € | Uniforme 10 / 12 |
| C8 | Unidades compradas | 220 | fijo (es la decisión) |
| C9 | Alquiler del puesto | 900 € | fijo |

Cálculos: ventas = MIN(visitantes × %compra; unidades compradas); sobrante =
compradas − ventas, liquidado a mitad de precio; **beneficio** = ventas ×
precio + sobrante × precio / 2 − compradas × coste − alquiler.

**Lecciones**:
1. Marcar tres entradas y una salida (el beneficio).
2. Simular y leer la media, el mínimo y el máximo.
3. El histograma: qué forma tiene y por qué (la cola izquierda son los días
   flojos).
4. **Probabilidad de perder dinero** con el umbral 0.
5. El tornado: qué pesa más, ¿la gente o el precio de compra?
6. **Cambiar la decisión**: comprar 180 o 260 unidades, volver a simular y
   comparar con el escenario de referencia.

**Enseña**: E5 (nombres legibles), umbral, histograma, tornado, escenarios.

---

## Tutorial 2 — «Proyecto Aurora» (un proyecto de inversión, 45 minutos)

**Para quién**: quien ya hizo el tutorial 1 y modela proyectos a varios años.
Es el libro de demostración actual (`demo-proyecto-aurora.xlsx`), ampliado.

**El caso**: una empresa evalúa lanzar un producto a cinco años: inversión
inicial, precio, unidades con crecimiento, costes variables y fijos con
inflación, amortización, impuestos y valor residual. Salidas: VAN, TIR, flujo
acumulado, margen EBITDA.

**Lecciones** (sobre lo que ya tiene, más):
1. Marcar las cinco entradas de la hoja «Instrucciones» actual.
2. **Correlación**: precio y unidades se mueven en sentido contrario (−0,5).
   Ver cómo cambia el tornado y la desviación del VAN.
3. Varias salidas: VAN, TIR (con sus iteraciones sin valor) y flujo acumulado.
4. Araña: qué pasa con el VAN cuando cada entrada se va a su 10 % más bajo o
   más alto.
5. **Precisión**: ¿bastan 10.000 iteraciones? Usar «hasta alcanzar la
   precisión».
6. **Ajustar a datos históricos**: los precios de la hoja «Histórico» (40
   datos) → la distribución del precio.
7. **Escenarios**: «Base», «Con inflación alta», «Con descuento del 10 %», con
   el administrador de escenarios (E7).
8. Informe PDF con el título del proyecto (C7) y volcado a una hoja.
9. **Funciones RIESGO**: escribir la distribución en la celda en vez de en el
   panel, y «Preparar para compartir» antes de enviarlo.

**Enseña**: correlaciones, araña, precisión, ajuste (I1), escenarios (E7),
informe (C7), volcado (C1/C8), `RIESGO.*`, compartir.

---

## Tutorial 3 — «Parque solar Altamira» (todo el potencial, 90 minutos)

**Para quién**: usuarios avanzados, y para enseñar el producto a un cliente.
Un modelo como los reales: **varias hojas, 20 años, financiación y riesgos de
evento**.

**El caso**: una promotora estudia un parque solar de 50 MW financiado con
deuda. Hojas:

| Hoja | Contenido |
|---|---|
| Lecciones | Los pasos |
| Supuestos | Todos los inciertos, con su fuente y su rango |
| Construcción | Coste por MW, **retraso de obra** (evento sí/no) y sobrecoste si hay retraso |
| Producción | Horas de sol por año, degradación anual de los paneles, disponibilidad |
| Precios | **Precio de la energía como serie temporal** (reversión a la media, H5) y su histórico mensual para ajustar |
| Financiación | Deuda al 70 %, tipo de interés, cuota (`PAGO`), **ratio de cobertura (DSCR)** año a año |
| Flujo | 20 años en columnas, con `SUMAPRODUCTO` y `LET` como en los libros reales |
| Resultados | VAN del accionista, TIR, **DSCR mínimo**, año de recuperación, VaR y CVaR del VAN |

**Inciertos**: coste por MW (PERT), horas de sol (normal, **ajustada a 20 años
de datos**), degradación (uniforme), disponibilidad (beta), precio de la
energía (serie), tipo de interés (triangular), **retraso de obra**
(`RIESGO.BERNOULLI(0,2)`) con su sobrecoste (lognormal). Correlación entre
precio de la energía y tipo de interés.

**Lecciones**:
1. Un modelo grande: marcar desde la hoja «Supuestos», ver los nombres legibles
   y el resaltado en todas las hojas.
2. **Mezclar panel y funciones**: el retraso va como `RIESGO.BERNOULLI` en la
   celda; el resto, en el panel.
3. Series temporales: el precio de la energía año a año (H5) y el **abanico**
   p5–p95 del flujo (C4).
4. Varias salidas a la vez y el selector de Resultados (E6).
5. **Medidas de riesgo**: VaR y CVaR del VAN (H2), probabilidad de que el DSCR
   mínimo baje de 1,2 (el banco lo exige).
6. **Qué tiene que pasar para perder dinero**: análisis de escenarios por cola
   (D1) sobre el peor 10 % del VAN.
7. **Tornado de cambio en la salida** (D4): cuántos euros mueve cada supuesto.
8. **Búsqueda de objetivo con riesgo** (H4): ¿qué precio mínimo de la energía
   deja P(VAN < 0) por debajo del 10 %?
9. **Simulaciones en serie** (H3): deuda al 60 / 70 / 80 %, lado a lado.
10. Informe PDF completo y hoja de resumen para el comité.
11. Rendimiento: 100.000 iteraciones en varios núcleos; qué hace el modo
    compatible y cuándo hace falta.

**Enseña**: todo lo anterior más D1, D4, H2, H3, H4, H5, C4, E6, mezcla de
panel y funciones, modelos de varias hojas.

---

## El manual (M2)

**Formato**: HTML estático, en español (y en inglés cuando llegue la
internacionalización), servido junto al complemento y abrible sin él. Un
botón «Ayuda» en el panel abre la sección que corresponde a la pestaña, y la
ayuda contextual (E4) enlaza a sus apartados.

**Navegación**: índice lateral fijo, buscador, «anterior / siguiente» al pie
de cada página para leerlo de principio a fin, y enlaces directos a cada
apartado. Capturas del panel y de los tres libros. Legible en el móvil.

**Índice propuesto**:

1. **Primeros pasos**: instalar el complemento, abrir el panel, la cinta.
2. **Conceptos**: qué es una simulación Monte Carlo, entradas, salidas,
   iteraciones, semilla, en lenguaje llano y sin fórmulas.
3. **Construir el modelo**: marcar entradas y salidas, elegir distribuciones
   (una página por distribución: cuándo usarla, qué parámetros pide, un
   ejemplo), correlaciones, ajustar a datos históricos.
4. **Funciones RIESGO**: la lista completa, con sintaxis y ejemplos; modo
   determinístico y probabilístico; compartir el libro.
5. **Simular**: configuración (núcleos, iteraciones, precisión, muestreo,
   motor), motor rápido y modo compatible, qué fórmulas soporta.
6. **Leer los resultados**: cada estadístico y cada gráfico explicado
   (histograma, curva acumulada, tornado, araña, abanico…), umbrales,
   precisión, medidas de riesgo.
7. **Análisis**: escenarios, análisis por cola, estrés, simulaciones en serie,
   búsqueda de objetivo.
8. **Informes**: PDF, volcado a hoja, hoja de resumen.
9. **Tutoriales**: los tres libros, lección a lección, con capturas.
10. **Referencia**: funciones de Excel soportadas, límites conocidos,
    privacidad (todo se calcula en el equipo).
11. **Preguntas frecuentes y solución de problemas**: el panel en blanco, el
    `#¿NOMBRE?` al compartir, por qué la TIR no da valor en algunas
    iteraciones…
12. **Glosario**.

**Criterio de hecho**: una persona que no conoce el complemento sigue el
manual desde el principio, hace los tres tutoriales y obtiene los resultados
esperados sin ayuda.
