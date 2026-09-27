/**
 * Dónde vive el modelo de riesgo: **dentro del libro**, en
 * `workbook.settings`.
 *
 * No en `localStorage` ni en un servidor nuestro, y la diferencia importa. El
 * modelo —qué celdas son inciertas, con qué distribución, qué se está
 * midiendo— es parte del trabajo del usuario, igual que las fórmulas. Si viaja
 * con el archivo, quien reciba el libro por correo abre el complemento y ve el
 * modelo; si vive en el navegador, se pierde al cambiar de máquina y no se
 * puede compartir. Es la razón por la que `RiskModel v1` es JSON y está en
 * inglés (decisión del 2026-09-19): alguien va a leerlo sin nosotros delante.
 *
 * Lo único que hace este archivo es leer, validar, guardar y borrar. **La
 * validación no se salta nunca al leer**: un ajuste guardado puede venir de
 * una versión anterior del complemento, de otra máquina, o estar a medio
 * escribir. `validarRiskModel` ya sabe decir qué está mal y con qué palabras;
 * aquí solo se le pasa lo que haya.
 */

import { validarRiskModel, type ModeloRiesgo } from '../engine/modelo/index.ts';

/**
 * Clave del modelo en `workbook.settings`, con prefijo porque los ajustes son
 * un espacio de nombres que comparten todos los complementos que hayan tocado
 * el libro.
 */
export const CLAVE_MODELO = 'riesgoMontecarlo.model';

/** Clave de los resultados de la última simulación (ver `resultadosGuardados.ts`). */
export const CLAVE_RESULTADOS = 'riesgoMontecarlo.results';

/** Los resultados guardados, en crudo, o `null` si no hay. */
export async function leerResultadosGuardados(): Promise<string | null> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_RESULTADOS);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();
    if (ajuste.isNullObject) return null;
    return typeof ajuste.value === 'string' ? ajuste.value : JSON.stringify(ajuste.value);
  });
}

/**
 * Guarda los resultados. Como el modelo, viajan dentro del `.xlsx`: hay que
 * guardar el archivo para que sobrevivan a cerrarlo.
 */
export async function guardarResultados(texto: string): Promise<void> {
  await Excel.run(async (context) => {
    context.workbook.settings.add(CLAVE_RESULTADOS, texto);
    await context.sync();
  });
}

/**
 * Clave de la referencia única de antes del 27/09. Ya no se escribe: se lee
 * una vez para migrarla a los escenarios (`escenarios.ts`) y se borra.
 */
export const CLAVE_REFERENCIA = 'riesgoMontecarlo.reference';

/** Clave de los escenarios guardados (E7, `escenarios.ts`). Sustituye a `CLAVE_REFERENCIA`. */
export const CLAVE_ESCENARIOS = 'riesgoMontecarlo.scenarios';

/** Los escenarios guardados y, para migrarla, la referencia única de antes. En un viaje. */
export async function leerEscenariosGuardados(): Promise<{ texto: string | null; legado: string | null }> {
  return Excel.run(async (context) => {
    const esc = context.workbook.settings.getItemOrNullObject(CLAVE_ESCENARIOS);
    const ref = context.workbook.settings.getItemOrNullObject(CLAVE_REFERENCIA);
    esc.load(['value', 'isNullObject']);
    ref.load(['value', 'isNullObject']);
    await context.sync();
    const comoTexto = (a: Excel.Setting) => (a.isNullObject ? null : typeof a.value === 'string' ? a.value : JSON.stringify(a.value));
    return { texto: comoTexto(esc), legado: comoTexto(ref) };
  });
}

/**
 * Guarda los escenarios y borra la referencia única de antes, que ya quedó
 * dentro de ellos: si se dejara, un libro abierto con una versión anterior
 * del complemento seguiría comparando con algo que aquí ya se borró.
 */
export async function guardarEscenarios(texto: string): Promise<void> {
  await Excel.run(async (context) => {
    context.workbook.settings.add(CLAVE_ESCENARIOS, texto);
    const ref = context.workbook.settings.getItemOrNullObject(CLAVE_REFERENCIA);
    ref.load('isNullObject');
    await context.sync();
    if (!ref.isNullObject) {
      ref.delete();
      await context.sync();
    }
  });
}
