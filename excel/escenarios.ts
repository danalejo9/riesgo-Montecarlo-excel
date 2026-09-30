/**
 * El administrador de escenarios (E7): varias simulaciones guardadas en el
 * libro con su nombre, para compararlas. Sin Office.js.
 *
 * Hasta el 27/09 solo había **una** referencia (`comparacion.ts`); el usuario
 * pidió poder tener varias («base», «con refinanciación», «precio bajo»…).
 * Cada escenario se guarda con el mismo formato que los resultados
 * (`resultadosGuardados.ts`): 1.001 cuantiles por salida, no la muestra. Uno
 * de ellos es **el activo**: con él se hace la comparación detallada (tabla de
 * diferencias y curva punteada) que ya existía. Además, cada salida enseña una
 * tabla con todos los escenarios a la vez.
 *
 * La referencia única de antes se migra sola: pasa a ser el primer escenario y
 * el activo.
 */

import type { ModeloRiesgo } from '../engine/modelo/index.ts';
import { probabilidadUmbral } from '../engine/stats/index.ts';
import type { ReferenciaGuardada } from './comparacion.ts';
import { restaurarReferencia } from './comparacion.ts';
import type { ResultadoSalida, SimulacionCompletada } from './informe.ts';
import { restaurarResultados, serializarResultados } from './resultadosGuardados.ts';
import { esSalidaDeTexto, probabilidadDeValor } from './analisisTexto.ts';

/** Cuántos escenarios caben: cada uno ocupa unos 20 kB por salida en el libro. */
export const MAXIMO_ESCENARIOS = 10;

export interface Escenario extends ReferenciaGuardada {
  id: string;
  guardadoEn: string;
}

export interface AlmacenEscenarios {
  escenarios: Escenario[];
  /** El id del escenario con el que se compara, si hay. */
  activo?: string;
}

interface EscenarioSerializado {
  id: string;
  etiqueta: string;
  guardadoEn: string;
  datos: string;
}

export function vacio(): AlmacenEscenarios {
  return { escenarios: [] };
}

/** El escenario activo como la referencia que entienden la comparación y el informe. */
export function escenarioActivo(a: AlmacenEscenarios): Escenario | null {
  return a.escenarios.find((e) => e.id === a.activo) ?? null;
}

let contador = 0;
function nuevoId(ahora: Date): string {
  contador = (contador + 1) % 1000;
  return `esc_${ahora.getTime().toString(36)}${contador.toString(36)}`;
}

/**
 * Guarda la simulación como escenario. Solo queda activo si no había otro:
 * guardar la variante no debe quitar la comparación con «Base». Si ya hay uno con el
 * mismo nombre, lo sustituye (volver a simular «Base» y guardarlo otra vez es
 * actualizarlo). Si no cabe, avisa en vez de borrar uno sin preguntar.
 */
export function guardarEscenario(
  a: AlmacenEscenarios,
  etiqueta: string,
  resultado: SimulacionCompletada,
  ahora: Date = new Date(),
): { ok: true; almacen: AlmacenEscenarios; id: string } | { ok: false; motivo: string } {
  const nombre = etiqueta.trim() || 'Escenario';
  const previo = a.escenarios.find((e) => e.etiqueta === nombre);
  if (!previo && a.escenarios.length >= MAXIMO_ESCENARIOS) {
    return { ok: false, motivo: `Ya hay ${MAXIMO_ESCENARIOS} escenarios guardados: borra alguno antes de guardar otro.` };
  }
  const id = previo?.id ?? nuevoId(ahora);
  const escenario: Escenario = { id, etiqueta: nombre, guardadoEn: ahora.toISOString(), resultado };
  const escenarios = previo
    ? a.escenarios.map((e) => (e.id === id ? escenario : e))
    : [...a.escenarios, escenario];
  const activo = a.activo && escenarios.some((e) => e.id === a.activo) ? a.activo : id;
  return { ok: true, almacen: { escenarios, activo }, id };
}

export function quitarEscenario(a: AlmacenEscenarios, id: string): AlmacenEscenarios {
  const escenarios = a.escenarios.filter((e) => e.id !== id);
  return a.activo === id ? { escenarios } : { escenarios, ...(a.activo ? { activo: a.activo } : {}) };
}

export function elegirActivo(a: AlmacenEscenarios, id: string | null): AlmacenEscenarios {
  if (id === null || !a.escenarios.some((e) => e.id === id)) return { escenarios: a.escenarios };
  return { ...a, activo: id };
}

export function serializarEscenarios(modelo: ModeloRiesgo, a: AlmacenEscenarios): string {
  const escenarios: EscenarioSerializado[] = a.escenarios.map((e) => ({
    id: e.id,
    etiqueta: e.etiqueta,
    guardadoEn: e.guardadoEn,
    datos: serializarResultados(modelo, e.resultado, new Date(e.guardadoEn)),
  }));
  return JSON.stringify({ version: 1, ...(a.activo ? { activo: a.activo } : {}), escenarios });
}

/**
 * Lee los escenarios guardados. Con `legado` (la referencia única de antes),
 * si no hay escenarios todavía, la convierte en el primero. Un escenario que
 * no se puede leer se descarta sin tumbar a los demás.
 */
export function restaurarEscenarios(texto: string | null, legado?: string | null): AlmacenEscenarios {
  if (texto) {
    try {
      const j = JSON.parse(texto) as { version?: unknown; activo?: unknown; escenarios?: unknown };
      if (j.version === 1 && Array.isArray(j.escenarios)) {
        const escenarios: Escenario[] = [];
        for (const e of j.escenarios as Partial<EscenarioSerializado>[]) {
          if (typeof e.id !== 'string' || typeof e.etiqueta !== 'string' || typeof e.datos !== 'string') continue;
          const r = restaurarResultados(e.datos);
          if (!r.ok) continue;
          escenarios.push({ id: e.id, etiqueta: e.etiqueta, guardadoEn: typeof e.guardadoEn === 'string' ? e.guardadoEn : '', resultado: r.resultado });
        }
        const activo = typeof j.activo === 'string' && escenarios.some((e) => e.id === j.activo) ? j.activo : undefined;
        return { escenarios, ...(activo ? { activo } : {}) };
      }
    } catch {
      // Ilegible: se sigue como si no hubiera, sin romper el panel.
    }
  }
  if (legado) {
    const ref = restaurarReferencia(legado);
    if (ref) {
      const guardadoEn = ref.resultado.restaurado?.guardadoEn ?? new Date(0).toISOString();
      const id = 'esc_legado';
      return { escenarios: [{ id, etiqueta: ref.etiqueta, guardadoEn, resultado: ref.resultado }], activo: id };
    }
  }
  return vacio();
}

/** Una fila de la tabla «todos los escenarios» de una salida. */
export interface FilaEscenario {
  etiqueta: string;
  esActual: boolean;
  media: number;
  p5?: number;
  p50?: number;
  p95?: number;
  /** Probabilidad del umbral de la salida (o del valor de interés, si es de texto). */
  probabilidad?: number;
  /** Salidas de texto: el valor que más sale en ese escenario. */
  masFrecuente?: string;
}

function filaDe(etiqueta: string, esActual: boolean, s: ResultadoSalida, umbral?: { value: number; direction: 'below' | 'above' }, valorDeInteres?: string): FilaEscenario {
  if (esSalidaDeTexto(s)) {
    // Salida de texto (T2): el valor más frecuente y la probabilidad del de interés.
    const objetivo = valorDeInteres ?? s.categorias?.[0]?.valor;
    const p = objetivo ? probabilidadDeValor(s.categorias, objetivo) : undefined;
    return { etiqueta, esActual, media: NaN, masFrecuente: s.categorias?.[0]?.valor ?? '', ...(p !== undefined ? { probabilidad: p } : {}) };
  }
  const p = s.resumen.percentiles;
  return {
    etiqueta,
    esActual,
    media: s.resumen.media,
    ...(p.p5 !== undefined ? { p5: p.p5 } : {}),
    ...(p.p50 !== undefined ? { p50: p.p50 } : {}),
    ...(p.p95 !== undefined ? { p95: p.p95 } : {}),
    ...(umbral && s.muestraOrdenada && s.muestraOrdenada.length > 0
      ? { probabilidad: probabilidadUmbral(s.muestraOrdenada, umbral.value, umbral.direction === 'below' ? 'debajo' : 'encima') }
      : {}),
  };
}

/**
 * La salida en todos los escenarios guardados y en la simulación actual, en
 * ese orden. Los escenarios que no tenían esa salida no salen. Si la actual es
 * la misma simulación que un escenario (se acaba de guardar), no se repite.
 */
export function tablaEscenarios(
  salidaActual: ResultadoSalida,
  actual: SimulacionCompletada,
  a: AlmacenEscenarios,
  umbral?: { value: number; direction: 'below' | 'above' },
  valorDeInteres?: string,
): FilaEscenario[] {
  const filas: FilaEscenario[] = [];
  let actualYaEsta = false;
  for (const e of a.escenarios) {
    const s = e.resultado.salidas.find((x) => x.id === salidaActual.id);
    if (!s) continue;
    const mismo = Boolean(actual.idSimulacion) && e.resultado.idSimulacion === actual.idSimulacion;
    if (mismo) actualYaEsta = true;
    filas.push(filaDe(mismo ? `${e.etiqueta} (esta simulación)` : e.etiqueta, mismo, mismo ? salidaActual : s, umbral, valorDeInteres));
  }
  if (!actualYaEsta) filas.push(filaDe('Esta simulación', true, salidaActual, umbral, valorDeInteres));
  return filas;
}
