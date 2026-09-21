/**
 * Benchmark del motor, medido de verdad (regla de trabajo del handoff §8: los
 * benchmarks se ejecutan, nunca se estiman).
 *
 * Existe como archivo del repositorio, y no como script suelto, porque la cifra
 * que cita el criterio de hecho de E2 tiene que poder volver a medirse cuando
 * el motor cambie — que es exactamente lo que hizo falta al introducir el canal
 * de valores.
 *
 *     npm run bench
 *
 * El modelo imita la forma de un presupuesto: unas pocas entradas inciertas,
 * una tabla de constantes que el *constant folding* debe resolver una sola vez,
 * y una cadena larga de fórmulas intermedias hasta unas pocas salidas.
 *
 * El segundo escenario mide lo que este benchmark no medía antes: un modelo con
 * columnas de texto y `SUMAR.SI.CONJUNTO`, el caso que domina el libro real del
 * usuario (3.183 usos de funciones de criterio).
 */

import { compilarPlan } from '../engine/compiler/plan.ts';
import { simularPorBloques } from '../engine/executor/simular.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../engine/graph/index.ts';
import type { DefinicionEntrada } from '../engine/executor/entradas.ts';

const HOJA = 'Presupuesto';
const k = (ref: string) => claveDeReferencia(HOJA, ref);

const ITERACIONES = 1_000_000;
const ENTRADAS = 20;
const SALIDAS = 5;
const INTERMEDIAS = 200;

/** Columna A: entradas. Columna Z: constantes. Columnas B..: cadena de cálculo. */
function modeloNumerico(): { celdas: FormulaCelda[]; salidas: string[] } {
  const celdas: FormulaCelda[] = [];

  // Tabla de constantes (no depende de ninguna entrada: se pliega).
  for (let i = 1; i <= 10; i++) {
    celdas.push({ hoja: HOJA, col: 26, fila: i, formula: String(100 + i * 7) });
  }

  // Cadena de fórmulas intermedias, cada una apoyada en la anterior y en una
  // entrada, con un redondeo por medio como en un presupuesto real.
  for (let i = 1; i <= INTERMEDIAS; i++) {
    const entrada = `A${(i % ENTRADAS) + 1}`;
    const constante = `Z${(i % 10) + 1}`;
    const previa = i === 1 ? '1' : `B${i - 1}`;
    celdas.push({
      hoja: HOJA,
      col: 2,
      fila: i,
      formula: `ROUND(${entrada}*${constante}+${previa}*0.01,2)`,
    });
  }

  const salidas: string[] = [];
  for (let s = 1; s <= SALIDAS; s++) {
    const desde = (s - 1) * 40 + 1;
    celdas.push({
      hoja: HOJA,
      col: 3,
      fila: s,
      formula: `SUM(B${desde}:B${desde + 39})`,
    });
    salidas.push(k(`C${s}`));
  }

  return { celdas, salidas };
}

/**
 * Mismo tamaño, pero con una columna de categorías de texto y salidas que son
 * `SUMAR.SI.CONJUNTO` — el camino que el canal de valores hizo posible.
 */
function modeloConCriterios(): { celdas: FormulaCelda[]; salidas: string[] } {
  const celdas: FormulaCelda[] = [];
  const categorias = ['obra', 'suministro', 'transporte', 'mano de obra'];

  for (let i = 1; i <= INTERMEDIAS; i++) {
    celdas.push({
      hoja: HOJA,
      col: 26,
      fila: i,
      formula: `"${categorias[i % categorias.length]}"`,
    });
    const entrada = `A${(i % ENTRADAS) + 1}`;
    celdas.push({ hoja: HOJA, col: 2, fila: i, formula: `ROUND(${entrada}*17,2)` });
  }

  const salidas: string[] = [];
  for (let s = 1; s <= SALIDAS; s++) {
    const cat = categorias[s % categorias.length];
    celdas.push({
      hoja: HOJA,
      col: 3,
      fila: s,
      formula: `SUMIFS(B1:B${INTERMEDIAS},Z1:Z${INTERMEDIAS},"${cat}")`,
    });
    salidas.push(k(`C${s}`));
  }

  return { celdas, salidas };
}

function entradas(): DefinicionEntrada[] {
  const defs: DefinicionEntrada[] = [];
  for (let i = 1; i <= ENTRADAS; i++) {
    defs.push({
      tipo: 'distribucion',
      clave: k(`A${i}`),
      id: `entrada-${i}`,
      distribucion: { tipo: 'normal', media: 1000 + i, desviacion: 100 },
      metodo: 'monte-carlo',
    });
  }
  return defs;
}

async function medir(
  nombre: string,
  construir: () => { celdas: FormulaCelda[]; salidas: string[] },
): Promise<void> {
  const { celdas, salidas } = construir();
  const { grafo } = construirGrafo(celdas);
  const defs = entradas();

  const plan = compilarPlan(grafo, new Set(defs.map((d) => d.clave)), salidas);
  if (!plan.ok) {
    console.error(`  ${nombre}: no compila — ${plan.error.motivo} (${plan.error.clave})`);
    return;
  }

  const constantes = plan.plan.esConstante.size;
  const t0 = performance.now();
  const r = await simularPorBloques(grafo, plan.plan, defs, 20260921, ITERACIONES);
  const ms = performance.now() - t0;

  if (!r.ok) {
    console.error(`  ${nombre}: falló — ${r.error.motivo} (${r.error.clave})`);
    return;
  }

  const primera = r.porSalida.get(salidas[0] as string);
  console.log(
    `  ${nombre.padEnd(28)} ${(ms / 1000).toFixed(2).padStart(6)} s` +
      `   celdas plegadas: ${String(constantes).padStart(3)}` +
      `   media de la 1.ª salida: ${primera?.welford.media.toFixed(2)}`,
  );
}

console.log(`\nBenchmark del motor — ${ITERACIONES.toLocaleString('es-ES')} iteraciones, ` +
  `${ENTRADAS} entradas, ${SALIDAS} salidas, ~${INTERMEDIAS} celdas intermedias\n`);
console.log(`  Node ${process.version}, un solo hilo (ejecutor secuencial)\n`);

await medir('numérico puro', modeloNumerico);
await medir('con texto y SUMIFS', modeloConCriterios);
console.log('');
