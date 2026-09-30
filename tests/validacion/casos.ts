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

export async function todosLosCasos(): Promise<CasoValidacion[]> {
  return [...(await casosAnaliticos()), ...(await casosContraPython())];
}
