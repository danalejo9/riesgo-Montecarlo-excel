# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico. Las etapas (E0, E1, …) son las de `docs/FASE3_ROADMAP.md`.

## [No publicado]

### E2 — Motor Nivel 0 (en curso)

**Añadido**
- `engine/compiler/evaluate.ts`: **evaluador de referencia**, la pieza que une
  parser + grafo + registro de funciones en un cálculo completo. Dado un
  conjunto de celdas de entrada (ya muestreadas) y unas salidas, calcula todo
  el subgrafo necesario en orden topológico. Es la versión **interpretada**
  del motor —recorre el AST de cada celda directamente, sin el análisis de
  vida de buffers ni el *constant folding* de Fase 2 §3.1— y existe para
  validar la corrección de punta a punta antes de escribir el compilador
  optimizado, que es el siguiente paso de E2.
- Prueba informal (no el benchmark formal de Fase 2 §10, que llega con su
  propia etapa y metodología): 1.000.000 de iteraciones sobre un modelo de 200
  celdas encadenadas, con este evaluador sin optimizar, en ~8,7 s. Confirma
  que la dirección arquitectónica funciona en la práctica antes de invertir en
  la versión con reutilización de buffers.
- Errores con la celda y el motivo exactos: referencia circular, función no
  soportada, error de sintaxis, rango de columna/fila entera (no soportado
  todavía), tamaño de buffer de entrada incorrecto. Nunca una excepción sin
  contexto ni un resultado silenciosamente incorrecto.
- 14 tests, incluida una cadena de dependencias con forma de presupuesto real
  (cantidad × precio → subtotal → IVA → total).
- `engine/functions/`: registro de funciones vectorizadas — **subconjunto
  numérico** por ahora (SUM, PRODUCT, MIN, MAX, COUNT, AVERAGE, MEDIAN,
  STDEV.S/P, VAR.S/P, ABS, SIGN, SQRT, INT, EXP, LN, LOG, LOG10, POWER, MOD,
  ROUND, ROUNDUP, ROUNDDOWN, TRUNC, IF, AND, OR, NOT, XOR). Cada celda es un
  `Float64Array` de N valores (una por iteración de la simulación) y cada
  función opera sobre esos buffers completos de una vez — es la vectorización
  de Fase 2 §3 hecha código.
- Tres funciones donde Excel diverge de su equivalente ingenuo en JavaScript,
  corregidas con test dedicado: `ROUND` redondea alejándose de cero
  (`ROUND(-2.5,0)=-3`, no -2 como `Math.round`), `MOD` toma el signo del
  divisor (`MOD(-7,3)=2`, no -1 como `%`), y `TRUNC`/`INT` divergen en
  negativos (`TRUNC(-2.5)=-2` pero `INT(-2.5)=-3`).
- Documentado como límite explícito, no como descuido: este registro todavía
  no modela texto, booleano-distinto-de-número, error ni celda vacía. Ninguna
  de estas funciones se declara "soportada" a efectos de la batería de
  fidelidad de Fase 2 §11.3 hasta que ese canal exista.
- 29 tests de funciones.
- `engine/graph/`: grafo de dependencias entre celdas, construido a partir del
  AST del parser. Cada celda referenciada es un nodo, tenga o no fórmula
  propia (una entrada con valor puro también lo es).
- Orden topológico con recorrido iterativo (no recursivo, por la misma razón
  que el escáner: una cadena de decenas de miles de fórmulas encadenadas por
  fila es normal en un presupuesto) y **detección de referencias circulares**,
  con las celdas implicadas identificadas en vez de colgarse o dar un
  resultado arbitrario.
- Dos recortes de grafo con propósitos distintos, documentados para no
  confundirlos: la **clausura de dependencias** de las salidas (todo lo que
  hace falta calcular, incluidas ramas constantes) para el compilador, y el
  **subgrafo entrada→salida** (solo lo que conecta una entrada incierta con
  una salida) para el informe de compatibilidad. Una celda que no depende de
  ninguna entrada —una tabla de tarifas fija— pertenece a la primera pero no a
  la segunda: es la base del *constant folding* previsto en Fase 2 §4.2.
- 20 tests de grafo.
- `engine/parser/`: tokenizador y parser de fórmulas de Excel a AST, por
  escalada de precedencia. Trabaja sobre la forma en-US de la fórmula, que es
  la que guardan tanto el `.xlsx` como `range.formulas` de Office.js, de modo
  que el motor no depende de la configuración regional.
- Reproduce las rarezas de Excel que otros lenguajes no comparten: `^` asocia
  por la izquierda (`2^3^2` = 64) y el menos unario se aplica antes que la
  potencia (`-2^2` = 4).
- Cubre referencias absolutas, hojas con y sin comillas, rangos, columnas y
  filas enteras, nombres definidos, argumentos omitidos, constantes
  matriciales, errores literales y porcentajes.
- Lo que está fuera de alcance (referencias a otros libros, referencias
  estructuradas, uniones de rangos, derrames de matriz dinámica) produce un
  nodo `no-soportado` **con su motivo**, no un error de sintaxis: el informe
  debe poder decir qué construcción concreta lo impide.
- El parser no lanza excepciones hacia fuera: devuelve el error con mensaje y
  posición, porque procesar miles de celdas no puede detenerse en la primera
  fórmula rara.
- 35 tests de parser.

### E1 — Escáner de compatibilidad (v0.1)

**Añadido**
- `npm run scan -- <libro.xlsx>`: analiza libros reales y dice qué porcentaje de
  sus fórmulas podría evaluar el motor rápido y qué funciones lo impiden, con
  celda de ejemplo y frecuencia de uso.
- Lectura directa del formato `.xlsx` (ZIP + XML) **sin abrir Excel y sin una
  sola llamada de red**: hojas, fórmulas, fórmulas compartidas y matriciales,
  nombres definidos, tablas, enlaces externos, VBA y Power Query.
- Tokenizador de fórmulas que distingue funciones de nombres definidos, de
  referencias y de texto entrecomillado — `LOG10(A1)` es una función y `LOG10`
  a secas es una celda.
- Catálogo de funciones por nivel (§4.2 de la arquitectura), con normalización
  de los prefijos `_xlfn.` y `@` que añade Excel.
- Medida del tamaño del problema para dimensionar el motor (D11): fórmulas,
  referencias por fórmula y profundidad de la cadena de dependencias, calculada
  con un recorrido iterativo que aguanta cadenas de decenas de miles de celdas.
- Resumen agregado de varios libros con los bloqueantes ordenados por
  frecuencia: es la lista de trabajo de E5.
- Regla de ESLint que prohíbe a `engine/` importar Node, Office o capas
  superiores. La regla de oro de la arquitectura la vigila el linter.
- 34 tests nuevos, con libros `.xlsx` construidos en memoria en lugar de
  fixtures binarios.

**Corregido**
- El veredicto usaba un umbral del 99,5 % y llegaba a declarar "compatible" un
  libro con celdas bloqueantes. Ahora basta una para que no lo sea: el
  porcentaje mide cuánto falta, no decide el veredicto.

### E0 — Fundaciones

**Añadido**
- Estructura del proyecto nuevo: `engine/`, `tests/`.
- Vitest configurado y **primera batería de tests del proyecto** (16 tests).
- Generador pseudoaleatorio **Philox-2x32-10 basado en contador**
  (`engine/random/philox.ts`): la muestra `i` se calcula como
  `f(semilla, flujo, índice)` sin estado, de modo que el resultado no depende
  del número de núcleos ni del troceado en bloques.
- Integración continua en GitHub Actions: tipos, lint y tests en cada push.
- `legacy/README.md` explicando qué se puede reutilizar del código heredado y
  qué no.
- Scripts `npm test`, `npm run test:watch`, `npm run check`,
  `npm run validate-manifest`.

**Cambiado**
- El código heredado se traslada a `legacy/` y queda **fuera del build, del
  lint y de los tests**. Se conserva como referencia; el commit etiquetado
  `v0.0.0-heredado` lo preserva íntegro.
- `npm run build` pasa a ser solo comprobación de tipos (`tsc -b`). Los puntos
  de entrada HTML se reconstruyen en E3, y hasta entonces no hay `vite build`.
- El paquete pasa a llamarse `riesgo-montecarlo-excel`.
- ESLint simplificado, con `legacy/` ignorado; el motor compila con `strict`.

**Eliminado**
- Dependencias `jspdf`, `html2canvas` y `recharts` (≈350 KB de bundle),
  aprobado en la decisión 1.2. La exportación de informes se hará a hojas
  nativas de Excel.
- `dist/`: artefacto obsoleto y no reproducible.
- Google Fonts y la etiqueta `<script src="/functions.js">` del panel, que
  provocaba un `ReferenceError` en cada apertura — ambos salen del producto al
  quedar `index.html` heredado dentro de `legacy/`.

## [v0.0.0-heredado] — 2026-09-15

Estado del complemento tal como fue entregado por la IA anterior, congelado
como evidencia de la auditoría. No compila, no tiene tests y sus funciones
`=RIESGO.*` nunca llegaron a registrarse en Excel. Ver
`docs/FASE1_AUDITORIA_TECNICA.md`.
