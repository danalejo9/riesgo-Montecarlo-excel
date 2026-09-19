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
}

export interface ConfiguracionRiskModel {
  iterations: number;
  seed: number;
  sampling: MetodoMuestreo;
  engine: MotorSimulacion;
}

export interface ModeloRiesgo {
  schema: 1;
  inputs: EntradaRiskModel[];
  outputs: SalidaRiskModel[];
  settings: ConfiguracionRiskModel;
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
export function validarRiskModel(json: unknown): ResultadoValidacion {
  const errores: string[] = [];

  if (typeof json !== 'object' || json === null) {
    return { ok: false, errores: ['El modelo no es un objeto JSON.'] };
  }
  const m = json as Record<string, unknown>;

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
    modelo: { schema: VERSION_ESQUEMA_RISK_MODEL, inputs, outputs, settings: settings as ConfiguracionRiskModel },
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
  if (!ok) return undefined;
  return { id: s.id as string, name: s.name as string, ref: s.ref as string };
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

  if (!ok) return undefined;
  return {
    iterations: s.iterations as number,
    seed: s.seed as number,
    sampling: s.sampling as MetodoMuestreo,
    engine: s.engine as MotorSimulacion,
  };
}
