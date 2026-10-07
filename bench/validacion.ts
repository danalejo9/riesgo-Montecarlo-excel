/**
 * Escribe `docs/VALIDACION_CRONOGRAMA.md` con los casos de validación del
 * módulo de cronograma (W3), ejecutándolos de verdad:
 *
 *     npm run validacion:cronograma
 */
import { writeFileSync } from 'node:fs';

import { casosAnaliticos, casosPublicados, type CasoValidacion } from '../tests/validacion/casos.ts';

const analiticos = await casosAnaliticos();
const publicados = await casosPublicados();
const todos = [...analiticos, ...publicados];
const total = todos.reduce((s, c) => s + c.comprobaciones.length, 0);
const bien = todos.reduce((s, c) => s + c.comprobaciones.filter((x) => x.ok).length, 0);
const escapar = (t: string) => t.replace(/\|/g, '\\|');

const caso = (c: CasoValidacion) => [
  `### ${c.id} · ${c.titulo}`,
  '',
  `**Planteamiento.** ${c.planteamiento}`,
  '',
  `**Respuesta esperada.** ${c.fundamento}`,
  '',
  '| Magnitud | Esperado | Motor | Tolerancia | ¿Pasa? |',
  '|---|---|---|---|---|',
  ...c.comprobaciones.map((x) => `| ${escapar(x.magnitud)} | ${escapar(x.esperado)} | ${escapar(x.obtenido)} | ${x.tolerancia} | ${x.ok ? 'Sí' : '**No**'} |`),
  '',
].join('\n');

const texto = [
  '# Validación del módulo de cronograma (QRSA)',
  '',
  '> Documento generado por `npm run validacion:cronograma` a partir de `tests/validacion/casos.ts`;',
  '> los mismos casos se comprueban en cada `npm test`. No se edita a mano.',
  '',
  `**Resultado:** ${bien} de ${total} comprobaciones dentro de su tolerancia, en ${todos.length} casos.`,
  '',
  '## Cómo se valida',
  '',
  '1. **Casos analíticos**: redes pequeñas cuya respuesta sale de una fórmula o de un cálculo a mano, y que',
  '   cubren lo que distingue un análisis de riesgo del cronograma: la suma de tareas en serie, el sesgo de',
  '   convergencia (*merge bias*), la criticidad, los *risk drivers* (AACE 57R‑09), la ramificación',
  '   probabilística, la probabilidad conjunta de plazo y costo (JCL), las cuatro relaciones con desfases y',
  '   festivos, los calendarios por actividad y el clima. Los Monte Carlo usan 100.000 iteraciones y una',
  '   tolerancia del orden de su error de muestreo; lo determinista, exacto.',
  '2. **Casos publicados por la GAO** (abajo).',
  '3. **Implementación independiente**: los cronogramas de referencia R1–R3 se calcularon aparte en Python;',
  '   el CPM del complemento coincide con ellos día por día (`tests/unit/cronogramaReferencias.test.ts`).',
  '',
  'Todo es reproducible: el motor usa números aleatorios con semilla, así que con la misma semilla da',
  'exactamente los mismos resultados en cualquier equipo.',
  '',
  '## Casos analíticos',
  '',
  ...analiticos.map(caso),
  '## Casos publicados (GAO)',
  '',
  'Ejemplos de las guías de la GAO (*Schedule Assessment Guide*, GAO‑16‑89G, y *Cost Estimating and',
  'Assessment Guide*, GAO‑20‑195G, versiones web en guides.gaoinnovations.gov) que traen todos los datos',
  'necesarios para reproducirlos (resumen de las fuentes en `docs/fuentes/casos_publicados_SRA.md`). Las',
  'cifras que la GAO da como «cerca de» se comparan con una tolerancia mayor: no se sabe con qué',
  'herramienta ni cuántas iteraciones se calcularon.',
  '',
  ...publicados.map(caso),
  '## Pendiente',
  '',
  '- **Los demás ejemplos de la GAO‑16‑89G** (la casa con tres puntos, con *risk drivers*, con ramificación',
  '  y con correlación: tablas 2 a 5, figuras 37 a 44) no publican la red completa (predecesoras,',
  '  calendario, a qué actividades afecta cada riesgo). Sin ella no se pueden reproducir los números, solo',
  '  los efectos que describen, que ya comprueban los casos analíticos: la causa común que ensancha la cola',
  '  (V‑03) y la ramificación (V‑04). La priorización «quitar un riesgo y volver a simular» de su tabla 5 es',
  '  el tornado por eliminación del panel.',
  '- **GAO‑20‑195G con *risk drivers*** (tablas 13 y 14): no publica a qué elementos se aplica cada riesgo.',
  '- **Hulett (1996)**, *Schedule Risk Analysis Simplified*: faltan los rangos de varias actividades, que',
  '  solo están en las figuras del artículo.',
  '- **AACE 57R‑09 y 64R‑11**: de pago; no se ha podido leer qué ejemplos numéricos traen.',
  '',
].join('\n');

writeFileSync('docs/VALIDACION_CRONOGRAMA.md', texto);
console.log(`docs/VALIDACION_CRONOGRAMA.md: ${bien} de ${total} comprobaciones bien, ${todos.length} casos.`);
if (bien !== total) process.exitCode = 1;
