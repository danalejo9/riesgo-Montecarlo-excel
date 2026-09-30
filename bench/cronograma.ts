/**
 * Benchmark del Monte Carlo del plazo (P3): una red sintética de 5.000
 * actividades con dos predecesoras cada una, PERT en todas y 10.000
 * iteraciones. Objetivo del plan (`docs/PLAN_CRONOGRAMA_QSRA.md` §3.5):
 * menos de 10 s en Excel Web o Mac.
 *
 *     npm run bench:cronograma
 */
import { CALENDARIO_ESTANDAR, OPCIONES_PLAZO_POR_DEFECTO, simularPlazo, type Actividad } from '../engine/cronograma/index.ts';

const N = Number(process.argv[2] ?? 5000);
const ITER = Number(process.argv[3] ?? 10_000);
let semilla = 1;
const azar = () => (semilla = (semilla * 16_807) % 2_147_483_647) / 2_147_483_647;

const actividades: Actividad[] = [];
for (let i = 0; i < N; i++) {
  const predecesoras: Actividad['predecesoras'] = [];
  if (i > 0) predecesoras.push({ predecesora: String(Math.max(0, i - 1 - Math.floor(azar() * 20))), tipo: 'FS', retardo: 0 });
  if (i > 30) predecesoras.push({ predecesora: String(i - 30), tipo: 'FS', retardo: 0 });
  actividades.push({ id: String(i), nombre: `A${i}`, duracion: 5, predecesoras, tresPuntos: { min: 4, masProbable: 5, max: 9 } });
}

const t0 = performance.now();
const r = await simularPlazo({ inicio: 46_024, calendario: CALENDARIO_ESTANDAR, actividades }, [], { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: ITER });
const ms = performance.now() - t0;
console.log(`${N} actividades × ${ITER} iteraciones: ${(ms / 1000).toFixed(2)} s (${((ms * 1e6) / (N * ITER)).toFixed(0)} ns por actividad e iteración) · P50 ${r.dias.p50} · P80 ${r.dias.p80} días`);
