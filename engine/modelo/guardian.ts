/**
 * Guardián transaccional (Fase 2 §7.3, requisito R5: "nunca corromper el
 * libro del usuario"). Antes de simular, se guarda el modo de cálculo y el
 * valor original de cada entrada en un registro de recuperación persistido
 * en el propio libro; al terminar, se borra. Si el panel se cierra a mitad
 * o el runtime muere, el registro sigue ahí la próxima vez que se abre el
 * complemento, y se puede ofrecer restaurar — el `finally` de un `try` no
 * cubre ese caso (el proceso puede morir sin que corra ningún `finally`),
 * esto sí, porque el registro vive en el archivo, no en memoria.
 *
 * `AlmacenGuardian` es la única frontera con Excel, inyectada: leer y
 * escribir `workbook.settings`, leer y cambiar el modo de cálculo, leer y
 * escribir el valor de una celda. Nada de eso existe todavía (es trabajo de
 * Fase 3, E3, el adaptador de Office.js) — lo que sí se puede construir y
 * probar ahora, con un almacén simulado, es la lógica de **cuándo** hacer
 * cada cosa: ese es el riesgo real (olvidar un caso, no la mecánica de leer
 * una celda).
 */

export const VERSION_ESQUEMA_RECOVERY = 1;

export interface RecoveryRecord {
  schema: 1;
  /** ISO 8601. Con fines informativos para el usuario ("simulación iniciada hace..."). */
  startedAt: string;
  /** El modo de cálculo tal como lo devuelva Office.js; opaco para este módulo. */
  calculationMode: string;
  /** ref (rango con nombre) -> valor que tenía antes de simular. */
  originalValues: Record<string, number>;
}

export interface AlmacenGuardian {
  readRecovery(): RecoveryRecord | undefined;
  writeRecovery(record: RecoveryRecord): void;
  clearRecovery(): void;
  readCalculationMode(): string;
  setCalculationMode(mode: string): void;
  readValue(ref: string): number;
  writeValue(ref: string, value: number): void;
}

export type ResultadoProteccion = { ok: true } | { ok: false; error: string };

/**
 * Se llama justo antes de simular. Si ya hay una protección activa (una
 * simulación anterior no se cerró bien), no la pisa: hay que resolver esa
 * recuperación primero (`restaurarDesdeRecuperacion` o `descartarRecuperacion`)
 * — sobrescribirla perdería los valores originales de la simulación
 * interrumpida, justo lo que este mecanismo existe para evitar.
 */
export function iniciarProteccion(
  store: AlmacenGuardian,
  refs: readonly string[],
  modoDurante: string,
  ahora: () => string = () => new Date().toISOString(),
): ResultadoProteccion {
  if (store.readRecovery()) {
    return {
      ok: false,
      error: 'Ya hay un registro de recuperación pendiente; resuélvelo antes de iniciar otra simulación.',
    };
  }

  const originalValues: Record<string, number> = {};
  for (const ref of refs) originalValues[ref] = store.readValue(ref);

  const record: RecoveryRecord = {
    schema: VERSION_ESQUEMA_RECOVERY,
    startedAt: ahora(),
    calculationMode: store.readCalculationMode(),
    originalValues,
  };

  store.writeRecovery(record);
  store.setCalculationMode(modoDurante);
  return { ok: true };
}

/** Se llama al terminar una simulación con éxito: ya no hace falta poder deshacerla. */
export function finalizarProteccion(store: AlmacenGuardian): void {
  const record = store.readRecovery();
  if (!record) return;
  store.setCalculationMode(record.calculationMode);
  store.clearRecovery();
}

/**
 * Se llama al abrir el complemento (antes de nada más). Si devuelve un
 * registro, el panel debe ofrecer restaurar en vez de dejar que el usuario
 * siga como si nada — el libro tiene entradas con valores de una simulación
 * a medias.
 */
export function hayRecuperacionPendiente(store: AlmacenGuardian): RecoveryRecord | undefined {
  return store.readRecovery();
}

/** El usuario acepta restaurar: vuelve cada entrada a su valor original y el modo de cálculo al de antes. */
export function restaurarDesdeRecuperacion(store: AlmacenGuardian): void {
  const record = store.readRecovery();
  if (!record) return;
  for (const [ref, valor] of Object.entries(record.originalValues)) store.writeValue(ref, valor);
  store.setCalculationMode(record.calculationMode);
  store.clearRecovery();
}

/**
 * El usuario rechaza restaurar (decide quedarse con lo que hay en el libro
 * ahora mismo). Solo limpia el registro — a diferencia de `restaurarDesdeRecuperacion`,
 * no toca ni las celdas ni el modo de cálculo, porque el usuario explícitamente
 * no quiere eso.
 */
export function descartarRecuperacion(store: AlmacenGuardian): void {
  store.clearRecovery();
}
