/**
 * El `AlmacenGuardian` de verdad, sobre Office.js.
 *
 * `engine/modelo/guardian.ts` decide **cuándo** guardar el registro de
 * recuperación, cuándo cambiar el modo de cálculo y cuándo restaurar; ese es
 * el riesgo real y está probado con un almacén simulado. Aquí solo está el
 * **cómo**: `workbook.settings` para el registro, `application.calculationMode`
 * para el modo, y celdas para los valores.
 *
 * ---
 *
 * **El desajuste que resuelve este archivo.** La interfaz del guardián es
 * síncrona (`readValue(ref): number`) y Office.js es asíncrono por diseño: no
 * se puede leer una celda sin un `await context.sync()`. Hacer asíncrona la
 * interfaz habría metido `await` en cada rama de una lógica transaccional que
 * conviene leer de un vistazo.
 *
 * La salida es la que usa cualquier adaptador transaccional: **una foto y un
 * volcado**. `cargarAlmacenGuardian` lee de una vez todo lo que el guardián
 * puede llegar a consultar —el registro pendiente, el modo de cálculo y el
 * valor actual de cada entrada— en un único viaje. A partir de ahí las
 * lecturas responden de la foto, y las escrituras se encolan en Office.js (que
 * ya es lo que hace al asignar una propiedad) y se materializan en el
 * `aplicar()` final. El guardián corre síncrono sobre la foto; Excel se toca
 * dos veces, no veinte.
 *
 * **La consecuencia que hay que tener presente**: los `refs` se fijan al
 * cargar. Preguntarle al almacén por una celda que no estaba en la lista es un
 * error de programación, no un valor por defecto — y se lanza como tal, en vez
 * de devolver un cero que acabaría escrito en el libro del usuario como si
 * fuera su valor original.
 */

import type { AlmacenGuardian, RecoveryRecord } from '../engine/modelo/guardian.ts';
import { rangoDesdeDireccion } from './rangos.ts';

/**
 * Clave del registro en `workbook.settings`. Va con prefijo porque los
 * ajustes son un espacio de nombres compartido por todos los complementos que
 * hayan tocado el libro.
 */
export const CLAVE_RECOVERY = 'riesgoMontecarlo.recovery';

export interface AlmacenGuardianExcel extends AlmacenGuardian {
  /** Materializa en el libro todo lo escrito desde la carga. Un único viaje. */
  aplicar(): Promise<void>;
}

/**
 * Lee la foto y devuelve el almacén. `refs` son las direcciones cuyo valor
 * original el guardián va a querer guardar: las entradas de la simulación.
 */
export async function cargarAlmacenGuardian(
  context: Excel.RequestContext,
  refs: readonly string[],
): Promise<AlmacenGuardianExcel> {
  const app = context.workbook.application;
  const ajustes = context.workbook.settings;

  const ajuste = ajustes.getItemOrNullObject(CLAVE_RECOVERY);
  ajuste.load(['value', 'isNullObject']);
  app.load('calculationMode');

  const rangos = new Map<string, Excel.Range>();
  for (const ref of refs) {
    const rango = rangoDesdeDireccion(context, ref);
    rango.load('values');
    rangos.set(ref, rango);
  }

  await context.sync();

  let recovery = ajuste.isNullObject ? undefined : interpretarRegistro(ajuste.value);
  let modo = app.calculationMode as string;

  const valores = new Map<string, number>();
  for (const [ref, rango] of rangos) {
    const crudo = (rango.values as unknown[][])?.[0]?.[0];
    valores.set(ref, typeof crudo === 'number' ? crudo : NaN);
  }

  return {
    readRecovery: () => recovery,

    writeRecovery(record) {
      recovery = record;
      ajustes.add(CLAVE_RECOVERY, JSON.stringify(record));
    },

    clearRecovery() {
      recovery = undefined;
      // `getItemOrNullObject` + `delete` no falla si ya no estaba, que es lo
      // que hace falta: limpiar dos veces tiene que ser inofensivo.
      ajustes.getItemOrNullObject(CLAVE_RECOVERY).delete();
    },

    readCalculationMode: () => modo,

    setCalculationMode(nuevo) {
      modo = nuevo;
      app.calculationMode = nuevo as Excel.CalculationMode;
    },

    readValue(ref) {
      const v = valores.get(ref);
      if (v === undefined) throw new Error(`El almacén no cargó la celda ${ref}; añádela a los refs de carga.`);
      return v;
    },

    writeValue(ref, value) {
      valores.set(ref, value);
      const rango = rangos.get(ref) ?? rangoDesdeDireccion(context, ref);
      rangos.set(ref, rango);
      rango.values = [[value]];
    },

    async aplicar() {
      await context.sync();
    },
  };
}

/**
 * Un registro guardado por una versión anterior —o por cualquier otra cosa
 * que haya escrito esa clave— puede no ser un registro válido. Se descarta en
 * silencio en vez de reventar al abrir el panel: quedarse sin complemento por
 * un ajuste corrupto es peor que perder la oferta de restaurar.
 */
function interpretarRegistro(crudo: unknown): RecoveryRecord | undefined {
  if (typeof crudo !== 'string') return undefined;
  try {
    const dato = JSON.parse(crudo) as Partial<RecoveryRecord>;
    if (dato?.schema !== 1) return undefined;
    if (typeof dato.startedAt !== 'string' || typeof dato.calculationMode !== 'string') return undefined;
    if (typeof dato.originalValues !== 'object' || dato.originalValues === null) return undefined;
    return dato as RecoveryRecord;
  } catch {
    return undefined;
  }
}
