/**
 * F2: un libro grande como el del usuario (132 hojas), medido de verdad.
 *
 *     node --experimental-strip-types --no-warnings bench/libroGrande.ts
 *
 * 130 hojas de cálculo iguales en forma (una tabla de datos con categorías,
 * una cadena de fórmulas que usa las entradas y el total de la hoja
 * anterior, un SUMAR.SI.CONJUNTO por categoría y un BUSCARV a una tabla de
 * tarifas), más «Supuestos» (las 20 entradas) y «Tarifas». Mide cada etapa
 * por separado: construir el grafo (que incluye analizar las fórmulas),
 * compilar el plan y simular 10.000 iteraciones.
 */

import { compilarPlan } from '../engine/compiler/plan.ts';
import { simularPorBloques } from '../engine/executor/simular.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../engine/graph/index.ts';
import type { DefinicionEntrada } from '../engine/executor/entradas.ts';

const HOJAS = Number(process.argv[2] ?? 130);
const FILAS = Number(process.argv[3] ?? 200);
const ITERACIONES = Number(process.argv[4] ?? 10_000);
const ENTRADAS = 20;
const CATEGORIAS = ['obra', 'suministro', 'transporte', 'mano de obra'];

function libro(): { celdas: FormulaCelda[]; salidas: string[] } {
  const celdas: FormulaCelda[] = [];
  for (let i = 1; i <= ENTRADAS; i++) celdas.push({ hoja: 'Supuestos', col: 2, fila: i, formula: String(100 + i) });
  for (let i = 1; i <= 100; i++) {
    celdas.push({ hoja: 'Tarifas', col: 1, fila: i, formula: String(i * 10) });
    celdas.push({ hoja: 'Tarifas', col: 2, fila: i, formula: String(50 + i / 2) });
  }
  for (let h = 1; h <= HOJAS; h++) {
    const hoja = `Frente ${h}`;
    const anterior = h > 1 ? `'Frente ${h - 1}'!F1` : '0';
    for (let f = 1; f <= FILAS; f++) {
      const e = `Supuestos!B${((f + h) % ENTRADAS) + 1}`;
      // A: categoría; B: cantidad (constante); C: precio con BUSCARV; D: importe; E: con lo anterior.
      celdas.push({ hoja, col: 1, fila: f, formula: `"${CATEGORIAS[f % CATEGORIAS.length]}"` });
      celdas.push({ hoja, col: 2, fila: f, formula: String((f * 37) % 90 + 10) });
      celdas.push({ hoja, col: 3, fila: f, formula: `VLOOKUP(MIN(${e},999),Tarifas!$A$1:$B$100,2)` });
      celdas.push({ hoja, col: 4, fila: f, formula: `ROUND(B${f}*C${f}*${e}/100,2)` });
      celdas.push({ hoja, col: 5, fila: f, formula: f === 1 ? `D1+${anterior}*0.001` : `E${f - 1}+D${f}` });
    }
    celdas.push({ hoja, col: 6, fila: 1, formula: `E${FILAS}` });
    CATEGORIAS.forEach((c, k) => celdas.push({ hoja, col: 7, fila: k + 1, formula: `SUMIFS(D1:D${FILAS},A1:A${FILAS},"${c}")` }));
  }
  const salidas: string[] = [];
  CATEGORIAS.forEach((_, k) => {
    celdas.push({ hoja: 'Resumen', col: 1, fila: k + 1, formula: Array.from({ length: HOJAS }, (_x, h) => `'Frente ${h + 1}'!G${k + 1}`).join('+') });
    salidas.push(claveDeReferencia('Resumen', `A${k + 1}`));
  });
  celdas.push({ hoja: 'Resumen', col: 1, fila: 10, formula: `'Frente ${HOJAS}'!F1` });
  salidas.push(claveDeReferencia('Resumen', 'A10'));
  return { celdas, salidas };
}

const t0 = performance.now();
const { celdas, salidas } = libro();
const tGenerar = performance.now() - t0;
let t = performance.now();
const { grafo } = construirGrafo(celdas);
const tGrafo = performance.now() - t;
const defs: DefinicionEntrada[] = Array.from({ length: ENTRADAS }, (_, i) => ({
  tipo: 'distribucion', clave: claveDeReferencia('Supuestos', `B${i + 1}`), id: `e${i}`,
  distribucion: { tipo: 'triangular', min: 80, moda: 100 + i, max: 160 }, metodo: 'monte-carlo',
}));
t = performance.now();
const plan = compilarPlan(grafo, new Set(defs.map((d) => d.clave)), salidas);
const tPlan = performance.now() - t;
if (!plan.ok) throw new Error(`${plan.error.motivo} (${plan.error.clave})`);
t = performance.now();
const r = await simularPorBloques(grafo, plan.plan, defs, 12345, ITERACIONES);
const tSim = performance.now() - t;
if (!r.ok) throw new Error(r.error.motivo);
const mem = process.memoryUsage();
console.log(`\nLibro grande (F2): ${HOJAS + 3} hojas, ${celdas.length.toLocaleString('es-ES')} celdas, ${ITERACIONES.toLocaleString('es-ES')} iteraciones — Node ${process.version}, un hilo\n`);
console.log(`  generar las celdas         ${tGenerar.toFixed(0).padStart(7)} ms`);
console.log(`  construir el grafo         ${tGrafo.toFixed(0).padStart(7)} ms   (analiza ${celdas.length.toLocaleString('es-ES')} fórmulas)`);
console.log(`  compilar el plan           ${tPlan.toFixed(0).padStart(7)} ms   (${plan.plan.esConstante.size.toLocaleString('es-ES')} celdas plegadas)`);
console.log(`  simular                    ${tSim.toFixed(0).padStart(7)} ms   (${((tSim / ITERACIONES) * 1000).toFixed(1)} µs por iteración)`);
console.log(`  memoria                    ${(mem.heapUsed / 2 ** 20).toFixed(0).padStart(7)} MB en uso`);
console.log(`  media de la 1.ª salida     ${r.porSalida.get(salidas[0] as string)?.welford.media.toFixed(2)}\n`);
