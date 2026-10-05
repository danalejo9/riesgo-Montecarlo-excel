/**
 * `RiskModel v1` (decisión D6, Fase 2 §7.2): el formato que se persiste en
 * `workbook.settings` para que un libro "recuerde" sus variables inciertas,
 * sus salidas y los ajustes de la última simulación.
 *
 * **Todo el formato está en inglés a propósito**, distinto del resto del
 * código: es un producto comercial internacional (decisión 14 del handoff),
 * y este es el archivo que va a inspeccionar un desarrollador externo o
 * leer un usuario que no hable español. `dist` usa `DistributionSpec`
 * (`distributionSchema.ts`), la forma en inglés de una distribución;
 * `toDescriptor` la traduce a `DescriptorDistribucion` (en español, interno,
 * el que ya usan el muestreo y los Web Workers) en la frontera, no antes.
 *
 * Cada variable conserva su **rango con nombre** (`ref`, algo como
 * `RM_in_7f3a`) — es lo que sobrevive a insertar o mover filas, y por lo que
 * el complemento vuelve a encontrar la celda aunque el usuario reordene el
 * libro. Resolver ese rango a una celda concreta es trabajo del adaptador de
 * Office.js (Fase 3, E3) — este módulo no sabe nada de Excel, solo del
 * formato de datos.
 */
import { construirDesdeDescriptor } from '../distributions/index.ts';
import { toDescriptor, type DistributionSpec } from './distributionSchema.ts';
import type { MetodoMuestreo } from '../sampling/types.ts';

export const VERSION_ESQUEMA_RISK_MODEL = 1;

/**
 * Migraciones del modelo guardado (H8): la de la clave `n` convierte un
 * modelo de la versión `n` en uno de la `n + 1`. Hoy no hay ninguna (solo
 * existe la v1); cuando cambie el esquema, se añade aquí la que toque y los
 * libros antiguos se abren sin perder nada. Cada una recibe una copia.
 */
export type MigracionRiskModel = (m: Record<string, unknown>) => Record<string, unknown>;
export const MIGRACIONES_RISK_MODEL: Readonly<Record<number, MigracionRiskModel>> = {};

/**
 * Pone al día un modelo guardado. Uno de una versión **más nueva** que la del
 * complemento no se toca (se perdería lo que esta versión no entiende): se
 * pide actualizar el complemento.
 */
export function migrarRiskModel(
  m: Record<string, unknown>,
  migraciones: Readonly<Record<number, MigracionRiskModel>> = MIGRACIONES_RISK_MODEL,
  actual: number = VERSION_ESQUEMA_RISK_MODEL,
): { ok: true; modelo: Record<string, unknown>; desde: number } | { ok: false; motivo: string } {
  const v = m.schema;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return { ok: false, motivo: `Versión de esquema no reconocida (${JSON.stringify(v)}). Esta versión del complemento solo entiende RiskModel v${actual}.` };
  }
  if (v > actual) {
    return {
      ok: false,
      motivo: `El modelo se guardó con una versión más nueva del complemento (RiskModel v${v}; esta entiende hasta la v${actual}). Actualiza el complemento para abrirlo; no se ha tocado nada.`,
    };
  }
  let modelo = structuredClone(m);
  for (let n = v; n < actual; n++) {
    const migrar = migraciones[n];
    if (!migrar) return { ok: false, motivo: `No hay forma de pasar un modelo de la v${n} a la v${n + 1}.` };
    modelo = { ...migrar(modelo), schema: n + 1 };
  }
  return { ok: true, modelo, desde: v };
}

/** `'auto'` decide solo (Fase 2 §4); `'fast'`/`'compatible'` fuerzan el motor. */
export type MotorSimulacion = 'auto' | 'fast' | 'compatible';

export interface CorrelacionDeclarada {
  /** `id` de la otra entrada del mismo grupo correlacionado. */
  with: string;
  /** Coeficiente de correlación de rangos objetivo, en [-1, 1]. */
  coefficient: number;
}

export interface EntradaRiskModel {
  id: string;
  name: string;
  ref: string;
  dist: DistributionSpec;
  correlations: CorrelacionDeclarada[];
}

export interface SalidaRiskModel {
  id: string;
  name: string;
  ref: string;
  /**
   * El umbral que el usuario quiere vigilar en esta salida ("¿qué probabilidad
   * hay de que el VAN quede por debajo de 0?"). Opcional: los modelos
   * anteriores no lo traen y siguen siendo válidos.
   */
  threshold?: UmbralRiskModel;
  /**
   * Para una salida de texto o de sí/no (T2): el valor cuya probabilidad se
   * vigila («¿qué probabilidad hay de que salga Norte?»). Es el umbral de las
   * salidas que no son números. Opcional.
   */
  valueOfInterest?: string;
  /**
   * V1: si la salida es un coste o un plazo (malo si sube) o un beneficio
   * (malo si baja). Cambia cómo se lee la contingencia. Opcional: sin él, el
   * panel propone uno por el nombre.
   */
  kind?: 'cost' | 'benefit';
}

export interface UmbralRiskModel {
  value: number;
  /** `below`: P(salida < value). `above`: P(salida > value). */
  direction: 'below' | 'above';
}

/**
 * Cómo escribe los números el Excel donde se creó el modelo. Viaja con el
 * libro porque es parte de lo que el modelo significa: `VALOR("1,5")` vale 1,5
 * en un libro español y es un error en uno inglés. Opcional para que los
 * modelos guardados antes de existir sigan siendo válidos; el panel lo rellena
 * con lo que diga Excel la primera vez que los abre.
 */
export interface LocaleRiskModel {
  decimalSeparator: string;
  thousandsSeparator: string;
  language: string;
}

export interface ConfiguracionRiskModel {
  iterations: number;
  seed: number;
  sampling: MetodoMuestreo;
  engine: MotorSimulacion;
  locale?: LocaleRiskModel;
  /**
   * Criterio de precisión y, opcionalmente, "simular hasta alcanzarlo".
   * Opcional: sin él, margen del 1 % e iteraciones fijas (`iterations`).
   */
  convergence?: ConvergenciaRiskModel;
  /** C6: qué percentiles se enseñan y exportan. Sin él, p5 y p95. */
  percentiles?: PercentilesRiskModel;
}

/** C6: el percentil «bajo» y el «alto» de las cifras y las tablas, y otros que se calculan además. */
export interface PercentilesRiskModel {
  low: number;
  high: number;
  /** Hasta 10, entre 0 y 1 (exclusivos). */
  extra: number[];
}

export const PERCENTILES_POR_DEFECTO: PercentilesRiskModel = { low: 0.05, high: 0.95, extra: [] };

/** Los percentiles del modelo, con los de por defecto si no dice otros. */
export function percentilesDelModelo(s: { percentiles?: PercentilesRiskModel }): PercentilesRiskModel {
  return s.percentiles ?? PERCENTILES_POR_DEFECTO;
}

/** Lee «2,5; 97,5; 80» (en %) como fracciones entre 0 y 1; null si algo no vale. */
export function leerPercentilesTexto(texto: string): number[] | null {
  const partes = texto.split(/[;\s]+/).map((x) => x.trim()).filter(Boolean);
  const out: number[] = [];
  for (const parte of partes) {
    const x = Number(parte.replace('%', '').replace(',', '.'));
    if (!Number.isFinite(x) || x <= 0 || x >= 100) return null;
    out.push(Math.round(x * 10) / 1000);
  }
  return out.length > 10 ? null : [...new Set(out)];
}

export interface ConvergenciaRiskModel {
  /** Margen objetivo de la media al 95 %, como fracción: 0,01 = 1 %. */
  target: number;
  /**
   * Si es `true`, se simula por tandas hasta que todas las salidas cumplen
   * `target`, sin pasar de `maxIterations`. `iterations` pasa a ser la tanda
   * inicial.
   */
  untilConverged: boolean;
  maxIterations: number;
}

/** Margen objetivo si el modelo no dice otro. */
export const OBJETIVO_PRECISION_POR_DEFECTO = 0.01;

/**
 * El proyecto al que pertenece el modelo (C7): su título y una descripción,
 * para que el informe y el volcado digan de qué hablan. Opcional: los modelos
 * anteriores no lo tienen y siguen siendo válidos.
 */
export interface ProyectoRiskModel {
  title: string;
  description?: string;
}

export const LARGO_MAXIMO_TITULO = 200;
export const LARGO_MAXIMO_DESCRIPCION = 2000;

export interface ModeloRiesgo {
  schema: 1;
  project?: ProyectoRiskModel;
  inputs: EntradaRiskModel[];
  outputs: SalidaRiskModel[];
  settings: ConfiguracionRiskModel;
}

/**
 * El modelo con el que empieza un libro que nunca se ha simulado.
 *
 * Los valores por defecto son una decisión de producto, no un relleno.
 * **10.000 iteraciones** y no un millón: es lo que tarda unos segundos en el
 * motor rápido y unos minutos en el compatible, así que la primera simulación
 * de cualquiera termina y enseña algo. El millón es para cuando el usuario ya
 * sabe qué está mirando. **Semilla fija** (no aleatoria) porque un resultado
 * que no se puede reproducir no se puede discutir con nadie, y discutirlo es
 * justo para lo que sirve un análisis de riesgo.
 */
export function modeloVacio(): ModeloRiesgo {
  return {
    schema: VERSION_ESQUEMA_RISK_MODEL,
    inputs: [],
    outputs: [],
    settings: { iterations: 10_000, seed: 12345, sampling: 'monte-carlo', engine: 'auto' },
  };
}

export type ResultadoValidacion =
  | { ok: true; modelo: ModeloRiesgo }
  | { ok: false; errores: string[] };

const METODOS_MUESTREO: readonly MetodoMuestreo[] = ['monte-carlo', 'lhs'];
const MOTORES: readonly MotorSimulacion[] = ['auto', 'fast', 'compatible'];

/**
 * Valida un `unknown` recién leído de `workbook.settings` (nunca hay que
 * confiar en que el JSON guardado sigue teniendo la forma que se espera:
 * puede venir de una versión anterior del complemento, o estar corrupto).
 *
 * La validación semántica de cada distribución (`min <= moda <= max`, etc.)
 * no se repite aquí: se reutiliza `toDescriptor` + `construirDesdeDescriptor`, que ya la hacen
 * y ya está probada — un `dist` con la forma correcta pero valores
 * imposibles se descarta con el mismo mensaje que vería cualquier otro
 * consumidor de esa distribución.
 */
export function validarRiskModel(entrada: unknown): ResultadoValidacion {
  const errores: string[] = [];

  if (typeof entrada !== 'object' || entrada === null) {
    return { ok: false, errores: ['El modelo no es un objeto JSON.'] };
  }
  // H8: un modelo de una versión anterior se pone al día antes de validarlo.
  const migrado = migrarRiskModel(entrada as Record<string, unknown>);
  if (!migrado.ok) return { ok: false, errores: [migrado.motivo] };
  const m = migrado.modelo;

  if (m.schema !== VERSION_ESQUEMA_RISK_MODEL) {
    return {
      ok: false,
      errores: [
        `Versión de esquema no reconocida (${JSON.stringify(m.schema)}). ` +
          `Esta versión del complemento solo entiende RiskModel v${VERSION_ESQUEMA_RISK_MODEL}.`,
      ],
    };
  }

  const inputs = validarLista(m.inputs, 'inputs', errores, (v, ctx) => validarEntrada(v, ctx, errores));
  const outputs = validarLista(m.outputs, 'outputs', errores, (v, ctx) => validarSalida(v, ctx, errores));
  const settings = validarConfiguracion(m.settings, errores);

  let project: ProyectoRiskModel | undefined;
  if (m.project !== undefined) {
    const p = m.project as Record<string, unknown> | null;
    const valido =
      typeof p === 'object' && p !== null &&
      typeof p.title === 'string' && p.title.length <= LARGO_MAXIMO_TITULO &&
      (p.description === undefined || (typeof p.description === 'string' && p.description.length <= LARGO_MAXIMO_DESCRIPCION));
    if (!valido) {
      errores.push(`"project" debe tener un título (hasta ${LARGO_MAXIMO_TITULO} caracteres) y, opcionalmente, una descripción (hasta ${LARGO_MAXIMO_DESCRIPCION}).`);
    } else {
      project = { title: p.title as string, ...(typeof p.description === 'string' ? { description: p.description } : {}) };
    }
  }

  // Unicidad de ids y de refs, entre entradas y salidas a la vez: ambos
  // espacios de nombres comparten el mismo libro.
  const idsVistos = new Map<string, number>();
  const refsVistos = new Map<string, number>();
  for (const v of [...inputs, ...outputs]) {
    idsVistos.set(v.id, (idsVistos.get(v.id) ?? 0) + 1);
    refsVistos.set(v.ref, (refsVistos.get(v.ref) ?? 0) + 1);
  }
  for (const [id, veces] of idsVistos) if (veces > 1) errores.push(`El id "${id}" está repetido.`);
  for (const [ref, veces] of refsVistos) if (veces > 1) errores.push(`El rango con nombre "${ref}" está repetido.`);

  const idsEntradas = new Set(inputs.map((e) => e.id));
  for (const entrada of inputs) {
    for (const corr of entrada.correlations) {
      if (corr.with === entrada.id) {
        errores.push(`"${entrada.id}" declara una correlación consigo misma.`);
      } else if (!idsEntradas.has(corr.with)) {
        errores.push(`"${entrada.id}" declara una correlación con "${corr.with}", que no existe.`);
      }
    }
  }

  if (errores.length > 0) return { ok: false, errores };

  return {
    ok: true,
    modelo: {
      schema: VERSION_ESQUEMA_RISK_MODEL,
      ...(project ? { project } : {}),
      inputs,
      outputs,
      settings: settings as ConfiguracionRiskModel,
    },
  };
}

function validarLista<T>(
  valor: unknown,
  campo: string,
  errores: string[],
  validarItem: (v: unknown, contexto: string) => T | undefined,
): T[] {
  if (!Array.isArray(valor)) {
    errores.push(`"${campo}" debe ser una lista.`);
    return [];
  }
  const out: T[] = [];
  valor.forEach((item, i) => {
    const r = validarItem(item, `${campo}[${i}]`);
    if (r !== undefined) out.push(r);
  });
  return out;
}

function esTextoNoVacio(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function validarEntrada(v: unknown, ctx: string, errores: string[]): EntradaRiskModel | undefined {
  if (typeof v !== 'object' || v === null) {
    errores.push(`${ctx} no es un objeto.`);
    return undefined;
  }
  const e = v as Record<string, unknown>;
  let ok = true;

  if (!esTextoNoVacio(e.id)) { errores.push(`${ctx}.id debe ser un texto no vacío.`); ok = false; }
  if (!esTextoNoVacio(e.name)) { errores.push(`${ctx}.name debe ser un texto no vacío.`); ok = false; }
  if (!esTextoNoVacio(e.ref)) { errores.push(`${ctx}.ref debe ser un texto no vacío.`); ok = false; }

  try {
    construirDesdeDescriptor(toDescriptor(e.dist as DistributionSpec));
  } catch (err) {
    errores.push(`${ctx}.dist: ${err instanceof Error ? err.message : String(err)}`);
    ok = false;
  }

  const correlations: CorrelacionDeclarada[] = [];
  if (e.correlations !== undefined) {
    if (!Array.isArray(e.correlations)) {
      errores.push(`${ctx}.correlations debe ser una lista.`);
      ok = false;
    } else {
      e.correlations.forEach((c, i) => {
        if (typeof c !== 'object' || c === null) {
          errores.push(`${ctx}.correlations[${i}] no es un objeto.`);
          ok = false;
          return;
        }
        const cc = c as Record<string, unknown>;
        const coefValido = typeof cc.coefficient === 'number' && cc.coefficient >= -1 && cc.coefficient <= 1;
        if (!esTextoNoVacio(cc.with)) { errores.push(`${ctx}.correlations[${i}].with debe ser un texto no vacío.`); ok = false; }
        if (!coefValido) { errores.push(`${ctx}.correlations[${i}].coefficient debe estar en [-1,1].`); ok = false; }
        if (esTextoNoVacio(cc.with) && coefValido) correlations.push({ with: cc.with, coefficient: cc.coefficient as number });
      });
    }
  }

  if (!ok) return undefined;
  return { id: e.id as string, name: e.name as string, ref: e.ref as string, dist: e.dist as DistributionSpec, correlations };
}

function validarSalida(v: unknown, ctx: string, errores: string[]): SalidaRiskModel | undefined {
  if (typeof v !== 'object' || v === null) {
    errores.push(`${ctx} no es un objeto.`);
    return undefined;
  }
  const s = v as Record<string, unknown>;
  let ok = true;
  if (!esTextoNoVacio(s.id)) { errores.push(`${ctx}.id debe ser un texto no vacío.`); ok = false; }
  if (!esTextoNoVacio(s.name)) { errores.push(`${ctx}.name debe ser un texto no vacío.`); ok = false; }
  if (!esTextoNoVacio(s.ref)) { errores.push(`${ctx}.ref debe ser un texto no vacío.`); ok = false; }
  let threshold: UmbralRiskModel | undefined;
  if (s.threshold !== undefined) {
    const t = s.threshold as Record<string, unknown> | null;
    if (
      typeof t !== 'object' || t === null ||
      typeof t.value !== 'number' || !Number.isFinite(t.value) ||
      (t.direction !== 'below' && t.direction !== 'above')
    ) {
      errores.push(`${ctx}.threshold debe ser { value: número, direction: "below" | "above" }.`);
      ok = false;
    } else {
      threshold = { value: t.value, direction: t.direction };
    }
  }
  if (s.valueOfInterest !== undefined && (typeof s.valueOfInterest !== 'string' || s.valueOfInterest.length > 200)) {
    errores.push(`${ctx}.valueOfInterest debe ser un texto de hasta 200 caracteres.`);
    ok = false;
  }
  if (s.kind !== undefined && s.kind !== 'cost' && s.kind !== 'benefit') {
    errores.push(`${ctx}.kind debe ser "cost" o "benefit".`);
    ok = false;
  }
  if (!ok) return undefined;
  return {
    id: s.id as string, name: s.name as string, ref: s.ref as string,
    ...(threshold ? { threshold } : {}),
    ...(typeof s.valueOfInterest === 'string' ? { valueOfInterest: s.valueOfInterest } : {}),
    ...(s.kind === 'cost' || s.kind === 'benefit' ? { kind: s.kind } : {}),
  };
}

function validarConfiguracion(v: unknown, errores: string[]): ConfiguracionRiskModel | undefined {
  if (typeof v !== 'object' || v === null) {
    errores.push('"settings" debe ser un objeto.');
    return undefined;
  }
  const s = v as Record<string, unknown>;
  let ok = true;

  if (!(typeof s.iterations === 'number' && Number.isInteger(s.iterations) && s.iterations > 0)) {
    errores.push('settings.iterations debe ser un entero positivo.');
    ok = false;
  }
  if (!(typeof s.seed === 'number' && Number.isInteger(s.seed))) {
    errores.push('settings.seed debe ser un entero.');
    ok = false;
  }
  if (!METODOS_MUESTREO.includes(s.sampling as MetodoMuestreo)) {
    errores.push(`settings.sampling debe ser uno de: ${METODOS_MUESTREO.join(', ')}.`);
    ok = false;
  }
  if (!MOTORES.includes(s.engine as MotorSimulacion)) {
    errores.push(`settings.engine debe ser uno de: ${MOTORES.join(', ')}.`);
    ok = false;
  }

  let locale: LocaleRiskModel | undefined;
  if (s.locale !== undefined) {
    const l = s.locale as Record<string, unknown>;
    const valido =
      typeof l === 'object' && l !== null &&
      esTextoNoVacio(l.decimalSeparator) && esTextoNoVacio(l.thousandsSeparator) &&
      typeof l.language === 'string' && l.decimalSeparator !== l.thousandsSeparator;
    if (!valido) {
      errores.push('settings.locale debe tener decimalSeparator, thousandsSeparator (distintos) y language.');
      ok = false;
    } else {
      locale = {
        decimalSeparator: l.decimalSeparator as string,
        thousandsSeparator: l.thousandsSeparator as string,
        language: l.language as string,
      };
    }
  }

  let convergence: ConvergenciaRiskModel | undefined;
  if (s.convergence !== undefined) {
    const c = s.convergence as Record<string, unknown> | null;
    const valido =
      typeof c === 'object' && c !== null &&
      typeof c.target === 'number' && c.target > 0 && c.target < 1 &&
      typeof c.untilConverged === 'boolean' &&
      typeof c.maxIterations === 'number' && Number.isInteger(c.maxIterations) && c.maxIterations > 0;
    if (!valido) {
      errores.push('settings.convergence debe ser { target: 0..1, untilConverged: sí/no, maxIterations: entero positivo }.');
      ok = false;
    } else {
      convergence = {
        target: c.target as number,
        untilConverged: c.untilConverged as boolean,
        maxIterations: c.maxIterations as number,
      };
    }
  }

  let percentiles: PercentilesRiskModel | undefined;
  if (s.percentiles !== undefined) {
    const c = s.percentiles as Record<string, unknown> | null;
    const enRango = (x: unknown) => typeof x === 'number' && x > 0 && x < 1;
    const valido =
      typeof c === 'object' && c !== null && enRango(c.low) && enRango(c.high) && (c.low as number) < (c.high as number) &&
      Array.isArray(c.extra) && c.extra.length <= 10 && c.extra.every(enRango);
    if (!valido) {
      errores.push('settings.percentiles debe ser { low < high, entre 0 y 1; extra: hasta 10 números entre 0 y 1 }.');
      ok = false;
    } else {
      percentiles = { low: c.low as number, high: c.high as number, extra: [...(c.extra as number[])] };
    }
  }

  if (!ok) return undefined;
  return {
    iterations: s.iterations as number,
    seed: s.seed as number,
    sampling: s.sampling as MetodoMuestreo,
    engine: s.engine as MotorSimulacion,
    ...(locale ? { locale } : {}),
    ...(convergence ? { convergence } : {}),
    ...(percentiles ? { percentiles } : {}),
  };
}
