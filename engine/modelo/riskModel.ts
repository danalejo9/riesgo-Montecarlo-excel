/**
 * `RiskModel v1` (decisión D6, Fase 2 §7.2): el formato que se persiste en
 * `workbook.settings` para que un libro "recuerde" sus variables inciertas,
 * sus salidas y los ajustes de la última simulación. Las claves del JSON
 * (`inputs`, `dist`, `ref`…) siguen el boceto de la Fase 2 tal cual; los
 * nombres del código son en español, como el resto del proyecto.
 *
 * Decisión propia, a confirmar: el campo `dist` reutiliza directamente
 * `DescriptorDistribucion` (`engine/distributions/descriptor.ts`) — mismos
 * nombres de campo en español (`tipo`, `moda`, no `type`/`mode`) — en vez de
 * duplicar un tipo paralelo en inglés solo para calcar el boceto de la Fase 2
 * al pie de la letra. Una sola fuente de verdad para "cómo se describe una
 * distribución como datos", ya usada para mandarla a un Web Worker, ahora
 * también para guardarla. Si se prefieren las claves en inglés del boceto
 * original, es un cambio de nombres, no de forma — pero conviene decidirlo
 * ahora: cambiarlo después de la primera versión pública exige una migración
 * (Fase 3, E10).
 *
 * Cada variable conserva su **rango con nombre** (`ref`, algo como
 * `RM_in_7f3a`) — es lo que sobrevive a insertar o mover filas, y por lo que
 * el complemento vuelve a encontrar la celda aunque el usuario reordene el
 * libro. Resolver ese rango a una celda concreta es trabajo del adaptador de
 * Office.js (Fase 3, E3) — este módulo no sabe nada de Excel, solo del
 * formato de datos.
 */
import { construirDesdeDescriptor, type DescriptorDistribucion } from '../distributions/index.ts';
import type { MetodoMuestreo } from '../sampling/types.ts';

export const VERSION_ESQUEMA_RISK_MODEL = 1;

export type MotorSimulacion = 'auto' | 'rapido' | 'compatible';

export interface CorrelacionDeclarada {
  /** `id` de la otra entrada del mismo grupo correlacionado. */
  con: string;
  /** Coeficiente de correlación de rangos objetivo, en [-1, 1]. */
  coeficiente: number;
}

export interface EntradaRiskModel {
  id: string;
  name: string;
  ref: string;
  dist: DescriptorDistribucion;
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
const MOTORES: readonly MotorSimulacion[] = ['auto', 'rapido', 'compatible'];

/**
 * Valida un `unknown` recién leído de `workbook.settings` (nunca hay que
 * confiar en que el JSON guardado sigue teniendo la forma que se espera:
 * puede venir de una versión anterior del complemento, o estar corrupto).
 *
 * La validación semántica de cada distribución (`min <= moda <= max`, etc.)
 * no se repite aquí: se reutiliza `construirDesdeDescriptor`, que ya la hace
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
      if (corr.con === entrada.id) {
        errores.push(`"${entrada.id}" declara una correlación consigo misma.`);
      } else if (!idsEntradas.has(corr.con)) {
        errores.push(`"${entrada.id}" declara una correlación con "${corr.con}", que no existe.`);
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
    construirDesdeDescriptor(e.dist as DescriptorDistribucion);
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
        const coefValido = typeof cc.coeficiente === 'number' && cc.coeficiente >= -1 && cc.coeficiente <= 1;
        if (!esTextoNoVacio(cc.con)) { errores.push(`${ctx}.correlations[${i}].con debe ser un texto no vacío.`); ok = false; }
        if (!coefValido) { errores.push(`${ctx}.correlations[${i}].coeficiente debe estar en [-1,1].`); ok = false; }
        if (esTextoNoVacio(cc.con) && coefValido) correlations.push({ con: cc.con, coeficiente: cc.coeficiente as number });
      });
    }
  }

  if (!ok) return undefined;
  return { id: e.id as string, name: e.name as string, ref: e.ref as string, dist: e.dist as DescriptorDistribucion, correlations };
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
