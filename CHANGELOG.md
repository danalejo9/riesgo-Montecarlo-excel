# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado semántico. Las etapas (E0, E1, …) son las de `docs/FASE3_ROADMAP.md`.

## [No publicado]

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
