/**
 * Benchmark del Monte Carlo del plazo (P3): una red sintética de 5.000
 * actividades con dos predecesoras cada una, PERT en todas y 10.000
 * iteraciones. Objetivo del plan (`docs/PLAN_CRONOGRAMA_QSRA.md` §3.5):
 * menos de 10 s en Excel Web o Mac.
 *
 *     npm run bench:cronograma            (un hilo)
 *     npm run bench:cronograma -- 5000 10000 4   (actividades, iteraciones, hilos)
 *     npm run bench:cronograma -- 5000 10000 4 cal  (V7: un tercio en 6 días y otro continuo)
 */
import { CALENDARIO_ESTANDAR, OPCIONES_PLAZO_POR_DEFECTO, simularPlazo, simularPlazoEnParalelo, type Actividad, type Cronograma } from '../engine/cronograma/index.ts';
import { crearHilosPlazoNode } from '../tests/helpers/hilosPlazoNode.ts';

const N = Number(process.argv[2] ?? 5000);
const ITER = Number(process.argv[3] ?? 10_000);
const HILOS = Number(process.argv[4] ?? 1);
const CALENDARIOS = process.argv[5] === 'cal';
let semilla = 1;
const azar = () => (semilla = (semilla * 16_807) % 2_147_483_647) / 2_147_483_647;

const actividades: Actividad[] = [];
for (let i = 0; i < N; i++) {
  const predecesoras: Actividad['predecesoras'] = [];
  if (i > 0) predecesoras.push({ predecesora: String(Math.max(0, i - 1 - Math.floor(azar() * 20))), tipo: 'FS', retardo: 0 });
  if (i > 30) predecesoras.push({ predecesora: String(i - 30), tipo: 'FS', retardo: 0 });
  actividades.push({
    id: String(i), nombre: `A${i}`, duracion: 5, predecesoras, tresPuntos: { min: 4, masProbable: 5, max: 9 },
    ...(CALENDARIOS && i % 3 > 0 ? { calendario: i % 3 === 1 ? '6 días' : 'Continuo' } : {}),
  });
}

const cron: Cronograma = {
  inicio: 46_024, calendario: CALENDARIO_ESTANDAR, actividades,
  ...(CALENDARIOS
    ? { calendarios: { '6 días': { laborables: [false, true, true, true, true, true, true], festivos: new Set() }, Continuo: { laborables: new Array(7).fill(true), festivos: new Set() } } }
    : {}),
};
const op = { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: ITER };
const hilos = HILOS > 1 ? crearHilosPlazoNode(HILOS) : null;
const t0 = performance.now();
const r = hilos ? await simularPlazoEnParalelo(cron, [], op, hilos.para(cron, [], op), hilos.hilos) : await simularPlazo(cron, [], op);
const ms = performance.now() - t0;
hilos?.cerrar();
console.log(`${N} actividades × ${ITER} iteraciones, ${HILOS} hilo(s)${CALENDARIOS ? ', con calendarios' : ''}: ${(ms / 1000).toFixed(2)} s (${((ms * 1e6) / (N * ITER)).toFixed(0)} ns por actividad e iteración) · P50 ${r.dias.p50} · P80 ${r.dias.p80} días`);
