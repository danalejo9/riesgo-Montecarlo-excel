/**
 * Escribe `docs/VALIDACION_CRONOGRAMA.md` con los casos de validación del
 * módulo de cronograma (W3), ejecutándolos de verdad:
 *
 *     npm run validacion:cronograma
 */
import { writeFileSync } from 'node:fs';

import { casosAnaliticos, casosContraPython, type CasoValidacion } from '../tests/validacion/casos.ts';

const analiticos = await casosAnaliticos();
const python = await casosContraPython();
const todos = [...analiticos, ...python];
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
  '# Validación del módulo de cronograma (QSRA)',
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
  '   probabilística, la probabilidad conjunta de plazo y costo (JCL), las cuatro relaciones con retardos y',
  '   festivos, los calendarios por actividad y el clima. Los Monte Carlo usan 100.000 iteraciones y una',
  '   tolerancia del orden de su error de muestreo; lo determinista, exacto.',
  '2. **Implementación independiente**: `ejemplos/generar-cronograma.py` (Python, escrito aparte) calcula el',
  '   CPM y el Monte Carlo del proyecto de prueba (`ejemplos/demo-cronograma.xlsx`). El CPM debe coincidir',
  '   fila a fila; el Monte Carlo, que usa otros números aleatorios, dentro de su error.',
  '',
  'Todo es reproducible: el motor usa números aleatorios con semilla (Philox), así que con la misma semilla',
  'da exactamente los mismos resultados en cualquier equipo, con uno o con varios hilos.',
  '',
  '## Casos analíticos',
  '',
  ...analiticos.map(caso),
  '## Contra la implementación independiente en Python',
  '',
  ...python.map(caso),
  '## Pendiente',
  '',
  '- Reproducir los ejemplos numéricos publicados en la guía GAO‑16‑89G (*Schedule Assessment Guide*) y en',
  '  la AACE 57R‑09 (*Integrated Cost and Schedule Risk Analysis Using Risk Drivers*), cuando se tengan los',
  '  documentos (la de AACE es de pago). El formato de esta página ya los admite: cada caso con su',
  '  planteamiento, su respuesta publicada y la del motor.',
  '- Más comprobaciones en el libro de pruebas (avance, calendarios, clima, hitos) están en',
  '  `tests/unit/cronograma*.test.ts`.',
  '',
].join('\n');

writeFileSync('docs/VALIDACION_CRONOGRAMA.md', texto);
console.log(`docs/VALIDACION_CRONOGRAMA.md: ${bien} de ${total} comprobaciones bien, ${todos.length} casos.`);
if (bien !== total) process.exitCode = 1;
