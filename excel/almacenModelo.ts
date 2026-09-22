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

export type LecturaModelo =
  | { estado: 'vacio' }
  | { estado: 'ok'; modelo: ModeloRiesgo }
  | { estado: 'invalido'; errores: string[]; crudo: string };

/**
 * Lee el modelo guardado en el libro.
 *
 * Los tres estados son distintos a propósito. "No hay modelo" es el libro
 * nuevo, y el panel debe ofrecer empezar uno. "Hay uno y no vale" es un
 * problema que hay que **enseñar**, con el JSON crudo a mano: si se tratara
 * como si no hubiera nada, el siguiente guardado pisaría en silencio el
 * trabajo de alguien.
 */
export async function leerModelo(): Promise<LecturaModelo> {
  return Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_MODELO);
    ajuste.load(['value', 'isNullObject']);
    await context.sync();

    if (ajuste.isNullObject) return { estado: 'vacio' as const };

    const crudo = typeof ajuste.value === 'string' ? ajuste.value : JSON.stringify(ajuste.value);
    let json: unknown;
    try {
      json = JSON.parse(crudo);
    } catch (e) {
      return { estado: 'invalido' as const, errores: [`El modelo guardado no es JSON válido: ${mensaje(e)}`], crudo };
    }

    const r = validarRiskModel(json);
    return r.ok ? { estado: 'ok' as const, modelo: r.modelo } : { estado: 'invalido' as const, errores: r.errores, crudo };
  });
}

/**
 * Guarda el modelo en el libro.
 *
 * Se valida **antes** de escribir, no después de leer. Guardar algo inválido
 * y descubrirlo en la siguiente sesión convierte un error de un momento en un
 * modelo perdido.
 */
export async function guardarModelo(modelo: ModeloRiesgo): Promise<{ ok: true } | { ok: false; errores: string[] }> {
  const r = validarRiskModel(modelo);
  if (!r.ok) return { ok: false, errores: r.errores };

  await Excel.run(async (context) => {
    context.workbook.settings.add(CLAVE_MODELO, JSON.stringify(r.modelo));
    await context.sync();
  });

  return { ok: true };
}

/**
 * Borra el modelo del libro.
 *
 * Se comprueba que esté antes de borrarlo, en dos viajes. Office.js no promete
 * que `delete()` sobre un objeto nulo sea inofensivo, y borrar algo que no
 * existe no debe poder fallar: es justo la operación que se usa para recuperar
 * un libro con un modelo que no se entiende.
 */
export async function borrarModelo(): Promise<void> {
  await Excel.run(async (context) => {
    const ajuste = context.workbook.settings.getItemOrNullObject(CLAVE_MODELO);
    ajuste.load('isNullObject');
    await context.sync();

    if (ajuste.isNullObject) return;
    ajuste.delete();
    await context.sync();
  });
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
