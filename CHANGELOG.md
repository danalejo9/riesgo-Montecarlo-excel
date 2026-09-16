# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico. Las etapas (E0, E1, …) son las de `docs/FASE3_ROADMAP.md`.

## [No publicado]

### E2 — Motor Nivel 0 (en curso)

**Añadido**
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
