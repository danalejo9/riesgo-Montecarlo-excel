/**
 * Preferencias **de este equipo**, no del libro: hoy, cuántos núcleos usar.
 *
 * Van en `localStorage` a propósito. Cuántos núcleos conviene usar depende de
 * la máquina, no del modelo: si el libro viaja por correo a un portátil de
 * cuatro núcleos, no debe llevarse la preferencia de una estación de treinta
 * y dos. Y no cambian el resultado —la misma semilla da los mismos números
 * con uno o con ocho hilos—, así que no tienen que viajar con él.
 *
 * `localStorage` puede no estar (modo privado, política del equipo): toda
 * lectura y escritura va protegida y, si falla, vale "automático".
 */

const CLAVE_HILOS = 'riesgoMontecarlo.hilos';

export type PreferenciaHilos = 'auto' | number;

/** Núcleos lógicos que el navegador dice que tiene el equipo. */
export function nucleosDelEquipo(): number {
  return typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 2;
}

/** Lo que usa "automático": todos menos uno (para Excel y el panel), máximo 8. */
export function hilosAutomaticos(): number {
  return Math.max(1, Math.min(8, nucleosDelEquipo() - 1));
}

export function leerPreferenciaHilos(): PreferenciaHilos {
  try {
    const v = localStorage.getItem(CLAVE_HILOS);
    if (!v || v === 'auto') return 'auto';
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 ? n : 'auto';
  } catch {
    return 'auto';
  }
}

export function guardarPreferenciaHilos(p: PreferenciaHilos): void {
  try {
    localStorage.setItem(CLAVE_HILOS, String(p));
  } catch {
    // Sin almacenamiento, la preferencia dura lo que dura el panel abierto.
  }
}

/** Los hilos que se van a usar de verdad con una preferencia dada. */
export function hilosEfectivos(p: PreferenciaHilos): number {
  return p === 'auto' ? hilosAutomaticos() : Math.max(1, Math.min(nucleosDelEquipo(), p));
}

const CLAVE_CONGELAR = 'riesgoMontecarlo.congelarPantalla';

/**
 * Congelar la pantalla al simular con Excel en el bucle (F5). También es de
 * este equipo: si parpadea, parpadea en esta versión de Excel. Por defecto,
 * sí: es lo que pidió el usuario (dos veces).
 */
export function leerCongelarPantalla(): boolean {
  try {
    return localStorage.getItem(CLAVE_CONGELAR) !== 'no';
  } catch {
    return true;
  }
}

export function guardarCongelarPantalla(si: boolean): void {
  try {
    localStorage.setItem(CLAVE_CONGELAR, si ? 'si' : 'no');
  } catch {
    // Sin almacenamiento: vale para esta sesión.
  }
}
