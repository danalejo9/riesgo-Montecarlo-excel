/**
 * Casos de validación publicables del módulo de cronograma (W3), sobre el
 * motor QRSA. Dos clases de comprobación, las dos reproducibles por
 * cualquiera:
 *
 * 1. **Analíticas**: redes pequeñas cuya respuesta se calcula a mano o con
 *    una fórmula (suma de tareas en serie, sesgo de convergencia —*merge
 *    bias*—, criticidad por simetría, *risk drivers* de AACE 57R‑09,
 *    ramificación, JCL, las cuatro relaciones con un festivo, calendarios y
 *    clima). El motor debe dar lo mismo, exacto o dentro de la tolerancia
 *    estadística que se indica.
 * 2. **Publicadas por la GAO**: los ejemplos de las guías GAO‑16‑89G y
 *    GAO‑20‑195G que traen todos los datos para reproducirlos.
 *
 * La comparación con una implementación independiente en Python está en
 * `tests/unit/cronogramaReferencias.test.ts` (R1–R3). La usan
 * `validacion.test.ts` (en cada `npm test`) y `bench/validacion.ts`, que
 * escribe `docs/VALIDACION_CRONOGRAMA.md`.
 */

import {
  CONFIGURACION_POR_DEFECTO, compilarRed, cpmDeterministico, LUNES_A_VIERNES, MESES, simularCronograma,
  type ActividadRed, type DefinicionCalendario, type IncertidumbreActividad, type ModeloCronograma, type RiesgoCronograma,
} from '../../engine/cronograma/index.ts';
import { triangular } from '../../engine/distributions/index.ts';
import { serieDeFecha } from '../../engine/modelo/fechas.ts';
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

const INICIO = serieDeFecha(2027, 2, 1); // lunes
const N = 100_000;
const f = (x: number, d = 3) => x.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const cuantil = (xs: ArrayLike<number>, q: number) => {
  const o = Float64Array.from(xs).sort();
  return o[Math.min(o.length - 1, Math.floor(q * o.length))] as number;
};
const media = (xs: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i] as number;
  return s / xs.length;
};
const desviacion = (xs: ArrayLike<number>) => {
  const m = media(xs);
  let q = 0;
  for (let i = 0; i < xs.length; i++) q += ((xs[i] as number) - m) ** 2;
  return Math.sqrt(q / (xs.length - 1));
};
const proporcion = (xs: ArrayLike<number>, p: (x: number) => boolean) => {
  let k = 0;
  for (let i = 0; i < xs.length; i++) if (p(xs[i] as number)) k++;
  return k / xs.length;
};
const cerca = (magnitud: string, esperado: number, obtenido: number, tol: number, digitos = 3): Comprobacion => ({
  magnitud, esperado: f(esperado, digitos), obtenido: f(obtenido, digitos), tolerancia: `± ${f(tol, digitos)}`, ok: Math.abs(obtenido - esperado) <= tol,
});
const exacto = (magnitud: string, esperado: string | number, obtenido: string | number): Comprobacion => ({
  magnitud, esperado: String(esperado), obtenido: String(obtenido), tolerancia: 'exacto', ok: esperado === obtenido,
});
const dia = (serie: number | undefined) => (serie === undefined ? '—' : new Date(Date.UTC(1899, 11, 30) + serie * 86_400_000).toISOString().slice(0, 10));

const fc = (id: string, desfase = 0) => ({ id, tipo: 'FC' as const, desfase });
const act = (id: string, duracion: number, preds: string[] = [], extra: Partial<ActividadRed> = {}): ActividadRed => ({ id, nombre: id, duracion, predecesoras: preds.map((p) => fc(p)), ...extra });
const tri3 = (a: number, m: number, b: number) => ({ tipo: 'triangular' as const, min: a, moda: m, max: b });
const fija = (valor: number) => ({ tipo: 'fija' as const, valor });

function modelo(
  actividades: ActividadRed[], incertidumbre: IncertidumbreActividad[] = [], riesgos: RiesgoCronograma[] = [],
  extra: Partial<ModeloCronograma> = {}, calendarios: DefinicionCalendario[] = [{ id: 'L–V', laborables: LUNES_A_VIERNES }], inicio = INICIO,
): ModeloCronograma {
  return {
    red: { inicio, calendarios, actividades },
    incertidumbre, riesgos,
    configuracion: { ...CONFIGURACION_POR_DEFECTO, iteraciones: N, metodo: 'monte-carlo', redondeo: 'decimal', semilla: 20_270_201 },
    ...extra,
  };
}

/** Triangular(8, 10, 15): media, varianza y cuantiles exactos. */
const T = { a: 8, c: 10, b: 15 };
const tri = triangular(T.a, T.c, T.b);
const mediaT = (T.a + T.b + T.c) / 3;
const varT = (T.a ** 2 + T.b ** 2 + T.c ** 2 - T.a * T.b - T.a * T.c - T.b * T.c) / 18;
const conT = (ids: string[]) => ids.map((actividad) => ({ actividad, distribucion: tri3(T.a, T.c, T.b) }));

export async function casosAnaliticos(): Promise<CasoValidacion[]> {
  const casos: CasoValidacion[] = [];

  // 1. Tareas en serie: la suma de independientes.
  {
    const ids = Array.from({ length: 10 }, (_, i) => `A${i + 1}`);
    const sim = await simularCronograma(modelo(ids.map((id, i) => act(id, T.c, i === 0 ? [] : [ids[i - 1] as string])), conT(ids)));
    casos.push({
      id: 'V-01', titulo: 'Diez tareas en serie',
      fundamento: 'Suma de variables independientes: la media y la varianza se suman (exacto, para cualquier distribución).',
      planteamiento: `10 tareas fin‑comienzo, cada una triangular(${T.a}, ${T.c}, ${T.b}) días laborables. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('Media de la duración total (días)', 10 * mediaT, media(sim.fin.dias), 0.05),
        cerca('Desviación típica (días)', Math.sqrt(10 * varT), desviacion(sim.fin.dias), 0.05),
      ],
    });
  }

  // 2. Sesgo de convergencia (merge bias): n rutas paralelas iguales.
  for (const n of [1, 2, 5]) {
    const ids = Array.from({ length: n }, (_, i) => `R${i + 1}`);
    const sim = await simularCronograma(modelo([...ids.map((id) => act(id, T.c)), act('Fin', 0, ids)], conT(ids)));
    const q = (p: number) => tri.quantile(p ** (1 / n));
    casos.push({
      id: `V-02.${n}`, titulo: `Convergencia de ${n} ruta${n === 1 ? '' : 's'} paralela${n === 1 ? '' : 's'} (merge bias)`,
      fundamento: `El fin espera a la ruta más lenta: P(fin ≤ t) = F(t)^${n}, así que el percentil p es F⁻¹(p^(1/${n})) con F la triangular. Es el efecto que describen la guía GAO‑16‑89G y la AACE para explicar por qué el P80 cae después del cronograma.`,
      planteamiento: `${n === 1 ? 'Una ruta' : `${n} rutas`} de una tarea triangular(${T.a}, ${T.c}, ${T.b}) que ${n === 1 ? 'termina' : 'convergen'} en un hito${n === 1 ? ' (la referencia sin convergencia)' : ''}. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('P50 del fin (días)', q(0.5), cuantil(sim.fin.dias, 0.5), 0.05),
        cerca('P80 del fin (días)', q(0.8), cuantil(sim.fin.dias, 0.8), 0.05),
        ...(n > 1 ? [cerca('Criticidad de cada ruta (por simetría, 1/n)', 1 / n, sim.criticidad[0] as number, 0.01)] : []),
      ],
    });
  }

  // 3. Risk drivers (AACE 57R‑09): una causa común frente a dos causas independientes.
  {
    const acts = [act('A', 10), act('B', 10), act('Fin', 0, ['A', 'B'])];
    const comun = await simularCronograma(modelo(acts, [], [{ id: 'Común', nombre: 'Común', probabilidad: 0.3, impactos: [{ actividad: 'A', dias: fija(2) }, { actividad: 'B', dias: fija(2) }] }]));
    const indep = await simularCronograma(modelo(acts, [], [
      { id: 'RA', nombre: 'RA', probabilidad: 0.3, impactos: [{ actividad: 'A', dias: fija(2) }] },
      { id: 'RB', nombre: 'RB', probabilidad: 0.3, impactos: [{ actividad: 'B', dias: fija(2) }] },
    ]));
    casos.push({
      id: 'V-03', titulo: 'Risk driver: una causa común frente a dos independientes',
      fundamento: 'Con un solo riesgo (30 %) que alarga a la vez las dos rutas, el proyecto se retrasa con probabilidad 0,3; con dos riesgos independientes, uno por ruta, con 1 − 0,7² = 0,51. Es la correlación que modela el método de risk drivers (AACE 57R‑09) sin pedir coeficientes.',
      planteamiento: `Dos tareas fijas de 10 días en paralelo; impacto +2 días (a 12). ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('P(fin = 12 días), causa común', 0.3, proporcion(comun.fin.dias, (x) => x > 11), 0.005),
        cerca('P(fin = 12 días), causas independientes', 0.51, proporcion(indep.fin.dias, (x) => x > 11), 0.005),
      ],
    });
  }

  // 4. Ramificación probabilística.
  {
    const sim = await simularCronograma(modelo([act('A', 10), act('RW', 5, ['A']), act('B', 0, ['RW'])], [], [], {
      ramas: [{ rama: 'Reproceso', opciones: [{ opcion: 'Sí', probabilidad: 0.25, actividades: ['RW'] }, { opcion: 'No', probabilidad: 0.75, actividades: [] }] }],
    }));
    casos.push({
      id: 'V-04', titulo: 'Ramificación: un reproceso que puede aparecer',
      fundamento: 'Si la rama «Sí» sale (25 %), aparece un reproceso de 5 días entre A y el fin: el fin es 15 días con probabilidad 0,25 y 10 en el resto. El determinístico sigue la opción más probable (sin reproceso).',
      planteamiento: `A (10 días fijos) → reproceso (5 días, solo en la opción «Sí» de la rama) → fin. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('P(fin = 15 días)', 0.25, proporcion(sim.fin.dias, (x) => x > 12), 0.005),
        exacto('Duración determinística (días)', 10, sim.deterministico.duracion),
      ],
    });
  }

  // 5. Probabilidad conjunta (JCL).
  {
    const una = [act('A', T.c)];
    const indep = await simularCronograma({ ...modelo(una, conT(['A'])), costos: [{ id: 'C', nombre: 'Costo propio', tipo: 'fijo', valor: 1000, distribucion: tri3(800, 1000, 1500) }] });
    const ligado = await simularCronograma({ ...modelo(una, conT(['A'])), costos: [{ id: 'C', nombre: 'Por día', tipo: 'tiempo', actividad: 'A', valor: 100 }] });
    const jcl = (s: typeof indep) => {
      const d80 = cuantil(s.fin.dias, 0.8);
      const c80 = cuantil(s.costo as Float64Array, 0.8);
      let k = 0;
      for (let i = 0; i < s.iteraciones; i++) if ((s.fin.dias[i] as number) <= d80 && ((s.costo as Float64Array)[i] as number) <= c80) k++;
      return k / s.iteraciones;
    };
    casos.push({
      id: 'V-05', titulo: 'Probabilidad conjunta de plazo y costo (JCL)',
      fundamento: 'Con el costo independiente del plazo, P(plazo ≤ P80 y costo ≤ P80) = 0,8 × 0,8 = 0,64. Con el costo proporcional a la duración (por día), los dos se mueven juntos y la JCL es 0,8.',
      planteamiento: `Una tarea triangular(${T.a}, ${T.c}, ${T.b}); (a) un costo fijo con su propio rango triangular(800, 1.000, 1.500); (b) solo un costo por día. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [cerca('JCL con costo independiente', 0.64, jcl(indep), 0.01), cerca('JCL con costo ligado al plazo', 0.8, jcl(ligado), 0.01)],
    });
  }

  // 6. CPM con las cuatro relaciones y un calendario con festivo (a mano).
  {
    const red = compilarRed({
      inicio: INICIO,
      calendarios: [{ id: 'L–V', laborables: LUNES_A_VIERNES, festivos: [serieDeFecha(2027, 2, 10)] }],
      actividades: [
        act('A', 5),
        { ...act('B', 3), predecesoras: [{ id: 'A', tipo: 'FC', desfase: 2 }] },
        { ...act('C', 4), predecesoras: [{ id: 'A', tipo: 'CC', desfase: 1 }] },
        { ...act('D', 2), predecesoras: [{ id: 'B', tipo: 'FF', desfase: 1 }] },
        { ...act('E', 3), predecesoras: [{ id: 'C', tipo: 'CF', desfase: 6 }] },
      ],
    });
    const r = cpmDeterministico(red);
    const fila = (id: string) => r.filas.find((x) => x.id === id);
    const rango = (id: string) => `${dia(fila(id)?.inicio)} / ${dia(fila(id)?.fin)}`;
    casos.push({
      id: 'V-06', titulo: 'CPM: las cuatro relaciones, desfases y un festivo',
      fundamento: 'Cálculo a mano con la convención de MS Project (el fin es el último día trabajado). A: 01–05/02. B (FC+2): los dos días de desfase son el lunes 8 y el martes 9; el miércoles 10 es festivo, así que B va del jueves 11 al lunes 15/02. C (CC+1): 02/02–05/02. D (FF+1 de B): termina un día laborable después que B, el martes 16/02, y empieza el lunes 15. E (CF+6 de C): termina 6 días laborables después del inicio de C, el martes 09/02 (empieza el viernes 05/02).',
      planteamiento: 'Cinco tareas con FC+2, CC+1, FF+1 y CF+6; calendario de lunes a viernes con festivo el 10/02/2027.',
      comprobaciones: [
        exacto('B: inicio / fin', '2027-02-11 / 2027-02-15', rango('B')),
        exacto('C: inicio / fin', '2027-02-02 / 2027-02-05', rango('C')),
        exacto('D: inicio / fin', '2027-02-15 / 2027-02-16', rango('D')),
        exacto('E: inicio / fin', '2027-02-05 / 2027-02-09', rango('E')),
        exacto('Fin del proyecto', '2027-02-16', dia(r.fin)),
      ],
    });
  }

  // 7. Calendario por actividad: 6 días frente a 5.
  {
    const cals: DefinicionCalendario[] = [{ id: 'L–V', laborables: LUNES_A_VIERNES }, { id: 'L–S', laborables: [true, true, true, true, true, true, false] }];
    const r5 = cpmDeterministico(compilarRed({ inicio: INICIO, calendarios: cals, actividades: [act('A', 12)] }));
    const r6 = cpmDeterministico(compilarRed({ inicio: INICIO, calendarios: cals, actividades: [act('A', 12, [], { calendario: 'L–S' })] }));
    casos.push({
      id: 'V-07', titulo: 'Calendarios por actividad',
      fundamento: '12 días laborables desde el lunes 01/02/2027: de lunes a viernes terminan el martes 16/02; trabajando también los sábados, el sábado 13/02.',
      planteamiento: 'Una tarea de 12 días con el calendario del proyecto (L–V) y con uno de 6 días (L–S).',
      comprobaciones: [exacto('Fin con L–V', '2027-02-16', dia(r5.fin)), exacto('Fin con L–S', '2027-02-13', dia(r6.filas[0]?.fin))],
    });
  }

  // 8. Clima: el ritmo de un mes que pierde días.
  {
    const meses = MESES.map((_, k) => (k === 1 ? { min: 4, masProbable: 4, max: 4 } : { min: 0, masProbable: 0, max: 0 }));
    const m = modelo([act('A', 10)], [], [], { clima: { meses, afecta: ['A'] } });
    const sim = await simularCronograma({ ...m, configuracion: { ...m.configuracion, iteraciones: 100 } });
    casos.push({
      id: 'V-08', titulo: 'Clima: días perdidos en el mes',
      fundamento: 'Febrero de 2027 tiene 20 días laborables; si se pierden 4, se avanza al 80 %: 10 días de trabajo tardan 10 / 0,8 = 12,5.',
      planteamiento: 'Una tarea de 10 días que empieza el 01/02/2027, expuesta a un clima que quita siempre 4 días en febrero.',
      comprobaciones: [cerca('Duración (días laborables)', 12.5, sim.fin.dias[0] as number, 1e-9, 4)],
    });
  }
  return casos;
}

/**
 * Casos publicados por la GAO que se pueden reproducir con los datos que
 * publica (ver `docs/fuentes/casos_publicados_SRA.md`). Los que no traen la
 * red completa no se convierten en comprobaciones numéricas.
 */
export async function casosPublicados(): Promise<CasoValidacion[]> {
  const casos: CasoValidacion[] = [];

  // GAO-16-89G, mejor práctica 8, «Merge Bias and Schedule Underestimation» (fig. 36).
  {
    // Cada ruta: 10 días fijos y un riesgo propio del 40 % que la alarga 5 días: llega a tiempo con 60 % exacto.
    const rutas = (n: number) => Array.from({ length: n }, (_, i) => act(`R${i + 1}`, 10));
    const riesgos = (n: number): RiesgoCronograma[] => Array.from({ length: n }, (_, i) => ({ id: `Retraso ${i + 1}`, nombre: `Retraso ${i + 1}`, probabilidad: 0.4, impactos: [{ actividad: `R${i + 1}`, dias: fija(5) }] }));
    const hito = (n: number) => act('Hito', 0, Array.from({ length: n }, (_, i) => `R${i + 1}`));
    const dos = await simularCronograma(modelo([...rutas(2), hito(2)], [], riesgos(2)));
    const tres = await simularCronograma(modelo([...rutas(3), hito(3)], [], riesgos(3)));
    const aTiempo = (s: typeof dos) => proporcion(s.fin.dias, (x) => x <= 10 + 1e-9);
    casos.push({
      id: 'G-01', titulo: 'GAO: sesgo de convergencia con rutas del 60 %',
      fundamento: 'GAO‑16‑89G, mejor práctica 8, «Merge Bias and Schedule Underestimation» (figura 36): dos rutas independientes que llegan a tiempo con 60 % cada una dejan el hito a tiempo con 0,6 × 0,6 = 36 %; con tres rutas, 0,6³ ≈ 22 %.',
      planteamiento: `Cada ruta: una actividad de 10 días con un riesgo propio del 40 % que la alarga 5 días (llega a tiempo con 60 %). Las rutas convergen en un hito. ${N.toLocaleString('es')} iteraciones.`,
      comprobaciones: [
        cerca('P(hito a tiempo), 2 rutas', 0.36, aTiempo(dos), 0.005),
        cerca('P(hito tarde), 2 rutas (24 % + 24 % + 16 %)', 0.64, 1 - aTiempo(dos), 0.005),
        cerca('P(hito a tiempo), 3 rutas', 0.216, aTiempo(tres), 0.005),
      ],
    });
  }

  // GAO-16-89G, apéndice IV (tabla 9, figuras 51-56): pasada adelante y atrás.
  {
    const r = cpmDeterministico(compilarRed({
      inicio: serieDeFecha(2015, 1, 27), // martes
      calendarios: [{ id: 'L–V', laborables: LUNES_A_VIERNES }],
      actividades: [
        act('M1', 1), act('M2', 1), act('M3', 1),
        act('T1', 2, ['M1']), act('T2', 1, ['M1', 'M2']), act('T3', 2, ['M2', 'M3']),
        act('FIN', 0, ['T1', 'T2', 'T3']),
      ],
    }));
    const fila = (id: string) => r.filas.find((x) => x.id === id);
    const dm = (serie: number | undefined) => (serie === undefined ? '—' : dia(serie).slice(5).split('-').reverse().join('/'));
    casos.push({
      id: 'G-02', titulo: 'GAO: pasada adelante y atrás (arranque y pruebas de una casa)',
      fundamento: 'GAO‑16‑89G, apéndice IV «The Forward and Backward Pass», tabla 9 y figuras 51 a 56: inicios y fines tempranos y tardíos publicados, día a día. El complemento fecha un hito al comienzo del día laborable siguiente al fin de su predecesora (docs/QRSA_PLAN.md, Q1): el mismo instante que el «fin del 29/01» que publica la GAO.',
      planteamiento: 'Tres medidores de un día (M1 electricidad, M2 gas, M3 agua) y tres pruebas: T1 (2 días, tras M1), T2 (1 día, tras M1 y M2) y T3 (2 días, tras M2 y M3), que acaban en un hito. Todas fin‑comienzo, lunes a viernes, inicio el martes 27 de enero de 2015.',
      comprobaciones: [
        exacto('Inicio temprano de M1, M2 y M3', '27/01, 27/01, 27/01', ['M1', 'M2', 'M3'].map((x) => dm(fila(x)?.inicio)).join(', ')),
        exacto('T1: inicio y fin tempranos', '28/01 – 29/01', `${dm(fila('T1')?.inicio)} – ${dm(fila('T1')?.fin)}`),
        exacto('T3: inicio y fin tempranos', '28/01 – 29/01', `${dm(fila('T3')?.inicio)} – ${dm(fila('T3')?.fin)}`),
        exacto('T2: inicio temprano e inicio tardío', '28/01 – 29/01', `${dm(fila('T2')?.inicio)} – ${dm(fila('T2')?.inicioTardio)}`),
        exacto('T2: holgura total (días)', 1, fila('T2')?.holguraTotal ?? '—'),
        exacto('T3: inicio tardío', '28/01', dm(fila('T3')?.inicioTardio)),
        exacto('M2: fin tardío', '27/01', dm(fila('M2')?.finTardio)),
        exacto('Hito de fin (publicado: fin del 29/01 = comienzo del 30/01)', '30/01', dm(fila('FIN')?.fin)),
      ],
    });
  }

  // GAO-20-195G, tabla 12 y figura 15: costo del vehículo aéreo no tripulado (UAV), tres puntos.
  {
    const elementos: [string, number, number, number][] = [
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
        cerca('P(costo ≤ estimación puntual) (publicado «cerca del 15 %»)', 0.15, proporcion(x, (v) => v <= puntual), 0.03),
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
  const m = { ...base, inputs: d.entradas, outputs: [{ id: 's', name: salida, ref: clave }], settings: { ...base.settings, iterations: n, seed: semilla } };
  const p = prepararEntradas(m, resolverConFunciones((ref) => ref, d), semilla);
  if (!p.ok) throw new Error(p.errores.join('; '));
  const c = compilarPlan(grafo, new Set(d.claves), [clave]);
  if (!c.ok) throw new Error(c.error.motivo);
  const r = await simularPorBloques(grafo, c.plan, p.entradas, semilla, n, { retenerMuestra: n });
  if (!r.ok) throw new Error(r.error.motivo);
  return r.porSalida.get(clave)!.muestra!;
}

export async function todosLosCasos(): Promise<CasoValidacion[]> {
  return [...(await casosAnaliticos()), ...(await casosPublicados())];
}
