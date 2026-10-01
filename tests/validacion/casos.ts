/**
 * Casos de validación publicables del módulo de cronograma (W3).
 *
 * Dos clases de comprobación, las dos reproducibles por cualquiera:
 *
 * 1. **Analíticas**: redes pequeñas cuya respuesta se calcula a mano o con
 *    una fórmula (suma de tareas en serie, sesgo de convergencia —*merge
 *    bias*—, criticidad por simetría, *risk drivers* de AACE 57R‑09,
 *    ramificación, JCL, calendarios, clima). El motor debe dar lo mismo,
 *    exacto o dentro de la tolerancia estadística que se indica.
 * 2. **Contra una implementación independiente**: el libro
 *    `ejemplos/demo-cronograma.xlsx` trae los resultados que calcula
 *    `ejemplos/generar-cronograma.py` (otro lenguaje, escrito aparte): el
 *    CPM debe coincidir fila a fila; el Monte Carlo, dentro de su tolerancia.
 *
 * La usan `validacion.test.ts` (en cada `npm test`) y
 * `bench/validacion.ts`, que escribe `docs/VALIDACION_CRONOGRAMA.md`.
 */

import {
  CALENDARIO_ESTANDAR, calcularCPM, hojaResultadoCPM, leerCronograma, leerRiesgosPlazo, simularPlazo, OPCIONES_PLAZO_POR_DEFECTO,
  type Actividad, type Cronograma, type RiesgoPlazo,
} from '../../engine/cronograma/index.ts';
import { triangular } from '../../engine/distributions/triangular.ts';
import { leerHojaComoMatriz } from '../helpers/leerHoja.ts';
import { compilarPlan } from '../../engine/compiler/plan.ts';
import { simularPorBloques } from '../../engine/executor/index.ts';
import { claveDeReferencia, construirGrafo, type FormulaCelda } from '../../engine/graph/index.ts';
import { aplicarReescrituras, modeloVacio, prepararEntradas } from '../../engine/modelo/index.ts';
import { entradasDeFunciones, resolverConFunciones } from '../../excel/entradasRiesgo.ts';

export interface Comprobacion {
  magnitud: string;
  esperado: string;
  obtenido: string;
  tolerancia: string;
  ok: boolean;
}

export interface CasoValidacion {
  id: string;
  titulo: string;
  /** De dónde sale la respuesta esperada. */
  fundamento: string;
  planteamiento: string;
  comprobaciones: Comprobacion[];
}

const INICIO = 46_419; // lunes 01/02/2027
const N = 100_000;
const op = (iteraciones = N) => ({ ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones, forma: 'triangular' as const });
const f = (x: number, d = 3) => x.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const pct = (x: number) => `${f(x * 100, 1)} %`;
const cuantil = (xs: Float64Array, q: number) => {
  const o = Float64Array.from(xs).sort();
  return o[Math.min(o.length - 1, Math.floor(q * o.length))] as number;
};
const media = (xs: Float64Array) => xs.reduce((s, x) => s + x, 0) / xs.length;
const desviacion = (xs: Float64Array) => {
  const m = media(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const cerca = (magnitud: string, esperado: number, obtenido: number, tol: number, digitos = 3): Comprobacion => ({
  magnitud, esperado: f(esperado, digitos), obtenido: f(obtenido, digitos), tolerancia: `± ${f(tol, digitos)}`, ok: Math.abs(obtenido - esperado) <= tol,
});
const exacto = (magnitud: string, esperado: string | number, obtenido: string | number): Comprobacion => ({
  magnitud, esperado: String(esperado), obtenido: String(obtenido), tolerancia: 'exacto', ok: esperado === obtenido,
});

const act = (id: string, tp: [number, number, number] | number, preds: string[] = [], extra: Partial<Actividad> = {}): Actividad => ({
  id, nombre: id, duracion: typeof tp === 'number' ? tp : tp[1],
  predecesoras: preds.map((p) => ({ predecesora: p, tipo: 'FS' as const, retardo: 0 })),
  ...(typeof tp === 'number' ? {} : { tresPuntos: { min: tp[0], masProbable: tp[1], max: tp[2] } }),
  ...extra,
});
const red = (actividades: Actividad[], extra: Partial<Cronograma> = {}): Cronograma => ({ inicio: INICIO, calendario: CALENDARIO_ESTANDAR, actividades, ...extra });
const riesgo = (id: string, p: number, impacto: number, actividades: string[], extra: Partial<RiesgoPlazo> = {}): RiesgoPlazo => ({
  id, nombre: id, probabilidad: p, impactoMin: impacto, impactoMasProbable: impacto, impactoMax: impacto, actividades, ...extra,
});

/** Triangular(8, 10, 15): media, varianza y cuantiles exactos. */
const T = { a: 8, c: 10, b: 15 };
const tri = triangular(T.a, T.c, T.b);
const mediaT = (T.a + T.b + T.c) / 3;
const varT = (T.a ** 2 + T.b ** 2 + T.c ** 2 - T.a * T.b - T.a * T.c - T.b * T.c) / 18;

export async function casosAnaliticos(): Promise<CasoValidacion[]> {
  const casos: CasoValidacion[] = [];

  // 1. Tareas en serie: la suma de independientes.
  {
    const acts = Array.from({ length: 10 }, (_, i) => act(`A${i + 1}`, [T.a, T.c, T.b], i === 0 ? [] : [`A${i}`]));
    const r = await simularPlazo(red(acts), [], op());
    const m = 10 * mediaT;
    const s = Math.sqrt(10 * varT);
    casos.push({
      id: 'V-01', titulo: 'Diez tareas en serie',
      fundamento: 'Suma de variables independientes: la media y la varianza se suman (exacto, para cualquier distribución).',
      planteamiento: `10 tareas fin‑comienzo, cada una triangular(${T.a}, ${T.c}, ${T.b}) días. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('Media de la duración total (días)', m, media(r.finProyecto), 0.05),
        cerca('Desviación típica (días)', s, desviacion(r.finProyecto), 0.05),
      ],
    });
  }

  // 2. Sesgo de convergencia (merge bias): n rutas paralelas iguales.
  for (const n of [1, 2, 5]) {
    const acts = [...Array.from({ length: n }, (_, i) => act(`R${i + 1}`, [T.a, T.c, T.b])), act('Fin', 0, Array.from({ length: n }, (_, i) => `R${i + 1}`))];
    const r = await simularPlazo(red(acts), [], op());
    const q = (p: number) => tri.quantile(p ** (1 / n));
    casos.push({
      id: `V-02.${n}`, titulo: `Convergencia de ${n} ruta${n === 1 ? '' : 's'} paralela${n === 1 ? '' : 's'} (merge bias)`,
      fundamento: `El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^${n}, así que el percentil p es F⁻¹(p^(1/${n})) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.`,
      planteamiento: `${n === 1 ? 'Una ruta' : `${n} rutas`} de una tarea triangular(${T.a}, ${T.c}, ${T.b}) que ${n === 1 ? 'termina' : 'convergen'} en un hito${n === 1 ? ' (la referencia sin convergencia)' : ''}. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('P50 del fin (días)', q(0.5), cuantil(r.finProyecto, 0.5), 0.05),
        cerca('P80 del fin (días)', q(0.8), cuantil(r.finProyecto, 0.8), 0.05),
        ...(n > 1 ? [cerca('Criticidad de cada ruta (por simetría, 1/n)', 1 / n, (r.actividades[0] as { criticidad: number }).criticidad, 0.01)] : []),
      ],
    });
  }

  // 3. Risk drivers (AACE 57R‑09): una causa común frente a dos causas independientes.
  {
    const acts = [act('A', 10), act('B', 10), act('Fin', 0, ['A', 'B'])];
    const comun = await simularPlazo(red(acts), [riesgo('Común', 0.3, 0.2, ['A', 'B'])], op());
    const indep = await simularPlazo(red(acts), [riesgo('RA', 0.3, 0.2, ['A']), riesgo('RB', 0.3, 0.2, ['B'])], op());
    const p12 = (r: typeof comun) => r.finProyecto.filter((x) => x > 11).length / r.finProyecto.length;
    casos.push({
      id: 'V-03', titulo: 'Risk driver: una causa común frente a dos independientes',
      fundamento: 'Con un solo riesgo (30 %) que alarga a la vez las dos rutas, el proyecto se retrasa con probabilidad 0,3; con dos riesgos independientes, uno por ruta, con 1 − 0,7² = 0,51. Es la correlación que modela el método de risk drivers (AACE 57R‑09) sin pedir coeficientes.',
      planteamiento: `Dos tareas fijas de 10 días en paralelo; impacto +20 % (a 12 días). ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('P(fin = 12 días), causa común', 0.3, p12(comun), 0.005),
        cerca('P(fin = 12 días), causas independientes', 0.51, p12(indep), 0.005),
      ],
    });
  }

  // 4. Ramificación probabilística (V2).
  {
    const acts = [act('A', 10), act('B', 0, ['A'])];
    const r = await simularPlazo(red(acts), [{ ...riesgo('Rework', 0.25, 0, []), rama: { nombre: 'Reproceso', min: 5, masProbable: 5, max: 5, despuesDe: ['A'], antesDe: ['B'] } }], op());
    casos.push({
      id: 'V-04', titulo: 'Ramificación: un riesgo que añade una actividad',
      fundamento: 'Si el riesgo ocurre (25 %), aparece un reproceso de 5 días entre A y el fin: el fin es 15 días con probabilidad 0,25 y 10 en el resto.',
      planteamiento: `A (10 días fijos) → fin; reproceso condicional de 5 días. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [cerca('P(fin = 15 días)', 0.25, r.finProyecto.filter((x) => x > 12).length / r.finProyecto.length, 0.005)],
    });
  }

  // 5. Probabilidad conjunta (JCL).
  {
    const indep = await simularPlazo(red([act('A', [T.a, T.c, T.b], [], { costoFijo: 1000, costoFijoRango: { min: 800, max: 1500 } })]), [], op());
    const ligado = await simularPlazo(red([act('A', [T.a, T.c, T.b], [], { costoPorDia: 100 })]), [], op());
    // El plazo se cuenta en días enteros (el día en que termina): P(plazo ≤ su P80) = F(⌈F⁻¹(0,8)⌉), algo más de 0,8.
    const pPlazo = tri.cdf(Math.ceil(tri.quantile(0.8)));
    casos.push({
      id: 'V-05', titulo: 'Probabilidad conjunta de plazo y costo (JCL)',
      fundamento: `Con costo independiente del plazo, P(plazo ≤ P80 y costo ≤ P80) = P(plazo ≤ P80) × 0,8. Como el plazo se cuenta en días enteros, P(plazo ≤ P80) = F(⌈F⁻¹(0,8)⌉) = ${f(pPlazo, 4)}, y la JCL esperada es ${f(pPlazo * 0.8, 4)}. Con el costo proporcional a la duración (costo por día), los dos se mueven juntos y la JCL es 0,8.`,
      planteamiento: `Una tarea triangular(${T.a}, ${T.c}, ${T.b}); (a) costo fijo con rango propio; (b) solo costo por día. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('JCL con costo independiente', pPlazo * 0.8, indep.costos!.jclP80, 0.01),
        cerca('JCL con costo ligado al plazo', 0.8, ligado.costos!.jclP80, 0.01),
      ],
    });
  }

  // 6. CPM con las cuatro relaciones y un calendario con festivo (a mano).
  {
    // Lunes 01/02/2027 = índice 0; festivo el miércoles 10/02.
    const c = red([
      act('A', 5),
      { ...act('B', 3), predecesoras: [{ predecesora: 'A', tipo: 'FS', retardo: 2 }] },
      { ...act('C', 4), predecesoras: [{ predecesora: 'A', tipo: 'SS', retardo: 1 }] },
      { ...act('D', 2), predecesoras: [{ predecesora: 'B', tipo: 'FF', retardo: 1 }] },
      { ...act('E', 3), predecesoras: [{ predecesora: 'C', tipo: 'SF', retardo: 6 }] },
    ], { calendario: { ...CALENDARIO_ESTANDAR, festivos: new Set([46_428]) } });
    const r = calcularCPM(c);
    if (!r.ok) throw new Error('CPM');
    const fecha = (s: number) => new Date(Date.UTC(1899, 11, 30) + s * 86_400_000).toISOString().slice(0, 10);
    const fila = (id: string) => r.filas.find((x) => x.id === id)!;
    casos.push({
      id: 'V-06', titulo: 'CPM: las cuatro relaciones, retardos y un festivo',
      fundamento: 'Cálculo a mano con la convención de MS Project (el fin es el último día trabajado). A: 01–05/02. B (FC+2): los dos días de retardo son el lunes 8 y el martes 9; el miércoles 10 es festivo, así que B va del jueves 11 al lunes 15/02. C (CC+1): 02/02–05/02. D (FF+1 de B): termina un día laborable después que B, el martes 16/02, y empieza el lunes 15. E (CF+6 de C): termina 6 días laborables después del inicio de C, el martes 09/02 (empieza el viernes 05/02).',
      planteamiento: 'Cinco tareas con FC+2, CC+1, FF+1 y CF+6; calendario de lunes a viernes con festivo el 10/02/2027.',
      comprobaciones: [
        exacto('B: inicio / fin', '2027-02-11 / 2027-02-15', `${fecha(fila('B').fechaInicio)} / ${fecha(fila('B').fechaFin)}`),
        exacto('C: inicio / fin', '2027-02-02 / 2027-02-05', `${fecha(fila('C').fechaInicio)} / ${fecha(fila('C').fechaFin)}`),
        exacto('D: inicio / fin', '2027-02-15 / 2027-02-16', `${fecha(fila('D').fechaInicio)} / ${fecha(fila('D').fechaFin)}`),
        exacto('E: inicio / fin', '2027-02-05 / 2027-02-09', `${fecha(fila('E').fechaInicio)} / ${fecha(fila('E').fechaFin)}`),
        exacto('Fin del proyecto', '2027-02-16', fecha(r.fechaFinProyecto)),
      ],
    });
  }

  // 7. Calendario por actividad: 6 días frente a 5.
  {
    const seis = { laborables: [false, true, true, true, true, true, true], festivos: new Set<number>() };
    const r5 = calcularCPM(red([act('A', 12)]));
    const r6 = calcularCPM(red([act('A', 12, [], { calendario: '6 días' })], { calendarios: { '6 días': seis } }));
    if (!r5.ok || !r6.ok) throw new Error('CPM');
    const fecha = (s: number) => new Date(Date.UTC(1899, 11, 30) + s * 86_400_000).toISOString().slice(0, 10);
    casos.push({
      id: 'V-07', titulo: 'Calendarios por actividad',
      fundamento: '12 días laborables desde el lunes 01/02/2027: de lunes a viernes terminan el martes 16/02; trabajando también los sábados, el sábado 13/02.',
      planteamiento: 'Una tarea de 12 días con el calendario del proyecto (L–V) y con uno de 6 días (L–S).',
      comprobaciones: [exacto('Fin con L–V', '2027-02-16', fecha(r5.fechaFinProyecto)), exacto('Fin con L–S', '2027-02-13', fecha(r6.fechaFinProyecto))],
    });
  }

  // 8. Clima: el ritmo de un mes que pierde días.
  {
    const meses = Array.from({ length: 12 }, () => ({ min: 0, masProbable: 0, max: 0 }));
    meses[1] = { min: 4, masProbable: 4, max: 4 };
    const r = await simularPlazo(red([act('A', 10)], { clima: { meses, afecta: ['A'] } }), [], op(100));
    casos.push({
      id: 'V-08', titulo: 'Clima: días perdidos en el mes',
      fundamento: 'Febrero de 2027 tiene 20 días laborables; si se pierden 4, se avanza al 80 %: 10 días de trabajo tardan 10 / 0,8 = 12,5.',
      planteamiento: 'Una tarea de 10 días que empieza el 01/02/2027, expuesta a un clima que quita siempre 4 días en febrero.',
      comprobaciones: [cerca('Duración (días laborables)', 12.5, r.finProyecto[0] as number, 1e-9, 4)],
    });
  }
  return casos;
}

/** Comparación con la implementación independiente en Python (el libro de pruebas). */
export async function casosContraPython(libro = 'ejemplos/demo-cronograma.xlsx'): Promise<CasoValidacion[]> {
  const hoja = (n: string) => leerHojaComoMatriz(libro, n) as unknown[][];
  const casos: CasoValidacion[] = [];
  const cron = leerCronograma(hoja('Actividades'), hoja('Calendario')).cronograma as Cronograma;

  // CPM fila a fila.
  const filasIguales = (c: Cronograma, esperado: unknown[][]) => {
    const r = calcularCPM(c);
    if (!r.ok) return { iguales: 0, total: 0 };
    const h = hojaResultadoCPM(r);
    const calc = h.valores.slice(h.primeraFilaDatos).map((x) => JSON.stringify([...x.slice(0, 7), Math.round((x[7] as number) * 1e6) / 1e6, x[8]]));
    const esp = esperado.slice(5).filter((x) => x[0] !== '').map((x) => JSON.stringify([...x.slice(0, 7), Math.round((x[7] as number) * 1e6) / 1e6, x[8]]));
    return { iguales: calc.filter((x, i) => x === esp[i]).length, total: esp.length };
  };
  const base = filasIguales(cron, hoja('Esperado'));
  casos.push({
    id: 'P-01', titulo: 'CPM del proyecto de prueba (20 actividades)',
    fundamento: 'El CPM de `generar-cronograma.py`, escrito aparte en Python: fechas temprana y tardía, holgura y ruta crítica.',
    planteamiento: 'Centro comunitario: las cuatro relaciones, retardos y un adelanto, dos hitos, «inicio no antes de», cinco festivos.',
    comprobaciones: [exacto('Filas idénticas (fechas, holgura, crítica)', `${base.total} de ${base.total}`, `${base.iguales} de ${base.total}`)],
  });

  const r = await simularPlazo(cron, leerRiesgosPlazo(hoja('Riesgos de plazo'), cron.actividades).riesgos, { ...OPCIONES_PLAZO_POR_DEFECTO, iteraciones: 20_000 });
  const e = hoja('Esperado (simulación)');
  const diaEsperado = (i: number) => e[3 + i]![1] as number;
  casos.push({
    id: 'P-02', titulo: 'Monte Carlo del proyecto de prueba (PERT + cinco riesgos)',
    fundamento: 'El Monte Carlo de `generar-cronograma.py` (otros números aleatorios, 20.000 iteraciones): los percentiles deben coincidir dentro del error de muestreo.',
    planteamiento: '20.000 iteraciones, semilla por defecto, duraciones PERT.',
    comprobaciones: [
      ...(['P10', 'P50', 'P80', 'P90'] as const).map((n, i) => cerca(`${n} (días laborables)`, diaEsperado(i), [r.dias.p10, r.dias.p50, r.dias.p80, r.dias.p90][i] as number, 1, 0)),
      ...(['P50', 'P80'] as const).map((n, i) => {
        const esp = e[5 + i]![5] as number;
        const obt = [r.costos!.p50, r.costos!.p80][i] as number;
        return { magnitud: `Costo ${n}`, esperado: f(esp, 0), obtenido: f(obt, 0), tolerancia: '± 1 %', ok: Math.abs(obt / esp - 1) <= 0.01 };
      }),
      { magnitud: 'JCL', esperado: pct(e[8]![5] as number), obtenido: pct(r.costos!.jclP80), tolerancia: '± 3 puntos', ok: Math.abs(r.costos!.jclP80 - (e[8]![5] as number)) <= 0.03 },
    ],
  });
  return casos;
}

/**
 * Casos publicados por la GAO que se pueden reproducir con los datos que
 * publica (ver `docs/VALIDACION_CRONOGRAMA.md`, «Casos publicados»). Los que
 * no traen la red completa no se convierten en comprobaciones numéricas.
 */
export async function casosPublicados(): Promise<CasoValidacion[]> {
  const casos: CasoValidacion[] = [];

  // GAO-16-89G, mejor práctica 8, «Merge Bias and Schedule Underestimation» (fig. 36).
  {
    // Cada ruta: 10 días fijos y un riesgo propio del 40 % que la alarga un 50 %: llega a tiempo con 60 % exacto.
    const ruta = (k: number) => act(`R${k}`, 10);
    const riesgos = (n: number) => Array.from({ length: n }, (_, i) => riesgo(`Retraso ${i + 1}`, 0.4, 0.5, [`R${i + 1}`]));
    const aTiempo = (r: { finProyecto: Float64Array }) => r.finProyecto.filter((x) => x <= 10 + 1e-9).length / r.finProyecto.length;
    const dos = await simularPlazo(red([ruta(1), ruta(2), act('Hito', 0, ['R1', 'R2'])]), riesgos(2), op());
    const tres = await simularPlazo(red([ruta(1), ruta(2), ruta(3), act('Hito', 0, ['R1', 'R2', 'R3'])]), riesgos(3), op());
    casos.push({
      id: 'G-01', titulo: 'GAO: sesgo de convergencia con rutas del 60 %',
      fundamento: 'GAO‑16‑89G, mejor práctica 8, «Merge Bias and Schedule Underestimation» (figura 36): dos rutas independientes que llegan a tiempo con 60 % cada una dejan el hito a tiempo con 0,6 × 0,6 = 36 %; con tres rutas, 0,6³ ≈ 22 %.',
      planteamiento: `Cada ruta: una actividad de 10 días con un riesgo propio del 40 % que la alarga un 50 % (llega a tiempo con 60 %). Las rutas convergen en un hito. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('P(hito a tiempo), 2 rutas', 0.36, aTiempo(dos), 0.005),
        cerca('P(hito tarde), 2 rutas (24 % + 24 % + 16 %)', 0.64, 1 - aTiempo(dos), 0.005),
        cerca('P(hito a tiempo), 3 rutas', 0.216, aTiempo(tres), 0.005),
      ],
    });
  }

  // GAO-16-89G, apéndice IV (tabla 9, figuras 51-56): pasada adelante y atrás.
  {
    const c: Cronograma = {
      inicio: 42_031, // martes 27/01/2015
      calendario: CALENDARIO_ESTANDAR,
      actividades: [
        act('M1', 1), act('M2', 1), act('M3', 1),
        act('T1', 2, ['M1']), act('T2', 1, ['M1', 'M2']), act('T3', 2, ['M2', 'M3']),
        act('FIN', 0, ['T1', 'T2', 'T3']),
      ],
    };
    const r = calcularCPM(c);
    const fila = (id: string) => (r.ok ? r.filas.find((x) => x.id === id) : undefined);
    const dia = (serie: number | undefined) => (serie === undefined ? '—' : new Date(Date.UTC(1899, 11, 30) + serie * 86_400_000).toISOString().slice(5, 10).split('-').reverse().join('/'));
    casos.push({
      id: 'G-02', titulo: 'GAO: pasada adelante y atrás (arranque y pruebas de una casa)',
      fundamento: 'GAO‑16‑89G, apéndice IV «The Forward and Backward Pass», tabla 9 y figuras 51 a 56: inicios y fines tempranos y tardíos publicados, día a día.',
      planteamiento: 'Tres medidores de un día (M1 electricidad, M2 gas, M3 agua) y tres pruebas: T1 (2 días, tras M1), T2 (1 día, tras M1 y M2) y T3 (2 días, tras M2 y M3), que acaban en un hito. Todas fin‑comienzo, lunes a viernes, inicio el martes 27 de enero.',
      comprobaciones: [
        exacto('Inicio temprano de M1, M2 y M3', '27/01, 27/01, 27/01', ['M1', 'M2', 'M3'].map((x) => dia(fila(x)?.fechaInicio)).join(', ')),
        exacto('T1: inicio y fin tempranos', '28/01 – 29/01', `${dia(fila('T1')?.fechaInicio)} – ${dia(fila('T1')?.fechaFin)}`),
        exacto('T3: inicio y fin tempranos', '28/01 – 29/01', `${dia(fila('T3')?.fechaInicio)} – ${dia(fila('T3')?.fechaFin)}`),
        exacto('T2: inicio temprano e inicio tardío', '28/01 – 29/01', `${dia(fila('T2')?.fechaInicio)} – ${dia(fila('T2')?.fechaInicioTardio)}`),
        exacto('T2: holgura total (días)', 1, fila('T2')?.holguraTotal ?? '—'),
        exacto('T3: inicio tardío', '28/01', dia(fila('T3')?.fechaInicioTardio)),
        exacto('M2: fin tardío', '27/01', dia(fila('M2')?.fechaFinTardio)),
        exacto('Hito de fin', '29/01', dia(fila('FIN')?.fechaFin)),
      ],
    });
  }

  // GAO-20-195G, tabla 12 y figura 15: costo del vehículo aéreo no tripulado (UAV), tres puntos.
  {
    const elementos: Array<[string, number, number, number]> = [
      ['Airframe', 17_955, 19_645, 21_785], ['Propulsion', 8_500, 10_553, 13_000], ['Communications', 4_000, 4_306, 5_100],
      ['Navigation', 4_100, 4_305, 4_650], ['Central Computer', 550, 600, 650], ['Software', 32_300, 35_547, 52_500],
      ['Integration, assembly, test and check-out', 1_950, 2_136, 2_600],
    ];
    const x = await simularCosto(
      Object.fromEntries([
        ...elementos.map(([, a, m, b], i) => [`A${i + 1}`, `RIESGO.TRIANGULAR(${a},${m},${b})`]),
        ['B1', `32*SUM(A1:A${elementos.length})`],
      ]),
      'B1', N,
    );
    const puntual = 32 * elementos.reduce((sum, e) => sum + e[2], 0);
    const mediaExacta = 32 * elementos.reduce((sum, [, a, m, b]) => sum + (a + m + b) / 3, 0);
    const desvExacta = 32 * Math.sqrt(elementos.reduce((sum, [, a, m, b]) => sum + (a * a + m * m + b * b - a * m - a * b - m * b) / 18, 0));
    const mm = (v: number) => v / 1e6; // miles de dólares → miles de millones
    const relativo = (magnitud: string, esperado: number, obtenido: number, tol: number): Comprobacion => ({
      magnitud, esperado: f(mm(esperado), 3), obtenido: f(mm(obtenido), 3), tolerancia: `± ${f(tol * 100, 1)} %`, ok: Math.abs(obtenido / esperado - 1) <= tol,
    });
    casos.push({
      id: 'G-03', titulo: 'GAO: costo de 32 vehículos aéreos no tripulados, con tres puntos',
      fundamento: 'GAO‑20‑195G (*Cost Estimating and Assessment Guide*), tabla 12 y figura 15: estimación puntual de 2,47 mil millones de dólares, P50 de 2,61, P80 de 2,79 y «cerca de un 15 %» de terminar en la estimación puntual o por debajo. La media y la desviación de una suma de triangulares independientes se conocen exactas.',
      planteamiento: `Siete elementos triangulares (miles de dólares por vehículo), sumados y multiplicados por 32 vehículos (el costo por vehículo se sortea una vez: los 32 son iguales). Con el motor de costos, ${N.toLocaleString('es')} iteraciones. Cifras en miles de millones de dólares.`,
      comprobaciones: [
        exacto('Estimación puntual (miles de millones)', '2,467', f(mm(puntual), 3)),
        relativo('Media (exacta)', mediaExacta, media(x), 0.002),
        relativo('Desviación típica (exacta)', desvExacta, desviacion(x), 0.01),
        relativo('P50 (publicado 2,61)', 2.61e6, cuantil(x, 0.5), 0.01),
        relativo('P80 (publicado 2,79)', 2.79e6, cuantil(x, 0.8), 0.02),
        cerca('P(costo ≤ estimación puntual) (publicado «cerca del 15 %»)', 0.15, x.filter((v) => v <= puntual).length / x.length, 0.03),
      ],
    });
  }
  return casos;
}

/** Todo el camino del modelo de costos (como el panel, sin Excel): las muestras de la salida. */
async function simularCosto(formulas: Record<string, string>, salida: string, n: number): Promise<Float64Array> {
  const H = 'Costos';
  const pos = (ref: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(ref) as RegExpExecArray;
    return { col: [...(m[1] as string)].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0), fila: Number(m[2]) };
  };
  const fs: FormulaCelda[] = Object.entries(formulas).map(([ref, formula]) => ({ hoja: H, ...pos(ref), formula }));
  const { grafo } = construirGrafo(fs, []);
  const clave = claveDeReferencia(H, salida);
  const d = entradasDeFunciones(fs, grafo, [], [clave]);
  if (d.errores.length > 0) throw new Error(d.errores.join('; '));
  aplicarReescrituras(grafo, d);
  const base = modeloVacio();
  const semilla = 20_270_201;
  const modelo = { ...base, inputs: d.entradas, outputs: [{ id: 's', name: salida, ref: clave }], settings: { ...base.settings, iterations: n, seed: semilla } };
  const p = prepararEntradas(modelo, resolverConFunciones((ref) => ref, d), semilla);
  if (!p.ok) throw new Error(p.errores.join('; '));
  const c = compilarPlan(grafo, new Set(d.claves), [clave]);
  if (!c.ok) throw new Error(c.error.motivo);
  const r = await simularPorBloques(grafo, c.plan, p.entradas, semilla, n, { retenerMuestra: n });
  if (!r.ok) throw new Error(r.error.motivo);
  return r.porSalida.get(clave)!.muestra!;
}

export async function todosLosCasos(): Promise<CasoValidacion[]> {
  return [...(await casosAnaliticos()), ...(await casosContraPython()), ...(await casosPublicados())];
}
